import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save as saveFileDialog, ask } from "@tauri-apps/plugin-dialog";
import Editor from "@monaco-editor/react";
import { format } from "sql-formatter";
import { DbConnection, WorkspaceFolder, SAMPLE_SQL, ReportTab } from "../types";
import { useHotkeys } from "../hooks/useHotkeys";
import { useEditorResize } from "../hooks/useEditorResize";
import { useConnectionDatabases } from "../hooks/useConnectionDatabases";
import { useSqlRunner } from "../hooks/useSqlRunner";
import { ResultTable } from "../components/ResultTable";
import { SQL_SNIPPETS } from "../data/snippets";

interface Props {
  connections: DbConnection[];
  workspaceFolders: WorkspaceFolder[];
  onAddConnection: (conn: DbConnection) => void;
  onRemoveConnection: (id: string) => void;
  onUpdateConnection: (conn: DbConnection) => void;
  onStatus: (left: string, right: string) => void;
  sidebarVisible: boolean;
  defaultSafeRun: boolean;
  onUpdateTabMetadata: (path: string, metadata: Partial<ReportTab>) => void;
  addToHistory: (item: any) => void;
  history?: any[];
}

type FormMode = "add" | "edit" | null;
type TestState = "idle" | "testing" | "ok" | "fail";

