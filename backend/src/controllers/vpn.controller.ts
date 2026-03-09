import { Response, Request } from "express";
import { Client as SSHClient } from "ssh2";
import { buildSSHConfig } from "../utils/sshConfig";
import { requireActiveSession } from "../services/session.helpers";
import path from "path";
import fs from "fs";
import { KALI_DATA_DIR } from "../config/constants";

const VPN_DIR = path.join(KALI_DATA_DIR, "vpn-profiles");

function ensureVPNDir(): void {
  if (!fs.existsSync(VPN_DIR)) {
    fs.mkdirSync(VPN_DIR, { recursive: true });
  }
}

function sanitizeProfileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-\.]/g, "_").substring(0, 64);
}

function listLocalProfiles(): Array<{ name: string; filename: string; path: string; size: number }> {
  ensureVPNDir();
  const files = fs.readdirSync(VPN_DIR).filter((f: string) => f.endsWith(".ovpn") || f.endsWith(".conf"));
  return files.map((f: string) => {
    const fullPath = path.join(VPN_DIR, f);
    const stat = fs.statSync(fullPath);
    return {
      name: f.replace(/\.(ovpn|conf)$/, ""),
      filename: f,
      path: fullPath,
      size: stat.size,
    };
  });
}

function sshExecPromise(ssh: SSHClient, command: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    ssh.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = "";
      let stderr = "";
      stream.on("data", (data: Buffer) => { stdout += data.toString(); });
      stream.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
      stream.on("close", (code: number) => {
        resolve({ stdout, stderr, code });
      });
    });
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

function sshConnectPromise(sshConfig: any): Promise<SSHClient> {
  return new Promise((resolve, reject) => {
    const ssh = new SSHClient();
    ssh.on("ready", () => resolve(ssh));
    ssh.on("error", (err) => reject(err));
    ssh.connect(sshConfig);
  });
}

/**
 * Wraps a command with sudo if needed. Uses the SSH password for `sudo -S`
 * when the SSH user is not root.
 * @param cmdOrPath - Command string to run via sh -c, or script path when isScriptPath is true
 * @param isScriptPath - When true, cmdOrPath is a file path to execute directly (avoids quoting issues)
 */
function sudoWrap(
  cmdOrPath: string,
  sshConfig: { username?: string; password?: string },
  isScriptPath = false
): string {
  const run = isScriptPath ? `bash ${shellEscape(cmdOrPath)}` : `sh -c ${shellEscape(cmdOrPath)}`;
  if (sshConfig.username === "root") return run;
  if (sshConfig.password) {
    return `echo ${shellEscape(sshConfig.password)} | sudo -S ${run}`;
  }
  return `sudo -n ${run}`;
}

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function uploadFileViaSftp(ssh: SSHClient, localPath: string, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ssh.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(localPath, remotePath, (e) => {
        if (e) return reject(e);
        resolve();
      });
    });
  });
}

// ── Upload VPN profile ──

export const uploadVPNProfile = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const profileName = req.body.profile_name;

    if (!file) {
      return res.status(400).json({ message: "No file provided" });
    }

    if (file.size > 2097152) {
      return res.status(400).json({ message: "File size exceeds 2MB limit" });
    }

    ensureVPNDir();

    const safeName = sanitizeProfileName(profileName || file.originalname.replace(/\.(ovpn|conf)$/, ""));
    const ext = file.originalname.endsWith(".conf") ? ".conf" : ".ovpn";
    const filename = safeName + ext;
    const filePath = path.join(VPN_DIR, filename);

    fs.writeFileSync(filePath, file.buffer);

    return res.status(200).json({
      message: "VPN profile uploaded",
      profile: {
        name: safeName,
        filename,
      },
    });
  } catch (err) {
    console.log(err);
    return res.status(400).json({ message: "Failed to upload VPN profile" });
  }
};

// ── List all VPN profiles ──

export const listVPNProfiles = async (req: Request, res: Response) => {
  try {
    const profiles = listLocalProfiles();
    return res.status(200).json({ profiles });
  } catch (err) {
    console.log(err);
    return res.status(400).json({ message: "Failed to list VPN profiles" });
  }
};

// ── Delete a VPN profile ──

export const deleteVPNProfile = async (req: Request, res: Response) => {
  try {
    const { profile_name } = req.body;

    if (!profile_name) {
      return res.status(400).json({ message: "Profile name is required" });
    }

    const safeName = sanitizeProfileName(profile_name);
    const profiles = listLocalProfiles();
    const profile = profiles.find((p) => p.name === safeName);

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    fs.unlinkSync(profile.path);

    return res.status(200).json({ message: "Profile deleted" });
  } catch (err) {
    console.log(err);
    return res.status(400).json({ message: "Failed to delete VPN profile" });
  }
};

// ── Connect a specific VPN profile ──

