import { Response, Request } from "express";
import {
  analyzeSubprocessData,
  changeLastHistoryStepStatus,
  finalizeCommandToRun,
  finalizeOutputAndGetSummary,
  generateCommand,
  initCopilotSession,
  finalizeSummaryContext,
  storeExecutedCommandOutput,
  finalizeTodoAndGetNewCommand,
  addNextloopHistoryStep,
  extractRelevantContextUsingGPT3,
} from "../services/session.services";
import SessionsModel from "../models/Sessions/Sessions.model";
import UserModel from "../models/User/User.model";
import FeedbackModel from "../models/Feedback/Feedback.model";
import { deleteSubprocessOfMainThread, getSessionData, storeSession, updateSessionHistory } from "../utils/redis/store";
import getSecrets from "../utils/getSecrets";
import axios from "axios";
import { load } from "cheerio";
import { HistoryData } from "../services/copilot.services";
import { chatCompletion } from "../utils/openai/config";
import { requireActiveSession } from "../services/session.helpers";

export const initiateCopilotSession = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const { sessionId, target_info, recon_info, recon } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        message: "Invalid Session",
      });
    }

    if (!target_info) {
      return res.status(400).json({
        message: "Initiate details not specified.",
      });
    }

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    session.loops = [
      {
        startTimestamp: new Date(),
        loop: 0,
      },
    ];

    await session.save();

    const response = await initCopilotSession({
      sessionId,
      target_info,
      recon_info,
      recon,
    });

    if (!response) {
      return res.status(400).json({
        message: "Error Occured while initiating copilot",
      });
    }

    if (response.success) {

      return res.status(200).json({
        sessionId: sessionId,
        message: response.message,
      });
    }
  } catch (err: any) {
    console.log(err);
    return res.status(400).json({
      message: err.message ?? "Failed to Initiate Copilot",
    });
  }
};

export const generateCopilotCommand = async (req: Request, res: Response) => {
  try {
    console.log("[generateCopilotCommand] Called");
    const user = res.locals.user;
    const userId = res.locals.userId;

    const { sessionId } = req.body;
    console.log("[generateCopilotCommand] sessionId from body:", sessionId);

    if (!sessionId) {
      console.log("[generateCopilotCommand] sessionId not provided in body");
      return res.status(400).json({
        message: "Invalid Session",
      });
    }

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    const lastLoopStep = session.loopHistory[session.loopHistory.length - 1];
    console.log("[generateCopilotCommand] lastLoopStep:", lastLoopStep);

    if (
      lastLoopStep &&
      lastLoopStep.status !== "not-started" &&
      lastLoopStep.stepType === "command"
    ) {
      console.log("[generateCopilotCommand] Command is being processed");
      return res.status(200).json({
        message: "Generate Command Running",
      });
    } else if (
      lastLoopStep &&
      !["command", "init"].includes(lastLoopStep.stepType)
    ) {
      console.log("[generateCopilotCommand] Completing todo and updating loop");
      await changeLastHistoryStepStatus({
        sessionId: sessionId,
        lastStepType: "todo",
        status: "completed",
      });

      console.log("[generateCopilotCommand] Marked last todo as completed");
      await SessionsModel.findOneAndUpdate(
        { sessionId, uid: user._id },
        {
          $set: {
            "loops.$[elem].endTimestamp": new Date(),
          },
          $inc: {
            loopStepsPerformed: 1,
          },
        },
        {
          arrayFilters: [{ "elem.loop": session.loopStepsPerformed }],
        }
      );
      console.log("[generateCopilotCommand] Updated loop endTimestamp and incremented loopStepsPerformed");

      await addNextloopHistoryStep({
        sessionId,
        type: "command",
        data: {},
      });
      console.log("[generateCopilotCommand] Added next loop history step of type 'command'");

      await SessionsModel.findOneAndUpdate(
        { sessionId, uid: user._id },
        {
          $push: {
            loops: {
              startTimestamp: new Date(),
              loop: session.loopStepsPerformed + 1, // Assuming you've already incremented this in memory
            },
          },
        }
      );
      console.log("[generateCopilotCommand] Pushed new loop to session");

      return res.status(200).json({
        sessionId: sessionId,
        message: "Generating Command",
      });
    } else {
      console.log("[generateCopilotCommand] Will generate command now");

      await changeLastHistoryStepStatus({
        sessionId: sessionId,
        lastStepType: "command",
        status: "processing",
      });
      console.log("[generateCopilotCommand] Changed last command step status to 'processing'");

      const response = await generateCommand({
        sessionId,
      });
      console.log("[generateCopilotCommand] generateCommand response:", response);

      if (!response) {
        console.log("[generateCopilotCommand] Error: No response from generateCommand");
        return res.status(400).json({
          message: "Error Occured while generating command",
        });
      }

      if (response.status === "error") {
        console.log("[generateCopilotCommand] Error status from generateCommand:", response.message);
        return res.status(400).json({
          message: response.message,
          status: response.status,
        });
      }

      console.log("[generateCopilotCommand] Command generated successfully");
      return res.status(200).json({
        sessionId: sessionId,
        message: response.message,
        copilotResponse: response.copilotResponse ?? null,
      });
    }
  } catch (err: any) {
    console.log("[generateCopilotCommand] Exception:", err);
    return res.status(400).json({
      message: "Failed to initiate Copilot",
      err:
        err.message === "Error: User does not have enough gold"
          ? "no-gold"
          : "",
    });
  }
};

