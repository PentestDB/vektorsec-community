import React, { useEffect, useRef, useState } from "react";
import styles from "@/styles/pages/Session.module.scss";
import StepPage0 from "./Step0";
import { useMutation, useQuery, useQueryClient } from "react-query";
import {
  finalizeCopilotCommand,
  generateCopilotCommand,
  initiateCopilotPentest,
  storeCommandOutput,
  finalizeOutputAndGetSummary,
  finalizeSummary,
  analyzeAllSubprocess,
  finalizeTodoAndResetHistory,
  agenticContinue,
} from "@/services/session.service";
import {
  completeSubprocess,
  createSubprocesses,
  getSessionData,
  getSessionLoopHistory,
  initiateNetcatSession,
} from "@/services/copilot.service";
import StepPage1 from "./Step1";
import { useDispatch, useSelector } from "react-redux";
import { updateTerminalHeight } from "@/store/socket.slice";
import StepPage2 from "./Step2";
import StepPage3 from "./Step3";
import { closeSession, updateSessions } from "@/store/user.slice";
import { message, notification } from "antd";
import { useRouter } from "next/navigation";
import Loader from "@/components/common/loader/Loader";
// import { DownCircleFilled } from "@ant-design/icons";
import StepPage4 from "./Step4";
import { checkUserAccess } from "@/services/user.service";
import { useSocketContext } from "@/context/SocketContext";
import { updateActiveTerminal } from "@/store/socket.slice";
import { v4 as uuidv4 } from "uuid";

