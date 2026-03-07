import {
  clearCommandFromSubprocess,
  clearSessionSubprocesses,
  completeSubprocess,
  getSessionData,
  storeSession,
  updateMainSessionSubprocess,
  updateSessionContext,
  updateSessionHistory,
  updateSessionTodo,
} from "../utils/redis/store";
import { v4 as uuidv4 } from "uuid";
import { CopilotPrompts } from "../utils/copilot/prompts";
import { ask_gpt4_model, ask_gpt3_model } from "./llm.service";
import { fix_json_with_ai } from "../utils/jsonfix";
import { genericInitTodo, initTodo } from "../utils/copilot/todo";
import { PluginInventory } from "./plugins.services";
import SessionsModel, {
  loopHistoryDoc,
} from "../models/Sessions/Sessions.model";
import UserModel, { UserDoc } from "../models/User/User.model";
import HistoryArchiveModel from "../models/HistoryArchive/HistoryArchive.model";
import { runCommandOnKali, runRAGforMetasploit } from "./copilot.services";
import { HistoryData, ContextData, SingleCommandData, CommandData, CopilotSessionData } from "../types/copilot.types";

export type { HistoryData, ContextData, SingleCommandData, CommandData, CopilotSessionData };
export { ask_gpt3_model };

export const getNextStepType = (currentStep: string) => {
  let nextStep;

  switch (currentStep) {
    case "init":
      nextStep = "command";
      break;
    case "command":
      nextStep = "output";
      break;
    case "output":
      nextStep = "summary";
      break;
    case "summary":
      nextStep = "todo";
      break;
    case "todo":
      nextStep = "command";
      break;
    default:
      nextStep = "init";
  }

  return nextStep;
};

export const changeLastHistoryStepStatus = async ({
  sessionId,
  lastStepType,
  status,
}: {
  sessionId: string;
  lastStepType: string;
  status: "not-started" | "processing" | "pending" | "completed";
}) => {
  const session = await SessionsModel.findOne({ sessionId });

  if (!session) {
    throw new Error("Session not found");
  }

  let loopHistory = [...session.loopHistory];

  if (loopHistory[loopHistory.length - 1].stepType === lastStepType) {
    loopHistory[loopHistory.length - 1].status = status;
  } else {
    throw new Error("Invalid last step type");
  }

  session.loopHistory = loopHistory;

  await session.save();
};

export const addNextloopHistoryStep = async ({
  sessionId,
  type,
  data,
}: any) => {
  const session = await SessionsModel.findOne({ sessionId });

  if (!session) {
    throw new Error("Session not found");
  }

  if (!["command", "output", "summary", "todo"].includes(type)) {
    throw new Error("Invalid Step type");
  }

  let loopHistory = [...session.loopHistory];

  const lastStep = loopHistory[loopHistory.length - 1];

  if (lastStep.stepType === type) {
    throw new Error("Step already exists");
  }

  loopHistory.push({
    stepType: type,
    data,
    loop: session.loopStepsPerformed,
    status: "not-started",
  });

  session.loopHistory = loopHistory;

  await session.save();
};

const updateLastloopHistoryStep = async ({
  sessionId,
  lastStepType,
  newData,
}: {
  sessionId: string;
  lastStepType: string;
  newData: any;
}) => {
  const session = await SessionsModel.findOne({ sessionId });

  if (!session) {
    throw new Error("Session not found");
  }

  if (!["command", "output", "summary", "todo"].includes(lastStepType)) {
    throw new Error("Invalid Step type");
  }

  let loopHistory = [...session.loopHistory];

  if (loopHistory[loopHistory.length - 1].stepType !== lastStepType) {
    throw new Error("Invalid last step type");
  }

  loopHistory[loopHistory.length - 1].data = {
    ...loopHistory[loopHistory.length - 1].data,
    ...newData,
  };

  session.loopHistory = loopHistory;

  await session.save();
};

export const createNewSession = async ({
  uid,
  isMainThread = true,
  engagementType,
}: {
  uid: string;
  isMainThread?: boolean;
  engagementType: "generic" | "formal";
}) => {
  const sessionId = uuidv4().toString();

  await storeSession({
    uid,
    sessionId,
    todo: engagementType === "generic" ? genericInitTodo : initTodo,
    isMainThread: isMainThread ? 1 : 0,
  });

  return sessionId;
};

/**
 *
 * Main Copilot Driver
 */

