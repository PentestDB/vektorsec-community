import styles from "@/styles/components/Navbar.module.scss";
import Image from "next/image";
import Link from "next/link";
import PrimaryButton from "./PrimaryButton";
import copilotLogo from "@/assets/copilot-logo-full.svg";
import { useEffect, useState } from "react";
import { CloseOutlined, MenuOutlined } from "@ant-design/icons";
import { AnimatePresence, motion } from "framer-motion";
import { Menu } from "antd";
import { usePathname, useRouter } from "next/navigation";
import CopilotLogo from "./CopilotLogo";

const Navbar = ({ nobg }) => {
  const [toggle, setToggle] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

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
        <span
          style={{
            color: "#fff",
            position: "relative",
            zIndex: 1,
            top: "-42px",
            left: ".8rem",
            border: "none",
            fontSize: "14px",
            fontWeight: "bold",
          }}
        >
          Public Beta
        </span>{" "}
      </a>

      <div className={styles.navItems}>
        {navItems.map((item, index) =>
          item.window ? (
            <span
              key={index}
              className={
                item.link === pathname ? styles.navItemSelected : styles.navItem
              }
              style={{ cursor: "pointer" }}
              onClick={() => window.open(item.link, "_blank")}
            >
              {item.name}
            </span>
          ) : (
            <Link
              href={item.link}
              key={index}
              className={
                item.link === pathname ? styles.navItemSelected : styles.navItem
              }
            >
              {item.name}
            </Link>
          )
        )}

        <div className={styles.login}>
          <PrimaryButton purpleFilled onClick={() => router.push("/login")}>
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
                    key: "2",
                    label: <Link href="/ai">AI</Link>,
                  },
                  {
                    key: "3",
                    label: (
                      <Link href="https://copilot-docs.bugbase.ai">Docs</Link>
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

const navItems = [
  {
    name: "AI",
    link: "/ai",
  },
  {
    name: "Docs",
    link: "https://copilot-docs.bugbase.ai",
    window: true,
  },

];
