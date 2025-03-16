import styles from "@/styles/components/Messages.module.scss";

export const InfoMessage = ({ children, style }) => {
  return (
    <p className={styles.infoMessage} style={style}>
      {children}
    </p>
  );
};

export const SummaryMessage = ({ children }) => {
  return <p className={styles.infoMessage}>Current Summary: {children}</p>;
};
