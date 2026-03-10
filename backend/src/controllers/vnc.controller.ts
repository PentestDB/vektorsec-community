import { Response, Request } from "express";
import ssh2 from "ssh2";
import { executeCommand, generateRandomPassword } from "../utils/fileUtils";
import { buildSSHConfig } from "../utils/sshConfig";
import { readEnvFile, updateEnvVars } from "../utils/envWriter";
import { getVncDisplay, getVncRfbPort, getWebsockifyPort } from "../config/constants";

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
      const sshConfig = buildSSHConfig();
      const sshClient = new ssh2.Client();

      sshClient
        .on("ready", async () => {
          try {
            const exec = (cmd: string) => executeCommand(sshClient, cmd);
            const execWithOutput = (cmd: string): Promise<string> => {
              return new Promise((resolve, reject) => {
                sshClient.exec(cmd, (err, stream) => {
                  if (err) return reject(err);
                  let out = "";
                  stream
                    .on("close", () => resolve(out))
                    .on("data", (d: Buffer) => { out += d.toString(); })
                    .stderr.on("data", (d: Buffer) => { out += d.toString(); });
                });
              });
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
              "pkill -f '[X](vnc|tigervnc)' 2>/dev/null || true; " +
              "pkill -f x11vnc 2>/dev/null || true; " +
              "pkill -f 'Xvfb' 2>/dev/null || true; " +
              "for display in {1..99}; do vncserver -kill \":$display\" 2>/dev/null || true; done"
            );

            // Set password
            const escapedPassword = savedPassword.replace(/'/g, "'\\''");
            if (!isX11vnc) {
              const vncPasswdBin = pickVncPath(
                await execWithOutput(
                  'command -v vncpasswd 2>/dev/null || command -v tigervncpasswd 2>/dev/null || echo vncpasswd'
                )
              ) || "vncpasswd";
              await exec(
                `echo '${escapedPassword}' | ${vncPasswdBin} -f > ~/.vnc/passwd && chmod 600 ~/.vnc/passwd`
              );
            }

            // Start VNC based on detected binary
            if (isXvncDirect) {
              await exec(
                `${vncBin} ${VNC_DISPLAY} -geometry 1280x800 -depth 24 -rfbport ${VNC_RFBPORT} ` +
                `-SecurityTypes VncAuth -PasswordFile ~/.vnc/passwd ` +
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

            sshClient.end();

            const vncURL = baseUrlOverride || `${savedHost}:${savedPort}`;
            return res.status(200).json({
              vncURL,
              password: savedPassword,
            });
          } catch (error: any) {
            const msg = error?.message || String(error);
            console.error("VNC start error:", msg);
            sshClient.end();
            return res.status(400).json({
              message: `Failed to start VNC session: ${msg}`,
            });
          }
        })
        .on("error", (err: any) => {
          const msg = err?.message || String(err);
          console.error("SSH connection error during VNC:", msg);
          return res.status(400).json({
            message: `Cannot connect to exploit box via SSH: ${msg}`,
          });
        });

      sshClient.connect(sshConfig);
      return;
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