export const connectVPNProfile = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { session_id, profile_name } = req.body;
    console.log("[vpn/connect] 1 request received", { session_id, profile_name, userId });

    if (!session_id) {
      return res.status(400).json({ message: "Invalid session id" });
    }

    if (!profile_name) {
      return res.status(400).json({ message: "Profile name is required" });
    }

    console.log("[vpn/connect] 2 fetching session...");
    const session = await requireActiveSession(userId, session_id, res);
    if (!session) return;
    console.log("[vpn/connect] 3 session ok");

    const safeName = sanitizeProfileName(profile_name);
    const profiles = listLocalProfiles();
    const profile = profiles.find((p) => p.name === safeName);

    if (!profile) {
      return res.status(404).json({ message: "VPN profile not found" });
    }
    console.log("[vpn/connect] 4 profile found", { path: profile.path });

    console.log("[vpn/connect] 5 building ssh config...");
    const sshConfig = buildSSHConfig();
    let ssh: SSHClient | null = null;

    try {
      console.log("[vpn/connect] 6 connecting ssh...");
      ssh = await withTimeout(
        sshConnectPromise(sshConfig),
        15000,
        "SSH connect for VPN"
      );
      console.log("[vpn/connect] 7 ssh connected", { profile: safeName });

      const remotePath = `/tmp/vpn-${safeName}.ovpn`;
      console.log("[vpn/connect] 8 uploading profile to remote...");
      await withTimeout(
        uploadFileViaSftp(ssh, profile.path, remotePath),
        30000,
        "Upload profile to remote"
      );
      console.log("[vpn/connect] 9 profile uploaded to remote host", { remotePath });

      const logFile = `/tmp/openvpn-${safeName}.log`;
      const pidFile = `/tmp/openvpn-${safeName}.pid`;
      const scriptPath = `/tmp/vpn-start-${safeName}.sh`;
      const scriptContent = [
        "#!/bin/bash",
        `rm -f ${pidFile}`,
        `openvpn --config ${remotePath} --daemon --log ${logFile} --writepid ${pidFile}`,
        "sleep 2",
        `if [ -f ${pidFile} ] && kill -0 $(cat ${pidFile}) 2>/dev/null; then`,
        "  echo STARTED",
        "else",
        "  echo FAILED",
        `  [ -f ${logFile} ] && sed -n '1,120p' ${logFile}`,
        "fi",
      ].join("\n");

      const localScriptPath = path.join(VPN_DIR, `vpn-start-${safeName}.sh`);
      fs.writeFileSync(localScriptPath, scriptContent, "utf8");
      try {
        await withTimeout(
          uploadFileViaSftp(ssh, localScriptPath, scriptPath),
          10000,
          "Upload start script"
        );
      } finally {
        fs.unlinkSync(localScriptPath);
      }

      const startCmd = sudoWrap(scriptPath, sshConfig, true);

      console.log("[vpn/connect] 10 starting openvpn...", { profile: safeName });
      const { stdout, stderr, code } = await withTimeout(
        sshExecPromise(ssh, startCmd),
        25000,
        "OpenVPN start"
      );
      console.log("[vpn/connect] 11 openvpn start completed", {
        profile: safeName,
        code,
        stdout,
        stderr,
      });

      ssh.end();
      ssh = null;

      if (code === 0 && stdout.includes("STARTED")) {
        console.log("[vpn/connect] 12 success, sending response");
        return res.status(200).json({
          message: `VPN "${safeName}" connected`,
          profile_name: safeName,
        });
      } else {
        return res.status(400).json({
          message:
            stderr?.trim() ||
            stdout?.replace("FAILED", "").trim() ||
            `Failed to start VPN "${safeName}"`,
        });
      }
    } catch (err: any) {
      if (ssh) ssh.end();
      console.log("[vpn/connect] error:", err?.message ?? err);
      return res.status(400).json({ message: err.message ?? "Failed to connect VPN" });
    }
  } catch (err) {
    console.log(err);
    return res.status(400).json({ message: "Failed to connect VPN" });
  }
};

// ── Disconnect a specific VPN connection ──

export const disconnectVPNConnection = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { session_id, pid, profile_name } = req.body;

    if (!session_id) {
      return res.status(400).json({ message: "Invalid session id" });
    }

    const session = await requireActiveSession(userId, session_id, res);
    if (!session) return;

    const sshConfig = buildSSHConfig();
    const ssh = await sshConnectPromise(sshConfig);

    try {
      let rawCmd: string;

      if (pid) {
        rawCmd = `kill ${parseInt(pid, 10)} 2>/dev/null && echo 'KILLED'`;
      } else if (profile_name) {
        const safeName = sanitizeProfileName(profile_name);
        const pidFile = `/tmp/openvpn-${safeName}.pid`;
        rawCmd = `if [ -f ${pidFile} ]; then kill $(cat ${pidFile}) 2>/dev/null && rm -f ${pidFile} && echo 'KILLED'; else echo 'NOT_FOUND'; fi`;
      } else {
        return res.status(400).json({ message: "Provide either pid or profile_name" });
      }

      const killCmd = sudoWrap(rawCmd, sshConfig);
      const { stdout, code } = await sshExecPromise(ssh, killCmd);

      if (stdout.trim().includes("KILLED")) {
        return res.status(200).json({ message: "VPN connection terminated" });
      } else if (stdout.trim().includes("NOT_FOUND")) {
        return res.status(404).json({ message: "VPN process not found" });
      } else {
        return res.status(400).json({ message: "Failed to disconnect VPN" });
      }
    } finally {
      ssh.end();
    }
  } catch (err) {
    console.log(err);
    return res.status(400).json({ message: "Failed to disconnect VPN" });
  }
};

