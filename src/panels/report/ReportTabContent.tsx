import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ReportTab, TabView, ReportMetadata, DbConnection } from "../../types";
import { OverviewView } from "./OverviewView";
import { SqlTesterView } from "./SqlTesterView";
import { PreviewView } from "./PreviewView";
import { SqlFileView } from "./SqlFileView";
import { Centered } from "./components/Centered";

interface Props {
  tab: ReportTab;
  connections: DbConnection[];
  activeConnectionId: string;
  ssrsUrl: string;
  ssrsUsername: string;
  ssrsPassword: string;
  onViewChange: (view: TabView) => void;
  onStatus: (left: string, right: string) => void;
  defaultSafeRun: boolean;
  onUpdateTabMetadata: (path: string, metadata: Partial<ReportTab>) => void;
  reloadKey?: number;
}

const VIEWS: { id: TabView; label: string; icon: string }[] = [
  { id: "overview",  label: "Overview",   icon: "codicon-list-flat" },
  { id: "sqltester", label: "SQL Tester", icon: "codicon-beaker" },
  { id: "preview",   label: "Preview",    icon: "codicon-eye" },
];

export function ReportTabContent({
  tab, connections, activeConnectionId, ssrsUrl, ssrsUsername, ssrsPassword,
  onViewChange, onStatus, defaultSafeRun, onUpdateTabMetadata, reloadKey,
}: Props) {
  const [metadata, setMetadata] = useState<ReportMetadata | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDataSetName, setSelectedDataSetName] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [toolbarLeftEl, setToolbarLeftEl] = useState<HTMLDivElement | null>(null);
  const [toolbarRightEl, setToolbarRightEl] = useState<HTMLDivElement | null>(null);

  const isServerTab = tab.source === "server";
  const ext = tab.path.split(".").pop()?.toLowerCase();
  const isSqlFile = ext === "sql";

  useEffect(() => {
    if (isServerTab) return;
    setMetadata(null);
    setMetaError(null);
    if (isSqlFile) { setLoading(false); return; }
    if (ext !== "rdl" && ext !== "rdlc") {
      setMetaError("Unsupported file type. Currently only .rdl, .rdlc, and .sql files are supported.");
      return;
    }
    setLoading(true);
    invoke<ReportMetadata>("parse_rdl", { path: tab.path })
      .then(m => { setMetadata(m); setLoading(false); })
      .catch(e => { setMetaError(String(e)); setLoading(false); });
  }, [tab.path, reloadKey]);

  async function refreshMetadata() {
    setLoading(true);
    try {
      const m = await invoke<ReportMetadata>("parse_rdl", { path: tab.path });
      setMetadata(m);
    } catch (e) {
      setMetaError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const visibleViews = isServerTab
    ? VIEWS.filter(v => v.id === "preview")
    : isSqlFile ? [] : VIEWS;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "#fff" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 2, height: 38, padding: "0 12px", borderBottom: "1px solid #e8e8e8", background: "#f8f8f8", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 2, flex: 1 }}>
          {visibleViews.map(btn => {
            const isActive = tab.activeView === btn.id;
            const isDisabled = btn.id === "preview" && !isServerTab && !tab.serverPath;
            return (
              <button
                key={btn.id}
                onClick={() => !isDisabled && onViewChange(btn.id)}
                disabled={isDisabled}
                title={isDisabled ? "Only available for server reports or reports with a server path" : ""}
                style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 3,
                  background: isActive ? "#e4e6f1" : "transparent",
                  color: isActive ? "#1a1a6e" : isDisabled ? "#bbb" : "#666",
                  fontSize: 12, fontWeight: isActive ? 600 : 400,
                  border: "none", cursor: "pointer", transition: "background 0.1s", opacity: isDisabled ? 0.6 : 1,
                }}
                onMouseEnter={e => { if (!isActive && !isDisabled) e.currentTarget.style.background = "rgba(0,0,0,0.06)"; }}
                onMouseLeave={e => { if (!isActive && !isDisabled) e.currentTarget.style.background = "transparent"; }}
              >
                <span className={`codicon ${btn.icon}`} style={{ fontSize: 13 }} />
                {btn.label}
              </button>
            );
          })}
          <div ref={setToolbarLeftEl} style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: 15 }} />
        </div>
        <div ref={setToolbarRightEl} style={{ display: "flex", alignItems: "center", gap: 10 }} />
        {!isSqlFile && (
          <div
            style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 10, paddingLeft: 10, borderLeft: "1px solid #e0e0e0", height: 20, opacity: isServerTab ? 0.5 : 1 }}
            title={isServerTab ? "Edit Mode is only available for local RDL files" : ""}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: isServerTab ? "not-allowed" : "pointer", userSelect: "none" }}>
              <input type="checkbox" checked={isEditMode} onChange={e => !isServerTab && setIsEditMode(e.target.checked)} disabled={isServerTab} style={{ cursor: isServerTab ? "not-allowed" : "pointer" }} />
              <span style={{ fontSize: 11, color: isEditMode ? "#007acc" : "#666", fontWeight: isEditMode ? 600 : 400 }}>Edit Mode</span>
            </label>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {isServerTab && (
          <PreviewView tab={tab} metadata={metadata} connections={connections} activeConnectionId={activeConnectionId} ssrsUrl={ssrsUrl} ssrsUsername={ssrsUsername} ssrsPassword={ssrsPassword} onStatus={onStatus} />
        )}
        {!isServerTab && loading && (
          <Centered>
            <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 22, color: "#aaa" }} />
            <span style={{ fontSize: 13, color: "#aaa", marginTop: 10 }}>Loading report…</span>
          </Centered>
        )}
        {!isServerTab && metaError && (
          <Centered>
            <span className="codicon codicon-error" style={{ fontSize: 28, color: "#c00" }} />
            <span style={{ fontSize: 13, color: "#c00", marginTop: 10, maxWidth: 400, textAlign: "center", lineHeight: 1.5 }}>{metaError}</span>
          </Centered>
        )}
        {!isServerTab && !loading && !metaError && isSqlFile && (
          <SqlFileView tab={tab} connections={connections} activeConnectionId={activeConnectionId} onStatus={onStatus} defaultSafeRun={defaultSafeRun} onUpdateTabMetadata={onUpdateTabMetadata} toolbarLeftEl={toolbarLeftEl} toolbarRightEl={toolbarRightEl} />
        )}
        {!isServerTab && !loading && !metaError && metadata && !isSqlFile && (
          <>
            <div style={{ display: tab.activeView === "overview" ? "contents" : "none" }}>
              <OverviewView metadata={metadata} isEditMode={isEditMode} rdlPath={tab.path} onRefresh={refreshMetadata} onUpdateTabMetadata={onUpdateTabMetadata}
                onTestDataset={dsName => { setSelectedDataSetName(dsName); onViewChange("sqltester"); }}
              />
            </div>
            <div style={{ display: tab.activeView === "sqltester" ? "contents" : "none" }}>
              <SqlTesterView metadata={metadata} connections={connections} activeConnectionId={activeConnectionId} onStatus={onStatus}
                selectedDataSetName={selectedDataSetName} onSelectedDataSetNameChange={setSelectedDataSetName}
                defaultSafeRun={defaultSafeRun} isEditMode={isEditMode} rdlPath={tab.path}
                onRefresh={refreshMetadata} onUpdateTabMetadata={onUpdateTabMetadata}
                isActive={tab.activeView === "sqltester"} toolbarLeftEl={toolbarLeftEl} toolbarRightEl={toolbarRightEl}
              />
            </div>
            <div style={{ display: tab.activeView === "preview" ? "contents" : "none" }}>
              <PreviewView tab={tab} metadata={metadata} connections={connections} activeConnectionId={activeConnectionId} ssrsUrl={ssrsUrl} ssrsUsername={ssrsUsername} ssrsPassword={ssrsPassword} onStatus={onStatus} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
