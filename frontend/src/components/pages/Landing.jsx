"use client";

import styles from "@/styles/pages/Landing.module.scss";
import { AiFillSecurityScan, AiOutlineCloudServer } from "react-icons/ai";
import Image from "next/image";
import copilotFeaturesImg from "@/assets/ethical-hacking.svg";
import bottomArrow from "@/assets/bottom-arrow.svg";
import { SiOpenai, SiHackaday } from "react-icons/si";
import { RiBugFill } from "react-icons/ri";
import { BsIncognito } from "react-icons/bs";
import { ImCloudCheck } from "react-icons/im";
import Navbar from "../common/Navbar";
import PrimaryButton from "../common/PrimaryButton";
import Footer from "../common/Footer";
import TextBox from "../common/TextBox";
import { Col, Row } from "antd";
import { TbPlugConnected } from "react-icons/tb";
import FeatureCard from "../common/FeatureCard";
import { useEffect, useState } from "react";
import Carousel from "../common/Carousel";
import {
  ClusterOutlined,
  DeleteRowOutlined,
  DeploymentUnitOutlined,
} from "@ant-design/icons";

import image1 from "@/assets/landing/image1.svg";
import image2 from "@/assets/landing/image2.svg";
import image3 from "@/assets/landing/image3.svg";
import image4 from "@/assets/landing/image4.svg";
import image5 from "@/assets/landing/image5.svg";

import feature1 from "@/assets/landing/feature1.svg";
import feature2 from "@/assets/landing/feature2.svg";
import feature3 from "@/assets/landing/feature3.svg";
import feature4 from "@/assets/landing/feature4.svg";
import feature5 from "@/assets/landing/feature5.svg";

import icon1 from "@/assets/landing/icon1.svg";
import icon2 from "@/assets/landing/icon2.svg";
import icon3 from "@/assets/landing/icon3.svg";
import icon4 from "@/assets/landing/icon4.svg";
import icon5 from "@/assets/landing/icon5.svg";

import line1 from "@/assets/landing/line1.svg";
import line3 from "@/assets/landing/line3.svg";
import line2 from "@/assets/landing/line2.svg";
import line4 from "@/assets/landing/line4.svg";
import line5 from "@/assets/landing/line5.svg";

import Slider from "../common/Slider";
import LandingSVG from "@/utils/landingSVG";
import { useRouter } from "next/navigation";
import { FiArrowRight } from "react-icons/fi";

