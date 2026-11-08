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
    grant usage on schema auth to authenticated,anon;`);
  await admin.query(
    await readFile(
      new URL(
        "../../supabase/migrations/202611070001_rooms.sql",
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
