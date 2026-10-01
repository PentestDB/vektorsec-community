"use client";

import { Dropdown, Tooltip } from "antd";
import { GlobalOutlined } from "@ant-design/icons";
import { useTranslation } from "./I18nProvider";
import { LOCALE_META } from "./index";

/**
 * Language switcher (cookie-backed).
 *
 * Rendered in the navbar and in the dashboard header links, so the choice is
 * reachable before and after login.
 */
export default function LanguageSwitcher({ className }) {
  const { locale, setLocale, t } = useTranslation();

  const items = Object.entries(LOCALE_META).map(([code, meta]) => ({
    key: code,
    label: `${meta.flag}  ${meta.label}`,
  }));

  return (
    <Dropdown
      trigger={["click"]}
      placement="bottomRight"
      menu={{ items, selectedKeys: [locale], onClick: ({ key }) => setLocale(key) }}
    >
      <Tooltip title={t("common.language")}>
        <button
          type="button"
          className={className}
          aria-label={t("common.language")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            background: "transparent",
            border: "none",
            color: "inherit",
            cursor: "pointer",
            font: "inherit",
            padding: "0.25rem 0.35rem",
          }}
        >
          <GlobalOutlined />
          <span>{LOCALE_META[locale]?.short ?? locale.toUpperCase()}</span>
        </button>
      </Tooltip>
    </Dropdown>
  );
}
