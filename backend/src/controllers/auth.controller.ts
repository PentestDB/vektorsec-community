import { Request, Response } from "express";
import axios from "axios";
import qs from "qs";
import UserModel, { UserDoc } from "../models/User/User.model";
import LoginSessionModel from "../models/LoginSession/LoginSession.model";
import EarlyAccessModel from "../models/EarlyAccess/EarlyAccess.model";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";

require("dotenv").config();

import getSecrets from "../utils/getSecrets";
import geoip from "geoip-lite";
import crypto from "crypto";
// interface GoogleOauthToken {
//   access_token: string;
//   id_token: string;
//   expires_in: number;
//   refresh_token: string;
//   token_type: string;
//   scope: string;
// }

// const getGoogleOauthToken = async ({ code }: { code: string }) => {
//   const rootURl = "https://oauth2.googleapis.com/token";

//   const GOOGLE_OAUTH_CLIENT_ID = await getSecrets("GOOGLE-OAUTH-CLIENT-ID");
//   const GOOGLE_OAUTH_CLIENT_SECRET = await getSecrets(
//     "GOOGLE-OAUTH-CLIENT-SECRET"
//   );
//   const BASE_URL_FRONTEND = await getSecrets("BASE_URL_FRONTEND");
//   const GOOGLE_OAUTH_REDIRECT_URL = await getSecrets(
//     "GOOGLE-OAUTH-REDIRECT-URL"
//   );

//   const options = {
//     code,
//     client_id: GOOGLE_OAUTH_CLIENT_ID,
//     client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
//     redirect_uri: `${BASE_URL_FRONTEND}${GOOGLE_OAUTH_REDIRECT_URL}`,
//     grant_type: "authorization_code",
//   };
//   try {
//     const { data } = await axios.post(rootURl, qs.stringify(options), {
//       headers: {
//         "Content-Type": "application/x-www-form-urlencoded",
//       },
//     });

//     return data;
//   } catch (err: any) {
//     console.log("Failed to fetch Google Oauth Tokens");
//     throw new Error(err);
//   }
// };

// interface GoogleUserResult {
//   id: string;
//   email: string;
//   verified_email: boolean;
//   name: string;
//   given_name: string;
//   family_name: string;
//   picture: string;
//   locale: string;
// }

// async function getGoogleUser({
//   id_token,
//   access_token,
// }: {
//   id_token: string;
//   access_token: string;
// }): Promise<GoogleUserResult> {
//   try {
//     const { data } = await axios.get<GoogleUserResult>(
//       `https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${access_token}`,
//       {
//         headers: {
//           Authorization: `Bearer ${id_token}`,
//         },
//       }
//     );

//     return data;
//   } catch (err: any) {
//     console.log(err);
//     throw Error(err);
//   }
// }

// export const googleOauthHandler = async (req: Request, res: Response) => {
//   try {
//     const DEPLOYMENT = await getSecrets("DEPLOYMENT");

//     const { code, state, antiCSRF } = req.body;

//     if (!code) {
//       return res
//         .status(401)
//         .json({ message: "Authorization code not provided!" });
//     }

//     const antiCSRFfromState = JSON.parse(state ?? "{}")?.antiCSRF;

//     if (antiCSRF !== antiCSRFfromState) {
//       return res.status(400).json({
//         message: "Request Details Mismatch, Please try to login again!",
//       });
//     }

//     // Use the code to get the id and access tokens
//     const { id_token, access_token } = await getGoogleOauthToken({ code });

//     // Use the token to get the User
//     const { name, verified_email, email, picture } = await getGoogleUser({
//       id_token,
//       access_token,
//     });

//     // Check if user is verified
//     if (!verified_email) {
//       return res.status(403).json({ message: "Google account not verified" });
//     }

//     // Check if user already exist in the database
//     let user: UserDoc | null = await UserModel.findOne({ email });

