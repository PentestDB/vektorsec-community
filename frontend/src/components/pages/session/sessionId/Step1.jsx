import MessageBox from "@/components/common/messages/MessageBox";
import Thinking from "./Thinking";

const StepPage1 = ({
  isMainThread,
  runPluginsBasedOnCommand,
  loading,
  disabled,
  stepData,
  activeCommands,
  getCommandLoading,
  startMultipleSubSessions,
  activeSubprocesses,
  analyzeAllSubprocessData,
}) => {
  return (
    <>
      {getCommandLoading ? (
        <Thinking type="command" stepData={stepData} />
      ) : (
        <>
          {stepData && (
            <MessageBox
              type="command"
              loading={loading}
              isMainThread={isMainThread}
              activeCommands={
                activeCommands?.length > 0 && !disabled
                  ? activeCommands
                  : stepData?.content
                  ? JSON.parse(stepData?.content)?.commands
                  : null
              }
              // commandResponse={commandResponse}
              // checkForNewTerminals={checkForNewTerminals}
              startMultipleSubSessions={startMultipleSubSessions}
              activeSubprocesses={
                !disabled && activeSubprocesses?.length > 0
                  ? activeSubprocesses
                  : null
              }
              runPluginsBasedOnCommand={runPluginsBasedOnCommand}
              analyzeAllSubprocessData={analyzeAllSubprocessData}
              // subprocessesData={subprocessesData}
              // allSubprocessesCompleted={allSubprocessesCompleted}
              disabled={disabled}
              stepData={stepData}
              commands={JSON.parse(stepData.content ?? "{}")}
              // stepContent={stepContent}
            />
          )}
        </>
      )}
    </>
  );
};

export default StepPage1;
