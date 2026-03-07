import styles from "@/styles/components/Common.module.scss";

const FeatureCard = ({ title, description, icon, active, onClick }) => {
  return (
    <div
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
