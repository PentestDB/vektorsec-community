import assert from "node:assert/strict";
import test from "node:test";
import { classifyMythicCommand, isHighImpactMythicCommand } from "../src/utils/mythicCommandSafety";

test("lateral movement commands are high impact", () => {
  for (const command of ["jump_psexec", "psexec", "wmiexec", "jump_wmi", "winrm"]) {
    const result = classifyMythicCommand(command);
    assert.equal(result.highImpact, true, `${command} should be high impact`);
    assert.match(result.reason, /Lateral movement/);
  }
});

test("code execution and injection are high impact", () => {
  assert.equal(isHighImpactMythicCommand("execute_assembly"), true);
  assert.equal(isHighImpactMythicCommand("shinject"), true);
  assert.equal(isHighImpactMythicCommand("shell"), true);
  assert.equal(isHighImpactMythicCommand("powerpick"), true);
});

test("credential dumping and persistence are high impact", () => {
  assert.equal(isHighImpactMythicCommand("mimikatz"), true);
  assert.equal(isHighImpactMythicCommand("dcsync"), true);
  assert.equal(isHighImpactMythicCommand("schtasks"), true);
});

test("opening a pivot is high impact", () => {
  assert.equal(isHighImpactMythicCommand("socks"), true);
  assert.equal(isHighImpactMythicCommand("rpfwd"), true);
});

test("read-only enumeration is not escalated", () => {
  for (const command of ["ls", "pwd", "whoami", "ps", "cat", "download", "screenshot", "getprivs"]) {
    assert.equal(isHighImpactMythicCommand(command), false, `${command} should not be high impact`);
  }
});

test("only the command name is considered, not its arguments", () => {
  // "ls" with a path that happens to mention a risky word stays safe...
  assert.equal(isHighImpactMythicCommand("ls C:\\\\Windows\\\\System32\\\\mimikatz"), false);
  // ...while a risky command with arguments is still caught.
  assert.equal(isHighImpactMythicCommand("shell net user /domain"), true);
});

test("prefix matches do not leak across command names", () => {
  // "shellcode_inject" starts with "shell" but the boundary check keeps this honest:
  // it is genuinely high impact via the injection rule, not by accident of prefixing.
  assert.equal(isHighImpactMythicCommand("shells_are_fine"), false);
  assert.equal(isHighImpactMythicCommand("uploader_status"), false);
});

test("empty and malformed input is safe", () => {
  assert.equal(isHighImpactMythicCommand(""), false);
  assert.equal(isHighImpactMythicCommand("   "), false);
  assert.equal(isHighImpactMythicCommand(undefined as unknown as string), false);
  assert.equal(isHighImpactMythicCommand(null as unknown as string), false);
});
