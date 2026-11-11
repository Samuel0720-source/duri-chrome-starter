import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { guessQuestions } from "../../src/core/guess.ts";

test("the bank matches what the database picks from: 12 questions of 4 options", async () => {
  assert.equal(guessQuestions.length, 12);
  for (const item of guessQuestions) assert.equal(item.options.length, 4, item.q);
  const sql = await readFile(new URL("../../supabase/migrations/202611110004_guess_game.sql", import.meta.url), "utf8");
  assert.match(sql, /generate_series\(0, 11\)/);
  assert.match(sql, /own_choice between 0 and 3/);
});