export const initCopilotSession = async ({
  sessionId,
  target_info,
  recon_info,
  recon,
}: {
  sessionId: string;
  target_info: string;
  recon_info: string;
  recon: boolean;
}) => {
  try {
    const sessionData = await getSessionData(sessionId);

    if (!sessionData) {
      throw new Error("Session not found");
    }

    const userId = sessionData.uid;

    if (!userId) {
      throw new Error("UserId not found");
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      throw new Error("User not found");
    }

    const dbSession = await SessionsModel.findOne({ sessionId, uid: user._id });

    if (!dbSession) {
      throw new Error("Session not found");
    }

    sessionData.history = [];
    const sessionHistory = sessionData.history;

    if (sessionData.isMainThread) {
      const sysInit = await CopilotPrompts.generate_system_init(
        sessionId,
        user.configs.tools,
        true
      );

      sessionHistory.push({
        role: "system",
        content: sysInit,
        loopStep: 0,
      });

      const commandTask = await CopilotPrompts.first_message(
        !!sessionData.isMainThread,
        recon_info,
        recon
      );

      sessionHistory.push({
        role: "user",
        content: commandTask.concat(target_info),
        loopStep: 0,
      });

      let initContent = `Pentest Initiated with the following target information: ${target_info}`;

      if (recon) {
        initContent += `\nRecon Information provided: ${target_info}`;
      }

      const initHistory: loopHistoryDoc[] = [
        {
          stepType: "init",
          data: {
            content: `Pentest Initiated with the following target information: ${target_info}`,
            choice: recon ? "yes" : "no",
            additionalContext: recon_info,
          },
          status: "completed",
          loop: dbSession.loopStepsPerformed,
        },
        {
          stepType: "command",
          data: {},
          status: "not-started",
          loop: dbSession.loopStepsPerformed,
        },
      ];

      dbSession.loopHistory = initHistory;

      await dbSession.save();
    } else {
      const sysInit = await CopilotPrompts.generate_system_init(
        sessionId,
        user.configs.tools
      );

      sessionHistory.push({
        role: "system",
        content: sysInit,
        loopStep: 1,
      });

      const context = sessionData.context;
      const contextSummary = context?.summary;
      const nextSteps = context?.nextSteps;

      if (contextSummary || nextSteps) {
        const contextMessage = `Here's the summary of the pentest performed: ${
          contextSummary ?? "We have just started the pentest"
        }.\nHere's the next steps: ${
          nextSteps ?? "None at the moment, think of something!"
        }`;

        sessionHistory.push({
          role: "user",
          content: contextMessage,
          loopStep: 1,
          isContextual: true,
        });

        const initHistory: loopHistoryDoc[] = [
          {
            loop: dbSession.loopStepsPerformed,
            stepType: "init",
            data: {
              content: `Subprocess Initiated with the following target information: ${contextSummary}`,
            },
            status: "pending",
          },
        ];

        dbSession.loopHistory = initHistory;

        await dbSession.save();
      }
    }

    await updateSessionHistory({
      sessionId,
      history: sessionHistory,
    });

    return {
      sessionId,
      message: "Pentest initiated",
      success: true,
    };
  } catch (e: any) {
    throw new Error(e);
  }
};

