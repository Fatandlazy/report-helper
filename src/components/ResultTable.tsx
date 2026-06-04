import { useState } from "react";
import { QueryResult } from "../types";

export function ResultTable({ result }: { result: QueryResult }) {
  const [copiedCell, setCopiedCell] = useState<{ r: number; c: string } | null>(null);

  if (result.rows.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#aaa", fontSize: 13 }}>
        0 rows returned
      </div>
    );
  }

  const copyCell = async (val: unknown, rowIdx: number, colName: string) => {
    try {
      await navigator.clipboard.writeText(String(val ?? ""));
      setCopiedCell({ r: rowIdx, c: colName });
      setTimeout(() => setCopiedCell(null), 2000);
    } catch {}
  };

  return (
    <div style={{ width: "100%", height: "100%", overflow: "auto" }}>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", tableLayout: "auto", background: "#fff" }}>
        <thead style={{ position: "sticky", top: 0, zIndex: 10, background: "#f3f3f3", boxShadow: "0 1px 0 #e0e0e0" }}>
          <tr>
            <th style={{ width: 40, borderRight: "1px solid #e0e0e0" }} />
            {result.columns.map(c => (
              <th key={c} style={{
                padding: "6px 12px", textAlign: "left", fontWeight: 600,
                color: "#555", whiteSpace: "nowrap",
                borderBottom: "1px solid #e0e0e0", borderRight: "1px solid #eee",
              }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr
              key={i}
              style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f0f7ff")}
              onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "#fafafa")}
            >
              <td style={{
                textAlign: "center", color: "#aaa", fontSize: 10,
                borderBottom: "1px solid #f0f0f0", borderRight: "1px solid #e0e0e0",
                background: "#fdfdfd",
              }}>
                {i + 1}
              </td>
              {result.columns.map(c => {
                const val = row[c];
                const isCopied = copiedCell?.r === i && copiedCell?.c === c;
                return (
                  <td
                    key={c}
                    onDoubleClick={() => copyCell(val, i, c)}
                    title="Double click to copy"
                    style={{
                      padding: "4px 12px", whiteSpace: "nowrap",
                      borderBottom: "1px solid #f0f0f0", borderRight: "1px solid #f5f5f5",
                      color: val === null ? "#ccc" : "#333",
                      fontStyle: val === null ? "italic" : "normal",
                      position: "relative", maxWidth: 400,
                      overflow: "hidden", textOverflow: "ellipsis",
                    }}
                  >
                    {val === null ? "NULL" : String(val)}
                    {isCopied && (
                      <div style={{
                        position: "absolute", inset: 0,
                        background: "rgba(0,120,212,0.1)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#0078d4", fontWeight: 600, fontSize: 10,
                      }}>
                        COPIED
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
