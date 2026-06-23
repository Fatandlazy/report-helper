import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import Editor from "@monaco-editor/react";
import { ReportTab } from "../../types";
import { useHotkeys } from "../../hooks/useHotkeys";

export function TextFileView({ tab, onStatus, onUpdateTabMetadata, toolbarRightEl }: {
  tab: ReportTab;
  onStatus: (l: string, r: string) => void;
  onUpdateTabMetadata: (id: string, metadata: Partial<ReportTab>) => void;
  toolbarRightEl: HTMLDivElement | null;
}) {
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loading, setLoading] = useState(true);
  const editorRef = useRef<any>(null);

  const ext = tab.path.split(".").pop()?.toLowerCase() || "";

  // Map file extension to monaco language identifier
  const getLanguage = (ext: string) => {
    switch (ext) {
      case "json": return "json";
      case "yaml":
      case "yml": return "yaml";
      case "xml":
      case "config": return "xml";
      case "toml": return "ini";
      case "css": return "css";
      case "html": return "html";
      case "js":
      case "jsx": return "javascript";
      case "ts":
      case "tsx": return "typescript";
      case "py": return "python";
      case "cs": return "csharp";
      default: return "plaintext";
    }
  };

  useEffect(() => {
    setLoading(true);
    invoke<string>("read_text_file", { path: tab.path })
      .then(val => {
        setContent(val);
        setOriginalContent(val);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [tab.path]);

  useEffect(() => {
    if (!loading) {
      onUpdateTabMetadata(tab.id, { isDirty: content !== originalContent });
    }
  }, [content, originalContent, tab.id, loading]);

  useHotkeys({ "ctrl+s": handleSave });

  async function handleSave() {
    try {
      await invoke("write_text_file", { path: tab.path, content });
      const mtime = await invoke<number>("get_file_modified_time", { path: tab.path });
      setOriginalContent(content);
      onUpdateTabMetadata(tab.id, { lastModified: mtime, isDirty: false });
      onStatus("File Saved", tab.path.split(/[\\/]/).pop() || "");
    } catch (e: any) {
      alert(`Save failed: ${e}`);
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 24, color: "#aaa" }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "#fcfcfc" }}>
      {toolbarRightEl && createPortal(
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={handleSave}
            style={{
              height: 24, fontSize: 11, padding: "0 10px", borderRadius: 3,
              background: "#fff", border: "1px solid #ccc", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 5, color: "#333"
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#f0f0f0")}
            onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
          >
            <span className="codicon codicon-save" style={{ fontSize: 11, color: "#666" }} />
            Save
          </button>
        </div>,
        toolbarRightEl
      )}

      <div style={{ flex: 1, position: "relative" }}>
        <Editor
          height="100%"
          language={getLanguage(ext)}
          value={content}
          onChange={val => setContent(val || "")}
          theme="vs"
          onMount={(editor, monaco) => {
            editorRef.current = editor;
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, handleSave);
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
            automaticLayout: true,
            scrollBeyondLastLine: false,
          }}
        />
      </div>
    </div>
  );
}
