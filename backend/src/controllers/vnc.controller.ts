import { Response, Request } from "express";
import ssh2 from "ssh2";
import { executeCommand, generateRandomPassword } from "../utils/fileUtils";

export const getVNCCredentials = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const serverConfig = {
      host: "localhost",
      port: 4242,
      username: "root",
      password: "",
    };


    const sshClient = new ssh2.Client();

    try {
      console.log("Trying to execute VNC commands");
      sshClient
        .on("ready", async () => {
          console.log("SSH connection ready");

            try {

              // 1) Ensure xstartup script starts Xfce (optional if you already have it set in Docker)
              await executeCommand(
                sshClient,
                `mkdir -p ~/.vnc && echo '#!/bin/bash\nxrdb $HOME/.Xresources\nstartxfce4 &' > ~/.vnc/xstartup && chmod +x ~/.vnc/xstartup`
              );
      
              // 2) Kill any leftover VNC servers
              await executeCommand(
                sshClient,
                `for display in {1..9}; do vncserver -kill ":$display" 2>/dev/null || true; done`
              );
      
              // 3) Generate a random VNC password
              const randomPassword = generateRandomPassword();
      
              // 4) Save password into ~/.vnc/passwd
              await executeCommand(
                sshClient,
                `echo '${randomPassword}' | vncpasswd -f > ~/.vnc/passwd && chmod 600 ~/.vnc/passwd`
              );
      
              // 5) Start a new VNC server on display :1
              await executeCommand(
                sshClient,
                "vncserver -geometry 1280x800 -depth 24 :1"
              );
      
              // 6) Start noVNC on port 80 (inside container)
              const proxyCommand = `websockify --web /usr/share/novnc/ \
                9020 \
                localhost:5901  \
                > /dev/null 2>&1 &`;
              await executeCommand(sshClient, proxyCommand);
      
              console.log("VNC + noVNC server started successfully");
      
              // Small delay to ensure noVNC is fully up
              await new Promise((resolve) => setTimeout(resolve, 1000));
      
              // Return credentials to the client
              // If your Docker is mapping container port 80 -> host port 8080, you might just use "localhost:8080"
              // Or if you're using a domain, use that. For this local example, let's assume host: http://localhost:8080
              const vncURL = "localhost:9020"; // Adjust if you mapped differently
      
              sshClient.end();
      
              return res.status(200).json({
                vncURL,
                password: randomPassword,
              });

          } catch (error) {
            console.log(error);

            return res.status(400).json({
              message: "Failed to get VNC credentials",
            });
          } finally {
            // Close the SSH connection after executing commands
            sshClient.end();
          }
        })

        .on("error", (err: any) => {
          console.log("SSH connection error:", err);

          return res.status(400).json({
            message: "Failed to get VNC credentials",
          });
        });
    } catch (err) {
      console.log("VNC server not started", err);

      return res.status(400).json({
        message: "Failed to get VNC credentials",
      });
    }

    try {
      sshClient.connect(serverConfig);
    } catch (error) {
      console.log("VNC server not started", error);

      return res.status(400).json({
        message: "Failed to get VNC credentials",
      });
    }
  } catch (error) {
    console.log(error);

    return res.status(400).json({
      message: "Failed to get VNC credentials",
    });
  }
};
