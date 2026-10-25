import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { sessionLifecycle } from "../src/services/session.lifecycle";

/**
 * Idle-teardown tests for `SessionLifecycleManager`.
 *
 * The manager is what actually kills ssh tunnels / remote PTYs, so a regression
 * here leaks processes until the next restart. No SSH host is contacted: an
 * unconnected `ShellManager` is created by `getShellManager()` and `destroy()`
 * is side-effect free in that state.
 *
 * Timers in these tests are either cancelled by `destroy()` or `unref()`ed, and
 * every test finishes with `destroyAll()` so the node test runner exits cleanly.
 */

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

afterEach(async () => {
  await sessionLifecycle.destroyAll();
});

test("getShellManager returns a stable instance per session", async () => {
  const a = await sessionLifecycle.getShellManager("life-a");
  const again = await sessionLifecycle.getShellManager("life-a");
  const b = await sessionLifecycle.getShellManager("life-b");

  assert.equal(a, again);
  assert.notEqual(a, b);
  assert.equal(sessionLifecycle.hasShellManager("life-a"), true);
  assert.deepEqual(sessionLifecycle.getActiveSessionIds().sort(), ["life-a", "life-b"]);
});

test("destroy removes the manager and is idempotent", async () => {
  await sessionLifecycle.getShellManager("life-destroy");

  await sessionLifecycle.destroy("life-destroy");
  assert.equal(sessionLifecycle.hasShellManager("life-destroy"), false);

  // Destroying twice (double ws close + idle timer) must not throw.
  await sessionLifecycle.destroy("life-destroy");
  assert.equal(sessionLifecycle.hasShellManager("life-destroy"), false);
  assert.equal(sessionLifecycle.hasShellManager("never-existed"), false);
});

test("scheduleDestroy tears the session down after the delay", async () => {
  await sessionLifecycle.getShellManager("life-scheduled");
  sessionLifecycle.scheduleDestroy("life-scheduled", 10);

  // Still alive right after scheduling.
  assert.equal(sessionLifecycle.hasShellManager("life-scheduled"), true);

  await wait(60);
  assert.equal(sessionLifecycle.hasShellManager("life-scheduled"), false);
});

test("reconnecting cancels the pending destroy", async () => {
  await sessionLifecycle.getShellManager("life-reconnect");
  sessionLifecycle.scheduleDestroy("life-reconnect", 10);

  // Simulates the user reopening the shell panel before the grace period ends.
  await wait(5);
  await sessionLifecycle.getShellManager("life-reconnect");

  await wait(60);
  assert.equal(
    sessionLifecycle.hasShellManager("life-reconnect"),
    true,
    "a reconnect must cancel the idle teardown",
  );
});

test("touch postpones a pending destroy", async () => {
  await sessionLifecycle.getShellManager("life-touch");
  sessionLifecycle.scheduleDestroy("life-touch", 15);

  sessionLifecycle.touch("life-touch");

  await wait(70);
  assert.equal(sessionLifecycle.hasShellManager("life-touch"), true);

  // touch() also works for an unknown session without throwing.
  sessionLifecycle.touch("life-unknown");
  assert.equal(sessionLifecycle.hasShellManager("life-unknown"), false);
});

test("scheduleDestroy on an unknown session is a no-op", async () => {
  sessionLifecycle.scheduleDestroy("life-unknown", 5);
  await wait(20);
  assert.equal(sessionLifecycle.hasShellManager("life-unknown"), false);
  assert.deepEqual(sessionLifecycle.getActiveSessionIds(), []);
});

test("sweepIdleSessions only destroys sessions idle for longer than the threshold", async () => {
  await sessionLifecycle.getShellManager("life-idle");
  await sessionLifecycle.getShellManager("life-busy");

  // Keep "life-busy" active (like a user typing in a shell) while the other
  // session receives no activity at all.
  const keepAlive = setInterval(() => sessionLifecycle.touch("life-busy"), 5);
  await wait(45);
  clearInterval(keepAlive);

  const destroyed = await sessionLifecycle.sweepIdleSessions(20);
  assert.deepEqual(destroyed, ["life-idle"]);

  assert.equal(sessionLifecycle.hasShellManager("life-idle"), false);
  assert.equal(sessionLifecycle.hasShellManager("life-busy"), true);
});

test("sweepIdleSessions keeps sessions that still have live clients", async () => {
  await sessionLifecycle.getShellManager("life-watched");
  await sessionLifecycle.getShellManager("life-unwatched");

  // A user keeping the shell panel open is not "idle", even without typing.
  sessionLifecycle.setActiveClientCounter((sessionId) => (sessionId === "life-watched" ? 1 : 0));
  try {
    const destroyed = await sessionLifecycle.sweepIdleSessions(0);
    assert.deepEqual(destroyed, ["life-unwatched"]);
    assert.equal(sessionLifecycle.hasShellManager("life-watched"), true);
  } finally {
    sessionLifecycle.setActiveClientCounter(() => 0);
    await sessionLifecycle.destroy("life-watched");
  }
});

test("a zero idle threshold sweeps everything", async () => {
  await sessionLifecycle.getShellManager("life-all-1");
  await sessionLifecycle.getShellManager("life-all-2");

  const destroyed = await sessionLifecycle.sweepIdleSessions(0, Date.now());
  assert.deepEqual(destroyed.sort(), ["life-all-1", "life-all-2"]);
  assert.deepEqual(sessionLifecycle.getActiveSessionIds(), []);
});

test("the idle sweep interval can be started once and stopped", async () => {
  sessionLifecycle.startIdleSweep(10);
  sessionLifecycle.startIdleSweep(10); // second call must not stack timers
  sessionLifecycle.stopIdleSweep();
  sessionLifecycle.stopIdleSweep(); // idempotent

  await sessionLifecycle.getShellManager("life-after-sweep");
  await wait(30);
  assert.equal(
    sessionLifecycle.hasShellManager("life-after-sweep"),
    true,
    "a stopped sweep must not destroy anything",
  );
});

test("destroyAll empties the registry (shutdown path)", async () => {
  await sessionLifecycle.getShellManager("life-shutdown-1");
  await sessionLifecycle.getShellManager("life-shutdown-2");

  await sessionLifecycle.destroyAll();
  assert.deepEqual(sessionLifecycle.getActiveSessionIds(), []);
});
