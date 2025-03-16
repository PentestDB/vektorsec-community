import express from "express";
import {
  exploitBoxStatus,
  startupNewTask,
  extendTaskExpiration,
} from "../controllers/task.controller";
import { verifySess } from "../middlewares/VerifySession.middleware";

const router = express.Router();

router.post("/spin-up", [verifySess], startupNewTask);

// Check existing containers, if none returns err
router.get("/check-exploit-box/:sessionId", [verifySess], exploitBoxStatus);

router.post("/extend-container-expiration", [verifySess], extendTaskExpiration);


export { router as taskRoutes };