export const generateCommand = async ({ sessionId }: { sessionId: string }) => {
  try {
    const sessionData = await getSessionData(sessionId);

    if (!sessionData) {
      throw new Error("Session not found");
    }

    const userId = sessionData.uid;

    if (!userId) {
      throw new Error("User not found");
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      throw new Error("User not found");
    }


    const dbSession = await SessionsModel.findOne({ sessionId });

    if (!dbSession) {
      throw new Error("Session not found in DB");
    }

    const sessionHistory = sessionData.history;

    if (dbSession.redoContext) {
      const redoData = `\nThis is the context you need to keep in mind while generating commands: ${dbSession.redoContext}`;

      sessionHistory[sessionHistory.length - 1].content += redoData;
      dbSession.redoContext = null;
    }

    const { content: gptRes, success } = await ask_gpt4_model(
      sessionHistory,
      sessionId
    );

    if (!success) {
      console.log("Error generating GPT4 command");
      console.dir(gptRes, { depth: null });
      throw new Error("Error generating GPT4 command");
    }

    let fixedRes = await fix_json_with_ai(
      ask_gpt3_model,
      gptRes,
      "command",
      sessionId
    );

    let commands = fixedRes.commands;

    let containsMsfvenomOrMsfconsole = false;

    commands = commands.map((command: any) => {
      if (command.plugin_name === "msfvenom_payload") {
        containsMsfvenomOrMsfconsole = true;
      }

      if (
        command?.plugin_name === "run_bash" &&
        command?.args?.command?.includes("msfconsole")
      ) {
        containsMsfvenomOrMsfconsole = true;
      }

      // for (let key in command.args) {
      //   if (typeof command.args[key] === "string") {
      //     updatedArgs[key] = escapeQuotes(command.args[key]);
      //   } else {
      //     updatedArgs[key] = command.args[key]; // Preserve non-string values
      //   }
      // }

      return command;
    });

    if (commands.length === 0) {
      throw new Error("No commands found");
    }

    fixedRes.commands = commands;

    const summary = sessionData.context?.summary ?? "";

    if (containsMsfvenomOrMsfconsole) {
      fixedRes = await runRAGforMetasploit(fixedRes, commands, summary, sessionId);
    }

    for (const command of fixedRes.commands) {
      command.active = true;
      command.loop = dbSession.loopStepsPerformed;
      dbSession.storeCommands.push(command);
    }

    const taskCommandsResponse = JSON.stringify(fixedRes);

    sessionHistory.push({
      role: "assistant",
      content: taskCommandsResponse,
      loopStep: 1,
      isContextual: true,
    });



    // Updations to Database

    // Updates the command data
    await updateLastloopHistoryStep({
      sessionId,
      lastStepType: "command",
      newData: {
        content: taskCommandsResponse,
      },
    });

    // Updates the command status to pending
    await changeLastHistoryStepStatus({
      sessionId,
      lastStepType: "command",
      status: "pending",
    });

    await updateSessionHistory({
      sessionId,
      history: sessionHistory,
    });

    await dbSession.save();

    // await recordCommandGenUsage({
    //   userId,
    //   credits: 1,
    //   description: `Command Generated for Workspace - ${sessionId}`,
    // });

    return {
      success: true,
      message: "Commands Generated",
      session_id: sessionId,
      copilotResponse: taskCommandsResponse,
    };
  } catch (e: any) {
    console.log(e);
    return {
      status: "error",
      message: e.message ?? "Error Generating Command",
      session_id: sessionId,
      copilot_response: null,
    };
  }
};

export const finalizeCommandToRun = async ({ sessionId, command }: any) => {
  try {
    const sessionData = await getSessionData(sessionId);

    if (!sessionData) {
      throw new Error("Session not found");
    }

    const userId = sessionData.uid;

    if (!userId) {
      throw new Error("User not found");
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      throw new Error("User not found");
    }

    const dbSession = await SessionsModel.findOne({ sessionId });

    if (!dbSession) {
      throw new Error("Session not found in DB");
    }

    const sessionHistory = sessionData.history;
    const commandId = command.commandId;
    const plugin_name = command.plugin_name;
    const command_args = command.command_args;
    const choice = command.choice;

    let pluginResponse: string = "";

    switch (plugin_name) {
      case "run_bash":
        pluginResponse =
          PluginInventory.run_bash(commandId, command_args, choice) ?? "";
        break;
      case "generic_response":
        pluginResponse = command_args.output;
        console.log(pluginResponse);
        break;
      case "netcat_listener":
        pluginResponse = command_args.output;
        console.log(pluginResponse);
        break;
      case "msfvenom_payload":
        pluginResponse =
          (await PluginInventory.msfvenom_payload(
            commandId,
            command_args,
            choice
          )) ?? "";
        break;
      case "google":
        pluginResponse =
          (await PluginInventory.googleSearch(command_args, choice)) ?? "";
        break;
      default:
        break;
    }

    const newData: any = {
      choice,
      plugin: plugin_name,
    };

    if (choice === "edit") {
      newData.additionalContext = JSON.stringify(command_args.command);
    } else if (["provide_output", "no", "provide_guidance"].includes(choice)) {
      newData.additionalContext = command_args.output;
    }

    await updateLastloopHistoryStep({
      sessionId,
      lastStepType: "command",
      newData: newData,
    });

    if (
      pluginResponse &&
      (["provide_output", "no", "provide_guidance"].includes(choice) ||
        plugin_name === "generic_response" ||
        plugin_name === "google" ||
        plugin_name === "netcat_listener")
    ) {
      const commandToEdit: SingleCommandData | undefined =
        dbSession.storeCommands.find(
          (item) => item._id?.toString() === commandId
        );

      if (!!commandToEdit) {
        commandToEdit.plugin_name = plugin_name;
        commandToEdit.args = command_args;
        commandToEdit.active = false;
      }

      await dbSession.save();

      await SessionsModel.findOneAndUpdate(
        {
          uid: user._id,
          sessionId,
          "storedCommands._id": commandId,
        },
        {
          $set: {
            "storedCommands.$.active": false,
          },
        }
      );

      sessionHistory.push({
        role: "user",
        content: pluginResponse,
        loopStep: 2,
        isContextual: true,
      });

      // Updates the command status to pending
      await changeLastHistoryStepStatus({
        sessionId,
        lastStepType: "command",
        status: "completed",
      });

      await addNextloopHistoryStep({
        sessionId,
        type: "output",
        data: {
          content: pluginResponse,
          plugin: plugin_name,
        },
      });

      await changeLastHistoryStepStatus({
        sessionId,
        lastStepType: "output",
        status: "pending",
      });

      await clearCommandFromSubprocess(sessionId);

      await updateSessionHistory({
        sessionId,
        history: sessionHistory,
      });

      const metadataForKPI = JSON.stringify({
        commandId: commandId,
        plugin_name: plugin_name,
        command_args: command_args,
        output: pluginResponse,
      });


      return {
        success: true,
        message: "Command Executed",
        session_id: sessionId,
        plugin_response: pluginResponse,
        type: "output",
      };
    } else {
      await changeLastHistoryStepStatus({
        sessionId,
        lastStepType: "command",
        status: "completed",
      });

      await addNextloopHistoryStep({
        sessionId,
        type: "output",
        data: {
          plugin: plugin_name,
        },
      });

      const metadataForKPI = JSON.stringify({
        commandId: commandId,
        plugin_name: plugin_name,
        command_args: command_args,
        output: "",
      });


      return {
        success: true,
        message: "Command Generated",
        session_id: sessionId,
        command: pluginResponse,
        type: "command",
      };
    }
  } catch (error) {
    console.log(error);
    return {
      success: false,
      message: "Error Executing Command",
      session_id: sessionId,
      plugin_response: null,
    };
  }
};