const LandingPage = () => {
  const [activeSlide, setActiveSlide] = useState(0);
  const [activeFeature, setActiveFeature] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hovered, setHovered] = useState(false);

  const router = useRouter();

  const slideshowImages = [image1, image2, image3, image4, image5];

  useEffect(() => {
    const interval = setInterval(() => {
      if (activeIndex === futureItems.length - 1) {
        setActiveIndex(0);
      } else {
        setActiveIndex((prevIndex) => prevIndex + 1);
      }
    }, 2000);

    if (hovered) {
      clearInterval(interval);
    }

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, hovered]);

  return (
    <>
      <div className={styles.wholeWrap}>
        <div className={styles.fadeInTop} />

        <Navbar />
        <div className={styles.contentWrapper}>
          <div className={styles.container}>
            <div className={styles.fadeforeground} />

            <div className={styles.orbitContainer}>
              <div className={styles.fadeBottom} />
              <div className={`${styles.orbit} ${styles.orbit1}`}></div>
              <div className={`${styles.orbit} ${styles.orbit2}`}>
                <div className={`${styles.planet} ${styles.planet4}`}>
                  <div className={styles.planetRing}>
                    <SiOpenai className={styles.planetIcon} />
                  </div>
                </div>
                <div className={`${styles.planet} ${styles.planet1}`}>
                  <div className={styles.planetRing}>
                    <AiFillSecurityScan className={styles.planetIcon} />
                  </div>
                </div>
              </div>
              <div className={`${styles.orbit} ${styles.orbit3}`}>
                <div className={`${styles.planet} ${styles.planet2}`}>
                  <div className={styles.planetRing}>
                    <SiHackaday className={styles.planetIcon} />
                  </div>
                </div>
                <div className={`${styles.planet} ${styles.planet3}`}>
                  <div className={styles.planetRing}>
                    <RiBugFill className={styles.planetIcon} />
                  </div>
                </div>
              </div>
              <div className={`${styles.orbit} ${styles.orbit4}`}>
                <div className={`${styles.planet} ${styles.planet6}`}>
                  <div className={styles.planetRing}>
                    <BsIncognito className={styles.planetIcon} />
                  </div>
                </div>
              </div>

              <div className={`${styles.orbit} ${styles.orbit5}`}>
                <div className={`${styles.planet} ${styles.planet5}`}>
                  <div className={styles.planetRing}>
                    <ImCloudCheck className={styles.planetIcon} />
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.copilotFeatureInit} id="hacker-love">
              <div className={styles.titleSection}>
                <h1>Everything Hackers</h1>
                <h1>Love</h1>
                <p>
                  Pentest Copilot takes you through each step of the journey,
                  making your life easier.
                </p>
              </div>
            </div>

            <div className={styles.mainContainer}>
              <div className={styles.wrapper}>
                <p className={styles.tagline}>BugBase Presents</p>
                <h1>Pentest Copilot</h1>
                <p>
                  Your ultimate ethical hacking assistant, copilot utilizes
                  context to give directed results. From analysing web apps to
                  root shells, it&apos;s got you covered.
                </p>
                <p className={styles.cc}>no credit card required</p>
                <div className={styles.viewOptions}>
                  {/* <PrimaryButton
                    pinkFilled
                    className={styles.ctaBtn}
                    onClick={() => router.push(`/login`)}
                  >
                    Get Started
                  </PrimaryButton> */}
                  <PrimaryButton
                    purpleFilled
                    style={{
                      borderRadius: "4rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      fontWeight: "bold",
                      transform: "scale(1.2)",
                    }}
                    onClick={() => router.push(`/login`)}
                  >
                    Try Copilot For Free <FiArrowRight />
                  </PrimaryButton>
                </div>

                <a
                  style={{
                    marginTop: "1.4rem",
                  }}
                  href="https://www.producthunt.com/posts/pentest-copilot-by-bugbase?utm_source=badge-top-post-badge&utm_medium=badge&utm_souce=badge-pentest&#0045;copilot&#0045;by&#0045;bugbase"
                  target="_blank"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://api.producthunt.com/widgets/embed-image/v1/top-post-badge.svg?post_id=404977&theme=light&period=daily"
                    alt="Pentest&#0032;Copilot&#0032;by&#0032;BugBase - Your&#0032;ultimate&#0032;AI&#0045;powered&#0032;ethical&#0032;hacking&#0032;assistant | Product Hunt"
                    style={{
                      width: "250px",
                      height: "54px",
                    }}
                    width="250"
                    height="54"
                  />
                </a>

                {/* <a
                  style={{
                    marginTop: "1.4rem",
                  }}
                  href="https://www.producthunt.com/posts/pentest-copilot-by-bugbase?utm_source=badge-featured&utm_medium=badge&utm_souce=badge-pentest&#0045;copilot&#0045;by&#0045;bugbase"
                  target="_blank"
                >
                  <img
                    src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=404977&theme=light"
                    alt="Pentest&#0032;Copilot&#0032;by&#0032;BugBase - Your&#0032;ultimate&#0032;ethical&#0032;hacking&#0032;assistant | Product Hunt"
                    style={{
                      width: "250px",
                      height: "54px",
                    }}
                    width="250"
                    height="54"
                  />
                </a> */}

                {/* <a href="#hacker-love" rel="noopener noreferrer">
                  <Image
                    src={bottomArrow}
                    alt="scroll-down"
                    className={styles.arrow}
                  />
                </a> */}
              </div>
            </div>
          </div>
          <div className={styles.copilotProcesses}>
            <div className={styles.sectionLeft}>
              <TextBox
                title={"Updated Tools"}
                description={
                  "Pentest Copilot is equipped with the latest 2023 ExploitDB lookups and utilises the MITRE framework."
                }
                alignment="right"
                className={styles.featureBox}
              />
              <TextBox
                title={"Intuitive Thinking"}
                description={
                  "Pentest Copilot eliminates redundant research and the need to constantly refer to the internet and documentation."
                }
                alignment="right"
                className={styles.featureBox}
              />
            </div>

            <Image
              src={copilotFeaturesImg}
              alt="copilot-features"
              width={500}
              height={500}
              draggable={false}
              className={styles.copilotFeaturesImg}
            />

            <div className={styles.sectionRight}>
              <TextBox
                title={"No More Rabbit Holes"}
                description={
                  "Thanks to intelligent contextual analysis, Pentest Copilot helps you avoid wasted time by steering clear."
                }
                alignment="left"
                className={styles.featureBox}
              />
              <TextBox
                title={"Payload Generation"}
                description={
                  "Say goodbye to manual payload generation. Pentest Copilot automatically generates staged."
                }
                alignment="left"
                className={styles.featureBox}
              />
            </div>
            <TextBox
              title={"Formatted Command Generation"}
              description={
                "No more struggling with complex command syntax. Pentest Copilot automatically generates."
              }
              alignment="center"
              className={styles.absoluteBox}
            />
          </div>

          <div className={styles.copilotProcessMobile}>
            <Row gutter={[32, 32]} justify="center" align="middle">
              {copilotProcess.map((item, index) => (
                <Col md={12} className={styles.featureBox} key={index}>
                  <div className={styles.featureIcon}>
                    <Image src={item.icon} alt="" width={40} height={40} />
                  </div>
                  <div className={styles.featureContent}>
                    <h1>{item.title}</h1>
                    <p>{item.description}</p>
                  </div>
                </Col>
              ))}
            </Row>
          </div>

          <div
            className={styles.gradientBox}
            style={{ paddingBottom: "2rem", alignItems: "flex-start" }}
          >
            <div className={styles.line} />
            <div className={styles.longLine} />
            <div className={styles.line} />
            <div className={styles.longLine} />
          </div>

          <div className={styles.copilotSteps}>
            <div className={styles.titleSection}>
              <h1>Future of Ethical Hacking</h1>
            </div>

            <div className={styles.copilotFeatureSlider}>
              <Slider
                autoplay
                activeSlide={activeSlide}
                setActiveSlide={setActiveSlide}
                slides={futureItems.map((item, index) => (
                  <div className={styles.featureSlide} key={index}>
                    <div className={styles.slideImage}>
                      <Image src={item.image} alt="" />
                    </div>
                    <div className={styles.slideContent}>
                      <span className={styles.slideNum}>0{index + 1}</span>
                      <h1>{item.title}</h1>
                      <p>{item.description}</p>
                    </div>
                  </div>
                ))}
              />
            </div>

            <div className={styles.stepsSection}>
              {futureItems.map((item, index) => {
                return (
                  <div
                    className={`imageOpacity box${index + 1}  ${styles.step} ${
                      index === activeIndex && `activeImage`
                    } `}
                    key={index}
                    onMouseEnter={() => {
                      setActiveIndex(index);
                      setHovered(true);
                    }}
                    onMouseLeave={() => setHovered(false)}
                  >
                    <div className={styles.stepNumber}>0{index + 1}</div>
                    <TextBox
                      title={item.title}
                      description={item.description}
                      alignment={item.alignment}
                      className={styles.stepTextBox}
                    />
                  </div>
                );
              })}
            </div>

            <Image
              src={line1}
              alt=""
              width={100}
              height={900}
              className={"line1"}
            />

            <Image
              src={line2}
              alt=""
              width={100}
              height={140}
              className={"line2"}
            />

            <Image
              src={line3}
              alt=""
              width={100}
              height={370}
              className={"line3"}
            />

            <Image
              src={line4}
              alt=""
              width={100}
              height={140}
              className={"line4"}
            />

            <Image
              src={line5}
              alt=""
              width={100}
              height={440}
              className={"line5"}
            />

            <div className={styles.processSection}>
              <LandingSVG
                className={`${styles.process} imageOpacity`}
                activeIndex={activeIndex}
                setActiveIndex={setActiveIndex}
                setHovered={setHovered}
              />
            </div>
          </div>
          {/* 
          <div
            className={styles.gradientBox}
            style={{ paddingBottom: "2rem", alignItems: "flex-start" }}
          >
            <div className={styles.longLine} />
            <div className={styles.line} />
            <div className={styles.longLine} />
            <div className={styles.line} />
          </div> */}

          <div className={styles.copilotFeatures}>
            <div className={styles.titleSection}>
              <h1>Ultimate Hacker Experience</h1>
              <p>
                These are features that make pentest copilot more accessible to
                people, ease of use, better experience etc.
              </p>
            </div>
            <Row
              align="middle"
              justify="space-between"
              className={styles.carouselCards}
            >
              <Col xs={24} sm={24} md={24} lg={11}>
                {copilotFeatures.map((item, index) => (
                  <FeatureCard
                    key={index}
                    icon={item.icon}
                    title={item.title}
                    description={item.description}
                    active={index === activeFeature}
                    onClick={() => setActiveFeature(index)}
                  />
                ))}
              </Col>
              <Col
                xs={24}
                sm={24}
                md={24}
                lg={12}
                className={styles.carouselImage}
              >
                <Carousel
                  images={slideshowImages}
                  activeIndex={activeFeature ?? 0}
                  setActiveIndex={setActiveFeature}
                />
              </Col>
            </Row>
          </div>

          <div
            className={styles.gradientBoxBottom}
            style={{ alignItems: "flex-end", margin: 0 }}
          >
            <div className={styles.line} />
            <div className={styles.longLine} />
            <div className={styles.longLine} />
            <div className={styles.line} />
          </div>

          {/* footer section */}
          <Footer />
        </div>

        <div className={styles.purpleBlurCircle1} />
        <div className={styles.purpleBlurCircle2} />
        <div className={styles.purpleBlurCircle3} />
        <div className={styles.purpleBlurCircle4} />
        <div className={styles.purpleBlurCircle5} />
        <div className={styles.purpleBlurCircle6} />
        <div className={styles.purpleBlurCircle7} />
        <div className={styles.purpleBlurCircle8} />
      </div>
    </>
  );
};

