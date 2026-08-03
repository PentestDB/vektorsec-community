import assert from "node:assert/strict";
import test from "node:test";
import { getCapabilityByName } from "../src/capabilities/registry";
import { buildPrivilegeAwareInstallCommand } from "../src/utils/installCommand";

test("wraps apt installs with root or passwordless sudo detection", () => {
  const command = buildPrivilegeAwareInstallCommand(
    "apt install -y vim-common",
    false,
  );

  assert.match(command, /id -u/);
  assert.match(command, /sudo -n true/);
  assert.match(
    command,
    /sudo -n sh -lc 'export DEBIAN_FRONTEND=noninteractive; apt-get install -y vim-common'/,
  );
  assert.match(command, /exit 126/);
});

test("does not elevate portable or macOS install commands", () => {
  assert.equal(
    buildPrivilegeAwareInstallCommand("pipx install chepy", false),
    "pipx install chepy",
  );
  assert.equal(
    buildPrivilegeAwareInstallCommand("brew install xxd", true),
    "brew install xxd",
  );
});

test("xxd resolves to the Debian xxd package", () => {
  assert.equal(getCapabilityByName("xxd")?.installCommand, "apt install -y xxd");
});
