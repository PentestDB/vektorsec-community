import WebSocket from "ws";

class SSHWebSocketClient {
  private wsClient: WebSocket;

  constructor(quartWebSocketUrl: string) {
    this.wsClient = new WebSocket(quartWebSocketUrl);

    this.wsClient.on("open", () =>
      console.log("Connected to Quart WebSocket server")
    );
    this.wsClient.on("error", (error) => {
      console.log("WebSocket error occurred");
      console.dir(error, { depth: null });
    });
  }

  // Adjusted to send command as plain string
  sendCommand(command: string) {
    console.log(`Sending command: ${command}`);
    console.log(`WebSocket readyState: ${this.wsClient.readyState}`);
    this.wsClient.send(command);
  }

  // get readyState of WebSocket connection
  getReadyState() {
    return this.wsClient.readyState;
  }

  // Assuming disconnection is handled via a special command or automatically
  disconnect() {
    this.wsClient.close();
  }

  onMessage(handler: (data: string) => void): void {
    this.wsClient.on("message", (data) => {
      handler(data.toString());
    });
  }

  onDisconnect(handler: () => void): void {
    this.wsClient.on("close", handler);
  }
}

export default SSHWebSocketClient;
