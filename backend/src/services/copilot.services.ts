import { chatCompletion, chatCompletion3 } from "../utils/openai/config";
import SessionsModel, {
  loopHistoryDoc,
} from "../models/Sessions/Sessions.model";
import { fix_json_with_ai } from "../utils/jsonfix";
import { ask_gpt3_model } from "./session.services";
import { HistoryData, ContextData, SingleCommandData, CommandData, CopilotSessionData } from "../types/copilot.types";
import { getIfConfigKali, runCommandOnKali } from "./ssh.service";

export type { HistoryData, ContextData, SingleCommandData, CommandData, CopilotSessionData };
export { runCommandOnKali };

export const runRAGforMetasploit = async (
  response: any,
  commands: any,
  summary: string,
  session_id: string
) => {
  const pentesterDetails = response?.thoughts?.text;
  const ragQuery = response?.thoughts?.reasoning;

  console.log({
    pentesterDetails,
    ragQuery,
  });

  // const RAG_BEARER_TOKEN = await getSecrets("RAG-BEARER-TOKEN");
  // const RAG_URL = await getSecrets("RAG-URL");

  // const data = { queries: [{ query: ragQuery, top_k: 5 }] };

  try {
    // const database_query = await axios.post(RAG_URL, data, {
    //   headers: {
    //     "Content-Type": "application/json",
    //     Accept: "application/json",
    //     Authorization: `Bearer ${RAG_BEARER_TOKEN}`,
    //   },
    // });

    // const database_results = database_query.data?.results;

    // console.log(database_query.data);
    // console.log(database_query.data?.results);

    // let user_message_concat = "";

    // for (const result of database_results) {
    //   for (const innerResult of result.results) {
    //     const { text } = innerResult;

    //     if (text) {
    //       user_message_concat += `${text}\n`;
    //     }
    //   }
    // }
    const ifconfigOutput = await getIfConfigKali();

    const system_prompt = `
    You are Pentest Copilot and you are helping a pentester to do a penetration test. From the below conversation, you can see that the pentester is running msfconsole/msfvenom, return the most useful and likely command in the below format:
    
    Only return the command that is most likely to be used by the pentester in running the tool. If there are multiple commands, return the one that is most likely to be used by the pentester.
    
    Plugin available to run msfconsole: run_bash: Run Bash Commands, args: "command": "<command>", file_name: ["file_name"] (Optional)\n 

    Make the command such that the pentester can directly initialize/use the module suggsted including all the command arguments.".

    For example, if the pentester is running msfconsole, you can return the following in a similar format for commands:
     commands: [
      {
        plugin_name: "run_bash",
        args: { "command": "msfconsole [OPTIONS that helps run the module/payload]"},
        file_name: ["<file_name>"],
      },
    ],
    
    ${pentesterDetails}

    Summary of the pentest so far:
    ${summary}

    Attacker Machine Information:
    ${ifconfigOutput}

    Guidelines:
    1. Try for a reverse shell if the exploit actually has a payload, else do not suggest a reverse shell payload.
    2. Based on the attacker machine information, if you want to suggest an LHOST you can use the IP address of the attacker machine in the same subnet.
    3. Always suggest a command in a way so that it runs in the background and does not block the terminal.

    Return in JSON format:
    {
      "thoughts": {
        text: "<your_thoughts>",
        reasoning: "<your_reasoning>",
        criticism: "<your_criticism>",
        speak: "<convey_text_to_user>",
      },
      "commands": [
        {
          plugin_name: "<plugin_name>",
          args: { "<arg_name>": "<value>" },
          file_name: ["<file_name>"],
        },
        // one more command can be added if it is a parallel process
      ],
    }
 `;

    const messages: HistoryData[] = [];
    messages.push({ role: "system", content: system_prompt });
    let user_message_concat = "";
    user_message_concat += `\nThis is my query that I ran in my metasploit database: ${ragQuery}`;

    user_message_concat += `\nI want to use msfconsole on bash shell to run the module/payload. Please suggest an appropriate module/payload to exploit/check for. Please return the proper formatted command in JSON.\n`;

    messages.push({ role: "user", content: user_message_concat });

    console.dir(messages, { depth: null });

    const gptResponse = await chatCompletion({
      history: messages,
      model: "gpt-4",
    });

    console.log("GPT RES", gptResponse?.content);

    if (gptResponse?.content === null) {
      throw new Error("Empty Response");
    }

    const fixedRes = await fix_json_with_ai(
      ask_gpt3_model,
      gptResponse?.content,
      "command",
      session_id
    );

    console.log({ fixedRes });

    return fixedRes;
  } catch (e) {
    console.log(e);
    return commands;
  }
};
