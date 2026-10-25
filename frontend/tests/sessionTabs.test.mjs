/**
 * Unit tests for the session tab helpers (`src/utils/sessionTabs.js`).
 *
 * These are pure functions, so they run on plain Node (no build step, no deps):
 *   cd frontend && node --test tests/
 *
 * Regression focus: opening a secondary tab must (a) never mutate the redux
 * array it was given, (b) deactivate every other tab, and (c) return `null`
 * once the tab is already active. The last point is what stops the
 * `useRegisterSessionTab` effect from dispatching forever, which is the bug
 * the helper was extracted to fix.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  SESSION_TAB_TYPES,
  activateSessionTab,
  buildSessionTabs,
  closeSessionTab,
  normalizeSessionTabs,
  sessionTabId,
} from "../src/utils/sessionTabs.js";

const SESSION_ID = "3f0c8b1e-1c2a-4d5e-9f00-abc123456789";

/** A workspace holding the main chat plus one open (inactive) GUI tab. */
const initialSessions = () => [
  { id: SESSION_ID, is_main: true, is_active: true, type: "session" },
  { id: `${SESSION_ID}/gui`, is_main: false, is_active: false, type: "gui" },
];

test("sessionTabId joins the session id and the tab type", () => {
  assert.equal(sessionTabId(SESSION_ID, "burp"), `${SESSION_ID}/burp`);
});

test("opening a new tab appends it and deactivates the others", () => {
  const sessions = initialSessions();
  const next = buildSessionTabs(sessions, SESSION_ID, "vpn");

  assert.equal(next.length, 3);
  assert.deepEqual(next.at(-1), {
    id: `${SESSION_ID}/vpn`,
    is_main: false,
    is_active: true,
    type: "vpn",
  });
  assert.equal(next.filter((s) => s.is_active).length, 1, "only one tab is active");
});

test("re-opening the active tab is a no-op", () => {
  const sessions = [
    { id: SESSION_ID, is_main: true, is_active: false, type: "session" },
    { id: `${SESSION_ID}/burp`, is_main: false, is_active: true, type: "burp" },
  ];

  assert.equal(buildSessionTabs(sessions, SESSION_ID, "burp"), null);
});

test("re-opening an inactive tab just moves the active flag", () => {
  const sessions = initialSessions();
  const next = buildSessionTabs(sessions, SESSION_ID, "gui");

  assert.equal(next.length, 2, "no duplicate tab is appended");
  assert.equal(next.filter((s) => s.is_active).length, 1);
  assert.equal(
    next.find((s) => s.type === "gui").is_active,
    true,
    "the GUI tab becomes active"
  );
  assert.equal(
    next.find((s) => s.is_main).is_active,
    false,
    "the main chat tab is deactivated"
  );
});

test("the input array and its entries are never mutated", () => {
  const sessions = initialSessions();
  const snapshot = JSON.parse(JSON.stringify(sessions));

  buildSessionTabs(sessions, SESSION_ID, "mythic");

  assert.deepEqual(sessions, snapshot, "redux state must stay immutable");
});

test("registering twice in a row converges (effect cannot loop)", () => {
  let sessions = initialSessions();

  const first = buildSessionTabs(sessions, SESSION_ID, "caido");
  assert.notEqual(first, null, "first render registers the tab");
  sessions = first;

  const second = buildSessionTabs(sessions, SESSION_ID, "caido");
  assert.equal(second, null, "second render dispatches nothing");
});

test("invalid input returns null instead of a broken session entry", () => {
  const sessions = initialSessions();

  assert.equal(buildSessionTabs(sessions, "", "vpn"), null);
  assert.equal(buildSessionTabs(sessions, SESSION_ID, ""), null);
  assert.equal(buildSessionTabs(undefined, SESSION_ID, "vpn"), null);
  assert.equal(buildSessionTabs(null, SESSION_ID, "vpn"), null);
});

test("handles an empty session list (page mounted before sessions load)", () => {
  const next = buildSessionTabs([], SESSION_ID, "browser-agent");

  assert.deepEqual(next, [
    {
      id: `${SESSION_ID}/browser-agent`,
      is_main: false,
      is_active: true,
      type: "browser-agent",
    },
  ]);
});

test("every secondary route in the app has a tab type", () => {

  // Keep in sync with src/app/session/[session_id]/* and the sidebar handlers.
  assert.deepEqual(SESSION_TAB_TYPES, [
    "vpn",
    "gui",
    "burp",
    "caido",
    "mythic",
    "browser-agent",
  ]);
});

