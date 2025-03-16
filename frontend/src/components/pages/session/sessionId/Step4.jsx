import MessageBox from "@/components/common/messages/MessageBox";

const StepPage4 = ({
  stepData,
  status,
  isMainThread,
  generateCommandMutation,
}) => {
  return (
    <>
      <MessageBox
        isMainThread={isMainThread}
        stepData={stepData}
        status={status}
        thinkType={"todo"}
        type={
          stepData && ["pending", "completed"].includes(status)
            ? "todo"
            : "thinking"
        }
        generateCommandMutation={generateCommandMutation}
      />
    </>
  );
};

export default StepPage4;
