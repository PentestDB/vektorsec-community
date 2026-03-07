import { HistoryData } from "../services/copilot.services";

function commonJsonFixRules(additionalRules = ""): string {
  return `<rules>
- Remove any text before or after the JSON object — return only valid JSON.
- Escape unescaped quotes where needed.
- Fix comma placement to form proper JSON.
- Correct missing or misnamed fields to match the required format.
- Add or remove brackets as needed to produce valid JSON.${additionalRules}
- If the JSON is already correct, return it as-is.
</rules>`;
}

const COMMAND_JSON_FIX_PROMPT = `<required_format>
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
      "args": { "<arg_key>": "<arg_value>" },
      "file_name": ["<file_name>"]
    }
  ]
}
</required_format>

${commonJsonFixRules()}`;

const TODO_JSON_FIX_PROMPT = `<required_format>
{
  "todo": [
    {
      "step": "<step_number>",
      "title": "<step_title>",
      "status": "<step_status>",
      "substeps": [
        {
          "substep": "<substep_number>",
          "title": "<substep_title>",
          "status": "<status>",
          "command": "<command>"
        }
      ]
    }
  ]
}
</required_format>

${commonJsonFixRules('\n- Ensure the "todo" field is present and is an array of objects matching the structure above.')}`;

const SUMMARY_JSON_FIX_PROMPT = `<required_format>
{
  "summary": "<summary of the session so far>",
  "nextSteps": "<next steps to be performed>"
}
</required_format>

${commonJsonFixRules()}`;

const CONTINUE_JSON_FIX_PROMPT = `<required_format>
{ "continue": true }
or
{ "continue": false }
</required_format>

${commonJsonFixRules()}`;

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
  const system_prompt: string = `<role>
You are a JSON Formatter AI. Your task is to extract and fix malformed JSON from user input.
</role>

<rules>
- Identify the JSON object in the response and correct any formatting issues.
- Return only the raw, correctly formatted JSON object.
- Remove any non-JSON text before or after the JSON object.
- Do not include any explanatory text in your response.
</rules>`;
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
          if (jsonTest["commands"][i]["tool_name"] == null) {
            console.log("BadJSONFR no tool_name");
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
