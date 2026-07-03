import { test } from "node:test";
import assert from "node:assert/strict";
import {
  writeVncPasswordCmd,
  hasVncPassword,
  xvncSecurityArgs,
  VNC_PASSWD_MARKER_OK,
  VNC_PASSWD_MARKER_NONE,
} from "../src/utils/vncSetup";

test("writeVncPasswordCmd tries vncpasswd, tigervncpasswd, then x11vnc", () => {
  const cmd = writeVncPasswordCmd("s3cret");
  assert.match(cmd, /command -v vncpasswd \|\| command -v tigervncpasswd/);
  assert.match(cmd, /echo 's3cret' \| "\$PW_BIN" -f > ~\/\.vnc\/passwd/);
  // x11vnc -storepasswd writes the same VNC format and exists on Debian tigervnc.
  assert.match(cmd, /x11vnc -storepasswd 's3cret' ~\/\.vnc\/passwd/);
  // `-s` check reports whether a non-empty passwd file was actually produced.
  assert.match(cmd, /\[ -s ~\/\.vnc\/passwd \]/);
  assert.ok(cmd.includes(VNC_PASSWD_MARKER_OK));
  assert.ok(cmd.includes(VNC_PASSWD_MARKER_NONE));
});

test("hasVncPassword parses the probe markers", () => {
  assert.equal(hasVncPassword(`\n${VNC_PASSWD_MARKER_OK}\n`), true);
  assert.equal(hasVncPassword(`\n${VNC_PASSWD_MARKER_NONE}\n`), false);
  assert.equal(hasVncPassword(""), false);
});

test("xvncSecurityArgs uses VncAuth only when a password was set", () => {
  assert.equal(
    xvncSecurityArgs(true),
    "-SecurityTypes VncAuth -PasswordFile ~/.vnc/passwd",
  );
  assert.equal(xvncSecurityArgs(false), "-SecurityTypes None");
});
