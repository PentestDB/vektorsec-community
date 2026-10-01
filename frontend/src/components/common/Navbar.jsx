import styles from "@/styles/components/Navbar.module.scss";
import Link from "next/link";
import PrimaryButton from "./PrimaryButton";
import { useEffect, useState } from "react";
import { CloseOutlined, MenuOutlined } from "@ant-design/icons";
import { AnimatePresence, motion } from "framer-motion";
import { Menu } from "antd";
import { useRouter } from "next/navigation";
import CopilotLogo from "./CopilotLogo";
import { checkSession, logoutUser } from "@/services/auth.service";
import { getMenuItems } from "@/services/menu.service";
import { useTranslation } from "@/i18n/I18nProvider";
import LanguageSwitcher from "@/i18n/LanguageSwitcher";

// Default navigation links — shown until the database menus load, and used as
// a fallback if the menu API is unreachable. The same list is seeded into the
// DB on first run so admins can manage these from the Admin Panel.
// `labelKey` (i18n) is used for these built-in labels; admin-created menus ship
// their own plain-text label so both shapes are handled at render time.
const DEFAULT_MENUS = [
  { labelKey: "nav.home", url: "/", order: 0 },
  { labelKey: "nav.pricing", url: "/pricing", order: 1 },
  { labelKey: "nav.topUp", url: "/topup", order: 2 },
  { labelKey: "nav.docs", url: "/docs", order: 3 },
  {
    labelKey: "nav.github",
    url: "https://github.com/PentestDB",
    order: 4,
    openInNewTab: true,
  },
];

const menuLabel = (menu, t) => (menu.labelKey ? t(menu.labelKey) : menu.label);

const Navbar = ({ nobg }) => {
  const [toggle, setToggle] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [customMenus, setCustomMenus] = useState(DEFAULT_MENUS);
  const router = useRouter();
  const { t } = useTranslation();

  const openSidebar = () => {
    setToggle(true);
  };

  const closeSidebar = () => {
    setToggle(false);
  };

  // Load the current session once so the menu reflects the user's permissions.
  useEffect(() => {
    const load = async () => {
      try {
        const data = await checkSession();
        if (data.success && data.user) {
          setUser(data.user);
        }
      } catch (err) {
        // not logged in
      }
      setLoading(false);
    };
    load();
  }, []);

  // Load admin-configured menu links. Falls back to the defaults when the
  // menu API is unreachable.
  useEffect(() => {
    let cancelled = false;
    getMenuItems()
      .then((data) => {
        if (!cancelled)
          setCustomMenus(
            Array.isArray(data?.menus) ? data.menus : DEFAULT_MENUS
          );
      })
      .catch(() => {
        if (!cancelled) setCustomMenus(DEFAULT_MENUS);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const changeWidth = () => {
      if (window.innerWidth >= 1207) {
        setToggle(false);
      }
    };
    changeWidth();
    window.addEventListener("resize", changeWidth);
  });

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch (err) {
      // ignore
    }
    setUser(null);
    router.push("/");
  };

  const isAdmin = user?.role === "admin";

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
        {customMenus.map((m, idx) =>
          m.openInNewTab ? (
            <a
              key={m._id ?? `nav-${idx}`}
              href={m.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.navItem}
              style={{ textDecoration: "none" }}
            >
              {menuLabel(m, t)}
            </a>
          ) : (
            <Link key={m._id ?? `nav-${idx}`} href={m.url} className={styles.navItem}>
              {menuLabel(m, t)}
            </Link>
          )
        )}

        {/* Language switcher: available before and after login */}
        <LanguageSwitcher className={styles.navItem} />

        {loading ? null : user ? (
          <>
            {isAdmin && (
              <Link href="/admin/dashboard" className={styles.navItem}>
                {t("nav.admin")}
              </Link>
            )}
            <Link href="/dashboard" className={styles.navItem}>
              {t("nav.dashboard")}
            </Link>
            <div className={styles.login}>
              <PrimaryButton onClick={handleLogout}>{t("nav.logout")}</PrimaryButton>
            </div>
          </>
        ) : (
          <>
            {/* Admin link goes to the admin login page first */}
            <Link href="/admin" className={styles.navItem}>
              {t("nav.admin")}
            </Link>
            <div className={styles.login}>
              <PrimaryButton onClick={() => router.push("/login")}>
                {t("nav.login")}
              </PrimaryButton>
            </div>
          </>
        )}
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
                <CopilotLogo />
              </a>
              <CloseOutlined onClick={closeSidebar} className={styles.close} />
            </div>

            <div className={styles.sidebarWrapper}>
              <Menu
                style={{ width: "100%" }}
                mode="inline"
                items={[
                  ...customMenus.map((m, idx) => ({
                    key: `menu-${m._id || idx}`,
                    label:
                      m.openInNewTab ? (
                        <a
                          href={m.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "inherit", textDecoration: "none" }}
                        >
                          {menuLabel(m, t)}
                        </a>
                      ) : (
                        <Link href={m.url}>{menuLabel(m, t)}</Link>
                      ),
                  })),
                  {
                    key: "language",
                    label: <LanguageSwitcher />,
                  },
                  ...(loading
                    ? []
                    : user
                    ? [
                        ...(isAdmin
                          ? [
                              {
                                key: "admin",
                                label: (
                                  <Link href="/admin/dashboard">
                                    {t("nav.admin")}
                                  </Link>
                                ),
                              },
                            ]
                          : []),
                        {
                          key: "dashboard",
                          label: (
                            <Link href="/dashboard">{t("nav.dashboard")}</Link>
                          ),
                        },
                        {
                          key: "logout",
                          label: (
                            <div
                              onClick={handleLogout}
                              className={styles.loginBtn}
                            >
                              {t("nav.logout")}
                            </div>
                          ),
                        },
                      ]
                    : [
                        {
                          key: "admin",
                          label: <Link href="/admin">{t("nav.admin")}</Link>,
                        },
                        {
                          key: "signin",
                          label: (
                            <Link href="/login">{t("nav.login")}</Link>
                          ),
                          className: styles.loginBtn,
                        },
                      ]),
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