// ── Disconnect ALL VPN connections ──

export const disconnectAllVPN = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({ message: "Invalid session id" });
    }

    const session = await requireActiveSession(userId, session_id, res);
    if (!session) return;

    const sshConfig = buildSSHConfig();
    const ssh = await sshConnectPromise(sshConfig);

    try {
      const rawCmd = "pkill openvpn 2>/dev/null; rm -f /tmp/openvpn-*.pid /tmp/vpn-*.ovpn; echo 'DONE'";
      const { code } = await sshExecPromise(ssh, sudoWrap(rawCmd, sshConfig));
      return res.status(200).json({ message: "All VPN connections terminated" });
    } finally {
      ssh.end();
    }
  } catch (err) {
    console.log(err);
    return res.status(400).json({ message: "Failed to disconnect all VPNs" });
  }
};

// ── Get detailed VPN status ──

export const getVPNStatus = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({ message: "Invalid session id" });
    }

    const session = await requireActiveSession(userId, session_id, res);
    if (!session) return;

    const sshConfig = buildSSHConfig();
    const ssh = await sshConnectPromise(sshConfig);

    try {
      const { stdout: pgrepOut, code: pgrepCode } = await sshExecPromise(ssh, "pgrep -a openvpn 2>/dev/null");

      if (pgrepCode !== 0 || !pgrepOut.trim()) {
        return res.status(200).json({
          success: false,
          connections: [],
          message: "No VPN connections active",
        });
      }

      const lines = pgrepOut.trim().split("\n").filter(Boolean);
      const connections: Array<{
        pid: string;
        profile_name: string;
        config_file: string;
      }> = [];

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[0];
        const configFlag = parts.indexOf("--config");
        let configFile = "";
        let profileName = "unknown";

        if (configFlag !== -1 && parts[configFlag + 1]) {
          configFile = parts[configFlag + 1];
          const basename = path.basename(configFile, path.extname(configFile));
          profileName = basename.replace(/^vpn-/, "");
        }

        connections.push({ pid, profile_name: profileName, config_file: configFile });
      }

      // Get tun interfaces and IPs
      const { stdout: ifOut } = await sshExecPromise(ssh, "ip -4 addr show 2>/dev/null | grep -E '(^[0-9]+:|inet )' || true");
      const tunInterfaces: Array<{ iface: string; ip: string }> = [];
      const ifLines = ifOut.split("\n");
      let currentIface = "";
      for (const ifLine of ifLines) {
        const ifaceMatch = ifLine.match(/^\d+:\s+(\S+?)[@:]/);
        if (ifaceMatch) {
          currentIface = ifaceMatch[1];
        }
        const inetMatch = ifLine.match(/inet\s+(\S+)/);
        if (inetMatch && currentIface.startsWith("tun")) {
          tunInterfaces.push({ iface: currentIface, ip: inetMatch[1] });
        }
      }

      const enrichedConnections = connections.map((conn, idx) => ({
        ...conn,
        tun_interface: tunInterfaces[idx]?.iface ?? null,
        tun_ip: tunInterfaces[idx]?.ip ?? null,
      }));

      return res.status(200).json({
        success: true,
        connections: enrichedConnections,
        message: `${enrichedConnections.length} VPN connection(s) active`,
      });
    } finally {
      ssh.end();
    }
  } catch (err) {
    console.log(err);
    return res.status(400).json({ message: "Failed to check VPN status" });
  }
};

// ── Legacy endpoints (backward-compatible) ──

export const uploadOpenVPNforUser = async (req: Request, res: Response) => {
  req.body.profile_name = "default";
  return uploadVPNProfile(req, res);
};

export const checkUserOpenVPN = async (req: Request, res: Response) => {
  try {
    const profiles = listLocalProfiles();
    if (profiles.length === 0) {
      return res.status(400).json({ message: "OpenVPN file not found" });
    }
    return res.status(200).json({
      message: "User openvpn file found",
      openvpnFile: profiles[0].path,
      profiles,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Failed to check user openvpn file" });
  }
};

export const connectToVPN = async (req: Request, res: Response) => {
  req.body.profile_name = req.body.profile_name || "default";
  return connectVPNProfile(req, res);
};

export const disconnectVPN = async (req: Request, res: Response) => {
  if (req.body.pid || req.body.profile_name) {
    return disconnectVPNConnection(req, res);
  }
  return disconnectAllVPN(req, res);
};

export const checkVPNStatus = async (req: Request, res: Response) => {
  return getVPNStatus(req, res);
};
