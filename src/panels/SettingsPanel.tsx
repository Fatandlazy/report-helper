import { AppSettings, DbConnection } from "../types";
import { save, open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { useState, useEffect } from "react";

interface Props {
  settings: AppSettings;
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
  onAddConnection: (c: DbConnection) => void;
  onRemoveConnection: (id: string) => void;
}

type SettingsTab = "general" | "ssrs" | "connections" | "ai";

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: "general", label: "General", icon: "codicon-settings-gear" },
  { id: "ssrs", label: "SSRS", icon: "codicon-server" },
  { id: "connections", label: "Connections", icon: "codicon-database" },
  { id: "ai", label: "AI", icon: "codicon-robot" },
];

const PERMISSION_MODES = [
  { value: "auto", label: "Auto", description: "Claude evaluates each action for safety and decides automatically" },
  { value: "default", label: "Default", description: "Ask before every tool call — safest option" },
  { value: "acceptEdits", label: "Accept Edits", description: "Auto-approve file edits, still ask for Bash and other tools" },
  { value: "bypassPermissions", label: "Bypass Permissions", description: "Skip most permission prompts" },
  { value: "dontAsk", label: "Don't Ask", description: "Never ask — execute all tools without confirmation" },
  { value: "plan", label: "Plan Only", description: "Read-only mode — Claude can plan but cannot write files" },
];

