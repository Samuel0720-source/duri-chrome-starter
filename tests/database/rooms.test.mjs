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
  await admin.query(
    await readFile(
      new URL(
        "../../supabase/migrations/202611130003_minigolf.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await admin.query(
    await readFile(
      new URL(
        "../../supabase/migrations/202611130004_golf_v2.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await admin.query(
    await readFile(
      new URL(
        "../../supabase/migrations/202611130005_guess_bank.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await admin.query(
    await readFile(
      new URL(
        "../../supabase/migrations/202611130006_draw_rush.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await admin.query(
    await readFile(
      new URL(
        "../../supabase/migrations/202611140001_member_prefs.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await admin.query(
    await readFile(
      new URL(
        "../../supabase/migrations/202611140002_draw_english.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await admin.query(
    await readFile(
      new URL(
        "../../supabase/migrations/202611140003_watch_sources.sql",
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
  assert.ok(s0.rounds.every((r) => r.question >= 0 && r.question <= 119));

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
test("draw quiz: 100 seconds, many words, the guesser never gets the current word, pass, records count words, who draws is chosen, strangers are refused", async () => {
  const { a, id, token } = await fixture(),
    b = await user(),
    c = await user();
  const state = async (who) => (await asUser(who, "select public.draw_state($1) as s", [id]))[0].s;
  const current = async (game) =>
    (await admin.query("select w.word from duri_private.draw_words w join public.draw_games g on g.id=w.game_id and w.n=g.word_no where g.id=$1", [game])).rows[0].word;
  const stroke = (who, game, seg = randomUUID(), pts = [[10, 10], [200, 300]], color = "#ff0000") =>
    asUser(who, "select public.add_draw_stroke($1,$2,$3,$4,4::smallint,$5::jsonb) as ok", [game, randomUUID(), seg, color, JSON.stringify(pts)]);
  const guess = async (who, game, text) => (await asUser(who, "select public.guess_draw($1,$2) as r", [game, text]))[0].r;
  const start = async (who, cat, iDraw) => (await asUser(who, "select public.start_draw_game($1,$2,$3) as g", [id, cat, iDraw]))[0].g;
  const ready = async (game) => {
    await asUser(a, "select public.ready_draw_game($1)", [game]);
    await asUser(b, "select public.ready_draw_game($1)", [game]);
  };
  const timeUp = (game) =>
    admin.query("update public.draw_games set started_at=clock_timestamp()-interval '101 seconds', deadline_at=clock_timestamp()-interval '1 second' where id=$1", [game]);

  // Setup rules and the bigger bank.
  await assert.rejects(start(a, "food", true), /Partner needed/);
  await asUser(b, "select public.accept_couple_invite($1)", [token]);
  await assert.rejects(start(a, "cars", true), /Invalid category/);
  await assert.rejects(start(c, "food", true), /Room unavailable/);
  const bank = (await admin.query("select category, count(*)::int n from duri_private.draw_word_bank group by 1")).rows;
  assert.equal(bank.length, 5, "five categories");
  assert.ok(bank.every((r) => r.n === 60), "60 words each");

  // Round 1: A chooses that B draws. One open round per room.
  const game = await start(a, "food", false);
  assert.equal(await start(b, "animal", true), game, "one open round per room");
  const lobbyA = await state(a), lobbyB = await state(b);
  assert.deepEqual([lobbyA.role, lobbyB.role, lobbyA.phase], ["guesser", "drawer", "lobby"], "B draws because A chose so");
  assert.equal(lobbyB.word, null, "no word before the round starts");
  assert.deepEqual(lobbyB.words, []);
  await assert.rejects(stroke(b, game), /Game unavailable/);
  await ready(game);
  const live = await state(a);
  assert.equal(live.phase, "live");
  assert.ok(Math.abs(live.deadlineMs - live.startedMs - 100_000) <= 5, "the database sets a 100 second deadline");
  assert.equal(live.score, 0);
  assert.equal(live.wordNo, 1);

  // Word 1: only the drawer (B) sees it.
  const w1 = await current(game);
  assert.equal((await state(b)).word, w1);
  const sa = await state(a);
  assert.equal(sa.word, null);
  assert.ok(!JSON.stringify(sa).includes(w1));
  await assert.rejects(asUser(a, "select * from duri_private.draw_words"), /permission denied/);
  assert.ok(!JSON.stringify(await asUser(a, "select * from public.draw_games")).includes(w1));

  // Drawing on word 1; resends stored once; bad input refused; only the drawer draws.
  const seg = randomUUID();
  assert.equal((await stroke(b, game, seg))[0].ok, true);
  assert.equal((await stroke(b, game, seg))[0].ok, true);
  assert.equal((await asUser(a, "select count(*)::int n from public.draw_strokes where game_id=$1 and word_no=1", [game]))[0].n, 1);
  await assert.rejects(stroke(a, game), /Game unavailable/);
  await assert.rejects(stroke(b, game, randomUUID(), [[10, 2000]]), /Invalid stroke/);

  // Wrong guesses retry; only the guesser guesses.
  await assert.rejects(asUser(b, "select public.guess_draw($1,$2)", [game, w1]), /Game unavailable/);
  assert.equal(await guess(a, game, "ㅋㅋ아님"), "wrong");
  // Correct (spaced out): score 1, next word at once, on a clean board; word 1 is now shown to both.
  assert.equal(await guess(a, game, " " + w1.split("").join(" ") + " "), "correct");
  let s1 = await state(a);
  assert.equal(s1.phase, "live", "the round goes on");
  assert.equal(s1.score, 1);
  assert.equal(s1.wordNo, 2);
  assert.deepEqual(s1.words.map(({ n, word, outcome }) => ({ n, word, outcome })), [{ n: 1, word: w1, outcome: "correct" }]);
  const w2 = await current(game);
  assert.notEqual(w2, w1);
  assert.equal((await state(b)).word, w2, "the drawer gets the next word");
  assert.equal(s1.word, null);
  assert.ok(!JSON.stringify(s1).includes(w2), "the guesser never gets the current word");
  assert.equal(await guess(a, game, w1), "wrong", "the old word no longer counts");
  // Undo / clear only touch the current word's drawing.
  await stroke(b, game);
  await asUser(b, "select public.clear_draw_strokes($1)", [game]);
  assert.deepEqual((await asUser(a, "select word_no, count(*)::int n from public.draw_strokes where game_id=$1 group by 1 order by 1", [game])), [{ word_no: 1, n: 1 }]);
  // Pass: no score, next word; only the drawer can pass.
  await assert.rejects(asUser(a, "select public.pass_draw_word($1)", [game]), /Game unavailable/);
  assert.equal((await asUser(b, "select public.pass_draw_word($1) as r", [game]))[0].r, "ok");
  s1 = await state(a);
  assert.equal(s1.score, 1);
  assert.equal(s1.passes, 1);
  assert.deepEqual(s1.words.map((w) => w.outcome), ["correct", "pass"]);
  // Two more correct answers, and two correct guesses at the same instant score once.
  assert.equal(await guess(a, game, await current(game)), "correct");
  const w4 = await current(game);
  const race = await Promise.all([guess(a, game, w4), guess(a, game, w4)]);
  assert.deepEqual(race.sort(), ["correct", "wrong"], "the second identical answer is checked against the next word");
  assert.equal((await state(a)).score, 3);
  // All words in this round are different.
  const words1 = (await admin.query("select word from duri_private.draw_words where game_id=$1", [game])).rows.map((r) => r.word);
  assert.equal(new Set(words1).size, words1.length);

  // Signals carry only an event name.
  const signals = (await admin.query("select payload from realtime.sent where topic=$1 and event='draw'", ["room:" + id])).rows;
  assert.ok(signals.length > 5);
  assert.ok(signals.every((x) => Object.keys(x.payload).join() === "change"));
  assert.ok(!JSON.stringify(signals).includes(w4));

  // Time is up: the round ends once (state calls at the same moment), the record is 3, all words are shown.
  await timeUp(game);
  const lastWord = await current(game);
  assert.equal(await guess(a, game, lastWord), "closed", "an answer after the deadline is refused");
  const [d1, d2] = await Promise.all([state(a), state(b)]);
  assert.equal(d1.phase, "done");
  assert.equal(d2.result, "timeout");
  assert.equal(d1.records.food, 3, "the record is the number of words solved");
  assert.equal(d1.words.at(-1).word, lastWord, "the unsolved last word is revealed at the end");
  assert.equal(d1.words.at(-1).outcome, null);
  assert.equal((await stroke(b, game))[0].ok, false, "no drawing after the round ended");

  // Round 2: B chooses to draw; a worse score keeps the record; A's choice of drawing is respected next time.
  const g2 = await start(b, "food", true);
  assert.equal((await state(b)).role, "drawer");
  await ready(g2);
  const firstOf2 = await current(g2);
  assert.ok(!words1.includes(firstOf2), "the next round starts with a word this room has not seen");
  assert.equal(await guess(a, g2, firstOf2), "correct");
  await timeUp(g2);
  assert.equal((await state(a)).records.food, 3, "1 is not better than 3");
  const g3 = await start(b, "food", false);
  assert.equal((await state(a)).role, "drawer", "B asked A to draw");
  await ready(g3);
  for (let i = 0; i < 4; i++) assert.equal(await guess(b, g3, await current(g3)), "correct");
  await timeUp(g3);
  assert.equal((await state(b)).records.food, 4, "4 is better than 3");
  // A round with no correct answer writes no record; 'mix' takes words from every category.
  const g4 = await start(a, "mix", true);
  await ready(g4);
  await timeUp(g4);
  assert.equal((await state(a)).records.mix, undefined);
  // The old two-argument start still works (swap rule).
  const g5 = await asUser(a, "select public.start_draw_game($1,'animal') as g", [id]).then((r) => r[0].g);
  assert.equal((await state(a)).role, "guesser", "A drew last time, so A guesses now");
  // A lobby can be cancelled.
  await assert.rejects(asUser(c, "select public.cancel_draw_game($1)", [g5]), /Game unavailable/);
  await asUser(b, "select public.cancel_draw_game($1)", [g5]);

  // Strangers see nothing and change nothing.
  await assert.rejects(asUser(c, "select public.draw_state($1)", [id]), /Room unavailable/);
  for (const sql of ["select public.ready_draw_game($1)", "select public.guess_draw($1,'아무거나')", "select public.pass_draw_word($1)", "select public.undo_draw_stroke($1)", "select public.clear_draw_strokes($1)"])
    await assert.rejects(asUser(c, sql, [game]), /Game unavailable/);
  for (const t of ["draw_games", "draw_strokes", "draw_guesses", "draw_records"])
    assert.deepEqual(await asUser(c, `select * from public.${t}`), [], t + " is empty for an outsider");

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

test("minigolf: fixed physics with sand and water, both balls roll at once, resent shots, 3/6/9 holes, totals carry, records only improve, strangers", async () => {
  const { a, id, token } = await fixture(),
    b = await user(),
    c = await user();
  await asUser(b, "select public.accept_couple_invite($1)", [token]);
  const sim = async (hole, x, y, ang, pw) =>
    (await admin.query("select duri_private.golf_simulate($1,$2,$3,$4,$5) as r", [hole, x, y, ang, pw])).rows[0].r;
  const course = async (h) => (await admin.query("select duri_private.golf_course($1) as c", [h])).rows[0].c;
  const state = async (who) => (await asUser(who, "select public.golf_state($1) as s", [id]))[0].s;
  const start = async (who, n) => (await asUser(who, "select public.start_golf($1,$2) as g", [id, n]))[0].g;
  const shoot = (who, game, ang, pw, shot = randomUUID()) =>
    asUser(who, "select public.golf_shot($1,$2,$3,$4) as r", [game, shot, ang, pw]).then((r) => r[0].r);
  const inside = (x, y, [x1, y1, x2, y2]) => x > x1 && x < x2 && y > y1 && y < y2;

  // --- physics: same input, same path; one point per tick; balls never leave the field or stop in water
  const one = await sim(1, 110, 300, 0.3, 0.6);
  assert.deepEqual(await sim(1, 110, 300, 0.3, 0.6), one, "deterministic");
  assert.equal(one.path.length, Math.round((one.ms * 60) / 1000) + 1, "one path point per tick (plus the start)");
  let rolls = 0, wetRolls = 0;
  for (let h = 1; h <= 9; h++) {
    const co = await course(h);
    assert.equal(co.n, h);
    assert.ok(co.name.length > 0);
    assert.ok(!co.water.some((w) => inside(co.tee[0], co.tee[1], w)), `tee of hole ${h} is dry`);
    assert.ok(!co.water.some((w) => inside(co.cup.x, co.cup.y, w)), `cup of hole ${h} is dry`);
    for (let i = 0; i < 16; i++) {
      const r = await sim(h, co.tee[0], co.tee[1], (i / 16) * Math.PI * 2, 0.25 + (i % 4) * 0.25);
      rolls++;
      for (const [x, y] of r.path) assert.ok(x >= 11 && x <= 989 && y >= 11 && y <= 589, `inside field hole ${h} shot ${i}: ${x},${y}`);
      if (r.water) {
        wetRolls++;
        assert.deepEqual([r.x, r.y], co.tee, "back to where it was hit from");
        const [lx, ly] = r.path.at(-1);
        assert.ok(co.water.some(([x1, y1, x2, y2]) => inside(lx, ly, [x1 - 0.1, y1 - 0.1, x2 + 0.1, y2 + 0.1])), "the path ends in the water");
      } else assert.ok(!co.water.some((w) => inside(r.x, r.y, w)), "never rests in water");
    }
  }
  assert.equal(rolls, 144);
  assert.ok(wetRolls > 0, "some shots find water");
  // Hole 4: straight at the lake goes in the water.
  const lake = await sim(4, 300, 300, 0, 0.6);
  assert.equal(lake.water, true);
  assert.deepEqual([lake.x, lake.y], [300, 300]);
  // Sand slows: the same roll stops sooner when it starts in sand (hole 1 sand 640..790 x 400..540).
  const inSand = await sim(1, 650, 470, 0, 0.3);
  const onGrass = await sim(1, 650, 570, 0, 0.3);
  const reach = (r) => Math.max(...r.path.map(([x]) => x)) - 650;
  assert.ok(reach(inSand) < reach(onGrass) / 2, `sand roll ${reach(inSand)} px vs grass ${reach(onGrass)} px`);
  // Block on hole 1 (450..530 x 170..430): the straight shot never passes through it.
  const straight = await sim(1, 110, 300, 0, 1);
  assert.ok(straight.path.every(([x, y]) => !inside(x, y, [450, 170, 530, 430])), "never inside the block");
  // Slow roll into the cup from 60 px away drops in; a fast pass flies over it first.
  const near = await sim(1, 820, 300, 0, 0.12);
  assert.equal(near.holed, true, "slow ball drops in");
  assert.equal(near.x, 880);
  const fast = await sim(1, 820, 300, 0, 1);
  assert.ok(Math.max(...fast.path.map(([x]) => x)) > 900, "fast ball rolls over the cup");

  // --- lonely room / strangers / bad input
  await assert.rejects(start(c, 3), /Room unavailable/);
  await assert.rejects(asUser(a, "select public.start_golf($1,1)", [id]), /Invalid course/);
  await assert.rejects(asUser(a, "select public.start_golf($1,4)", [id]), /Invalid course/);
  assert.equal((await state(a)).game, null);
  await assert.rejects(state(c), /Room unavailable/);
  for (const t of ["golf_games", "golf_balls", "golf_shots", "golf_records"])
    await assert.rejects(asUser(a, `select * from public.${t}`), /permission denied/);

  // --- one game per room; start twice returns the same game
  const g1 = await start(a, 3);
  assert.equal(await start(b, 9), g1, "second start returns the open game");
  let s = await state(a);
  assert.equal(s.hole, 1);
  assert.equal(s.holes, 3);
  assert.deepEqual([s.me.x, s.me.y], [110, 300]);
  assert.deepEqual([s.partner.x, s.partner.y], [110, 300], "both balls at the tee");
  await assert.rejects(shoot(c, g1, 0, 0.5), /Room unavailable/);
  await assert.rejects(shoot(a, g1, 0, 0), /Invalid shot/);
  await assert.rejects(shoot(a, g1, 0, 1.5), /Invalid shot/);
  await assert.rejects(shoot(a, g1, NaN, 0.5), /Invalid shot/);

  // --- both shoot at the same time; each ball follows its own simulation (balls pass through each other)
  const shotId = randomUUID();
  const [ra, rb] = await Promise.all([shoot(a, g1, 0.5, 0.4, shotId), shoot(b, g1, -0.5, 0.4)]);
  assert.equal(ra.status, "ok");
  assert.equal(rb.status, "ok");
  assert.deepEqual(ra.path, (await sim(1, 110, 300, 0.5, 0.4)).path, "A's path equals a solo simulation");
  assert.deepEqual(rb.path, (await sim(1, 110, 300, -0.5, 0.4)).path, "B's path equals a solo simulation");
  assert.equal(ra.untilMs - ra.startedMs, ra.ms, "the shooter gets the replay clock back at once");
  // Resent shot id: same path and clock, no extra stroke.
  const dup = await shoot(a, g1, 0.5, 0.4, shotId);
  assert.equal(dup.status, "duplicate");
  assert.deepEqual(dup.path, ra.path);
  assert.equal(dup.startedMs, ra.startedMs);
  s = await state(a);
  assert.equal(s.me.strokes, 1);
  assert.equal(s.partner.strokes, 1);
  assert.equal(s.me.startedMs, ra.startedMs);
  await assert.rejects(shoot(a, g1, 0.1, 0.5), /Ball moving/);
  const sb = await state(b);
  assert.deepEqual(sb.partner.path, s.me.path);
  assert.deepEqual(sb.me.path, s.partner.path);

  // --- water costs one extra stroke and puts the ball back (hole 1 has no water: use hole 4 via a 3-hole game later)
  const put = async (game, who, x, y, strokes = 0) =>
    admin.query("update public.golf_balls set x=$3,y=$4,strokes=$5,holed=false,moving_until=clock_timestamp()-interval '1 second' where game_id=$1 and user_id=$2", [game, who, x, y, strokes]);

  // --- hole in one for both, then hole 2 after the replay finished; strokes carry into the total
  await put(g1, a, 820, 300);
  await put(g1, b, 820, 300, 2);
  assert.equal((await shoot(a, g1, 0, 0.12)).holed, true);
  await assert.rejects(shoot(a, g1, 0, 0.12), /Already in the cup|Ball moving/);
  assert.equal((await shoot(b, g1, 0, 0.12)).holed, true);
  assert.equal((await state(a)).hole, 1, "replay not finished: still hole 1");
  await admin.query("update public.golf_balls set moving_until=clock_timestamp()-interval '1 second' where game_id=$1", [g1]);
  s = await state(a);
  assert.equal(s.hole, 2);
  assert.equal(s.me.total, 1);
  assert.equal(s.partner.total, 3);
  assert.equal(s.me.strokes, 0);
  assert.deepEqual([s.me.x, s.me.y], (await course(2)).tee, "hole 2 tee");
  // Hole 2 water (400..560 x 480..600): roll into it from the right.
  await put(g1, a, 620, 540, 0);
  const splash = await shoot(a, g1, Math.PI, 0.5);
  assert.equal(splash.water, true);
  assert.equal(splash.n, 2, "1 stroke + 1 penalty");
  s = await state(a);
  assert.deepEqual([s.me.x, s.me.y], [620, 540], "back where it was hit from");
  assert.equal(s.me.water, true);
  // Finish holes 2 and 3 directly: mark both holed with their stroke counts.
  const endHole = async (game, sa, sb2) => {
    await admin.query("update public.golf_balls set strokes=$2,holed=true,moving_until=clock_timestamp()-interval '1 second' where game_id=$1 and user_id=$3", [game, sa, a]);
    await admin.query("update public.golf_balls set strokes=$2,holed=true,moving_until=clock_timestamp()-interval '1 second' where game_id=$1 and user_id=$3", [game, sb2, b]);
    return state(a);
  };
  s = await endHole(g1, 4, 5);
  assert.equal(s.hole, 3);
  assert.equal(s.me.water, false, "water mark cleared on the next hole");
  assert.equal(s.me.total, 5);
  s = await endHole(g1, 2, 2);
  assert.equal(s.status, "done");
  assert.deepEqual(s.best, { "3": 17 }, "1+3 + 4+5 + 2+2 = 17");
  await assert.rejects(shoot(a, g1, 0, 0.12), /Game over/);

  // --- 9 holes: totals carry over every hole; a worse 3-hole run keeps the record, a better one replaces it
  const g9 = await start(a, 9);
  for (let h = 1; h <= 9; h++) {
    s = await endHole(g9, 2, 3);
    if (h < 9) assert.equal(s.hole, h + 1);
  }
  assert.equal(s.status, "done");
  assert.equal(s.me.total, 18);
  assert.equal(s.partner.total, 27);
  assert.deepEqual(s.best, { "3": 17, "9": 45 });
  const g3b = await start(b, 3);
  for (let i = 0; i < 3; i++) await endHole(g3b, 9, 9);
  assert.equal((await state(a)).best["3"], 17, "worse run does not replace the record");
  const g3c = await start(a, 3);
  for (let i = 0; i < 3; i++) await endHole(g3c, 2, 2);
  assert.equal((await state(a)).best["3"], 12, "better run replaces it");

  // --- 10 strokes at most: the 10th stroke ends the hole even if it misses; water cannot push past 10
  const g6 = await start(a, 6);
  await put(g6, a, 300, 300, 9);
  const last = await shoot(a, g6, Math.PI, 0.3);
  assert.equal(last.holed, true, "10th stroke closes the hole");
  assert.equal((await state(a)).me.strokes, 10);

  // --- cancel: no record; strangers cannot cancel
  await asUser(a, "select public.cancel_golf($1)", [g6]);
  assert.equal((await state(a)).status, "cancelled");
  await assert.rejects(asUser(c, "select public.cancel_golf($1)", [g6]), /Room unavailable/);
  assert.equal((await state(a)).best["6"], undefined);

  // --- signals carry no coordinates
  const signals = (await admin.query("select payload from realtime.sent where topic=$1 and event='golf'", ["room:" + id])).rows;
  assert.ok(signals.length > 5);
  assert.ok(signals.every((x) => Object.keys(x.payload).join() === "change"));
});

test("guess bank: 40 games in a row use all 120 questions once, then they start over", async () => {
  const { a, id, token } = await fixture(),
    b = await user();
  await asUser(b, "select public.accept_couple_invite($1)", [token]);
  const seen = [];
  for (let i = 0; i < 40; i++) {
    const [{ g }] = await asUser(a, "select public.start_guess_game($1) as g", [id]);
    const { rows } = await admin.query("select questions from public.guess_games where id=$1", [g]);
    seen.push(...rows[0].questions);
    // Finish it a moment apart so the order of games is clear.
    await admin.query("update public.guess_games set finished_at=now(), created_at=now() - make_interval(secs => $2) where id=$1", [g, 1000 - i]);
  }
  assert.equal(seen.length, 120);
  assert.equal(new Set(seen).size, 120, "no question repeated within 40 games");
  assert.ok(seen.every((q) => q >= 0 && q <= 119));
  const [{ g }] = await asUser(a, "select public.start_guess_game($1) as g", [id]);
  const { rows } = await admin.query("select questions from public.guess_games where id=$1", [g]);
  assert.deepEqual([...rows[0].questions].sort((x, y) => x - y), [...seen.slice(0, 3)].sort((x, y) => x - y), "the 41st game reuses the oldest three");
});

test("member prefs: nicknames for each other, chat read position moves forward only, strangers refused", async () => {
  const { a, id, token } = await fixture(),
    b = await user(),
    c = await user();
  await asUser(b, "select public.accept_couple_invite($1)", [token]);
  const nick = async (who, n) => (await asUser(who, "select public.set_partner_nickname($1,$2) as n", [id, n]))[0].n;
  const read = async (who, upto) => Number((await asUser(who, "select public.mark_chat_read($1,$2) as r", [id, upto]))[0].r);
  const prefs = async (who) => asUser(who, "select user_id, partner_nickname, read_upto, read_at from public.member_prefs where room_id=$1 order by user_id", [id]);

  // Nicknames: trimmed, 20 characters at most, empty clears; each sets their own row only.
  assert.equal(await nick(a, "  곰돌이  "), "곰돌이");
  assert.equal(await nick(b, "자기"), "자기");
  await assert.rejects(nick(a, "가".repeat(21)), /Invalid nickname/);
  await assert.rejects(nick(a, "줄\n바꿈"), /Invalid nickname/);
  let rows = await prefs(b);
  assert.equal(rows.length, 2, "both partners see both rows");
  assert.equal(rows.find((r) => r.user_id === a).partner_nickname, "곰돌이", "B sees what A calls B");
  assert.equal(await nick(a, "   "), null, "empty clears");
  assert.equal((await prefs(a)).find((r) => r.user_id === a).partner_nickname, null);
  await assert.rejects(asUser(a, "update public.member_prefs set partner_nickname='x'"), /permission denied/);
  await assert.rejects(asUser(a, "insert into public.member_prefs(room_id,user_id) values($1,$2)", [id, a]), /permission denied/);

  // Read position: never past the newest message, never backwards.
  const send = async (who, text) => Number((await asUser(who, "select public.send_room_message($1,$2,$3) as m", [id, randomUUID(), text]))[0].m);
  const m1 = await send(a, "안녕");
  const m2 = await send(a, "보고 싶어");
  assert.equal(await read(b, m1), m1);
  rows = await prefs(a);
  const bRow = rows.find((r) => r.user_id === b);
  assert.equal(Number(bRow.read_upto), m1, "A sees how far B has read");
  assert.ok(bRow.read_at, "with the time");
  assert.equal(await read(b, m2 + 999), m2, "capped at the newest message");
  assert.equal(await read(b, m1), m2, "never backwards");
  await assert.rejects(read(b, -1), /Invalid position/);

  // Strangers: no rows, no writes; signals carry no names.
  assert.deepEqual(await asUser(c, "select * from public.member_prefs"), []);
  await assert.rejects(nick(c, "x"), /Room unavailable/);
  await assert.rejects(read(c, 1), /Room unavailable/);
  const signals = (await admin.query("select payload from realtime.sent where topic=$1 and event='prefs'", ["room:" + id])).rows;
  assert.ok(signals.length >= 3);
  assert.ok(signals.every((x) => Object.keys(x.payload).join() === "change"));
  assert.ok(!JSON.stringify(signals).includes("곰돌이"));
  // Leaving the room: the prefs go with it.
  await asUser(a, "select public.leave_couple_room($1)", [id]);
  assert.equal((await admin.query("select count(*)::int n from public.member_prefs where room_id=$1", [id])).rows[0].n, 2, "kept with the closed room until it is deleted");
  await assert.rejects(nick(b, "x"), /Room unavailable/);
});

test("draw quiz in English: every word has an English name, the guesser may answer in either language, and still never sees it", async () => {
  const { a, id, token } = await fixture(),
    b = await user();
  await asUser(b, "select public.accept_couple_invite($1)", [token]);
  const missing = (await admin.query("select count(*)::int n from duri_private.draw_word_bank where word_en is null or word_en = '' or word_en ~ '[가-힣]'")).rows[0].n;
  assert.equal(missing, 0, "all 300 words have an English name");
  const [{ g }] = await asUser(a, "select public.start_draw_game($1,'animal',true) as g", [id]);
  await asUser(a, "select public.ready_draw_game($1)", [g]);
  await asUser(b, "select public.ready_draw_game($1)", [g]);
  const cur = async () => (await admin.query("select w.word, w.word_en, w.alts_en from duri_private.draw_words w join public.draw_games d on d.id=w.game_id and w.n=d.word_no where d.id=$1", [g])).rows[0];
  const guess = async (text) => (await asUser(b, "select public.guess_draw($1,$2) as r", [g, text]))[0].r;
  const w1 = await cur();
  const sa = (await asUser(a, "select public.draw_state($1) as s", [id]))[0].s;
  assert.equal(sa.word, w1.word);
  assert.equal(sa.wordEn, w1.word_en, "the drawer gets both, the screen shows its own language");
  const sb = (await asUser(b, "select public.draw_state($1) as s", [id]))[0].s;
  assert.equal(sb.wordEn, null);
  assert.ok(!JSON.stringify(sb).toLowerCase().includes(w1.word_en.toLowerCase()), "the guesser gets no English word either");
  // English answer, any case and spacing.
  assert.equal(await guess("  " + w1.word_en.toUpperCase() + " "), "correct");
  const w2 = await cur();
  assert.equal(await guess(w2.word), "correct", "Korean still works");
  const s2 = (await asUser(b, "select public.draw_state($1) as s", [id]))[0].s;
  assert.deepEqual(s2.words.map((w) => w.wordEn), [w1.word_en, w2.word_en], "past words come in both languages");
});

test("golf: the browser's instant prediction matches the database's roll", async () => {
  const { simulateShot } = await import("../../src/core/golf-physics.ts");
  let same = 0, total = 0, worst = 0;
  for (let h = 1; h <= 9; h++) {
    const course = (await admin.query("select duri_private.golf_course($1) as c", [h])).rows[0].c;
    for (let i = 0; i < 30; i++) {
      const ang = (i / 30) * Math.PI * 2 + h * 0.01, pw = 0.1 + (i % 9) * 0.1;
      const db = (await admin.query("select duri_private.golf_simulate($1,$2,$3,$4,$5) as r", [h, course.tee[0], course.tee[1], ang, pw])).rows[0].r;
      const js = simulateShot(course, course.tee[0], course.tee[1], ang, pw);
      total++;
      if (JSON.stringify(js.path) === JSON.stringify(db.path) && js.holed === db.holed && js.water === db.water && js.ms === db.ms) same++;
      worst = Math.max(worst, Math.hypot(js.x - db.x, js.y - db.y));
    }
  }
  console.log(`PREDICT ${same}/${total} identical, worst end distance ${worst.toFixed(3)} px`);
  assert.equal(same, total, `${same}/${total} identical`);
});

test("watch together: YouTube, Vimeo and https video files; everything else is refused", async () => {
  const { a, id, token } = await fixture(),
    b = await user();
  await asUser(b, "select public.accept_couple_invite($1)", [token]);
  const parse = async (link) => (await admin.query("select * from duri_private.parse_video($1)", [link])).rows[0];
  assert.deepEqual(await parse("https://youtu.be/dQw4w9WgXcQ?t=40"), { source: "youtube", ref: "dQw4w9WgXcQ" });
  assert.deepEqual(await parse("https://vimeo.com/76979871"), { source: "vimeo", ref: "76979871" });
  assert.deepEqual(await parse("https://vimeo.com/123456789/AbCdEf1234"), { source: "vimeo", ref: "123456789:abcdef1234" });
  assert.deepEqual(await parse("https://player.vimeo.com/video/123456789?h=abcdef12&autoplay=1"), { source: "vimeo", ref: "123456789:abcdef12" });
  assert.deepEqual(await parse("https://example.com/clips/our trip.mp4"), { source: null, ref: null }, "spaces are refused");
  assert.deepEqual(await parse("https://cdn.example.com/clips/trip.MP4?sig=abc"), { source: "file", ref: "https://cdn.example.com/clips/trip.MP4?sig=abc" });
  assert.deepEqual(await parse("https://example.com/video.webm"), { source: "file", ref: "https://example.com/video.webm" });
  for (const bad of ["http://example.com/a.mp4", "https://example.com/a.exe", "javascript:alert(1)//a.mp4", "https://evil.com/\"><script>.mp4", "https://www.netflix.com/watch/123", ""])
    assert.equal((await parse(bad)).ref, null, bad);

  const state = async (who) => (await asUser(who, "select public.watch_state($1) as s", [id]))[0].s;
  await asUser(a, "select public.watch_set_video($1,$2)", [id, "https://vimeo.com/76979871"]);
  let s = await state(b);
  assert.deepEqual([s.source, s.videoId, s.playing], ["vimeo", "76979871", false]);
  await asUser(a, "select public.watch_set_video($1,$2)", [id, "https://example.com/video.webm"]);
  s = await state(b);
  assert.deepEqual([s.source, s.videoId], ["file", "https://example.com/video.webm"]);
  await asUser(b, "select public.watch_set_video($1,$2)", [id, "https://youtu.be/dQw4w9WgXcQ"]);
  s = await state(a);
  assert.deepEqual([s.source, s.videoId], ["youtube", "dQw4w9WgXcQ"]);
  await assert.rejects(asUser(a, "select public.watch_set_video($1,$2)", [id, "https://www.netflix.com/watch/123"]), /Invalid video link/);
  // The table itself refuses a bad combination even from the server key.
  await assert.rejects(admin.query("update public.watch_sessions set source='file', video_id='http://x.mp4' where room_id=$1", [id]), /watch_sessions_video_check/);
});
