import { Checkbox, Form, Input, Row, message, notification } from "antd";
import ModalComponent from "../ModalComponent";
import PrimaryButton from "../PrimaryButton";
import { useMutation, useQueryClient } from "react-query";
import { actionOnResponse, undoPreviousStep, agenticContinue } from "@/services/session.service";
import { useDispatch, useSelector } from "react-redux";
import { updateSessions } from "@/store/user.slice";
import { RedoOutlined, UndoOutlined } from "@ant-design/icons";
import { useState } from "react";

const FeedbackModal = ({ close, type, sessionId, stepId }) => {
  const queryClient = useQueryClient();
  const submitFeedbackMutation = useMutation(actionOnResponse, {
    onSuccess: async () => {
      message.success("Thank you for your valuable feedback!");

      close();
      await queryClient.invalidateQueries([
        "get-session-loop-history",
        sessionId,
      ]);
    },
  });

  const handleFeedback = async (values) => {
    await submitFeedbackMutation.mutateAsync({
      sessionId,
      stepId,
      feedback: values.feedback,
      action: type === "like" ? "like" : "dislike",
    });
  };

  return (
    <ModalComponent
      show={type}
      heading="Give us feedback"
      subheading={
        type === "like"
          ? "What did you like about this response? Please let us know!"
          : "What did you dislike about this response? How can we improve?"
      }
      onCancel={close}
      footer={false}
      destroyOnClose
      width={"80%"}
    >
      <Form onFinish={handleFeedback}>
        <Form.Item
          name={"feedback"}
          rules={[
            {
              required: true,
              message: "Please enter your feedback",
            },
          ]}
        >
          <Input.TextArea
            placeholder="Please enter your feedback here and be as detailed as possible"
            rows={4}
          />
        </Form.Item>

        <Row justify={"end"}>
          <PrimaryButton
            purple
            htmlType="submit"
            loading={submitFeedbackMutation.isLoading}
          >
            Submit
          </PrimaryButton>
        </Row>
      </Form>
    </ModalComponent>
  );
};

export const RedoModal = ({ close, sessionId, pathSessionId }) => {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();

  const { sessions } = useSelector((state) => state.user);

  const [type, setType] = useState("undo");

  const agenticContinueMutation = useMutation(agenticContinue, {
    onSuccess: async () => {
      await queryClient.invalidateQueries(["get-session-data", sessionId]);
      await queryClient.invalidateQueries(["get-session-loop-history", sessionId]);
    },
  });

  const undoPreviousStepMutation = useMutation(undoPreviousStep, {
    onSuccess: async (data) => {
      notification.success({
        message: data?.message ?? "Moved to previous step",
        description: "Auto-resuming from the previous step...",
      });

      await queryClient.invalidateQueries(["get-session-data", sessionId]);
      await queryClient.invalidateQueries([
        "get-session-loop-history",
        sessionId,
      ]);

      const currentSession = sessions.find(
        (session) => session.id === pathSessionId
      );

      if (currentSession?.type === "session" && currentSession?.is_main) {
        const currentSessions = sessions.filter((session) => {
          if (session.type === "session" && !session.is_main) {
            return data.subprocesses.includes(session._id);
          }

          return true;
        });

        dispatch(updateSessions(currentSessions));
      }

      close();
      agenticContinueMutation.mutate({ sessionId });
    },
    onError: (error) => {
      console.log(error);
      notification.error({
        message: "Error",
        description: error?.response?.data?.message,
      });
    },
  });

  const redoSubmit = async (values) => {
    await undoPreviousStepMutation.mutateAsync({
      sessionId,
      redoContext: values.redoContext,
    });
  };

  return (
    <ModalComponent
      show={true}
      heading={
        <div>
          {type === "undo" ? (
            <>
              {" "}
              <UndoOutlined
                style={{
                  fontSize: 24,
                }}
              />{" "}
              Undo this step
            </>
          ) : (
            <>
              {" "}
              <RedoOutlined
                style={{
                  fontSize: 24,
                }}
              />{" "}
              Redo this step
            </>
          )}
        </div>
      }
      subheading={
        type === "undo"
          ? "You can revert back to the previous step to regenerate your response."
          : "You can also provide context for why you want to redo this step. This will help in improving your next response."
      }
      onCancel={close}
      footer={false}
      destroyOnClose
      width={"80%"}
    >
      <Form onFinish={redoSubmit}>
        <Form.Item>
          <Checkbox
            style={{
              color: "#fff",
            }}
            onChange={(e) => setType(e.target.checked ? "redo" : "undo")}
          >
            Provide Additional Context and Undo this step
          </Checkbox>
        </Form.Item>

        {type === "redo" && (
          <Form.Item
            name={"redoContext"}
            rules={[
              {
                required: true,
                message: "Please provide context for redoing this step",
              },
            ]}
          >
            <Input.TextArea
              placeholder="The previous command did not work because <reason> instead try <suggestion>"
              autoSize={{ minRows: 4, maxRows: 8 }}
            />
          </Form.Item>
        )}

        <Row justify={"end"}>
          <PrimaryButton
            yellow
            htmlType="submit"
            loading={undoPreviousStepMutation.isLoading}
          >
            Submit
          </PrimaryButton>
        </Row>
      </Form>
    </ModalComponent>
  );
};
export default FeedbackModal;
