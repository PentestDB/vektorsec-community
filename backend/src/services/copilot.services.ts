import { chatCompletion, chatCompletion3 } from "../utils/openai/config";

import SessionsModel, {
  loopHistoryDoc,
} from "../models/Sessions/Sessions.model";
import mongoose from "mongoose";
import axios from "axios";
import getSecrets from "../utils/getSecrets";
import { fix_json_with_ai } from "../utils/jsonfix";
import { ask_gpt3_model } from "./session.services";

export interface HistoryData {
  role: "user" | "assistant" | "system";
  content: string;
  isContextual?: boolean;
  loopStep?: number;
}

export interface ContextData {
  summary: string;
  nextSteps: string;
}

export interface SingleCommandData {
  _id?: mongoose.Types.ObjectId;
  plugin_name: string;
  args: {
    [key: string]: string;
  };
  file_name?: string[];
  active: boolean;
  loop: number;
}

export interface CommandData {
  thoughts: {
    text: string;
    reasoning: string;
    criticism: string;
    speak: string;
  };
  commands: SingleCommandData[];
}

export interface CopilotSessionData {
  uid: string;
  sessionId: string;
  history: HistoryData[];
  context?: ContextData;
  command: CommandData;
  isMainThread: number;
  todo: any;
  mainSessionId?: string;
  scans?: any;
  subprocess?: any;
  netcat?: any;
  previousContexts?: ContextData[];
}


async function ask_gpt4_model(
  history: HistoryData[],
  sessionId: string
): Promise<any> {
  const history_to_send = history.map((item) => {
    return {
      role: item.role,
      content: item.content,
    };
  });

  try {
    const response = await chatCompletion({
      history: history_to_send,
      model: "gpt-4",
    });

    if (response === null || response?.content === null) {
      throw new Error("Empty Response, retrying...");
    }

    if (sessionId) {
      const sessionData = await SessionsModel.findOne({
        sessionId,
      });

      if (sessionData && response && response.usage) {
        sessionData.tokenHistory.push({
          content: response.content,
          usage: response.usage,
        });

        sessionData.totalTokens += response.usage.total_tokens;

        await sessionData.save();
      }
    }

    return response?.content;
  } catch (e) {
    console.log(e);
    console.log("Retrying GPT-4");
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return await ask_gpt4_model(history, sessionId);
  }
}

export const runRAGforMetasploit = async (
  response: any,
  commands: any,
  session_id: string
) => {
  const pentesterDetails = response?.thoughts?.text;
  const ragQuery = response?.thoughts?.reasoning;

  console.log({
    pentesterDetails,
    ragQuery,
  });

  const RAG_BEARER_TOKEN = await getSecrets("RAG-BEARER-TOKEN");
  const RAG_URL = await getSecrets("RAG-URL");

  const data = { queries: [{ query: ragQuery, top_k: 5 }] };

  try {
    const database_query = await axios.post(RAG_URL, data, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${RAG_BEARER_TOKEN}`,
      },
    });

    const database_results = database_query.data?.results;

    console.log(database_query.data);
    console.log(database_query.data?.results);

    let user_message_concat = "";

    for (const result of database_results) {
      for (const innerResult of result.results) {
        const { text } = innerResult;

        if (text) {
          user_message_concat += `${text}\n`;
        }
      }
    }

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

    Guidelines:
    1. Try for a reverse shell if the exploit actually has a payload, else do not suggest a reverse shell payload.

    Return in JSON format:
    {
    thoughts: {
      text: "<your_thoughts>",
      reasoning: "<your_reasoning>",
      criticism: "<your_criticism>",
      speak: "<convey_text_to_user>",
    },
    commands: [
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

    user_message_concat += `\nThis is my query that I ran in my database: ${ragQuery}`;

    user_message_concat += `\nI want to use msfconsole on bash shell to run the module/payload suggested above. Please return the proper formatted command.\n`;

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
