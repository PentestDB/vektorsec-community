import fs from "fs";

export interface SSHConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string | Buffer;
  passphrase?: string;
  tryKeyboard?: boolean;
  agent?: string;
  keepaliveInterval?: number;
  keepaliveCountMax?: number;
}

let _sshConfigWarned = false;

export function buildSSHConfig(): SSHConfig {
  const sshConfig: SSHConfig = {
    host: (process.env.SSH_HOST || "localhost").trim(),
    port: parseInt(process.env.SSH_PORT || "4242", 10),
    username: (process.env.SSH_USERNAME || "root").trim(),
  };

  const privateKeyPath = (process.env.SSH_PRIVATE_KEY || "").trim();
  if (privateKeyPath) {
    try {
      sshConfig.privateKey = fs.readFileSync(privateKeyPath, "utf8");
      const passphrase = process.env.SSH_PRIVATE_KEY_PASSPHRASE;
      if (passphrase) {
        sshConfig.passphrase = passphrase;
      }
      if (!_sshConfigWarned) {
        console.log("SSH: Using private key authentication");
      }
    } catch (err) {
      if (!_sshConfigWarned) {
        console.warn(
          `SSH: Could not read private key at "${privateKeyPath}" — ` +
            `SSH connections will fail until this is fixed.`,
          err instanceof Error ? err.message : err
        );
        _sshConfigWarned = true;
      }
    }
  } else {
    sshConfig.password = (process.env.SSH_PASSWORD || "").trim();
    sshConfig.tryKeyboard = true;
    if (!_sshConfigWarned && !sshConfig.password && !sshConfig.host) {
      console.warn(
        "SSH: No SSH credentials configured — exploit box features will be unavailable."
      );
      _sshConfigWarned = true;
    }
  }

  return sshConfig;
}