const SessionMainPage = ({ session_id }) => {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const router = useRouter();

  const [isMainThread, setIsMainThread] = useState(true);
  const [currentStep, setCurrentStep] = useState("init");
  const [activeCommands, setActiveCommands] = useState([]);
  const [storingOutput, setStoringOutput] = useState(false);
  const [generatingCommand, setGeneratingCommand] = useState(false);
  const [currentLoopNumber, setCurrentLoopNumber] = useState(0);


  const containerRef = useRef(null);

  const { user, status, sessions } = useSelector((state) => state.user);
  const { getSocket } = useSocketContext();
  const terminalSocket = getSocket(session_id);

  const handleCommandExecutionResult = async (data) => {
    console.log("Command executed", data);
    if (data.type === "output") {
      await storeCommandMutation.mutateAsync({
        session_id: session_id,
        commandId: data.commandId,
        output: data.tool_response,
      });
    }
  };

  const truncateCommandLabel = (command) => {
    if (!command) return "Running Command";
    const compact = command.replace(/\s+/g, " ").trim();
    if (compact.length <= 28) return compact;
    return `${compact.slice(0, 28)}...`;
  };

  const runCommandInTemporaryTerminal = async ({ command, commandId }) => {
    if (!terminalSocket) {
      message.error("Terminal connection is not ready. Please wait and try again.");
      setStoringOutput(false);
      return;
    }

    const tempTerminalId = uuidv4();
    const nextSessions = sessions.map((session) => ({ ...session }));

    nextSessions.push({
      id: tempTerminalId,
      is_main: false,
      is_active: false,
      type: "terminal",
      temporary: true,
      title: truncateCommandLabel(command),
      commandToRun: command,
      commandId,
      sourceSessionId: session_id,
    });

    dispatch(updateSessions(nextSessions));
    dispatch(updateActiveTerminal(tempTerminalId));

    terminalSocket.once(`command_result-${commandId}`, async (data) => {
      await handleCommandExecutionResult(data);
    });
  };

  useEffect(() => {
    if (terminalSocket) {
      dispatch(updateTerminalHeight(window.innerHeight / 3.5));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session_id, terminalSocket]);

  useEffect(() => {
    if (terminalSocket && !storingOutput) {
      const handleMainTerminalCommandExecuted = async (data) => {
        await handleCommandExecutionResult(data);
      };

      terminalSocket.on(
        `command_executed-${session_id}`,
        handleMainTerminalCommandExecuted
      );

      return () => {
        terminalSocket.off(
          `command_executed-${session_id}`,
          handleMainTerminalCommandExecuted
        );
      };
    }
  }, [storingOutput, terminalSocket, session_id]);

  const { data: sessionData } = useQuery(
    ["get-session-data", session_id],
    () => getSessionData({ session_id }),
    {
      enabled: session_id !== undefined,
      onSuccess: (data) => {
        setIsMainThread(data.isMainThread === 1 ? true : false);

        if (data.command && data.isMainThread === 0) {
          setActiveCommands([data.command]);
        }

        if (data.commands) {
          setActiveCommands([...data.commands]);
        }

        let updatedSessions = [...sessions];

        if (data.isMainThread) {
          if (data?.subprocess?.length > 0) {
            // get subprocesses
            data.subprocess.map((subprocess) => {
              const exists = updatedSessions.find(
                (session) => session.id === subprocess.id
              );

              if (!exists && subprocess.status === "running") {
                updatedSessions.push({
                  id: subprocess.id,
                  is_main: false,
                  is_active: false,
                  type: "session",
                });
              }
            });
          }

          // get netcat sessions
          if (data?.netcat?.length > 0) {
            data.netcat.map((netcat) => {
              const exists = updatedSessions.find(
                (session) => session.id === netcat.netcat_id
              );

              if (!exists && netcat.status !== "stopped") {
                updatedSessions.push({
                  id: netcat.netcat_id,
                  is_main: false,
                  is_active: false,
                  type: "netcat",
                });
              }
            });
          }
        }

        const guiExists = updatedSessions.find(
          (session) => session.type === "gui"
        );

        const vpnExists = updatedSessions.find(
          (session) => session.type === "vpn"
        );

        const mainSession = updatedSessions.find(
          (session) => session.is_main === true
        );

        if (!guiExists) {
          updatedSessions.push({
            id: mainSession.id + "/gui",
            is_main: false,
            is_active: false,
            type: "gui",
          });
        }

        if (!vpnExists) {
          updatedSessions.push({
            id: mainSession.id + "/vpn",
            is_main: false,
            is_active: false,
            type: "vpn",
          });
        }

        dispatch(updateSessions(updatedSessions));
      },
    }
  );

  const { data: loopHistoryData, isLoading: loadingLoopHistory } = useQuery(
    ["get-session-loop-history", session_id],
    () => getSessionLoopHistory({ session_id }),
    {
      enabled: session_id !== undefined,
      refetchInterval: 10000,
      onSuccess: async (data) => {
        setCurrentStep(data.currentStep);
        setCurrentLoopNumber(data.currentLoopNumber);
        if (data.loopHistory.length > 0) {
          const lastSteptype =
            data.loopHistory[data.loopHistory.length - 1]?.stepType;
          const lastStepStatus =
            data.loopHistory[data.loopHistory.length - 1]?.status;

          if (lastStepStatus === "not-started") {
            if (lastSteptype === "command" && generatingCommand === false) {
              setGeneratingCommand(true);

              await generateCopilotCommandMutation.mutateAsync({
                sessionId: session_id,
              });
            }
          }

          if (lastSteptype === "command" && lastStepStatus === "pending") {
            setGeneratingCommand(false);
          }
        }
      },
    }
  );

  const refreshSessionData = async () => {
    await queryClient.invalidateQueries(["get-session-data", session_id]);
    await queryClient.invalidateQueries([
      "get-session-loop-history",
      session_id,
    ]);
  };

  const initiatePentestMutation = useMutation(initiateCopilotPentest, {
    onSuccess: async (data) => {
      await refreshSessionData();
    },
    onError: (err) => {
      console.log(err);
      notification.error({
        message: "Failed to initiate pentest copilot",
        description:
          err?.response?.data?.err === "no-gold"
            ? "You dont have enough gold!"
            : err?.response?.data?.message ?? "Something went wrong",
      });
    },
  });

  const generateCopilotCommandMutation = useMutation(generateCopilotCommand, {
    onSuccess: async (data) => {
      // setGeneratingCommand(false)
      await refreshSessionData();
    },
    onError: (err) => {
      console.log(err);
      notification.error({
        message: "Failed to generate copilot command",
        description:
          err?.response?.data?.err === "no-gold"
            ? "You dont have enough gold!"
            : err?.response?.data?.message ?? "Something went wrong",
      });
    },
  });

  const agenticContinueMutation = useMutation(agenticContinue, {
    onSuccess: async (data) => {
      console.log("[agenticContinue] completed:", data);
      await refreshSessionData();
    },
    onError: (err) => {
      console.log("[agenticContinue] error:", err);
      notification.error({
        message: "Agentic loop error",
        description: err?.response?.data?.message ?? "Something went wrong",
      });
    },
  });

  const storeCommandMutation = useMutation(storeCommandOutput, {
    onSuccess: async (data) => {
      setStoringOutput(false);
      await queryClient.invalidateQueries(["get-session-data", session_id]);
      await queryClient.invalidateQueries([
        "get-session-loop-history",
        session_id,
      ]);

      agenticContinueMutation.mutate({ sessionId: session_id });
    },
  });

  const finalizeOutputAndGetSummaryMutation = useMutation(
    finalizeOutputAndGetSummary,
    {
      onSuccess: async (data) => {
        await refreshSessionData();
        agenticContinueMutation.mutate({ sessionId: session_id });
      },
    }
  );

  const finalizeTodoMutation = useMutation(finalizeTodoAndResetHistory, {
    onSuccess: async (data) => {
      await refreshSessionData();
    },
  });

  const finalizeSummaryMutation = useMutation(finalizeSummary, {
    onSuccess: async (data) => {
      await refreshSessionData();

      finalizeTodoMutation.mutate({
        sessionId: session_id,
      });
    },
    onError: (error) => {
      console.log(error);
      notification.error({
        message: "Error",
        description: error?.response?.data?.message,
      });
    },
  });

  const createSubprocessesMutation = useMutation(createSubprocesses, {
    onSuccess: async (data) => {
      message.success(data?.message ?? "Subprocesses created successfully!");
      await refreshSessionData();
    },
  });

  const completeSubprocessMutation = useMutation(completeSubprocess, {
    onSuccess: async (data) => {
      message.success(
        "Subprocess completed successfully! Redirecting to main session in 5 seconds."
      );

      const session_id = data.session_id;

      if (session_id) {
        setTimeout(() => {
          dispatch(closeSession(session_id));

          const mainSession = sessions.find((s) => s.is_main === true);

          router.push(`/session/${mainSession.id}`);
        }, 5000);
      }
    },
  });

  const analyzeAllSubprocessMutation = useMutation(analyzeAllSubprocess, {
    onSuccess: async (data) => {
      await refreshSessionData();
    },
  });

  const initiateNetcatListenerMutation = useMutation(initiateNetcatSession, {
    onSuccess: async (data) => {
      message.success(
        data?.message ?? "Netcat session initiated successfully!"
      );
      const netcatId = data.netcatId;

      await refreshSessionData();

      let updatedSess = [...sessions];

      const exists = updatedSess.find((session) => session.id === netcatId);

      updatedSess = updatedSess.map((s) => {
        return { ...s, is_active: false };
      });

      if (!exists) {
        updatedSess.push({
          id: netcatId,
          is_main: false,
          is_active: true,
          type: "netcat",
        });

        dispatch(updateSessions(updatedSess));
      }

      // open a netcat sidebar tab
      router.push(`/session/${session_id}/netcat/${netcatId}`);
    },
    onError: (error) => {
      console.log(error);
      notification.error({
        message: "Error",
        description: error?.response?.data?.message,
      });
    },
  });

  const finalizeCopilotCommandMutation = useMutation(finalizeCopilotCommand, {
    onSuccess: async (data) => {
      await refreshSessionData();
      if (data.type === "command") {
        setStoringOutput(true);
        await runCommandInTemporaryTerminal({
          command: data.command,
          commandId: data.commandId ?? activeCommands?.[0]?._id,
        });
        return;
      } else {
        await queryClient.invalidateQueries(["get-session-data", session_id]);
        await queryClient.invalidateQueries([
          "get-session-loop-history",
          session_id,
        ]);
        agenticContinueMutation.mutate({ sessionId: session_id });
        return;
      }
    },
  });

  const initiatePentest = async (values) => {
    const { target_info, recon_info, recon } = values;
    await initiatePentestMutation.mutateAsync({
      target_info,
      sessionId: session_id,
      recon_info,
      recon,
    });
  };

  const runPluginsBasedOnCommand = async ({
    commandId,
    toolName,
    commandArgs,
    values,
  }) => {
    let command = {
      commandId,
      tool_name: toolName,
      command_args: commandArgs,
      choice: values.run_tool_choice,
    };

    const choice = values.run_tool_choice;

    if (
      status !== "running" &&
      ["yes", "edit"].includes(choice) &&
      toolName !== "google"
    ) {
      message.error(
        "Exploit box is not running cannot pick yes/edit as choice"
      );
      return;
    }

    const editedPort = values.edit_port;

    if (choice === "yes") {
      await finalizeCopilotCommandMutation.mutateAsync({
        sessionId: session_id,
        command,
      });
    } else if (choice === "edit") {
      if (toolName !== "msfvenom_payload") {
        const { editCommand } = values;

        command.command_args = {
          command: editCommand,
        };
      }

      await finalizeCopilotCommandMutation.mutateAsync({
        sessionId: session_id,
        command,
      });
    } else if (["provide_output", "provide_guidance"].includes(choice)) {
      command.command_args = {
        ...command.command_args,
        output:
          choice === "provide_guidance"
            ? values.provide_guidance
            : values.provide_output,
      };

      await finalizeCopilotCommandMutation.mutateAsync({
        sessionId: session_id,
        command,
      });
    } else if (choice === "no") {
      command.command_args = {
        ...command.command_args,
        output: values.additional_context,
      };

      await finalizeCopilotCommandMutation.mutateAsync({
        sessionId: session_id,
        command,
      });
    } else if (["start-nc", "edit-port"].includes(choice)) {
      let port = activeCommands[0].args.lport;

      if (choice === "edit-port") {
        port = editedPort;
      }

      const data = await initiateNetcatListenerMutation.mutateAsync({
        session_id,
        access: "loop",
      });

      // open netcat tab after step 2 and preload port
      router.push(
        `/session/${session_id}/netcat/${data.netcatId}?port=${port}`
      );
    }
  };

  const finalizeOutput = async () => {
    await finalizeOutputAndGetSummaryMutation.mutateAsync({
      sessionId: session_id,
    });
    await queryClient.invalidateQueries(["fetch-user-gold"]);
  };

  const finalizeSummaryFunc = async (values) => {
    const { additional_context } = values;

    await finalizeSummaryMutation.mutateAsync({
      sessionId: session_id,
      additionalContext: additional_context,
    });
  };

  const startMultipleSubSessions = async (values) => {
    const newTermSelection = values.new_term_select;

    if (newTermSelection === "yes") {
      await createSubprocessesMutation.mutateAsync({
        session_id,
        commands_list: activeCommands,
      });
    }
  };

  const completeParticularSubprocess = async () => {
    await completeSubprocessMutation.mutateAsync({
      session_id,
    });
  };

  const analyzeAllSubprocessData = async () => {
    await analyzeAllSubprocessMutation.mutateAsync({
      sessionId: session_id,
    });
  };

  const renderSteps = ({
    disabled = false,
    stepType = currentStep,
    stepLoop,
    data = {
      currentStep,
      sessionId: session_id,
    },
    status = null,
    loading = false,
    index,
  }) => {
    switch (stepType) {
      case "init":
        return (
          <StepPage0
            initiatePentestFunction={initiatePentest}
            loading={initiatePentestMutation.isLoading || loading}
            status={status}
            disabled={disabled}
            stepData={{
              ...data,
              currentStep,
              sessionId: session_id,
              currentLoopNumber,
              stepLoop,
              isMainThread,
            }}
          />
        );
      case "command":
        return (
          <StepPage1
            stepData={{
              ...data,
              currentStep,
              sessionId: session_id,
              currentLoopNumber,
              stepLoop,
              isMainThread,
            }}
            isMainThread={isMainThread}
            activeCommands={activeCommands}
            runPluginsBasedOnCommand={runPluginsBasedOnCommand}
            startMultipleSubSessions={startMultipleSubSessions}
            activeSubprocesses={sessionData?.subprocess}
            loading={
              finalizeCopilotCommandMutation.isLoading ||
              initiateNetcatListenerMutation.isLoading ||
              createSubprocessesMutation.isLoading ||
              analyzeAllSubprocessMutation.isLoading
            }
            analyzeAllSubprocessData={analyzeAllSubprocessData}
            disabled={disabled}
            getCommandLoading={loading}
          />
        );
      case "output":
        return (
          <StepPage2
            choice={loopHistoryData?.loopHistory[index - 1]?.data?.choice}
            loading={finalizeOutputAndGetSummaryMutation.isLoading}
            disabled={disabled}
            stepData={{
              ...data,
              currentStep,
              sessionId: session_id,
              currentLoopNumber,
              stepLoop,
              isMainThread,
            }}
            isMainThread={isMainThread}
            finalizeOutput={finalizeOutput}
            getOutputLoading={loading}
          />
        );

      case "summary":
        return (
          <StepPage3
            isMainThread={isMainThread}
            disabled={disabled}
            stepData={{
              ...data,
              currentStep,
              sessionId: session_id,
              currentLoopNumber,
              stepLoop,
              isMainThread,
            }}
            resetHistory={finalizeSummaryFunc}
            loading={
              finalizeSummaryMutation.isLoading ||
              completeSubprocessMutation.isLoading
            }
            completeSubprocess={completeParticularSubprocess}
            getSummaryLoading={loading}
          />
        );

      case "todo":
        return (
          <StepPage4
            stepData={{
              ...data,
              currentStep,
              sessionId: session_id,
              currentLoopNumber,
              stepLoop,
              isMainThread,
            }}
            isMainThread={isMainThread}
            status={status}
            generateCommandMutation={generateCopilotCommandMutation}
            sessionId={session_id}
          />
        );
    }
  };

  if (!user) {
    return (
      <>
        <Loader />;
      </>
    );
  }

  return (
    <div
      className={
        status === "running"
          ? `${styles.sessionMainWrapper} ${styles.sessionRunning}`
          : styles.sessionMainWrapper
      }
      ref={(ref) => {
        containerRef.current = ref;
      }}
    >
      <div className={styles.sessionContainer}>
        {/* <FloatButton
          className={styles.scrollDown}
          onClick={() => {
            containerRef.current.scrollIntoView({
              behavior: "smooth",
              block: "end",
              inline: "nearest",
            });
          }}
          icon={<DownCircleFilled />}
        /> */}
        {loopHistoryData?.loopHistory?.map((loop, index) => (
          <div key={loop._id} id={`loop-${loop.loop}`}>
            <div className={styles.stepsContainer}>
              {renderSteps({
                index,
                disabled: loop.status === "completed",
                stepType: loop.stepType,
                data: { ...loop.data, stepId: loop._id, action: loop.action },
                status: loop.status,
                stepLoop: loop.loop,
                loading:
                  loop.status === "not-started" || loop.status === "processing",
              })}
            </div>
          </div>
        ))}
        {loopHistoryData?.loopHistory?.length === 0 && (
          <div className={styles.stepsContainer}>{renderSteps({})}</div>
        )}
        {/* {generateCopilotCommandMutation.isLoading && (
          <div className={styles.stepsContainer}>{renderSteps({
            stepType: "command",
            disabled: false
          })}</div>
        )} */}
      </div>

    </div>
  );
};

export default SessionMainPage;
