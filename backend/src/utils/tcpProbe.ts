import net from "net";

/**
 * Resolves true when something is listening on the port, false otherwise.
 * Never throws — callers use this for health reporting, not control flow.
 */
export const isPortListening = (
  port: number,
  host = "127.0.0.1",
  timeoutMs = 1000
): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
