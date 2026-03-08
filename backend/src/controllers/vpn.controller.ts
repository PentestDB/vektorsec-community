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
 */
function sudoWrap(cmd: string, sshConfig: { username?: string; password?: string }): string {
  if (sshConfig.username === "root") return cmd;
  if (sshConfig.password) {
    return `echo ${shellEscape(sshConfig.password)} | sudo -S sh -c ${shellEscape(cmd)}`;
  }
  return `sudo -n sh -c ${shellEscape(cmd)}`;
}

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function writeFileViaExec(ssh: SSHClient, localPath: string, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const fileContent = fs.readFileSync(localPath, "utf-8");
    const cmd = `cat > ${remotePath} << 'OVPN_EOF'\n${fileContent}\nOVPN_EOF`;

    ssh.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stderr = "";
      stream.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
      stream.on("close", (code: number) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to write file (code ${code}): ${stderr}`));
        }
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

    if (!session_id) {
      return res.status(400).json({ message: "Invalid session id" });
    }

    if (!profile_name) {
      return res.status(400).json({ message: "Profile name is required" });
    }

    const session = await requireActiveSession(userId, session_id, res);
    if (!session) return;

    const safeName = sanitizeProfileName(profile_name);
    const profiles = listLocalProfiles();
    const profile = profiles.find((p) => p.name === safeName);

    if (!profile) {
      return res.status(404).json({ message: "VPN profile not found" });
    }

    const sshConfig = buildSSHConfig();
    let ssh: SSHClient | null = null;

    try {
      ssh = await sshConnectPromise(sshConfig);

      const remotePath = `/tmp/vpn-${safeName}.ovpn`;
      await writeFileViaExec(ssh, profile.path, remotePath);

      const logFile = `/tmp/openvpn-${safeName}.log`;
      const pidFile = `/tmp/openvpn-${safeName}.pid`;
      const rawCmd = `openvpn --config ${remotePath} --daemon --log ${logFile} --writepid ${pidFile} && echo 'STARTED'`;
      const startCmd = sudoWrap(rawCmd, sshConfig);

      const { stdout, code } = await sshExecPromise(ssh, startCmd);

      ssh.end();
      ssh = null;

      if (code === 0) {
        return res.status(200).json({
          message: `VPN "${safeName}" connected`,
          profile_name: safeName,
        });
      } else {
        return res.status(400).json({ message: `Failed to start VPN "${safeName}"` });
      }
    } catch (err: any) {
      if (ssh) ssh.end();
      console.log("VPN connect error:", err);
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