export const finalizeCopilotCommand = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const { sessionId, command } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        message: "Invalid Session",
      });
    }

    if (!command) {
      return res.status(400).json({
        message: "Invalid Command",
      });
    }

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    const lastLoopStep = session.loopHistory.find(
      (step) =>
        step.loop === session.loopStepsPerformed &&
        step.stepType === "output" &&
        step.status !== "not-started"
    );

    if (lastLoopStep && lastLoopStep.stepType === "output") {
      console.log("Output is being processed");
      return res.status(200).json({
        message: "Finalize Command Output Processing",
      });
    }

    console.log("Will generate output now");

    const response = await finalizeCommandToRun({
      sessionId,
      command,
    });

    if (!response) {
      return res.status(400).json({
        message: "Error Occured while generating command",
      });
    }

    if (response.success) {
      return res.status(200).json({
        sessionId: sessionId,
        message: response.message,
        tool_response: response.tool_response ?? null,
        type: response.type,
        command: response.command ?? null,
      });
    }

    return res.status(400).json({
      message: "Error Occured while generating command",
    });
  } catch (err) {
    console.log(err);
    return res.status(400).json({
      message: "Failed to initiate Copilot",
    });
  }
};

export const storeToolOutputData = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const { commandId, session_id: sessionId, output } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        message: "Invalid session id",
      });
    }

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    if (!commandId) {
      return res.status(400).json({
        message: "Command not found",
      });
    }

    if (!output) {
      return res.status(400).json({
        message: "Output not found",
      });
    }

    const lastLoopStep = session.loopHistory.find(
      (step) =>
        step.loop === session.loopStepsPerformed &&
        step.stepType === "output" &&
        step.status !== "not-started"
    );

    if (lastLoopStep && lastLoopStep.stepType === "output") {
      console.log("Output is being processed");
      return res.status(200).json({
        message: "Finalize Command Output Processing",
      });
    }

    console.log("Will store output now");

    const commandData = session.storeCommands.find(
      (command) => command._id?.toString() === commandId
    );

    await storeExecutedCommandOutput(
      commandId,
      sessionId,
      output,
      commandData?.tool_name ?? ""
    );

    return res.status(200).json({
      message: "Tool output data stored",
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Failed to store tool output data",
    });
  }
};

export const generateLoopSummary = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        message: "Invalid session id",
      });
    }

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    const lastLoopStep = session.loopHistory.find(
      (step) =>
        step.loop === session.loopStepsPerformed && step.stepType === "summary"
    );

    if (lastLoopStep && lastLoopStep.status !== "not-started") {
      console.log("Summary is being processed");
      return res.status(200).json({
        message: "Finalize Command Output Processing",
      });
    } else {
      console.log("Summary is not being processed");
      await changeLastHistoryStepStatus({
        sessionId,
        lastStepType: "output",
        status: "completed",
      });

      await addNextloopHistoryStep({
        sessionId,
        type: "summary",
        data: {},
      });
    }

    console.log("Will generate summary");

    await changeLastHistoryStepStatus({
      sessionId: sessionId,
      lastStepType: "summary",
      status: "processing",
    });

    const response = await finalizeOutputAndGetSummary(sessionId);

    if (!response) {
      return res.status(400).json({
        message: "Error Occured while generating command",
      });
    }

    if (response.success) {
      return res.status(200).json({
        sessionId: sessionId,
        message: response.message,
        data: response.data,
      });
    }

    return res.status(400).json({
      message: "Error Occured while generating command",
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Error Occured while generating command",
    });
  }
};

