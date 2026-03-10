import { useEffect } from "react";

const BeforeUnloadWithPopup = () => {
  // const handleBeforeUnload = (e) => {
  //   e.preventDefault();
  //   e.returnValue = null; // Chrome requires this to work properly

  //   confirmPopUp({
  //     title: "Are you sure you want to leave?",
  //     content: "You have unsaved changes. Are you sure you want to leave?",
  //     okText: "Yes",
  //     cancelText: "No",
  //     onOk: handleConfirm,
  //     onCancel: () => {},
  //   });

  //   return undefined; // Cross-browser compatibility
  // };

  const handleBeforeUnload = (e) => {
    e.preventDefault();
    e.returnValue = null; // Chrome requires this to work properly

    e.returnValue = "Are you sure you want to leave?";
    return "Are you sure you want to leave?";
  };

  // const handleConfirm = () => {
  //   window.removeEventListener("beforeunload", handleBeforeUnload);
  //   window.location.reload(); // Or perform any other action you want on confirmation
  // };

  // Attach the event listener when the component mounts
  useEffect(() => {
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};

export default BeforeUnloadWithPopup;
