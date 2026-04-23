import { useState, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import Editor from "@monaco-editor/react";
import { ReportTab, TabView, ReportMetadata, DataSetInfo, DbConnection, QueryResult, ReportParameter, ParameterValue, DataSourceInfo, QueryParameter } from "../types";

interface Props {
  tab: ReportTab;
  connections: DbConnection[];
  activeConnectionId: string;
  ssrsUrl: string;
  ssrsUsername: string;
  ssrsPassword: string;
  onViewChange: (view: TabView) => void;
  onStatus: (left: string, right: string) => void;
}

const VIEWS: { id: TabView; label: string; icon: string }[] = [
  { id: "overview",  label: "Overview",   icon: "codicon-list-flat" },
  { id: "sqltester", label: "SQL Tester", icon: "codicon-beaker" },
  { id: "preview",   label: "Preview",    icon: "codicon-eye" },
];

export function ReportTabContent({ tab, connections, activeConnectionId, ssrsUrl, ssrsUsername, ssrsPassword, onViewChange, onStatus }: Props) {
  const [metadata, setMetadata] = useState<ReportMetadata | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDataSetName, setSelectedDataSetName] = useState<string | null>(null);

  const isServerTab = tab.source === "server";

  useEffect(() => {
    if (isServerTab) return; // server tabs have no local RDL to parse
    setMetadata(null);
    setMetaError(null);

    const ext = tab.path.split(".").pop()?.toLowerCase();
    if (ext !== "rdl" && ext !== "rdlc") {
      setMetaError("Not a report file. Currently only .rdl and .rdlc files are supported for editing/previewing.");
      return;
    }

    setLoading(true);
    invoke<ReportMetadata>("parse_rdl", { path: tab.path })
      .then(m => { setMetadata(m); setLoading(false); })
      .catch(e => { setMetaError(String(e)); setLoading(false); });
  }, [tab.path]);

  // Server tabs: only show Preview
  const visibleViews = isServerTab
    ? VIEWS.filter(v => v.id === "preview")
    : VIEWS;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "#fff" }}>

      {/* ── Toolbar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 2,
        height: 35, padding: "0 12px",
        borderBottom: "1px solid #e8e8e8", background: "#f8f8f8", flexShrink: 0,
      }}>
        {visibleViews.map(btn => {
          const isActive = tab.activeView === btn.id;
          return (
            <button
              key={btn.id}
              onClick={() => onViewChange(btn.id)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 10px", borderRadius: 3,
                background: isActive ? "#e4e6f1" : "transparent",
                color: isActive ? "#1a1a6e" : "#666",
                fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                border: "none", cursor: "pointer",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(0,0,0,0.06)"; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
            >
              <span className={`codicon ${btn.icon}`} style={{ fontSize: 13 }} />
              {btn.label}
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {/* Server tab: go straight to PreviewView */}
        {isServerTab && (
          <PreviewView tab={tab} metadata={metadata} connections={connections} activeConnectionId={activeConnectionId} ssrsUrl={ssrsUrl} ssrsUsername={ssrsUsername} ssrsPassword={ssrsPassword} onStatus={onStatus} />
        )}

        {/* Local tab: parse RDL first */}
        {!isServerTab && loading && (
          <Centered>
            <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 22, color: "#aaa" }} />
            <span style={{ fontSize: 13, color: "#aaa", marginTop: 10 }}>Loading report…</span>
          </Centered>
        )}
        {!isServerTab && metaError && (
          <Centered>
            <span className="codicon codicon-error" style={{ fontSize: 28, color: "#c00" }} />
            <span style={{ fontSize: 13, color: "#c00", marginTop: 10, maxWidth: 400, textAlign: "center", lineHeight: 1.5 }}>
              {metaError}
            </span>
          </Centered>
        )}
        {!isServerTab && !loading && !metaError && metadata && (
          <>
            {tab.activeView === "overview"  && (
              <OverviewView 
                metadata={metadata} 
                onTestDataset={(dsName) => {
                  setSelectedDataSetName(dsName);
                  onViewChange("sqltester");
                }}
              />
            )}
            {tab.activeView === "sqltester" && (
              <SqlTesterView 
                metadata={metadata} 
                connections={connections} 
                activeConnectionId={activeConnectionId} 
                onStatus={onStatus} 
                selectedDataSetName={selectedDataSetName}
                onSelectedDataSetNameChange={setSelectedDataSetName}
              />
            )}
            {tab.activeView === "preview"   && (
              <PreviewView   
                tab={tab} 
                metadata={metadata} 
                connections={connections} 
                activeConnectionId={activeConnectionId} 
                ssrsUrl={ssrsUrl} 
                ssrsUsername={ssrsUsername} 
                ssrsPassword={ssrsPassword} 
                onStatus={onStatus} 
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Centered helper ──────────────────────────────────────────────────── */

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%" }}>
      {children}
    </div>
  );
}

/* ─── Overview ─────────────────────────────────────────────────────────── */

function OverviewView({ metadata, onTestDataset }: {
  metadata: ReportMetadata;
  onTestDataset: (dsName: string) => void;
}) {
  const empty = metadata.dataSets.length === 0 && metadata.parameters.length === 0 && metadata.dataSources.length === 0;
  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 24 }}>
      {empty && (
        <div style={{ fontSize: 13, color: "#aaa" }}>No datasets or parameters found.</div>
      )}

      {metadata.dataSources.length > 0 && (
        <SectionBlock title="Data Sources" icon="codicon-database">
          {metadata.dataSources.map((ds: DataSourceInfo) => (
            <div key={ds.name} style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "8px 12px", background: "#f7f7f7",
              border: "1px solid #eee", borderRadius: 3,
            }}>
              <span className="codicon codicon-server" style={{ fontSize: 14, color: "#888", marginTop: 1, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>{ds.name}</div>
                {ds.connectionString && (
                  <div style={{ fontSize: 12, color: "#888", fontFamily: "monospace", marginTop: 2 }}>{ds.connectionString}</div>
                )}
              </div>
            </div>
          ))}
        </SectionBlock>
      )}

      {metadata.dataSets.length > 0 && (
        <SectionBlock title={`Datasets (${metadata.dataSets.length})`} icon="codicon-table">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {metadata.dataSets.map((ds: DataSetInfo) => (
              <DatasetCard
                key={ds.name}
                dataset={ds}
                onTest={() => onTestDataset(ds.name)}
              />
            ))}
          </div>
        </SectionBlock>
      )}

      {metadata.parameters.length > 0 && (
        <SectionBlock title={`Parameters (${metadata.parameters.length})`} icon="codicon-symbol-parameter">
          <div style={{ border: "1px solid #eee", borderRadius: 3, overflow: "hidden" }}>
            {metadata.parameters.map((p: ReportParameter, i: number) => (
              <div key={p.name} style={{
                display: "flex", alignItems: "center", gap: 0,
                padding: "6px 12px", fontSize: 12,
                background: i % 2 === 0 ? "#fff" : "#fafafa",
                borderBottom: i < metadata.parameters.length - 1 ? "1px solid #f0f0f0" : "none",
              }}>
                <span style={{ fontFamily: "monospace", color: "#0000cc", width: 160, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                  @{p.name}
                </span>
                <span style={{ color: "#888", width: 80, flexShrink: 0 }}>{p.dataType}</span>
                <span style={{ color: "#555", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{p.prompt}</span>
                
                <div style={{ display: "flex", gap: 6, marginLeft: 12, flexShrink: 0 }}>
                  {p.multiValue && <Badge label="Multi" color="#6b40bf" icon="codicon-layers" />}
                  {p.nullable && <Badge label="Null" color="#007acc" icon="codicon-question" />}
                  {p.allowBlank && <Badge label="Blank" color="#007acc" icon="codicon-empty-window" />}
                  {p.hidden && <Badge label="Hidden" color="#666" icon="codicon-eye-closed" />}
                </div>

                {p.defaultValue && (
                  <span style={{ fontFamily: "monospace", color: "#aaa", flexShrink: 0, marginLeft: 12 }}>
                    = {p.defaultValue}
                  </span>
                )}
                {p.defaultValueQuery && (
                  <span style={{ fontSize: 11, color: "#aaa", flexShrink: 0, marginLeft: 12, display: "flex", alignItems: "center", gap: 3 }}>
                    <span className="codicon codicon-database" style={{ fontSize: 10 }} />
                    {p.defaultValueQuery.dataSetName}
                  </span>
                )}
              </div>
            ))}
          </div>
        </SectionBlock>
      )}
    </div>
  );
}

function Badge({ label, color, icon }: { label: string; color: string; icon: string }) {
  return (
    <div style={{ 
      display: "flex", alignItems: "center", gap: 3, 
      padding: "1px 6px", borderRadius: 10, background: color + "15", 
      color: color, border: `1px solid ${color}30`, fontSize: 9, fontWeight: 600,
      textTransform: "uppercase", letterSpacing: "0.02em"
    }}>
      <span className={`codicon ${icon}`} style={{ fontSize: 9 }} />
      {label}
    </div>
  );
}

function SectionBlock({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
        <span className={`codicon ${icon}`} style={{ fontSize: 14, color: "#777" }} />
        <span className="section-label">{title}</span>
      </div>
      {children}
    </div>
  );
}

function DatasetCard({ dataset, onTest }: {
  dataset: DataSetInfo;
  onTest: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(dataset.commandText || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy!", err);
    }
  };

  return (
    <div style={{ border: "1px solid #e8e8e8", borderRadius: 3, overflow: "hidden" }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "7px 12px", background: "#f7f7f7", cursor: "pointer",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "#f0f0f0")}
        onMouseLeave={e => (e.currentTarget.style.background = "#f7f7f7")}
      >
        <span
          className={`codicon ${expanded ? "codicon-chevron-down" : "codicon-chevron-right"}`}
          style={{ fontSize: 12, color: "#777", flexShrink: 0 }}
        />
        <span style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>{dataset.name}</span>
        <span style={{ fontSize: 12, color: "#aaa" }}>({dataset.commandType})</span>
        {dataset.dataSourceName && (
          <span style={{ fontSize: 11, color: "#aaa", display: "flex", alignItems: "center", gap: 4 }}>
            <span className="codicon codicon-server" style={{ fontSize: 11 }} />
            {dataset.dataSourceName}
          </span>
        )}

        {/* Test controls */}
        <div
          style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}
          onClick={e => e.stopPropagation()}
        >
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

      {/* Body: SQL (Monaco Editor) */}
      {expanded && (
        <div style={{ borderTop: "1px solid #eee", position: "relative", height: 160 }}>
          <Editor
            height="100%"
            defaultLanguage="sql"
            value={dataset.commandText}
            theme="vs"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 12,
              fontFamily: "'Cascadia Code','Fira Code','Consolas',monospace",
              lineNumbers: "on",
              folding: true,
              wordWrap: "on",
              automaticLayout: true,
              padding: { top: 8, bottom: 8 },
              scrollbar: { vertical: "auto", horizontal: "auto" }
            }}
          />
          <button
            onClick={handleCopy}
            title="Copy SQL"
            style={{
              position: "absolute", top: 8, right: 14, zIndex: 10,
              padding: 4, background: "rgba(255,255,255,0.8)", color: copied ? "#28a745" : "#888",
              border: "1px solid #ddd", cursor: "pointer", borderRadius: 3, display: "flex", alignItems: "center",
              transition: "color 0.2s, background 0.2s, border-color 0.2s"
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "#fff";
              e.currentTarget.style.borderColor = "#bbb";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "rgba(255,255,255,0.8)";
              e.currentTarget.style.borderColor = "#ddd";
            }}
          >
            <span className={`codicon ${copied ? "codicon-check" : "codicon-copy"}`} style={{ fontSize: 14 }} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── SQL Tester ────────────────────────────────────────────────────────── */

interface ParamValue { name: string; prompt: string; dataType: string; value: string | null; nullable?: boolean; hidden?: boolean; }

function SqlTesterView({ metadata, connections, activeConnectionId, onStatus, selectedDataSetName, onSelectedDataSetNameChange }: {
  metadata: ReportMetadata;
  connections: DbConnection[];
  activeConnectionId: string;
  onStatus: (l: string, r: string) => void;
  selectedDataSetName: string | null;
  onSelectedDataSetNameChange: (dsName: string) => void;
}) {
  const datasets = metadata.dataSets.filter((d: DataSetInfo) => d.commandText?.trim());
  const [selectedDs, setSelectedDs] = useState<DataSetInfo | null>(() => {
    if (selectedDataSetName) {
      return datasets.find(d => d.name === selectedDataSetName) ?? datasets[0] ?? null;
    }
    return datasets[0] ?? null;
  });

  useEffect(() => {
    if (selectedDataSetName) {
      const ds = datasets.find(d => d.name === selectedDataSetName);
      if (ds) setSelectedDs(ds);
    }
  }, [selectedDataSetName, datasets]);
  const [connId, setConnId] = useState(activeConnectionId || connections[0]?.id || "");
  const [params, setParams] = useState<ParamValue[]>([]);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editorHeight, setEditorHeight] = useState(160);
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [sqlMode, setSqlMode] = useState<"formatted" | "raw">("formatted");

  const startResizing = (e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  };

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const container = document.getElementById("sql-tester-editor-container");
      if (container) {
        const rect = container.getBoundingClientRect();
        const newHeight = Math.max(80, Math.min(window.innerHeight - 300, e.clientY - rect.top));
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

  const displaySql = useMemo(() => {
    if (!selectedDs) return "";
    const sql = selectedDs.commandText ?? "";
    if (sqlMode === "raw") return sql;
    
    const isStoredProc = selectedDs.commandType.toLowerCase().includes("stored");
    if (params.length === 0) return sql;
    
    const boundParams = params.filter(p => sql.toLowerCase().includes("@" + p.name.toLowerCase()));
    if (boundParams.length === 0) return sql;

    if (isStoredProc) {
      const args = boundParams.map(p => {
        if (p.value === null) return `@${p.name}=NULL`;
        return `@${p.name}='${p.value.replace(/'/g, "''")}'`;
      });
      return `EXEC ${sql} ${args.join(", ")}`;
    } else {
      const declarations = boundParams.map(p => {
        const valStr = p.value === null ? "NULL" : `'${p.value.replace(/'/g, "''")}'`;
        return `DECLARE @${p.name} NVARCHAR(MAX) = ${valStr};`;
      }).join("\n");
      return declarations + "\n\n" + sql;
    }
  }, [selectedDs, params, sqlMode]);

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(displaySql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy SQL", e);
    }
  };

  useEffect(() => {
    if (selectedDs) buildParams(selectedDs);
  }, [selectedDs?.name]);

  function buildParams(ds: DataSetInfo) {
    const sql = ds.commandText ?? "";
    let relevant: ReportParameter[] = [];
    
    if (ds.queryParameters && ds.queryParameters.length > 0) {
      relevant = metadata.parameters.filter(p => 
        ds.queryParameters!.some((qp: QueryParameter) => {
          const match = qp.value.match(/Parameters!([^.]+)/i);
          const paramName = match ? match[1] : qp.name.replace('@', '');
          return paramName.toLowerCase() === p.name.toLowerCase();
        })
      );
    } else {
      relevant = metadata.parameters.filter((p: ReportParameter) =>
        sql.toLowerCase().includes("@" + p.name.toLowerCase())
      );
    }
    setParams(relevant.map(p => ({ 
      name: p.name, 
      prompt: p.prompt, 
      dataType: p.dataType, 
      value: p.defaultValue ?? (p.nullable ? null : ""),
      nullable: p.nullable,
      hidden: p.hidden
    })));
    setResult(null);
    setError(null);
  }

  async function handleRun() {
    if (!selectedDs) return;
    const conn = connections.find(c => c.id === connId);
    if (!conn) return;
    setRunning(true);
    setError(null);
    try {
      const paramMap: Record<string, string | null> = {};
      params.forEach(p => { 
        let val = p.value;
        if (val !== null && p.dataType === "Boolean") {
          if (val.toLowerCase() === "true") val = "1";
          else if (val.toLowerCase() === "false") val = "0";
        }
        paramMap[p.name] = val; 
      });
      const res = await invoke<QueryResult>("run_sql", {
        sql: selectedDs.commandText,
        connectionString: conn.connectionString,
        params: paramMap,
        isStoredProc: selectedDs.commandType.toLowerCase().includes("stored"),
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

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

      {/* Controls */}
      {sidebarVisible && (
        <div style={{
          width: 240, flexShrink: 0, borderRight: "1px solid #e8e8e8",
          background: "#f8f8f8", overflowY: "auto", padding: "12px",
          display: "flex", flexDirection: "column", gap: 12,
        }}>
          <div>
          <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 4 }}>Dataset</label>
          <select
            value={selectedDs?.name ?? ""}
            onChange={e => { onSelectedDataSetNameChange(e.target.value); }}
            disabled={datasets.length === 0}
          >
            {datasets.length === 0 && <option>—</option>}
            {datasets.map((d: DataSetInfo) => <option key={d.name} value={d.name}>{d.name}</option>)}
          </select>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 4 }}>Connection</label>
          <select value={connId} onChange={e => setConnId(e.target.value)}>
            {connections.length === 0 && <option value="">— no connections —</option>}
            {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {params.length > 0 && (
          <div>
            <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 6 }}>Parameters</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {params.map(p => (
                <div key={p.name}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <div style={{ fontSize: 12, fontFamily: "monospace", color: "#0000cc" }}>@{p.name}</div>
                    {p.hidden && <span className="codicon codicon-eye-closed" style={{ fontSize: 11, color: "#999" }} title="Hidden" />}
                  </div>
                  
                  <ParameterInput 
                    p={p as any} 
                    value={p.value} 
                    onChange={val => setParams(ps => ps.map(x => x.name === p.name ? { ...x, value: val } : x))}
                    metadata={metadata}
                    connections={connections}
                    activeConnectionId={connId}
                    allParams={Object.fromEntries(params.map(x => [x.name, x.value ?? ""]))}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleRun}
          disabled={running || !selectedDs || !connId}
          className="btn-primary"
          style={{ justifyContent: "center", borderRadius: 2, marginTop: "auto" }}
        >
          <span className="codicon codicon-play" style={{ fontSize: 13 }} />
          {running ? "Running…" : "Run"}
        </button>
      </div>
      )}

      {/* SQL + Results */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ 
          display: "flex", alignItems: "center", height: 32, padding: "0 12px", 
          borderBottom: "1px solid #e8e8e8", background: "#fafafa" 
        }}>
          <button 
            onClick={() => setSidebarVisible(!sidebarVisible)}
            style={{ 
              background: "none", border: "none", cursor: "pointer", color: "#666",
              display: "flex", alignItems: "center", gap: 4, fontSize: 11
            }}
          >
            <span className={`codicon ${sidebarVisible ? "codicon-layout-sidebar-left" : "codicon-layout-sidebar-left-off"}`} />
            {sidebarVisible ? "Hide Params" : "Show Params"}
          </button>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", background: "#eee", padding: 2, borderRadius: 4 }}>
            <button
              onClick={() => setSqlMode("formatted")}
              style={{
                padding: "2px 8px", fontSize: 10, borderRadius: 3, border: "none", cursor: "pointer",
                background: sqlMode === "formatted" ? "#fff" : "transparent",
                color: sqlMode === "formatted" ? "#333" : "#666",
                fontWeight: sqlMode === "formatted" ? 600 : 400,
                boxShadow: sqlMode === "formatted" ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
              }}
            >
              Formatted
            </button>
            <button
              onClick={() => setSqlMode("raw")}
              style={{
                padding: "2px 8px", fontSize: 10, borderRadius: 3, border: "none", cursor: "pointer",
                background: sqlMode === "raw" ? "#fff" : "transparent",
                color: sqlMode === "raw" ? "#333" : "#666",
                fontWeight: sqlMode === "raw" ? 600 : 400,
                boxShadow: sqlMode === "raw" ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
              }}
            >
              Raw
            </button>
          </div>
        </div>
        {selectedDs && (
          <div id="sql-tester-editor-container" style={{ position: "relative", flexShrink: 0, borderBottom: "1px solid #e8e8e8" }}>
            <div style={{ height: editorHeight, borderBottom: "1px solid #e8e8e8" }}>
              <Editor
                height="100%"
                defaultLanguage="sql"
                value={displaySql}
                theme="vs"
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 12,
                  fontFamily: "'Cascadia Code','Fira Code','Consolas',monospace",
                  lineNumbers: "on",
                  folding: true,
                  wordWrap: "on",
                  automaticLayout: true,
                  padding: { top: 8, bottom: 8 }
                }}
              />
            </div>
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
            <button
              onClick={handleCopySql}
              title="Copy SQL"
              style={{
                position: "absolute", top: 8, right: 14,
                padding: 4, background: "transparent", color: copied ? "#28a745" : "#888",
                border: "none", cursor: "pointer", borderRadius: 3, display: "flex", alignItems: "center",
                transition: "color 0.2s, background 0.2s"
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.06)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <span className={`codicon ${copied ? "codicon-check" : "codicon-copy"}`} style={{ fontSize: 14 }} />
            </button>
          </div>
        )}

        {error && (
          <div style={{
            padding: "6px 14px", fontSize: 12, color: "#c00",
            background: "#fff0f0", borderBottom: "1px solid #fcc", flexShrink: 0,
          }}>
            {error}
          </div>
        )}

        <div style={{ flex: 1, overflow: "auto" }}>
          {!result && !error && (
            <Centered>
              <span style={{ fontSize: 13, color: "#bbb" }}>Select a dataset and click Run</span>
            </Centered>
          )}
          {result && <ResultTable result={result} />}
        </div>
      </div>
    </div>
  );
}

/* ─── Preview ───────────────────────────────────────────────────────────── */

const EXPORT_FORMATS = [
  { id: "WORDOPENXML",  label: "Word",        icon: "codicon-file-code",  color: "#2b579a" },
  { id: "EXCELOPENXML", label: "Excel",       icon: "codicon-table",      color: "#217346" },
  { id: "PPTX",         label: "PowerPoint",  icon: "codicon-file-media", color: "#d24726" },
  { id: "PDF",          label: "PDF",         icon: "codicon-file-pdf",   color: "#e3001b" },
  { id: "CSV",          label: "CSV",         icon: "codicon-symbol-array", color: "#555" },
] as const;

interface UploadedReport {
  reportId: string;
  reportPath: string;
  previewUrl: string;
}

function ParameterInput({ 
  p, 
  value, 
  onChange, 
  metadata,
  connections,
  activeConnectionId,
  allParams,
}: { 
  p: ReportParameter; 
  value: string | null; 
  onChange: (val: string | null) => void;
  metadata: ReportMetadata | null;
  connections: DbConnection[];
  activeConnectionId: string;
  allParams: Record<string, string | null>;
}) {
  const [loading, setLoading] = useState(false);
  const [dynamicValues, setDynamicValues] = useState<ParameterValue[]>([]);

  const isNull = value === null;
  const ref = p.availableValues?.dataSetReference;
  const ds = ref && metadata ? metadata.dataSets.find((d: DataSetInfo) => d.name.toLowerCase() === ref.dataSetName.toLowerCase()) : null;
  
  // Extract only the params that this dataset's query actually uses
  const relevantParams: Record<string, string | null> = {};
  if (ds) {
    if (ds.queryParameters && ds.queryParameters.length > 0) {
      // Use exact mapping from RDL
      ds.queryParameters.forEach((qp: QueryParameter) => {
        // qp.value is like "=Parameters!ReportParamName.Value"
        const match = qp.value.match(/Parameters!([^.]+)/i);
        const paramName = match ? match[1] : qp.name.replace('@', '');
        
        // Find corresponding value in allParams (case insensitive)
        const allParamsKey = Object.keys(allParams).find(k => k.toLowerCase() === paramName.toLowerCase());
        if (allParamsKey) {
          let val = allParams[allParamsKey];
          if (val) {
            if (val.toLowerCase() === "true") val = "1";
            else if (val.toLowerCase() === "false") val = "0";
          }
          relevantParams[qp.name.replace('@', '')] = val;
        }
      });
    } else if (ds.commandText) {
      // Fallback
      const sqlLower = ds.commandText.toLowerCase();
      for (const key of Object.keys(allParams)) {
        if (sqlLower.includes(`@${key.toLowerCase()}`)) {
          let val = allParams[key];
          if (val) {
            if (val.toLowerCase() === "true") val = "1";
            else if (val.toLowerCase() === "false") val = "0";
          }
          relevantParams[key] = val;
        }
      }
    }
  }
  const relevantParamsKey = JSON.stringify(relevantParams);

  useEffect(() => {
    if (ref && ds && activeConnectionId) {
      const conn = connections.find(c => c.id === activeConnectionId);
      
      if (conn) {
        setLoading(true);
        invoke<QueryResult>("run_sql", {
          sql: ds.commandText,
          connectionString: conn.connectionString,
          params: relevantParams,
          isStoredProc: ds.commandType.toLowerCase().includes("stored"),
        }).then(res => {
          const getCaseInsensitive = (obj: any, key: string) => {
            if (!key) return undefined;
            const k = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
            return k ? obj[k] : undefined;
          };
          const list = res.rows.map(row => {
            const lbl = getCaseInsensitive(row, ref.labelField) ?? getCaseInsensitive(row, ref.valueField) ?? "";
            const val = getCaseInsensitive(row, ref.valueField) ?? "";
            return { label: String(lbl), value: String(val) };
          });
          setDynamicValues(list);
        }).catch(err => {
          console.error("Failed to fetch dynamic values for parameter", p.name, err);
          setDynamicValues([]);
        }).finally(() => setLoading(false));
      }
    }
  }, [ref?.dataSetName, activeConnectionId, relevantParamsKey]);

  const hasAvailable = p.availableValues && (p.availableValues.staticValues.length > 0 || p.availableValues.dataSetReference);
  const options = (p.availableValues?.staticValues && p.availableValues.staticValues.length > 0) 
    ? p.availableValues.staticValues 
    : dynamicValues;

  const renderInput = () => {
    if (hasAvailable) {
      return (
        <div style={{ position: "relative" }}>
          <select 
            value={value ?? ""} 
            onChange={e => onChange(e.target.value === "[NULL]" ? null : e.target.value)}
            disabled={loading || isNull}
            style={{ width: "100%", fontSize: 12 }}
          >
            {loading && <option>Loading...</option>}
            {!loading && options.length === 0 && !p.nullable && <option>No values found</option>}
            {options.map((opt: ParameterValue, i: number) => (
              <option key={i} value={opt.value}>{opt.label || opt.value}</option>
            ))}
          </select>
          {loading && <span className="codicon codicon-loading codicon-modifier-spin" style={{ position: "absolute", right: 24, top: 6, fontSize: 12, color: "#aaa" }} />}
        </div>
      );
    }

    if (p.dataType === "Boolean") {
      return (
        <div 
          style={{ 
            display: "flex", alignItems: "center", gap: 8, 
            padding: "4px 8px", background: isNull ? "#f5f5f5" : "#eee", borderRadius: 4,
            cursor: isNull ? "default" : "pointer", width: "fit-content",
            opacity: isNull ? 0.6 : 1
          }}
          onClick={() => {
            if (isNull) return;
            const isTrue = (value || "").toLowerCase() === "true" || value === "1";
            onChange(isTrue ? "False" : "True");
          }}
        >
          <span className={`codicon ${(value || "").toLowerCase() === "true" || value === "1" ? "codicon-check" : "codicon-chrome-close"}`} 
                style={{ fontSize: 14, color: ((value || "").toLowerCase() === "true" || value === "1") ? "#28a745" : "#dc3545" }} />
          <span style={{ fontSize: 12, fontWeight: 500 }}>{((value || "").toLowerCase() === "true" || value === "1") ? "True" : "False"}</span>
        </div>
      );
    }

    return (
      <input
        type={p.dataType === "Integer" || p.dataType === "Float" ? "number" : "text"}
        value={value ?? ""}
        placeholder={isNull ? "NULL" : p.dataType}
        disabled={isNull}
        onChange={e => onChange(e.target.value)}
        style={{ width: "100%", fontSize: 12, opacity: isNull ? 0.6 : 1 }}
      />
    );
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1 }}>{renderInput()}</div>
      {p.nullable && (
        <label style={{ 
          display: "flex", alignItems: "center", gap: 4, fontSize: 11, 
          color: isNull ? "#007fd4" : "#888", cursor: "pointer", whiteSpace: "nowrap",
          userSelect: "none"
        }}>
          <input 
            type="checkbox" 
            checked={isNull} 
            onChange={e => onChange(e.target.checked ? null : (p.defaultValue ?? ""))}
            style={{ margin: 0, cursor: "pointer" }}
          />
          Null
        </label>
      )}
    </div>
  );
}

