const PRIVILEGED_PACKAGE_COMMAND =
  /(?:^|(?:&&|\|\||;)\s*)(?:DEBIAN_FRONTEND=\S+\s+)?(?:apt|apt-get|dnf|yum|pacman|zypper)\s+/;

function quoteForShell(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/**
 * Registry install commands are trusted server-side values. Package managers
 * still need elevation when the configured exploit-box SSH user is non-root.
 * Prefer passwordless sudo so credentials never enter a command or log.
 */
export function buildPrivilegeAwareInstallCommand(
  installCommand: string,
  isDarwin: boolean,
): string {
  const command = installCommand.trim();
  if (!command || isDarwin || !PRIVILEGED_PACKAGE_COMMAND.test(command)) {
    return command;
  }

  const stablePackageCommand = command.replace(
    /(^|(?:&&|\|\||;)\s*)apt(?=\s)/g,
    "$1apt-get",
  );
  const quotedCommand = quoteForShell(
    `export DEBIAN_FRONTEND=noninteractive; ${stablePackageCommand}`,
  );
  return [
    'if [ "$(id -u)" -eq 0 ]; then',
    `  sh -lc ${quotedCommand};`,
    "elif command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then",
    `  sudo -n sh -lc ${quotedCommand};`,
    "else",
    '  echo "Installation requires root access. Configure passwordless sudo for the exploit-box user or install the package manually." >&2;',
    "  exit 126;",
    "fi",
  ].join(" ");
}
