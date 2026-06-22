import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Workbook, WorkbookInstance } from "@fortune-sheet/react";
import { transformExcelToFortune } from "@corbe30/fortune-excel";
import type { Sheet } from "@fortune-sheet/core";
import "@fortune-sheet/react/dist/index.css";
import { ReportTab } from "../../types";

interface Props {
  tab: ReportTab;
}

function base64ToFile(b64: string, fileName: string): File {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File(
    [new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })],
    fileName
  );
}

export function XlsxView({ tab }: Props) {
  const [sheets, setSheets] = useState<Sheet[]>([{ name: "Sheet1", celldata: [], id: "1" }]);
  const [key, setKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const workbookRef = useRef<WorkbookInstance>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    invoke<string>("read_file_base64", { path: tab.path })
      .then(async b64 => {
        const fileName = tab.path.replace(/\\/g, "/").split("/").pop() || "file.xlsx";
        const file = base64ToFile(b64, fileName);
        await transformExcelToFortune(file, setSheets, setKey, workbookRef);
        if (!cancelled) setLoading(false);
      })
      .catch(e => {
        if (!cancelled) {
          setError(String(e));
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [tab.path]);

  return (
    <div ref={containerRef} style={{ position: "relative", height: "100%", width: "100%", overflow: "hidden" }}>
      {size && (
        <div style={{ width: size.w, height: size.h }}>
          <Workbook
            key={key}
            ref={workbookRef}
            data={sheets}
            onChange={setSheets}
            showToolbar={false}
            showFormulaBar={false}
            showSheetTabs={true}
            allowEdit={false}
          />
        </div>
      )}

      {loading && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#fff", zIndex: 10 }}>
          <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 22, color: "#aaa" }} />
          <span style={{ fontSize: 13, color: "#aaa", marginTop: 10 }}>Loading spreadsheet…</span>
        </div>
      )}

      {error && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#fff", zIndex: 10 }}>
          <span className="codicon codicon-error" style={{ fontSize: 28, color: "#c00" }} />
          <span style={{ fontSize: 13, color: "#c00", marginTop: 10, maxWidth: 400, textAlign: "center" }}>{error}</span>
        </div>
      )}
    </div>
  );
}
