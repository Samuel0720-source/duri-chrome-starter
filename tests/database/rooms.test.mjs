import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

let cluster,
  admin,
  pool,
  temp,
  started = false;
async function freePort() {
  const probe = createServer();
  await new Promise((ok, fail) =>
    probe.once("error", fail).listen(0, "127.0.0.1", ok),
  );
  const port = probe.address().port;
  await new Promise((ok) => probe.close(ok));
  return port;
}
before(async () => {
  const port = await freePort();
  temp = await mkdtemp(join(tmpdir(), "duri-test-"));
  const password = randomUUID();
  const messages = [];
  const remember = (m) => {
    messages.push(String(m));
    if (messages.length > 12) messages.shift();
  };
  cluster = new EmbeddedPostgres({
    databaseDir: join(temp, "data"),
    user: "postgres",
    password,
    port,
    persistent: true,
    autoRehydrateSymlinks: true,
    initdbFlags: ["--locale=C", "--encoding=UTF8"],
    postgresFlags: [
      "-c",
      "listen_addresses=127.0.0.1",
      "-c",
      "unix_socket_directories=",
    ],
    onLog: remember,
    onError: remember,
  });
  try {
    await cluster.initialise();
    await cluster.start();
    started = true;
  } catch (cause) {
    throw new Error(
      "Local test PostgreSQL could not start. " + messages.join("\n"),
      { cause },
    );
  }
  pool = new pg.Pool({
    host: "127.0.0.1",
    port,
    user: "postgres",
    password,
    database: "postgres",
  });
  // Teardown stops PostgreSQL. A pooled connection that has not closed yet then reports
  // "terminating connection due to administrator command" (57P01); only that one is ignored.
  pool.on("error", (error) => {
    if (error.code !== "57P01") throw error;
  });
  admin = await pool.connect();
  await admin.query(`create role authenticated nologin; create role anon nologin; create role service_role nologin;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon;
    -- Stand-in for Supabase Realtime: records what would be broadcast.
    create schema realtime; grant usage on schema realtime to authenticated,anon;
    create table realtime.messages(extension text, topic text);
    create table realtime.sent(payload jsonb, event text, topic text, private boolean);
    create function realtime.send(payload jsonb, event text, topic text, private boolean) returns void
      language sql as $$ insert into realtime.sent values(payload,event,topic,private) $$;
    create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;`);
  await admin.query(
    await readFile(
      new URL(
        "../../supabase/migrations/202611070001_rooms.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await admin.query(
    await readFile(
      new URL(
        "../../supabase/migrations/202611090001_delete_account.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await admin.query(
    await readFile(
      new URL(
        "../../supabase/migrations/202611110001_room_realtime.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await admin.query(
    await readFile(
      new URL(
        "../../supabase/migrations/202611110002_room_home.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await admin.query(
    await readFile(
      new URL(
        "../../supabase/migrations/202611110003_room_chat.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await admin.query(
    await readFile(
      new URL(
        "../../supabase/migrations/202611110004_guess_game.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await admin.query(
    await readFile(
      new URL(
        "../../supabase/migrations/202611120001_draw_quiz.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await admin.query(
    await readFile(
      new URL(
        "../../supabase/migrations/202611120002_watch_together.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await admin.query(
    await readFile(
      new URL(
        "../../supabase/migrations/202611130001_api_budget.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await admin.query(
    await readFile(
      new URL(
        "../../supabase/migrations/202611130002_gomoku.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
});
after(async () => {
  admin?.release();
  if (pool) await pool.end();
  if (started) await cluster.stop();
  if (temp) await rm(temp, { recursive: true, force: true });
});
async function user() {
  const id = randomUUID();
  await admin.query("insert into auth.users values($1)", [id]);
  return id;
}
async function asUser(id, sql, args = []) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
    const res = await c.query(sql, args);
    await c.query("commit");
    return res.rows;
  } catch (error) {
    await c.query("rollback");
    throw error;
  } finally {
    c.release();
  }
}
async function fixture() {
  const a = await user();
  const [{ id }] = await asUser(
    a,
    "select public.create_couple_room('2026-08-13','America/Vancouver') as id",
  );
  const [{ token }] = await asUser(
    a,
    "select public.issue_couple_invite($1) as token",
    [id],
  );
  return { a, id, token };
}
test("two concurrent claimants, one seat; replay by the winner is idempotent", async () => {
  const { id, token } = await fixture(),
    b = await user(),
    c = await user();
  // Force both independent requests to contend on the same room row.
  await admin.query("begin");
  await admin.query(
    "select 1 from public.couple_rooms where id=$1 for update",
    [id],
  );
  const attempts = Promise.allSettled(
    [b, c].map((u) =>
      asUser(u, "select public.accept_couple_invite($1) as id", [token]),
    ),
  );
  try {
    const deadline = Date.now() + 5000;
    let waiting = 0;
    do {
      // The observer uses its own connection. pg_stat_activity is a transaction snapshot.
      const { rows } = await pool.query(
        "select count(*)::int as n from pg_stat_activity where wait_event_type='Lock' and query like 'select public.accept_couple_invite%'",
      );
      waiting = rows[0].n;
      if (waiting >= 2) break;
      await new Promise((r) => setTimeout(r, 15));
    } while (Date.now() < deadline);
    assert.ok(waiting >= 2, "both claimant transactions should reach the lock");
  } finally {
    await admin.query("commit");
  }
  const results = await attempts;
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const winner = [b, c][results.findIndex((r) => r.status === "fulfilled")];
  const [{ id: again }] = await asUser(
    winner,
    "select public.accept_couple_invite($1) as id",
    [token],
  );
  assert.equal(again, id);
  assert.equal(
    (
      await asUser(
        winner,
        "select * from public.couple_members where room_id=$1",
        [id],
      )
    ).length,
    2,
  );
});
test("outsider cannot read the room, read invitations, add a member, or close the room", async () => {
  const { id } = await fixture(),
    c = await user();
  assert.deepEqual(
    await asUser(c, "select * from public.couple_rooms where id=$1", [id]),
    [],
  );
  assert.deepEqual(
    await asUser(c, "select * from public.couple_members where room_id=$1", [
      id,
    ]),
    [],
  );
  await assert.rejects(
    asUser(c, "select * from duri_private.invites"),
    /permission denied/,
  );
  await assert.rejects(
    asUser(c, "insert into public.couple_members values($1,$2,2)", [c, id]),
    /permission denied/,
  );
  await assert.rejects(
    asUser(c, "select public.leave_couple_room($1)", [id]),
    /Room unavailable/,
  );
});
test("expired token fails; leaving closes access and only the other member sees a notice", async () => {
  const { a, id, token } = await fixture(),
    b = await user();
  await admin.query(
    "update duri_private.invites set expires_at=now()-interval '1 hour' where room_id=$1",
    [id],
  );
  await assert.rejects(
    asUser(b, "select public.accept_couple_invite($1)", [token]),
    /Invite unavailable/,
  );
  const [{ token: fresh }] = await asUser(
    a,
    "select public.issue_couple_invite($1) as token",
    [id],
  );
  await asUser(b, "select public.accept_couple_invite($1)", [fresh]);
  await asUser(a, "select public.leave_couple_room($1)", [id]);
  const closed = await admin.query("select closed_at from public.couple_rooms where id=$1", [id]);
  assert.ok(closed.rows[0]?.closed_at, "leaving archives the room and keeps deletion separate");
  assert.equal((await admin.query("select count(*)::int as n from public.couple_members where room_id=$1", [id])).rows[0].n, 0);
  assert.deepEqual(
    await asUser(b, "select * from public.couple_rooms where id=$1", [id]),
    [],
  );
  assert.deepEqual(await asUser(b, "select kind from public.room_notices"), [
    { kind: "partner_left" },
  ]);
  assert.deepEqual(await asUser(a, "select kind from public.room_notices"), []);
  await assert.rejects(
    asUser(b, "select public.accept_couple_invite($1)", [fresh]),
    /Invite unavailable/,
  );
});
test("deleting an account removes the person, the shared room, and tells only the partner", async () => {
  const { a, id, token } = await fixture(),
    b = await user();
  await asUser(b, "select public.accept_couple_invite($1)", [token]);
  await assert.rejects(
    pool.query("set role anon; select public.delete_my_account()").finally(() => pool.query("reset role")),
    /permission denied/,
  );
  await asUser(a, "select public.delete_my_account()");
  assert.equal((await admin.query("select count(*)::int as n from auth.users where id=$1", [a])).rows[0].n, 0);
  assert.equal((await admin.query("select count(*)::int as n from public.couple_rooms where id=$1", [id])).rows[0].n, 0);
  assert.equal((await admin.query("select count(*)::int as n from duri_private.invites where room_id=$1", [id])).rows[0].n, 0);
  assert.deepEqual(await asUser(b, "select kind from public.room_notices"), [{ kind: "partner_left" }]);
  assert.deepEqual(await asUser(b, "select * from public.couple_members"), []);
  // A person with no room can delete too.
  const c = await user();
  await asUser(c, "select public.delete_my_account()");
  assert.equal((await admin.query("select count(*)::int as n from auth.users where id=$1", [c])).rows[0].n, 0);
});
test("joining and leaving broadcast on the room's private topic, which only members may listen to", async () => {
  const { a, id, token } = await fixture(),
    b = await user(),
    c = await user();
  const topic = "room:" + id;
  const sent = async () =>
    (await admin.query("select payload->>'change' as change, event, private from realtime.sent where topic=$1", [topic])).rows;
  // Creating the room seats A: one insert broadcast.
  assert.deepEqual(await sent(), [{ change: "insert", event: "members", private: true }]);
  await asUser(b, "select public.accept_couple_invite($1)", [token]);
  assert.equal((await sent()).filter((r) => r.change === "insert").length, 2);
  const can = async (who, t) => (await asUser(who, "select duri_private.can_listen($1) as ok", [t]))[0].ok;
  assert.equal(await can(a, topic), true);
  assert.equal(await can(b, topic), true);
  assert.equal(await can(c, topic), false);
  assert.equal(await can(a, "room:not-a-uuid"), false);
  assert.equal(await can(a, "other:" + id), false);
  await asUser(b, "select public.leave_couple_room($1)", [id]);
  assert.equal((await sent()).filter((r) => r.change === "delete").length, 2);
  // After leaving, nobody may listen to the closed room.
  assert.equal(await can(a, topic), false);
});
test("room home: members change mood, first day and plans; outsiders and bad input are refused; both hear it", async () => {
  const { a, id, token } = await fixture(),
    b = await user(),
    c = await user();
  await asUser(b, "select public.accept_couple_invite($1)", [token]);
  const events = async (event) =>
    (await admin.query("select count(*)::int as n from realtime.sent where topic=$1 and event=$2", ["room:" + id, event])).rows[0].n;

  await asUser(b, "select public.set_room_mood($1,'night')", [id]);
  assert.deepEqual(await asUser(a, "select mood from public.couple_rooms where id=$1", [id]), [{ mood: "night" }]);
  await assert.rejects(asUser(a, "select public.set_room_mood($1,'neon')", [id]), /Invalid mood/);
  await assert.rejects(asUser(c, "select public.set_room_mood($1,'cafe')", [id]), /Room unavailable/);

  await asUser(a, "select public.set_room_start($1,'2026-08-01','Asia/Seoul')", [id]);
  const [room] = await asUser(b, "select start_date::text as d, timezone from public.couple_rooms where id=$1", [id]);
  assert.deepEqual(room, { d: "2026-08-01", timezone: "Asia/Seoul" });
  await assert.rejects(asUser(a, "select public.set_room_start($1,'2026-08-01','Mars/Base')", [id]), /Invalid account, date or timezone/);
  assert.equal(await events("room"), 2);

  const [{ pid }] = await asUser(a, "select public.add_room_plan($1,'2026-12-24','  크리스마스 저녁  ') as pid", [id]);
  assert.deepEqual(await asUser(b, "select title from public.room_plans where room_id=$1", [id]), [{ title: "크리스마스 저녁" }]);
  await assert.rejects(asUser(a, "select public.add_room_plan($1,'2026-12-24','   ')", [id]), /Invalid plan/);
  await assert.rejects(asUser(a, "select public.add_room_plan($1,'2026-12-24',$2)", [id, "가".repeat(61)]), /Invalid plan/);
  await assert.rejects(asUser(c, "select public.add_room_plan($1,'2026-12-24','몰래')", [id]), /Room unavailable/);
  assert.deepEqual(await asUser(c, "select * from public.room_plans where room_id=$1", [id]), []);
  await assert.rejects(asUser(c, "select public.remove_room_plan($1)", [pid]), /Plan unavailable/);
  await assert.rejects(asUser(a, "insert into public.room_plans(room_id,on_date,title) values($1,'2026-12-25','직접')", [id]), /permission denied/);
  await asUser(b, "select public.remove_room_plan($1)", [pid]);
  assert.equal(await events("plans"), 2);

  // After leaving, nobody can change the closed room and the plans go with the members' access.
  await asUser(a, "select public.add_room_plan($1,'2027-01-01','새해')", [id]);
  await asUser(a, "select public.leave_couple_room($1)", [id]);
  await assert.rejects(asUser(a, "select public.set_room_mood($1,'berry')", [id]), /Room unavailable/);
  assert.deepEqual(await asUser(b, "select * from public.room_plans where room_id=$1", [id]), []);
});
test("chat: members send and read, a retried send does not double, spam and strangers are refused, only the sender deletes", async () => {
  const { a, id, token } = await fixture(),
    b = await user(),
    c = await user();
  await asUser(b, "select public.accept_couple_invite($1)", [token]);
  const req = randomUUID();
  const [{ m1 }] = await asUser(a, "select public.send_room_message($1,$2,'  안녕  ') as m1", [id, req]);
  const [{ again }] = await asUser(a, "select public.send_room_message($1,$2,'안녕') as again", [id, req]);
  assert.equal(again, m1, "the same request id returns the same message");
  assert.deepEqual(await asUser(b, "select body from public.room_messages where room_id=$1", [id]), [{ body: "안녕" }]);
  assert.deepEqual(await asUser(c, "select * from public.room_messages where room_id=$1", [id]), []);
  await assert.rejects(asUser(c, "select public.send_room_message($1,$2,'몰래')", [id, randomUUID()]), /Room unavailable/);
  await assert.rejects(asUser(a, "select public.send_room_message($1,$2,'   ')", [id, randomUUID()]), /Invalid message/);
  await assert.rejects(asUser(a, "select public.send_room_message($1,$2,$3)", [id, randomUUID(), "가".repeat(1001)]), /Invalid message/);
  await assert.rejects(asUser(a, "insert into public.room_messages(room_id,sender,client_id,body) values($1,$2,$3,'직접')", [id, a, randomUUID()]), /permission denied/);

  // Ten in ten seconds is the limit per sender.
  for (let i = 0; i < 9; i++) await asUser(b, "select public.send_room_message($1,$2,$3)", [id, randomUUID(), "메시지 " + i]);
  await asUser(b, "select public.send_room_message($1,$2,'열 번째')", [id, randomUUID()]);
  await assert.rejects(asUser(b, "select public.send_room_message($1,$2,'열한 번째')", [id, randomUUID()]), /Slow down/);

  await assert.rejects(asUser(b, "select public.delete_my_message($1)", [m1]), /Message unavailable/);
  await asUser(a, "select public.delete_my_message($1)", [m1]);
  assert.equal((await asUser(b, "select count(*)::int as n from public.room_messages where room_id=$1", [id]))[0].n, 10);
  const sent = (await admin.query("select count(*)::int as n from realtime.sent where topic=$1 and event='messages'", ["room:" + id])).rows[0].n;
  assert.equal(sent, 12, "11 sends and 1 delete, each heard on the room topic");

  await asUser(a, "select public.leave_couple_room($1)", [id]);
  await assert.rejects(asUser(a, "select public.send_room_message($1,$2,'안녕?')", [id, randomUUID()]), /Room unavailable/);
  assert.deepEqual(await asUser(a, "select * from public.room_messages where room_id=$1", [id]), []);
});
test("guess game: a partner's answer stays hidden until both answer, answers cannot change, strangers see nothing", async () => {
  const { a, id, token } = await fixture(),
    b = await user(),
    c = await user();
  await assert.rejects(asUser(a, "select public.start_guess_game($1)", [id]), /Partner needed/);
  await asUser(b, "select public.accept_couple_invite($1)", [token]);
  const [{ game }] = await asUser(a, "select public.start_guess_game($1) as game", [id]);
  const [{ same }] = await asUser(b, "select public.start_guess_game($1) as same", [id]);
  assert.equal(same, game, "one open game per room");
  const state = async (who) => (await asUser(who, "select public.guess_state($1) as s", [id]))[0].s;
  const s0 = await state(a);
  assert.equal(s0.rounds.length, 3);
  assert.equal(new Set(s0.rounds.map((r) => r.question)).size, 3, "three different questions");
  assert.ok(s0.rounds.every((r) => r.question >= 0 && r.question <= 11));

  // A answers round 1. B learns only that A answered, never what.
  await asUser(a, "select public.answer_guess($1,1::smallint,2::smallint,0::smallint)", [game]);
  const b1 = await state(b);
  assert.equal(b1.rounds[0].partnerAnswered, true);
  assert.equal(b1.rounds[0].partner, null);
  assert.ok(!JSON.stringify(b1).includes('"own":2'), "A's choice is nowhere in B's state");
  await assert.rejects(asUser(b, "select * from duri_private.guess_answers"), /permission denied/);
  const signal = (await admin.query("select payload from realtime.sent where topic=$1 and event='guess' order by ctid desc limit 1", ["room:" + id])).rows[0].payload;
  assert.deepEqual(signal, { change: "answer" }, "the live signal carries no answers");

  // Resending the same answer is fine; changing it is refused.
  await asUser(a, "select public.answer_guess($1,1::smallint,2::smallint,0::smallint)", [game]);
  await assert.rejects(asUser(a, "select public.answer_guess($1,1::smallint,3::smallint,0::smallint)", [game]), /Already answered/);
  await assert.rejects(asUser(a, "select public.answer_guess($1,4::smallint,0::smallint,0::smallint)", [game]), /Invalid answer/);
  await assert.rejects(asUser(c, "select public.answer_guess($1,1::smallint,0::smallint,0::smallint)", [game]), /Game unavailable/);
  await assert.rejects(asUser(c, "select public.guess_state($1)", [id]), /Room unavailable/);
  assert.deepEqual(await asUser(c, "select * from public.guess_games where id=$1", [game]), []);

  // B answers round 1 later: now both see both, and the guesses score.
  await asUser(b, "select public.answer_guess($1,1::smallint,0::smallint,2::smallint)", [game]);
  const a1 = await state(a);
  assert.deepEqual(a1.rounds[0].partner, { own: 0, guess: 2 });
  assert.deepEqual(a1.score, { me: 1, partner: 1 });
  assert.equal(a1.finished, false);

  for (const r of [2, 3]) {
    await asUser(a, "select public.answer_guess($1,$2::smallint,1::smallint,1::smallint)", [game, r]);
    await asUser(b, "select public.answer_guess($1,$2::smallint,3::smallint,0::smallint)", [game, r]);
  }
  const done = await state(b);
  assert.equal(done.finished, true);
  assert.deepEqual(done.score, { me: 1, partner: 1 });
  await assert.rejects(asUser(a, "select public.answer_guess($1,1::smallint,2::smallint,0::smallint)", [game]), /Game unavailable/);
  const [{ next }] = await asUser(b, "select public.start_guess_game($1) as next", [id]);
  assert.notEqual(next, game, "a finished game makes room for a new one");
});
test("draw quiz: the guesser never gets the word, the database sets the deadline, a round ends once, strangers are refused", async () => {
  const { a, id, token } = await fixture(),
    b = await user(),
    c = await user();
  const state = async (who) => (await asUser(who, "select public.draw_state($1) as s", [id]))[0].s;
  const wordOf = async (game) => (await admin.query("select word from duri_private.draw_words where game_id=$1", [game])).rows[0].word;
  const stroke = (who, game, seg = randomUUID(), pts = [[10, 10], [200, 300]], color = "#ff0000") =>
    asUser(who, "select public.add_draw_stroke($1,$2,$3,$4,4::smallint,$5::jsonb) as ok", [game, randomUUID(), seg, color, JSON.stringify(pts)]);
  const ready = async (game) => {
    await asUser(a, "select public.ready_draw_game($1)", [game]);
    await asUser(b, "select public.ready_draw_game($1)", [game]);
  };

  // Setup rules.
  await assert.rejects(asUser(a, "select public.start_draw_game($1,'food')", [id]), /Partner needed/);
  await asUser(b, "select public.accept_couple_invite($1)", [token]);
  await assert.rejects(asUser(a, "select public.start_draw_game($1,'cars')", [id]), /Invalid category/);
  await assert.rejects(asUser(c, "select public.start_draw_game($1,'food')", [id]), /Room unavailable/);
  const bank = (await admin.query("select category, count(*)::int n from duri_private.draw_word_bank group by 1")).rows;
  assert.equal(bank.length, 5, "five categories");
  assert.ok(bank.every((r) => r.n >= 20), "at least 20 words each");

  // Round 1: A draws (the starter draws first), B guesses.
  const [{ game }] = await asUser(a, "select public.start_draw_game($1,'food') as game", [id]);
  const [{ same }] = await asUser(b, "select public.start_draw_game($1,'animal') as same", [id]);
  assert.equal(same, game, "one open round per room");
  const lobbyA = await state(a), lobbyB = await state(b);
  assert.deepEqual([lobbyA.role, lobbyA.phase, lobbyB.role], ["drawer", "lobby", "guesser"]);
  assert.equal(lobbyA.word, null, "no word before the round starts");
  await assert.rejects(stroke(a, game), /Game unavailable/);
  await asUser(a, "select public.ready_draw_game($1)", [game]);
  assert.equal((await state(b)).phase, "lobby");
  assert.equal((await state(b)).partnerReady, true);
  await asUser(a, "select public.ready_draw_game($1)", [game]);
  await asUser(b, "select public.ready_draw_game($1)", [game]);
  const live = await state(b);
  assert.equal(live.phase, "live");
  assert.ok(Math.abs(live.deadlineMs - live.startedMs - 100_000) <= 5, "the database sets a 100 second deadline");
  assert.ok(live.deadlineMs > live.nowMs && live.deadlineMs - live.nowMs <= 100_000);

  // The word: the drawer sees it, the guesser's state, rows and signals never contain it.
  const word = await wordOf(game);
  const sa = await state(a), sb = await state(b);
  assert.equal(sa.word, word);
  assert.equal(sb.word, null);
  assert.ok(!JSON.stringify(sb).includes(word));
  await assert.rejects(asUser(b, "select * from duri_private.draw_words"), /permission denied/);
  await assert.rejects(asUser(b, "select * from duri_private.draw_word_bank"), /permission denied/);
  assert.ok(!JSON.stringify(await asUser(b, "select * from public.draw_games")).includes(word));

  // Drawing: only the drawer draws; the guesser reads; resends do not double; bad input is refused.
  const seg = randomUUID();
  assert.equal((await stroke(a, game, seg))[0].ok, true);
  assert.equal((await stroke(a, game, seg))[0].ok, true, "a resent segment is accepted");
  assert.equal((await asUser(b, "select count(*)::int n from public.draw_strokes where game_id=$1", [game]))[0].n, 1, "…but stored once");
  await assert.rejects(stroke(b, game), /Game unavailable/);
  await assert.rejects(stroke(a, game, randomUUID(), [[10, 2000]]), /Invalid stroke/);
  await assert.rejects(stroke(a, game, randomUUID(), [["x", 1]]), /Invalid stroke/);
  await assert.rejects(stroke(a, game, randomUUID(), []), /Invalid stroke/);
  await assert.rejects(stroke(a, game, randomUUID(), [[1, 1]], "red"), /Invalid stroke/);
  const twoSegments = randomUUID();
  await asUser(a, "select public.add_draw_stroke($1,$2,$3,'#00aa00',6::smallint,'[[1,1],[2,2]]'::jsonb)", [game, twoSegments, randomUUID()]);
  await asUser(a, "select public.add_draw_stroke($1,$2,$3,'#00aa00',6::smallint,'[[2,2],[3,3]]'::jsonb)", [game, twoSegments, randomUUID()]);
  await asUser(a, "select public.undo_draw_stroke($1)", [game]);
  assert.equal((await asUser(b, "select count(*)::int n from public.draw_strokes where game_id=$1", [game]))[0].n, 1, "undo removes the whole last stroke");
  await assert.rejects(asUser(b, "select public.undo_draw_stroke($1)", [game]), /Game unavailable/);
  await assert.rejects(asUser(b, "select public.clear_draw_strokes($1)", [game]), /Game unavailable/);

  // Guessing: only the guesser; a wrong guess retries freely; spaces and case do not matter.
  await assert.rejects(asUser(a, "select public.guess_draw($1,$2)", [game, word]), /Game unavailable/);
  await assert.rejects(asUser(b, "select public.guess_draw($1,'   ')", [game]), /Invalid guess/);
  assert.equal((await asUser(b, "select public.guess_draw($1,'ㅋㅋㅋ아님') as r", [game]))[0].r, "wrong");
  assert.equal((await asUser(b, "select public.guess_draw($1,'또 아님') as r", [game]))[0].r, "wrong");
  assert.equal((await state(b)).phase, "live");
  // Every signal so far is just an event name.
  const signals = (await admin.query("select payload, event from realtime.sent where topic=$1 and event='draw'", ["room:" + id])).rows;
  assert.ok(signals.length > 5);
  assert.ok(signals.every((s) => Object.keys(s.payload).join() === "change"), "signals carry only a change kind");
  assert.ok(!JSON.stringify(signals).includes(word));

  // A correct guess, even spaced out, ends the round once. A second correct guess at the same
  // moment cannot end it again.
  const spaced = " " + word.split("").join(" ") + " ";
  const race = await Promise.all([
    asUser(b, "select public.guess_draw($1,$2) as r", [game, spaced]),
    asUser(b, "select public.guess_draw($1,$2) as r", [game, word]),
  ]);
  assert.deepEqual(race.map((r) => r[0].r).sort(), ["closed", "correct"], "exactly one guess wins");
  const won = await state(b);
  assert.equal(won.phase, "done");
  assert.equal(won.result, "won");
  assert.equal(won.word, word, "the word is shown to the guesser once the round is over");
  assert.ok(won.seconds >= 0 && won.seconds < 100);
  assert.equal(won.records.food, won.seconds, "the pair's best time is recorded");
  assert.equal((await admin.query("select count(*)::int n from public.draw_records where room_id=$1", [id])).rows[0].n, 1);
  assert.equal((await stroke(a, game))[0].ok, false, "no drawing after the round ended");
  assert.equal((await asUser(b, "select public.guess_draw($1,$2) as r", [game, word]))[0].r, "closed");

  // Round 2: roles swap. B draws, A guesses. A better time is kept; a worse one is not.
  const [{ game: g2 }] = await asUser(a, "select public.start_draw_game($1,'animal') as game", [id]);
  assert.notEqual(g2, game);
  assert.equal((await state(b)).role, "drawer", "the guesser of the last round draws now");
  assert.equal((await state(a)).role, "guesser");
  await ready(g2);
  const w2 = await wordOf(g2);
  assert.notEqual(w2, word);
  assert.equal((await asUser(a, "select public.guess_draw($1,$2) as r", [g2, w2]))[0].r, "correct");
  const best = (await state(a)).records.animal;
  await admin.query("update public.draw_records set best_seconds=0.01 where room_id=$1 and category='animal'", [id]);

  // A lobby can be cancelled to pick another category, and cancelled rounds do not show up.
  const [{ game: g3 }] = await asUser(a, "select public.start_draw_game($1,'place') as game", [id]);
  await assert.rejects(asUser(c, "select public.cancel_draw_game($1)", [g3]), /Game unavailable/);
  await asUser(b, "select public.cancel_draw_game($1)", [g3]);
  assert.equal((await state(a)).game, g2, "the last real round is shown again");

  // Round 3: time runs out. The late correct answer is refused and the round ends as a timeout.
  const [{ game: g4 }] = await asUser(a, "select public.start_draw_game($1,'animal') as game", [id]);
  assert.equal((await state(a)).role, "drawer");
  await ready(g4);
  const w4 = await wordOf(g4);
  await admin.query("update public.draw_games set started_at=started_at-interval '101 seconds', deadline_at=deadline_at-interval '101 seconds' where id=$1", [g4]);
  assert.equal((await asUser(b, "select public.guess_draw($1,$2) as r", [g4, w4]))[0].r, "closed", "an answer after the deadline is refused");
  const over = await state(a);
  assert.equal(over.phase, "done");
  assert.equal(over.result, "timeout");
  assert.equal((await state(b)).word, w4, "the word is revealed when time is up");
  assert.equal((await stroke(a, g4))[0].ok, false);
  assert.equal((await state(a)).records.animal, 0.01, "a timeout changes no record");
  // The state call alone also ends an overdue round once, without anyone guessing.
  const [{ game: g5 }] = await asUser(b, "select public.start_draw_game($1,'thing') as game", [id]);
  await ready(g5);
  await admin.query("update public.draw_games set deadline_at=clock_timestamp()-interval '1 second', started_at=clock_timestamp()-interval '101 seconds' where id=$1", [g5]);
  const [s1, s2] = await Promise.all([state(a), state(b)]);
  assert.equal(s1.result, "timeout");
  assert.equal(s2.result, "timeout");
  assert.equal((await admin.query("select count(*)::int n from public.draw_games where id=$1 and result='timeout' and finished_at is not null", [g5])).rows[0].n, 1);
  // A slower win than the best time does not replace it.
  await admin.query("update public.draw_records set best_seconds=0 where room_id=$1 and category='animal'", [id]);
  const [{ game: g6 }] = await asUser(a, "select public.start_draw_game($1,'animal') as game", [id]);
  await ready(g6);
  const drawerOf6 = (await state(a)).role === "drawer" ? a : b;
  const guesserOf6 = drawerOf6 === a ? b : a;
  await asUser(guesserOf6, "select public.guess_draw($1,$2)", [g6, await wordOf(g6)]);
  assert.equal((await state(a)).records.animal, 0, "only a better time replaces the record");
  assert.ok(best >= 0);

  // Strangers see nothing and change nothing.
  for (const sql of [
    "select public.draw_state($1)",
  ]) await assert.rejects(asUser(c, sql, [id]), /Room unavailable/);
  for (const sql of ["select public.ready_draw_game($1)", "select public.guess_draw($1,'아무거나')", "select public.undo_draw_stroke($1)", "select public.clear_draw_strokes($1)"])
    await assert.rejects(asUser(c, sql, [game]), /Game unavailable/);
  await assert.rejects(stroke(c, game), /Game unavailable/);
  for (const t of ["draw_games", "draw_strokes", "draw_guesses", "draw_records"])
    assert.deepEqual(await asUser(c, `select * from public.${t}`), [], t + " is empty for an outsider");

  // Leaving closes the room: nobody can draw or guess any more.
  await asUser(a, "select public.leave_couple_room($1)", [id]);
  await assert.rejects(asUser(b, "select public.draw_state($1)", [id]), /Room unavailable/);
});

test("watch together: links are parsed by the database, both must be ready, commands bump a revision, silence freezes the clock, strangers are refused", async () => {
  const { a, id, token } = await fixture(),
    b = await user(),
    c = await user();
  const state = async (who) => (await asUser(who, "select public.watch_state($1) as s", [id]))[0].s;
  const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const VID = "dQw4w9WgXcQ";
  const cmd = (who, kind, pos, req = randomUUID()) =>
    asUser(who, "select public.watch_command($1,$2,$3::numeric,$4) as rev", [id, kind, pos, req]);

  // The link parser: good links give the id, everything else gives nothing.
  const parse = async (u) => (await admin.query("select duri_private.parse_youtube($1) as v", [u])).rows[0].v;
  for (const ok of [
    "https://www.youtube.com/watch?v=" + VID,
    "https://youtube.com/watch?feature=share&v=" + VID + "&t=30s",
    "https://m.youtube.com/watch?v=" + VID,
    "https://music.youtube.com/watch?v=" + VID,
    "https://youtu.be/" + VID + "?si=abc",
    "https://www.youtube.com/shorts/" + VID,
    "https://www.youtube.com/embed/" + VID,
    "https://www.youtube.com/live/" + VID,
    "  https://youtu.be/" + VID + "  ",
  ]) assert.equal(await parse(ok), VID, ok);
  for (const bad of [
    "", "hello", "https://evil.com/watch?v=" + VID, "https://youtube.com.evil.com/watch?v=" + VID,
    "https://www.youtube.com/watch?v=short", "https://www.youtube.com/watch?v=" + VID + "x",
    "https://www.youtube.com/playlist?list=PL123", "javascript:alert(1)", "http://youtu.be/",
    "https://www.youtube.com/watch?v=" + "a".repeat(400),
  ]) assert.equal(await parse(bad), null, bad);

  // Strangers and bad input; the tables are closed to direct reads.
  await asUser(b, "select public.accept_couple_invite($1)", [token]);
  await assert.rejects(asUser(c, "select public.watch_state($1)", [id]), /Room unavailable/);
  await assert.rejects(asUser(c, "select public.watch_set_video($1,$2)", [id, "https://youtu.be/" + VID]), /Room unavailable/);
  await assert.rejects(asUser(a, "select public.watch_set_video($1,'https://evil.com/x')", [id]), /Invalid video link/);
  await assert.rejects(asUser(a, "select public.watch_ready($1,true)", [id]), /No video/);
  await assert.rejects(cmd(a, "play", 0), /No video/);
  await assert.rejects(asUser(a, "select * from public.watch_sessions"), /permission denied/);
  await assert.rejects(asUser(a, "select * from public.watch_presence"), /permission denied/);
  const empty = await state(a);
  assert.equal(empty.videoId, null);
  assert.equal(empty.playing, false);

  // A picks a video: paused at 0:00, nobody ready, revision goes up.
  await asUser(a, "select public.watch_set_video($1,$2)", [id, "https://youtu.be/" + VID]);
  const first = await state(a);
  assert.deepEqual([first.videoId, first.playing, first.positionSec, first.meReady, first.partnerReady], [VID, false, 0, false, false]);
  assert.ok(first.revision > empty.revision);
  assert.equal((await state(b)).by, "partner");
  assert.equal(first.by, "me");

  // Both must press ready; the second press starts it for both at one database time.
  await asUser(a, "select public.watch_ready($1,true)", [id]);
  const waiting = await state(b);
  assert.equal(waiting.playing, false, "one ready is not enough");
  assert.equal(waiting.partnerReady, true);
  await asUser(b, "select public.watch_ready($1,true)", [id]);
  const rolling = await state(a);
  assert.equal(rolling.playing, true);
  assert.ok(rolling.revision > first.revision);
  assert.ok(Math.abs(rolling.refMs - rolling.nowMs) < 2000, "reference time is the database's own clock");
  await asUser(a, "select public.watch_ready($1,false)", [id]);
  await asUser(a, "select public.watch_ready($1,true)", [id]);
  assert.equal((await state(a)).revision, rolling.revision, "pressing ready again does not restart it");

  // Commands: seek keeps playing, pause freezes, play resumes; a resent request does not bump twice.
  await sleep(200);
  const seekReq = randomUUID();
  const r1 = (await cmd(b, "seek", 120.5, seekReq))[0].rev;
  assert.ok(Number(r1) > Number(rolling.revision));
  const afterSeek = await state(a);
  assert.deepEqual([afterSeek.positionSec, afterSeek.playing, afterSeek.by, Number(afterSeek.revision)], [120.5, true, "partner", Number(r1)]);
  assert.equal((await cmd(b, "seek", 999, seekReq))[0].rev, r1, "same request id: same answer");
  assert.equal((await state(a)).positionSec, 120.5, "…and nothing changed");
  await assert.rejects(cmd(b, "seek", 130), /Too many commands/);
  await sleep(200);
  await cmd(a, "pause", 125);
  const paused = await state(b);
  assert.deepEqual([paused.playing, paused.positionSec], [false, 125]);
  await assert.rejects(cmd(a, "jump", 1), /Invalid command/);
  await assert.rejects(cmd(a, "seek", -1), /Invalid position/);
  await assert.rejects(cmd(a, "seek", 99999), /Invalid position/);
  await assert.rejects(cmd(c, "play", 1), /Room unavailable/);
  await sleep(200);
  await cmd(b, "play", 125);
  assert.equal((await state(a)).playing, true);

  // Signals carry only an event name.
  const signals = (await admin.query("select payload from realtime.sent where topic=$1 and event='watch'", ["room:" + id])).rows;
  assert.ok(signals.length >= 6);
  assert.ok(signals.every((s) => Object.keys(s.payload).join() === "change"));
  assert.ok(!JSON.stringify(signals).includes(VID));

  // One leaves: it keeps playing for the other. The last one leaves: the clock stops where they were.
  await asUser(a, "select public.watch_leave($1)", [id]);
  const alone = await state(b);
  assert.equal(alone.playing, true);
  assert.equal(alone.partnerHere, false);
  assert.equal((await state(a)).meReady, false, "leaving clears ready");
  await admin.query("update public.watch_sessions set ref_at = clock_timestamp() - interval '30 seconds', position_sec = 100 where room_id=$1", [id]);
  const beforeFreeze = Number((await state(b)).revision);
  await asUser(b, "select public.watch_leave($1)", [id]);
  const frozen = (await admin.query("select playing, position_sec::float p, revision from public.watch_sessions where room_id=$1", [id])).rows[0];
  assert.equal(frozen.playing, false);
  assert.ok(frozen.p >= 129.5 && frozen.p <= 131, "position = 100 + about 30 seconds, got " + frozen.p);
  assert.ok(Number(frozen.revision) > beforeFreeze);

  // Coming back: the saved spot is waiting, and a stale heartbeat also freezes a crashed tab.
  await asUser(a, "select public.watch_ping($1)", [id]);
  const back = await state(a);
  assert.deepEqual([back.videoId, back.playing, back.meReady], [VID, false, false]);
  assert.ok(Math.abs(back.positionSec - frozen.p) < 0.01);
  await cmd(a, "play", 130);
  await admin.query("update public.watch_sessions set ref_at = clock_timestamp() - interval '200 seconds' where room_id=$1", [id]);
  await admin.query("update public.watch_presence set last_seen = clock_timestamp() - interval '100 seconds' where room_id=$1", [id]);
  const silent = await state(a);
  assert.equal(silent.playing, false, "silent for 45+ seconds counts as gone");
  assert.ok(Math.abs(silent.positionSec - 230) < 1.5, "frozen at the last heartbeat (130 + 100), got " + silent.positionSec);

  // A new video resets everything.
  await asUser(b, "select public.watch_set_video($1,$2)", [id, "https://www.youtube.com/watch?v=aaaaaaaaaaa"]);
  const next = await state(a);
  assert.deepEqual([next.videoId, next.positionSec, next.playing, next.meReady, next.partnerReady], ["aaaaaaaaaaa", 0, false, false, false]);
});

test("cost gate: closed by default, room/day and project/month limits, replay is free, the last share goes to one request, strangers and members cannot reserve", async () => {
  const { a, id } = await fixture(),
    other = await fixture(),
    c = await user();
  const asServer = async (sql, args = []) => {
    const cl = await pool.connect();
    try {
      await cl.query("begin");
      await cl.query("set local role service_role");
      const res = await cl.query(sql, args);
      await cl.query("commit");
      return res.rows;
    } catch (e) { await cl.query("rollback"); throw e; } finally { cl.release(); }
  };
  const reserve = async (room, kind, key, cents) =>
    (await asServer("select public.reserve_api_call($1,$2,$3,$4) as r", [room, kind, key, cents]))[0].r;
  const set = (sql) => admin.query("update duri_private.api_settings set " + sql);
  const wipe = () => admin.query("delete from duri_private.api_ledger");

  // Closed by default: nothing is reserved, nothing is booked.
  assert.deepEqual(await reserve(id, "ai", "key-closed-1", 5), { ok: false, reason: "disabled" });
  await set("paid_enabled = true");
  assert.deepEqual(await reserve(id, "ai", "key-closed-2", 5), { ok: false, reason: "no_price" }, "a missing price blocks");
  await set("price_ai_cents = 2, price_places_cents = 4");
  assert.deepEqual(await reserve(id, "ai", "key-closed-3", 5), { ok: false, reason: "monthly" }, "budget 0 blocks");
  assert.equal((await admin.query("select count(*)::int n from duri_private.api_ledger")).rows[0].n, 0);

  // Who may call: only the server role. Members and strangers get nothing.
  await set("monthly_budget_cents = 100");
  await assert.rejects(asUser(a, "select public.reserve_api_call($1,'ai','key-member-1',5)", [id]), /permission denied/);
  await assert.rejects(asUser(a, "select public.settle_api_call('key-member-1',1)"), /permission denied/);
  await assert.rejects(asUser(a, "select * from duri_private.api_ledger"), /permission denied/);
  {
    const anon = await pool.connect();
    try {
      await anon.query("set role anon");
      await assert.rejects(anon.query("select public.reserve_api_call($1,'ai','key-anon-001',5)", [id]), /permission denied/);
    } finally {
      await anon.query("reset role");
      anon.release();
    }
  }
  await assert.rejects(asUser(c, "select public.api_usage($1)", [id]), /Room unavailable/);
  await assert.rejects(reserve(id, "video", "key-bad-0001", 5), /Invalid api call/);
  await assert.rejects(reserve(id, "ai", "key-bad-0002", 0), /Invalid api call/);

  // A reservation books at least the configured price; a repeated key is a replay and costs nothing more.
  assert.deepEqual(await reserve(id, "ai", "key-one-0001", 1), { ok: true });
  assert.deepEqual(await reserve(id, "ai", "key-one-0001", 1), { ok: true, replay: true });
  const row = (await admin.query("select reserved_cents, status from duri_private.api_ledger where request_key='key-one-0001'")).rows;
  assert.deepEqual(row, [{ reserved_cents: 2, status: "reserved" }]);
  assert.equal(row.length, 1);

  // Settling replaces the worst case with the real cost; a release gives the booking back.
  await asServer("select public.settle_api_call('key-one-0001', 1)");
  assert.equal((await admin.query("select settled_cents from duri_private.api_ledger where request_key='key-one-0001'")).rows[0].settled_cents, 1);
  await asServer("select public.settle_api_call('key-one-0001', 99)");
  assert.equal((await admin.query("select settled_cents from duri_private.api_ledger where request_key='key-one-0001'")).rows[0].settled_cents, 1, "a settled call is not settled twice");
  assert.deepEqual(await reserve(id, "ai", "key-two-0001", 2), { ok: true });
  await asServer("select public.release_api_call('key-two-0001')");

  // Room/day limit: 10 AI calls a day per room (released ones do not count), another room is unaffected.
  await wipe();
  await set("monthly_budget_cents = 100000, room_daily_ai = 3");
  for (let i = 0; i < 3; i++) assert.deepEqual(await reserve(id, "ai", "key-day-000" + i, 2), { ok: true });
  assert.deepEqual(await reserve(id, "ai", "key-day-0009", 2), { ok: false, reason: "room_daily" });
  assert.deepEqual(await reserve(other.id, "ai", "key-day-1000", 2), { ok: true });
  await asServer("select public.release_api_call('key-day-0000')");
  assert.deepEqual(await reserve(id, "ai", "key-day-0010", 2), { ok: true }, "a released booking frees a slot");
  assert.deepEqual(await reserve(id, "places", "key-day-0011", 4), { ok: true }, "places have their own count");

  // Usage a member sees: counts and a fill level, no prices.
  const usage = (await asUser(a, "select public.api_usage($1) as u", [id]))[0].u;
  assert.deepEqual([usage.paidEnabled, usage.aiUsed, usage.aiLimit, usage.placesUsed, usage.placesLimit], [true, 3, 3, 1, 3]);
  assert.ok(!JSON.stringify(usage).includes("cents"));

  // Month limit with two requests racing for the LAST share: exactly one wins.
  await wipe();
  await set("monthly_budget_cents = 10, room_daily_ai = 50");
  assert.deepEqual(await reserve(id, "ai", "key-fill-0001", 6), { ok: true });
  const race = await Promise.all([reserve(id, "ai", "key-race-0001", 4), reserve(other.id, "ai", "key-race-0002", 4), reserve(id, "ai", "key-race-0003", 4)]);
  assert.equal(race.filter((r) => r.ok).length, 1, "only one of three fits in the remaining 4 cents");
  assert.ok(race.filter((r) => !r.ok).every((r) => r.reason === "monthly"));
  const total = (await admin.query("select sum(coalesce(settled_cents, reserved_cents))::int s from duri_private.api_ledger")).rows[0].s;
  assert.ok(total <= 10, "booked " + total);
  // An unsettled (timed-out) call keeps its worst-case booking.
  assert.deepEqual(await reserve(id, "ai", "key-fill-0002", 2), { ok: false, reason: "monthly" });

  // Closed rooms and a switch-off.
  await set("monthly_budget_cents = 100000");
  await admin.query("update public.couple_rooms set closed_at = clock_timestamp() where id = $1", [other.id]);
  assert.deepEqual(await reserve(other.id, "ai", "key-closed-r1", 2), { ok: false, reason: "room" });
  await set("paid_enabled = false");
  assert.deepEqual(await reserve(id, "ai", "key-off-00001", 2), { ok: false, reason: "disabled" });
  await set("paid_enabled = false, monthly_budget_cents = 0, price_ai_cents = null, price_places_cents = null");
});

test("gomoku: turns, occupied cells, resent taps, all four winning directions, six in a row, draw, resign, swap of first move, strangers", async () => {
  const { a, id, token } = await fixture(),
    b = await user(),
    c = await user();
  await asUser(b, "select public.accept_couple_invite($1)", [token]);
  const state = async (who) => (await asUser(who, "select public.gomoku_state($1) as s", [id]))[0].s;
  const play = (who, game, x, y, req = randomUUID()) =>
    asUser(who, "select public.play_gomoku($1,$2,$3,$4) as r", [game, x, y, req]).then((r) => r[0].r);
  const start = async (who) => (await asUser(who, "select public.start_gomoku($1) as g", [id]))[0].g;
  // Plays black cells in order; white answers on harmless far-away cells (row 14, never five in a row).
  const run = async (game, black, white, blackCells) => {
    let w = 0, last;
    for (let i = 0; i < blackCells.length; i++) {
      last = await play(black, game, blackCells[i][0], blackCells[i][1]);
      if (last !== "ok") return { last, at: i };
      if (i < blackCells.length - 1) await play(white, game, (w * 2) % 15, 14 - (w >= 8 ? 1 : 0)), w++;
    }
    return { last, at: blackCells.length - 1 };
  };

  // Nothing yet; strangers and a lonely room are refused.
  assert.equal((await state(a)).game, null);
  await assert.rejects(asUser(c, "select public.gomoku_state($1)", [id]), /Room unavailable/);
  await assert.rejects(asUser(c, "select public.start_gomoku($1)", [id]), /Room unavailable/);
  await assert.rejects(asUser(a, "select * from public.gomoku_moves"), /permission denied/);
  await assert.rejects(asUser(a, "select public.play_gomoku($1,0,0,$2)", [randomUUID(), randomUUID()]), /Room unavailable/);

  // Game 1: the starter is black. Starting twice gives the same game.
  const g1 = await start(a);
  assert.equal(await start(b), g1, "both pressing start opens one game");
  const s0 = await state(b);
  assert.deepEqual([s0.me, s0.turn, s0.status], ["white", "partner", "open"]);
  assert.equal((await state(a)).turn, "me");

  // Turns, occupied cell, range, resent tap.
  await assert.rejects(play(b, g1, 7, 7), /Not your turn/);
  await assert.rejects(play(a, g1, 15, 0), /Invalid move/);
  await assert.rejects(play(a, g1, 0, -1), /Invalid move/);
  const req = randomUUID();
  assert.equal(await play(a, g1, 7, 7, req), "ok");
  assert.equal(await play(a, g1, 7, 7, req), "duplicate", "the same tap again places nothing");
  assert.equal((await state(a)).moves.length, 1);
  await assert.rejects(play(a, g1, 8, 8), /Not your turn/);
  await assert.rejects(play(b, g1, 7, 7), /Occupied/);
  const mid = await state(b);
  assert.deepEqual(mid.moves, [{ n: 1, x: 7, y: 7, by: "partner" }]);
  assert.equal(mid.turn, "me");

  // Two taps at the same instant from the player whose turn it is: one lands, the other is refused.
  const same = await Promise.allSettled([play(b, g1, 1, 1), play(b, g1, 2, 2)]);
  assert.equal(same.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(same.filter((r) => r.status === "rejected").length, 1);
  assert.match(String(same.find((r) => r.status === "rejected").reason), /Not your turn/);

  // Four in a row is not a win; the fifth is. (g1 now holds 3 stones, so resign to start clean games.)
  assert.equal(await asUser(a, "select public.resign_gomoku($1) as r", [g1]).then((r) => r[0].r), "ok");
  const afterResign = await state(a);
  assert.deepEqual([afterResign.status, afterResign.winner, afterResign.myWins, afterResign.partnerWins], ["won", "partner", 0, 1]);
  assert.equal(await asUser(a, "select public.resign_gomoku($1) as r", [g1]).then((r) => r[0].r), "closed");
  await assert.rejects(play(b, g1, 10, 10), /Game over/);

  // Game 2: black swaps to B. Each winning direction, in its own game (the loser resigns nothing, the game just ends).
  const lines = {
    horizontal: [[3, 5], [4, 5], [5, 5], [6, 5], [7, 5]],
    vertical: [[5, 3], [5, 4], [5, 5], [5, 6], [5, 7]],
    diagonal: [[3, 3], [4, 4], [5, 5], [6, 6], [7, 7]],
    anti: [[7, 3], [6, 4], [5, 5], [4, 6], [3, 7]],
  };
  let blackUser = b, whiteUser = a, game = await start(b);
  assert.equal((await state(b)).me, "black", "first move swaps to the other player");
  for (const [name, cells] of Object.entries(lines)) {
    // four stones: no win yet
    const four = await run(game, blackUser, whiteUser, cells.slice(0, 4));
    assert.equal(four.last, "ok", name + " four in a row is not a win");
    const winner = await play(whiteUser, game, 14, 13).then(() => play(blackUser, game, cells[4][0], cells[4][1]));
    assert.equal(winner, "won", name);
    const done = await state(blackUser);
    assert.deepEqual([done.status, done.winner], ["won", "me"]);
    assert.equal(done.winLine.length, 5, name + " winning line is highlighted");
    await assert.rejects(play(whiteUser, game, 0, 0), /Game over/);
    [blackUser, whiteUser] = [whiteUser, blackUser];
    game = await start(blackUser === a ? a : b);
    assert.equal((await state(blackUser)).me, "black", "black swaps every game");
  }

  // Six in a row (free rules): filling the gap between 4 and 2 stones makes six, and six wins.
  const six = await run(game, blackUser, whiteUser, [[0, 0], [1, 0], [2, 0], [3, 0], [5, 0]]);
  assert.equal(six.last, "ok");
  await play(whiteUser, game, 14, 12);
  assert.equal(await play(blackUser, game, 4, 0), "won");
  assert.equal((await state(blackUser)).winLine.length, 6, "overline counts and is shown whole");
  [blackUser, whiteUser] = [whiteUser, blackUser];

  // Draw: a full board with no five. The board is filled by the pattern, the last stone goes through the function.
  game = await start(blackUser);
  const color = (x, y) => (Math.floor(x / 2) + y) % 2;
  const cells = [];
  for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) cells.push([x, y]);
  const class0 = cells.filter(([x, y]) => color(x, y) === 0), class1 = cells.filter(([x, y]) => color(x, y) === 1);
  const [blackCells, whiteCells] = class0.length === 113 ? [class0, class1] : [class1, class0];
  assert.equal(blackCells.length, 113);
  const lastCell = blackCells[blackCells.length - 1];
  let n = 0;
  const rows = [];
  for (let i = 0; i < 112; i++) {
    rows.push([game, ++n, blackCells[i][0], blackCells[i][1], blackUser, randomUUID()]);
    rows.push([game, ++n, whiteCells[i][0], whiteCells[i][1], whiteUser, randomUUID()]);
  }
  for (const r of rows) await admin.query("insert into public.gomoku_moves(game_id,n,x,y,user_id,request_id) values($1,$2,$3,$4,$5,$6)", r);
  await admin.query("update public.gomoku_games set move_count = 224 where id=$1", [game]);
  assert.equal(await play(blackUser, game, lastCell[0], lastCell[1]), "draw");
  const drawn = await state(a);
  assert.deepEqual([drawn.status, drawn.winner, drawn.draws], ["draw", null, 1]);
  assert.equal(drawn.moves.length, 225);
  await assert.rejects(play(whiteUser, game, 0, 0), /Game over/);

  // Score: every win was counted once.
  const total = (await admin.query("select coalesce(sum(wins),0)::int s from public.gomoku_scores where room_id=$1", [id])).rows[0].s;
  assert.equal(total, 1 + 4 + 1, "1 resign win + 4 lines + 1 six");

  // Signals carry no coordinates.
  const signals = (await admin.query("select payload from realtime.sent where topic=$1 and event='gomoku'", ["room:" + id])).rows;
  assert.ok(signals.length > 10);
  assert.ok(signals.every((s) => Object.keys(s.payload).join() === "change"));

  // A stranger cannot play a move even with the game id.
  const g = await start(a);
  await assert.rejects(play(c, g, 0, 0), /Room unavailable/);
  await assert.rejects(asUser(c, "select public.resign_gomoku($1)", [g]), /Room unavailable/);
});
