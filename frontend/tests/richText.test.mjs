import assert from "node:assert/strict";
import { test } from "node:test";

import { parseRichText } from "../src/utils/richText.js";

test("plain text becomes a single text token", () => {
  assert.deepEqual(parseRichText("run the tool"), [
    { type: "text", value: "run the tool" },
  ]);
});

test("backticks become code tokens and keep the surrounding text", () => {
  assert.deepEqual(parseRichText("run `ls -la` now"), [
    { type: "text", value: "run " },
    { type: "code", value: "ls -la" },
    { type: "text", value: " now" },
  ]);
  assert.deepEqual(parseRichText("`7443` is the default port"), [
    { type: "code", value: "7443" },
    { type: "text", value: " is the default port" },
  ]);
});

test("double asterisks become strong tokens", () => {
  assert.deepEqual(parseRichText("**Operations → API Tokens** and create one"), [
    { type: "strong", value: "Operations → API Tokens" },
    { type: "text", value: " and create one" },
  ]);
});

test("code and strong can be mixed in one sentence", () => {
  assert.deepEqual(parseRichText("set `url` in **Settings** first"), [
    { type: "text", value: "set " },
    { type: "code", value: "url" },
    { type: "text", value: " in " },
    { type: "strong", value: "Settings" },
    { type: "text", value: " first" },
  ]);
});

test("unbalanced or empty markup stays literal", () => {
  assert.deepEqual(parseRichText("half `open"), [
    { type: "text", value: "half `open" },
  ]);
  assert.deepEqual(parseRichText("**"), [{ type: "text", value: "**" }]);
  assert.deepEqual(parseRichText(""), []);
  assert.deepEqual(parseRichText(undefined), []);
  assert.deepEqual(parseRichText(null), []);
});

test("markup inside Thai text is preserved", () => {
  assert.deepEqual(parseRichText("ตั้งค่า `0.0.0.0:8096` ที่นี่"), [
    { type: "text", value: "ตั้งค่า " },
    { type: "code", value: "0.0.0.0:8096" },
    { type: "text", value: " ที่นี่" },
  ]);
});
