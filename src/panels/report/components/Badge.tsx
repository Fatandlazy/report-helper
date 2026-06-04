export function Badge({ label, color, icon }: { label: string; color: string; icon: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 3,
      padding: "1px 6px", borderRadius: 10, background: color + "15",
      color, border: `1px solid ${color}30`, fontSize: 9, fontWeight: 600,
      textTransform: "uppercase", letterSpacing: "0.02em",
    }}>
      <span className={`codicon ${icon}`} style={{ fontSize: 9 }} />
      {label}
    </div>
  );
}