export default LandingPage;

const copilotFeatures = [
  {
    icon: <TbPlugConnected size={"2em"} />,
    title: "Secure VPN Integration",
    description:
      "Seamlessly connect Pentest Copilot to your remote server by providing your VPN file. Copilot runs commands on the isolated sandbox domain, ensuring secure and precise execution of your tests.",
  },

  {
    icon: <DeploymentUnitOutlined style={{ fontSize: "2rem" }} />,
    title: "Total Control at Your Fingertips",
    description:
      "Pause and resume your sessions on-demand. Pentest Copilot respects your flexibility and adapts to your schedule.",
  },
  {
    icon: <ClusterOutlined style={{ fontSize: "2rem" }} />,
    title: "Parallel Command Processing",
    description:
      "When multiple tasks need to be performed simultaneously, Pentest Copilot spawns multiple sub-process instances, ensuring tasks like GoBuster and Nikto run in parallel. Say goodbye to waiting.",
  },
  {
    icon: <AiOutlineCloudServer size={"2em"} />,
    title: "Local or Cloud, the Choice is Yours",
    description:
      "Whether you prefer running commands on your own system or utilizing the managed sandbox cloud environment, Pentest Copilot offers the flexibility you need.",
  },
  {
    icon: <DeleteRowOutlined style={{ fontSize: "2rem" }} />,
    title: "Kali Linux Not Required",
    description:
      "Pentest Copilot frees you from the hassle of installing Kali Linux. You can get started right away, no matter your preferred operating system.",
  },
];