//     // if (user) {
//     //   user.profilePicture = picture;
//     //   user.name = name;
//     // } else {
//     //   user = await  new UserModel({
//     //     name,
//     //     email,
//     //     profilePicture: picture,
//     //   }).save();
//     // }

//     // if (!user.billing.customerId) {
//     //   const customerId = await createStripeInitialUserContact(user);
//     //   user.billing.customerId = customerId;
//     // // }

//     if (user) {
//       // Update user's profile picture


//       await user.save();

//     } else {
//       // Create a new user
//       user = new UserModel({
//         name,
//         email,
//         profilePicture: picture,
//       });

//       // generate unique 6 digit alphanumeric referral code
//       let referral = Math.random().toString(36).substring(2, 8).toUpperCase();

//       let duplicateReferral = await UserModel.findOne({
//         referralCode: referral,
//       });

//       while (duplicateReferral) {
//         referral = Math.random().toString(36).substring(2, 8).toUpperCase();

//         duplicateReferral = await UserModel.findOne({
//           referralCode: referral,
//         });
//       }

//       user.referralCode = referral;

//       // user.firstLogin = false;

//       await user.save();
//     }

//     const head = req.headers["x-forwarded-for"] as string;
//     let headIp = null;
//     if (head) {
//       headIp = head.split(",")[0];
//     }

//     const ip = headIp ?? req.socket.remoteAddress;

//     if (ip) {
//       user.ip = ip;
//       const geo = geoip.lookup(ip);

//       if (geo) {
//         user.ipLocation = {
//           ...geo,
//           ip: ip,
//         };
//       }
//     }

//     await user.save();

//     if (user.firstLogin) {
//       const COPILOT_LAMBDA_KEY = await getSecrets(
//         "BUGBASE-CREATE-ACC-LAMBDA-KEY"
//       );
//       const BUGBASE_CREATE_ACC_LAMBDA = await getSecrets(
//         "BUGBASE-CREATE-ACC-LAMBDA"
//       );

//       if (BUGBASE_CREATE_ACC_LAMBDA) {
//         try {
//           await axios.post(
//             BUGBASE_CREATE_ACC_LAMBDA,
//             {
//               email: user.email,
//               deployment: DEPLOYMENT,
//             },
//             {
//               headers: {
//                 "Content-Type": "application/json",
//                 "x-functions-key": COPILOT_LAMBDA_KEY,
//               },
//             }
//           );
//           console.log("Created BugBase USER");
//         } catch (error) {
//           console.log("Failed to create BugBase USER");
//           console.log(error);
//         }
//       }
//     }

//     req.session.user = {
//       userId: user._id.toString(),
//     };

//     // saving the session
//     req.session.save(function (err) {
//       if (err) {
//         console.log(err);
//         return res.status(400).json({ message: "Failed to save session!" });
//       }
//     });
//     const secretKey = await getSecrets("INTERCOM-SECRET"); // secret key (keep safe!)
//     const userIdentifier = user.email; // user's email address

//     const hash = crypto
//       .createHmac("sha256", secretKey)
//       .update(userIdentifier)
//       .digest("hex");

//     return res.status(200).json({
//       message: "User logged in successfully",
//       state: state,
//       user: {
//         uid: user._id,
//         name: user.name,
//         email: user.email,
//         profilePicture: user.profilePicture,
//         plan: user.billing.plan,
//         user_hash: hash,
//       },
//     });
//   } catch (err: any) {
//     console.log("Failed to authorize Google User", err);
//     return res.status(500).json({ message: "Failed to authorize user" });
//     // return res.redirect(`${config.get<string>("origin")}/oauth/error`);
//   }
// };


// export const initiateLoginWithBugBase = async (req: Request, res: Response) => {
//   try {
//     const COPILOT_LAMBDA_KEY = await getSecrets("BUGBASE-LOGIN-LAMBDA-KEY");
//     const DEPLOYMENT = await getSecrets("DEPLOYMENT");
//     const BUGBASE_LOGIN_LAMBDA = await getSecrets("BUGBASE-LOGIN-LAMBDA");

