import React, { useState } from "react";

interface MarkdownProps {
  content: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy"}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "2px 6px",
        borderRadius: 4,
        fontSize: 11,
        color: copied ? "#4ade80" : "#94a3b8",
        display: "flex",
        alignItems: "center",
        gap: 4,
        transition: "color 0.2s"
      }}
    >
      <span
        className={`codicon ${copied ? "codicon-check" : "codicon-copy"}`}
        style={{ fontSize: 12 }}
      />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function renderInlineStyles(text: string): React.ReactNode[] {
  // Process bold (**text**), italic (*text* or _text_), and inline code (`code`)
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={idx} style={{ fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    }
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) {
      return <em key={idx}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={idx}
          style={{
            background: "rgba(0,0,0,0.07)",
            padding: "2px 4px",
            borderRadius: 4,
            fontFamily: "monospace",
            fontSize: "12px",
            color: "#e0573e"
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

export function MarkdownRenderer({ content }: MarkdownProps) {
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {parts.map((part, index) => {
        if (part.startsWith("```")) {
          const lines = part.split("\n");
          const firstLine = lines[0] || "";
          const language = firstLine.slice(3).trim();
          const codeLines = lines.slice(1, lines.length - 1);
          const code = codeLines.join("\n");

          return (
            <div
              key={index}
              style={{
                margin: "4px 0",
                borderRadius: 6,
                overflow: "hidden",
                border: "1px solid #e5e7eb",
                background: "#f8fafc"
              }}
            >
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#e2e8f0",
                padding: "3px 12px",
                borderBottom: "1px solid #e5e7eb"
              }}>
                <span style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase" }}>
                  {language || "code"}
                </span>
                <CopyButton text={code} />
              </div>
              <pre style={{
                margin: 0,
                padding: "12px",
                overflowX: "auto",
                fontFamily: "monospace",
                fontSize: "12.5px",
                lineHeight: "1.5",
                color: "#0f172a"
              }}>
                <code>{code}</code>
              </pre>
            </div>
          );
        }

        // Text block: parse line by line
        const lines = part.split("\n");
        const elements: React.ReactNode[] = [];
        let bulletList: React.ReactNode[] = [];
        let numberedList: React.ReactNode[] = [];

        const flushBulletList = (key: string) => {
          if (bulletList.length > 0) {
            elements.push(
              <ul key={`ul-${key}`} style={{ paddingLeft: 20, margin: "4px 0", listStyleType: "disc" }}>
                {bulletList}
              </ul>
            );
            bulletList = [];
          }
        };

        const flushNumberedList = (key: string) => {
          if (numberedList.length > 0) {
            elements.push(
              <ol key={`ol-${key}`} style={{ paddingLeft: 20, margin: "4px 0", listStyleType: "decimal" }}>
                {numberedList}
              </ol>
            );
            numberedList = [];
          }
        };

        const flushAll = (key: string) => {
          flushBulletList(key);
          flushNumberedList(key);
        };

        lines.forEach((line, lineIdx) => {
          const trimmed = line.trim();
          const key = `${index}-${lineIdx}`;

          if (trimmed === "---") {
            flushAll(key);
            elements.push(<hr key={key} style={{ border: "none", borderTop: "1px solid #e2e8f0", margin: "12px 0" }} />);
          } else if (trimmed.startsWith("### ")) {
            flushAll(key);
            elements.push(
              <h3 key={key} style={{ fontSize: 13, fontWeight: 700, margin: "8px 0 4px 0", color: "#4a5568" }}>
                {renderInlineStyles(trimmed.slice(4))}
              </h3>
            );
          } else if (trimmed.startsWith("## ")) {
            flushAll(key);
            elements.push(
              <h2 key={key} style={{ fontSize: 15, fontWeight: 700, margin: "10px 0 4px 0", color: "#2d3748" }}>
                {renderInlineStyles(trimmed.slice(3))}
              </h2>
            );
          } else if (trimmed.startsWith("# ")) {
            flushAll(key);
            elements.push(
              <h1 key={key} style={{ fontSize: 18, fontWeight: 700, margin: "12px 0 6px 0", color: "#1a202c" }}>
                {renderInlineStyles(trimmed.slice(2))}
              </h1>
            );
          } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
            flushNumberedList(key);
            bulletList.push(
              <li key={key} style={{ margin: "3px 0", color: "#2d3748", lineHeight: 1.5 }}>
                {renderInlineStyles(trimmed.slice(2))}
              </li>
            );
          } else if (/^\d+\.\s/.test(trimmed)) {
            flushBulletList(key);
            const text = trimmed.replace(/^\d+\.\s/, "");
            numberedList.push(
              <li key={key} style={{ margin: "3px 0", color: "#2d3748", lineHeight: 1.5 }}>
                {renderInlineStyles(text)}
              </li>
            );
          } else if (trimmed === "") {
            flushAll(key);
            elements.push(<div key={key} style={{ height: 4 }} />);
          } else {
            flushAll(key);
            elements.push(
              <p key={key} style={{ margin: "3px 0", color: "#2d3748", lineHeight: 1.6 }}>
                {renderInlineStyles(line)}
              </p>
            );
          }
        });

        flushAll(`end-${index}`);
        return <div key={index}>{elements}</div>;
      })}
    </div>
  );
}
