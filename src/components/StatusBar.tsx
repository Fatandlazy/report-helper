interface Props {
  left: string;
  right: string;
}

export function StatusBar({ left, right }: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 22,
        padding: "0 10px",
        background: "#0078d4",
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {left && (
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#fff" }}>
            <span className="codicon codicon-server" style={{ fontSize: 13 }} />
            {left}
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {right && (
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#fff" }}>
            <span className="codicon codicon-table" style={{ fontSize: 13 }} />
            {right}
          </span>
        )}
      </div>
    </div>
  );
}
