import { Client as SSHClient } from "ssh2";
import { buildSSHConfig } from "../utils/sshConfig";

export async function execSSHCommand(command: string, timeoutMs?: number): Promise<string> {
  const sshConfig = buildSSHConfig();

  return new Promise<string>((resolve, reject) => {
    let output = "";
    let settled = false;
    const ssh = new SSHClient();

    let timer: NodeJS.Timeout | null = null;
    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        ssh.end();
        reject(new Error(`SSH operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }

    const finish = (err: Error | null, result?: string) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (err) reject(err);
      else resolve(result ?? "");
    };

    ssh
      .on("ready", () => {
        ssh.exec(command, (err: Error | undefined, stream: any) => {
          if (err) {
            console.error("SSH exec error:", err);
            ssh.end();
            finish(err);
            return;
          }

          stream.on("data", (data: Buffer) => {
            output += data.toString();
          });

          stream.stderr.on("data", (data: Buffer) => {
            output += data.toString();
          });

          stream.on("close", () => {
            ssh.end();
            finish(null, output);
          });
        });
      })
      .on("keyboard-interactive", (_name, _instructions, _instructionsLang, prompts, finish_auth) => {
        finish_auth(prompts.map(() => sshConfig.password || ""));
      })
      .on("error", (err: Error) => {
        console.error("SSH connection error:", err);
        finish(err);
      })
      .connect({
        ...sshConfig,
        ...(timeoutMs ? { readyTimeout: timeoutMs } : {}),
      });
  });
}

export async function getIfConfigKali(): Promise<string> {
  return execSSHCommand("ifconfig");
}

export async function runCommandOnKali(command: string): Promise<string> {
  return execSSHCommand(command);
}
