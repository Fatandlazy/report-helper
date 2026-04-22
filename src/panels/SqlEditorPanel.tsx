import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import Editor from "@monaco-editor/react";
import { DbConnection, QueryResult } from "../types";

interface Props {
  connections: DbConnection[];
  onAddConnection: (conn: DbConnection) => void;
  onRemoveConnection: (id: string) => void;
  onUpdateConnection: (conn: DbConnection) => void;
  onStatus: (left: string, right: string) => void;
  sidebarVisible: boolean;
}

const SAMPLE_SQL = `SELECT
    DB_NAME()        AS current_database,
    SUSER_SNAME()    AS current_login,
    @@VERSION        AS sql_server_version,
    GETDATE()        AS server_time;`;

type FormMode = "add" | "edit" | null;
type TestState = "idle" | "testing" | "ok" | "fail";

export function SqlEditorPanel({ connections, onAddConnection, onRemoveConnection, onUpdateConnection, onStatus, sidebarVisible }: Props) {
  const [connId, setConnId] = useState(connections[0]?.id ?? "");
  const [sql, setSql] = useState(SAMPLE_SQL);
  const [isSample, setIsSample] = useState(true);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorHeight, setEditorHeight] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const [schema, setSchema] = useState<{ tables: string[], columns: string[] }>({ tables: [], columns: [] });
  const schemaRef = useRef(schema);
  const completionProviderRef = useRef<any>(null);

  useEffect(() => {
    schemaRef.current = schema;
  }, [schema]);

  useEffect(() => {
    const conn = connections.find(c => c.id === connId);
    if (!conn) return;

    const fetchSchema = async () => {
      try {
        const tablesRes = await invoke<QueryResult>("run_sql", {
          sql: "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'",
          connectionString: conn.connectionString,
          params: {},
          isStoredProc: false,
        });
        const tableNames = tablesRes.rows.map(r => String(Object.values(r)[0]));
        
        const colsRes = await invoke<QueryResult>("run_sql", {
          sql: "SELECT DISTINCT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS",
          connectionString: conn.connectionString,
          params: {},
          isStoredProc: false,
        });
        const colNames = colsRes.rows.map(r => String(Object.values(r)[0]));
        
        setSchema({ tables: tableNames, columns: colNames });
      } catch (e) {
        console.error("Failed to fetch schema", e);
      }
    };
    fetchSchema();
  }, [connId, connections]);

  const startResizing = (e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  };

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const container = document.getElementById("sql-editor-container");
      if (container) {
        const rect = container.getBoundingClientRect();
        const newHeight = Math.max(100, Math.min(window.innerHeight - 300, e.clientY - rect.top));
        setEditorHeight(newHeight);
      }
    };
    const handleMouseUp = () => setIsResizing(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // Connection form
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [formId, setFormId] = useState("");
  const [formName, setFormName] = useState("");
  const [formConnStr, setFormConnStr] = useState("");
  const [testState, setTestState] = useState<TestState>("idle");
  const [testMsg, setTestMsg] = useState("");

  async function handleRun() {
    if (!sql.trim()) return;
    const conn = connections.find(c => c.id === connId);
    if (!conn) return;
    setRunning(true);
    setError(null);
    try {
      const res = await invoke<QueryResult>("run_sql", {
        sql: sql.trim(),
        connectionString: conn.connectionString,
        params: {},
        isStoredProc: false,
      });
      setResult(res);
      onStatus(conn.name, `${res.rowCount} rows · ${res.elapsedMs}ms`);
    } catch (e: any) {
      setError(String(e));
      onStatus("", "Error");
    } finally {
      setRunning(false);
    }
  }

  function openAdd() {
    setFormMode("add");
    setFormId("");
    setFormName("");
    setFormConnStr("");
    setTestState("idle");
    setTestMsg("");
  }

  function openEdit(c: DbConnection) {
    setFormMode("edit");
    setFormId(c.id);
    setFormName(c.name);
    setFormConnStr(c.connectionString);
    setTestState("idle");
    setTestMsg("");
  }

  function closeForm() {
    setFormMode(null);
    setTestState("idle");
    setTestMsg("");
  }

  async function handleTestConn() {
    if (!formConnStr.trim()) return;
    setTestState("testing");
    setTestMsg("");
    try {
      await invoke<QueryResult>("run_sql", {
        sql: "SELECT 1 AS ok",
        connectionString: formConnStr.trim(),
        params: {},
        isStoredProc: false,
      });
      setTestState("ok");
      setTestMsg("Connection successful");
    } catch (e: any) {
      setTestState("fail");
      setTestMsg(String(e));
    }
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

      {/* ── Side: Connections ── */}
      {sidebarVisible && (
        <div style={{ width: 260, background: "#f3f3f3", borderRight: "1px solid #e0e0e0", flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #e0e0e0", overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span className="section-label">Connections</span>
            {formMode === null && (
              <button
                onClick={openAdd}
                title="Add connection"
                style={{ color: "#666", padding: 2, borderRadius: 2 }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,0,0,0.08)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span className="codicon codicon-add" style={{ fontSize: 15 }} />
              </button>
            )}
          </div>

          {/* Add / Edit form */}
          {formMode !== null && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 3 }}>Name</label>
                <input
                  type="text"
                  placeholder="e.g. Production DB"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  autoFocus
                />
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

              {/* Test result */}
              {testState !== "idle" && (
                <div style={{
                  fontSize: 11, padding: "4px 8px", borderRadius: 2,
                  background: testState === "ok" ? "#f0fff4" : testState === "fail" ? "#fff0f0" : "#f5f5f5",
                  color: testState === "ok" ? "#1a7f37" : testState === "fail" ? "#c00" : "#888",
                  border: `1px solid ${testState === "ok" ? "#b7e4c7" : testState === "fail" ? "#fcc" : "#e0e0e0"}`,
                  wordBreak: "break-word",
                }}>
                  {testState === "testing" ? "Testing…" : testMsg}
                </div>
              )}

              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={handleTestConn}
                  disabled={testState === "testing" || !formConnStr.trim()}
                  className="btn-secondary"
                  style={{ flex: 1, justifyContent: "center", borderRadius: 2, padding: "4px 0", fontSize: 12 }}
                >
                  <span className="codicon codicon-plug" style={{ fontSize: 12 }} />
                  Test
                </button>
                <button
                  onClick={handleSaveConn}
                  disabled={!formName.trim() || !formConnStr.trim()}
                  className="btn-primary"
                  style={{ flex: 1, justifyContent: "center", borderRadius: 2, padding: "4px 0", fontSize: 12 }}
                >
                  {formMode === "edit" ? "Save" : "Add"}
                </button>
                <button
                  onClick={closeForm}
                  className="btn-secondary"
                  style={{ justifyContent: "center", borderRadius: 2, padding: "4px 8px", fontSize: 12 }}
                >
                  <span className="codicon codicon-close" style={{ fontSize: 12 }} />
                </button>
              </div>
            </div>
          )}

          {connections.length === 0 && formMode === null && (
            <div style={{ fontSize: 12, color: "#aaa" }}>No connections yet</div>
          )}

          {connections.map(c => (
            <ConnRow
              key={c.id}
              conn={c}
              isActive={connId === c.id}
              onSelect={() => setConnId(c.id)}
              onEdit={() => openEdit(c)}
              onRemove={() => onRemoveConnection(c.id)}
            />
          ))}
        </div>

        <div style={{ padding: "8px 12px" }}>
          <span style={{ fontSize: 11, color: "#aaa" }}>Ctrl+Enter to run</span>
        </div>
      </div>
      )}

      {/* ── Main: SQL editor + results ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Toolbar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "6px 12px", borderBottom: "1px solid #e8e8e8", background: "#fafafa", flexShrink: 0,
        }}>
          <select
            value={connId}
            onChange={e => setConnId(e.target.value)}
            style={{ width: 200 }}
          >
            {connections.length === 0 && <option value="">— add a connection first —</option>}
            {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button
            onClick={handleRun}
            disabled={running || !sql.trim() || !connId}
            className="btn-primary"
            style={{ borderRadius: 2, padding: "4px 12px" }}
          >
            <span className="codicon codicon-play" style={{ fontSize: 13 }} />
            {running ? "Running…" : "Run"}
          </button>
        </div>

        {/* SQL Monaco Editor */}
        <div id="sql-editor-container" style={{ position: "relative", flex: `0 0 ${editorHeight}px`, borderBottom: "1px solid #e8e8e8" }}>
          <Editor
            height="100%"
            defaultLanguage="sql"
            value={sql}
            onChange={val => {
              if (isSample && val && val !== SAMPLE_SQL) {
                setIsSample(false);
              }
              setSql(val || "");
            }}
            onMount={(editor, monaco) => {
              // Dispose previous provider if exists
              if (completionProviderRef.current) {
                completionProviderRef.current.dispose();
              }

              // Register SQL suggestions
              completionProviderRef.current = monaco.languages.registerCompletionItemProvider("sql", {
                provideCompletionItems: (_model: any, _position: any) => {
                  const suggestions: any[] = [
                    ...schemaRef.current.tables.map(t => ({
                      label: t,
                      kind: monaco.languages.CompletionItemKind.Class,
                      insertText: t,
                      detail: "Table"
                    })),
                    ...schemaRef.current.columns.map(c => ({
                      label: c,
                      kind: monaco.languages.CompletionItemKind.Field,
                      insertText: c,
                      detail: "Column"
                    })),
                    // Basic keywords
                    ...["SELECT", "FROM", "WHERE", "JOIN", "LEFT", "RIGHT", "INNER", "ON", "GROUP BY", "ORDER BY", "HAVING", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "DROP", "CREATE", "ALTER", "TABLE", "DATABASE", "PROCEDURE", "EXEC", "DECLARE", "AS", "INTO", "VALUES", "SET", "AND", "OR", "NOT", "IN", "LIKE", "BETWEEN", "IS", "NULL", "EXISTS", "TOP", "DISTINCT", "COUNT", "SUM", "AVG", "MIN", "MAX", "NVARCHAR", "INT", "BIT", "DATETIME", "MONEY", "DECIMAL"].map(k => ({
                      label: k,
                      kind: monaco.languages.CompletionItemKind.Keyword,
                      insertText: k,
                    }))
                  ];
                  return { suggestions };
                }
              });

              editor.onDidFocusEditorText(() => {
                if (isSample) {
                  setSql("");
                  setIsSample(false);
                }
              });
              editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
                handleRun();
              });
            }}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
              automaticLayout: true,
              scrollBeyondLastLine: false,
              wordWrap: "on",
              padding: { top: 10, bottom: 10 }
            }}
          />
          {/* Resizer Handle */}
          <div 
            onMouseDown={startResizing}
            style={{
              height: 4, cursor: "ns-resize", 
              background: isResizing ? "#007fd4" : "transparent",
              position: "absolute", bottom: -2, left: 0, right: 0, zIndex: 10,
              transition: "background 0.1s"
            }}
            onMouseEnter={e => { if (!isResizing) e.currentTarget.style.background = "rgba(0,127,212,0.3)"; }}
            onMouseLeave={e => { if (!isResizing) e.currentTarget.style.background = "transparent"; }}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: "6px 14px", fontSize: 12, color: "#c00",
            background: "#fff0f0", borderBottom: "1px solid #fcc", flexShrink: 0,
          }}>
            {error}
          </div>
        )}

        {/* Results */}
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
  conn: DbConnection;
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 2 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={onSelect}
        style={{
          flex: 1, textAlign: "left", padding: "4px 8px", borderRadius: 2,
          background: isActive ? "#d6ebff" : hovered ? "rgba(0,0,0,0.06)" : "transparent",
          color: isActive ? "#00539c" : "#333",
          fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          display: "flex", alignItems: "center", gap: 6,
        }}
      >
        <span className="codicon codicon-server" style={{ fontSize: 14, flexShrink: 0 }} />
        {conn.name}
      </button>
      {hovered && (
        <>
          <button
            onClick={onEdit}
            title="Edit"
            style={{ color: "#666", padding: 2, borderRadius: 2, flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.color = "#0078d4"; e.currentTarget.style.background = "rgba(0,120,212,0.08)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#666"; e.currentTarget.style.background = "transparent"; }}
          >
            <span className="codicon codicon-edit" style={{ fontSize: 13 }} />
          </button>
          <button
            onClick={onRemove}
            title="Remove"
            style={{ color: "#aaa", padding: 2, borderRadius: 2, flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.color = "#c00"; e.currentTarget.style.background = "rgba(200,0,0,0.08)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#aaa"; e.currentTarget.style.background = "transparent"; }}
          >
            <span className="codicon codicon-trash" style={{ fontSize: 13 }} />
          </button>
        </>
      )}
    </div>
  );
}

function ResultTable({ result }: { result: QueryResult }) {
  if (result.rows.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#aaa", fontSize: 13 }}>
        0 rows returned
      </div>
    );
  }
  return (
    <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", tableLayout: "auto" }}>
      <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
        <tr style={{ background: "#f3f3f3" }}>
          {result.columns.map(c => (
            <th key={c} style={{
              padding: "5px 12px", textAlign: "left", fontWeight: 600,
              color: "#555", whiteSpace: "nowrap",
              borderBottom: "1px solid #e0e0e0", borderRight: "1px solid #eee",
            }}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {result.rows.map((row, i) => (
          <tr
            key={i}
            style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#f0f8ff")}
            onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "#fafafa")}
          >
            {result.columns.map(c => (
              <td key={c} style={{
                padding: "4px 12px", whiteSpace: "nowrap",
                borderBottom: "1px solid #f0f0f0", borderRight: "1px solid #f5f5f5",
                color: "#333",
              }}>
                {String(row[c] ?? "")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
