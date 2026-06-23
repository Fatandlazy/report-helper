import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ReportTab } from "../../types";
import { Centered } from "./components/Centered";

interface Props {
  tab: ReportTab;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" style="max-width:100%" />')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#007acc;text-decoration:underline">$1</a>')
    .replace(/`([^`]+)`/g, '<code style="font-family:monospace;background:#f0f0f0;padding:1px 5px;border-radius:3px;font-size:0.9em">$1</code>')
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/___(.+?)___/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>");
}

function parseMarkdown(md: string): string {
  const lines = md.split("\n");
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fenceMatch = line.match(/^(`{3,}|~{3,})([\w-]*)/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const lang = fenceMatch[2] || "";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(fence)) {
        codeLines.push(escapeHtml(lines[i]));
        i++;
      }
      html.push(
        `<pre style="background:#1e1e1e;color:#d4d4d4;padding:16px;border-radius:6px;overflow-x:auto;font-size:13px;line-height:1.5;margin:12px 0"><code${lang ? ` class="language-${lang}"` : ""}>${codeLines.join("\n")}</code></pre>`
      );
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const sizes: Record<number, string> = { 1: "2em", 2: "1.5em", 3: "1.25em", 4: "1em", 5: "0.875em", 6: "0.85em" };
      const weights: Record<number, string> = { 1: "700", 2: "700", 3: "600", 4: "600", 5: "600", 6: "600" };
      const borderBottom = level <= 2 ? "border-bottom:1px solid #e0e0e0;padding-bottom:8px;" : "";
      html.push(
        `<h${level} style="font-size:${sizes[level]};font-weight:${weights[level]};margin:${level === 1 ? "24px" : "16px"} 0 8px 0;color:#1a1a1a;line-height:1.3;${borderBottom}">${parseInline(escapeHtml(headingMatch[2]))}</h${level}>`
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      html.push('<hr style="border:none;border-top:1px solid #e0e0e0;margin:20px 0" />');
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      html.push(
        `<blockquote style="border-left:4px solid #007acc;margin:12px 0;padding:4px 16px;color:#555;background:#f8f8f8">${parseMarkdown(quoteLines.join("\n"))}</blockquote>`
      );
      continue;
    }

    // Table
    if (line.includes("|") && i + 1 < lines.length && /^\|?[\s:-]+\|/.test(lines[i + 1])) {
      const headers = line.split("|").map(c => c.trim()).filter(Boolean);
      i += 2; // skip separator row
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) {
        rows.push(lines[i].split("|").map(c => c.trim()).filter(Boolean));
        i++;
      }
      const headerHtml = headers.map(h => `<th style="padding:8px 12px;text-align:left;background:#f0f0f0;border:1px solid #ddd;font-weight:600">${parseInline(escapeHtml(h))}</th>`).join("");
      const rowsHtml = rows.map(r =>
        `<tr>${r.map((c, ci) => `<td style="padding:7px 12px;border:1px solid #ddd;${ci % 2 === 0 ? "" : ""}">${parseInline(escapeHtml(c))}</td>`).join("")}</tr>`
      ).join("");
      html.push(
        `<div style="overflow-x:auto;margin:12px 0"><table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`
      );
      continue;
    }

    // Unordered list
    if (/^(\s*)([-*+])\s+/.test(line)) {
      const listLines: string[] = [];
      const baseIndent = line.match(/^(\s*)/)![1].length;
      while (i < lines.length && /^\s*([-*+])\s+/.test(lines[i])) {
        listLines.push(lines[i]);
        i++;
      }
      const items = listLines.map(l => `<li style="margin:3px 0">${parseInline(escapeHtml(l.replace(/^\s*[-*+]\s+/, "")))}</li>`).join("");
      html.push(`<ul style="margin:8px 0;padding-left:${baseIndent + 24}px;list-style:disc">${items}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const listLines: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        listLines.push(lines[i]);
        i++;
      }
      const items = listLines.map(l => `<li style="margin:3px 0">${parseInline(escapeHtml(l.replace(/^\d+\.\s+/, "")))}</li>`).join("");
      html.push(`<ol style="margin:8px 0;padding-left:24px">${items}</ol>`);
      continue;
    }

    // Blank line → paragraph break
    if (line.trim() === "") {
      html.push("<br />");
      i++;
      continue;
    }

    // Paragraph
    html.push(`<p style="margin:6px 0;line-height:1.7;color:#333">${parseInline(escapeHtml(line))}</p>`);
    i++;
  }

  return html.join("\n");
}

export function MarkdownView({ tab }: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setContent(null);
    setError(null);
    invoke<string>("read_text_file", { path: tab.path })
      .then(setContent)
      .catch(e => setError(String(e)));
  }, [tab.path]);

  if (error) {
    return (
      <Centered>
        <span className="codicon codicon-error" style={{ fontSize: 28, color: "#c00" }} />
        <span style={{ fontSize: 13, color: "#c00", marginTop: 10 }}>{error}</span>
      </Centered>
    );
  }

  if (content === null) {
    return (
      <Centered>
        <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 22, color: "#aaa" }} />
      </Centered>
    );
  }

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "32px 48px", background: "#fff" }}>
      <div
        style={{ maxWidth: 860, margin: "0 auto", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", fontSize: 14 }}
        dangerouslySetInnerHTML={{ __html: parseMarkdown(content) }}
      />
    </div>
  );
}
