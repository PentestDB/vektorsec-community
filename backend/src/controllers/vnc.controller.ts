import { Response, Request } from "express";
import { readEnvFile } from "../utils/envWriter";
import { getVncDisplay, getVncRfbPort, getWebsockifyPort } from "../config/constants";
import { requireActiveSession } from "../services/session.helpers";
import { execOnWorkHost, resolveSessionWorkHost } from "../services/work-host.service";
import {
  writeVncPasswordCmd,
  hasVncPassword,
  xvncSecurityArgs,
} from "../utils/vncSetup";

const FIND_VNC_BIN = [
  'export PATH="$PATH:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/libexec";',
  'for b in Xvnc Xtigervnc vncserver tigervncserver x11vnc; do',
  '  p="$(command -v "$b" 2>/dev/null)" && [ -x "$p" ] && echo "$p" && exit 0;',
  'done;',
  'for p in /usr/bin/Xvnc /usr/bin/Xtigervnc /usr/bin/vncserver /usr/bin/tigervncserver /usr/bin/x11vnc; do',
  '  [ -x "$p" ] && echo "$p" && exit 0;',
  'done;',
  'echo ""',
].join(' ');

function pickVncPath(raw: string): string {
  for (const line of raw.trim().split("\n")) {
    const t = line.trim();
    if (t.startsWith("/") && !t.includes(" ")) return t;
  }
  return "";
}

export const getVNCCredentials = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { session_id: sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ message: "Invalid session id" });
    }
    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    const VNC_DISPLAY = getVncDisplay();
    const VNC_RFBPORT = getVncRfbPort();
    const WEBSOCKIFY_PORT = getWebsockifyPort();
    const env = readEnvFile();
    const vncMode = env.VNC_MODE || "";
    const savedHost = env.VNC_HOST || "";
    const savedPort = env.VNC_PORT || "9020";
    const savedPassword = env.VNC_PASSWORD || "";
    const setupDone = env.VNC_SETUP_DONE === "true";
    const baseUrlOverride = (env.VNC_BASE_URL || "").trim();

    const defaultVncURL = savedPort ? `${savedHost}:${savedPort}` : savedHost;

    if (vncMode === "manual" && savedHost && savedPassword) {
      return res.status(200).json({
        vncURL: baseUrlOverride || defaultVncURL,
        password: savedPassword,
      });
    }

    if (vncMode === "auto" && setupDone && savedHost && savedPassword) {
      try {
            const target = await resolveSessionWorkHost(sessionId);
            const exec = async (cmd: string) => {
              const result = await execOnWorkHost(sessionId, cmd, 120_000);
              if (result.code !== 0) throw new Error(result.stderr || result.stdout || `Command failed (${result.code})`);
            };
            const execWithOutput = async (cmd: string) => {
              const result = await execOnWorkHost(sessionId, cmd, 120_000);
              return `${result.stdout}${result.stderr}`;
            };

            // Detect which VNC binary is available
            const vncRaw = await execWithOutput(FIND_VNC_BIN);
            const vncBin = pickVncPath(vncRaw) || "Xvnc";
            const isXvncDirect = vncBin.endsWith("Xvnc") || vncBin.endsWith("Xtigervnc");
            const isX11vnc = vncBin.endsWith("x11vnc");

            // Ensure xstartup exists with DISPLAY export
            await exec(
              `mkdir -p ~/.vnc && echo '#!/bin/bash\\nexport DISPLAY=${VNC_DISPLAY}\\n[ -f $$HOME/.Xresources ] && xrdb $$HOME/.Xresources\\nif command -v startxfce4 >/dev/null 2>&1; then\\n  startxfce4 &\\nelif command -v openbox-session >/dev/null 2>&1; then\\n  openbox-session &\\nelse\\n  xterm &\\nfi' > ~/.vnc/xstartup && chmod +x ~/.vnc/xstartup`
            );

            // Kill all existing VNC/Xvfb for a clean start
            await exec(
              `vncserver -kill "${VNC_DISPLAY}" 2>/dev/null || true; ` +
              `pkill -f '[x]11vnc.*-display ${VNC_DISPLAY}.*-rfbport ${VNC_RFBPORT}' 2>/dev/null || true; ` +
              `pkill -f '[X]vfb ${VNC_DISPLAY}' 2>/dev/null || true; ` +
              `pkill -f '[X](vnc|tigervnc).*${VNC_DISPLAY}.*rfbport ${VNC_RFBPORT}' 2>/dev/null || true`
            );

            // Set password. Fall back to no VNC auth when the box has no working
            // vncpasswd binary (e.g. Debian tigervnc) so the server still starts;
            // access stays restricted to the SSH tunnel + loopback.
            const escapedPassword = savedPassword.replace(/'/g, "'\\''");
            let useVncAuth = false;
            if (!isX11vnc) {
              const pwProbe = await execWithOutput(
                writeVncPasswordCmd(escapedPassword)
              );
              useVncAuth = hasVncPassword(pwProbe);
            }

            // Start VNC based on detected binary
            if (isXvncDirect) {
              await exec(
                `${vncBin} ${VNC_DISPLAY} -geometry 1280x800 -depth 24 -rfbport ${VNC_RFBPORT} ` +
                `${xvncSecurityArgs(useVncAuth)} ` +
                `-pn > /dev/null 2>&1 &`
              );
              await new Promise((r) => setTimeout(r, 1500));
              await exec(`export DISPLAY=${VNC_DISPLAY} && ~/.vnc/xstartup &`);
            } else if (isX11vnc) {
              await exec(
                "command -v Xvfb >/dev/null 2>&1 || (export DEBIAN_FRONTEND=noninteractive && sudo apt-get install -y -qq xvfb 2>&1 || true)"
              );
              await exec(`Xvfb ${VNC_DISPLAY} -screen 0 1280x800x24 > /dev/null 2>&1 &`);
              await new Promise((r) => setTimeout(r, 2000));
              await exec(`export DISPLAY=${VNC_DISPLAY} && ~/.vnc/xstartup &`);
              await exec(
                `x11vnc -display ${VNC_DISPLAY} -rfbport ${VNC_RFBPORT} -passwd '${escapedPassword}' -forever -shared -noxdamage > /dev/null 2>&1 &`
              );
              await new Promise((r) => setTimeout(r, 1500));
            } else {
              await exec(`${vncBin} -geometry 1280x800 -depth 24 ${VNC_DISPLAY}`);
            }

            // Start websockify
            await exec(`pkill -f 'websockify.*${WEBSOCKIFY_PORT}' 2>/dev/null || true`);
            await exec(
              `websockify --web /usr/share/novnc/ ${WEBSOCKIFY_PORT} localhost:${VNC_RFBPORT} > /dev/null 2>&1 &`
            );

            await new Promise((resolve) => setTimeout(resolve, 1000));

            const runtimeHost = target.kind === "ssh" ? target.sshProfile?.host || savedHost : "localhost";
            const vncURL = baseUrlOverride || `${runtimeHost}:${savedPort}`;
            return res.status(200).json({
              vncURL,
              password: savedPassword,
              workHost: target.kind,
            });
          } catch (error: any) {
            const msg = error?.message || String(error);
            console.error("VNC start error:", msg);
            return res.status(400).json({
              message: `Failed to start VNC session: ${msg}`,
            });
          }
    }

    return res.status(400).json({
      message: "VNC not configured. Please set up VNC from Settings > GUI.",
      notConfigured: true,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Failed to get VNC credentials" });
  }
};
