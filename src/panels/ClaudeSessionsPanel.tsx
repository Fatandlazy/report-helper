import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";

interface ChatSession {
  id: string;
  title: string;
  timestamp: number;
}

interface Props {
  onOpenSession: (id: string, title: string) => void;
  activeSessionId: string | null;
  claudeFolder?: string;
  onUpdateClaudeFolder: (path: string) => void;
}

const SESSIONS_KEY = "claude_sessions_v1";

function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((s: any) => ({
          id: s.id,
          title: s.title || "New session",
          timestamp: s.timestamp || Date.now()
        })).sort((a, b) => b.timestamp - a.timestamp);
      }
    }
  } catch (e) {
    console.error(e);
  }
  return [];
}

function saveSessions(sessions: ChatSession[]) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

function formatTimeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffMonths = Math.floor(diffDays / 30);
  
  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 30) return `${diffDays}d`;
  return `${diffMonths}mo`;
}

export function ClaudeSessionsPanel({ onOpenSession, activeSessionId, claudeFolder, onUpdateClaudeFolder }: Props) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const refreshSessions = () => {
    setSessions(loadSessions());
  };

  useEffect(() => {
    refreshSessions();
    const handleUpdate = () => { refreshSessions(); };
    window.addEventListener("claude-sessions-updated", handleUpdate);
    return () => window.removeEventListener("claude-sessions-updated", handleUpdate);
  }, []);

  const handleSelectFolder = async () => {
    try {
      const dir = await open({ directory: true, multiple: false });
      if (typeof dir !== "string") return;
      onUpdateClaudeFolder(dir);
    } catch (e) {
      console.error("Failed to select folder", e);
    }
  };

  if (!claudeFolder) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f3f3f3", userSelect: "none", padding: "16px", overflowY: "auto", width: "100%", boxSizing: "border-box" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, textAlign: "center", gap: "16px", padding: "8px 0", minHeight: "250px" }}>
          <div style={{
                 position: "relative",
                 display: "flex",
                 alignItems: "center",
                 justifyContent: "center",
                 padding: "16px",
                 borderRadius: "9999px",
                 border: "1px solid #e5e5e5",
                 background: "radial-gradient(circle, #ffffff 60%, #fff3f0 100%)",
                 boxShadow: "0 8px 20px -6px rgba(224, 87, 62, 0.15)"
               }}>
            <svg viewBox="0 0 11 8" style={{ width: 40, height: 29, fill: "#e0573e", filter: "drop-shadow(0 2px 4px rgba(224, 87, 62, 0.15))" }}>
              <path d="M3 0h1v1H3zm5 0h1v1H8zm-5 1h1v1H3zm5 0h1v1H8zm-6 1h9v1H2zm0 1h2v1H2zm3 0h1v1H5zm2 0h2v1H7zm-7 1h11v1H0zm0 1h1v1H0zm2 0h7v1H2zm8 0h1v1H10zm-9 1h1v1H1zm8 0h1v1H9z" />
            </svg>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "0 4px" }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a", margin: 0 }}>
              Claude Code
            </h3>
            <p style={{ fontSize: 12, color: "#666", lineHeight: 1.4, margin: 0 }}>
              Claude Code needs a local project directory to search files, run commands, and execute edits.
            </p>
          </div>

          <button
            onClick={handleSelectFolder}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              width: "100%",
              padding: "8px 0",
              borderRadius: "8px",
              fontSize: "12.5px",
              fontWeight: 600,
              color: "#fff",
              cursor: "pointer",
              background: "linear-gradient(135deg, #e0573e 0%, #d04a31 100%)",
              border: "none",
              boxShadow: "0 3px 8px rgba(224, 87, 62, 0.25)",
              marginTop: 8
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "linear-gradient(135deg, #e3664f 0%, #d8573f 100%)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(224, 87, 62, 0.35)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "linear-gradient(135deg, #e0573e 0%, #d04a31 100%)";
              e.currentTarget.style.boxShadow = "0 3px 8px rgba(224, 87, 62, 0.25)";
            }}
          >
            <span className="codicon codicon-folder-opened" style={{ fontSize: 14 }} />
            Choose project folder
          </button>
        </div>

        <div style={{ textAlign: "center", padding: "16px 4px 8px 4px", marginTop: "auto", fontSize: 10.5, color: "#888", lineHeight: 1.35, flexShrink: 0 }}>
          Tip: You can manage this folder anytime from the Settings panel.
        </div>
      </div>
    );
  }

  const handleCreateSession = () => {
    const newSession: ChatSession = {
      id: crypto.randomUUID(),
      title: "New session",
      timestamp: Date.now()
    };
    const updated = [newSession, ...sessions];
    saveSessions(updated);
    setSessions(updated);
    onOpenSession(newSession.id, newSession.title);
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.filter(s => s.id !== id);
    saveSessions(updated);
    setSessions(updated);
    localStorage.removeItem(`claude_messages_${id}`);
    window.dispatchEvent(new Event("claude-sessions-updated"));
    window.dispatchEvent(new CustomEvent("claude-session-deleted", { detail: { id } }));
  };

  const handleStartRename = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(session.id);
    setEditVal(session.title);
  };

  const handleFinishRename = (id: string) => {
    if (editVal.trim()) {
      const updated = sessions.map(s => s.id === id ? { ...s, title: editVal.trim() } : s);
      saveSessions(updated);
      setSessions(updated);
      window.dispatchEvent(new Event("claude-sessions-updated"));
    }
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Enter") handleFinishRename(id);
    if (e.key === "Escape") setEditingId(null);
  };

  const filteredSessions = sessions.filter(s => 
    s.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f3f3f3", userSelect: "none", width: "100%" }}>
      {/* Panel Header */}
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "#6f6f6f" }}>
          CLAUDE CODE
        </span>
        
        {/* + New Session Button */}
        <button
          onClick={handleCreateSession}
          className="btn-secondary"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            width: "100%",
            padding: "6px 12px",
            borderRadius: "4px",
            fontSize: "13px",
            border: "1px solid #cecece",
            background: "#fff",
            color: "#333",
            cursor: "pointer",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
          }}
        >
          <span className="codicon codicon-add" style={{ fontSize: 14 }} />
          New session
        </button>
      </div>

      {/* Search Input */}
      <div style={{ padding: "8px 14px", borderBottom: "1px solid #e5e5e5" }}>
        <div style={{ position: "relative" }}>
          <input
            type="text"
            placeholder="Search sessions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "6px 10px",
              fontSize: 12,
              border: "1px solid #d4d4d4",
              borderRadius: 4,
              outline: "none",
              background: "#fff"
            }}
          />
        </div>
      </div>

      {/* Session list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {filteredSessions.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px", fontSize: "12px", color: "#888" }}>
            No sessions found
          </div>
        ) : (
          filteredSessions.map(session => {
            const isActive = session.id === activeSessionId;
            const isEditing = session.id === editingId;
            const isHovered = session.id === hoveredId;

            return (
              <div
                key={session.id}
                onClick={() => !isEditing && onOpenSession(session.id, session.title)}
                onMouseEnter={() => setHoveredId(session.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 14px",
                  fontSize: "12.5px",
                  cursor: "pointer",
                  background: isActive ? "#ffffff" : isHovered ? "#e8e8e8" : "transparent",
                  borderBottom: "1px solid #e9e9e9",
                  color: isActive ? "#007acc" : "#444",
                  transition: "background 0.15s ease"
                }}
              >
                {isEditing ? (
                  <input
                    type="text"
                    value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    onBlur={() => handleFinishRename(session.id)}
                    onKeyDown={e => handleKeyDown(e, session.id)}
                    autoFocus
                    style={{
                      flex: 1,
                      fontSize: 12,
                      padding: "2px 4px",
                      border: "1px solid #007acc",
                      borderRadius: 2,
                      outline: "none"
                    }}
                  />
                ) : (
                  <span 
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flex: 1,
                      fontWeight: isActive ? 600 : "normal"
                    }}
                    title={session.title}
                  >
                    {session.title}
                  </span>
                )}

                {/* Date / Actions Column */}
                {!isEditing && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "11px",
                    color: "#888",
                    marginLeft: "8px",
                    flexShrink: 0
                  }}>
                    {/* Time Elapsed (only shows when not hovered) */}
                    {!isHovered && (
                      <span>
                        {formatTimeAgo(session.timestamp)}
                      </span>
                    )}

                    {/* Actions (only shows on hover) */}
                    {isHovered && (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <button
                          title="Rename"
                          onClick={e => handleStartRename(session, e)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#666", padding: 2, display: "flex", alignItems: "center" }}
                        >
                          <span className="codicon codicon-edit" style={{ fontSize: 13 }} />
                        </button>
                        <button
                          title="Delete"
                          onClick={e => handleDeleteSession(session.id, e)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#e81123", padding: 2, display: "flex", alignItems: "center" }}
                        >
                          <span className="codicon codicon-trash" style={{ fontSize: 13 }} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
