import { useState } from "react";
import { QueryResult } from "../types";
import { ResultTable } from "./ResultTable";

export function MultiResultTable({ results }: { results: QueryResult[] }) {
  const [viewMode, setViewMode] = useState<"list" | "tab">("list");
  const [activeTab, setActiveTab] = useState(0);

  if (!results || results.length === 0) return null;

  if (results.length === 1) {
    return <ResultTable result={results[0]} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fcfcfc", overflow: "hidden" }}>
      {/* Toolbar / Tab Headers */}
      <div style={{ 
        display: "flex", alignItems: "center", justifyContent: "space-between", 
        padding: "4px 8px 0 8px", background: "#f3f3f3", borderBottom: "1px solid #ccc", flexShrink: 0 
      }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 28 }}>
          {viewMode === "tab" && results.map((r, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              style={{
                padding: "4px 12px",
                fontSize: 11,
                border: "1px solid #ccc",
                borderBottom: activeTab === i ? "1px solid #fff" : "1px solid #ccc",
                background: activeTab === i ? "#fff" : "transparent",
                color: activeTab === i ? "#00539c" : "#666",
                fontWeight: activeTab === i ? 600 : 400,
                cursor: "pointer",
                borderRadius: "4px 4px 0 0",
                marginBottom: -1, // Overlap the container's bottom border
                height: activeTab === i ? 28 : 26,
                zIndex: activeTab === i ? 10 : 1
              }}
              onMouseEnter={e => { if (activeTab !== i) e.currentTarget.style.background = "#eaeaea"; }}
              onMouseLeave={e => { if (activeTab !== i) e.currentTarget.style.background = "transparent"; }}
            >
              Result {i + 1} <span style={{ color: activeTab === i ? "#00539c" : "#999", fontSize: 10 }}>({r.rowCount})</span>
            </button>
          ))}
          {viewMode === "list" && (
            <span style={{ fontSize: 11, fontWeight: 600, color: "#555", padding: "0 4px 6px 4px" }}>
              {results.length} Results
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", background: "#e0e0e0", padding: 2, borderRadius: 4, marginBottom: 4 }}>
          <button
            onClick={() => setViewMode("list")}
            style={{
              padding: "2px 8px", fontSize: 10, borderRadius: 3, border: "none", cursor: "pointer",
              background: viewMode === "list" ? "#fff" : "transparent",
              color: viewMode === "list" ? "#333" : "#666",
              fontWeight: viewMode === "list" ? 600 : 400,
              boxShadow: viewMode === "list" ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
            }}
          >
            <span className="codicon codicon-list-flat" style={{ fontSize: 11, marginRight: 4, verticalAlign: "middle" }} />
            List
          </button>
          <button
            onClick={() => { setViewMode("tab"); setActiveTab(0); }}
            style={{
              padding: "2px 8px", fontSize: 10, borderRadius: 3, border: "none", cursor: "pointer",
              background: viewMode === "tab" ? "#fff" : "transparent",
              color: viewMode === "tab" ? "#333" : "#666",
              fontWeight: viewMode === "tab" ? 600 : 400,
              boxShadow: viewMode === "tab" ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
            }}
          >
            <span className="codicon codicon-layout-panel" style={{ fontSize: 11, marginRight: 4, verticalAlign: "middle" }} />
            Tabs
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflowY: "auto", position: "relative", background: viewMode === "list" ? "#f0f0f0" : "#fff" }}>
        {viewMode === "list" && (
          <div style={{ display: "flex", flexDirection: "column", paddingBottom: 10 }}>
            {results.map((r, i) => (
              <div key={i} style={{ flexShrink: 0, minHeight: 250, margin: "10px 10px 0 10px", border: "1px solid #ccc", background: "#fff", display: "flex", flexDirection: "column", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                <div style={{ padding: "6px 10px", background: "#fafafa", borderBottom: "1px solid #eee", fontSize: 11, fontWeight: 600, color: "#333", display: "flex", justifyContent: "space-between" }}>
                  <span>Result {i + 1}</span>
                  <span style={{ color: "#888", fontWeight: "normal" }}>{r.rowCount} rows</span>
                </div>
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <ResultTable result={r} />
                </div>
              </div>
            ))}
          </div>
        )}
        
        {viewMode === "tab" && results[activeTab] && (
          <div style={{ height: "100%", width: "100%", overflow: "hidden" }}>
            <ResultTable result={results[activeTab]} />
          </div>
        )}
      </div>
    </div>
  );
}
