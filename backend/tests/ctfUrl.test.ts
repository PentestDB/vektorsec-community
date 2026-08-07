import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeCtfdUrl } from "../src/services/ctf.service";

test("strips CTFd page routes people copy from the address bar", () => {
  assert.equal(
    normalizeCtfdUrl("https://ctf.cloud-village.org/challenges"),
    "https://ctf.cloud-village.org",
  );
  assert.equal(normalizeCtfdUrl("https://ctf.example.com/scoreboard"), "https://ctf.example.com");
  assert.equal(normalizeCtfdUrl("https://ctf.example.com/teams"), "https://ctf.example.com");
  assert.equal(normalizeCtfdUrl("https://ctf.example.com/login"), "https://ctf.example.com");
  // Case-insensitive, and handles a trailing slash on the page route.
  assert.equal(normalizeCtfdUrl("https://ctf.example.com/Challenges/"), "https://ctf.example.com");
});

test("preserves CTFd instances hosted under a sub-path", () => {
  assert.equal(normalizeCtfdUrl("https://example.com/ctf"), "https://example.com/ctf");
  assert.equal(normalizeCtfdUrl("https://example.com/ctf/challenges"), "https://example.com/ctf");
  assert.equal(
    normalizeCtfdUrl("https://example.com/events/finals/scoreboard"),
    "https://example.com/events/finals",
  );
});

test("normalises scheme, trailing slashes, query and hash", () => {
  assert.equal(normalizeCtfdUrl("ctf.example.com"), "https://ctf.example.com");
  assert.equal(normalizeCtfdUrl("  https://ctf.example.com///  "), "https://ctf.example.com");
  assert.equal(
    normalizeCtfdUrl("https://ctf.example.com/challenges?page=2#top"),
    "https://ctf.example.com",
  );
  assert.equal(normalizeCtfdUrl("http://localhost:8000/challenges"), "http://localhost:8000");
});

test("leaves an already-correct root untouched and handles empty input", () => {
  assert.equal(normalizeCtfdUrl("https://ctf.example.com"), "https://ctf.example.com");
  assert.equal(normalizeCtfdUrl(""), "");
  assert.equal(normalizeCtfdUrl("   "), "");
});