export function SettingsPanel({
  settings, onUpdateSettings,
  onAddConnection, onRemoveConnection
}: Props) {
  const { ssrsUrl, ssrsUsername, ssrsPassword, connections, claudeApiKey, claudeModel, claudeFolder } = settings;
  const [version, setVersion] = useState<string>("");
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  useEffect(() => {
    getVersion().then(setVersion);
  }, []);

  const handleExport = async () => {
    try {
      const path = await save({
        filters: [{ name: "JSON", extensions: ["json"] }],
        defaultPath: "reporting-tools-settings.json"
      });
      if (path) {
        const exportData = {
          connections: settings.connections,
          ssrsUrl: settings.ssrsUrl,
          ssrsUsername: settings.ssrsUsername,
          ssrsPassword: settings.ssrsPassword,
          defaultSafeRun: settings.defaultSafeRun,
        };
        await invoke("write_text_file", { path, content: JSON.stringify(exportData, null, 2) });
      }
    } catch (e) {
      alert(`Export failed: ${e}`);
    }
  };

  const handleImport = async () => {
    try {
      const path = await open({ filters: [{ name: "JSON", extensions: ["json"] }], multiple: false });
      if (path && !Array.isArray(path)) {
        const content = await invoke<string>("read_text_file", { path });
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === "object" && (parsed.connections || parsed.ssrsUrl)) {
          const updates: Partial<AppSettings> = {};
          if (Array.isArray(parsed.connections)) updates.connections = parsed.connections;
          if (typeof parsed.ssrsUrl === "string") updates.ssrsUrl = parsed.ssrsUrl;
          if (typeof parsed.ssrsUsername === "string") updates.ssrsUsername = parsed.ssrsUsername;
          if (typeof parsed.ssrsPassword === "string") updates.ssrsPassword = parsed.ssrsPassword;
          if (typeof parsed.defaultSafeRun === "boolean") updates.defaultSafeRun = parsed.defaultSafeRun;
          onUpdateSettings(updates);
        } else {
          alert("Invalid settings file format.");
        }
      }
    } catch (e) {
      alert(`Import failed: ${e}`);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff" }}>
      {/* Tab Bar */}
      <div style={{ display: "flex", borderBottom: "1px solid #e5e5e5", background: "#fafafa", padding: "0 24px", flexShrink: 0 }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "12px 16px",
              fontSize: 13,
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? "#007acc" : "#666",
              background: "none", border: "none", cursor: "pointer",
              borderBottom: activeTab === tab.id ? "2px solid #007acc" : "2px solid transparent",
              marginBottom: -1,
              transition: "all 0.15s"
            }}
          >
            <span className={`codicon ${tab.icon}`} style={{ fontSize: 13 }} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "32px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>

          {/* ── GENERAL TAB ── */}
          {activeTab === "general" && (
            <>
              <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 28, color: "#333" }}>General</h1>

              <Section title="SQL Editor">
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={settings.defaultSafeRun}
                    onChange={e => onUpdateSettings({ defaultSafeRun: e.target.checked })}
                    style={{ marginTop: 2 }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#333" }}>Default Safe Run</div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>Wrap SQL queries in a transaction and rollback automatically (BEGIN TRANSACTION … ROLLBACK).</div>
                  </div>
                </label>
              </Section>

              <Section title="Hidden Items">
                <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
                  Manage visibility of files, folders, and SSRS items you have hidden from the browsers.
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <HiddenCard
                    label="Local Workspace"
                    count={settings.hiddenLocalPaths?.length || 0}
                    onClear={() => onUpdateSettings({ hiddenLocalPaths: [] })}
                  />
                  <HiddenCard
                    label="SSRS Server"
                    count={settings.hiddenSsrsPaths?.length || 0}
                    onClear={() => onUpdateSettings({ hiddenSsrsPaths: [] })}
                  />
                </div>
              </Section>

              <Section title="Keyboard Shortcuts">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 40px" }}>
                  <ShortcutItem keys="Ctrl + B" description="Toggle Sidebar" />
                  <ShortcutItem keys="Ctrl + ," description="Open Settings" />
                  <ShortcutItem keys="Ctrl + W" description="Close Current Tab" />
                  <ShortcutItem keys="Ctrl + Alt + 1/E" description="Switch to Explorer" />
                  <ShortcutItem keys="Ctrl + Alt + 2/S" description="Switch to Server" />
                  <ShortcutItem keys="Ctrl + Alt + 3/Q" description="Switch to SQL Editor" />
                  <ShortcutItem keys="Ctrl + Alt + 4" description="Switch to Claude Chat" />
                  <ShortcutItem keys="Ctrl + Enter / F5" description="Run SQL Query" />
                  <ShortcutItem keys="Ctrl + S" description="Save SQL File" />
                  <ShortcutItem keys="Ctrl + N" description="New SQL File" />
                </div>
              </Section>

              <Section title="Backup & Sync">
                <div style={{ display: "flex", gap: 12 }}>
                  <button onClick={handleExport} className="btn-secondary">
                    <span className="codicon codicon-export" /> Export Settings
                  </button>
                  <button onClick={handleImport} className="btn-secondary">
                    <span className="codicon codicon-import" /> Import Settings
                  </button>
                </div>
                <p style={{ fontSize: 11, color: "#888", marginTop: 8 }}>
                  Export your settings to a JSON file to backup or move to another machine.
                </p>
              </Section>

              <div style={{ marginTop: 48, paddingTop: 20, borderTop: "1px solid #eee", textAlign: "center", color: "#aaa" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#999", marginBottom: 4 }}>Report Helper</div>
                <div style={{ fontSize: 11 }}>Version {version}</div>
                <div style={{ fontSize: 10, marginTop: 8 }}>&copy; {new Date().getFullYear()} Report Helper. All rights reserved.</div>
              </div>
            </>
          )}

          {/* ── SSRS TAB ── */}
          {activeTab === "ssrs" && (
            <>
              <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 28, color: "#333" }}>SSRS Server</h1>

              <Section title="Connection">
                <Field label="Server URL">
                  <input
                    type="text"
                    value={ssrsUrl}
                    onChange={e => onUpdateSettings({ ssrsUrl: e.target.value })}
                    placeholder="https://your-ssrs-server/ReportServer"
                    style={inputStyle}
                  />
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
                  <Field label="Username">
                    <input type="text" value={ssrsUsername} onChange={e => onUpdateSettings({ ssrsUsername: e.target.value })} style={inputStyle} />
                  </Field>
                  <Field label="Password">
                    <input type="password" value={ssrsPassword} onChange={e => onUpdateSettings({ ssrsPassword: e.target.value })} style={inputStyle} />
                  </Field>
                </div>
              </Section>
            </>
          )}

          {/* ── CONNECTIONS TAB ── */}
          {activeTab === "connections" && (
            <>
              <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 28, color: "#333" }}>SQL Connections</h1>

              <Section title="Database Connections">
                <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
                  Manage your database connections used in the SQL Editor and report data previews.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {connections.map(c => (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", padding: "10px 14px", borderRadius: 6, border: "1px solid #e0e0e0" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "#333" }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: "#999", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 460, whiteSpace: "nowrap" }}>
                          {c.connectionString}
                        </div>
                      </div>
                      <button onClick={() => onRemoveConnection(c.id)} style={{ color: "#e81123", padding: "4px 8px", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>
                        <span className="codicon codicon-trash" style={{ fontSize: 14 }} />
                      </button>
                    </div>
                  ))}
                  {connections.length === 0 && (
                    <div style={{ padding: "24px", textAlign: "center", color: "#aaa", fontSize: 13, background: "#fafafa", borderRadius: 6, border: "1px dashed #e0e0e0" }}>
                      No connections yet
                    </div>
                  )}
                  <button
                    onClick={() => {
                      const name = prompt("Connection Name");
                      const connStr = prompt("Connection String");
                      if (name && connStr) onAddConnection({ id: crypto.randomUUID(), name, connectionString: connStr });
                    }}
                    className="btn-secondary"
                    style={{ alignSelf: "flex-start", marginTop: 4 }}
                  >
                    <span className="codicon codicon-add" /> Add Connection
                  </button>
                </div>
              </Section>
            </>
          )}

          {/* ── AI TAB ── */}
          {activeTab === "ai" && (
            <>
              <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 28, color: "#333" }}>AI Settings</h1>

              <Section title="Claude Code">
                <Field label="Working Directory">
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      readOnly
                      value={claudeFolder || ""}
                      placeholder="Choose a project folder for Claude Code"
                      style={{ ...inputStyle, flex: 1, background: "#f5f5f5", color: claudeFolder ? "#333" : "#999" }}
                    />
                    <button
                      onClick={async () => {
                        try {
                          const dir = await open({ directory: true, multiple: false });
                          if (typeof dir !== "string") return;
                          onUpdateSettings({ claudeFolder: dir });
                        } catch (e) {
                          console.error(e);
                        }
                      }}
                      className="btn-secondary"
                      style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}
                    >
                      <span className="codicon codicon-folder-opened" /> {claudeFolder ? "Change" : "Choose"}
                    </button>
                    {claudeFolder && (
                      <button
                        onClick={() => onUpdateSettings({ claudeFolder: "" })}
                        className="btn-secondary"
                        style={{ color: "#e81123", padding: "6px 10px" }}
                        title="Clear"
                      >
                        <span className="codicon codicon-trash" />
                      </button>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: "#888", marginTop: 4, display: "block" }}>
                    Thư mục này hoạt động độc lập và không liên quan đến danh sách thư mục dự án trong Explorer.
                  </span>
                </Field>

                <Field label="Anthropic API Key" style={{ marginTop: 16 }}>
                  <input
                    type="password"
                    value={claudeApiKey || ""}
                    onChange={e => onUpdateSettings({ claudeApiKey: e.target.value })}
                    placeholder="sk-ant-... (để trống nếu dùng Claude Code CLI OAuth)"
                    style={inputStyle}
                  />
                  <span style={{ fontSize: 11, color: "#888", marginTop: 4, display: "block" }}>
                    Nếu đã đăng nhập bằng <code style={{ fontSize: 10, background: "#f0f0f0", padding: "1px 4px", borderRadius: 3 }}>claude auth login</code>, bạn không cần nhập key ở đây.
                  </span>
                </Field>

                <Field label="Default Model" style={{ marginTop: 16 }}>
                  <input
                    type="text"
                    value={claudeModel || ""}
                    onChange={e => onUpdateSettings({ claudeModel: e.target.value })}
                    placeholder="claude-sonnet-4-6 (leave empty for default)"
                    style={inputStyle}
                  />
                </Field>
              </Section>

              <Section title="Permissions">
                <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
                  Default permission mode for new chat sessions. Can be overridden per-session in the chat toolbar.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {PERMISSION_MODES.map(mode => {
                    const active = (settings.claudePermissionMode || "auto") === mode.value;
                    return (
                      <label
                        key={mode.value}
                        style={{
                          display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 14px",
                          border: `1px solid ${active ? "#007acc" : "#e0e0e0"}`,
                          borderRadius: 8, cursor: "pointer",
                          background: active ? "#f0f7ff" : "#fff",
                          transition: "all 0.15s"
                        }}
                      >
                        <input
                          type="radio"
                          name="permissionMode"
                          value={mode.value}
                          checked={active}
                          onChange={() => onUpdateSettings({ claudePermissionMode: mode.value })}
                          style={{ marginTop: 2, flexShrink: 0, accentColor: "#007acc" }}
                        />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: active ? "#007acc" : "#333" }}>{mode.label}</div>
                          <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{mode.description}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>

                <Field label="Allowed Tools" style={{ marginTop: 20 }}>
                  <input
                    type="text"
                    value={settings.claudeAllowedTools || ""}
                    onChange={e => onUpdateSettings({ claudeAllowedTools: e.target.value })}
                    placeholder='e.g. "Bash(git *) Edit WebSearch" (space-separated)'
                    style={inputStyle}
                  />
                  <span style={{ fontSize: 11, color: "#888", marginTop: 4, display: "block" }}>
                    Whitelist specific tools regardless of permission mode. Uses Claude CLI <code style={{ fontSize: 10, background: "#f0f0f0", padding: "1px 4px", borderRadius: 3 }}>--allowedTools</code> syntax.
                  </span>
                </Field>
              </Section>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  border: "1px solid #ddd",
  borderRadius: 6,
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 12, fontWeight: 600, color: "#007acc", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14, paddingBottom: 8, borderBottom: "1px solid #eee" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#555", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function HiddenCard({ label, count, onClear }: { label: string; count: number; onClear: () => void }) {
  return (
    <div style={{ flex: 1, background: "#f9f9f9", padding: "12px 14px", borderRadius: 6, border: "1px solid #eee" }}>
      <div style={{ fontWeight: 600, fontSize: 12, color: "#333", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>{count} item{count !== 1 ? "s" : ""} hidden</div>
      <button onClick={onClear} disabled={!count} className="btn-secondary" style={{ width: "100%", fontSize: 11 }}>
        Clear All
      </button>
    </div>
  );
}

function ShortcutItem({ keys, description }: { keys: string; description: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
      <span style={{ fontSize: 12, color: "#555" }}>{description}</span>
      <span style={{ fontSize: 11, fontFamily: "monospace", background: "#f0f0f0", padding: "2px 6px", borderRadius: 4, border: "1px solid #ddd", color: "#333", fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>{keys}</span>
    </div>
  );
}
