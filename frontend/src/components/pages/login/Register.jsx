import { App, Button, Checkbox, Col, Form, Input, Row } from "antd";

import styles from "@/styles/pages/Login.module.scss";
import { useRouter } from "next/navigation";
import session from "@/assets/onboarding/session-placeholder.svg";
import Image from "next/image";
import { useMutation } from "react-query";
import { register } from "@/services/auth.service";
import CopilotLogo from "@/components/common/CopilotLogo";

import Link from "next/link";

const RegisterPage = () => {
  const router = useRouter();
  const { message } = App.useApp();

  const registerMutation = useMutation(register, {
    onError: (error) => {
      message.error(
        error?.response?.data?.message ??
          "Failed to register. Please try again later."
      );
    },
    onSuccess: (data) => {
      message.success("Registration successful. Please login to continue.");
      router.push("/login");
    },
  });

  const handleRegister = (values) => {
    registerMutation.mutate({
      name: values.name,
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
          <h1>
            Sign up to <span>Pentest Copilot</span>
          </h1>
          <p>Elevate your ethical hacking experience with AI</p>


          <Row style={{ flexDirection: "column" }}>
            <Form className={styles.formContent} onFinish={handleRegister}>
              <Form.Item
                name="name"
                rules={[
                  {
                    required: true,
                    message: "Please enter your name",
                  },
                ]}
              >
                <Input placeholder="Enter your name" />
              </Form.Item>
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
              {/* <Form.Item
                name="terms"
                rules={[
                  {
                    required: true,
                    message: "Please accept the terms and conditions",
                  },
                ]}
              >
                <Checkbox value={true}>
                  <div className={styles.terms}>
                    I accept all the{" "}
                    <a target="_blank" href="/terms">
                      Terms & Conditions
                    </a>
                    .
                  </div>
                </Checkbox>
              </Form.Item> */}
              <Form.Item>
                <Button
                  className={styles.loginButtonBugbase}
                  htmlType="submit"
                  loading={registerMutation.isLoading}
                >
                  Register
                </Button>
              </Form.Item>
            </Form>


            <Link
              className={styles.docLink}
              href="/login"
            >
              <div className={styles.linkText}>Already a User? Login</div>
            </Link>
          </Row>
        </div>
      </Col>
    </Row>
  );
};

export default RegisterPage;
