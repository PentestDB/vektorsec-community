import { Button } from "antd";
import styles from "src/styles/components/Common.module.scss";

const PrimaryButton = ({ className, children, ...props }) => {
  const buttonClassNames = `
        ${styles.submitButton} 
    ${props.danger ? styles.dangerButton : ""}
    ${props.purple ? styles.purpleButton : ""}
    ${props.green ? styles.greenButton : ""}
    ${props.yellow ? styles.yellowButton : ""}
    ${props.orange ? styles.orangeButton : ""}
    ${props.limegreen ? styles.limegreenButton : ""}
    ${props.white ? styles.whiteButton : ""}
    ${props.disabled ? styles.disabledButton : ""}
    ${props.purpleFilled ? styles.purpleFilledButton : ""}
    ${props.pinkFilled ? styles.pinkFilledButton : ""}
    ${className}
    `.trim();

  return (
    <Button
      className={buttonClassNames}
      loading={props.loading}
      style={props.style}
      onClick={props.onClick}
      icon={props.icon}
      disabled={props.disabled}
      htmlType={props.htmlType}
    >
      {children}
    </Button>
  );
};

export default PrimaryButton;
