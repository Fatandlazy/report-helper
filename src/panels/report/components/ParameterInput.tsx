import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ReportParameter, ReportMetadata, DbConnection, DataSetInfo,
  QueryParameter, ParameterValue, QueryResult,
} from "../../../types";

export function ParameterInput({ p, value, onChange, metadata, connections, activeConnectionId, allParams }: {
  p: ReportParameter;
  value: string | null;
  onChange: (val: string | null) => void;
  metadata: ReportMetadata | null;
  connections: DbConnection[];
  activeConnectionId: string;
  allParams: Record<string, string | null>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dynamicValues, setDynamicValues] = useState<ParameterValue[]>([]);

  const isNull = value === null;
  const ref = p.availableValues?.dataSetReference;

  const ds = useMemo(() => {
    if (!ref || !metadata) return null;
    return metadata.dataSets.find((d: DataSetInfo) => d.name.toLowerCase() === ref.dataSetName.toLowerCase()) ?? null;
  }, [ref, metadata]);

  const relevantParams = useMemo(() => {
    const res: Record<string, string | null> = {};
    if (!ds) return res;
    const coerce = (v: string | null) => {
      if (!v) return v;
      if (v.toLowerCase() === "true") return "1";
      if (v.toLowerCase() === "false") return "0";
      return v;
    };
    if (ds.queryParameters?.length) {
      ds.queryParameters.forEach((qp: QueryParameter) => {
        const match = qp.value.match(/Parameters!([^.]+)/i);
        const paramName = match ? match[1] : qp.name.replace("@", "");
        const key = Object.keys(allParams).find(k => k.toLowerCase() === paramName.toLowerCase());
        if (key) res[qp.name.replace("@", "")] = coerce(allParams[key]);
      });
    } else if (ds.commandText) {
      const lower = ds.commandText.toLowerCase();
      for (const key of Object.keys(allParams)) {
        if (lower.includes(`@${key.toLowerCase()}`)) res[key] = coerce(allParams[key]);
      }
    }
    return res;
  }, [ds, allParams]);

  const relevantParamsKey = JSON.stringify(relevantParams);

  useEffect(() => {
    if (!ref || !ds) return;
    let conn = connections.find(c => c.id === activeConnectionId);
    if (!conn && connections.length > 0) conn = connections[0];
    if (!conn) { setError("No connection selected"); return; }

    setLoading(true);
    setError(null);
    invoke<QueryResult>("run_sql", {
      sql: ds.commandText,
      connectionString: conn.connectionString,
      params: relevantParams,
      isStoredProc: ds.commandType.toLowerCase().includes("stored"),
    }).then(res => {
      const get = (obj: any, key: string) => {
        const k = Object.keys(obj).find(k => k.toLowerCase() === key?.toLowerCase());
        return k ? obj[k] : undefined;
      };
      setDynamicValues(res.rows.map(row => ({
        label: String(get(row, ref.labelField) ?? get(row, ref.valueField) ?? ""),
        value: String(get(row, ref.valueField) ?? ""),
      })));
    }).catch(err => {
      setError(String(err));
      setDynamicValues([]);
    }).finally(() => setLoading(false));
  }, [ref?.dataSetName, activeConnectionId, relevantParamsKey, connections, ds?.commandText]);

  const hasAvailable = p.availableValues && (
    p.availableValues.staticValues.length > 0 || p.availableValues.dataSetReference
  );
  const options = p.availableValues?.staticValues?.length
    ? p.availableValues.staticValues
    : dynamicValues;

  const renderInput = () => {
    if (hasAvailable) {
      return (
        <div style={{ position: "relative" }}>
          <select
            value={value ?? ""}
            onChange={e => onChange(e.target.value === "[NULL]" ? null : e.target.value)}
            disabled={loading || isNull}
            style={{ width: "100%", fontSize: 12 }}
          >
            {loading && <option>Loading...</option>}
            {!loading && options.length === 0 && !p.nullable && <option>No values found</option>}
            {options.map((opt: ParameterValue, i: number) => (
              <option key={i} value={opt.value}>{opt.label || opt.value}</option>
            ))}
          </select>
          {loading && (
            <span className="codicon codicon-loading codicon-modifier-spin"
              style={{ position: "absolute", right: 24, top: 6, fontSize: 12, color: "#aaa" }} />
          )}
        </div>
      );
    }

    if (p.dataType === "Boolean") {
      const isTrue = (value || "").toLowerCase() === "true" || value === "1";
      return (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "4px 8px", background: isNull ? "#f5f5f5" : "#eee",
            borderRadius: 4, cursor: isNull ? "default" : "pointer",
            width: "fit-content", opacity: isNull ? 0.6 : 1,
          }}
          onClick={() => { if (!isNull) onChange(isTrue ? "False" : "True"); }}
        >
          <span
            className={`codicon ${isTrue ? "codicon-check" : "codicon-chrome-close"}`}
            style={{ fontSize: 14, color: isTrue ? "#28a745" : "#dc3545" }}
          />
          <span style={{ fontSize: 12, fontWeight: 500 }}>{isTrue ? "True" : "False"}</span>
        </div>
      );
    }

    return (
      <input
        type={p.dataType === "Integer" || p.dataType === "Float" ? "number" : "text"}
        value={value ?? ""}
        placeholder={isNull ? "NULL" : p.dataType}
        disabled={isNull}
        onChange={e => onChange(e.target.value)}
        style={{ width: "100%", fontSize: 12, opacity: isNull ? 0.6 : 1 }}
      />
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1 }}>{renderInput()}</div>
        {p.nullable && (
          <label style={{
            display: "flex", alignItems: "center", gap: 4, fontSize: 11,
            color: isNull ? "#007fd4" : "#888", cursor: "pointer",
            whiteSpace: "nowrap", userSelect: "none",
          }}>
            <input
              type="checkbox"
              checked={isNull}
              onChange={e => onChange(e.target.checked ? null : (p.defaultValue ?? ""))}
              style={{ margin: 0, cursor: "pointer" }}
            />
            Null
          </label>
        )}
      </div>
      {error && (
        <div style={{ fontSize: 10, color: "#d32f2f", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
          <span className="codicon codicon-error" style={{ fontSize: 11 }} />
          {error}
        </div>
      )}
    </div>
  );
}
