import { Router } from "express";
import {
  getBotStatus,
  configureBot,
  stopBot,
  listTelegramUsers,
  linkTelegramUser,
  unlinkTelegramUser,
} from "../controllers/telegramBot.controller";

const router = Router();

// Bot configuration & status
router.get("/status", getBotStatus);
router.post("/configure", configureBot);
router.post("/stop", stopBot);

// Telegram user management (admin)
router.get("/users", listTelegramUsers);
router.post("/users/:telegramId/link", linkTelegramUser);
router.post("/users/:telegramId/unlink", unlinkTelegramUser);

export { router as telegramBotRoutes };