export const finalizeSummary = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const { sessionId, additionalContext } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        message: "Invalid session id",
      });
    }

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    const lastLoopStep = session.loopHistory.find(
      (step) =>
        step.loop === session.loopStepsPerformed && step.stepType === "summary"
    );
    console.log(lastLoopStep);
    if (
      lastLoopStep &&
      lastLoopStep.stepType === "summary" &&
      lastLoopStep.status === "completed"
    ) {
      console.log("Summary is being processed");
      return res.status(200).json({
        message: "Finalize Summary Running",
      });
    }

    console.log("Will finalize summarise now");

    await changeLastHistoryStepStatus({
      sessionId,
      lastStepType: "summary",
      status: "completed",
    });

    const response = await finalizeSummaryContext({
      sessionId,
      additionalContext,
    });

    if (!response) {
      return res.status(400).json({
        message: "Error Occured while resetting history",
      });
    }

    if (response.success) {
      return res.status(200).json({
        sessionId: sessionId,
        message: response.message,
      });
    }

    return res.status(400).json({
      message: "Error Occured while resetting history",
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Error Occured while resetting history",
    });
  }
};

export const finalizeTodoAndResetHistory = async (
  req: Request,
  res: Response
) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        message: "Invalid session id",
      });
    }

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    const lastLoopStep = session.loopHistory.find(
      (step) =>
        step.loop === session.loopStepsPerformed &&
        step.stepType === "todo" &&
        step.status !== "not-started"
    );

    if (lastLoopStep && lastLoopStep.stepType === "todo") {
      console.log("Todo is being processed");
      return res.status(200).json({
        message: "Generate Todo Running",
      });
    }

    console.log("Will generate todo now");

    await changeLastHistoryStepStatus({
      sessionId: sessionId,
      lastStepType: "todo",
      status: "processing",
    });

    const response = await finalizeTodoAndGetNewCommand(sessionId);

    if (!response) {
      return res.status(400).json({
        message: "Error Occured while resetting history",
      });
    }

    if (response.success) {
      return res.status(200).json({
        sessionId: sessionId,
        message: response.message,
      });
    }

    return res.status(400).json({
      message: "Error Occured while resetting history",
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Error Occured while resetting history",
    });
  }
};

export const analyzeAllSubprocessData = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        message: "Invalid session id",
      });
    }

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    const lastLoopStep = session.loopHistory.find(
      (step) =>
        step.loop === session.loopStepsPerformed &&
        step.stepType === "output" &&
        step.status !== "not-started"
    );

    if (lastLoopStep && lastLoopStep.stepType === "output") {
      console.log("Output is being processed");
      return res.status(200).json({
        message: "Generate output Running",
      });
    }

    console.log("Will generate Output now");

    const response = await analyzeSubprocessData(sessionId, user);

    if (!response) {
      return res.status(400).json({
        message: "Error Occured while resetting history",
      });
    }

    if (response.success) {
      return res.status(200).json({
        sessionId: sessionId,
        message: response.message,
        data: response.data,
      });
    }

    return res.status(400).json({
      message: "Error Occured while resetting history",
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Error Occured while resetting history",
    });
  }
};

export const undoPreviousStep = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const { sessionId, redoContext } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        message: "Invalid session id",
      });
    }

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    if (redoContext) {
      session.redoContext = redoContext;
    }

    const loopHistory = session.loopHistory;

    // find last step
    const lastLoopStep = loopHistory[loopHistory.length - 1];

    if (lastLoopStep.stepType === "init") {
      return res.status(400).json({
        message: "Cannot undo init step",
      });
    }

    if (
      lastLoopStep.stepType === "command" &&
      lastLoopStep.status === "pending" &&
      session.type === "sub" &&
      session.loopStepsPerformed === 0
    ) {
      return res.status(400).json({
        message: "Cannot undo first command step",
      });
    }

    if (
      lastLoopStep.stepType === "command" &&
      lastLoopStep.status === "pending"
    ) {
      await SessionsModel.deleteMany({
        uid: userId,
        mainSessionId: sessionId,
      });

      session.storeCommands = session.storeCommands.map((command) => {
        command.active = false;
        return command;
      });
      session.loopStepsPerformed -= 1;
      session.loops.pop();

      await deleteSubprocessOfMainThread(sessionId);

      const currentSessionData = await getSessionData(sessionId);

      if (currentSessionData?.history && currentSessionData.history.length > 0) {
        
        for (let i = currentSessionData.history.length - 1; i >= 0; i--) {
          if (currentSessionData.history[i].role === "assistant") {
            currentSessionData.history.splice(i, 1);
            break;
          }
        }

        await updateSessionHistory({
          sessionId,
          history: currentSessionData.history,
        });
      }

      await session.save();
    } else if (lastLoopStep.stepType === "output") {
      session.storeCommands = session.storeCommands.map((command) => {
        if (command.loop === session.loopStepsPerformed) {
          command.active = true;
        } else {
          command.active = false;
        }
        return command;
      });
    }
    // remove last step
    loopHistory.pop();

    // change status to pending of last step
    const lastStep = loopHistory[loopHistory.length - 1];

    if (lastStep) {
      lastStep.status = "pending";
    }

    await session.save();

    const subprocessIds = await SessionsModel.find(
      {
        uid: userId,
        mainSessionId: sessionId,
      },
      {
        sessionId: 1,
      }
    );

    return res.status(200).json({
      message: "Undo previous step successful",
      subprocesses: subprocessIds,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Error Occured while resetting history",
    });
  }
};

