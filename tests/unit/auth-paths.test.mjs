import test from "node:test";
import assert from "node:assert/strict";
import { authErrorKey, invitePath, isEmail, isInviteToken, passwordProblem, roomErrorKey, safeNext } from "../../src/core/auth-paths.ts";
import { makeT } from "../../src/i18n/dict.ts";
const ko = makeT("ko");
const en = makeT("en");
const roomErrorMessage = (m) => ko(roomErrorKey(m));

test("sign-in only returns to a path on this site", () => {
  assert.equal(safeNext("/invite/abc"), "/invite/abc");
  for (const bad of [null, undefined, "", "https://evil.example", "//evil.example", "/\\evil.example", "room"]) {
    assert.equal(safeNext(bad), "/room");
  }
});

test("invite tokens are exactly 64 lowercase hex characters", () => {
  const token = "a".repeat(32) + "0123456789abcdef0123456789abcdef";
  assert.equal(isInviteToken(token), true);
  assert.equal(invitePath(token), "/invite/" + token);
  for (const bad of ["", "A".repeat(64), "a".repeat(63), "a".repeat(65), "../" + "a".repeat(61)]) {
    assert.equal(isInviteToken(bad), false);
  }
});

test("emails are checked loosely and database errors become a dictionary key, shown in either language", () => {
  assert.equal(isEmail("sam@example.com"), true);
  assert.equal(isEmail("sam@example"), false);
  assert.equal(isEmail("a b@example.com"), false);
  assert.match(roomErrorMessage("Room full"), /두 사람/);
  assert.match(roomErrorMessage("Invite unavailable"), /새 초대/);
  assert.match(roomErrorMessage('duplicate key value violates unique constraint "couple_members_pkey"'), /다른 방/);
  assert.doesNotMatch(roomErrorMessage("internal: relation secret_table"), /secret_table/);
  assert.match(roomErrorMessage("Invalid plan"), /1~60자/);
  assert.match(roomErrorMessage("Plan unavailable"), /약속/);
  assert.equal(roomErrorKey("Ball moving"), "err.ballMoving");
  assert.equal(roomErrorKey("Bridge token unavailable"), "err.bridgeToken");
  assert.equal(roomErrorKey("internal: relation secret_table"), "err.unknown");
  assert.match(en(roomErrorKey("Room full")), /two people/);
  assert.match(en(roomErrorKey("Invalid nickname")), /1-20 characters/);
});

test("passwords: 8 characters or more, at most 72 bytes (bcrypt reads no further)", () => {
  assert.equal(passwordProblem("1234567"), "short");
  assert.equal(passwordProblem("12345678"), null);
  assert.equal(passwordProblem("a".repeat(72)), null);
  assert.equal(passwordProblem("a".repeat(73)), "long");
  assert.equal(passwordProblem("비밀번호".repeat(7)), "long"); // 28 characters, 84 bytes
});

test("sign-in errors become dictionary keys, never raw messages", () => {
  assert.equal(authErrorKey("Invalid login credentials"), "login.err.wrong");
  assert.equal(authErrorKey("Email not confirmed"), "login.err.unconfirmed");
  assert.equal(authErrorKey("email rate limit exceeded"), "login.err.rate");
  assert.equal(authErrorKey("Password should be at least 8 characters."), "login.err.weak");
  assert.equal(authErrorKey(undefined), "login.err.try");
});
