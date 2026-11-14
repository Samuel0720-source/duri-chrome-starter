import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { guessQuestions, GUESS_BANK_SIZE } from "../../src/core/guess.ts";

test("the bank matches what the database picks from: 120 different questions of 4 options", async () => {
  assert.equal(guessQuestions.length, GUESS_BANK_SIZE);
  assert.equal(GUESS_BANK_SIZE, 120);
  assert.equal(new Set(guessQuestions.map((x) => x.q)).size, 120, "no duplicate questions");
  for (const item of guessQuestions) assert.equal(new Set(item.options).size, 4, item.q);
  for (const item of guessQuestions) assert.equal(item.options.length, 4, item.q);
  const sql = await readFile(new URL("../../supabase/migrations/202611110004_guess_game.sql", import.meta.url), "utf8");
  assert.match(sql, /generate_series\(0, 11\)/);
  assert.match(sql, /own_choice between 0 and 3/);
});

test("the English bank lines up with the Korean one", async () => {
  const { guessQuestionsEn } = await import("../../src/core/guess-en.ts");
  assert.equal(guessQuestionsEn.length, guessQuestions.length);
  for (const item of guessQuestionsEn) {
    assert.equal(item.options.length, 4, item.q);
    assert.equal(new Set(item.options).size, 4, item.q);
    assert.ok(!/[가-힣]/.test(item.q + item.options.join("")), item.q);
  }
  assert.equal(new Set(guessQuestionsEn.map((x) => x.q)).size, 120);
});
