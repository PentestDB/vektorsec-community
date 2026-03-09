import styles from "@/styles/components/Chat.module.scss";

function renderMarkdown(text) {
  if (!text) return null;

  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith("```")) {
      const match = part.match(/```(\w*)\n?([\s\S]*?)```/);
      const code = match ? match[2] : part.slice(3, -3);
      return (
        <pre key={i}>
          <code>{code.trim()}</code>
        </pre>
      );
    }

    const lines = part.split("\n").map((line, j) => {
      let processed = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
      processed = processed.replace(/`([^`]+)`/g, "<code>$1</code>");
      processed = processed.replace(/^### (.+)/, "<h3>$1</h3>");
      processed = processed.replace(/^## (.+)/, "<h2>$1</h2>");
      processed = processed.replace(/^# (.+)/, "<h1>$1</h1>");
      processed = processed.replace(/^#### (.+)/, "<h4>$1</h4>");
      processed = processed.replace(/^- (.+)/, "<span class='list-item'>• $1</span>");
      return (
        <span key={j}>
          {j > 0 && <br />}
          <span dangerouslySetInnerHTML={{ __html: processed }} />
        </span>
      );
    });

    return <span key={i}>{lines}</span>;
  });
}

export default function SlashCommandResult({ message }) {
  const { command, content, success } = message;

  return (
    <div className={styles.slashCommandResult}>
      <div className={styles.slashCommandHeader}>
        <span className={styles.slashCommandIcon}>{success ? "⚡" : "⚠"}</span>
        <span className={styles.slashCommandLabel}>/{command}</span>
      </div>
      <div className={styles.slashCommandContent}>
        {renderMarkdown(content)}
      </div>
    </div>
  );
}
