import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ReportParameter, ReportTab } from "../../../types";
import { Badge } from "./Badge";
import { ExpressionPicker } from "./ExpressionPicker";

const CHECKBOX_FIELDS = [
  { field: "nullable" as const,   label: "Nullable" },
  { field: "allowBlank" as const, label: "Allow Blank" },
  { field: "multiValue" as const, label: "Multi-value" },
  { field: "hidden" as const,     label: "Hidden" },
];

export function ParameterCard({ parameter, isEditMode, rdlPath, onRefresh, onUpdateTabMetadata }: {
  parameter: ReportParameter;
  isEditMode: boolean;
  rdlPath: string;
  onRefresh: () => void;
  onUpdateTabMetadata: (path: string, metadata: Partial<ReportTab>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edited, setEdited] = useState<ReportParameter>({ ...parameter });

  useEffect(() => { setEdited({ ...parameter }); }, [parameter]);

  const isDirty = JSON.stringify(edited) !== JSON.stringify(parameter);

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSaving(true);
    try {
      await invoke("update_rdl_parameter", { path: rdlPath, paramName: parameter.name, updated: edited });
      const mtime = await invoke<number>("get_file_modified_time", { path: rdlPath });
      onUpdateTabMetadata(rdlPath, { lastModified: mtime });
      onRefresh();
      setExpanded(false);
    } catch (err) {
      alert("Failed to save parameter: " + err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ border: "1px solid #e8e8e8", borderRadius: 3, overflow: "hidden" }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", background: "#f7f7f7", cursor: "pointer" }}
        onMouseEnter={e => (e.currentTarget.style.background = "#f0f0f0")}
        onMouseLeave={e => (e.currentTarget.style.background = "#f7f7f7")}
      >
        <span className={`codicon ${expanded ? "codicon-chevron-down" : "codicon-chevron-right"}`} style={{ fontSize: 12, color: "#777", flexShrink: 0 }} />
        <span style={{ fontFamily: "monospace", color: "#0000cc", fontSize: 13, fontWeight: 600 }}>@{parameter.name}</span>
        <span style={{ color: "#888", fontSize: 12 }}>{parameter.dataType}</span>
        <span style={{ color: "#555", fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{parameter.prompt}</span>
        {parameter.defaultValue !== undefined && parameter.defaultValue !== null && parameter.defaultValue !== "" && (
          <div style={{ marginLeft: "auto", marginRight: 10 }}>
            <Badge label={parameter.defaultValue} color="#888" icon="codicon-symbol-constant" />
          </div>
        )}
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {parameter.multiValue && <Badge label="Multi" color="#6b40bf" icon="codicon-layers" />}
          {parameter.nullable && <Badge label="Null" color="#007acc" icon="codicon-question" />}
          {parameter.hidden && <Badge label="Hidden" color="#666" icon="codicon-eye-closed" />}
        </div>
        {isEditMode && (
          <button onClick={e => { e.stopPropagation(); setExpanded(v => !v); }} style={{ padding: "2px 6px", borderRadius: 3, color: "#007acc" }}>
            <span className="codicon codicon-edit" style={{ fontSize: 13 }} />
          </button>
        )}
      </div>

      {expanded && (
        <div style={{ padding: 12, background: "#fff", borderTop: "1px solid #eee" }}>
          {!isEditMode ? (
            <div style={{ fontSize: 12, color: "#666" }}>
              <div style={{ marginBottom: 4 }}><strong>Prompt:</strong> {parameter.prompt}</div>
              <div style={{ marginBottom: 4 }}><strong>Data Type:</strong> {parameter.dataType}</div>
              {parameter.defaultValue && <div style={{ marginBottom: 4 }}><strong>Default:</strong> {parameter.defaultValue}</div>}
              {parameter.defaultValueQuery && <div style={{ marginBottom: 4 }}><strong>Default (Query):</strong> {parameter.defaultValueQuery.dataSetName}</div>}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 4 }}>Prompt</label>
                  <div style={{ position: "relative" }}>
                    <input type="text" value={edited.prompt} onChange={e => setEdited({ ...edited, prompt: e.target.value })} style={{ paddingRight: 30 }} />
                    <ExpressionPicker onSelect={val => setEdited({ ...edited, prompt: val })} />
                  </div>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 4 }}>Data Type</label>
                  <select value={edited.dataType} onChange={e => setEdited({ ...edited, dataType: e.target.value as any })}>
                    <option value="String">String</option>
                    <option value="Integer">Integer</option>
                    <option value="Float">Float</option>
                    <option value="DateTime">DateTime</option>
                    <option value="Boolean">Boolean</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", gap: 15 }}>
                {CHECKBOX_FIELDS.map(({ field, label }) => (
                  <label key={field} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                    <input type="checkbox" checked={!!edited[field]} onChange={e => setEdited({ ...edited, [field]: e.target.checked })} />
                    {label}
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                <button onClick={() => setExpanded(false)} className="btn-secondary" style={{ fontSize: 12, padding: "3px 10px" }}>Cancel</button>
                <button onClick={handleSave} disabled={saving || !isDirty} className="btn-primary" style={{ fontSize: 12, padding: "3px 15px" }}>
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
