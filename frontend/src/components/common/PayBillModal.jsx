import ModalComponent from "./ModalComponent";
import styles from "@/styles/pages/Plans.module.scss";
import PrimaryButton from "./PrimaryButton";
import { useRouter } from "next/navigation";

const PayBillModal = ({ show, setShow, data }) => {
  const router = useRouter();
  const description = (
    <>
      You have exceeded the number of{" "}
      <span>
        {data?.type.includes("command-gen")
          ? "command generations "
          : "exploit box usage "}
      </span>
      allowed. To continue using pentest copilot please clear your invoice by
      clicking the button below.
    </>
  );

  const startCheckout = async () => {
    // @TODO: CLOSE THE MODAL ONLY AFTER PAYMENT COMPLETION
    router.push("/settings/billing");
  };

  return (
    <ModalComponent
      show={show}
      setShow={setShow}
      heading="Complete your Payment"
      subheading={description}
      onCancel={close}
      footer={false}
      destroyOnClose
      width={"80"}
      showClose={true}
    >
      <div className={styles.payBillContainer}>
        <PrimaryButton purpleFilled onClick={startCheckout}>
          Clear Invoice
        </PrimaryButton>
      </div>
    </ModalComponent>
  );
};

export default PayBillModal;
