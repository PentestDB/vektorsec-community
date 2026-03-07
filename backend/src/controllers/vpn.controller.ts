import { Response, Request } from "express";
import { Client as SSHClient } from "ssh2";
import { buildSSHConfig } from "../utils/sshConfig";
import { requireActiveSession } from "../services/session.helpers";
import path from "path";

const fs = require("fs");

export const uploadOpenVPNforUser = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({
        message: "Invalid session id",
      });
    }

    const file = req.file;
    if (file) {
      if (file.size > 2097152) {
        return res.status(400).json({ message: "file size is too large" });
      }
      const fileBuffer = file.buffer;

      const localFolder = "./kali-data";

      if (!fs.existsSync(localFolder)) {
        fs.mkdirSync(localFolder, { recursive: true });
      }

      const localFilePath = path.join(localFolder, "openvpn.ovpn");
      fs.writeFileSync(localFilePath, fileBuffer);

      return res.status(200).json({
        message: "Upload Complete",
      });
    }

    return res.status(400).json({
      message: "Failed to upload vpn file",
    });
  } catch (err) {
    console.log(err);
    return res.status(400).json({
      message: "Failed to upload openvpn file",
    });
  }
};

export const disconnectVPN = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({
        message: "Invalid session id",
      });
    }

    const session = await requireActiveSession(userId, session_id, res);
    if (!session) return;

    const sshConfig = buildSSHConfig();

    const ssh = new SSHClient();
    ssh
      .on("ready", () => {
        console.log("SSH connection ready (disconnectVPN)");

        /**
         * Kill the openvpn process.
         * This is a simple approach;
         * you can also do `pkill -SIGTERM openvpn` or something more targeted.
         */
        ssh.exec("pkill openvpn && echo '|<<<<KILLED>>>>|'", (err, stream) => {
          if (err) {
            console.error("Error killing OpenVPN:", err);
            ssh.end();
            return res
              .status(400)
              .json({ message: "Failed to disconnect from VPN" });
          }

          stream.on("close", (code: any, signal: any) => {
            console.log("pkill openvpn command closed", { code, signal });
            ssh.end();

            if (code === 0) {
              return res.status(200).json({ message: "Disconnected from VPN" });
            } else {
              return res
                .status(400)
                .json({ message: "Failed to disconnect VPN" });
            }
          });

          // (Optional) handle stdout/stderr
          stream.on("data", (data: Buffer) => {
            console.log("pkill stdout:", data.toString());
          });
          stream.stderr.on("data", (data: Buffer) => {
            console.error("pkill stderr:", data.toString());
          });
        });
      })
      .on("error", (err) => {
        console.error("SSH connection error (disconnectVPN):", err);
        return res.status(400).json({ message: "SSH connection failed" });
      })
      .connect(sshConfig);

  } catch (err) {
    console.log(err);
    return res.status(400).json({
      message: "Failed to disconnect VPN",
    });
  }
};

export const connectToVPN = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({
        message: "Invalid session id",
      });
    }

    const localVPNFilePath = "./kali-data/openvpn.ovpn"
    if (!fs.existsSync(localVPNFilePath)) {
      return res
        .status(400)
        .json({ message: "VPN File does not exist, please upload it first" });
    }

    const session = await requireActiveSession(userId, session_id, res);
    if (!session) return;

    const sshConfig = buildSSHConfig();

    const ssh = new SSHClient();

    ssh
      .on("ready", () => {
        console.log("SSH connection ready (connectToVPN)");
        // 1. Upload the VPN file to the remote host using SFTP
        ssh.sftp((sftpErr, sftp) => {
          if (sftpErr) {
            console.error("SFTP error:", sftpErr);
            ssh.end();
            return res.status(400).json({ message: "Failed to establish SFTP connection" });
          }
          const readStream = fs.createReadStream(localVPNFilePath);
          const writeStream = sftp.createWriteStream("/root/openvpn.ovpn");

          writeStream.on('close', () => {
            console.log('VPN file uploaded to remote host.');
            // 2. Start OpenVPN after successful upload
            ssh.exec("openvpn --config /root/openvpn.ovpn --daemon && echo '|<<<<STARTED>>>>|'", (err, stream) => {
              if (err) {
                console.error("Error starting OpenVPN:", err);
                ssh.end();
                return res
                  .status(400)
                  .json({ message: "Failed to connect to VPN" });
              }

              stream.on("close", (code: any, signal: any) => {
                console.log("OpenVPN start command closed", { code, signal });
                ssh.end();

                if (code === 0) {
                  return res.status(200).json({ message: "Connected to VPN" });
                } else {
                  return res
                    .status(400)
                    .json({ message: "Failed to connect to VPN" });
                }
              });

              stream.on("data", (data: Buffer) => {
                console.log("OpenVPN stdout:", data.toString());
              });
              stream.stderr.on("data", (data: Buffer) => {
                console.error("OpenVPN stderr:", data.toString());
              });
            });
          });

          writeStream.on('error', (err: Error) => {
            console.error('Error uploading VPN file:', err);
            ssh.end();
            return res.status(400).json({ message: "Failed to upload VPN file to remote host" });
          });

          readStream.pipe(writeStream);
        });
      })
      .on("error", (err) => {
        console.error("SSH connection error (connectToVPN):", err);
        return res.status(400).json({ message: "SSH connection failed" });
      })
      .connect(sshConfig);

  } catch (err) {
    console.log(err);
    return res.status(400).json({
      message: "Failed to upload openvpn file",
    });
  }
};

export const checkUserOpenVPN = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const openVPNFilePath =  "./kali-data/openvpn.ovpn"

    if (!fs.existsSync(openVPNFilePath)) {
      return res.status(400).json({ message: "OpenVPN file not found" });
    }

    return res.status(200).json({
      message: "User openvpn file found",
      openvpnFile: openVPNFilePath,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Failed to check user openvpn file",
    });
  }
};

export const checkVPNStatus = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({
        message: "Invalid session id",
      });
    }

    const session = await requireActiveSession(userId, session_id, res);
    if (!session) return;

    const sshConfig = buildSSHConfig();

    const ssh = new SSHClient();
    ssh
      .on("ready", () => {
        console.log("SSH connection ready (checkVPNStatus)");

        /**
         * We can check if there's an `openvpn` process running.
         * If `pgrep` returns a PID, it's running; else it's not.
         */
        ssh.exec("pgrep openvpn", (err, stream) => {
          if (err) {
            console.error("Error checking VPN status:", err);
            ssh.end();
            return res.status(400).json({ message: "Failed to check VPN" });
          }

          let outputData = "";
          let errorData = "";

          stream.on("data", (data: Buffer) => {
            outputData += data.toString();
          });

          stream.stderr.on("data", (data: Buffer) => {
            errorData += data.toString();
          });

          stream.on("close", (code: any, signal: any) => {
            ssh.end();
            console.log("pgrep command closed", { code, signal });

            // If code = 0, then openvpn is running (pgrep found a match)
            // If code = 1, no process found
            if (code === 0) {
              return res.status(200).json({
                message: "VPN is running",
                pids: outputData.trim().split("\n"),
                success: true
              });
            } else {
              // pgrep returns 1 if no processes were matched
              return res
                .status(200)
                .json({ message: "VPN is not running", pids: [] });
            }
          });
        });
      })
      .on("error", (err) => {
        console.error("SSH connection error (checkVPNStatus):", err);
        return res.status(400).json({ message: "SSH connection failed" });
      })
      .connect(sshConfig);

  } catch (err) {
    console.log(err);
    return res.status(400).json({
      message: "Failed to upload openvpn file",
    });
  }
};
