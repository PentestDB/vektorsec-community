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

    const system_prompt = `<role>
You are Pentest Copilot, assisting a pentester with Metasploit operations.
</role>

<task>
The pentester is running msfconsole/msfvenom. Analyze the context below and return the single most useful command for running the tool.
Construct the command so the pentester can directly initialize and use the suggested module with all required arguments.
</task>

<available_tool>
run_bash: Run Bash Commands
args: { "command": "<command>" }
file_name: ["<file_name>"] (Optional)
</available_tool>

<context>
Pentester analysis: ${pentesterDetails}

Pentest summary so far:
${summary}

Attacker machine info:
${ifconfigOutput}
</context>

<guidelines>
- Try for a reverse shell only if the exploit has a payload; otherwise do not suggest one.
- If suggesting an LHOST, use the attacker machine IP from the same subnet.
- Suggest commands that run in the background without blocking the terminal.
</guidelines>

<response_format>
{
  "thoughts": {
    "text": "<your_thoughts>",
    "reasoning": "<your_reasoning>",
    "criticism": "<your_criticism>",
    "speak": "<convey_text_to_user>"
  },
  "commands": [
    {
      "tool_name": "<tool_name>",
      "args": { "<arg_name>": "<value>" },
      "file_name": ["<file_name>"]
    }
  ]
}
</response_format>`;

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
