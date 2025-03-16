import { Modal } from "antd";
import styles from "@/styles/components/ModalComponent.module.scss";
import { AiFillCloseCircle } from "react-icons/ai";

const ModalComponent = ({
  //   backArrow,
  //   backArrowClick,
  heading,
  subheading,
  description,
  children,
  show,
  setShow,
  width,
  maxWidth,
  //   minWidth,
  destroyOnClose,
  keyboard,
  confirmLoading,
  onCancel,
  className,
  headerStyles,
  headingStyles,
  subheadingStyles,
  showClose = false,
  maskClosable,
  closeIcon,
  // ...props
}) => {
  const closeModal = () => {
    setShow(false);
  };

  return (
    <>
      <Modal
        keyboard={keyboard}
        className={`${styles.modalContainer} ${className ? className : ""}`}
        open={show}
        centered
        width={width ? width : 700}
        style={{
          maxWidth: maxWidth ? maxWidth : "900px",
        }}
        destroyOnClose={destroyOnClose}
        confirmLoading={confirmLoading}
        onCancel={onCancel ? onCancel : closeModal}
        maskClosable={maskClosable}
        closeIcon={closeIcon}
        // {...props}
      >
        <div className={styles.headingController}>
          <div className={styles.headingtextController} style={headerStyles}>
            {/* {backArrow && (
              <div
                onClick={backArrowClick}
                style={{
                  cursor: "pointer",
                  marginTop: "0.6rem",
                }}
              >
                <Image
                  src="/assets/images/dashboard/back-arrow.svg"
                  width={20}
                  height={20}
                  preview={false}
                  alt=""
                />
              </div>
            )} */}
            <div>
              <h1 style={headingStyles}>{heading}</h1>
              <h2 style={subheadingStyles}>{subheading}</h2>
            </div>
          </div>
          {!showClose && (
            <div>
              <AiFillCloseCircle
                style={{
                  color: "#424342",
                  fontSize: "2rem",
                  cursor: "pointer",
                }}
                onClick={onCancel ? onCancel : closeModal}
              />
            </div>
          )}
        </div>
        <p className={styles.headingController}>{description}</p>
        {children}
      </Modal>
    </>
  );
};

export default ModalComponent;
