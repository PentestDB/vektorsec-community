import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeForLoginShell } from "../src/services/shell.manager";

test("never emits a bare $SHELL that can collapse to a dangling -l", () => {
  const wrapped = escapeForLoginShell("echo hi");
  // The regression: `$SHELL -l -c '…'` with $SHELL unset becomes ` -l -c '…'`,
  // and the shell tries to run "-l" as a program.
  assert.ok(
    !/(^|[^:{])\$SHELL\s+-l/.test(wrapped),
    `wrapper uses bare $SHELL: ${wrapped}`,
  );
  assert.match(wrapped, /\$\{SHELL:-/, "must provide a fallback for unset SHELL");
  assert.match(wrapped, /command -v bash/, "should prefer bash when SHELL is unset");
});

test("the command runs under a login shell", () => {
  const wrapped = escapeForLoginShell("echo hi");
  assert.match(wrapped, /-l -c '/);
  assert.ok(wrapped.includes("echo hi"));
});

test("single quotes in the command are escaped safely", () => {
  const wrapped = escapeForLoginShell("echo 'it''s'");
  // Each ' becomes '\'' so the outer single-quoted string stays balanced.
  const singles = (wrapped.match(/'/g) || []).length;
  assert.equal(singles % 2, 0, `unbalanced quoting: ${wrapped}`);
  assert.ok(wrapped.includes("'\\''"));
});
