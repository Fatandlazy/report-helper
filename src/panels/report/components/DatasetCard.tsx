import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import Editor from "@monaco-editor/react";
import { DataSetInfo, ReportTab } from "../../../types";

export function DatasetCard({ dataset, isEditMode, rdlPath, onRefresh, onUpdateTabMetadata, onTest }: {
  dataset: DataSetInfo;
  isEditMode: boolean;
  rdlPath: string;
  onRefresh: () => void;
  onUpdateTabMetadata: (path: string, metadata: Partial<ReportTab>) => void;
  onTest: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editedSql, setEditedSql] = useState(dataset.commandText || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    onUpdateTabMetadata(rdlPath, { isDirty: editedSql !== (dataset.commandText || "") });
  }, [editedSql, dataset.commandText, rdlPath]);

  useEffect(() => { setEditedSql(dataset.commandText || ""); }, [dataset.commandText]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(editedSql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleSave = async (e: { stopPropagation(): void }) => {
    e.stopPropagation();
    if (!editedSql.trim()) return;
    setSaving(true);
    try {
      await invoke("update_rdl_sql", { path: rdlPath, datasetName: dataset.name, newSql: editedSql });
      const mtime = await invoke<number>("get_file_modified_time", { path: rdlPath });
      onUpdateTabMetadata(rdlPath, { lastModified: mtime, isDirty: false });
      onRefresh();
    } catch (err) {
      alert("Failed to save: " + err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ border: "1px solid #e8e8e8", borderRadius: 3, overflow: "hidden" }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", background: "#f7f7f7", cursor: "pointer" }}
        onMouseEnter={e => (e.currentTarget.style.background = "#f0f0f0")}
        onMouseLeave={e => (e.currentTarget.style.background = "#f7f7f7")}
      >
        <span className={`codicon ${expanded ? "codicon-chevron-down" : "codicon-chevron-right"}`} style={{ fontSize: 12, color: "#777", flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>{dataset.name}</span>
        <span style={{ fontSize: 12, color: "#aaa" }}>({dataset.commandType})</span>
        {dataset.dataSourceName && (
          <span style={{ fontSize: 11, color: "#aaa", display: "flex", alignItems: "center", gap: 4 }}>
            <span className="codicon codicon-server" style={{ fontSize: 11 }} />
            {dataset.dataSourceName}
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }} onClick={e => e.stopPropagation()}>
          {isEditMode && expanded && (
            <button
              onClick={handleSave}
              disabled={saving || editedSql === dataset.commandText}
              className="btn-primary"
              style={{ fontSize: 11, padding: "2px 8px", height: 22, borderRadius: 2, gap: 4, background: "#28a745" }}
            >
              <span className={`codicon ${saving ? "codicon-loading codicon-modifier-spin" : "codicon-save"}`} style={{ fontSize: 11 }} />
              Save
            </button>
          )}
          {isEditMode && (
            <button
              onClick={async e => {
                e.stopPropagation();
                const ok = await ask(`Delete dataset "${dataset.name}"? This cannot be undone.`, { title: "Delete Dataset", kind: "warning" });
                if (ok) {
                  try {
                    await invoke("remove_rdl_dataset", { path: rdlPath, datasetName: dataset.name });
                    onRefresh();
                  } catch (err) { alert("Delete failed: " + err); }
                }
              }}
              title="Delete Dataset"
              style={{ color: "#d93025", padding: "2px 6px", borderRadius: 3 }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(217,48,37,0.1)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span className="codicon codicon-trash" style={{ fontSize: 13 }} />
            </button>
          )}
          <button
            onClick={onTest}
            disabled={!dataset.commandText?.trim()}
            className="btn-primary"
            style={{ fontSize: 11, padding: "2px 8px", height: 22, borderRadius: 2, gap: 4 }}
          >
            <span className="codicon codicon-play" style={{ fontSize: 11 }} />
            Test
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: "1px solid #eee", position: "relative", height: 160 }}>
          <Editor
            height="100%"
            defaultLanguage="sql"
            value={editedSql}
            onChange={val => setEditedSql(val || "")}
            theme="vs"
            onMount={(editor, monaco) => {
              editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                if (isEditMode) handleSave({ stopPropagation: () => {} });
              });
            }}
            options={{
              readOnly: !isEditMode,
              minimap: { enabled: false }, scrollBeyondLastLine: false, fontSize: 12,
              fontFamily: "'Cascadia Code','Fira Code','Consolas',monospace",
              lineNumbers: "on", folding: true, wordWrap: "on", automaticLayout: true,
              padding: { top: 8, bottom: 8 }, scrollbar: { vertical: "auto", horizontal: "auto" },
            }}
          />
          <button
            onClick={handleCopy}
            title="Copy SQL"
            style={{
              position: "absolute", top: 8, right: 14, zIndex: 10,
              padding: 4, background: "rgba(255,255,255,0.8)",
              color: copied ? "#28a745" : "#888",
              border: "1px solid #ddd", cursor: "pointer", borderRadius: 3,
              display: "flex", alignItems: "center",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#bbb"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.8)"; e.currentTarget.style.borderColor = "#ddd"; }}
          >
            <span className={`codicon ${copied ? "codicon-check" : "codicon-copy"}`} style={{ fontSize: 14 }} />
          </button>
        </div>
      )}
    </div>
  );
}
