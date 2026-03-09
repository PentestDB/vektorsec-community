import MessageBox from "@/components/common/messages/MessageBox";
import styles from "@/styles/pages/Session.module.scss";
import Thinking from "./Thinking";

const StepPage0 = ({
  initiatePentestFunction,
  disabled,
  stepData,
  loading,
  status,
}) => {
  return (
    <>
      <div className={styles.intro}>
        Hey there! Pentest Copilot, your hacking sidekick, ready to assist on
        daring missions!{" "}
      </div>

      {loading || ["pending", "processing"].includes(status) ? (
        <Thinking type="command" stepData={stepData} />
      ) : (
        <MessageBox
          type="init"
          initiatePentestFunction={initiatePentestFunction}
          disabled={disabled}
          stepData={stepData}
          loading={loading}
        />
      )}
    </>
  );
};

export default StepPage0;
