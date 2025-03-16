import express from "express";
import {
  checkUserSession,
  loginUser,
  // googleOauthHandler,
  // verifyBugBaseLogin,
  // initiateLoginWithBugBase,
  logout,
  registerUser,
  // checkUserKYC,
} from "../controllers/auth.controller";
import { verifySess } from "../middlewares/VerifySession.middleware";

const router = express.Router();

// router.post("/oauth/google", googleOauthHandler);

// router.post("/login/bugbase", initiateLoginWithBugBase);

// router.post("/verify-bugbase-login", verifyBugBaseLogin);

router.post("/login", loginUser)

router.post("/register", registerUser);


router.post("/logout", logout);

router.get("/status", checkUserSession);

// router.post("/user-kyc", [verifySess], checkUserKYC);

export { router as authRoutes };