export const storeExecutedCommandOutput = async (
  commandId: string,
  session_id: string,
  output: string,
  plugin_name: string
) => {
  console.log("storing command", commandId);
  const session = await SessionsModel.findOne({
    sessionId: session_id,
  });

  if (!session) {
    return;
  }

  const sessionData = await getSessionData(session_id);

  if (!sessionData) {
    throw new Error("Session not found");
  }

  const userId = sessionData.uid;

  if (!userId) {
    throw new Error("User not found");
  }

  const user = await UserModel.findById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  const dbSession = await SessionsModel.findOne({
    sessionId: session_id,
    uid: user._id,
  });

  if (!dbSession) {
    throw new Error("Session not found in DB");
  }

  const sessionHistory = sessionData.history;


  await updateLastloopHistoryStep({
    sessionId: session_id,
    lastStepType: "output",
    newData: {
      content: output,
      plugin: plugin_name,
    },
  });

  await changeLastHistoryStepStatus({
    sessionId: session_id,
    lastStepType: "output",
    status: "pending",
  });

  console.log("updated loop history");

  // dbSession.storeCommands = dbSession.storeCommands.map((item) => {
  //   if (item._id?.toString() === commandId) {
  //     item.active = false;
  //   }
  //   return item;
  // });

  // await dbSession.save();

  const updatedStoredCommands = dbSession.storeCommands.map((item) => {
    if (item._id?.toString() === commandId) {
      item.active = false;
    }
    return item;
  });

  // convert to updateOne
  await SessionsModel.findOneAndUpdate(
    {
      sessionId: session_id,
      uid: user._id,
    },
    {
      $set: {
        storeCommands: updatedStoredCommands,
      },
    }
  );

  console.log("updated stored commands");

  // @TODO: Better logic for truncated output.
  // Remove unnecessary newlines and extra spaces
  const cleanedOutput = output.replace(/\s+/g, " ").trim();

  // Truncate to 6000 characters
  const truncatedOutput =
    cleanedOutput.length > 6000
      ? cleanedOutput.substring(0, 6000)
      : cleanedOutput;

  sessionHistory.push({
    role: "user",
    content: truncatedOutput,
    loopStep: 2,
    isContextual: true,
  });

  await updateSessionHistory({
    sessionId: session_id,
    history: sessionHistory,
  });
  await clearCommandFromSubprocess(session_id);
};