test("all six tab types can be opened one after another", () => {
  let sessions = [
    { id: SESSION_ID, is_main: true, is_active: true, type: "session" },
  ];

  for (const type of SESSION_TAB_TYPES) {
    const next = buildSessionTabs(sessions, SESSION_ID, type);
    assert.notEqual(next, null, `${type} should register`);
    sessions = next;

    assert.equal(
      sessions.filter((s) => s.is_active).length,
      1,
      `${type}: exactly one active tab`
    );
    assert.equal(
      sessions.find((s) => s.id === `${SESSION_ID}/${type}`).is_active,
      true,
      `${type}: newest tab wins`
    );
  }

  // The main chat plus one tab per type — no duplicates.
  assert.equal(sessions.length, SESSION_TAB_TYPES.length + 1);

  // The tab opened last is already active, so re-registering it does nothing.
  assert.equal(
    buildSessionTabs(sessions, SESSION_ID, SESSION_TAB_TYPES.at(-1)),
    null
  );
});

// ── normalizeSessionTabs: redux `updateSessions` ────────────────────────────

test("normalizeSessionTabs keeps a single active tab", () => {
  const next = normalizeSessionTabs([
    { id: SESSION_ID, is_main: true, is_active: false, type: "session" },
    { id: `${SESSION_ID}/gui`, is_main: false, is_active: false, type: "gui" },
  ]);

  assert.equal(next.filter((s) => s.is_active).length, 1);
  assert.equal(next.find((s) => s.is_main).is_active, true, "the main chat wins");
});

test("normalizeSessionTabs accepts an empty or malformed payload", () => {
  // All engagements archived → the API returns [] and this must not crash.
  assert.deepEqual(normalizeSessionTabs([]), []);
  assert.deepEqual(normalizeSessionTabs(null), []);
  assert.deepEqual(normalizeSessionTabs(undefined), []);
  assert.deepEqual(normalizeSessionTabs("nope"), []);
});

test("normalizeSessionTabs never mutates the payload it was given", () => {
  const payload = [
    { id: SESSION_ID, is_main: true, is_active: false, type: "session" },
  ];
  const snapshot = JSON.parse(JSON.stringify(payload));

  normalizeSessionTabs(payload);

  assert.deepEqual(payload, snapshot, "the store must copy before activating");
});

// ── activateSessionTab: redux `updateCurrentSession` ───────────────────────

test("activateSessionTab moves the active flag and tolerates empty state", () => {
  const next = activateSessionTab(initialSessions(), `${SESSION_ID}/gui`);

  assert.equal(next.find((s) => s.id === `${SESSION_ID}/gui`).is_active, true);
  assert.equal(next.filter((s) => s.is_active).length, 1);

  assert.deepEqual(activateSessionTab([], SESSION_ID), []);
  assert.deepEqual(activateSessionTab(null, SESSION_ID), []);

  const unknown = activateSessionTab(initialSessions(), "missing");
  assert.equal(unknown.filter((s) => s.is_active).length, 0);
});

// ── closeSessionTab: redux `closeSession` ──────────────────────────────────

test("closeSessionTab returns an empty list when the last tab is closed", () => {
  const tab = { id: SESSION_ID, is_main: true, is_active: true, type: "session" };

  assert.deepEqual(closeSessionTab([tab], SESSION_ID), []);
});

test("closing the active tab falls back to the main chat, then the first tab", () => {
  const sessions = [
    { id: SESSION_ID, is_main: true, is_active: false, type: "session" },
    { id: `${SESSION_ID}/gui`, is_main: false, is_active: true, type: "gui" },
  ];

  const mainFallback = closeSessionTab(sessions, `${SESSION_ID}/gui`);
  assert.deepEqual(mainFallback.map((s) => s.id), [SESSION_ID]);
  assert.equal(mainFallback[0].is_active, true);

  // No main chat left → the first remaining tab takes over.
  const noMain = closeSessionTab(
    [
      { id: `${SESSION_ID}/burp`, is_main: false, is_active: true, type: "burp" },
      { id: `${SESSION_ID}/vpn`, is_main: false, is_active: false, type: "vpn" },
    ],
    `${SESSION_ID}/burp`
  );
  assert.deepEqual(noMain.map((s) => s.id), [`${SESSION_ID}/vpn`]);
  assert.equal(noMain[0].is_active, true);
});

test("closing an inactive tab keeps the current tab active", () => {
  const sessions = [
    { id: SESSION_ID, is_main: true, is_active: true, type: "session" },
    { id: `${SESSION_ID}/gui`, is_main: false, is_active: false, type: "gui" },
  ];

  const next = closeSessionTab(sessions, `${SESSION_ID}/gui`);

  assert.deepEqual(next.map((s) => s.id), [SESSION_ID]);
  assert.equal(next[0].is_active, true);
});

test("closeSessionTab ignores unknown ids and never throws", () => {
  assert.equal(closeSessionTab(initialSessions(), "missing").length, 2);
  assert.deepEqual(closeSessionTab([], SESSION_ID), []);
  assert.deepEqual(closeSessionTab(undefined, SESSION_ID), []);
});

