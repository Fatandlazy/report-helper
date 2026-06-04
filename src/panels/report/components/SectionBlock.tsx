export function SectionBlock({ title, icon, children, action }: {
  title: string;
  icon: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
        <span className={`codicon ${icon}`} style={{ fontSize: 14, color: "#777" }} />
        <span className="section-label" style={{ flex: 1 }}>{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}
