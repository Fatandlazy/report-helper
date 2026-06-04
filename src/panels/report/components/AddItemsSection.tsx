import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ReportParameter, DataSetInfo, ReportMetadata } from "../../../types";

export function AddItemsSection({ isEditMode, rdlPath, onRefresh, metadata }: {
  isEditMode: boolean;
  rdlPath: string;
  onRefresh: () => void;
  metadata: ReportMetadata;
}) {
  const [showAddParam, setShowAddParam] = useState(false);
  const [showAddDs, setShowAddDs] = useState(false);
  const [newParam, setNewParam] = useState<Partial<ReportParameter>>({
    name: "", prompt: "", dataType: "String", nullable: false, multiValue: false,
  });
  const [newDs, setNewDs] = useState<Partial<DataSetInfo>>({
    name: "", dataSourceName: metadata.dataSources[0]?.name || "", commandType: "Text", commandText: "",
  });
  const [saving, setSaving] = useState(false);

  if (!isEditMode) return null;

  const handleAddParam = async () => {
    if (!newParam.name) return;
    setSaving(true);
    try {
      await invoke("add_rdl_parameter", { path: rdlPath, param: { ...newParam, defaultValue: "" } });
      onRefresh();
      setShowAddParam(false);
      setNewParam({ name: "", prompt: "", dataType: "String", nullable: false, multiValue: false });
    } catch (err) { alert(err); } finally { setSaving(false); }
  };

  const handleAddDs = async () => {
    if (!newDs.name || !newDs.dataSourceName) return;
    setSaving(true);
    try {
      await invoke("add_rdl_dataset", { path: rdlPath, ds: { ...newDs, commandText: newDs.commandText || "SELECT 1" } });
      onRefresh();
      setShowAddDs(false);
      setNewDs({ name: "", dataSourceName: metadata.dataSources[0]?.name || "", commandType: "Text", commandText: "" });
    } catch (err) { alert(err); } finally { setSaving(false); }
  };

  return (
    <div style={{ display: "flex", gap: 10, borderBottom: "1px solid #eee", paddingBottom: 15 }}>
      <button className="btn-secondary" onClick={() => setShowAddParam(true)} style={{ fontSize: 12, padding: "4px 10px" }}>
        <span className="codicon codicon-add" /> Add Parameter
      </button>
      <button className="btn-secondary" onClick={() => setShowAddDs(true)} style={{ fontSize: 12, padding: "4px 10px" }}>
        <span className="codicon codicon-add" /> Add Dataset
      </button>

      {showAddParam && (
        <div style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          background: "#fff", border: "1px solid #ccc", borderRadius: 4, padding: 20, zIndex: 100,
          boxShadow: "0 4px 20px rgba(0,0,0,0.2)", width: 400, display: "flex", flexDirection: "column", gap: 15,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Add New Parameter</div>
          <div>
            <label style={{ display: "block", fontSize: 11, marginBottom: 4 }}>Name</label>
            <input type="text" value={newParam.name} onChange={e => setNewParam({ ...newParam, name: e.target.value })} placeholder="e.g. OrgID" />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, marginBottom: 4 }}>Prompt</label>
            <input type="text" value={newParam.prompt} onChange={e => setNewParam({ ...newParam, prompt: e.target.value })} placeholder="e.g. Organization:" />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, marginBottom: 4 }}>Data Type</label>
            <select value={newParam.dataType} onChange={e => setNewParam({ ...newParam, dataType: e.target.value as any })}>
              <option value="String">String</option>
              <option value="Integer">Integer</option>
              <option value="DateTime">DateTime</option>
              <option value="Boolean">Boolean</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 15 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={newParam.nullable} onChange={e => setNewParam({ ...newParam, nullable: e.target.checked })} />
              Nullable
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={newParam.multiValue} onChange={e => setNewParam({ ...newParam, multiValue: e.target.checked })} />
              Multi
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
            <button className="btn-secondary" onClick={() => setShowAddParam(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleAddParam} disabled={saving}>
              {saving ? "Adding..." : "Add Parameter"}
            </button>
          </div>
        </div>
      )}

      {showAddDs && (
        <div style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          background: "#fff", border: "1px solid #ccc", borderRadius: 4, padding: 20, zIndex: 100,
          boxShadow: "0 4px 20px rgba(0,0,0,0.2)", width: 400, display: "flex", flexDirection: "column", gap: 15,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Add New Dataset</div>
          <div>
            <label style={{ display: "block", fontSize: 11, marginBottom: 4 }}>Name</label>
            <input type="text" value={newDs.name} onChange={e => setNewDs({ ...newDs, name: e.target.value })} placeholder="e.g. dsMain" />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, marginBottom: 4 }}>Data Source</label>
            <select value={newDs.dataSourceName} onChange={e => setNewDs({ ...newDs, dataSourceName: e.target.value })}>
              {metadata.dataSources.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, marginBottom: 4 }}>Command Type</label>
            <select value={newDs.commandType} onChange={e => setNewDs({ ...newDs, commandType: e.target.value })}>
              <option value="Text">SQL Text</option>
              <option value="StoredProcedure">Stored Procedure</option>
            </select>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
            <button className="btn-secondary" onClick={() => setShowAddDs(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleAddDs} disabled={saving}>
              {saving ? "Adding..." : "Add Dataset"}
            </button>
          </div>
        </div>
      )}

      {(showAddParam || showAddDs) && (
        <div
          onClick={() => { setShowAddParam(false); setShowAddDs(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.1)", zIndex: 90 }}
        />
      )}
    </div>
  );
}