export const takeActionOnResponse = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const { sessionId, action } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        message: "Invalid session id",
      });
    }

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    if (!["like", "dislike"].includes(action)) {
      return res.status(400).json({
        message: "Invalid action",
      });
    }
    const { feedback, stepId } = req.body;

    if (!feedback) {
      return res.status(400).json({
        message: "Feedback is required",
      });
    }

    if (!stepId) {
      return res.status(400).json({
        message: "Step id is required",
      });
    }
    const fback = new FeedbackModel({
      uid: userId,
      sessionId,
      stepId,
      action,
      feedback,
    });

    await fback.save();

    // find step using stepId inside session.loopHistory and update action
    const loopHistory = session.loopHistory;

    const step = loopHistory.find((step) => step._id?.toString() === stepId);

    if (step) {
      step.action = action;
    }

    await session.save();

    return res.status(200).json({
      message: `${action} saved for response`,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Error Occured while resetting history",
    });
  }
};

export const uploadAnalysisFile = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const { session_id: sessionId, comment } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        message: "Invalid session id",
      });
    }

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    const findSummary = session.loopHistory.find(
      (step) =>
        step.stepType === "summary" && step.loop === session.loopStepsPerformed
    );

    if (!findSummary) {
      return res.status(400).json({
        message: "Summary not found",
      });
    }

    const file = req.file;

    if (!file) {
      return res.status(400).json({
        message: "File not found",
      });
    }

    // file size cannot be more than 50MB
    if (file.size > 50 * 1024 * 1024) {
      return res.status(400).json({
        message: "File size cannot be more than 50MB",
      });
    }

    return res.status(200).json({
      message: "Analysis completed",
    });

  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Error Occured while uploading analysis file",
    });
  }
};

export const followGoogleTarget = async (req: Request, res: Response) => {
  try {
    const { target, sessionId, stepId } = req.body;

    const user = res.locals.user;
    const userId = res.locals.userId;

    if (!target) {
      return res.status(400).json({
        message: "Target not selected",
      });
    }

    const { url, title } = target;

    if (!url) {
      return res.status(400).json({
        message: "Target url not selected",
      });
    }

    if (!title) {
      return res.status(400).json({
        message: "Target title not selected",
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        message: "Invalid session id",
      });
    }

    if (!stepId) {
      return res.status(400).json({
        message: "Invalid step id",
      });
    }

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    const step = session.loopHistory.find(
      (step) => step._id?.toString() === stepId
    );

    if (!step) {
      return res.status(400).json({
        message: "Step not found",
      });
    }

    // Fetch the webpage content
    const response = await axios.get(url);
    const html = response.data;

    console.log(html);

    // Parse the HTML content using Cheerio
    const $ = load(html);

    // Extract contextual information (e.g., all text within paragraph tags)
    let context = "";
    $("p").each((i, elem) => {
      context += $(elem).text() + " ";
    });

    console.log({ context });

    const siteContext = await extractRelevantContextUsingGPT3(
      title,
      url,
      context
    );

    if (!siteContext) {
      return res.status(400).json({
        message: "Error Occured while following google target",
      });
    }
    step.data.siteContext = siteContext;

    step.data.content = step.data.content + "\n" + siteContext;

    await session.save();

    return res.status(200).json({
      message: "Site context generated successfully",
      data: siteContext,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Error Occured while following google target",
    });
  }
};
