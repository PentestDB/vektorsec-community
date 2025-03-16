import MessageBox from "@/components/common/messages/MessageBox";
import Thinking from "./Thinking";

const StepPage2 = ({
  finalizeOutput,
  loading,
  disabled,
  stepData,
  getOutputLoading,
  choice,
  isMainThread,
}) => {
  return (
    <>
      {getOutputLoading ? (
        <Thinking type="output" stepData={stepData} />
      ) : (
        <MessageBox
          type="output"
          stepData={stepData}
          finalizeOutput={finalizeOutput}
          choice={choice}
          // getSummaryData={getSummaryData}
          // pluginOutput={pluginOutput}
          loading={loading}
          disabled={disabled}
          isMainThread={isMainThread}
          // stepContent={stepContent}
        />
      )}
    </>
  );
};

export default StepPage2;
