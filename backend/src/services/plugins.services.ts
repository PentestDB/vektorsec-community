import axios from "axios";
import { google } from "googleapis";
import getSecrets from "../utils/getSecrets";

export const PluginInventory = {
  run_bash: (
    commandId: string,
    command_args: {
      command?: string;
      output?: string;
    },
    choice: string
  ) => {
    if (["yes", "edit"].includes(choice)) {
      const uniqueMarker = commandId;
      const terminalCommand = `echo "<command_id_start>${uniqueMarker}</command_id_start>"; ${command_args.command} ;echo "<command_id_end>${uniqueMarker}</command_id_end>";`;

      console.log("🔍 Terminal command:", terminalCommand);
      return terminalCommand;
    } else {
      return command_args.output;
    }
  },
  // searchsploit: async (commandId: string, command_args: { query?: string; output?: string }, choice: string) => {
  //   if (["yes", "edit"].includes(choice)) {
  //     const terminalCommand = `echo "Running searchsploit - ${commandId}" && ${command_args.command} && echo "Command - ${commandId} - finished"\r`;
  //     return terminalCommand;
  //   } else {
  //     return command_args.output;
  //   }
  // },
  googleSearch: async (
    command_args: {
      query?: string;
      output?: string;
    },
    choice: string,
    numResults = 5
  ) => {
    try {
      if (["yes", "edit"].includes(choice)) {
        // Get the Google API key and Custom Search Engine ID from environment variables
        const apiKey = await getSecrets("GOOGLE-API-KEY");
        const customSearchEngineId = await getSecrets(
          "CUSTOM-SEARCH-ENGINE-ID"
        );

        // Initialize the Custom Search API service
        const service = google.customsearch("v1");
        const result = await service.cse.list({
          auth: apiKey,
          cx: customSearchEngineId,
          q: command_args.query, // Use the provided query or modify it for better results
          num: numResults,
        });

        // Extract the search result items from the response
        const searchResults: any = result.data.items || [];

        // Create an array to store detailed results about each URL
        const detailedResults: any[] = [];

        // Iterate through the search results and fetch more details (you may need to use additional APIs for more detailed info)
        for (const item of searchResults) {
          const url = item.link;
          // Add more fields to fetch specific information about each URL
          const details = {
            title: item.title,
            snippet: item.snippet,
            url: url,
            // Add more fields as needed, such as page content, backlinks, mentions, etc.
          };

          // Push the detailed result into the array
          detailedResults.push(details);
        }

        return (
          JSON.stringify(detailedResults) ?? "No Google search results found."
        );
      } else {
        return command_args.output ?? "No Google search results found.";
      }
    } catch (error: any) {
      // Handle errors in the API call
      if (error.response && error.response.data.error) {
        const errorDetails = error.response.data.error;
        if (
          errorDetails.code === 403 &&
          errorDetails.message.includes("invalid API key")
        ) {
          return "Error: The provided Google API key is invalid or missing.";
        } else {
          return `Error: ${error}`;
        }
      }
      return `Error: ${error}`;
    }
  },
  generic_response: (response: any): any => {},

  netcat_listener: {
    start: async ({ netcat_id, port, ip }: any) => {
      const response = await axios.post(`http://${ip}:5000/api/start_netcat`, {
        netcat_id: netcat_id,
        port: port,
      });

      if (response.status !== 200) {
        throw new Error("Error starting netcat listener");
      }

      return response.data;
    },
    sendInput: async ({ netcat_id, input, ip }: any) => {
      const response = await axios.post(
        `http://${ip}:5000/api/send_netcat_input`,
        {
          netcat_id,
          input: input,
        }
      );

      if (response.status !== 200) {
        throw new Error("Error sending netcat input");
      }

      return response.data;
    },
    stop: async ({ netcat_id, ip }: any) => {
      const response = await axios.post(`http://${ip}:5000/api/stop_netcat`, {
        netcat_id: netcat_id,
      });

      if (response.status !== 200) {
        throw new Error("Error sending netcat input");
      }

      return response.data;
    },
  },
  msfvenom_payload: async (
    commandId: string,
    command_args: {
      lhost?: string;
      lport?: string;
      file_name?: string;
      file_format?: string;
      payload?: string;
      output?: string;
    },
    choice: string
  ) => {
    console.log(command_args);
    if (["yes", "edit"].includes(choice)) {
      const cmd = `msfvenom -p ${command_args.payload} LHOST=${command_args.lhost} LPORT=${command_args.lport} -f ${command_args.file_format} > ${command_args.file_name}`;
      const terminalCommand = `echo "Running command - ${commandId}" ; ${cmd} ; echo "Command - ${commandId} - finished"\n`;
      return terminalCommand;
    } else {
      return command_args.output;
    }
  },
};