export const finalizeOutputAndGetSummary = async (sessionId: string) => {
  const sessionData = await getSessionData(sessionId);

  if (!sessionData) {
    throw new Error("Session not found");
  }

  const session = await SessionsModel.findOne({ sessionId });

  if (!session) {
    throw new Error("Session not found");
  }

  const userId = sessionData.uid;

  if (!userId) {
    throw new Error("User not found");
  }

  const user = await UserModel.findById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  const sessionHistory = sessionData.history;
  const contextualHistory: HistoryData[] = [];

  for (const item of sessionHistory) {
    if (item.isContextual === true) {
      contextualHistory.push(item);
    }
  }
  let isFirstSummary = false;
  let previousContext = null;
  if (sessionData.previousContexts?.length === 0) {
    isFirstSummary = true;
  } else {
    previousContext =
      sessionData.previousContexts?.[sessionData.previousContexts.length - 1]
        ?.summary;
  }

  if (!isFirstSummary && previousContext) {
    contextualHistory.unshift({
      role: "system",
      content: CopilotPrompts.use_prev_contextual_history_system_prompt(
        previousContext ?? "No previous context"
      ),
      isContextual: false,
    });
  } else {
    contextualHistory.unshift({
      role: "system",
      content: CopilotPrompts.contextual_history_system_prompt(),
      isContextual: false,
    });
  }

  contextualHistory.push({
    role: "user",
    content: CopilotPrompts.summarize_loop(),
    isContextual: false,
  });

  if (session.redoContext) {
    const redoData = `\nThis is the context you need to keep in mind while generating summary and next steps: ${session.redoContext}`;

    contextualHistory[contextualHistory.length - 1].content += redoData;
    session.redoContext = null;
  }

  let { content: context, success } = await ask_gpt4_model(
    contextualHistory,
    sessionId
  ) as { content: any; success: boolean };

  if (!success) {
    throw new Error("Error generating GPT4 summary");
  }

  // await storeInputTokensGPT3(sessionId, context);

  context = await fix_json_with_ai(
    ask_gpt3_model,
    context,
    "summary",
    sessionId
  );

  sessionData.history.push({
    role: "assistant",
    content: context,
    loopStep: 3,
  });

  const previousContexts = sessionData.previousContexts ?? [];

  previousContexts.push({
    summary: context.summary,
    nextSteps: context.nextSteps,
  });

  await updateLastloopHistoryStep({
    sessionId,
    lastStepType: "summary",
    newData: {
      content: JSON.stringify({
        loopSummary: context.summary,
        nextSteps: context.nextSteps,
      }),
    },
  });

  await changeLastHistoryStepStatus({
    sessionId,
    lastStepType: "summary",
    status: "pending",
  });

  await updateSessionHistory({
    sessionId,
    history: sessionHistory,
  });

  await updateSessionContext({
    sessionId,
    context,
    previousContexts,
  });

  await session.save();

  return {
    success: true,
    message: "Summary Generated",
    session_id: sessionId,
    data: context,
  };
};

export const finalizeSummaryContext = async ({
  sessionId,
  additionalContext,
}: {
  sessionId: string;
  additionalContext: string;
}) => {
  try {
    const sessionData = await getSessionData(sessionId);

    if (!sessionData) {
      throw new Error("Session not found");
    }

    const dbSession = await SessionsModel.findOne({ sessionId });

    if (!dbSession) {
      throw new Error("Session not found");
    }

    const userId = sessionData.uid;

    if (!userId) {
      throw new Error("User not found");
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      throw new Error("User not found");
    }

    if (additionalContext) {
      await updateLastloopHistoryStep({
        sessionId,
        lastStepType: "summary",
        newData: {
          additionalContext: additionalContext,
        },
      });
    }

    await addNextloopHistoryStep({
      sessionId,
      type: "todo",
      data: {},
    });

    return {
      success: true,
      message: "Finalized Summary",
      session_id: sessionId,
    };
  } catch (error) {
    console.log(error);

    return {
      success: false,
      message: "Error Finalizing Summary",
    };
  }
};

