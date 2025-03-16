import { Modal } from "antd";

const { confirm } = Modal;

export const confirmPopUp = (props) => {
  confirm({
    className: props.className,
    title: props.title,
    content: props.content,
    icon: props.icon,
    okText: props.okText,
    cancelText: props.cancelText,
    onOk() {
      props.onOk();
    },
    onCancel() {
      props.onCancel && props.onCancel();
    },
    okButtonProps: {
      style: {
        backgroundColor: props?.okButtonBg || "#cb444a",
        border: "none",
      },
    },
    cancelButtonProps: props?.cancelButtonProps || {
      style: {
        backgroundColor: props?.cancelButtonBg || "#e5e5e5",
        border: "none",
      },
    },
  });
};
