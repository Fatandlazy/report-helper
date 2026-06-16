import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import Editor from "@monaco-editor/react";
import { ReportTab, DbConnection } from "../../types";
import { useHotkeys } from "../../hooks/useHotkeys";
import { useEditorResize } from "../../hooks/useEditorResize";
import { useConnectionDatabases } from "../../hooks/useConnectionDatabases";
import { useSqlRunner } from "../../hooks/useSqlRunner";
import { MultiResultTable } from "../../components/MultiResultTable";

export function SqlFileView({ tab, connections, activeConnectionId, onStatus, defaultSafeRun, onUpdateTabMetadata, toolbarLeftEl, toolbarRightEl }: {
  tab: ReportTab;
  connections: DbConnection[];
  activeConnectionId: string;
  onStatus: (l: string, r: string) => void;
  defaultSafeRun: boolean;
  onUpdateTabMetadata: (id: string, metadata: Partial<ReportTab>) => void;
  toolbarLeftEl: HTMLDivElement | null;
  toolbarRightEl: HTMLDivElement | null;
}) {
  const [sql, setSql] = useState("");
  const [originalSql, setOriginalSql] = useState("");
  const [connId, setConnId] = useState(activeConnectionId || connections[0]?.id || "");
  const [loading, setLoading] = useState(true);
  const editorRef = useRef<any>(null);

  const { databases, selectedDb, setSelectedDb } = useConnectionDatabases(connections, connId);
  const { results, running, error, run } = useSqlRunner();
  const { height: editorHeight, isResizing, startResizing } = useEditorResize(300);

  useEffect(() => {
    invoke<string>("read_text_file", { path: tab.path })
      .then(content => { setSql(content); setOriginalSql(content); setLoading(false); })
      .catch(() => setLoading(false));
  }, [tab.path]);

  useEffect(() => {
    if (!loading) onUpdateTabMetadata(tab.id, { isDirty: sql !== originalSql });
  }, [sql, originalSql, tab.id, loading]);

  useHotkeys({ "ctrl+enter": handleRun, "f5": handleRun, "ctrl+s": handleSave });

  async function handleRun() {
    if (!sql.trim()) return;
    const conn = connections.find(c => c.id === connId);
    if (!conn) return;
    const selection = editorRef.current?.getSelection();
    const selectedText = editorRef.current?.getModel()?.getValueInRange(selection);
    const sqlToRun = selectedText?.trim() ? selectedText : sql;
    const outcome = await run({
      sql: sqlToRun,
      connectionString: conn.connectionString,
      params: {},
      isStoredProc: false,
      database: selectedDb || null,
      safeRun: defaultSafeRun,
    });
    if (outcome) {
      const totalRows = outcome.results.reduce((acc, r) => acc + r.rowCount, 0);
      const totalMs = outcome.results.reduce((acc, r) => acc + r.elapsedMs, 0);
      const batchesText = outcome.results.length > 1 ? `${outcome.results.length} batches · ` : '';
      onStatus(conn.name, `${batchesText}${totalRows} rows · ${totalMs}ms${outcome.isSafeApplied ? " (Safe)" : ""}`);
    } else {
      onStatus("", "Error");
    }
  }

  async function handleSave() {
    try {
      await invoke("write_text_file", { path: tab.path, content: sql });
      const mtime = await invoke<number>("get_file_modified_time", { path: tab.path });
      setOriginalSql(sql);
      onUpdateTabMetadata(tab.id, { lastModified: mtime, isDirty: false });
      onStatus("File Saved", tab.path.split(/[\\/]/).pop() || "");
    } catch (e: any) {
      alert(`Save failed: ${e}`);
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <span className="codicon codicon-loading codicon-modifier-spin" />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "#fcfcfc" }}>
      {toolbarLeftEl && createPortal(
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span className="codicon codicon-server" style={{ fontSize: 13, color: "#666" }} title="Connection" />
            <select
              style={{ fontSize: 12, height: 24, padding: "0 4px", borderRadius: 3, border: "1px solid #ccc", background: "#fff", minWidth: 90 }}
              value={connId}
              onChange={e => setConnId(e.target.value)}
            >
              {connections.length === 0 && <option value="">—</option>}
              {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {databases.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span className="codicon codicon-database" style={{ fontSize: 13, color: "#666" }} title="Database" />
              <select
                style={{ fontSize: 12, height: 24, padding: "0 4px", borderRadius: 3, border: "1px solid #ccc", background: "#fff", minWidth: 100 }}
                value={selectedDb}
                onChange={e => setSelectedDb(e.target.value)}
              >
                {databases.map(db => <option key={db} value={db}>{db}</option>)}
              </select>
            </div>
          )}
        </div>,
        toolbarLeftEl
      )}

      {toolbarRightEl && createPortal(
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={handleRun}
            disabled={running}
            className="btn-primary"
            style={{ height: 24, fontSize: 11, padding: "0 10px", borderRadius: 3, display: "flex", alignItems: "center", gap: 5, fontWeight: 600, background: defaultSafeRun ? "#28a745" : "#00539c" }}
          >
            <span className={`codicon ${running ? "codicon-loading codicon-modifier-spin" : "codicon-play"}`} style={{ fontSize: 11 }} />
            {defaultSafeRun ? "Run (Safe)" : "Run"}
          </button>
          <button
            onClick={handleSave}
            style={{ height: 24, fontSize: 11, padding: "0 10px", borderRadius: 3, background: "#fff", border: "1px solid #ccc", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: "#333" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#f0f0f0")}
            onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
          >
            <span className="codicon codicon-save" style={{ fontSize: 11, color: "#666" }} />
            Save
          </button>
        </div>,
        toolbarRightEl
      )}

      <div style={{ height: editorHeight, borderBottom: "1px solid #ddd", position: "relative" }}>
        <Editor
          height="100%"
          defaultLanguage="sql"
          value={sql}
          onChange={val => setSql(val || "")}
          theme="vs"
          onMount={(editor, monaco) => {
            editorRef.current = editor;
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, handleSave);
          }}
          options={{
            minimap: { enabled: false }, fontSize: 13,
            fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
            automaticLayout: true, scrollBeyondLastLine: false,
          }}
        />
        {isResizing && <div style={{ position: "fixed", inset: 0, zIndex: 9999, cursor: "ns-resize" }} />}
        <div
          onMouseDown={startResizing}
          style={{ position: "absolute", bottom: -5, left: 0, right: 0, height: 10, cursor: "ns-resize", zIndex: 100 }}
        />
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        {error && (
          <div style={{ padding: 15, color: "#c00", fontSize: 13, whiteSpace: "pre-wrap", fontFamily: "monospace" }}>{error}</div>
        )}
        {!error && !results && !running && (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa", fontSize: 13 }}>
              Press F5 to run query
            </div>
          )}
          {!error && results && <MultiResultTable results={results} />}
        {running && (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 24, color: "#aaa" }} />
          </div>
        )}
      </div>
    </div>
  );
}
