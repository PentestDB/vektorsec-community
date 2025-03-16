import MessageBox from "@/components/common/messages/MessageBox";
import styles from "@/styles/components/Messages.module.scss";

const Thinking = ({ type, stepData }) => {
  return (
    <>
      {/* {summary && (
        <div className={styles.messagestep1Summary}>
          Current Summary : <span>{summary}</span>
        </div>
      )} */}
      <MessageBox type="thinking" thinkType={type} stepData={stepData} />
    </>
  );
};

export default Thinking;
