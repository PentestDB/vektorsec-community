import { Col, Form, Input, Row, Select, message } from "antd";
import styles from "@/styles/pages/Login.module.scss";
import CopilotLogo from "@/components/common/CopilotLogo";
import PrimaryButton from "@/components/common/PrimaryButton";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "react-query";
import { saveUserInformation } from "@/services/user.service";
import cardSvg from "@/assets/onboarding/cards.svg";
import Image from "next/image";
import { AiOutlineDoubleLeft } from "react-icons/ai";
import { logoutUser } from "@/services/auth.service";
import { logout } from "@/store/user.slice";
import { useDispatch } from "react-redux";

const OnboardingPage = () => {
  const [form] = Form.useForm();
  const router = useRouter();
  const [onboard, setOnboard] = useState(false);
  const dispatch = useDispatch();
  const referral = localStorage.getItem("referral");

  useEffect(() => {
    if (referral) {
      form.setFieldsValue({ referralCode: referral });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referral]);

  const saveUserInfoMutation = useMutation(saveUserInformation, {
    onSuccess: () => {
      setOnboard(true);
      localStorage.removeItem("referral");
    },
    onError: (error) => {
      message.error(
        error?.response?.data?.message || "Failed to save your information!"
      );
    },
  });

  const onFormSubmit = async (values) => {
    await saveUserInfoMutation.mutateAsync(values);
  };

  const logoutMutation = useMutation(logoutUser, {
    onSuccess: (data) => {
      router.push("/");
      dispatch(logout());
      message.success(data?.message ?? "Logged out successfully!");
    },
    onError: (err) => {
      message.error(
        err?.response?.data?.message ?? "Failed to logout. Please try again."
      );
    },
  });

  return (
    <Row className={styles.onboardingContainer}>
      <Col xl={16} lg={16} md={16} xs={24} className={styles.leftContainer}>
        {!onboard ? (
          <div className={styles.formContent}>
            <div className={styles.header}>
              <div
                className={styles.exitSession}
                onClick={async () => {
                  await logoutMutation.mutateAsync();
                }}
              >
                <AiOutlineDoubleLeft />
                Logout
              </div>{" "}
              <div className={styles.title}>Tell us about yourself</div>
              <div className={styles.subtitle}>
                Please provide us with some quick information before we get
                started.
              </div>
            </div>
            <Form form={form} layout="vertical" onFinish={onFormSubmit}>
              <Form.Item
                name="industry"
                label={
                  <div className={styles.formLabel}>
                    <h3>Company&apos;s Industry of working</h3>
                    <p>
                      Understanding your industry helps us tailor our services
                      to better fit your needs.
                    </p>
                  </div>
                }
                rules={[
                  {
                    required: true,
                    message: "Please select your industry",
                  },
                ]}
              >
                <Select placeholder="Select your industry">
                  {industries.map((industry) => (
                    <Select.Option key={industry.value} value={industry.value}>
                      {industry.label}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                name="experience"
                label={
                  <div className={styles.formLabel}>
                    <h3>Experience in cybersecurity</h3>
                    <p>
                      Your cybersecurity experience will guide how we present
                      information to you.
                    </p>
                  </div>
                }
                rules={[
                  {
                    required: true,
                    message: "Please select your experience level",
                  },
                ]}
              >
                <Select placeholder="Level of experience">
                  {experienceLevels.map((level) => (
                    <Select.Option key={level.value} value={level.value}>
                      {level.label}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                name="discoveryMethod"
                label={
                  <div className={styles.formLabel}>
                    <h3>How did you get to know about us</h3>
                    <p>
                      This helps us understand where our users are coming from
                      and improve our outreach efforts.
                    </p>
                  </div>
                }
                rules={[
                  {
                    required: true,
                    message: "Please select your source of referral",
                  },
                ]}
              >
                <Select placeholder="Source of referral">
                  {discoveryMethods.map((method) => (
                    <Select.Option key={method.value} value={method.value}>
                      {method.label}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>

              <PrimaryButton
                purpleFilled
                htmlType="submit"
                loading={saveUserInfoMutation.isLoading}
                style={{ width: "100%", marginTop: "2.5rem" }}
              >
                CONFIRM
              </PrimaryButton>
            </Form>
          </div>
        ) : (
          <div className={styles.onboardSuccess}>
            <h1>Welcome Aboard! 🚀</h1>
            <p>
              You&apos;re all set and ready to roll. Dive into the world of
              pentesting with your very first Pentest Copilot workspace.
            </p>
            <PrimaryButton
              purpleFilled
              onClick={() => router.push("/dashboard?launch=true")}
            >
              LAUNCH MY WORKSPACE
            </PrimaryButton>
          </div>
        )}
      </Col>
      <Col xl={8} lg={8} md={8} xs={0} className={styles.rightContainer}>
        <CopilotLogo plain />
        <p className={styles.onboardingText}>
          Pentest Copilot harnesses the power of AI and Kali Linux to deliver
          the <span>ultimate futuristic hacking experience.</span>
        </p>
        <div className={styles.cardOverlay}>
          <Image draggable={false} src={cardSvg} alt="" fill />
        </div>
        <div className={styles.gradientOverlay} />
        <div className={styles.circuitOverlay} />
      </Col>
    </Row>
  );
};

export default OnboardingPage;

const industries = [
  { value: "finance", label: "Finance and Banking" },
  { value: "healthcare", label: "Healthcare and Medical" },
  { value: "technology", label: "Technology and Software" },
  { value: "government", label: "Government and Public Sector" },
  { value: "retail", label: "Retail and E-commerce" },
  { value: "energy", label: "Energy and Utilities" },
  { value: "education", label: "Education and Research" },
  { value: "manufacturing", label: "Manufacturing and Industrial" },
  { value: "media", label: "Media and Entertainment" },
  { value: "transportation", label: "Transportation and Logistics" },
];

const experienceLevels = [
  { value: "entry", label: "Entry-level (0-2 years)" },
  { value: "junior", label: "Junior (2-5 years)" },
  { value: "mid", label: "Mid-level (5-8 years)" },
  { value: "senior", label: "Senior (8+ years)" },
  { value: "expert", label: "Expert (10+ years)" },
  { value: "managerial", label: "Managerial" },
  { value: "executive", label: "Executive" },
  { value: "self-taught", label: "No formal experience, but self-taught" },
  { value: "transitioning", label: "Transitioning from a related IT field" },
  { value: "graduate", label: "Recent cybersecurity graduate" },
];

const discoveryMethods = [
  { value: "online-search", label: "Online search (Google, Bing, etc.)" },
  { value: "social-media", label: "Social media (LinkedIn, Twitter, etc.)" },
  { value: "referral", label: "Referral from a colleague or friend" },
  { value: "conference", label: "Attended a cybersecurity conference" },
  { value: "advertisement", label: "Advertisement on a tech website" },
  { value: "forum", label: "Mentioned in a cybersecurity forum or group" },
  { value: "newsletter", label: "Received an email newsletter" },
  { value: "blog", label: "Found in a cybersecurity blog or article" },
  {
    value: "training-program",
    label: "Recommended by a cybersecurity training program",
  },
  { value: "podcast", label: "Discovered through a podcast or webinar" },
];
