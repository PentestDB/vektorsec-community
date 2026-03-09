import { App, Button, Col, Form, Input, Row } from "antd";

import styles from "@/styles/pages/Login.module.scss";
import { useRouter } from "next/navigation";
import session from "@/assets/onboarding/session-placeholder.svg";
import Image from "next/image";
import { useMutation, useQueryClient } from "react-query";
import { login } from "@/services/auth.service";
import CopilotLogo from "@/components/common/CopilotLogo";
import Link from "next/link";
import { loginUser } from "@/store/user.slice";
import { useDispatch } from "react-redux";

const LoginPage = () => {
  const router = useRouter();
  const dispatch = useDispatch();
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  const loginMutation = useMutation(login, {
    onError: (error) => {
      message.error(
        error?.response?.data?.message ??
          "Failed to login, please try again later!"
      );
    },
    onSuccess: async (data) => {
      message.success(data?.message ?? "Logged in successfully!");
      localStorage.removeItem("antiCSRF");
      dispatch(loginUser(data.user));
      await queryClient.invalidateQueries("check-session");
      router.push("/dashboard");
    },
  });

  const handleLogin = (values) => {
    loginMutation.mutate({
      email: values.email,
      password: values.password,
    });
  };


  return (
    <Row className={styles.loginContainer}>
      <Col xl={16} lg={12} md={12} xs={0} className={styles.leftContainer}>
        <div className={styles.loginBannerContainer}>
          <div className={styles.loginBannerText}>
            <h1>
              Unleash the Power of Pentesting with an{" "}
              <span>AI-Powered Copilot</span>
            </h1>

            <p>
              Simply provide an IP address, and watch Pentest Copilot transform
              into your sister pentester, utilising context throughout the
              engagement to give you directed results.
            </p>
          </div>

          <div className={styles.loginBanner}>
            <Image src={session} alt="session" />
          </div>
        </div>
      </Col>
      <Col xl={8} lg={12} md={12} xs={24} className={styles.rightContainer}>
        <div
          className={styles.navbar}
          style={{
            display: "flex",
          }}
        >
          <CopilotLogo plain />
        </div>
        <div className={styles.loginForm}>
          <h1>Welcome to BugBase Pentest Copilot!</h1>
          <p>Elevate your ethical hacking experience with AI</p>


          <Row style={{ flexDirection: "column" }}>
    
            <Form  className={styles.formContent}
            onFinish={handleLogin}>
            <Form.Item
                name="email"
                rules={[
                  {
                    required: true,
                    message: "Please enter your email",
                  },
                  {
                    type: "email",
                    message: "Invalid email",
                  },
                ]}
              >
                <Input placeholder="Enter your email" />
              </Form.Item>
              <Form.Item
                name="password"
                rules={[
                  {
                    required: true,
                    message: "Please enter your password",
                  },
                
                ]}
              >
                <Input.Password placeholder="Enter your password" />
              </Form.Item>
              <Form.Item>
              <Button
              htmlType="submit"
              className={styles.loginButtonBugbase}
              loading={loginMutation.isLoading}
            >
              Login
            </Button>
              </Form.Item>
            </Form>
         
            <Link
              className={styles.docLink}
              href="/register"
            >
              <div className={styles.linkText}>New here? Register</div>
            </Link>
          </Row>
        </div>
      </Col>
    </Row>
  );
};

export default LoginPage;
