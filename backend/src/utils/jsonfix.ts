import { HistoryData } from "../services/copilot.services";

const COMMAND_JSON_FIX_PROMPT = `The Response needs to strictly be in the following format:

{
  "thoughts": {
    "text": "<your_thoughts>",
    "reasoning": "<your_reasoning>",
    "criticism": "<your_criticism>",
    "speak": "<convey_text_to_user>",
  },
  "commands": [
    {
      "plugin_name": "<plugin_name>",
      "args": { "<arg_key>": "<arg_value>" }
    }
  ]
}

The following things need to be in consideration:
- Please note that any additional text or broken JSON should be removed, and only the fixed JSON should be returned.
- If there's any text before and after the JSON object, it should be removed and only the valid JSON object should be returned. For Example: \n
  "This is some text before the JSON object. \n
{
  "thoughts": {
    "text": "<your_thoughts>",
    "reasoning": "<your_reasoning>",
    "criticism": "<your_criticism>",
    "speak": "<convey_text_to_user>",
  },
  "commands": [
    {
      "plugin_name": "<plugin_name>",
      "args": { "<arg_key>": "<arg_value>" }
    }
  ]
}\n
  "This is some text after the JSON object. \n

  Should be converted to: \n
 {
  "thoughts": {
    "text": "<your_thoughts>",
    "reasoning": "<your_reasoning>",
    "criticism": "<your_criticism>",
    "speak": "<convey_text_to_user>",
  },
  "commands": [
    {
      "plugin_name": "<plugin_name>",
      "args": { "<arg_key>": "<arg_value>" }
      "file_name": ["<file_name>"] // This is an optional field
    }
  ]
}\n     
- If quotes are not escaped in the response i.e. " is present instead of \" then the quotes need to be escaped.
- If commas are not placed in a way that represent a proper json object then additional commas must be added.
- If one or more heading are missing or different from the given format, they need to be corrected to fit the format.
- If brackets are missing or extra which make the json object invalid, they should be added/removed.
- You can only return the raw JSON object. Do not return any other text. If there is extra text before or after the JSON object, remove it.
- If the JSON is already in the correct format, then you can just return the JSON object as it is.`;

const TODO_JSON_FIX_PROMPT = `The Response needs to strictly be in the following format:
{
    todo: [
      {
        step: "<step_number>",
        title: "<step_title>",
        status: "<step_status>",
        substeps: [
          {
            substep: "<substep_number>",
            title: "<substep_title>",
            status: "<status>",
            command: "<command>",
          },
        ],
      },
      {
        step: "<next_step_number>",
        title: "<step_title>",
        status: "<step_status>",
        substeps: [
          {
            substep: "<substep_number>",
            title: "<substep_title>",
            status: "<status>",
            command: "<command>",
          },
        ],
      },
    ],
  }

The following things need to be in consideration:
- Please note that any additional text or broken JSON will be removed, and only the fixed JSON will be returned.
- If quotes are not escaped in the response i.e. " is present instead of \" then the quotes need to be escaped.
- If commas are not placed in a way that represent a proper json object then additional commas must be added.
- Ensure "todo" field is present and is an array of objects with specified above structure.
- If one or more heading are missing or different from the given format, they need to be corrected to fit the format.
- If brackets are missing or extra which make the json object invalid, they should be added/removed.
- You can only return the raw JSON object. Do not return any other text. If there is extra text before or after the JSON object, remove it.
- If the JSON is already in the correct format, then you can just return the JSON object as it is.`;

const SUMMARY_JSON_FIX_PROMPT = `The Response needs to strictly be in the following format:

{
    "summary": "summary of the session so far", 
    "nextSteps": "next steps to be performed"
}.

The following things need to be in consideration:
- Please note that any additional text or broken JSON will be removed, and only the fixed JSON will be returned.
- If quotes are not escaped in the response i.e. " is present instead of \" then the quotes need to be escaped.
- If commas are not placed in a way that represent a proper json object then additional commas must be added.
- If one or more heading are missing or different from the given format, they need to be corrected to fit the format.
- If brackets are missing or extra which make the json object invalid, they should be added/removed.
- You can only return the raw JSON object. Do not return any other text. If there is extra text before or after the JSON object, remove it.
- If the JSON is already in the correct format, then you can just return the JSON object as it is.`;

const CONTINUE_JSON_FIX_PROMPT = `The Response needs to strictly be in the following format:
{
  "continue": true
}
or 
{
  "continue": false
}
`;

function extractJSON(inputStr: string): string | null {
  const regex = /{[\s\S]*}/;
  const match = inputStr.match(regex);
  return match ? match[0] : null;
}

