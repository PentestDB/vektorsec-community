import { Client as SSHClient } from "ssh2";
import { buildSSHConfig } from "../utils/sshConfig";

export async function execSSHCommand(command: string): Promise<string> {
  const sshConfig = buildSSHConfig();

  return new Promise<string>((resolve, reject) => {
    let output = "";
    const ssh = new SSHClient();

    ssh
      .on("ready", () => {
        ssh.exec(command, (err: Error | undefined, stream: any) => {
          if (err) {
            console.error("SSH exec error:", err);
            ssh.end();
            reject(err);
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
            resolve(output);
          });
        });
      })
      .on("error", (err: Error) => {
        console.error("SSH connection error:", err);
        reject(err);
      })
      .connect(sshConfig);
  });
}

export async function getIfConfigKali(): Promise<string> {
  return execSSHCommand("ifconfig");
}

export async function runCommandOnKali(command: string): Promise<string> {
  return execSSHCommand(command);
}