export const finalizeTodoAndGetNewCommand = async (sessionId: string) => {
  try {
    const sessionData = await getSessionData(sessionId);

    if (!sessionData) {
      throw new Error("Session not found");
    }

    const dbSession = await SessionsModel.findOne({ sessionId });

    if (!dbSession) {
      throw new Error("Session not found");
    }

    const userId = sessionData.uid;

    if (!userId) {
      throw new Error("User not found");
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      throw new Error("User not found");
    }

    // Generate Todo List
    const newHistory: HistoryData[] = [];

    const contextSummary = sessionData.context?.summary;
    const contextNextSteps = sessionData.context?.nextSteps;
    const additionalContext =
      dbSession.loopHistory[dbSession.loopHistory.length - 1].data
        .additionalContext;

    let summaryPrompt = `Here is the Performed Pentest Summary: ${contextSummary}. Here are some suggested Next Steps: ${contextNextSteps}. ${
      additionalContext
        ? `Here is some additional context that you can use to provide next steps: ${additionalContext}`
        : ""
    }`;

    if (!sessionData.isMainThread) {
      summaryPrompt = `Here is the Performed Pentest Summary: ${contextSummary}. Since you are a subthread, you can either continue analyzing the results or you can pass the results to the main thread.${
        additionalContext
          ? `Here is some additional context that you can use to provide next steps: ${additionalContext}`
          : ""
      }`;
    }
    const todoSummaryPrompt = await CopilotPrompts.todo_update_init(sessionId);
    // Update Todo List
    const todoHistory: HistoryData[] = [];

    todoHistory.push({
      role: "system",
      content: todoSummaryPrompt,
      isContextual: false,
      loopStep: 0,
    });

    todoHistory.push({
      role: "user",
      content: summaryPrompt,
      isContextual: true,
      loopStep: 0,
    });

    // await storeInputTokensGPT4(sessionId, todoHistory);

    if (dbSession.redoContext) {
      const redoData = `\nThis is the context you need to keep in mind while generating todo: ${dbSession.redoContext}`;

      todoHistory[todoHistory.length - 1].content += redoData;
      dbSession.redoContext = null;
    }

    const { success, content: todoResponse } = await ask_gpt4_model(
      todoHistory,
      sessionId
    );

    if (!success) {
      throw new Error("Error generating GPT4 todo");
    }

    console.log("todoResponse\n", todoResponse);
    // await storeInputTokensGPT3(sessionId, todoResponse);

    const todoResponseFixed = await fix_json_with_ai(
      ask_gpt3_model,
      todoResponse,
      "todo",
      sessionId
    );


    await updateSessionTodo({
      sessionId,
      todo: todoResponseFixed.todo,
    });

    await changeLastHistoryStepStatus({
      sessionId,
      lastStepType: "todo",
      status: "pending",
    });

    await updateLastloopHistoryStep({
      sessionId,
      lastStepType: "todo",
      newData: {
        content: JSON.stringify(todoResponseFixed.todo),
      },
    });

    const archiveHistory = await HistoryArchiveModel.findOne({
      sessionId,
    });

    if (archiveHistory) {
      let loopNum = archiveHistory.history.length;

      if (loopNum) {
        loopNum =
          archiveHistory.history[archiveHistory.history.length - 1].loop + 1;
      }

      const saveHistory = sessionData.history.map((item) => {
        return {
          ...item,
          content: JSON.stringify(item.content),
          loop: loopNum + 1,
        };
      });

      archiveHistory.history = [...archiveHistory.history, ...saveHistory];

      await archiveHistory.save();
    }

    const sysInit = await CopilotPrompts.generate_system_init(
      sessionId,
      user.configs.tools
    );
    // const nextStepsAndMaintainJson = await CopilotPrompts.contextual_next_steps(
    //   summaryPrompt
    // );

    newHistory.push({
      role: "system",
      content: sysInit,
      isContextual: false,
      loopStep: 0,
    });

    // newHistory.push({
    //   role: "user",
    //   content: summaryPrompt,
    //   isContextual: true,
    //   loopStep: 0,
    // });

    // newHistory.push({
    //   role: "assistant",
    //   content: nextStepsAndMaintainJson,
    //   isContextual: false,
    //   loopStep: 0,
    // });

    newHistory.push({
      role: "user",
      content: CopilotPrompts.plugin_inventory_maintain_json(
        !!sessionData.isMainThread,
        user.configs.tools,
        summaryPrompt
      ),
      isContextual: false,
      loopStep: 0,
    });

    await updateSessionHistory({
      sessionId,
      history: newHistory,
    });

    const updatedStoredCommands = dbSession.storeCommands.map((item) => {
      item.active = false;
      return item;
    });

    await SessionsModel.findOneAndUpdate(
      {
        sessionId,
        uid: user._id,
      },
      {
        $set: {
          storeCommands: updatedStoredCommands,
        },
      }
    );

    console.log("updated stored commands");

    return {
      success: true,
      message: "Finalized Todo and Reset History",
      session_id: sessionId,
    };
  } catch (error) {
    console.log(error);
  }
};

