import styles from "@/styles/components/Navbar.module.scss";
import Image from "next/image";
import Link from "next/link";
import PrimaryButton from "./PrimaryButton";
import copilotLogo from "@/assets/copilot-logo-full.svg";
import { useEffect, useState } from "react";
import { CloseOutlined, MenuOutlined } from "@ant-design/icons";
import { FaGithub } from "react-icons/fa";
import { AnimatePresence, motion } from "framer-motion";
import { Menu } from "antd";
import { useRouter } from "next/navigation";
import CopilotLogo from "./CopilotLogo";

const Navbar = ({ nobg }) => {
  const [toggle, setToggle] = useState(false);
  const router = useRouter();

  const openSidebar = () => {
    setToggle(true);
  };

  const closeSidebar = () => {
    setToggle(false);
  };

  useEffect(() => {
    const changeWidth = () => {
      if (window.innerWidth >= 1207) {
        setToggle(false);
      }
    };
    changeWidth();
    window.addEventListener("resize", changeWidth);
  });

  return (
    <div
      className={`${styles.navbar} ${styles.navbarContainer} ${
        nobg ? styles.noNavbarbg : ""
      }`}
    >
      <a
        href="/"
        style={{
          color: "#fff",
          textDecoration: "none",
        }}
      >
        <CopilotLogo />
      </a>

      <div className={styles.navItems}>
        <a
          href="https://github.com/bugbasesecurity/pentest-copilot"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.navItem}
          style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}
          title="Star on GitHub"
        >
          <FaGithub size={18} />
          <span>GitHub</span>
        </a>
        <div className={styles.login}>
          <PrimaryButton onClick={() => router.push("/login")}>
            Sign In
          </PrimaryButton>
        </div>
      </div>

      <div className={styles.hamSec}>
        <MenuOutlined onClick={openSidebar} className={styles.ham} />
      </div>

      {/* sidebar */}
      <AnimatePresence>
        {toggle && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              display: toggle && screen ? "block" : "none",
            }}
            className={styles.sidebarContainer}
          >
            <div className={styles.closeSec}>
              <a href="/">
                <Image
                  src={copilotLogo}
                  alt="Copilot"
                  height={40}
                  width={120}
                />
              </a>
              <CloseOutlined onClick={closeSidebar} className={styles.close} />
            </div>

            <div className={styles.sidebarWrapper}>
              <Menu
                style={{ width: "100%" }}
                mode="inline"
                items={[
                  {
                    key: "4",
                    label: (
                      <a href="https://github.com/bugbasesecurity/pentest-copilot" target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, color: "inherit", textDecoration: "none" }}>
                        <FaGithub size={16} /> GitHub
                      </a>
                    ),
                  },
                  {
                    key: "5",
                    label: <Link href="/login">Sign In</Link>,
                    className: styles.loginBtn,
                  },
                ]}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Navbar;
