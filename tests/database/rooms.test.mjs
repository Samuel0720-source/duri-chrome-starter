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
  admin = await pool.connect();
  await admin.query(`create role authenticated nologin; create role anon nologin;
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
