import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ReportTab, ReportMetadata, DbConnection, ReportParameter } from "../../types";
import { ParameterInput } from "./components/ParameterInput";

const EXPORT_FORMATS = [
  { id: "WORDOPENXML",  label: "Word",       icon: "codicon-file-code",    color: "#2b579a" },
  { id: "EXCELOPENXML", label: "Excel",      icon: "codicon-table",        color: "#217346" },
  { id: "PPTX",         label: "PowerPoint", icon: "codicon-file-media",   color: "#d24726" },
  { id: "PDF",          label: "PDF",        icon: "codicon-file-pdf",     color: "#e3001b" },
  { id: "CSV",          label: "CSV",        icon: "codicon-symbol-array", color: "#555"    },
] as const;

interface UploadedReport { reportId: string; reportPath: string; previewUrl: string; }

export function PreviewView({ tab, metadata, ssrsUrl, ssrsUsername, ssrsPassword, connections, activeConnectionId, onStatus }: {
  tab: ReportTab;
  metadata: ReportMetadata | null;
  connections: DbConnection[];
  activeConnectionId: string;
  ssrsUrl: string;
  ssrsUsername: string;
  ssrsPassword: string;
  onStatus: (l: string, r: string) => void;
}) {
  if (tab.source === "local" && !tab.serverPath) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <span className="codicon codicon-info" style={{ fontSize: 48, color: "#007acc", marginBottom: 16 }} />
          <h2 style={{ fontSize: 18, fontWeight: 500, color: "#333", marginBottom: 8 }}>Preview Disabled for Local Files</h2>
          <p style={{ fontSize: 13, color: "#666", maxWidth: 400, lineHeight: 1.5 }}>
            Open the report from the <strong>Server</strong> panel or upload it to SSRS first.
          </p>
        </div>
      </div>
    );
  }

  const [uploaded, setUploaded] = useState<UploadedReport | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [params, setParams] = useState<Record<string, string | null>>({});
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const tempReportId = useRef<string | null>(null);

  useEffect(() => {
    if (metadata?.parameters) {
      const initial: Record<string, string | null> = {};
      metadata.parameters.forEach((p: ReportParameter) => {
        initial[p.name] = p.defaultValue ?? (p.nullable ? null : "");
      });
      setParams(initial);
    }
  }, [metadata]);

  useEffect(() => () => {
    if (tempReportId.current && ssrsUrl) {
      invoke("ssrs_delete_report", { url: ssrsUrl, username: ssrsUsername, password: ssrsPassword, reportId: tempReportId.current }).catch(() => {});
    }
  }, []);

  // Auto-size sidebar to longest parameter label
  useEffect(() => {
    if (!metadata?.parameters?.length) return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    let maxW = 0;
    if (ctx) {
      ctx.font = "600 13px Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
      metadata.parameters.forEach(p => { maxW = Math.max(maxW, ctx.measureText(p.prompt || p.name).width); });
    } else {
      metadata.parameters.forEach(p => { maxW = Math.max(maxW, (p.prompt || p.name).length * 8); });
    }
    setSidebarWidth(Math.min(Math.max(280, maxW + 64), 800));
  }, [metadata]);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => { if (e.clientX > 200 && e.clientX < 1200) setSidebarWidth(e.clientX); };
    const onUp = () => setIsResizing(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [isResizing]);

  const getProcessedParams = () => {
    const res: Record<string, string | null> = {};
    Object.keys(params).forEach(key => {
      const val = params[key];
      if (val === null) res[key] = null;
      else if (val.trim() !== "") res[key] = val;
    });
    return res;
  };

  async function ensureUploaded(): Promise<UploadedReport | null> {
    if (uploaded) return uploaded;
    if (tab.serverPath) {
      const r = { reportId: "", reportPath: tab.serverPath, previewUrl: "" };
      setUploaded(r);
      return r;
    }
    if (!ssrsUrl) { setError("No SSRS server configured. Go to the Server panel and connect first."); return null; }
    setError(null);
    setUploading(true);
    try {
      const res = await invoke<{ reportId: string; reportPath: string; previewUrl: string }>("ssrs_upload_temp_report", {
        url: ssrsUrl, username: ssrsUsername, password: ssrsPassword, rdlPath: tab.path,
      });
      tempReportId.current = res.reportId;
      const r = { reportId: res.reportId, reportPath: res.reportPath, previewUrl: res.previewUrl };
      setUploaded(r);
      return r;
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
      const url = await invoke<string>("ssrs_preview_url", { url: ssrsUrl, reportPath: report.reportPath, params: getProcessedParams() });
      await invoke("ssrs_open_browser", { previewUrl: url });
      onStatus("SSRS", tab.title);
    } catch (e: any) { setError(String(e)); }
  }

  async function handleExport(formatId: string, label: string) {
    const report = await ensureUploaded();
    if (!report) return;
    setExporting(formatId);
    setError(null);
    try {
      await invoke("ssrs_export", {
        url: ssrsUrl, username: ssrsUsername, password: ssrsPassword,
        reportPath: report.reportPath, format: formatId, params: getProcessedParams(),
      });
      onStatus("SSRS", `${label} exported`);
    } catch (e: any) {
      setError(String(e));
      onStatus("", "Error");
    } finally {
      setExporting(null);
    }
  }

  const ssrsConfigured = !!ssrsUrl;
  const busy = uploading || !!exporting;
  const hasParams = metadata && metadata.parameters.length > 0;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {hasParams && (
        <>
          <div style={{
            width: sidebarWidth, flexShrink: 0, borderRight: "1px solid #e8e8e8",
            background: "#f0f2f5", overflowY: "auto", padding: "16px 12px",
            display: "flex", flexDirection: "column", gap: 12,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, padding: "0 4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: 4, background: "#007fd4", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span className="codicon codicon-symbol-parameter" style={{ fontSize: 13, color: "#fff" }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#444", textTransform: "uppercase", letterSpacing: "0.05em" }}>Parameters</span>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", userSelect: "none" }}>
                <input type="checkbox" checked={showMetadata} onChange={e => setShowMetadata(e.target.checked)} style={{ width: 13, height: 13, margin: 0 }} />
                <span style={{ fontSize: 10, color: "#666", fontWeight: 500 }}>Technical Info</span>
              </label>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {metadata!.parameters.map((p: ReportParameter) => (
                <div key={p.name} style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 6, padding: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#007fd4"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#e0e0e0"; e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.02)"; }}
                >
                  <label style={{ display: "block", fontSize: 13, color: "#1a1a1a", marginBottom: 8, fontWeight: 600, lineHeight: 1.4 }}>
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
                    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, paddingTop: 8, borderTop: "1px solid #f5f5f5" }}>
                      <span style={{ fontSize: 10, color: "#007fd4", fontFamily: "monospace", background: "#eef7ff", padding: "1px 4px", borderRadius: 2 }}>@{p.name}</span>
                      <span style={{ fontSize: 10, color: "#888", fontWeight: 500 }}>{p.dataType}</span>
                      {p.nullable && <span style={{ fontSize: 10, color: "#999", fontStyle: "italic" }}>· Nullable</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div
            onMouseDown={() => setIsResizing(true)}
            style={{ width: 4, cursor: "col-resize", background: isResizing ? "#007fd4" : "transparent", transition: "background 0.2s", zIndex: 10, marginLeft: -2, flexShrink: 0 }}
            onMouseEnter={e => { if (!isResizing) e.currentTarget.style.background = "rgba(0,0,0,0.1)"; }}
            onMouseLeave={e => { if (!isResizing) e.currentTarget.style.background = "transparent"; }}
          />
        </>
      )}

      <div style={{ flex: 1, overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 32, padding: 40, maxWidth: 520 }}>
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
              Connecting…
            </div>
          )}

          <button onClick={handleOpenBrowser} disabled={busy || !ssrsConfigured} className="btn-primary" style={{ padding: "8px 24px", fontSize: 13, borderRadius: 4, gap: 8 }}>
            <span className="codicon codicon-link-external" style={{ fontSize: 14 }} />
            Open in Browser
          </button>

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
                      gap: 6, padding: "14px 8px", border: "1px solid #e0e0e0", borderRadius: 6,
                      background: busy && !isExporting ? "#fafafa" : "#fff",
                      cursor: busy || !ssrsConfigured ? "default" : "pointer",
                      opacity: busy && !isExporting ? 0.5 : 1,
                      transition: "box-shadow 0.15s, border-color 0.15s",
                    }}
                    onMouseEnter={e => { if (!busy && ssrsConfigured) { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.10)"; e.currentTarget.style.borderColor = "#bbb"; } }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "#e0e0e0"; }}
                  >
                    <span className={`codicon ${isExporting ? "codicon-loading codicon-modifier-spin" : fmt.icon}`} style={{ fontSize: 22, color: isExporting ? "#aaa" : fmt.color }} />
                    <span style={{ fontSize: 12, color: "#555", fontWeight: 500 }}>{isExporting ? "Exporting…" : fmt.label}</span>
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
