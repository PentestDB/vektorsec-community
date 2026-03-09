"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import NProgress from "nprogress";

NProgress.configure({ showSpinner: false });

const NavigationProgress = () => {
  const pathname = usePathname();

  useEffect(() => {
    NProgress.done();
  }, [pathname]);

  useEffect(() => {
    const handleAnchorClick = (e) => {
      const anchor = e.target?.closest?.("a[href]");
      if (!anchor || anchor.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      try {
        const url = new URL(href, window.location.origin);
        if (url.origin === window.location.origin && url.pathname !== window.location.pathname) {
          NProgress.start();
        }
      } catch {}
    };

    const handlePopState = () => {
      NProgress.start();
    };

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (state, title, url) {
      if (url) {
        try {
          const newUrl = new URL(String(url), window.location.origin);
          if (newUrl.pathname !== window.location.pathname) {
            NProgress.start();
          }
        } catch {}
      }
      return originalPushState.apply(this, arguments);
    };

    history.replaceState = function (state, title, url) {
      if (url) {
        try {
          const newUrl = new URL(String(url), window.location.origin);
          if (newUrl.pathname !== window.location.pathname) {
            NProgress.start();
          }
        } catch {}
      }
      return originalReplaceState.apply(this, arguments);
    };

    document.addEventListener("click", handleAnchorClick);
    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener("click", handleAnchorClick);
      window.removeEventListener("popstate", handlePopState);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  }, []);

  return null;
};

export default NavigationProgress;
