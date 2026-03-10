import styles from "./Loader.module.scss";

const Loader = ({ message = "Loading", subtext }) => {
  return (
    <div className={styles.wrapper}>
      <div className={styles.dots}>
        <span className={styles.dot} aria-hidden />
        <span className={styles.dot} aria-hidden />
        <span className={styles.dot} aria-hidden />
      </div>
      <p className={styles.message}>{message}</p>
      {subtext && <span className={styles.subtext}>{subtext}</span>}
    </div>
  );
};

export default Loader;
