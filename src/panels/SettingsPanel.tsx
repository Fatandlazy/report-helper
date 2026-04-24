import { AppSettings, DbConnection } from "../types";
import { save, open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { useState, useEffect } from "react";

interface Props {
  settings: AppSettings;
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
  onImportSettings: (settings: AppSettings) => void;
  onAddConnection: (c: DbConnection) => void;
  onRemoveConnection: (id: string) => void;
}

export function SettingsPanel({ 
  settings, onUpdateSettings, onImportSettings,
  onAddConnection, onRemoveConnection 
}: Props) {
  const { ssrsUrl, ssrsUsername, ssrsPassword, connections } = settings;
  const [version, setVersion] = useState<string>("");

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
        await invoke("write_text_file", { path, content: JSON.stringify(settings, null, 2) });
      }
    } catch (e) {
      alert(`Export failed: ${e}`);
    }
  };

  const handleImport = async () => {
    try {
      const path = await open({
        filters: [{ name: "JSON", extensions: ["json"] }],
        multiple: false
      });
      if (path && !Array.isArray(path)) {
        const content = await invoke<string>("read_text_file", { path });
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === "object" && (parsed.connections || parsed.ssrsUrl)) {
          onImportSettings(parsed);
        } else {
          alert("Invalid settings file format.");
        }
      }
    } catch (e) {
      alert(`Import failed: ${e}`);
    }
  };
  return (
    <div className="flex-1 overflow-auto p-8" style={{ background: "#fff" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 300, marginBottom: 24, color: "#333" }}>Settings</h1>

        {/* SSRS Section */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: "#007acc", textTransform: "uppercase", marginBottom: 16, borderBottom: "1px solid #eee", paddingBottom: 8 }}>
            SSRS Server
          </h2>
          <div style={{ display: "grid", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#666", marginBottom: 4 }}>Server URL</label>
              <input 
                type="text" 
                value={ssrsUrl} 
                onChange={e => onUpdateSettings({ ssrsUrl: e.target.value })}
                placeholder="https://your-ssrs-server/ReportServer"
                style={{ width: "100%", padding: "6px 10px", border: "1px solid #ddd", borderRadius: 4 }}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#666", marginBottom: 4 }}>Username</label>
                <input 
                  type="text" 
                  value={ssrsUsername} 
                  onChange={e => onUpdateSettings({ ssrsUsername: e.target.value })}
                  style={{ width: "100%", padding: "6px 10px", border: "1px solid #ddd", borderRadius: 4 }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#666", marginBottom: 4 }}>Password</label>
                <input 
                  type="password" 
                  value={ssrsPassword} 
                  onChange={e => onUpdateSettings({ ssrsPassword: e.target.value })}
                  style={{ width: "100%", padding: "6px 10px", border: "1px solid #ddd", borderRadius: 4 }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Connections Section */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: "#007acc", textTransform: "uppercase", marginBottom: 16, borderBottom: "1px solid #eee", paddingBottom: 8 }}>
            SQL Connections
          </h2>
          <div style={{ background: "#f9f9f9", padding: 16, borderRadius: 8, border: "1px solid #eee" }}>
            <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
              Manage your database connections. These are used in the SQL Editor and for report data previews.
            </p>
            {/* We can add a list/form here or just point to the SQL Editor's sidebar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {connections.map(c => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", padding: "8px 12px", borderRadius: 4, border: "1px solid #ddd" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: "#888", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 400, whiteSpace: "nowrap" }}>
                      {c.connectionString}
                    </div>
                  </div>
                  <button onClick={() => onRemoveConnection(c.id)} style={{ color: "#e81123", padding: 4 }}>
                    <span className="codicon codicon-trash" />
                  </button>
                </div>
              ))}
              <button 
                onClick={() => {
                  const name = prompt("Connection Name");
                  const connStr = prompt("Connection String");
                  if (name && connStr) onAddConnection({ id: crypto.randomUUID(), name, connectionString: connStr });
                }}
                className="btn-secondary" 
                style={{ alignSelf: "flex-start", marginTop: 8 }}
              >
                <span className="codicon codicon-add" /> Add Connection
              </button>
            </div>
          </div>
        </section>

        {/* Hidden Items Section */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: "#007acc", textTransform: "uppercase", marginBottom: 16, borderBottom: "1px solid #eee", paddingBottom: 8 }}>
            Hidden Items
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: "#666" }}>
              Manage visibility of files, folders, and SSRS items that you have hidden from the browsers.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1, background: "#f9f9f9", padding: 12, borderRadius: 6, border: "1px solid #eee" }}>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>Local Workspace</div>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>{settings.hiddenLocalPaths?.length || 0} items hidden</div>
                <button 
                  onClick={() => onUpdateSettings({ hiddenLocalPaths: [] })}
                  disabled={!settings.hiddenLocalPaths?.length}
                  className="btn-secondary"
                  style={{ width: "100%", fontSize: 11 }}
                >
                  Clear All
                </button>
              </div>
              <div style={{ flex: 1, background: "#f9f9f9", padding: 12, borderRadius: 6, border: "1px solid #eee" }}>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>SSRS Server</div>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>{settings.hiddenSsrsPaths?.length || 0} items hidden</div>
                <button 
                  onClick={() => onUpdateSettings({ hiddenSsrsPaths: [] })}
                  disabled={!settings.hiddenSsrsPaths?.length}
                  className="btn-secondary"
                  style={{ width: "100%", fontSize: 11 }}
                >
                  Clear All
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* General Section */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: "#007acc", textTransform: "uppercase", marginBottom: 16, borderBottom: "1px solid #eee", paddingBottom: 8 }}>
            General Settings
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input 
                type="checkbox" 
                checked={settings.defaultSafeRun} 
                onChange={e => onUpdateSettings({ defaultSafeRun: e.target.checked })} 
              />
              <div style={{ fontSize: 13 }}>
                <div style={{ fontWeight: 500, color: "#333" }}>Default Safe Run</div>
                <div style={{ fontSize: 11, color: "#888" }}>Wrap SQL queries in a transaction and rollback automatically (BEGIN TRANSACTION ... ROLLBACK).</div>
              </div>
            </label>
          </div>
        </section>

        {/* Shortcuts Section */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: "#007acc", textTransform: "uppercase", marginBottom: 16, borderBottom: "1px solid #eee", paddingBottom: 8 }}>
            Keyboard Shortcuts
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 40px" }}>
            <ShortcutItem keys="Ctrl + B" description="Toggle Sidebar" />
            <ShortcutItem keys="Ctrl + ," description="Open Settings" />
            <ShortcutItem keys="Ctrl + W" description="Close Current Tab" />
            <ShortcutItem keys="Ctrl + Alt + 1/E" description="Switch to Explorer" />
            <ShortcutItem keys="Ctrl + Alt + 2/S" description="Switch to Server" />
            <ShortcutItem keys="Ctrl + Alt + 3/Q" description="Switch to SQL Editor" />
            <ShortcutItem keys="Ctrl + Enter / F5" description="Run SQL Query" />
            <ShortcutItem keys="Ctrl + S" description="Save SQL File" />
            <ShortcutItem keys="Ctrl + N" description="New SQL File" />
          </div>
        </section>

        {/* Backup Section */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: "#007acc", textTransform: "uppercase", marginBottom: 16, borderBottom: "1px solid #eee", paddingBottom: 8 }}>
            Backup & Sync
          </h2>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={handleExport} className="btn-secondary">
              <span className="codicon codicon-export" /> Export Settings
            </button>
            <button onClick={handleImport} className="btn-secondary">
              <span className="codicon codicon-import" /> Import Settings
            </button>
          </div>
          <p style={{ fontSize: 11, color: "#888", marginTop: 8 }}>
            Export your settings to a JSON file to backup or move them to another machine.
          </p>
        </section>

        <div style={{ 
          marginTop: 60, padding: "20px 0", borderTop: "1px solid #eee", 
          textAlign: "center", color: "#aaa" 
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#999", marginBottom: 4 }}>Report Helper</div>
          <div style={{ fontSize: 11 }}>Version {version}</div>
          <div style={{ fontSize: 10, marginTop: 8 }}>&copy; {new Date().getFullYear()} Report Helper. All rights reserved.</div>
        </div>
      </div>
    </div>
  );
}

function ShortcutItem({ keys, description }: { keys: string; description: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
      <span style={{ fontSize: 13, color: "#555" }}>{description}</span>
      <span style={{ 
        fontSize: 11, 
        fontFamily: "monospace", 
        background: "#f0f0f0", 
        padding: "2px 6px", 
        borderRadius: 4, 
        border: "1px solid #ddd",
        color: "#333",
        fontWeight: 600
      }}>{keys}</span>
    </div>
  );
}
