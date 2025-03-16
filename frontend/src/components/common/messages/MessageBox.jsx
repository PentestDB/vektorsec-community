import { useEffect, useRef, useState } from "react";
import styles from "@/styles/components/Messages.module.scss";
import { Card, Col, Form, Input, Radio, Row, Spin, Tooltip } from "antd";
import PrimaryButton from "../PrimaryButton";
import CommandsTable from "./CommandsTable";
import { useDispatch, useSelector } from "react-redux";
import ReactMarkdown from "react-markdown";
import gfm from "remark-gfm";
import { MarkdownComponents } from "@/utils/markdownOptions";
import SubprocessTableComponent from "@/components/pages/session/sessionId/SubProcessTable";
import { IoIosArrowDown, IoIosArrowUp } from "react-icons/io";
import {
  CheckCircleFilled,
  DislikeOutlined,
  DoubleRightOutlined,
  LikeOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { setRecon } from "@/store/user.slice";
import FeedbackModal, { RedoModal } from "./FeedbackModal";
import { useParams } from "next/navigation";
import { useMutation, useQueryClient } from "react-query";
import { followGoogleTarget } from "@/services/session.service";
import FileAnalysisModal from "./FileAnalysisModal";

const MessageBox = ({
  disabled,
  type,
  loading,
  initiatePentestFunction,
  stepData,
  commands,
  activeCommands,
  isMainThread,
  runPluginsBasedOnCommand,
  finalizeOutput,
  resetHistory,
  startMultipleSubSessions,
  activeSubprocesses,
  completeSubprocess,
  analyzeAllSubprocessData,
  thinkType,
  choice: selectedChoice,
  status: stepStatus,
  generateCommandMutation,
}) => {
  const [form] = Form.useForm();
  const choice = Form.useWatch("run_plugin_choice", form);
  const queryClient = useQueryClient();

  const [selectedTarget, setSelectedTarget] = useState(null);
  const { status, readyToConnect, recon } = useSelector((state) => state.user);

  const { session_id: pathSessionId } = useParams();

  const [passBtnClick, setPassBtnClick] = useState(false);

  const [showLimitExceeded, setShowLimitExceeded] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [fileUpload, setFileUpload] = useState(false);
  const markdownBoxRef = useRef(null);

  useEffect(() => {
    if (markdownBoxRef.current?.offsetHeight > 200 && !showLimitExceeded) {
      setShowLimitExceeded(true);
      markdownBoxRef.current.style.maxHeight = "200px";
      markdownBoxRef.current.style.overflow = "hidden";
    }
  }, [markdownBoxRef, showLimitExceeded]);

  const [addContext, setAddContext] = useState(
    type === "summary" && stepData.additionalContext ? true : false
  );

  const [feedbackType, setFeedbackType] = useState(null);

  const sessionId = stepData?.sessionId ?? null;
  const currentStep = stepData?.currentStep ?? null;
  const currentLoopNumber = stepData?.currentLoopNumber ?? null;
  const currentAction = stepData?.action ?? null;
  const dispatch = useDispatch();

  const followTargetMutation = useMutation(followGoogleTarget, {
    onSuccess: async (data) => {
      await queryClient.invalidateQueries(["get-session-data", sessionId]);
      await queryClient.invalidateQueries([
        "get-session-loop-history",
        sessionId,
      ]);
    },
    onError: (error) => {
      console.log({ error });
    },
  });

  const onSubmitForm = async (values) => {
    if (type === "init") {
      await initiatePentestFunction({
        target_info: values.target_info,
        recon_info: values.recon_info,
        recon,
      });
    } else if (type === "command") {
      if (values?.new_term_select === "yes") {
        startMultipleSubSessions(values);
        // // setShowTable(true);
      } else {
        if (values.edit_msfvenom) {
          activeCommands[0].args = values.edit_msfvenom;
        }

        await runPluginsBasedOnCommand({
          commandId: activeCommands[0]?._id,
          pluginName: activeCommands[0]?.plugin_name,
          commandArgs: activeCommands[0]?.args,
          values,
        });
      }
    } else if (type === "output") {
      await finalizeOutput();
    } else if (type === "summary") {
      await resetHistory(values);
    } else if (type === "todo") {
      await resetHistory(values);
    }
    // }
  };

  const returnParsedOutput = (output) => {
    let isJSON = false;
    let jsonOutput = output;

    try {
      const parsedOutput = JSON.parse(output);
      isJSON = true;
      jsonOutput = JSON.stringify(parsedOutput, null, 2); // Prettify JSON with 2 spaces for indentation
      return "```json\n" + jsonOutput + "\n```";
    } catch (error) {
      return "```txt\n" + output + "\n```";
    }
  };

  const renderOptions = (plugin_name) => {
    if (
      ["run_bash", "searchsploit", "msf_listener", "python_server"].includes(
        plugin_name
      )
    ) {
      return (
        <Radio.Group>
          {((status === "running" && readyToConnect) || disabled) && (
            <>
              <Radio value="yes">Yes</Radio>
              <Radio value="no">No</Radio>
              <Radio value="edit">Edit</Radio>
            </>
          )}
          <Radio value="provide_output">
            I will execute it myself and provide the output
          </Radio>
        </Radio.Group>
      );
    }
    if (["msfvenom_payload"].includes(plugin_name)) {
      return (
        <Radio.Group>
          {((status === "running" && readyToConnect) || disabled) && (
            <>
              <Radio value="yes">Yes</Radio>
              <Radio value="no">No</Radio>
              <Radio value="edit">Edit</Radio>
            </>
          )}
          <Radio value="provide_output">
            I will execute it myself and provide the output
          </Radio>
        </Radio.Group>
      );
    }

    if (["google"].includes(plugin_name)) {
      return (
        <Radio.Group>
          <Radio value="yes">Yes</Radio>
          <Radio value="no">No</Radio>
          <Radio value="edit">Edit</Radio>
          <Radio value="provide_output">I will provide search results</Radio>
        </Radio.Group>
      );
    }

    if (["generic_response"].includes(plugin_name)) {
      return (
        <Radio.Group>
          <Radio value="provide_guidance">Provide Next Steps</Radio>
        </Radio.Group>
      );
    }

    if (["netcat_listener"].includes(plugin_name)) {
      return (
        <Radio.Group>
          <Radio value="start-nc">Start Netcat Listener</Radio>
          <Radio value="edit-port">Edit Port</Radio>
          <Radio value="provide_output">
            I&apos;ll manually open the listener
          </Radio>
        </Radio.Group>
      );
    }
  };

  const renderActions = () => {
    if (type === "init") {
      return <></>;
    }

    return (
      <div className={styles.actionPanel}>
        {(currentStep === type || currentStep === thinkType) &&
          currentLoopNumber === stepData.stepLoop &&
          !(type === "command" && !isMainThread && currentLoopNumber === 0) && (
            <Tooltip title="Undo/Redo this step">
              <div
                style={{
                  backgroundColor: "#daab00",
                }}
                className={styles.actionButton}
                onClick={async () => {
                  setFeedbackType("redo");
                  // await undoPreviousStepMutation.mutateAsync({
                  //   sessionId,
                  // });
                }}
                // disabled={undoPreviousStepMutation.isLoading}
              >
                <UndoOutlined
                  style={{
                    fontSize: 16,
                  }}
                />
              </div>
            </Tooltip>
          )}
        {!["todo", "init", "output", "thinking"].includes(type) &&
          !currentAction && (
            <>
              <div
                className={styles.actionButton}
                onClick={() => setFeedbackType("like")}
              >
                <Tooltip title="Like Copilot Response">
                  <LikeOutlined
                    style={{
                      fontSize: 16,
                    }}
                  />
                </Tooltip>
              </div>
              <div
                className={styles.actionButton}
                onClick={() => setFeedbackType("dislike")}
              >
                <Tooltip title="Dislike Copilot Response">
                  <DislikeOutlined
                    style={{
                      fontSize: 16,
                    }}
                  />
                </Tooltip>
              </div>
            </>
          )}

        {currentAction === "like" && (
          <Tooltip title="You liked this reponse">
            <div
              className={styles.actionButton}
              style={{
                backgroundColor: "#13a106",
              }}
            >
              <LikeOutlined
                style={{
                  fontSize: 16,
                }}
              />
            </div>
          </Tooltip>
        )}

        {currentAction === "dislike" && (
          <Tooltip title="You disliked this reponse">
            <div
              className={styles.actionButton}
              style={{
                backgroundColor: "#bc0000",
              }}
            >
              <DislikeOutlined
                style={{
                  fontSize: 16,
                }}
              />
            </div>
          </Tooltip>
        )}
      </div>
    );
  };

  const getLabel = (plugin_name) => {
    switch (plugin_name) {
      case "run_bash":
        return "Do you want to execute the command?";
      case "google":
        return "Do you want to search this query?";
      case "generic_response":
        return "Move forward with the engagement";
      case "searchsploit":
        return "Do you want to search this query?";
      case "msfvenom_payload":
        return "Do you want to generate the payload?";
      case "msf_listener":
        return "Do you want to generate a listener for this payload?";
      case "netcat_listener":
        return "Do you want to open a netcat listener with the above config?";
      case "python_server":
        return "Do you want to serve on this port?";
      default:
        return "Do you want to run the above command?";
    }
  };

  const returnCommandToRun = (args) => {
    if (args.command) {
      return args.command;
    } else if (args.query) {
      return args.query;
    } else if (args.response) {
      return args.response;
    } else if (args.lport) {
      return args.lport;
    } else {
      JSON.stringify(args);
    }
  };

  const getInitialValues = () => {
    let initialValues = {};

    if (disabled) {
      if (type === "init") {
        initialValues.target_info = stepData.content;
        initialValues.recon_info = stepData.additionalContext;
      } else if (type === "command") {
        if (activeCommands.length > 1) {
          initialValues.new_term_select = stepData.choice;
        } else {
          const selectedChoice = stepData.choice;
          initialValues.run_plugin_choice = stepData.choice;
          switch (selectedChoice) {
            case "edit":
              initialValues.editCommand = stepData.additionalContext;
              break;
            case "edit-port":
              initialValues["edit_port"] = stepData.additionalContext;
              break;
            case "provide_output":
              initialValues.provide_output = stepData.additionalContext;
              break;
            case "provide_guidance":
              initialValues.provide_guidance = stepData.additionalContext;
              break;
            case "no":
              initialValues.additional_context = stepData.additionalContext;
              break;
          }
        }
      } else if (type === "summary") {
        if (stepData.additionalContext) {
          // setAddContext(true)
          initialValues.additional_context = stepData.additionalContext;
        }
      } else if (type === "todo") {
        initialValues = {};
      }
    }

    return initialValues;
  };

  const renderOutputData = (stepData) => {
    if (stepData?.plugin === "google" && !stepData?.siteContext) {
      return (
        <div className={`${styles.messageBoxLabel}`}>
          {stepData?.content &&
            JSON.parse(stepData?.content)?.map((item, index) => {
              return (
                <Card
                  key={index}
                  className={`${styles.googleSearchCard} 
                  ${
                    selectedTarget?.title === item.title &&
                    selectedTarget?.url === item.url
                      ? styles.googleSearchCardSelected
                      : null
                  }`}
                  onClick={() => {
                    setSelectedTarget(item);
                  }}
                >
                  <h2>{item.title}</h2>
                  <a target="_blank" rel="noopener noreferrer" href={item.url}>
                    {item.url}
                  </a>
                  <p>{item.snippet}</p>
                </Card>
              );
            })}
        </div>
      );
    } else if (stepData?.plugin === "google" && stepData?.siteContext) {
      return (
        <div
          ref={markdownBoxRef}
          className={`${styles.messageBoxLabel} ${styles.messageMarkdownContainer}`}
        >
          <ReactMarkdown components={MarkdownComponents} remarkPlugins={[gfm]}>
            {returnParsedOutput(stepData?.siteContext ?? "No output")}
          </ReactMarkdown>
          {showLimitExceeded && (
            <Row
              onClick={() => {
                if (markdownBoxRef.current) {
                  if (!showMore) {
                    markdownBoxRef.current.style.maxHeight = "100%";
                    setShowMore(true);
                  } else {
                    markdownBoxRef.current.style.maxHeight = "200px";
                    setShowMore(false);
                  }
                }
              }}
              className={`${styles.showMoreContainer} ${
                !showMore ? styles.showMoreContainerBackground : null
              }`}
            >
              <Row align="middle" className={styles.showMoreButton}>
                {!showMore ? (
                  <>
                    <IoIosArrowDown />
                    Expand
                  </>
                ) : (
                  <>
                    <IoIosArrowUp />
                    Collapse
                  </>
                )}
              </Row>
            </Row>
          )}
        </div>
      );
    } else {
      return (
        <div
          ref={markdownBoxRef}
          className={`${styles.messageBoxLabel} ${styles.messageMarkdownContainer}`}
        >
          {["provide_guidance", "provide_output"].includes(selectedChoice) ? (
            <div className={styles.messageBoxLabelOutput}>
              {stepData?.content ?? "Nothing provided"}
            </div>
          ) : (
            <ReactMarkdown
              components={MarkdownComponents}
              remarkPlugins={[gfm]}
            >
              {returnParsedOutput(stepData?.content ?? "No output")}
            </ReactMarkdown>
          )}
          {showLimitExceeded && (
            <Row
              onClick={() => {
                if (markdownBoxRef.current) {
                  if (!showMore) {
                    markdownBoxRef.current.style.maxHeight = "100%";
                    setShowMore(true);
                  } else {
                    markdownBoxRef.current.style.maxHeight = "200px";
                    setShowMore(false);
                  }
                }
              }}
              className={`${styles.showMoreContainer} ${
                !showMore ? styles.showMoreContainerBackground : null
              }`}
            >
              <Row align="middle" className={styles.showMoreButton}>
                {!showMore ? (
                  <>
                    <IoIosArrowDown />
                    Expand
                  </>
                ) : (
                  <>
                    <IoIosArrowUp />
                    Collapse
                  </>
                )}
              </Row>
            </Row>
          )}
        </div>
      );
    }
  };
  // show More and hide show more

  return (
    <>
      <Card className={styles.messageBoxContainer}>
        {renderActions("liked")}

        <Form
          onFinish={onSubmitForm}
          className={styles.messageBoxForm}
          layout="vertical"
          form={form}
          initialValues={getInitialValues()}
        >
          {type === "init" && (
            <>
              <Form.Item
                className={styles.messageBoxFormItem}
                name="target_info"
                label="Please describe the penetration testing task in one line, including the target IP, task type, etc."
                rules={[
                  {
                    required: true,
                    message: "Please describe the penetration testing task",
                  },
                ]}
              >
                <Input
                  placeholder="Target IP: X.X.X.X, I want to exploit the php upload vulnerability on the target to gain server access."
                  disabled={disabled}
                />
              </Form.Item>

              {recon && (
                <Form.Item
                  className={styles.messageBoxFormItem}
                  name="recon_info"
                  label="Initial Recon Information"
                  rules={[
                    {
                      required: true,
                      message: "Initial Recon information is mandatory",
                    },
                  ]}
                >
                  <Input.TextArea
                    placeholder={`This can include nmap scan results, found pages, important information, etc. For example: 
- Nmap scan results: 22/tcp open ssh, 80/tcp open http, 443/tcp open https
- Found pages: /admin, /login, /robots.txt
- Important information: Found a backup file on http://<targetip>/admin/backup.zip we can analyze it to find more information about the target
                  `}
                    disabled={disabled}
                    autoSize={{ minRows: 6, maxRows: 12 }}
                    draggable={true}
                  />
                </Form.Item>
              )}
              {!disabled && (
                <Row gutter={16}>
                  <Col>
                    <PrimaryButton htmlType="submit" purple loading={loading}>
                      Start Copilot
                    </PrimaryButton>
                  </Col>
                  <Col>
                    {!recon ? (
                      <PrimaryButton
                        yellow
                        icon={<DoubleRightOutlined />}
                        onClick={() => dispatch(setRecon(true))}
                      >
                        Skip Recon
                      </PrimaryButton>
                    ) : (
                      <PrimaryButton
                        yellow
                        onClick={() => dispatch(setRecon(false))}
                      >
                        Back
                      </PrimaryButton>
                    )}
                  </Col>
                </Row>
              )}
            </>
          )}

          {type === "thinking" && (
            <>
              <Row
                align="middle"
                style={{ gap: "1rem" }}
                className={styles.messageBoxLabel}
              >
                <Spin size={"small"} className={styles.loader} />
                {thinkType === "summary"
                  ? "Pentest Copilot is summarizing the context..."
                  : thinkType === "output"
                  ? "Finalizing the output..."
                  : thinkType === "todo"
                  ? "Updating To-Do Checklist..."
                  : "Pentest Copilot is thinking 🤔💭"}
              </Row>
            </>
          )}

          {type === "command" && (
            <>
              {isMainThread && activeSubprocesses?.length > 0 ? (
                <SubprocessTableComponent
                  loading={loading}
                  data={activeSubprocesses ?? []}
                  allSubprocessesCompleted={analyzeAllSubprocessData}
                />
              ) : (
                <>
                  {commands?.thoughts && (
                    <>
                      <div
                        className={styles.messageBoxLabel}
                        style={{
                          paddingBottom: "0.5rem",
                        }}
                      >
                        Thoughts:
                      </div>

                      <ReactMarkdown
                        components={MarkdownComponents}
                        remarkPlugins={[gfm]}
                      >
                        {commands?.thoughts?.text + commands?.thoughts?.speak}
                      </ReactMarkdown>
                      <div
                        className={styles.messageBoxLabel}
                        style={{
                          paddingBottom: "0.5rem",
                        }}
                      >
                        Reasoning:
                      </div>
                      <p>
                        <ReactMarkdown
                          components={MarkdownComponents}
                          remarkPlugins={[gfm]}
                        >
                          {commands?.thoughts?.reasoning}
                        </ReactMarkdown>
                      </p>
                    </>
                  )}
                  {activeCommands && (
                    <>
                      <CommandsTable data={activeCommands} />
                      {activeCommands?.length > 1 && isMainThread && (
                        <>
                          <Form.Item
                            style={{
                              pointerEvents: disabled ? "none" : "auto",
                            }}
                            name="new_term_select"
                            label={`Do you want to open ${activeCommands?.length} new session(s) for each command?`}
                            initialValue={"yes"}
                          >
                            <Radio.Group>
                              <Radio value="yes">Yes</Radio>
                            </Radio.Group>
                          </Form.Item>
                          {!disabled && (
                            <PrimaryButton
                              purple
                              htmlType="submit"
                              loading={loading}
                            >
                              Continue
                            </PrimaryButton>
                          )}
                        </>
                      )}

                      {activeCommands?.length === 1 && (
                        <>
                          <Form.Item
                            style={{
                              pointerEvents: disabled ? "none" : "auto",
                            }}
                            name="run_plugin_choice"
                            label={getLabel(
                              // run_bash -> do you want to execute the command?
                              activeCommands[0]?.plugin_name
                            )}
                            initialValue={
                              activeCommands[0]?.plugin_name ===
                              "netcat_listener"
                                ? "start-nc"
                                : "yes"
                            }
                            rules={[
                              {
                                required: true,
                                message: "Please select an option",
                              },
                            ]}
                          >
                            {renderOptions(activeCommands[0]?.plugin_name)}
                          </Form.Item>
                          {/* if Edit or provide out put is there show a textbox */}
                          {choice === "edit" && (
                            <>
                              {activeCommands[0]?.plugin_name ===
                              "msfvenom_payload" ? (
                                <>
                                  <Form.Item
                                    name={["edit_msfvenom", "lhost"]}
                                    label="LHOST"
                                    initialValue={activeCommands[0]?.args.lhost}
                                  >
                                    <Input
                                      disabled={disabled}
                                      placeholder="LHOST"
                                    />
                                  </Form.Item>

                                  <Form.Item
                                    name={["edit_msfvenom", "lport"]}
                                    label="LPORT"
                                    initialValue={activeCommands[0]?.args.lport}
                                  >
                                    <Input
                                      disabled={disabled}
                                      placeholder="LPORT"
                                    />
                                  </Form.Item>

                                  <Form.Item
                                    name={["edit_msfvenom", "payload"]}
                                    label="Payload"
                                    initialValue={
                                      activeCommands[0]?.args.payload
                                    }
                                  >
                                    <Input
                                      disabled={disabled}
                                      placeholder="Payload"
                                    />
                                  </Form.Item>

                                  <Form.Item
                                    name={["edit_msfvenom", "file_format"]}
                                    label="File Format"
                                    initialValue={
                                      activeCommands[0]?.args.file_format
                                    }
                                  >
                                    <Input
                                      disabled={disabled}
                                      placeholder="File Format"
                                    />
                                  </Form.Item>

                                  <Form.Item
                                    name={["edit_msfvenom", "file_name"]}
                                    label="File Name"
                                    initialValue={
                                      activeCommands[0]?.args.file_name
                                    }
                                  >
                                    <Input
                                      disabled={disabled}
                                      placeholder="File Name"
                                    />
                                  </Form.Item>
                                </>
                              ) : (
                                <Form.Item
                                  name="editCommand"
                                  label="Edit the command"
                                  initialValue={returnCommandToRun(
                                    activeCommands[0]?.args
                                  )}
                                >
                                  <Input.TextArea
                                    disabled={disabled}
                                    placeholder="Provide the output of the command"
                                  />
                                </Form.Item>
                              )}
                            </>
                          )}

                          {choice === "edit-port" && (
                            <Form.Item
                              name="edit_port"
                              label="Edit the port"
                              initialValue={returnCommandToRun(
                                activeCommands[0]?.args
                              )}
                            >
                              <Input
                                disabled={disabled}
                                placeholder="Enter the port"
                              />
                            </Form.Item>
                          )}
                          {choice === "provide_output" && (
                            <Form.Item
                              name="provide_output"
                              label="Provide the output of the command"
                              rules={[
                                {
                                  required: true,
                                  message: "Please provide the command output",
                                },
                              ]}
                            >
                              <Input.TextArea
                                disabled={disabled}
                                placeholder="Provide the output of the command"
                                autoSize={{ minRows: 6, maxRows: 12 }}
                              />
                            </Form.Item>
                          )}
                          {choice === "provide_guidance" && (
                            <Form.Item
                              name="provide_guidance"
                              label="Please provide the suggested actions"
                            >
                              <Input.TextArea
                                disabled={disabled}
                                placeholder="Please provide the suggested actions"
                              />
                            </Form.Item>
                          )}
                          {choice === "no" && (
                            <Form.Item
                              name="additional_context"
                              label="Please provide some additional context"
                            >
                              <Input.TextArea
                                disabled={disabled}
                                placeholder="Please provide some additional context"
                              />
                            </Form.Item>
                          )}
                          {!disabled && (
                            <PrimaryButton
                              loading={loading}
                              purple
                              disabled={disabled}
                              htmlType="submit"
                            >
                              Continue
                            </PrimaryButton>
                          )}
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}

          {type === "output" && (
            <>
              <div>
                {stepData?.plugin === "google" ? (
                  <div className={styles.messageBoxLabel}>
                    View your search results, select the target which you want
                    to follow:
                  </div>
                ) : (
                  <div className={styles.messageBoxLabel}>
                    {selectedChoice === "no"
                      ? "You chose not to execute the command, here's the context you provided:"
                      : selectedChoice === "provide_guidance"
                      ? "Next Things to focus on:"
                      : "Here's the output of the previous command"}
                  </div>
                )}

                {renderOutputData(stepData)}
              </div>

              {!disabled && (
                <>
                  {stepData?.plugin === "google" ? (
                    <>
                      {!!stepData?.siteContext ? (
                        <>
                          <Form.Item label="Continue to summary & next steps">
                            <PrimaryButton
                              purple
                              htmlType="submit"
                              className={styles.submitBtn}
                              loading={loading}
                              disabled={!stepData?.siteContext}
                            >
                              Continue
                            </PrimaryButton>
                          </Form.Item>
                        </>
                      ) : (
                        <>
                          {selectedTarget ? (
                            <p>
                              You have deviced to follow :{" "}
                              <b>{selectedTarget?.title}</b> -{" "}
                              <a
                                target="_blank"
                                rel="noopener noreferrer"
                                href={selectedTarget?.url}
                              >
                                {selectedTarget?.url}
                              </a>
                            </p>
                          ) : (
                            <p>
                              Please select a target to follow from the list
                              above
                            </p>
                          )}
                          <PrimaryButton
                            purple
                            className={styles.submitBtn}
                            onClick={async () => {
                              await followTargetMutation.mutateAsync({
                                sessionId,
                                stepId: stepData.stepId,
                                target: selectedTarget,
                              });
                            }}
                            loading={followTargetMutation.isLoading}
                            disabled={!selectedTarget?.url}
                          >
                            Follow Target
                          </PrimaryButton>
                        </>
                      )}
                    </>
                  ) : (
                    <Form.Item label="Continue to summary & next steps">
                      <PrimaryButton
                        purple
                        htmlType="submit"
                        className={styles.submitBtn}
                        loading={loading}
                      >
                        Continue
                      </PrimaryButton>
                    </Form.Item>
                  )}
                </>
              )}
            </>
          )}

          {type === "summary" && (
            <>
              <div className={styles.messageBoxLabel}>Summary</div>
              <div
                className={styles.messageBoxLabelOutput}
                style={{
                  fontWeight: 400,
                }}
              >
                <code>
                  <p>{stepData?.content.loopSummary ?? "No summary"}</p>
                </code>
              </div>

              <div
                className={styles.messageBoxLabel}
                style={{ paddingTop: "1rem" }}
              >
                Next steps
              </div>
              <div
                className={styles.messageBoxLabelOutput}
                style={{
                  fontWeight: 400,
                }}
              >
                <code>
                  <p>{stepData?.content.nextSteps ?? "No output"}</p>
                </code>
              </div>

              {stepData.fileAnalysis && (
                <>
                  <div
                    className={styles.messageBoxLabel}
                    style={{ paddingTop: "1rem" }}
                  >
                    File Analysis Summary
                  </div>
                  <div
                    className={styles.messageBoxLabelOutput}
                    style={{
                      fontWeight: 400,
                    }}
                  >
                    <code>
                      <ReactMarkdown
                        components={MarkdownComponents}
                        remarkPlugins={[gfm]}
                      >
                        {stepData?.fileAnalysis}
                      </ReactMarkdown>
                    </code>
                  </div>
                </>
              )}

              {addContext && (
                <Form.Item
                  name="additional_context"
                  label="Provide some additional context"
                >
                  <Input.TextArea
                    disabled={disabled}
                    placeholder="Provide some additional context"
                  />
                </Form.Item>
              )}

              {!disabled && (
                <Row
                  style={{
                    flexDirection: "column",
                    alignItems: "flex-start",
                    marginTop: "2rem",
                  }}
                >
                  <Row
                    align="middle"
                    style={{
                      marginTop: "1rem",
                      gap: "1rem",
                      alignSelf: "flex-start",
                    }}
                  >
                    {!isMainThread && (
                      <PrimaryButton
                        yellow
                        onClick={async () => {
                          setPassBtnClick(true);
                          await completeSubprocess();
                          setPassBtnClick(false);
                        }}
                        className={styles.submitBtn}
                        loading={passBtnClick && loading}
                      >
                        Continue to Main Workspace
                      </PrimaryButton>
                    )}{" "}
                    <PrimaryButton
                      purple
                      htmlType="submit"
                      loading={!passBtnClick && loading}
                      className={styles.submitBtn}
                    >
                      Continue
                    </PrimaryButton>
                    <PrimaryButton
                      green
                      className={styles.submitBtn}
                      onClick={() => setAddContext((p) => !p)}
                    >
                      {addContext
                        ? "I don't want to give additional context"
                        : "Add additional context"}
                    </PrimaryButton>
                    <PrimaryButton
                      yellow
                      className={styles.submitBtn}
                      onClick={() => setFileUpload(true)}
                    >
                      Analyze File
                    </PrimaryButton>
                  </Row>
                </Row>
              )}
            </>
          )}

          {type === "todo" && (
            <>
              <Row
                align="middle"
                style={{ gap: "1rem" }}
                className={styles.todoLabel}
              >
                <CheckCircleFilled
                  size={"large"}
                  className={styles.loader}
                  style={{
                    color: ["pending", "completed"].includes(stepStatus)
                      ? "#52c41a"
                      : "#f5222d",
                  }}
                />
                Updated To-Do Checklist
              </Row>

              {["pending"].includes(stepStatus) && (
                <>
                  <p
                    className={styles.todoPara}
                    style={{
                      marginTop: "1rem",
                    }}
                  >
                    To continue with the next loop, click on the button below.
                    Next step is to generate the command.
                  </p>
                  <PrimaryButton
                    style={{
                      marginTop: "1rem",
                    }}
                    purple
                    onClick={async () => {
                      await generateCommandMutation.mutateAsync({
                        sessionId,
                      });
                    }}
                    loading={
                      generateCommandMutation.isLoading &&
                      ["pending"].includes(stepStatus)
                    }
                  >
                    Continue with next loop
                  </PrimaryButton>
                </>
              )}
            </>
          )}
        </Form>
      </Card>

      {feedbackType && ["like", "dislike"].includes(feedbackType) && (
        <FeedbackModal
          type={feedbackType}
          sessionId={sessionId}
          stepId={stepData.stepId}
          close={() => setFeedbackType(null)}
        />
      )}

      {feedbackType && ["redo"].includes(feedbackType) && (
        <RedoModal
          sessionId={sessionId}
          pathSessionId={pathSessionId}
          close={() => setFeedbackType(null)}
        />
      )}

      {fileUpload && (
        <FileAnalysisModal
          show={fileUpload}
          close={() => setFileUpload(false)}
          sessionId={sessionId}
        />
      )}
    </>
  );
};

export default MessageBox;
