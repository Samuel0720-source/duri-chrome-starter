import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseYouTube, parseVideo, videoPage, targetPosition, classifyRevision, shouldCheckDrift, formatClock, playerErrorKey } from "../../src/core/watch.ts";
import { shouldCorrectDrift } from "../../src/core/playback.ts";

const VID = "dQw4w9WgXcQ";

test("links: the same ones the database accepts give the id, the rest give null", () => {
  for (const ok of [
    "https://www.youtube.com/watch?v=" + VID,
    "https://youtube.com/watch?feature=share&v=" + VID + "&t=30s",
    "https://m.youtube.com/watch?v=" + VID,
    "https://youtu.be/" + VID + "?si=abc",
    "https://www.youtube.com/shorts/" + VID,
    "https://www.youtube.com/embed/" + VID,
    "  https://youtu.be/" + VID + "  ",
  ]) assert.equal(parseYouTube(ok), VID, ok);
  for (const bad of ["", "hello", "https://evil.com/watch?v=" + VID, "https://youtube.com.evil.com/watch?v=" + VID,
    "https://www.youtube.com/watch?v=short", "https://www.youtube.com/watch?v=" + VID + "x", "javascript:alert(1)"])
    assert.equal(parseYouTube(bad), null, bad);
});

test("the browser parser and the database parser keep the same host list", async () => {
  const sql = await readFile(new URL("../../supabase/migrations/202611120002_watch_together.sql", import.meta.url), "utf8");
  for (const host of ["youtube\\.com", "youtu\\.be", "youtube-nocookie\\.com", "embed/", "shorts/", "live/"]) assert.ok(sql.includes(host), host);
});

test("target position: playing moves with the database clock (device clock offset removed), paused stands still", () => {
  const playing = { positionSec: 10, refMs: 1_000_000, playing: true };
  assert.equal(targetPosition(playing, 5_000, 995_000), 10, "same instant");
  assert.equal(targetPosition(playing, 5_000, 998_000), 13, "3 s later by the database clock");
  assert.equal(targetPosition(playing, 0, 1_000_000), 10, "device clock is far off but offset fixes it");
  assert.equal(targetPosition(playing, 0, 900_000), 10, "a reference in the future never goes backwards");
  assert.equal(targetPosition({ positionSec: 42, refMs: 1, playing: false }, 9_999_999, 0), 42);
});

test("revisions: stale and own events are ignored, partner events apply", () => {
  const mine = new Set([7]);
  assert.equal(classifyRevision(5, 5, "partner", mine), "stale");
  assert.equal(classifyRevision(4, 5, null, mine), "stale");
  assert.equal(classifyRevision(7, 6, "partner", mine), "own", "my command came back");
  assert.equal(classifyRevision(8, 7, "me", mine), "own", "the signal beat my own reply");
  assert.equal(classifyRevision(8, 7, "partner", mine), "apply");
  assert.equal(classifyRevision(9, 8, null, mine), "apply", "system changes (auto start, freeze) apply");
});

test("drift rule: more than 1.0 s and at least 3 s since the last correction; exactly 1.0 keeps", () => {
  assert.equal(shouldCorrectDrift(11, 10, 9000), false, "exactly 1.0 s keeps");
  assert.equal(shouldCorrectDrift(11.01, 10, 9000), true);
  assert.equal(shouldCorrectDrift(20, 10, 2999), false, "cool-down");
  assert.equal(shouldCorrectDrift(20, 10, 3000), true);
  assert.equal(shouldCorrectDrift(NaN, 10, 9000), false);
});

test("periodic check runs only while both are here, ready, playing and not buffering", () => {
  const all = { playing: true, meReady: true, partnerReady: true, partnerHere: true };
  assert.equal(shouldCheckDrift(all, false), true);
  assert.equal(shouldCheckDrift(all, true), false, "buffering");
  for (const k of Object.keys(all)) assert.equal(shouldCheckDrift({ ...all, [k]: false }, false), false, k);
});

test("clock text and error messages", () => {
  assert.equal(formatClock(0), "0:00");
  assert.equal(formatClock(65.9), "1:05");
  assert.equal(formatClock(3725), "1:02:05");
  assert.equal(formatClock(-3), "0:00");
  assert.equal(playerErrorKey(150), "watch.err.embed");
  assert.equal(playerErrorKey(101), "watch.err.embed");
  assert.equal(playerErrorKey(100), "watch.err.gone");
  assert.equal(playerErrorKey(5), "watch.err.load");
});

test("other video links: Vimeo (with the unlisted hash) and https video files, the same rules as the database", () => {
  assert.deepEqual(parseVideo("https://youtu.be/dQw4w9WgXcQ"), { source: "youtube", ref: "dQw4w9WgXcQ" });
  assert.deepEqual(parseVideo("https://vimeo.com/76979871"), { source: "vimeo", ref: "76979871" });
  assert.deepEqual(parseVideo("https://vimeo.com/123456789/AbCdEf1234"), { source: "vimeo", ref: "123456789:abcdef1234" });
  assert.deepEqual(parseVideo("https://player.vimeo.com/video/123456789?h=abcdef12&autoplay=1"), { source: "vimeo", ref: "123456789:abcdef12" });
  assert.deepEqual(parseVideo("https://cdn.example.com/clips/trip.MP4?sig=abc"), { source: "file", ref: "https://cdn.example.com/clips/trip.MP4?sig=abc" });
  for (const bad of ["http://example.com/a.mp4", "https://example.com/a.exe", "https://example.com/our trip.mp4", "https://www.netflix.com/watch/123", ""]) {
    assert.equal(parseVideo(bad), null, bad);
  }
  assert.equal(videoPage("vimeo", "123456789:abcdef12"), "https://vimeo.com/123456789");
  assert.equal(videoPage("youtube", "dQw4w9WgXcQ"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
});
