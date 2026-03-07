import axios from "axios";
import { ToolDefinition } from "../types";

export const netcatListenerTool: ToolDefinition = {
  name: "netcat_listener",
  description: "Open a netcat listener on a port for a possible reverse shell connection",
  args: {
    lport: {
      type: "string",
      required: true,
      description: "The local port to listen on",
    },
  },
  async execute({ args }) {
    return args.output ?? "";
  },
};

export const netcatOperations = {
  async start({ netcat_id, port, ip }: { netcat_id: string; port: string; ip: string }) {
    const response = await axios.post(`http://${ip}:5000/api/start_netcat`, {
      netcat_id,
      port,
    });

    if (response.status !== 200) {
      throw new Error("Error starting netcat listener");
    }

    return response.data;
  },

  async sendInput({ netcat_id, input, ip }: { netcat_id: string; input: string; ip: string }) {
    const response = await axios.post(`http://${ip}:5000/api/send_netcat_input`, {
      netcat_id,
      input,
    });

    if (response.status !== 200) {
      throw new Error("Error sending netcat input");
    }

    return response.data;
  },

  async stop({ netcat_id, ip }: { netcat_id: string; ip: string }) {
    const response = await axios.post(`http://${ip}:5000/api/stop_netcat`, {
      netcat_id,
    });

    if (response.status !== 200) {
      throw new Error("Error stopping netcat listener");
    }

    return response.data;
  },
};
