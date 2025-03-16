import styles from "@/styles/components/Common.module.scss";

const FeatureCard = ({ title, description, icon, key, active, onClick }) => {
  return (
    <div
      key={key}
      onClick={onClick}
      className={
        active ? styles.featureCardContainerActive : styles.featureCardContainer
      }
    >
      <div className={styles.featureCardTitle}>
        {icon}
        {title}
      </div>
      <div className={styles.featureCardDescription}>{description}</div>
    </div>
  );
};

export default FeatureCard;
