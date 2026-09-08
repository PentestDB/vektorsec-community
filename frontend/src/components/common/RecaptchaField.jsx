"use client";

import { useEffect, useRef, useState } from "react";

// Google reCAPTCHA widget (v2 checkbox / v3 via render=explicit).
// The site key is resolved at runtime:
//   1. NEXT_PUBLIC_RECAPTCHA_SITE_KEY (build-time, optional)
//   2. GET {backend}/api/auth/recaptcha-site-key (admin-configurable)
// Renders nothing when no site key is configured, so the app keeps working
// without reCAPTCHA in local/dev setups.
const SCRIPT_SRC = "https://www.google.com/recaptcha/api.js?render=explicit";

let scriptPromise = null;

function loadScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("no window"));
  }
  if (window.grecaptcha && window.grecaptcha.render) {
    return Promise.resolve();
  }
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () =>
          reject(new Error("Failed to load reCAPTCHA script"))
        );
        return;
      }
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load reCAPTCHA script"));
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

/**
 * reCAPTCHA field.
 *
 * Props:
 * - onChange(token): called when a fresh token is produced (or cleared).
 * - resetSignal: bump this number to force the widget to re-solve
 *   (e.g., after a failed submit consumed the previous token).
 */
export default function RecaptchaField({
  onChange,
  resetSignal = 0,
  compact = false,
}) {
  const widgetIdRef = useRef(null);
  const [error, setError] = useState(false);
  const [siteKey, setSiteKey] = useState(
    process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || ""
  );
  const idRef = useRef(`recaptcha-${Math.random().toString(36).slice(2)}`);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Resolve the site key at runtime when it is not baked in at build time.
  useEffect(() => {
    if (siteKey) return;
    let cancelled = false;
    fetch("/api/auth/recaptcha-site-key")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad status"))))
      .then((data) => {
        if (!cancelled && data?.siteKey) setSiteKey(data.siteKey);
      })
      .catch(() => {
        // Not configured — widget stays hidden.
      });
    return () => {
      cancelled = true;
    };
  }, [siteKey]);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled) return;
        if (!window.grecaptcha?.render) {
          throw new Error("grecaptcha unavailable after load");
        }
        widgetIdRef.current = window.grecaptcha.render(idRef.current, {
          sitekey: siteKey,
          callback: (token) => onChangeRef.current?.(token),
          "expired-callback": () => onChangeRef.current?.(""),
          "error-callback": () => onChangeRef.current?.(""),
        });
        setError(false);
      })
      .catch((e) => {
        console.error("[RecaptchaField]", e);
        setError(true);
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current != null && window.grecaptcha?.reset) {
        try {
          window.grecaptcha.reset(widgetIdRef.current);
        } catch {
          // ignore
        }
      }
    };
  }, [siteKey]);

  // Force a fresh solve whenever resetSignal changes (token already consumed).
  useEffect(() => {
    if (resetSignal > 0 && widgetIdRef.current != null && window.grecaptcha?.reset) {
      try {
        window.grecaptcha.reset(widgetIdRef.current);
      } catch {
        // ignore
      }
      onChangeRef.current?.("");
    }
  }, [resetSignal]);

  if (!siteKey) return null;

  return (
    <div style={{ marginBottom: 8 }}>
      <div
        id={idRef.current}
        data-testid="recaptcha-widget"
        style={compact ? { transform: "scale(0.85)", transformOrigin: "left center" } : undefined}
      />
      {error && (
        <div style={{ color: "#ff4d4f", fontSize: 13 }}>
          reCAPTCHA failed to load. Please refresh the page and try again.
        </div>
      )}
    </div>
  );
}