function PreviewView({ tab, metadata, ssrsUrl, ssrsUsername, ssrsPassword, connections, activeConnectionId, onStatus }: {
  tab: ReportTab;
  metadata: ReportMetadata | null;
  connections: DbConnection[];
  activeConnectionId: string;
  ssrsUrl: string;
  ssrsUsername: string;
  ssrsPassword: string;
  onStatus: (l: string, r: string) => void;
}) {
  const [uploaded, setUploaded] = useState<UploadedReport | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const tempReportId = useRef<string | null>(null);

  // Parameter state
  const [params, setParams] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (metadata?.parameters) {
      const initial: Record<string, string | null> = {};
      metadata.parameters.forEach((p: ReportParameter) => {
        initial[p.name] = p.defaultValue ?? (p.nullable ? null : "");
      });
      setParams(initial);
    }
  }, [metadata]);
  useEffect(() => {
    return () => {
      if (tempReportId.current && ssrsUrl) {
        invoke("ssrs_delete_report", {
          url: ssrsUrl, username: ssrsUsername, password: ssrsPassword,
          reportId: tempReportId.current,
        }).catch(() => {});
      }
    };
  }, []);
  async function ensureUploaded(): Promise<UploadedReport | null> {
    if (uploaded) return uploaded;
    
    // CRITICAL FIX: If we have a server path, NEVER upload. Just use it.
    if (tab.serverPath) {
      setError(null);
      const result = { reportId: "", reportPath: tab.serverPath, previewUrl: "" };
      setUploaded(result);
      return result;
    }

    if (!ssrsUrl) {
      setError("No SSRS server configured. Go to the Server panel and connect first.");
      return null;
    }
    setError(null);
    setUploading(true);
    try {
      const res = await invoke<{ reportId: string; reportPath: string; previewUrl: string }>("ssrs_upload_temp_report", {
        url: ssrsUrl, username: ssrsUsername, password: ssrsPassword,
        rdlPath: tab.path,
      });
      tempReportId.current = res.reportId;
      const result = { reportId: res.reportId, reportPath: res.reportPath, previewUrl: res.previewUrl };
      setUploaded(result);
      return result;
    } catch (e: any) {
      setError(String(e));
      onStatus("", "Error");
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function handleOpenBrowser() {
    const report = await ensureUploaded();
    if (!report) return;
    try {
      // Omit empty parameters to let SSRS use default values, 
      // but explicitly handle NULL for nullable parameters.
      const processedParams: Record<string, string | null> = {};
      Object.keys(params).forEach(key => {
        const val = params[key];
        
        if (val === null) {
          processedParams[key] = null;
        } else if (val.trim() !== "") {
          processedParams[key] = val;
        }
      });

      // Refresh URL with current params
      const freshUrl = await invoke<string>("ssrs_preview_url", {
        url: ssrsUrl,
        reportPath: report.reportPath,
        params: processedParams
      });
      console.log("[SSRS PREVIEW] Opening URL:", freshUrl);
      await invoke("ssrs_open_browser", { previewUrl: freshUrl });
      onStatus("SSRS", tab.title);
    } catch (e: any) {
      setError(String(e));
    }
  }

  async function handleExport(formatId: string, label: string) {
    const report = await ensureUploaded();
    if (!report) return;
    setExporting(formatId);
    setError(null);
    try {
      await invoke("ssrs_export", {
        url: ssrsUrl, username: ssrsUsername, password: ssrsPassword,
        reportPath: report.reportPath, format: formatId,
        params
      });
      onStatus("SSRS", `${label} exported`);
    } catch (e: any) {
      setError(String(e));
      onStatus("", "Error");
    } finally {
      setExporting(null);
    }
  }

  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);

  // Auto-resize on metadata change
  useEffect(() => {
    if (metadata?.parameters && metadata.parameters.length > 0) {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      let maxTextWidth = 0;
      
      if (context) {
        // Match the label style: 13px, Semi-Bold (600)
        context.font = "600 13px Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif";
        metadata.parameters.forEach(p => {
          const text = p.prompt || p.name;
          const width = context.measureText(text).width;
          if (width > maxTextWidth) maxTextWidth = width;
        });
      } else {
        // Fallback to heuristic
        metadata.parameters.forEach(p => {
          const text = p.prompt || p.name;
          if (text.length * 8 > maxTextWidth) maxTextWidth = text.length * 8;
        });
      }

      // 12px padding * 2 (container) + 12px padding * 2 (card) + buffer
      const idealWidth = Math.min(Math.max(280, maxTextWidth + 64), 800);
      setSidebarWidth(idealWidth);
    }
  }, [metadata]);

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const stopResizing = () => setIsResizing(false);

  const resize = (e: MouseEvent) => {
    if (isResizing) {
      const newWidth = e.clientX;
      if (newWidth > 200 && newWidth < 1200) {
        setSidebarWidth(newWidth);
      }
    }
  };

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
    }
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [isResizing]);

  const ssrsConfigured = !!ssrsUrl;
  const busy = uploading || !!exporting;
  const hasParams = metadata && metadata.parameters.length > 0;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      
      {/* Parameters Sidebar */}
      {hasParams && (
        <>
          <div style={{
            width: sidebarWidth, flexShrink: 0, borderRight: "1px solid #e8e8e8",
            background: "#f0f2f5", overflowY: "auto", padding: "16px 12px",
            display: "flex", flexDirection: "column", gap: 12,
            position: "relative",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, padding: "0 4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ 
                  width: 24, height: 24, borderRadius: 4, background: "#007fd4", 
                  display: "flex", alignItems: "center", justifyContent: "center" 
                }}>
                  <span className="codicon codicon-symbol-parameter" style={{ fontSize: 13, color: "#fff" }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#444", textTransform: "uppercase", letterSpacing: "0.05em" }}>Parameters</span>
              </div>
              
              <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", userSelect: "none" }}>
                <input 
                  type="checkbox" 
                  checked={showMetadata} 
                  onChange={e => setShowMetadata(e.target.checked)}
                  style={{ width: 13, height: 13, margin: 0 }}
                />
                <span style={{ fontSize: 10, color: "#666", fontWeight: 500 }}>Technical Info</span>
              </label>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {metadata.parameters.map((p: ReportParameter) => (
                <div key={p.name} style={{
                  background: "#fff",
                  border: "1px solid #e0e0e0",
                  borderRadius: 6,
                  padding: "12px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
                  transition: "transform 0.1s, box-shadow 0.1s, border-color 0.1s",
                  cursor: "default",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = "#007fd4";
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = "#e0e0e0";
                  e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.02)";
                }}
                >
                  <label style={{ 
                    display: "block", fontSize: 13, color: "#1a1a1a", 
                    marginBottom: 8, fontWeight: 600, lineHeight: 1.4 
                  }}>
                    {p.prompt || p.name}
                  </label>

                  <ParameterInput 
                    p={p} 
                    value={params[p.name] as any} 
                    onChange={val => setParams(prev => ({ ...prev, [p.name]: val }))}
                    metadata={metadata}
                    connections={connections}
                    activeConnectionId={activeConnectionId}
                    allParams={params}
                  />

                  {showMetadata && (
                    <div style={{ 
                      marginTop: 10, display: "flex", alignItems: "center", gap: 6,
                      paddingTop: 8, borderTop: "1px solid #f5f5f5"
                    }}>
                      <span style={{ 
                        fontSize: 10, color: "#007fd4", fontFamily: "monospace", 
                        background: "#eef7ff", padding: "1px 4px", borderRadius: 2
                      }}>
                        @{p.name}
                      </span>
                      <span style={{ fontSize: 10, color: "#888", fontWeight: 500 }}>{p.dataType}</span>
                      {p.nullable && <span style={{ fontSize: 10, color: "#999", fontStyle: "italic" }}>· Nullable</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          {/* Resizer Handle */}
          <div
            onMouseDown={startResizing}
            style={{
              width: 4, cursor: "col-resize", background: isResizing ? "#007fd4" : "transparent",
              transition: "background 0.2s", zIndex: 10, marginLeft: -2,
              flexShrink: 0,
            }}
            onMouseEnter={e => !isResizing && (e.currentTarget.style.background = "rgba(0,0,0,0.1)")}
            onMouseLeave={e => !isResizing && (e.currentTarget.style.background = "transparent")}
          />
        </>
      )}

      <div style={{ flex: 1, overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 32, padding: 40, maxWidth: 520 }}>

          {/* Title */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#444" }}>{tab.title}</div>
            <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>Configure parameters and choose an action</div>
          </div>

          {!ssrsConfigured && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", background: "#fff8e1", border: "1px solid #ffe082", borderRadius: 4, fontSize: 12, color: "#7a5200" }}>
              <span className="codicon codicon-warning" style={{ fontSize: 14 }} />
              No SSRS server configured — go to the Server panel first
            </div>
          )}

          {error && (
            <div style={{ padding: "8px 14px", background: "#fff0f0", border: "1px solid #fcc", borderRadius: 4, fontSize: 12, color: "#c00", maxWidth: 480, wordBreak: "break-word" }}>
              {error}
            </div>
          )}

          {uploading && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#888" }}>
              <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 16 }} />
              {tab.source === "local" ? "Uploading to SSRS…" : "Connecting…"}
            </div>
          )}

          {/* Open in browser */}
          <button
            onClick={handleOpenBrowser}
            disabled={busy || !ssrsConfigured}
            className="btn-primary"
            style={{ padding: "8px 24px", fontSize: 13, borderRadius: 4, gap: 8 }}
          >
            <span className="codicon codicon-link-external" style={{ fontSize: 14 }} />
            Open in Browser
          </button>

          {/* Export formats */}
          <div style={{ width: "100%" }}>
            <div style={{ fontSize: 11, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, textAlign: "center" }}>Export</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {EXPORT_FORMATS.map(fmt => {
                const isExporting = exporting === fmt.id;
                return (
                  <button
                    key={fmt.id}
                    onClick={() => handleExport(fmt.id, fmt.label)}
                    disabled={busy || !ssrsConfigured}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      gap: 6, padding: "14px 8px",
                      border: "1px solid #e0e0e0", borderRadius: 6,
                      background: busy && !isExporting ? "#fafafa" : "#fff",
                      cursor: busy || !ssrsConfigured ? "default" : "pointer",
                      opacity: busy && !isExporting ? 0.5 : 1,
                      transition: "box-shadow 0.15s, border-color 0.15s",
                    }}
                    onMouseEnter={e => { if (!busy && ssrsConfigured) { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.10)"; e.currentTarget.style.borderColor = "#bbb"; } }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "#e0e0e0"; }}
                  >
                    <span
                      className={`codicon ${isExporting ? "codicon-loading codicon-modifier-spin" : fmt.icon}`}
                      style={{ fontSize: 22, color: isExporting ? "#aaa" : fmt.color }}
                    />
                    <span style={{ fontSize: 12, color: "#555", fontWeight: 500 }}>
                      {isExporting ? "Exporting…" : fmt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}


/* ─── Result Table ──────────────────────────────────────────────────────── */

function ResultTable({ result }: { result: QueryResult }) {
  if (result.rows.length === 0) {
    return (
      <Centered>
        <span style={{ fontSize: 13, color: "#aaa" }}>0 rows returned</span>
      </Centered>
    );
  }
  return (
    <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", tableLayout: "auto" }}>
      <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
        <tr style={{ background: "#f3f3f3" }}>
          {result.columns.map(c => (
            <th key={c} style={{
              padding: "5px 12px", textAlign: "left",
              fontWeight: 600, color: "#555", whiteSpace: "nowrap",
              borderBottom: "2px solid #e0e0e0", borderRight: "1px solid #eee",
            }}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {result.rows.map((_row, i) => (
          <tr
            key={i}
            style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#eef5ff")}
            onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "#fafafa")}
          >
            {result.columns.map(c => (
              <td key={c} style={{
                padding: "4px 12px", whiteSpace: "nowrap",
                borderBottom: "1px solid #f0f0f0", borderRight: "1px solid #f5f5f5",
                color: "#333",
              }}>
                {String(result.rows[i][c] ?? "")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
