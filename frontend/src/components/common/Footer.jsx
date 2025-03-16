import Image from "next/image";
// import copilotLogo from "/copilotlogo.svg";
import { MdOutlineMail } from "react-icons/md";
import styles from "@/styles/components/Footer.module.scss";
import { FaInstagram, FaLinkedin, FaYoutube } from "react-icons/fa";
import { Col, Form, Row } from "antd";
import {  MailFilled } from "@ant-design/icons";

const Footer = () => {
  const [form] = Form.useForm();
  const email = Form.useWatch("email", form);

  const socialLinks = [
    {
      icon: <FaInstagram />,
      link: "https://www.instagram.com/bugbase.ai/",
      label: "Instagram",
    },
    {
      icon: "𝕏",
      link: "https://twitter.com/BugBase",
      label: "Twitter",
    },
    {
      icon: <FaLinkedin />,
      link: "https://www.linkedin.com/company/bugbase/",
      label: "LinkedIn",
    },
    {
      icon: <FaYoutube />,
      link: "https://www.youtube.com/channel/UCn7PV48or37LZhYIaAdQUGw",
      label: "Youtube",
    },
    {
      icon: <MdOutlineMail />,
      link: "mailto:queries@bugbase.ai",
      label: "Email",
    },
  ];





  return (
    <div className={styles.footerContainer}>
      <div className={styles.footerContent}>
        <Row gutter={[48, 24]} justify="space-between">
          <Col lg={8} md={12} sm={24} xs={24}>
            <Image src={"/copilotlogo.svg"} alt="" height={50} width={120} />
            <p className={styles.footerText}>
              Pentest Copilot takes you through each step of the journey, making
              your life easier.
            </p>
            <p className={`${styles.footerText} ${styles.footerMailLink}`} style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}>
              <MailFilled />
              <a href="mailto:queries@bugbase.ai">
                queries@bugbase.ai
              </a>
            </p>

          </Col>
          <Col lg={15} md={12} sm={24} xs={24}>
            <Row gutter={[32, 32]} justify="start">
              <Col lg={5} md={12} sm={12} xs={12}>
                <h3 className={styles.footerHeading}>Quick Links</h3>
                <div className={styles.footerList}>
                  <a className={styles.footerLink} href="/login">
                    Login
                  </a>
                  <a className={styles.footerLink} href="/ai">
                    AI
                  </a>
                </div>
              </Col>
              <Col lg={5} md={12} sm={12} xs={12}>
                <h3 className={styles.footerHeading}>Resources</h3>
                <div className={styles.footerList}>
                  <a className={styles.footerLink} href="/terms">
                    Terms & Conditions
                  </a>

                  <a
                    className={styles.footerLink}
                    href="https://copilot-docs.bugbase.ai"
                  >
                    Documentation
                  </a>

                  <a
                    className={styles.footerLink}
                    href="https://discord.gg/bugbase"
                  >
                    Community
                  </a>
                </div>
              </Col>
              <Col lg={5} md={12} sm={12} xs={12}>
                <h3 className={styles.footerHeading}>Social</h3>
                <div className={styles.footerList}>
                  {socialLinks.map((socialLink, index) => (
                    <a
                      key={index}
                      className={styles.footerLink}
                      href={socialLink.link}
                      rel="noreferrer"
                      target={"_blank"}
                      aria-label={socialLink.label}
                    >
                      {socialLink.label}
                    </a>
                  ))}
                </div>
              </Col>
            </Row>
          </Col>
        </Row>
      </div>

      <div className={styles.footerBottom}>
        <p>BugBase Pte Ltd © 2024</p>
        <div className={styles.socialIcons}>
          <span
            style={{
              color: "#FFF",
            }}
          >
            Made with{" "}
            <span
              style={{
                color: "#FF0000",
              }}
            >
              ❤
            </span>{" "}
            by Team BugBase
          </span>
          <span
            style={{
              color: "#FFF",
            }}
          >
            {" | "}
          </span>
          {socialLinks.map((socialLink, index) => (
            <a
              key={index}
              className={styles.socialIconLink}
              href={socialLink.link}
              rel="noreferrer"
              aria-label={socialLink.label}
            >
              {socialLink.icon}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Footer;