const futureItems = [
  {
    title: "Starting with Recon",
    description:
      "It performs enumeration, scans targets, reads nmap output, and creates an exploit plan. It then leverages powerful tools like nikto, gobuster, and wfuzz to gather essential information.",
    alignment: "left",
    image: feature1,
  },
  {
    title: "Foothold",
    description:
      "Gain access effortlessly as Pentest Copilot automatically identifies the exploit, suggests and creates the payload, and executes it, catching a reverse shell. It's like having a skilled hacker by your side.",
    alignment: "left",
    image: feature2,
  },
  {
    title: "Privilege Escalation and Lateral Movement",
    description:
      "Once a shell is obtained, Pentest Copilot goes further, running scripts to identify points of privilege escalation and enabling lateral movement. You'll uncover hidden vulnerabilities and maximise your impact.",
    alignment: "left",
    image: feature3,
  },
  {
    title: "Uncover Hidden Treasures",
    description:
      "Pentest Copilot excels at data extraction, helping you locate critical files and extract them, empowering you to unveil sensitive information.",
    alignment: "left",
    image: feature4,
  },
  {
    title: "Leave No Trace Behind",
    description:
      "When your pentest is complete, Pentest Copilot doesn't stop. It suggests ways to persist on the machine and cleans up any tracks you may have left behind. You'll be an invisible force, leaving no trace of your presence.",
    alignment: "right",
    image: feature5,
  },
];

const copilotProcess = [
  {
    title: "Updated Tools",
    description:
      "Pentest Copilot is equipped with the latest 2023 ExploitDB lookups and utilises the MITRE framework.",
    icon: icon1,
  },
  {
    title: "Intuitive Thinking",
    description:
      "Pentest Copilot eliminates redundant research and the need to constantly refer to the internet and documentation.",
    icon: icon2,
  },
  {
    title: "No More Rabbit Holes",
    description:
      "Thanks to intelligent contextual analysis, Pentest Copilot helps you avoid wasted time by steering clear.",
    icon: icon3,
  },
  {
    title: "Formatted Command Generation",
    description:
      "No more struggling with complex command syntax. Pentest Copilot automatically generates.",
    icon: icon4,
  },
  {
    title: "Payload Generation",
    description:
      "Say goodbye to manual payload generation. Pentest Copilot automatically generates staged.",
    icon: icon5,
  },
];
