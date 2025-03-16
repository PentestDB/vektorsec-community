import MessageBox from "@/components/common/messages/MessageBox";
import Thinking from "./Thinking";

const StepPage3 = ({
  isMainThread,
  stepData,
  resetHistory,
  completeSubprocess,
  loading,
  disabled,
  getSummaryLoading,
}) => {
  return (
    <>
      {getSummaryLoading ? (
        <Thinking type="summary" stepData={stepData} />
      ) : (
        <MessageBox
          type="summary"
          // data={data}
          isMainThread={isMainThread}
          resetHistory={resetHistory}
          completeSubprocess={completeSubprocess}
          loading={loading}
          disabled={disabled}
          // stepContent={stepContent}
          stepData={{
            ...stepData,
            content: JSON.parse(stepData.content),
          }}
        />
      )}
    </>
  );
};

export default StepPage3;