export const createNewSubProcess = async (sessionId: string) => {
  const sessionData = await getSessionData(sessionId);

  if (!sessionData) {
    throw new Error("Session not found");
  }

  const sessionHistory = sessionData.history;
  const sessionContext = sessionData.context;
  let sessionSubprocesses = sessionData.subprocess;

  const lastHistory = sessionHistory[sessionHistory.length - 1];
  const lastHistoryJSON = JSON.parse(lastHistory.content);

  const commands = lastHistoryJSON.commands;

  for (const command of commands) {
    const subprocessId = uuidv4().toString();

    const subprocess = {
      id: subprocessId,
      main_session_id: sessionId,
      command: command,
      context: sessionContext,
      status: "running",
    };

    console.log({ subprocess });

    if (!sessionSubprocesses) {
      console.log("creating new subprocess array");
      sessionSubprocesses = [];
    }

    console.log("pushing subprocess");
    sessionSubprocesses.push(subprocess);

    console.log({
      uid: sessionData.uid,
      sessionId: subprocessId,
      context: sessionContext,
      command: command,
      history: [],
      isMainThread: 0,
      mainSessionId: sessionId,
    });

    console.log("storing subprocess");
    // Store Subprocess
    await storeSession({
      uid: sessionData.uid,
      sessionId: subprocessId,
      context: sessionContext,
      command: command,
      history: [],
      isMainThread: 0,
      mainSessionId: sessionId,
    });

    console.log("update main session subprocess");
    // Update Main Session with subprocesses
    await updateMainSessionSubprocess({
      sessionId,
      subprocess: sessionSubprocesses,
    });
  }

  return sessionSubprocesses;
};

export const completeSessionSubprocess = async (subprocessId: string) => {
  const subprocessData = await getSessionData(subprocessId);

  if (!subprocessData) {
    throw new Error("Subprocess not found");
  }

  const context = subprocessData.context;

  if (!context) {
    throw new Error("Subprocess Context not found");
  }

  await completeSubprocess({
    subprocessId: subprocessId,
    context,
  });

  return subprocessData;
};

export const analyzeSubprocessData = async (
  sessionId: string,
  user: UserDoc
) => {
  console.log("analyseSubprocessData", sessionId);
  const sessionData = await getSessionData(sessionId);

  if (!sessionData) {
    throw new Error("Subprocess not found");
  }

  await changeLastHistoryStepStatus({
    sessionId,
    status: "completed",
    lastStepType: "command",
  });

  await addNextloopHistoryStep({
    sessionId,
    type: "output",
    data: {},
  });

  const contexts: string[] = [];

  console.log(
    "local subprocess",
    JSON.stringify(sessionData.subprocess, null, 4)
  );

  for (const subprocess of sessionData.subprocess) {
    const subprocess_context: string | null = subprocess["context"]["summary"];

    if (subprocess_context === null) {
      continue;
    }

    contexts.push(subprocess_context);
  }

  const sysInit = await CopilotPrompts.generate_system_init(
    sessionId,
    user.configs.tools
  );
  const prompt_for_analysis: string =
    CopilotPrompts.prompt_for_analysis(contexts);
  const new_history: any[] = [];

  new_history.push({
    role: "system",
    content: sysInit,
    isContextual: false,
    loopStep: 0,
  });

  // Contextual Summary Prompt
  new_history.push({
    role: "user",
    content: prompt_for_analysis,
    isContextual: true,
    loopStep: 0,
  });

  // await storeInputTokensGPT4(sessionId, new_history);

  const {
    content: global_summary,
    success,
  } = await ask_gpt4_model(new_history, sessionId);

  if (!success) {
    throw new Error("Error generating GPT4 summary");
  }

  const assistant_prompt: string = `I have analyzed the subprocesses and here is the summary: ${global_summary}`;

  sessionData.history.push({
    role: "assistant",
    content: assistant_prompt,
    isContextual: true,
    loopStep: 2,
  });

  await updateSessionHistory({
    sessionId,
    history: sessionData.history,
  });

  await updateLastloopHistoryStep({
    sessionId,
    lastStepType: "output",
    newData: {
      content: assistant_prompt,
    },
  });

  await changeLastHistoryStepStatus({
    sessionId,
    status: "pending",
    lastStepType: "output",
  });

  await clearSessionSubprocesses(sessionId);

  return {
    success: true,
    message: "Context Analyzed and Passed to Main Thread",
    session_id: sessionId,
    data: global_summary,
  };
};