export function SqlEditorPanel({
  connections, workspaceFolders, onAddConnection, onRemoveConnection,
  onUpdateConnection, onStatus, sidebarVisible, defaultSafeRun, onUpdateTabMetadata,
  addToHistory, history,
}: Props) {
  const [connId, setConnId] = useState(connections[0]?.id ?? "");
  const [sql, setSql] = useState(SAMPLE_SQL);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [lastModified, setLastModified] = useState<number | null>(null);
  const [folderFiles, setFolderFiles] = useState<Record<string, string[]>>({});
  const [isSample, setIsSample] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const editorRef = useRef<any>(null);
  const completionProviderRef = useRef<any>(null);
  const schemaRef = useRef<{ tables: string[]; columns: string[] }>({ tables: [], columns: [] });

  const { databases, selectedDb, setSelectedDb } = useConnectionDatabases(connections, connId);
  const { result, running, error, run } = useSqlRunner();
  const { height: editorHeight, isResizing, startResizing } = useEditorResize(300);

  const toggleFolder = (path: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const scanFolder = useCallback(async (folderPath: string) => {
    try {
      const files = await invoke<string[]>("scan_folder", { path: folderPath });
      setFolderFiles(prev => ({ ...prev, [folderPath]: files.filter(f => !f.endsWith("/") && f.toLowerCase().endsWith(".sql")) }));
    } catch {}
  }, []);

  useEffect(() => {
    workspaceFolders.forEach(wf => { if (!folderFiles[wf.path]) scanFolder(wf.path); });
  }, [workspaceFolders, scanFolder]);

  // Schema for autocomplete
  useEffect(() => {
    const conn = connections.find(c => c.id === connId);
    if (!conn) return;
    const fetch = async () => {
      try {
        const [tablesRes, colsRes] = await Promise.all([
          invoke<{ columns: string[]; rows: Record<string, unknown>[] }>("run_sql", {
            sql: "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'",
            connectionString: conn.connectionString, params: {}, isStoredProc: false,
          }),
          invoke<{ columns: string[]; rows: Record<string, unknown>[] }>("run_sql", {
            sql: "SELECT DISTINCT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS",
            connectionString: conn.connectionString, params: {}, isStoredProc: false,
          }),
        ]);
        schemaRef.current = {
          tables: tablesRes.rows.map(r => String(Object.values(r)[0])),
          columns: colsRes.rows.map(r => String(Object.values(r)[0])),
        };
      } catch {}
    };
    fetch();
  }, [connId, connections]);

  // File change detection on window focus
  useEffect(() => {
    const handleFocus = async () => {
      if (!activeFilePath || !lastModified) return;
      try {
        const mtime = await invoke<number>("get_file_modified_time", { path: activeFilePath });
        if (mtime > lastModified) {
          const fileName = activeFilePath.split(/[\\/]/).pop();
          const confirmed = await ask(`File "${fileName}" has been modified by another editor. Reload it?`, { title: "File Changed", kind: "warning" });
          if (confirmed) handleOpenFile(activeFilePath);
          else setLastModified(mtime);
        }
      } catch {}
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [activeFilePath, lastModified]);

  // Connection form state
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [formId, setFormId] = useState("");
  const [formName, setFormName] = useState("");
  const [formConnStr, setFormConnStr] = useState("");
  const [testState, setTestState] = useState<TestState>("idle");
  const [testMsg, setTestMsg] = useState("");

  useHotkeys({
    "ctrl+enter": handleRun,
    "f5": handleRun,
    "ctrl+s": handleSaveSql,
    "ctrl+n": handleNewSql,
    "shift+alt+f": handleFormatSql,
  });

  function handleFormatSql() {
    try { setSql(format(sql, { language: "tsql", keywordCase: "upper" })); } catch {}
  }

  async function handleRun() {
    const selection = editorRef.current?.getSelection();
    const selectedText = editorRef.current?.getModel()?.getValueInRange(selection);
    const sqlToRun = selectedText?.trim() ? selectedText : sql;
    if (!sqlToRun.trim()) return;
    const conn = connections.find(c => c.id === connId);
    if (!conn) return;

    const outcome = await run({
      sql: sqlToRun,
      connectionString: conn.connectionString,
      params: {},
      isStoredProc: false,
      database: selectedDb || null,
      safeRun: defaultSafeRun,
    });

    if (outcome) {
      onStatus(conn.name, `${outcome.result.rowCount} rows · ${outcome.result.elapsedMs}ms${outcome.isSafeApplied ? " (Safe)" : ""}`);
      addToHistory({ sql: sqlToRun.trim(), timestamp: Date.now(), connectionName: conn.name });
    } else {
      onStatus("", "Error");
    }
  }

  function handleNewSql() {
    setSql(SAMPLE_SQL);
    setActiveFilePath(null);
    setIsSample(true);
  }

  async function handleSaveSql() {
    let targetPath = activeFilePath;
    if (!targetPath) {
      const selected = await saveFileDialog({ filters: [{ name: "SQL", extensions: ["sql"] }], defaultPath: "query.sql" });
      if (!selected) return;
      targetPath = selected;
    }
    try {
      await invoke("write_text_file", { path: targetPath, content: sql });
      const mtime = await invoke<number>("get_file_modified_time", { path: targetPath });
      setActiveFilePath(targetPath);
      setLastModified(mtime);
      setIsSample(false);
      onUpdateTabMetadata(targetPath, { lastModified: mtime });
      onStatus("Saved", targetPath.split(/[\\/]/).pop() || "");
      workspaceFolders.forEach(wf => { if (targetPath?.startsWith(wf.path)) scanFolder(wf.path); });
    } catch (e) { alert(`Failed to save: ${e}`); }
  }

  async function handleOpenFile(path: string) {
    try {
      const [content, mtime] = await Promise.all([
        invoke<string>("read_text_file", { path }),
        invoke<number>("get_file_modified_time", { path }),
      ]);
      setSql(content);
      setActiveFilePath(path);
      setLastModified(mtime);
      setIsSample(false);
      onStatus("Loaded", path.split(/[\\/]/).pop() || "");
    } catch (e) { alert(`Failed to read file: ${e}`); }
  }

  function openAdd() { setFormMode("add"); setFormId(""); setFormName(""); setFormConnStr(""); setTestState("idle"); setTestMsg(""); }
  function openEdit(c: DbConnection) { setFormMode("edit"); setFormId(c.id); setFormName(c.name); setFormConnStr(c.connectionString); setTestState("idle"); setTestMsg(""); }
  function closeForm() { setFormMode(null); setTestState("idle"); setTestMsg(""); }

  async function handleTestConn() {
    if (!formConnStr.trim()) return;
    setTestState("testing");
    setTestMsg("");
    try {
      await invoke("run_sql", { sql: "SELECT 1 AS ok", connectionString: formConnStr.trim(), params: {}, isStoredProc: false, database: null });
      setTestState("ok");
      setTestMsg("Connection successful");
    } catch (e: any) { setTestState("fail"); setTestMsg(String(e)); }
  }

  function handleSaveConn() {
    if (!formName.trim() || !formConnStr.trim()) return;
    if (formMode === "add") {
      const newConn = { id: crypto.randomUUID(), name: formName.trim(), connectionString: formConnStr.trim() };
      onAddConnection(newConn);
      setConnId(newConn.id);
    } else if (formMode === "edit") {
      onUpdateConnection({ id: formId, name: formName.trim(), connectionString: formConnStr.trim() });
    }
    closeForm();
  }

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", background: "#fff" }}>
      {/* Sidebar */}
      {sidebarVisible && (
        <div style={{ width: 260, background: "#f3f3f3", borderRight: "1px solid #e0e0e0", flexShrink: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid #e0e0e0", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span className="section-label">Connections</span>
              {formMode === null && (
                <button onClick={openAdd} title="Add connection" style={{ color: "#666", padding: 2, borderRadius: 2 }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,0,0,0.08)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  <span className="codicon codicon-add" style={{ fontSize: 15 }} />
                </button>
              )}
            </div>

            {formMode !== null && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 3 }}>Name</label>
                  <input type="text" placeholder="e.g. Production DB" value={formName} onChange={e => setFormName(e.target.value)} autoFocus />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 3 }}>Connection string</label>
                  <textarea
                    placeholder="Server=...;Database=...;User Id=...;Password=...;"
                    value={formConnStr}
                    onChange={e => { setFormConnStr(e.target.value); setTestState("idle"); setTestMsg(""); }}
                    rows={3}
                    style={{ resize: "none", fontFamily: "monospace", fontSize: 12 }}
                  />
                </div>
                {testState !== "idle" && (
                  <div style={{
                    fontSize: 11, padding: "4px 8px", borderRadius: 2, wordBreak: "break-word",
                    background: testState === "ok" ? "#f0fff4" : testState === "fail" ? "#fff0f0" : "#f5f5f5",
                    color: testState === "ok" ? "#1a7f37" : testState === "fail" ? "#c00" : "#888",
                    border: `1px solid ${testState === "ok" ? "#b7e4c7" : testState === "fail" ? "#fcc" : "#e0e0e0"}`,
                  }}>
                    {testState === "testing" ? "Testing…" : testMsg}
                  </div>
                )}
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={handleTestConn} disabled={testState === "testing" || !formConnStr.trim()} className="btn-secondary" style={{ flex: 1, justifyContent: "center", borderRadius: 2, padding: "4px 0", fontSize: 12 }}>
                    <span className="codicon codicon-plug" style={{ fontSize: 12 }} /> Test
                  </button>
                  <button onClick={handleSaveConn} disabled={!formName.trim() || !formConnStr.trim()} className="btn-primary" style={{ flex: 1, justifyContent: "center", borderRadius: 2, padding: "4px 0", fontSize: 12 }}>
                    {formMode === "edit" ? "Save" : "Add"}
                  </button>
                  <button onClick={closeForm} className="btn-secondary" style={{ justifyContent: "center", borderRadius: 2, padding: "4px 8px", fontSize: 12 }}>
                    <span className="codicon codicon-close" style={{ fontSize: 12 }} />
                  </button>
                </div>
              </div>
            )}

            {connections.length === 0 && formMode === null && (
              <div style={{ fontSize: 12, color: "#aaa" }}>No connections yet</div>
            )}
            {connections.map(c => (
              <ConnRow key={c.id} conn={c} isActive={connId === c.id} onSelect={() => setConnId(c.id)} onEdit={() => openEdit(c)} onRemove={() => onRemoveConnection(c.id)} />
            ))}
          </div>

          <div style={{ flex: 1, overflowY: "auto", borderTop: "1px solid #e0e0e0" }}>
            <div style={{ padding: "10px 12px 4px 12px" }}>
              <span className="section-label">SQL Files</span>
            </div>
            {workspaceFolders.map(wf => (
              <div key={wf.path}>
                <div
                  onClick={() => toggleFolder(wf.path)}
                  style={{ padding: "6px 12px", background: "#e8e8e8", fontSize: 11, fontWeight: 600, color: "#666", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}
                >
                  <span className={`codicon codicon-chevron-${collapsedFolders.has(wf.path) ? "right" : "down"}`} style={{ fontSize: 12, flexShrink: 0 }} />
                  <span className="codicon codicon-folder" style={{ fontSize: 12 }} />
                  {wf.name}
                </div>
                {!collapsedFolders.has(wf.path) && (
                  <div style={{ padding: "2px 0" }}>
                    {(folderFiles[wf.path] || []).length === 0 && (
                      <div style={{ padding: "6px 24px", fontSize: 12, color: "#aaa" }}>No SQL files found</div>
                    )}
                    {(folderFiles[wf.path] || []).map(path => {
                      const name = path.split(/[\\/]/).pop() || path;
                      const isActive = path === activeFilePath;
                      return (
                        <button
                          key={path}
                          onClick={() => handleOpenFile(path)}
                          style={{ width: "100%", textAlign: "left", padding: "4px 20px", background: isActive ? "#d6ebff" : "transparent", color: isActive ? "#00539c" : "#333", fontSize: 13, display: "flex", alignItems: "center", gap: 6, border: "none", cursor: "pointer" }}
                          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
                          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                        >
                          <span className="codicon codicon-database" style={{ fontSize: 14, color: isActive ? "#00539c" : "#e38100" }} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ padding: "8px 12px", borderTop: "1px solid #e0e0e0" }}>
            <span style={{ fontSize: 11, color: "#aaa" }}>Ctrl+Enter to run</span>
          </div>
        </div>
      )}

      {/* Main: editor + results */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 12px", borderBottom: "1px solid #e8e8e8", background: "#fafafa", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={handleNewSql} title="New SQL Query" className="btn-secondary" style={{ padding: "4px 8px", borderRadius: 2 }}>
              <span className="codicon codicon-new-file" style={{ fontSize: 13 }} />
              <span style={{ fontSize: 12 }}>New</span>
            </button>
            <button onClick={handleSaveSql} title="Save (Ctrl+S)" className="btn-secondary" style={{ padding: "4px 8px", borderRadius: 2 }}>
              <span className="codicon codicon-save" style={{ fontSize: 13 }} />
              <span style={{ fontSize: 12 }}>Save</span>
            </button>
          </div>

          <div style={{ height: 16, width: 1, background: "#ddd" }} />

          <select value={connId} onChange={e => setConnId(e.target.value)} style={{ width: 200 }}>
            {connections.length === 0 && <option value="">— add connection —</option>}
            {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {databases.length > 0 && (
            <select value={selectedDb} onChange={e => setSelectedDb(e.target.value)} style={{ width: 150 }} title="Select Database Context">
              {databases.map(db => <option key={db} value={db}>{db}</option>)}
            </select>
          )}

          <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
            <button onClick={() => setShowHistory(v => !v)} title="Execution History" className="btn-secondary" style={{ padding: "4px 8px", borderRadius: 2, background: showHistory ? "#eee" : "transparent" }}>
              <span className="codicon codicon-history" style={{ fontSize: 13 }} />
            </button>
            <div style={{ height: 16, width: 1, background: "#ddd", margin: "0 4px" }} />
            <button onClick={handleFormatSql} title="Format SQL (Shift+Alt+F)" className="btn-secondary" style={{ padding: "4px 8px", borderRadius: 2 }}>
              <span className="codicon codicon-json" style={{ fontSize: 13 }} />
              <span style={{ fontSize: 12 }}>Format</span>
            </button>
            <div style={{ height: 16, width: 1, background: "#ddd", margin: "0 4px" }} />
            <button onClick={handleRun} disabled={running || !sql.trim() || !connId} className="btn-primary" style={{ borderRadius: 2, padding: "4px 20px", background: defaultSafeRun ? "#28a745" : "#00539c" }}>
              <span className="codicon codicon-play" style={{ fontSize: 13 }} />
              {running ? "Running…" : defaultSafeRun ? "Run (Safe)" : "Run"}
            </button>
          </div>
        </div>

        {showHistory && history && (
          <div style={{ position: "absolute", top: 40, right: 10, width: 350, maxHeight: 400, background: "#fff", border: "1px solid #ccc", borderRadius: 4, zIndex: 100, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "#999", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between" }}>
              <span>EXECUTION HISTORY</span>
              <button onClick={() => setShowHistory(false)} style={{ color: "#999" }}><span className="codicon codicon-close" /></button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
              {history.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "#aaa", fontSize: 12 }}>No history yet</div>}
              {history.map((h, i) => (
                <div key={i} onClick={() => { setSql(h.sql); setShowHistory(false); setIsSample(false); }}
                  style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #f9f9f9" }} className="tree-item">
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#888", marginBottom: 2 }}>
                    <span>{h.connectionName}</span>
                    <span>{new Date(h.timestamp).toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: 11, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "#333" }}>{h.sql}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Monaco Editor */}
        <div style={{ position: "relative", flexShrink: 0, borderBottom: "1px solid #e8e8e8" }}>
          <div style={{ height: editorHeight }}>
            <Editor
              height="100%"
              defaultLanguage="sql"
              value={sql}
              onChange={val => {
                if (isSample && val && val !== SAMPLE_SQL) setIsSample(false);
                setSql(val || "");
              }}
              onMount={(editor, monaco) => {
                editorRef.current = editor;
                if (completionProviderRef.current) completionProviderRef.current.dispose();
                completionProviderRef.current = monaco.languages.registerCompletionItemProvider("sql", {
                  provideCompletionItems: () => ({
                    suggestions: [
                      ...schemaRef.current.tables.map(t => ({ label: t, kind: monaco.languages.CompletionItemKind.Class, insertText: t, detail: "Table" })),
                      ...schemaRef.current.columns.map(c => ({ label: c, kind: monaco.languages.CompletionItemKind.Field, insertText: c, detail: "Column" })),
                      ...SQL_SNIPPETS.map(s => ({ label: s.label, kind: monaco.languages.CompletionItemKind.Snippet, insertText: s.insertText, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: s.detail, documentation: s.documentation })),
                      ...["SELECT","FROM","WHERE","JOIN","LEFT","RIGHT","INNER","ON","GROUP BY","ORDER BY","HAVING","INSERT","UPDATE","DELETE","TRUNCATE","DROP","CREATE","ALTER","TABLE","PROCEDURE","EXEC","DECLARE","AS","INTO","VALUES","SET","AND","OR","NOT","IN","LIKE","BETWEEN","IS","NULL","EXISTS","TOP","DISTINCT","COUNT","SUM","AVG","MIN","MAX","NVARCHAR","INT","BIT","DATETIME"].map(k => ({ label: k, kind: monaco.languages.CompletionItemKind.Keyword, insertText: k })),
                    ],
                  }),
                });
                editor.onDidFocusEditorText(() => {
                  if (editor.getValue() === SAMPLE_SQL) { setSql(""); setIsSample(false); }
                });
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, handleRun);
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, handleSaveSql);
              }}
              options={{
                minimap: { enabled: false }, fontSize: 13,
                fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
                automaticLayout: true, scrollBeyondLastLine: false, wordWrap: "on",
                padding: { top: 10, bottom: 10 },
              }}
            />
          </div>
          {isResizing && <div style={{ position: "fixed", inset: 0, zIndex: 9999, cursor: "ns-resize" }} />}
          <div
            onMouseDown={startResizing}
            style={{ height: 10, cursor: "ns-resize", background: isResizing ? "#007fd4" : "transparent", position: "absolute", bottom: -5, left: 0, right: 0, zIndex: 100, transition: "background 0.1s" }}
            onMouseEnter={e => { if (!isResizing) e.currentTarget.style.background = "rgba(0,127,212,0.4)"; }}
            onMouseLeave={e => { if (!isResizing) e.currentTarget.style.background = "transparent"; }}
          />
        </div>

        {error && (
          <div style={{ padding: "6px 14px", fontSize: 12, color: "#c00", background: "#fff0f0", borderBottom: "1px solid #fcc", flexShrink: 0 }}>
            {error}
          </div>
        )}

        <div style={{ flex: 1, overflow: "auto" }}>
          {!result && !error && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#bbb", fontSize: 13 }}>
              Results will appear here
            </div>
          )}
          {result && <ResultTable result={result} />}
        </div>
      </div>
    </div>
  );
}

function ConnRow({ conn, isActive, onSelect, onEdit, onRemove }: {
  conn: DbConnection; isActive: boolean;
  onSelect: () => void; onEdit: () => void; onRemove: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 2 }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <button onClick={onSelect} style={{
        flex: 1, textAlign: "left", padding: "4px 8px", borderRadius: 2,
        background: isActive ? "#d6ebff" : hovered ? "rgba(0,0,0,0.06)" : "transparent",
        color: isActive ? "#00539c" : "#333", fontSize: 13, overflow: "hidden",
        textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6,
      }}>
        <span className="codicon codicon-server" style={{ fontSize: 14, flexShrink: 0 }} />
        {conn.name}
      </button>
      {hovered && (
        <>
          <button onClick={onEdit} title="Edit" style={{ color: "#666", padding: 2, borderRadius: 2, flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.color = "#0078d4"; e.currentTarget.style.background = "rgba(0,120,212,0.08)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#666"; e.currentTarget.style.background = "transparent"; }}>
            <span className="codicon codicon-edit" style={{ fontSize: 13 }} />
          </button>
          <button onClick={onRemove} title="Remove" style={{ color: "#aaa", padding: 2, borderRadius: 2, flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.color = "#c00"; e.currentTarget.style.background = "rgba(200,0,0,0.08)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#aaa"; e.currentTarget.style.background = "transparent"; }}>
            <span className="codicon codicon-trash" style={{ fontSize: 13 }} />
          </button>
        </>
      )}
    </div>
  );
}
