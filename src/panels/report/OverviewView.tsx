import { ReportMetadata, DataSetInfo, ReportParameter, DataSourceInfo, ReportTab } from "../../types";
import { SectionBlock } from "./components/SectionBlock";
import { DatasetCard } from "./components/DatasetCard";
import { ParameterCard } from "./components/ParameterCard";
import { AddItemsSection } from "./components/AddItemsSection";

export function OverviewView({ metadata, isEditMode, rdlPath, onRefresh, onUpdateTabMetadata, onTestDataset }: {
  metadata: ReportMetadata;
  isEditMode: boolean;
  rdlPath: string;
  onRefresh: () => void;
  onUpdateTabMetadata: (path: string, metadata: Partial<ReportTab>) => void;
  onTestDataset: (dsName: string) => void;
}) {
  const empty = metadata.dataSets.length === 0 && metadata.parameters.length === 0 && metadata.dataSources.length === 0;

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 24 }}>
      {empty && <div style={{ fontSize: 13, color: "#aaa" }}>No datasets or parameters found.</div>}

      <AddItemsSection isEditMode={isEditMode} rdlPath={rdlPath} onRefresh={onRefresh} metadata={metadata} />

      {metadata.dataSources.length > 0 && (
        <SectionBlock title="Data Sources" icon="codicon-database">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
            {metadata.dataSources.map((ds: DataSourceInfo) => (
              <div key={ds.name} style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "8px 12px", background: "#f7f7f7", border: "1px solid #eee", borderRadius: 3,
              }}>
                <span className="codicon codicon-server" style={{ fontSize: 14, color: "#888", marginTop: 1, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>{ds.name}</div>
                  {ds.connectionString && (
                    <div style={{ fontSize: 11, color: "#888", fontFamily: "monospace", marginTop: 2, wordBreak: "break-all" }}>
                      {ds.connectionString}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SectionBlock>
      )}

      {metadata.dataSets.length > 0 && (
        <SectionBlock title={`Datasets (${metadata.dataSets.length})`} icon="codicon-table">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {metadata.dataSets.map((ds: DataSetInfo) => (
              <DatasetCard
                key={ds.name}
                dataset={ds}
                isEditMode={isEditMode}
                rdlPath={rdlPath}
                onRefresh={onRefresh}
                onUpdateTabMetadata={onUpdateTabMetadata}
                onTest={() => onTestDataset(ds.name)}
              />
            ))}
          </div>
        </SectionBlock>
      )}

      {metadata.parameters.length > 0 && (
        <SectionBlock title={`Parameters (${metadata.parameters.length})`} icon="codicon-symbol-parameter">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {metadata.parameters.map((p: ReportParameter) => (
              <ParameterCard
                key={p.name}
                parameter={p}
                isEditMode={isEditMode}
                rdlPath={rdlPath}
                onRefresh={onRefresh}
                onUpdateTabMetadata={onUpdateTabMetadata}
              />
            ))}
          </div>
        </SectionBlock>
      )}
    </div>
  );
}
