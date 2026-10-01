import { MdOutlineMail } from "react-icons/md";
import styles from "@/styles/components/Footer.module.scss";
import { FaInstagram, FaLinkedin, FaYoutube } from "react-icons/fa";
import { Col, Form, Row } from "antd";
import {  MailFilled } from "@ant-design/icons";
import CopilotLogo from "./CopilotLogo";
import { useTranslation } from "@/i18n/I18nProvider";

const Footer = () => {
  const [form] = Form.useForm();
  const email = Form.useWatch("email", form);
  const { t } = useTranslation();

  const socialLinks = [
    {
      icon: <FaInstagram />,
      link: "https://www.instagram.com/vektorsec.ai/",
      label: "Instagram",
    },
    {
      icon: "X",
      link: "https://twitter.com/VektorSec_ai",
      label: "Twitter",
    },
    {
      icon: <FaLinkedin />,
      link: "https://www.linkedin.com/company/vektorsec/",
      label: "LinkedIn",
    },
    {
      icon: <FaYoutube />,
      link: "https://www.youtube.com/@VektorSec",
      label: "Youtube",
    },
    {
      icon: <MdOutlineMail />,
      link: "mailto:hello@vektorsec.ai",
      label: "Email",
    },
  ];





  return (
    <div className={styles.footerContainer}>
      <div className={styles.footerContent}>
        <Row gutter={[48, 24]} justify="space-between">
          <Col lg={8} md={12} sm={24} xs={24}>
            <CopilotLogo />
            <p className={styles.footerText}>{t("footer.tagline")}</p>
            <p className={`${styles.footerText} ${styles.footerMailLink}`} style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}>
              <MailFilled />
              <a href="mailto:hello@vektorsec.ai">
                hello@vektorsec.ai
              </a>
            </p>

          </Col>
          <Col lg={15} md={12} sm={24} xs={24}>
            <Row gutter={[32, 32]} justify="start">
              <Col lg={5} md={12} sm={12} xs={12}>
                <h3 className={styles.footerHeading}>{t("footer.quickLinks")}</h3>
                <div className={styles.footerList}>
                  <a className={styles.footerLink} href="/login">
                    {t("footer.login")}
                  </a>
                </div>
              </Col>
              <Col lg={5} md={12} sm={12} xs={12}>
                <h3 className={styles.footerHeading}>{t("footer.resources")}</h3>
                <div className={styles.footerList}>
                  <a className={styles.footerLink} href="/terms">
                    {t("footer.terms")}
                  </a>

                  <span className={styles.footerLink}>
                    {t("footer.documentation")}
                  </span>

                  <a
                    className={styles.footerLink}
                    href="https://discord.gg/vektorsec"
                  >
                    {t("footer.community")}
                  </a>
                </div>
              </Col>
              <Col lg={5} md={12} sm={12} xs={12}>
                <h3 className={styles.footerHeading}>{t("footer.social")}</h3>
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
        <p>{t("footer.copyright")}</p>
        <div className={styles.socialIcons}>
          <span
            style={{
              color: "#FFF",
            }}
          >
            {t("footer.madeWith")}
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