//     if (!BUGBASE_LOGIN_LAMBDA) {
//       return res.status(400).json({ message: "Invalid login request" });
//     }

//     console.log("Initiating login with BugBase", BUGBASE_LOGIN_LAMBDA);
//     console.log("Initiating login with BugBase", COPILOT_LAMBDA_KEY);

//     const response = await axios.post(
//       BUGBASE_LOGIN_LAMBDA,
//       {
//         deployment: DEPLOYMENT,
//       },
//       {
//         headers: {
//           "Content-Type": "application/json",
//           "x-functions-key": COPILOT_LAMBDA_KEY,
//         },
//       }
//     );

//     console.log("Response from BugBase", response);

//     if (response.status !== 200) {
//       return res.status(400).json({ message: "Failed to login with BugBase" });
//     }

//     const antiCSRF = uuidv4();

//     return res.status(200).json({
//       message: "Login initiated with BugBase",
//       token: response.data.token,
//       antiCSRF,
//     });
//   } catch (error) {
//     console.log(error);
//     return res.status(400).json({ message: "Failed to login with BugBase!" });
//   }
// };

// export const verifyBugBaseLogin = async (req: Request, res: Response) => {
//   try {
//     const { token, userId, copilotState, antiCSRF } = req.body;

//     if (!token || !userId) {
//       return res.status(400).json({ message: "Invalid request" });
//     }

//     const antiCSRFfromState = JSON.parse(copilotState ?? "{}")?.antiCSRF;

//     if (antiCSRF !== antiCSRFfromState) {
//       return res.status(400).json({
//         message: "Request Details Mismatch, Please try to login again!",
//       });
//     }

//     const user = await UserModel.findById(userId);

//     if (!user) {
//       return res.status(400).json({ message: "User not found" });
//     }

//     const loginSession = await LoginSessionModel.findOne({
//       token,
//       email: user.email,
//     });

//     if (!loginSession) {
//       return res.status(400).json({ message: "Invalid login session" });
//     }


//     const head = req.headers["x-forwarded-for"] as string;
//     let headIp = null;
//     if (head) {
//       headIp = head.split(",")[0];
//     }

//     const ip = headIp ?? req.socket.remoteAddress;

//     if (ip) {
//       user.ip = ip;
//       const geo = geoip.lookup(ip);

//       if (geo) {
//         user.ipLocation = {
//           ...geo,
//           ip: ip,
//         };
//       }
//     }

//     await user.save();
//     // await LoginSessionModel.deleteOne({ _id: loginSession._id });

//     req.session.user = {
//       userId: user._id.toString(),
//     };

//     // saving the session
//     req.session.save(function (err) {
//       if (err) {
//         console.log(err);
//         return res.status(400).json({ message: "Failed to save session!" });
//       }
//     });

//     const secretKey = await getSecrets("INTERCOM-SECRET"); // secret key (keep safe!)
//     const userIdentifier = user.email; // user's email address

//     const hash = crypto
//       .createHmac("sha256", secretKey)
//       .update(userIdentifier)
//       .digest("hex");


//     return res.status(200).json({
//       message: "Logged in successfully with BugBase",
//       state: copilotState,
//       user: {
//         uid: user._id,
//         name: user.name,
//         email: user.email,
//         profilePicture: user.profilePicture,
//         plan: user.billing.plan,
//         user_hash: hash,
//       },
//     });
//   } catch (error) {
//     console.log("Error in Oauth login");
//     console.log(error);
//     return res.status(400).json({ message: "Invalid login request!" });
//   }
// };

// export const checkUserKYC = async (req: Request, res: Response) => {
//   try {
//     const { userId } = res.locals;
//     const user = await UserModel.findById(userId);

//     if (!user) {
//       return res.status(400).json({ message: "User not found" });
//     }

