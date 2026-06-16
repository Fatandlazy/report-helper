import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import Editor from "@monaco-editor/react";
import { ReportMetadata, DbConnection, DataSetInfo, ReportParameter, ReportTab, QueryParameter } from "../../types";
import { useHotkeys } from "../../hooks/useHotkeys";
import { useEditorResize } from "../../hooks/useEditorResize";
import { useConnectionDatabases } from "../../hooks/useConnectionDatabases";
import { useSqlRunner } from "../../hooks/useSqlRunner";
import { MultiResultTable } from "../../components/MultiResultTable";
import { ParameterInput } from "./components/ParameterInput";

interface ParamValue {
  name: string;
  prompt: string;
  dataType: string;
  value: string | null;
  nullable?: boolean;
  hidden?: boolean;
  availableValues?: any;
}

export function SqlTesterView({
  metadata, connections, activeConnectionId, onStatus,
  selectedDataSetName, onSelectedDataSetNameChange, defaultSafeRun,
  isEditMode, rdlPath, onRefresh, onUpdateTabMetadata, isActive,
  toolbarRightEl,
}: {
  metadata: ReportMetadata;
  connections: DbConnection[];
  activeConnectionId: string;
  onStatus: (l: string, r: string) => void;
  selectedDataSetName: string | null;
  onSelectedDataSetNameChange: (dsName: string | null) => void;
  defaultSafeRun: boolean;
  isEditMode: boolean;
  rdlPath: string;
  onRefresh: () => void;
  onUpdateTabMetadata: (path: string, metadata: Partial<ReportTab>) => void;
  isActive?: boolean;
  toolbarLeftEl: HTMLDivElement | null;
  toolbarRightEl: HTMLDivElement | null;
}) {
  const datasets = metadata.dataSets.filter((d: DataSetInfo) => d.commandText?.trim());
  const [selectedDs, setSelectedDs] = useState<DataSetInfo | null>(() =>
    (selectedDataSetName ? datasets.find(d => d.name === selectedDataSetName) : null) ?? datasets[0] ?? null
  );

  useEffect(() => {
    if (selectedDataSetName) {
      const ds = datasets.find(d => d.name === selectedDataSetName);
      if (ds) setSelectedDs(ds);
    }
  }, [selectedDataSetName]);

  const [connId, setConnId] = useState(activeConnectionId || connections[0]?.id || "");
  const [params, setParams] = useState<ParamValue[]>([]);
  const [copied, setCopied] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [connExpanded, setConnExpanded] = useState(false);
  const [showTechInfo, setShowTechInfo] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [sqlMode, setSqlMode] = useState<"formatted" | "raw">("formatted");
  const [editedRawSql, setEditedRawSql] = useState("");
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<any>(null);

  const { databases, selectedDb, setSelectedDb } = useConnectionDatabases(connections, connId);
  const { results, running, error, run } = useSqlRunner();
  const { height: editorHeight, isResizing, startResizing } = useEditorResize(160);

  useEffect(() => {
    if (selectedDs) onUpdateTabMetadata(rdlPath, { isDirty: editedRawSql !== (selectedDs.commandText || "") });
  }, [editedRawSql, selectedDs, rdlPath]);

  useEffect(() => { if (selectedDs) setEditedRawSql(selectedDs.commandText || ""); }, [selectedDs]);
  useEffect(() => { if (isEditMode && sqlMode === "formatted") setSqlMode("raw"); }, [isEditMode]);

  useHotkeys({ "ctrl+enter": handleRun, "f5": handleRun, "ctrl+s": handleSave });

  // Auto-size sidebar to longest prompt label
  useEffect(() => {
    if (params.length === 0) return;
    const ruler = document.createElement("span");
    ruler.style.cssText = "position:fixed;visibility:hidden;white-space:nowrap;font:600 12px Inter,-apple-system,sans-serif;";
    document.body.appendChild(ruler);
    let maxW = 0;
    params.forEach(p => { ruler.textContent = p.prompt || p.name; maxW = Math.max(maxW, ruler.getBoundingClientRect().width); });
    document.body.removeChild(ruler);
    setSidebarWidth(Math.min(Math.max(200, Math.ceil(maxW) + 80), 520));
  }, [params]);

  const formattedSql = useMemo(() => {
    if (!selectedDs) return "";
    const sql = selectedDs.commandText ?? "";
    if (params.length === 0) return sql;
    const bound = params.filter(p => sql.toLowerCase().includes("@" + p.name.toLowerCase()));
    if (bound.length === 0) return sql;
    if (selectedDs.commandType.toLowerCase().includes("stored")) {
      return `EXEC ${sql} ${bound.map(p => p.value === null ? `@${p.name}=NULL` : `@${p.name}='${p.value.replace(/'/g, "''")}'`).join(", ")}`;
    }
    return bound.map(p => `DECLARE @${p.name} NVARCHAR(MAX) = ${p.value === null ? "NULL" : `'${p.value.replace(/'/g, "''")}'`};`).join("\n")
      + "\n\n" + sql;
  }, [selectedDs, params]);

  const displaySql = useMemo(() =>
    !selectedDs ? "" : sqlMode === "raw" ? editedRawSql : formattedSql,
    [selectedDs, sqlMode, editedRawSql, formattedSql]
  );

  function buildParams(ds: DataSetInfo) {
    const sql = ds.commandText ?? "";
    let relevant: ReportParameter[];
    if (ds.queryParameters?.length) {
      relevant = metadata.parameters.filter(p =>
        ds.queryParameters!.some((qp: QueryParameter) => {
          const match = qp.value.match(/Parameters!([^.]+)/i);
          const name = match ? match[1] : qp.name.replace("@", "");
          return name.toLowerCase() === p.name.toLowerCase();
        })
      );
    } else {
      relevant = metadata.parameters.filter(p => sql.toLowerCase().includes("@" + p.name.toLowerCase()));
    }
    setParams(relevant.map(p => ({
      name: p.name, prompt: p.prompt, dataType: p.dataType,
      value: p.defaultValue ?? (p.nullable ? null : ""),
      nullable: p.nullable, hidden: p.hidden, availableValues: p.availableValues,
    })));
  }

  useEffect(() => { if (selectedDs) buildParams(selectedDs); }, [selectedDs?.name]);

  async function handleRun() {
    if (!selectedDs) return;
    const conn = connections.find(c => c.id === connId);
    if (!conn) return;

    const paramMap: Record<string, string | null> = {};
    params.forEach(p => {
      let val = p.value;
      if (val !== null && p.dataType === "Boolean") val = val.toLowerCase() === "true" ? "1" : "0";
      paramMap[p.name] = val;
    });

    const selection = editorRef.current?.getSelection();
    const selectedText = editorRef.current?.getModel()?.getValueInRange(selection);
    const sqlToRun = selectedText?.trim() ? selectedText : selectedDs.commandText;

    const outcome = await run({
      sql: sqlToRun || "",
      connectionString: conn.connectionString,
      params: paramMap,
      isStoredProc: selectedDs.commandType.toLowerCase().includes("stored"),
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
    if (!selectedDs || !editedRawSql.trim()) return;
    setSaving(true);
    try {
      await invoke("update_rdl_sql", { path: rdlPath, datasetName: selectedDs.name, newSql: editedRawSql });
      const mtime = await invoke<number>("get_file_modified_time", { path: rdlPath });
      onUpdateTabMetadata(rdlPath, { lastModified: mtime, isDirty: false });
      onRefresh();
    } catch (err) {
      alert("Failed to save: " + err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Sidebar */}
      {sidebarVisible && (
        <div style={{
          width: sidebarWidth, flexShrink: 0, borderRight: "1px solid #e8e8e8",
          background: "#f8f8f8", overflowY: "auto", padding: 12,
          display: "flex", flexDirection: "column", gap: 12,
        }}>
          {/* Connection Settings (collapsible) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div
              onClick={() => setConnExpanded(v => !v)}
              style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none", padding: "4px 0", borderBottom: "1px solid #eee" }}
            >
              <span className={`codicon ${connExpanded ? "codicon-chevron-down" : "codicon-chevron-right"}`} style={{ fontSize: 12, color: "#666" }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: "#007acc", textTransform: "uppercase" }}>Connection Settings</span>
            </div>
            {connExpanded && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "4px 8px", background: "rgba(0,0,0,0.02)", borderRadius: 4 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 4 }}>Connection</label>
                  <select style={{ width: "100%", fontSize: 12, height: 26, padding: "0 4px", borderRadius: 3, border: "1px solid #ccc", background: "#fff" }}
                    value={connId} onChange={e => setConnId(e.target.value)}>
                    {connections.length === 0 && <option value="">—</option>}
                    {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                {databases.length > 0 && (
                  <div>
                    <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 4 }}>Database</label>
                    <select style={{ width: "100%", fontSize: 12, height: 26, padding: "0 4px", borderRadius: 3, border: "1px solid #ccc", background: "#fff" }}
                      value={selectedDb} onChange={e => setSelectedDb(e.target.value)}>
                      {databases.map(db => <option key={db} value={db}>{db}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Dataset selector */}
          <div>
            <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 4 }}>Dataset</label>
            <select value={selectedDs?.name ?? ""} onChange={e => onSelectedDataSetNameChange(e.target.value)} disabled={datasets.length === 0} style={{ width: "100%" }}>
              {datasets.length === 0 && <option>—</option>}
              {datasets.map((d: DataSetInfo) => <option key={d.name} value={d.name}>{d.name}</option>)}
            </select>
          </div>

          {/* Parameters */}
          {params.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: "#666" }}>Parameters</span>
                <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", userSelect: "none" }}>
                  <input type="checkbox" checked={showTechInfo} onChange={e => setShowTechInfo(e.target.checked)} style={{ width: 12, height: 12, margin: 0 }} />
                  <span style={{ fontSize: 10, color: "#666", fontWeight: 500 }}>Technical Info</span>
                </label>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {params.map(p => (
                  <div key={p.name} style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 6, padding: "10px 12px", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#007fd4"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "#e0e0e0"; e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.02)"; }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", marginBottom: 6, lineHeight: 1.4 }}>{p.prompt || p.name}</div>
                    <ParameterInput
                      p={p as any}
                      value={p.value}
                      onChange={val => setParams(ps => ps.map(x => x.name === p.name ? { ...x, value: val } : x))}
                      metadata={metadata}
                      connections={connections}
                      activeConnectionId={connId}
                      allParams={Object.fromEntries(params.map(x => [x.name, x.value ?? ""]))}
                    />
                    {showTechInfo && (
                      <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, color: "#007fd4", fontFamily: "monospace", background: "#eef7ff", padding: "1px 4px", borderRadius: 2 }}>@{p.name}</span>
                        <span style={{ fontSize: 10, color: "#888", fontWeight: 500 }}>{(p as any).dataType}</span>
                        {p.hidden && <span className="codicon codicon-eye-closed" style={{ fontSize: 10, color: "#999" }} title="Hidden" />}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SQL + Results */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {isActive && toolbarRightEl && createPortal(
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isEditMode && sqlMode === "raw" && (
              <button
                onClick={handleSave}
                disabled={saving || editedRawSql === (selectedDs?.commandText || "")}
                className="btn-primary"
                style={{ height: 24, fontSize: 11, padding: "0 10px", borderRadius: 3, display: "flex", alignItems: "center", gap: 5, fontWeight: 600, background: "#28a745" }}
              >
                <span className={`codicon ${saving ? "codicon-loading codicon-modifier-spin" : "codicon-save"}`} style={{ fontSize: 11 }} />
                Save
              </button>
            )}
            <button
              onClick={handleRun}
              disabled={running || !selectedDs}
              className="btn-primary"
              style={{ height: 24, fontSize: 11, padding: "0 10px", borderRadius: 3, display: "flex", alignItems: "center", gap: 5, fontWeight: 600, background: defaultSafeRun ? "#28a745" : "#00539c" }}
            >
              <span className={`codicon ${running ? "codicon-loading codicon-modifier-spin" : "codicon-play"}`} style={{ fontSize: 11 }} />
              {defaultSafeRun ? "Run (Safe)" : "Run"}
            </button>
          </div>,
          toolbarRightEl
        )}

        {/* Toolbar: sidebar toggle + SQL mode switch */}
        <div style={{ display: "flex", alignItems: "center", height: 32, padding: "0 12px", borderBottom: "1px solid #e8e8e8", background: "#fafafa" }}>
          <button
            onClick={() => setSidebarVisible(v => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#666", display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}
          >
            <span className={`codicon ${sidebarVisible ? "codicon-layout-sidebar-left" : "codicon-layout-sidebar-left-off"}`} />
            {sidebarVisible ? "Hide Params" : "Show Params"}
          </button>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", background: "#eee", padding: 2, borderRadius: 4 }}>
            {(["formatted", "raw"] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setSqlMode(mode)}
                style={{
                  padding: "2px 8px", fontSize: 10, borderRadius: 3, border: "none", cursor: "pointer",
                  background: sqlMode === mode ? "#fff" : "transparent",
                  color: sqlMode === mode ? "#333" : "#666",
                  fontWeight: sqlMode === mode ? 600 : 400,
                  boxShadow: sqlMode === mode ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
                }}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {selectedDs && (
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{ height: editorHeight }}>
              <Editor
                key={sqlMode}
                height="100%"
                defaultLanguage="sql"
                value={displaySql}
                onChange={val => { if (isEditMode && sqlMode === "raw" && val !== formattedSql) setEditedRawSql(val || ""); }}
                theme="vs"
                onMount={(editor, monaco) => {
                  editorRef.current = editor;
                  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => { if (isEditMode && sqlMode === "raw") handleSave(); });
                }}
                options={{
                  readOnly: !isEditMode || sqlMode !== "raw",
                  minimap: { enabled: false }, scrollBeyondLastLine: false, fontSize: 12,
                  fontFamily: "'Cascadia Code','Fira Code','Consolas',monospace",
                  lineNumbers: "on", folding: true, wordWrap: "on", automaticLayout: true,
                  padding: { top: 8, bottom: 8 },
                }}
              />
            </div>
            {isEditMode && sqlMode === "formatted" && (
              <div style={{
                position: "absolute", top: 8, right: 24, zIndex: 10,
                background: "rgba(255,243,205,0.95)", color: "#856404",
                padding: "4px 10px", borderRadius: 4, fontSize: 11,
                border: "1px solid #ffeeba", boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
                display: "flex", alignItems: "center", gap: 6, pointerEvents: "none",
              }}>
                <span className="codicon codicon-info" />
                Switch to <strong>Raw</strong> mode to edit
              </div>
            )}
            <button
              onClick={async () => { try { await navigator.clipboard.writeText(displaySql); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} }}
              title="Copy SQL"
              style={{ position: "absolute", top: 8, right: 14, padding: 4, background: "transparent", color: copied ? "#28a745" : "#888", border: "none", cursor: "pointer", borderRadius: 3, display: "flex", alignItems: "center" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,0,0,0.06)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span className={`codicon ${copied ? "codicon-check" : "codicon-copy"}`} style={{ fontSize: 14 }} />
            </button>
          </div>
        )}

        {selectedDs && (
          <div
            onMouseDown={startResizing}
            style={{ height: 6, flexShrink: 0, cursor: "ns-resize", background: isResizing ? "#007fd4" : "transparent", borderTop: "1px solid #e8e8e8", borderBottom: "1px solid #e8e8e8", transition: "background 0.1s", zIndex: 10 }}
            onMouseEnter={e => { if (!isResizing) e.currentTarget.style.background = "rgba(0,127,212,0.3)"; }}
            onMouseLeave={e => { if (!isResizing) e.currentTarget.style.background = "transparent"; }}
          />
        )}

        {isResizing && <div style={{ position: "fixed", inset: 0, zIndex: 9999, cursor: "ns-resize" }} />}

        {error && (
          <div style={{ padding: "6px 14px", fontSize: 12, color: "#c00", background: "#fff0f0", borderBottom: "1px solid #fcc", flexShrink: 0 }}>
            {error}
          </div>
        )}

        <div style={{ flex: 1, overflow: "auto" }}>
          {!results && !error && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
              <span style={{ fontSize: 13, color: "#bbb" }}>Select a dataset and click Run</span>
            </div>
          )}
          {results && <MultiResultTable results={results} />}
        </div>
      </div>
    </div>
  );
}
