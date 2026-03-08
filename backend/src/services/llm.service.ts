import { invoke_llm } from "../utils/llm/providers";
import SessionsModel from "../models/Sessions/Sessions.model";
import { HistoryData } from "../types/copilot.types";

async function trackTokenUsage(
  sessionId: string,
  response: { content: string | null; usage: any }
) {
  if (!sessionId || !response?.usage || !response?.content || !response?.usage?.total_tokens) {
    return;
  }

  const sessionData = await SessionsModel.findOne({ sessionId });
  if (!sessionData) return;

  sessionData.tokenHistory.push({
    content: response.content,
    usage: response.usage,
  });
  sessionData.totalTokens += response.usage.total_tokens;

  await sessionData.save();
}

export async function invoke_llm_with_retry(
  history: HistoryData[],
  sessionId: string,
  opts: { format?: "json" | "text"; temperature?: number; maxRetries?: number } = {}
): Promise<{ success: boolean; content?: string }> {
  const { format = "json", temperature, maxRetries = 2 } = opts;
  let tries = 0;

  while (true) {
    try {
      const response = await invoke_llm({
        messages: history.map((h) => ({ role: h.role, content: h.content })),
        format,
        temperature,
      });

      if (response.content === null) {
        throw new Error("Empty response from LLM");
      }

      await trackTokenUsage(sessionId, response);

      return { success: true, content: response.content };
    } catch (e) {
      tries++;
      console.log(e);
      if (tries > maxRetries) {
        throw new Error("Error generating LLM completion after retries");
      }
      console.log(`[llm] Retrying (${tries}/${maxRetries})...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}