export async function fix_json_with_ai(
  ask_gpt3_model: any,
  badjson: any = null,
  type: string = "command",
  sessionId: string = ""
): Promise<any> {
  const system_prompt: string =
    "You are a JSON Formatter AI which can correct a wrongly formatted JSON String. You are given a response from the user to identify the JSON in the response and correct it if it's wrong. You need to fix the JSON and return the raw JSON. If there is extra text before or after the JSON object, you can remove it. You can only return the correct formatted raw JSON object. Do not return any other text.";
  let template: string = COMMAND_JSON_FIX_PROMPT;
  if (type === "todo") {
    template = TODO_JSON_FIX_PROMPT;
  }
  if (type === "summary") {
    template = SUMMARY_JSON_FIX_PROMPT;
  }
  if (type === "continue") {
    template = CONTINUE_JSON_FIX_PROMPT;
  }

  let badjsonStr: string = String(badjson);

  if (["command", "summary"].includes(type)) {
    badjsonStr = extractJSON(badjsonStr) || badjsonStr; // Extract JSON if possible, otherwise use the original string
  }

  badjsonStr = badjsonStr.trim();

  let is_valid_json: boolean = true;

  try {
    let jsonTest = JSON.parse(badjsonStr);
    if (type === "command") {
      if (jsonTest["thoughts"] != null) {
        if (jsonTest["thoughts"]["text"] == null) {
          console.log("BadJsonFR no text");
          is_valid_json = false;
        }
        if (jsonTest["thoughts"]["reasoning"] == null) {
          console.log("BadJsonFR no reasoning");
          is_valid_json = false;
        }
        if (jsonTest["thoughts"]["criticism"] == null) {
          console.log("BadJsonFR no criticism");
          is_valid_json = false;
        }
        if (jsonTest["thoughts"]["speak"] == null) {
          console.log("BadJsonFR no speak");
          is_valid_json = false;
        }
      } else {
        console.log("BadJSONFR no thoughts");
        is_valid_json = false;
      }

      if (jsonTest["commands"] != null) {
        for (let i = 0; i < jsonTest["commands"].length; i++) {
          if (jsonTest["commands"][i]["plugin_name"] == null) {
            console.log("BadJSONFR no plugin_name");
            is_valid_json = false;
          }
          if (jsonTest["commands"][i]["args"] == null) {
            console.log("BadJSONFR no args");
            is_valid_json = false;
          }
        }
      } else {
        console.log("BadJSONFR no Commands");
        is_valid_json = false;
      }
    } else if (type === "summary") {
      if (jsonTest["summary"] == null) {
        console.log("BadJsonFR no summary");
        is_valid_json = false;
      }
      if (jsonTest["nextSteps"] == null) {
        console.log("BadJsonFR no reasoning");
        is_valid_json = false;
      }
    } else if (type === "todo") {
      if (jsonTest["todo"] == null) {
        console.log("BadJsonFR: todo should be an array");
        is_valid_json = false;
      } else {
        for (let todo of jsonTest["todo"]) {
          if (todo["step"] === null) {
            console.log("BadJsonFR: missing or invalid step");
            is_valid_json = false;
          }
          if (todo["title"] === null) {
            console.log("BadJsonFR: missing or invalid title");
            is_valid_json = false;
          }
          if (todo["status"] === null) {
            console.log("BadJsonFR: missing or invalid status");
            is_valid_json = false;
          }
          if (todo["substeps"] && Array.isArray(todo["substeps"])) {
            for (let substep of todo["substeps"]) {
              if (substep["step"] === null) {
                console.log("BadJsonFR: missing or invalid substep step");
                is_valid_json = false;
              }
              if (substep["title"] === null) {
                console.log("BadJsonFR: missing or invalid substep title");
                is_valid_json = false;
              }
              if (substep["status"] === null) {
                console.log("BadJsonFR: missing or invalid substep status");
                is_valid_json = false;
              }
            }
          }
        }
      }
    } else {
      console.log("BadJsonFR no continue");
      is_valid_json = false;
    }

    if (is_valid_json) {
      console.log("JSON cleared");
      return jsonTest;
    } else {
      throw new Error("Bad JSON, trying to fix");
    }
  } catch (error) {
    console.log("Error in parsing JSON trying to fix: ", error);
    is_valid_json = false;
    let retries = 0;

    while (!is_valid_json && retries < 5) {
      console.log("\n========\nBad JSON\n", badjsonStr + "\n========\n");

      const history: HistoryData[] = [];

      history.push({
        role: "system",
        content: system_prompt,
      });

      history.push({
        role: "user",
        content:
          "Fix the JSON below, do not respond with anything except the Raw JSON:\n\n" +
          badjsonStr +
          "\n\n" +
          template,
      });

      const { content: response } = await ask_gpt3_model(history, sessionId);

      badjsonStr = response;
      try {
        const parsedResponse: any = JSON.parse(response);
        is_valid_json = true;
        return parsedResponse;
      } catch (error) {
        console.log("Error in parsing JSON retrying: ");
        is_valid_json = false;
        retries++;
        if (retries === 5) {
          throw new Error("JSON Fixing Failed");
        }
      }
    }
  }
}
