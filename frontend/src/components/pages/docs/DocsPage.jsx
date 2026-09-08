"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import styles from "@/styles/pages/Docs.module.scss";
import CopilotLogo from "@/components/common/CopilotLogo";
import Link from "next/link";
import {
  FiZap,
  FiCpu,
  FiTerminal,
  FiDatabase,
  FiCode,
  FiCopy,
  FiCheck,
  FiArrowLeft,
} from "react-icons/fi";

// ─── Documentation sections ──────────────────────────────────────────
const SECTIONS = [
  {
    id: "quick-start",
    label: "Quick Start",
    icon: FiZap,
    content: `## Quick Start Protocol

To initiate your first autonomous engagement:

1. Obtain your **Neural Access Token** via the **Top Up** menu.
2. Initialize a new **Workspace** with a Target Scope (IP / Domain).
3. Spawn an **Automated Session** or deploy the **Telegram Neural Bot**.

> Operator tip: begin with a single low-risk target to calibrate your token burn rate before scaling your operation.`,
  },
  {
    id: "architecture",
    label: "Core Architecture",
    icon: FiCpu,
    content: `## Core Architecture

VektorSec operates on a tri-tier intelligence framework:

- **Orchestrator Core** — the master reasoning engine powered by DeepSeek Neural Models.
- **Cloud Execution Workers** — sandboxed Kali Linux environments provisioned on-demand.
- **Telegram Gateway** — low-latency interface for mobile C2 (Command & Control).

> All three tiers communicate over an encrypted control plane. Nothing leaves the sandbox unless you explicitly approve it.`,
  },
  {
    id: "commands",
    label: "Commands",
    icon: FiTerminal,
    content: `## Commands

Interact with the agent through natural language or slash commands:

\`\`\`bash
/summarize   Summarize the entire session so far
/status      Show current engagement status
/clear       Clear the conversation context
/shells      List all active shell sessions
/targets     Extract and list all targets / IPs
\`\`\`

> Type \`/\` inside the prompt box to browse available slash commands interactively.`,
  },
  {
    id: "tokens",
    label: "Token System",
    icon: FiDatabase,
    content: `## Token Credits & Gas Rates

Operations consume credits based on context depth and tool invocation:

- Nmap Port Recon: ~150 Tokens
- Web Dir Buster / Endpoints: ~300 Tokens
- Deep Exploitation Analysis: ~800 Tokens

> Credits are deducted at runtime. Monitor your balance from the **Top Up** / **Billing** panel at any time.`,
  },
  {
    id: "api",
    label: "API Reference",
    icon: FiCode,
    content: `## API Reference

The platform exposes a REST API through the frontend gateway (the backend host is
not exposed directly to clients):

\`\`\`bash
# Verify the current session
curl -X POST http://localhost:3001/api/auth/status

# Create a new workspace
curl -X POST http://localhost:3001/api/workspace/create
\`\`\`

Authentication is handled via session cookies. For machine-to-machine access, generate an **MCP token** from **Settings > MCP Access**.`,
  },
];

// ─── Code block with copy button ─────────────────────────────────────
function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  }, [code]);

  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeHeader}>
        <span className={styles.codeLang}>{language || "terminal"}</span>
        <button
          type="button"
          className={`${styles.copyBtn} ${copied ? styles.copyBtnDone : ""}`}
          onClick={handleCopy}
        >
          {copied ? <FiCheck size={12} /> : <FiCopy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className={styles.codePre}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

const MarkdownComponents = {
  h2: ({ children }) => <h2 className={styles.mdH2}>{children}</h2>,
  h3: ({ children }) => <h3 className={styles.mdH3}>{children}</h3>,
  p: ({ children }) => <p className={styles.mdP}>{children}</p>,
  ul: ({ children }) => <ul className={styles.mdUl}>{children}</ul>,
  ol: ({ children }) => <ol className={styles.mdOl}>{children}</ol>,
  li: ({ children }) => <li className={styles.mdLi}>{children}</li>,
  strong: ({ children }) => <strong className={styles.mdStrong}>{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className={styles.mdBlockquote}>{children}</blockquote>
  ),
  a: ({ children, href }) => (
    <a className={styles.mdLink} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  table: ({ children }) => <table className={styles.mdTable}>{children}</table>,
  thead: ({ children }) => <thead className={styles.mdThead}>{children}</thead>,
  th: ({ children }) => <th className={styles.mdTh}>{children}</th>,
  td: ({ children }) => <td className={styles.mdTd}>{children}</td>,
  code({ inline, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    if (inline) {
      return <code className={styles.mdInlineCode}>{children}</code>;
    }
    return (
      <CodeBlock
        language={match ? match[1] : "bash"}
        code={String(children).replace(/\n$/, "")}
      />
    );
  },
};

const DocsPage = () => {
  const sectionRefs = useRef({});
  const [activeId, setActiveId] = useState("quick-start");

  const scrollToSection = useCallback((id) => {
    const el = sectionRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 }
    );
    SECTIONS.forEach((s) => {
      const el = sectionRefs.current[s.id];
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.docsShell}>
      <header className={styles.docsHeader}>
        <Link href="/" className={styles.brandLink}>
          <CopilotLogo />
        </Link>
        <span className={styles.headerLabel}>Neural Docs</span>
        <Link href="/dashboard" className={styles.backLink}>
          <FiArrowLeft size={13} />
          Back to App
        </Link>
      </header>

      <div className={styles.docsBody}>
        {/* Left navigation */}
        <aside className={styles.leftSidebar}>
          <div className={styles.sidebarTitle}>Documentation</div>
          <nav className={styles.sidebarNav}>
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`${styles.navItem} ${
                    activeId === s.id ? styles.navItemActive : ""
                  }`}
                  onClick={() => scrollToSection(s.id)}
                >
                  <Icon className={styles.navIcon} size={14} />
                  {s.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <main className={styles.mainContent}>
          <div className={styles.hero}>
            <h1 className={styles.heroTitle}>VektorSec Neural Docs</h1>
            <p className={styles.heroSub}>
              Welcome to the official documentation for VektorSec — the Autonomous AI
              Pentesting Agent.
            </p>
          </div>

          {SECTIONS.map((s) => (
            <section
              key={s.id}
              id={s.id}
              ref={(el) => {
                sectionRefs.current[s.id] = el;
              }}
              className={styles.section}
            >
              <ReactMarkdown components={MarkdownComponents}>
                {s.content}
              </ReactMarkdown>
            </section>
          ))}
        </main>

        {/* Right on-this-page TOC */}
        <aside className={styles.rightToc}>
          <div className={styles.tocTitle}>On this page</div>
          <nav className={styles.tocNav}>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`${styles.tocItem} ${
                  activeId === s.id ? styles.tocItemActive : ""
                }`}
                onClick={() => scrollToSection(s.id)}
              >
                {s.label}
              </button>
            ))}
          </nav>
        </aside>
      </div>
    </div>
  );
};

export default DocsPage;

