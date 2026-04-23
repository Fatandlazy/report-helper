import { ReportTab } from "../types";

interface Props {
  tabs: ReportTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

export function TabBar({ tabs, activeId, onSelect, onClose }: Props) {
  if (tabs.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        overflowX: "auto",
        overflowY: "hidden",
        height: 35,
        background: "#ececec",
        borderBottom: "1px solid #d4d4d4",
        flexShrink: 0,
      }}
    >
      {tabs.map(tab => {
        const isActive = tab.id === activeId;
        return (
          <div
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              height: 35,
              minWidth: 80,
              maxWidth: 200,
              padding: "0 6px 0 12px",
              cursor: "pointer",
              flexShrink: 0,
              borderRight: "1px solid #d4d4d4",
              borderTop: isActive ? "1px solid #0078d4" : "1px solid transparent",
              background: isActive ? "#ffffff" : "transparent",
              color: isActive ? "#1e1e1e" : "#888",
              userSelect: "none",
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(0,0,0,0.05)"; }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
          >
            <span
              className={tab.title.toLowerCase().endsWith(".sql") ? "codicon codicon-database" : "codicon codicon-file-code"}
              style={{ 
                fontSize: 13, 
                flexShrink: 0, 
                color: tab.title.toLowerCase().endsWith(".sql") 
                  ? (isActive ? "#e38100" : "#aaa")
                  : (tab.source === "server" ? "#0078d4" : (isActive ? "#519aba" : "#aaa")) 
              }}
            />
            <span
              style={{
                fontSize: 13,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
                fontWeight: isActive ? 400 : 400,
              }}
              title={tab.path}
            >
              {tab.title}
            </span>
            <button
              onClick={e => { e.stopPropagation(); onClose(tab.id); }}
              style={{
                width: 18,
                height: 18,
                background: "none",
                border: "none",
                cursor: "pointer",
                borderRadius: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: isActive ? "#666" : "transparent",
                flexShrink: 0,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = "#333";
                e.currentTarget.style.background = "rgba(0,0,0,0.12)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = isActive ? "#666" : "transparent";
                e.currentTarget.style.background = "none";
              }}
            >
              <span className="codicon codicon-close" style={{ fontSize: 12, pointerEvents: "none" }} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