export const initNetcatSession = async (sessionId: string) => {
  // await completeLastHistoryStep({ sessionId, lastStepType: "command" });

  const session = await SessionsModel.findOne({ sessionId });

  if (!session) {
    throw new Error("Session not found");
  }

  if (session.loopHistory.length === 0) {
    return {
      success: true,
    };
  }

  await changeLastHistoryStepStatus({
    sessionId,
    status: "completed",
    lastStepType: "command",
  });

  await addNextloopHistoryStep({
    sessionId,
    type: "output",
    data: {
      content: "Netcat session started",
    },
  });

  await changeLastHistoryStepStatus({
    sessionId,
    status: "pending",
    lastStepType: "output",
  });

  return {
    success: true,
  };
};

export const trackExecCommandOutput = async (output: string, currentCommand: string) => {
  try {
    console.log("🔍 Starting trackExecCommandOutput...");
    console.log("📝 Raw output length:", output.length);

    const regex = /<command_id_start>([\w-]+)<\/command_id_start>/;
    const match = output.match(regex);

    if (!match) {
      console.log("❌ No command ID found in output");
      return;
    }

    const commandId = match[1];
    console.log("✅ Command ID found:", commandId);

    const commandOutputStart = `<command_id_start>${commandId}</command_id_start>`;
    const commandOutputEnd = `<command_id_end>${commandId}</command_id_end>`;

    // Find the last start marker and last end marker (to handle multiple occurrences)
    const lastStartIndex = output.lastIndexOf(commandOutputStart);
    const lastEndIndex = output.lastIndexOf(commandOutputEnd);

    console.log("📍 Last start marker at:", lastStartIndex);
    console.log("📍 Last end marker at:", lastEndIndex);

    if (lastStartIndex === -1) {
      console.log("⏳ No start marker found, still processing...");
      return { status: "processing", commandId };
    }

    if (lastEndIndex === -1) {
      console.log("⏳ No end marker found, still processing...");
      return { status: "processing", commandId };
    }

    // Make sure end marker comes after start marker
    if (lastEndIndex <= lastStartIndex) {
      console.log("⏳ End marker before start marker, still processing...");
      return { status: "processing", commandId };
    }

    // Extract the command output (only the content between markers, excluding the markers themselves)
    let commandOutput = output
      .substring(lastStartIndex + commandOutputStart.length, lastEndIndex)
      .trim();

    console.log("📄 Command output length:", commandOutput.length);
    console.log("📄 Command output preview:", commandOutput.substring(0, 100));

    // If there's no meaningful output between markers, the command hasn't actually run yet
    if (commandOutput.length < 5 && !currentCommand.includes(">")) {
      console.log("⏳ Not enough output between markers, still processing...");
      return { status: "processing", commandId };
    }

    console.log("🎉 Command completed! Output length:", commandOutput.length);
    console.log("📤 Returning completed status with output");


    if (currentCommand.includes(">") && commandOutput.length < 5) {
      commandOutput = "Output stored in file";
    }

    // const tempFile = `/tmp/cmd_output_${commandId}.txt`;
    
    // const getFileContent = `cat ${tempFile}`;

    // const fileContent = await runCommandOnKali(getFileContent);

    // console.log("🔍 File content:", fileContent);

    return {
      status: "completed",
      commandId,
      output: commandOutput,
    };
  } catch (error) {
    console.log("❌ Error in trackExecCommandOutput:", error);
    return;
  }
};

export const extractRelevantContextUsingGPT3 = async (
  title: string,
  url: string,
  content: string
) => {
  try {
    const systemPrompt = `You are website pentester GPT, your aim is to analyze the webpage contents and identify possible attack vectors or places where you can perform pentest on. Don't return any remediating comments.`;
    const history: HistoryData[] = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: `Please return your thoughts on this in a good format starting with the Webpage Title: ${title}, Target URL: ${url}\nHere is the webpage content: ${content}`,
      },
    ];

    const { content: gptRes, success } = await ask_gpt3_model(history, "");

    console.log(gptRes);
    if (!success) {
      throw new Error("Error generating GPT3 response");
    }

    return gptRes;
  } catch (error) {
    console.log(error);
    throw new Error("Error contextualizing context");
  }
};
