import styles from "@/styles/pages/AI.module.scss";
import Image from "next/image";
import bottomArrow from "@/assets/bottom-arrow.svg";
import Navbar from "../common/Navbar";
import aiImage1 from "@/assets/landing/ai1.svg";
import aiImage2 from "@/assets/landing/ai2.svg";
import aiImage3 from "@/assets/landing/ai3.svg";
import aiImage4 from "@/assets/landing/ai4.svg";
import aiImage5 from "@/assets/landing/ai5.svg";
import purpleBridge from "@/assets/landing/purple-bridge.svg";
import pinkBridge from "@/assets/landing/red-bridge.svg";
import purpleOutline from "@/assets/landing/purple-outline.svg";
import Footer from "../common/Footer";
import { Col, Row } from "antd";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import TextBox from "../common/TextBox";

const AIPage = () => {
  const getConnector = (index) => {
    if (index === aiWork.length - 1) {
      return <></>;
    } else if (index % 2 === 0) {
      return (
        <div className={styles.connector}>
          <Image src={purpleBridge} width={350} height={260} alt="connector" />
        </div>
      );
    } else {
      return (
        <div className={styles.connectorReverse}>
          <Image src={pinkBridge} width={350} height={260} alt="connector" />
        </div>
      );
    }
  };

  return (
    <div className={styles.aiContainer}>
      <Navbar />

      <div className={styles.heroSection}>
        <div className={styles.leftCircle1} />

        <h1 className={styles.title}> AI Behind the Copilot</h1>
        <p className={styles.description}>
          Learn more about the AI that powers Pentest Copilot
        </p>

        <a href="#ai-work" rel="noopener noreferrer">
          <Image src={bottomArrow} alt="scroll-down" className={styles.arrow} />
        </a>
      </div>

      <div className={styles.aiWorkContainer} id="ai-work">
        <div className={styles.leftCircle2} />
        {aiWork.map((item, index) => (
          <>
            <Row
              className={
                item.align === "left"
                  ? styles.section
                  : `${styles.section} ${styles.sectionReverse}`
              }
              key={index}
            >
              <Col lg={4} md={6} sm={8} xs={10} className={styles.icon}>
                <Image
                  src={purpleOutline}
                  className={styles.purpleCircle}
                  alt="border"
                />
                <div className={styles.whiteCircle}>
                  <Image src={item.icon} width={80} height={80} alt="ai-work" />
                </div>
              </Col>
              <Col
                lg={12}
                md={16}
                sm={16}
                xs={16}
                className={
                  item.align === "left"
                    ? styles.text
                    : `${styles.text} ${styles.textReverse}`
                }
              >
                {item.align === "left" ? (
                  <RightOutlined className={styles.arrowRight} />
                ) : (
                  <LeftOutlined className={styles.arrowLeft} />
                )}
                <TextBox
                  className={styles.feature}
                  title={item.title}
                  description={item.description}
                  alignment={item.align}
                />
              </Col>
            </Row>
            {getConnector(index)}
          </>
        ))}

        <div className={styles.leftCircle3} />

        <div className={styles.leftCircle4} />
      </div>

      <Footer />
    </div>
  );
};

export default AIPage;

const aiWork = [
  {
    title: "Retrieval Augmented LLM :",
    description:
      "Our AI model is finely-tuned for security tasks based on global data, offering unparalleled assistance in your pentesting engagements.",
    align: "left",
    icon: aiImage1,
  },
  {
    title: "Constrained Programming for Optimal Structure :",
    description:
      "Pentest Copilot's AI combines GPT with constrained programming for seamless JSON integration, enhancing efficiency and accuracy.",
    align: "right",
    icon: aiImage2,
  },
  {
    title: "The Journey to Red Team Automation :",
    description:
      "Pentest Copilot is continuously evolving. Additional data points will be integrated to transform it into a complete Red Team Automation solution, further enhancing your capabilities.",
    align: "left",
    icon: aiImage3,
  },
  {
    title: "Real-Time Command Validation :",
    description:
      "Pentest Copilot utilizes a low latency model for validity checking, enabling quick and reliable responses to negative prompts and commands.",
    align: "right",
    icon: aiImage4,
  },
  {
    title: "Human Interaction for Guidance :",
    description:
      "While Pentest Copilot excels at autonomous operation, it recognizes that human expertise is sometimes required to guide it in the right direction. It's the perfect blend of AI and human collaboration.",
    align: "left",
    icon: aiImage5,
  },
];
