export interface Finding {
  agentId: string;
  modelLabel?: string;
  content: string;
  isSuccess: boolean;
  timestamp: Date;
}

const MAX_FINDINGS = 200;

export class FindingsBus {
  private findings: Finding[] = [];
  private cursors: Map<string, number> = new Map();

  post(agentId: string, content: string, isSuccess = false, modelLabel?: string): Finding {
    const finding: Finding = {
      agentId,
      modelLabel,
      content,
      isSuccess,
      timestamp: new Date(),
    };
    this.findings.push(finding);

    if (this.findings.length > MAX_FINDINGS) {
      const trimCount = this.findings.length - MAX_FINDINGS;
      this.findings = this.findings.slice(trimCount);
      for (const [id, cursor] of this.cursors) {
        this.cursors.set(id, Math.max(0, cursor - trimCount));
      }
    }

    return finding;
  }

  check(agentId: string): Finding[] {
    const cursor = this.cursors.get(agentId) ?? 0;
    const unread = this.findings
      .slice(cursor)
      .filter((f) => f.agentId !== agentId);
    this.cursors.set(agentId, this.findings.length);
    return unread;
  }

  broadcast(content: string, source = "coordinator"): Finding {
    return this.post(source, content, false);
  }

  getAll(): Finding[] {
    return [...this.findings];
  }

  formatUnread(findings: Finding[]): string {
    if (findings.length === 0) return "No new findings from other agents.";
    const lines = findings.map(
      (f) => `[Racer ${f.modelLabel || f.agentId}] ${f.content}`,
    );
    return `**Findings from other agents:**\n${lines.join("\n")}`;
  }
}
