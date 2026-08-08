import { Request, Response } from "express";
import TelegramUser from "../models/TelegramUser/TelegramUser.model";
import { isBotConfigured, isBotRunning, setBotToken, startTelegramBot, stopTelegramBot } from "../services/telegramBot.service";

/**
 * Telegram Bot controller.
 *
 * Exposes admin endpoints to configure and manage the Telegram bot,
 * plus a webhook endpoint for receiving updates (alternative to polling).
 */

/** GET /api/telegram/status — check bot configuration status. */
export const getBotStatus = async (_req: Request, res: Response) => {
  return res.status(200).json({
    configured: isBotConfigured(),
    running: isBotRunning(),
  });
};

/** POST /api/telegram/configure — set the bot token and start polling. */
export const configureBot = async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== "string") {
      return res.status(400).json({ message: "token is required" });
    }

    setBotToken(token.trim());
    startTelegramBot();

    return res.status(200).json({ message: "Telegram bot configured and started" });
  } catch (err: any) {
    console.error("[telegram] configureBot error:", err);
    return res.status(500).json({ message: "Failed to configure bot" });
  }
};

/** POST /api/telegram/stop — stop the polling loop. */
export const stopBot = async (_req: Request, res: Response) => {
  stopTelegramBot();
  return res.status(200).json({ message: "Telegram bot stopped" });
};

/** GET /api/telegram/users — list linked telegram users (admin). */
export const listTelegramUsers = async (_req: Request, res: Response) => {
  try {
    const users = await TelegramUser.find().sort({ lastSeenAt: -1 }).limit(100);
    return res.status(200).json(users);
  } catch (err: any) {
    console.error("[telegram] listTelegramUsers error:", err);
    return res.status(500).json({ message: "Failed to list telegram users" });
  }
};

/** POST /api/telegram/users/:telegramId/link — link a telegram user to a platform user. */
export const linkTelegramUser = async (req: Request, res: Response) => {
  try {
    const { telegramId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const tu = await TelegramUser.findOne({ telegramId });
    if (!tu) {
      return res.status(404).json({ message: "Telegram user not found" });
    }

    tu.userId = userId;
    tu.linked = true;
    await tu.save();

    return res.status(200).json({ message: "Telegram user linked", user: tu });
  } catch (err: any) {
    console.error("[telegram] linkTelegramUser error:", err);
    return res.status(500).json({ message: "Failed to link telegram user" });
  }
};

/** POST /api/telegram/users/:telegramId/unlink — unlink a telegram user. */
export const unlinkTelegramUser = async (req: Request, res: Response) => {
  try {
    const { telegramId } = req.params;

    const tu = await TelegramUser.findOne({ telegramId });
    if (!tu) {
      return res.status(404).json({ message: "Telegram user not found" });
    }

    tu.userId = undefined;
    tu.linked = false;
    await tu.save();

    return res.status(200).json({ message: "Telegram user unlinked" });
  } catch (err: any) {
    console.error("[telegram] unlinkTelegramUser error:", err);
    return res.status(500).json({ message: "Failed to unlink telegram user" });
  }
};
