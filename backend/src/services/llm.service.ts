import { chatCompletion, chatCompletion3 } from "../utils/openai/config";
import SessionsModel from "../models/Sessions/Sessions.model";
import { HistoryData } from "../types/copilot.types";

async function trackTokenUsage(
  sessionId: string,
  response: any,
  model: "large" | "small"
) {
  if (!sessionId || !response?.usage || !response?.content || !response?.usage?.total_tokens) {
    return;
  }

  const sessionData = await SessionsModel.findOne({ sessionId });
  if (!sessionData) return;

  if (model === "large") {
    sessionData.tokenHistory.push({
      content: response.content,
      usage: response.usage,
    });
    sessionData.totalTokens += response.usage.total_tokens;
  } else {
    sessionData.tokenHistory3.push({
      content: response.content,
      usage: response.usage,
    });
    sessionData.totalTokens3 += response.usage.total_tokens;
  }

  await sessionData.save();
}

export async function ask_gpt4_model(
  history: HistoryData[],
  sessionId: string,
  tries = 0
): Promise<{ success: boolean; content?: string }> {
  if (tries > 1) {
    throw new Error("Error Generating Completion - GPT4");
  }

  const history_to_send = history.map((item) => ({
    role: item.role,
    content: item.content,
  }));

  try {
    const response = await chatCompletion({
      history: history_to_send,
      model: "gpt-4",
    });

    if (response === null || response?.content === null) {
      throw new Error("Empty Response, retrying...");
    }

    await trackTokenUsage(sessionId, response, "large");

    return {
      success: true,
      content: response?.content,
    };
  } catch (e) {
    console.log(e);
    console.log("Retrying GPT-4");
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return await ask_gpt4_model(history, sessionId, tries + 1);
  }
}

export async function ask_gpt3_model(
  history: HistoryData[],
  sessionId: string,
  tries = 0
): Promise<{ success: boolean; content?: string }> {
  if (tries > 2) {
    throw new Error("Error Generating Completion - GPT3");
  }

  const history_to_send = history.map((item) => ({
    role: item.role,
    content: item.content,
  }));

  try {
    const response = await chatCompletion3({
      history: history_to_send,
      model: "gpt-3.5-turbo",
    });

    if (response === null || response?.content === null) {
      throw new Error("Empty Response, retrying...");
    }

    await trackTokenUsage(sessionId, response, "small");

    return {
      success: true,
      content: response?.content,
    };
  } catch (e) {
    console.log(e);
    console.log("Retrying GPT-3");
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return await ask_gpt3_model(history, sessionId, tries + 1);
  }
}
