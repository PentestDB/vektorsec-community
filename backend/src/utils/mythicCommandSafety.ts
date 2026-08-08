/**
 * Classifies Mythic agent commands by blast radius.
 *
 * Tasking a live implant on a client's estate is the highest-stakes action in the
 * product. Commands that move laterally, execute code, alter tokens, or destroy
 * data are flagged here so `shouldRequireConsent` fires — which (by design in
 * tool-approval.service.ts) means they can never be auto-approved and are hard-blocked
 * for subagents and swarm racers. Read-only enumeration stays on the ordinary
 * `requiresConsent` path so an operator in "Auto Approve" mode is not prompted for
 * every `ls`.
 */

export interface MythicCommandRisk {
  highImpact: boolean;
  reason: string;
}

const SAFE: MythicCommandRisk = { highImpact: false, reason: "" };

/**
 * Command names are agent-specific (apollo, poseidon, athena, medusa…), so this
 * matches on the well-known names across the common Mythic agents plus generic
 * verbs. Anything unrecognised is treated as safe here and still goes through the
 * normal consent ladder — this list only escalates, it never de-escalates.
 */
const HIGH_IMPACT_COMMANDS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /^(jump_psexec|jump_wmi|jump_winrm|jump_dcom|jump_ssh|psexec|wmiexec|smbexec|atexec|dcomexec|winrm)\b/i,
    reason: "Lateral movement to another host",
  },
  {
    pattern: /^(execute_assembly|inline_assembly|execute_pe|assembly_inject|run_assembly|dotnet)\b/i,
    reason: "In-memory .NET assembly execution",
  },
  {
    pattern: /^(shinject|inject|spawnto_x64|spawnto_x86|createremotethread|dllinject|reflective_inject)\b/i,
    reason: "Process injection",
  },
  {
    pattern: /^(make_token|steal_token|rev2self|pth|pass_the_hash|getsystem|elevate|runas|impersonate)\b/i,
    reason: "Token manipulation or privilege escalation",
  },
  {
    pattern: /^(shell|run|powershell|powerpick|cmd|exec|execute)\b/i,
    reason: "Arbitrary command execution on the target",
  },
  {
    pattern: /^(upload|put|write_file)\b/i,
    reason: "Writes a file to the target host",
  },
  {
    pattern: /^(rm|del|remove|rmdir|delete_file|shred)\b/i,
    reason: "Destructive file operation on the target",
  },
  {
    pattern: /^(mimikatz|logonpasswords|dcsync|lsass|dump_lsass|hashdump|kerberoast|asreproast|sekurlsa)\b/i,
    reason: "Credential dumping",
  },
  {
    pattern: /^(persist|persistence|schtasks|service_create|registry_write|reg_write|startup)\b/i,
    reason: "Establishes persistence on the target",
  },
  {
    pattern: /^(exit|kill|suicide|shutdown|reboot)\b/i,
    reason: "Terminates the implant or the host",
  },
  {
    pattern: /^(socks|rpfwd|portfwd|link|connect|unlink)\b/i,
    reason: "Opens a network pivot through the implant",
  },
];

export function classifyMythicCommand(command: string): MythicCommandRisk {
  if (!command || typeof command !== "string") return SAFE;

  // Mythic commands are a single token; tolerate operators passing "cmd args".
  const name = command.trim().split(/\s+/)[0] || "";
  if (!name) return SAFE;

  for (const { pattern, reason } of HIGH_IMPACT_COMMANDS) {
    if (pattern.test(name)) {
      return { highImpact: true, reason };
    }
  }
  return SAFE;
}

export function isHighImpactMythicCommand(command: string): boolean {
  return classifyMythicCommand(command).highImpact;
}
