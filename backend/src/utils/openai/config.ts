import OpenAI from "openai";
import { HistoryData } from "../../services/copilot.services";
import getSecrets from "../getSecrets";

export const chatCompletion = async ({
  history = [],
  model = "gpt-4",
  format = "json",
}: {
  history: HistoryData[];
  model: string;
  format?: string;
}) => {
  try {


    const MODEL_API_KEY_LARGE = await getSecrets("MODEL_API_KEY_LARGE");
    const LLM_MODEL = await getSecrets("MODEL_LARGE");
    const MODEL_BASE_PATH_LARGE = await getSecrets("MODEL_BASE_PATH_LARGE");

    const openai = new OpenAI({
      apiKey: MODEL_API_KEY_LARGE,
    });

    if (MODEL_BASE_PATH_LARGE) {
      openai.baseURL = MODEL_BASE_PATH_LARGE;
    }

    const completionConfig: any = {
      model: LLM_MODEL,
      messages: history,
      temperature: 0.75,
    };

    if (format === "json") {
      completionConfig.response_format = { type: "json_object" };
    }

    console.log("completionConfig", completionConfig)

    const response = await openai.chat.completions.create(completionConfig);

    const content = response.choices[0].message.content;

    console.log("response", content)
    const usage = response.usage;

    return {
      content,
      usage,
    };
  } catch (error) {
    console.log(error);
  }
};

export const chatCompletion3 = async ({
  history = [],
  model = "gpt-3.5-turbo-1106",
  format = "json",
}: {
  history: HistoryData[];
  model: string;
  format?: string;
}) => {
  try {

    const MODEL_API_KEY_SMALL = await getSecrets("MODEL_API_KEY_SMALL");
    const MODEL_SMALL = await getSecrets("MODEL_API_KEY");
    const MODEL_BASE_PATH_SMALL = await getSecrets("MODEL_BASE_PATH_SMALL");

    const openai = new OpenAI({
      apiKey: MODEL_API_KEY_SMALL,
    });

    if (MODEL_BASE_PATH_SMALL) {
      openai.baseURL = MODEL_BASE_PATH_SMALL;
    }

    const completionConfig: any = {
      model: MODEL_SMALL,
      messages: history,
      temperature: 0.75,
    };

    if (format === "json") {
      completionConfig.response_format = { type: "json_object" };
    }

    const response = await openai.chat.completions.create(completionConfig);

    const content = response.choices[0].message.content;
    const usage = response.usage;

    return {
      content,
      usage,
    };
  } catch (error) {
    console.log(error);
  }
};