//     const COPILOT_LAMBDA_KEY = await getSecrets("GET-BUGBASE-KYC-LAMBDA-KEY");
//     const GET_BUGBASE_KYC_LAMBDA_URL = await getSecrets(
//       "GET-BUGBASE-KYC-LAMBDA-URL"
//     );

//     const response = await axios.post(
//       GET_BUGBASE_KYC_LAMBDA_URL + "/get-kyc-details",
//       {
//         email: user.email,
//       },
//       {
//         headers: {
//           "Content-Type": "application/json",
//           "x-functions-key": COPILOT_LAMBDA_KEY,
//         },
//       }
//     );

//     if (response.status !== 200) {
//       return res
//         .status(400)
//         .json({ message: "Failed to fetch kyc status of user!" });
//     }

//     return res.status(200).json({
//       message: "Fetched kyc status of user successfully!",
//       kycStatus: response.data.status,
//     });
//   } catch (error) {
//     console.log(error);
//     return res.status(400).json({ message: "ERROR!" });
//   }
// };


export const logout = async (req: Request, res: Response) => {
  try {
    const user = req.session.user;
    if (!user) {
      // No user in session, can't perform logout
      return res.status(400).json({ message: "No user to log out!" });
    }

    const userdata = await UserModel.findOne({ _id: user.userId });

    // Destroy the session and clear the cookie
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destruction error:", err);
        return res.status(500).json({ message: "Error logging out!" });
      }
      res.clearCookie("sid");
      // Moved the success response here to ensure it's called after session is destroyed
      res.status(200).json({ message: "Logged out successfully!" });
    });
  } catch (err) {
    console.error("Logout error:", err);
    // Sending a 500 status code for server-side errors
    return res.status(500).json({ message: "Failed to logout!" });
  }
};

export const checkUserSession = async (req: Request, res: Response) => {
  try {
    const { user } = req.session;
    if (user == null)
      return res.status(400).json({
        success: false,
        message: "Invalid session!",
      });

    if (req.session.user != null) {
      const u = await UserModel.findOne({ _id: user.userId });

      if (u == null) {
        return res.status(400).json({
          success: false,
          message: "User not found!",
        });
      }

      const earlyAccess = await EarlyAccessModel.findOne({
        email: u.email,
      });

      // const secretKey = await getSecrets("INTERCOM-SECRET"); // secret key (keep safe!)
      // const userIdentifier = u.email; // user's email address

      // const hash = crypto
      //   .createHmac("sha256", secretKey)
      //   .update(userIdentifier)
      //   .digest("hex");

      return res.status(200).json({
        success: true,
        user: {
          name: u.name,
          email: u.email,
          firstLogin: u.firstLogin,
          profilePicture: u.profilePicture,
          uid: u._id,
          access: earlyAccess ? true : false,
        },
      });
    }

    return res.status(400).json({
      message: "Session not found!",
    });
  } catch (err) {
    console.log(err);
    return res.status(400).json({ message: "Session not found!" });
  }
};


export const registerUser = async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    let user = await UserModel.findOne({ email });
    if (user) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    user = new UserModel({
      name,
      email,
      password: hashedPassword,
    });

    await user.save();

    return res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error("Error registering user:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const head = req.headers["x-forwarded-for"] as string;
    let headIp = null;
    if (head) {
      headIp = head.split(",")[0];
    }

    const ip = headIp ?? req.socket.remoteAddress;

    if (ip) {
      user.ip = ip;
      const geo = geoip.lookup(ip);

      if (geo) {
        user.ipLocation = {
          ...geo,
          ip: ip,
        };
      }
    }

    await user.save();
    
    req.session.user = {
      userId: user._id.toString(),
    };

    // saving the session
    req.session.save(function (err) {
      if (err) {
        console.log(err);
        return res.status(400).json({ message: "Failed to save session!" });
      }
    });



    return res.status(200).json({
      message: "User logged in successfully",
      user: {
        uid: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,
      },
    });

  } catch (error) {
    console.error("Error logging in user:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};