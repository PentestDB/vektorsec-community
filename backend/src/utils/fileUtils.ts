import { Client } from "ssh2";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const archiver = require("archiver");
const fs = require("fs");

export function zipFiles(
  files: { file_name: string; file_binary: Buffer }[],
  zipFileName: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipFileName);
    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    output.on("close", () => {
      console.log(archive.pointer() + " total bytes");
      console.log(
        "Archiver has been finalized and the output file descriptor has closed."
      );
      resolve(zipFileName);
    });

    archive.on("error", (err: any) => {
      reject(err);
    });

    archive.pipe(output);

    files.forEach((file) => {
      const fileBinary = decodeFileBinary(file.file_binary);
      archive.append(fileBinary, { name: file.file_name });
    });

    archive.finalize();
  });
}

function decodeFileBinary(base64Data: any) {
  return Buffer.from(base64Data, "base64");
}

export async function executeCommand(
  sshClient: Client,
  command: string
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    sshClient.exec(command, (err, stream) => {
      if (err) {
        console.error("Error executing command:", err);
        reject(err);
        return;
      }

      stream
        .on("close", () => {
          console.log("Command execution completed.");
          resolve();
        })
        .on("data", (data: any) => {
          console.log("STDOUT:", data.toString());
        });
    });
  });
}

export function generateRandomPassword() {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let password = "";

  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return password;
}
