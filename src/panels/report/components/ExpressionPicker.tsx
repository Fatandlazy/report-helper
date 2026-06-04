import { useState } from "react";
import { RDL_EXPRESSIONS } from "../../../data/expressions";

export function ExpressionPicker({ onSelect }: { onSelect: (val: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "absolute", right: 5, top: "50%", transform: "translateY(-50%)" }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(!open); }}
        title="Expression Helper"
        style={{ color: "#007acc", padding: 4 }}
      >
        <span className="codicon codicon-wand" style={{ fontSize: 13 }} />
      </button>

      {open && (
        <>
          <div
            onClick={e => { e.stopPropagation(); setOpen(false); }}
            style={{ position: "fixed", inset: 0, zIndex: 1000 }}
          />
          <div style={{
            position: "absolute", top: "100%", right: 0, background: "#fff",
            border: "1px solid #ccc", borderRadius: 4, boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 1001, width: 250, maxHeight: 300, overflowY: "auto", padding: "4px 0",
          }}>
            <div style={{ padding: "6px 12px", fontSize: 10, fontWeight: 600, color: "#999", borderBottom: "1px solid #eee" }}>
              COMMON EXPRESSIONS
            </div>
            {RDL_EXPRESSIONS.map(ex => (
              <div
                key={ex.label}
                onClick={e => { e.stopPropagation(); onSelect(ex.insertText); setOpen(false); }}
                style={{ padding: "6px 12px", cursor: "pointer", fontSize: 12 }}
                className="tree-item"
                onMouseEnter={e => (e.currentTarget.style.background = "#e8e8e8")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ fontWeight: 600, color: "#333" }}>{ex.label}</div>
                <div style={{ fontSize: 10, color: "#888", fontFamily: "monospace" }}>{ex.insertText}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
