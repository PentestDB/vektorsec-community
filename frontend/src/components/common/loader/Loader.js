import styles from "@/app/page.module.scss";
import { Spin } from "antd";

const Loader = () => {
  return (
    <div className={styles.container}>
      <h1>Loading</h1>
      <Spin size="large" />
    </div>
  );
};

export default Loader;
