import test from "node:test";
import assert from "node:assert/strict";
import { fill, hasBatchim, josa, pickLocale } from "../../src/i18n/core.ts";
import { ko } from "../../src/i18n/messages/ko.ts";
import { en } from "../../src/i18n/messages/en.ts";

test("Korean particles follow the nickname's last letter", () => {
  assert.equal(hasBatchim("민준"), true);
  assert.equal(hasBatchim("지수"), false);
  assert.equal(hasBatchim("Sam"), null);
  assert.equal(fill("{name}{이/가} 골랐어요", { name: "민준" }), "민준이 골랐어요");
  assert.equal(fill("{name}{이/가} 골랐어요", { name: "자기" }), "자기가 골랐어요");
  assert.equal(fill("{name}{이}는 이걸 골랐어요", { name: "민준" }), "민준이는 이걸 골랐어요");
  assert.equal(fill("{name}{이}는 이걸 골랐어요", { name: "여보" }), "여보는 이걸 골랐어요");
  assert.equal(fill("{name}{을/를} 기다려요", { name: "Sam" }), "Sam을(를) 기다려요");
  assert.equal(josa("곰돌이", "은/는"), "는");
  assert.equal(fill("{n}개", { n: 3 }), "3개");
  assert.equal(fill("{missing} 그대로"), "{missing} 그대로");
});

test("language choice: cookie first, then the browser, Korean only for Korean browsers", () => {
  assert.equal(pickLocale("en", "ko-KR"), "en");
  assert.equal(pickLocale(undefined, "ko-KR,ko;q=0.9"), "ko");
  assert.equal(pickLocale(undefined, "en-CA,en;q=0.9,ko;q=0.8"), "en");
  assert.equal(pickLocale(undefined, "fr-FR"), "en", "no French yet: English");
  assert.equal(pickLocale(undefined, "ja-JP,ko;q=0.8"), "en", "only the main language counts");
  assert.equal(pickLocale(undefined, " ko ;q=1"), "ko");
  assert.equal(pickLocale("xx", ""), "en", "no information: English");
});

test("every Korean sentence has an English one, with the same placeholders", () => {
  const keysKo = Object.keys(ko).sort();
  assert.deepEqual(Object.keys(en).sort(), keysKo);
  const holes = (s) => (s.match(/\{[a-zA-Z]+\}|<\w+>/g) ?? []).sort().join();
  for (const k of keysKo) {
    assert.ok(en[k].length > 0, k);
    assert.equal(holes(en[k]), holes(ko[k]), "placeholders differ in " + k);
    assert.ok(!/[가-힣]/.test(en[k]), "Korean left in English text: " + k);
  }
});
