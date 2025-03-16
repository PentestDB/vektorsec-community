import MessageBox from "@/components/common/messages/MessageBox";
import styles from "@/styles/pages/Session.module.scss";
import Thinking from "./Thinking";

const StepPage0 = ({
  initiatePentestFunction,
  disabled,
  stepData,
  loading,
}) => {
  return (
    <>
      <div className={styles.intro}>
        Hey there! Pentest Copilot, your hacking sidekick, ready to assist on
        daring missions!{" "}
      </div>

      <MessageBox
        type="init"
        initiatePentestFunction={initiatePentestFunction}
        disabled={disabled}
        stepData={stepData}
        loading={loading}
      />
    </>
  );
};

export default StepPage0;
