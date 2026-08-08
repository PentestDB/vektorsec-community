"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { checkSession, logoutUser } from "@/services/auth.service";
import styles from "./admin.module.scss";

// NOTE: All sidebar icons are single UTF-16 code units (BMP range) on purpose.
// Surrogate-pair emoji break when copied/pasted between editors, so we stick
// to safe BMP symbols (U+00A4 ... U+271B).
const MENU_GROUPS = [
  {
    title: "Overview",
    items: [
      { href: "/admin/dashboard", label: "Dashboard", icon: "\u2302" },
      { href: "/admin/users", label: "Users", icon: "\u25A3" },
      { href: "/admin/payment", label: "Payments", icon: "\u00A4" },
      { href: "/admin/topup", label: "Top-up Packages", icon: "\u25C6" },
      { href: "/admin/reports", label: "Reports", icon: "\u25A4" },
      { href: "/admin/coupons", label: "Coupons", icon: "\u2630" },
      { href: "/admin/audit-logs", label: "Audit Logs", icon: "\u2261" },
    ],
  },
  {
    title: "Infrastructure",
    items: [
      { href: "/admin/telegram", label: "Telegram Config", icon: "\u2708" },
      { href: "/admin/tasks", label: "Active Pentest Tasks", icon: "\u2694" },
      { href: "/admin/executions", label: "Execution Logs", icon: "\u25AE" },
      { href: "/admin/health", label: "System Health", icon: "\u2665" },
      { href: "/admin/notifications", label: "Notification Logs", icon: "\u2709" },
    ],
  },
  {
    title: "Security & Compliance",
    items: [
      { href: "/admin/scope", label: "Scope / Whitelist", icon: "\u25C9" },
      { href: "/admin/quotas", label: "Quotas / Rate Limits", icon: "\u23F1" },
      { href: "/admin/api-keys", label: "API Keys / Providers", icon: "\u2301" },
    ],
  },
  {
    title: "Content",
    items: [
      { href: "/admin/articles", label: "Articles", icon: "\u270E" },
      { href: "/admin/announcements", label: "Announcements", icon: "\u2756" },
      { href: "/admin/menu-links", label: "Menu Links", icon: "\u2637" },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/admin/mcp-tokens", label: "MCP Tokens", icon: "\u271B" },
      { href: "/admin/settings", label: "Settings", icon: "\u2699" },
    ],
  },
];

export default function AdminLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  // The /admin route is the admin login page — render it without the admin shell.
  const isLoginPage = pathname === "/admin";

  useEffect(() => {
    if (isLoginPage) {
      setLoading(false);
      return;
    }

    const verify = async () => {
      try {
        const data = await checkSession();
        if (!data.success) {
          router.replace("/admin");
          return;
        }
        if (data.user?.role !== "admin") {
          router.replace("/no-access");
          return;
        }
        setUser(data.user);
        setLoading(false);
      } catch (err) {
        router.replace("/admin");
      }
    };
    verify();
  }, [router, isLoginPage]);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch (err) {
      // ignore
    }
    router.replace("/admin");
  };

  // Login page is rendered without the admin shell.
  if (isLoginPage) {
    return children;
  }

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingSpinner} />
        <p>Checking admin access...</p>
      </div>
    );
  }

  return (
    <div className={styles.adminLayout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h1 className={styles.logo}>VektorSec</h1>
          <p className={styles.logoSub}>Autonomous Security Operations</p>
        </div>

        <nav className={styles.nav}>
          {MENU_GROUPS.map((group) => (
            <div key={group.title} className={styles.navGroup}>
              <div className={styles.navGroupTitle}>{group.title}</div>
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${styles.navItem} ${
                      isActive ? styles.navItemActive : ""
                    }`}
                  >
                    <span className={styles.navIcon}>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.userInfo}>
            <div className={styles.userAvatar}>
              {user?.name?.charAt(0)?.toUpperCase() || "A"}
            </div>
            <div className={styles.userDetails}>
              <span className={styles.userName}>{user?.name}</span>
              <span className={styles.userRole}>Administrator</span>
            </div>
          </div>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>

      <main className={styles.mainContent}>{children}</main>
    </div>
  );
}
