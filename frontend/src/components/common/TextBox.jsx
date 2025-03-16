import styles from "@/styles/components/Common.module.scss";

const TextBox = ({ title, description, alignment, className }) => {
  return (
    <div className={`${styles.textBoxContainer} ${className}`}>
      <h1 className={styles.title} style={{ textAlign: `${alignment}` }}>
        {title}
      </h1>
      <p className={styles.description} style={{ textAlign: `${alignment}` }}>
        {description}
      </p>
    </div>
  );
};

export default TextBox;
