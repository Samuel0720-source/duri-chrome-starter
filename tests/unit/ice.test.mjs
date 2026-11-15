import { test } from "node:test";
import assert from "node:assert/strict";
import { STUN_ONLY, cloudflareIce, isIceList, routeOf } from "../../src/core/ice.ts";

test("Cloudflare relay credentials: keep stun/turn URLs, drop port 53 (browsers block it), require credentials", () => {
  const body = { iceServers: { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53", "turn:turn.cloudflare.com:3478?transport=udp", "turn:turn.cloudflare.com:53?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp", "https://evil.example"], username: "1700000000:duri", credential: "abc=" } };
  assert.deepEqual(cloudflareIce(body), [{ urls: ["stun:stun.cloudflare.com:3478", "turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"], username: "1700000000:duri", credential: "abc=" }]);
  assert.equal(cloudflareIce({ iceServers: { urls: ["stun:x:3478"] } }), null); // no relay credentials
  assert.equal(cloudflareIce(null), null);
  assert.equal(cloudflareIce({ error: "bad key" }), null);
});

test("the call page accepts only a short list of server entries", () => {
  assert.equal(isIceList(STUN_ONLY), true);
  assert.equal(isIceList([]), false);
  assert.equal(isIceList([{ urls: 5 }]), false);
  assert.equal(isIceList("stun:x"), false);
  assert.equal(routeOf("relay"), "relay");
  assert.equal(routeOf("host"), "direct");
  assert.equal(routeOf(undefined), "direct");
});
