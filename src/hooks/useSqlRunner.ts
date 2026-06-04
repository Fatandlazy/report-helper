import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { QueryResult } from "../types";

interface RunOptions {
  sql: string;
  connectionString: string;
  params?: Record<string, string | null>;
  isStoredProc?: boolean;
  database?: string | null;
  safeRun?: boolean;
}

export function useSqlRunner() {
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(opts: RunOptions): Promise<{ result: QueryResult; isSafeApplied: boolean } | null> {
    const { sql, connectionString, params = {}, isStoredProc = false, database = null, safeRun = false } = opts;

    const stripped = sql.replace(/^[ \t]*GO[ \t]*(\d+)?[ \t]*$/gim, "").trim();
    if (!stripped) return null;

    const clean = stripped.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
    const isDDL = /^(CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i.test(clean);
    const isSafeApplied = safeRun && !isDDL;
    const finalSql = isSafeApplied ? `BEGIN TRANSACTION;\n${stripped}\nROLLBACK;` : stripped;

    setRunning(true);
    setError(null);
    try {
      const res = await invoke<QueryResult>("run_sql", {
        sql: finalSql, connectionString, params, isStoredProc, database,
      });
      setResult(res);
      return { result: res, isSafeApplied };
    } catch (e: any) {
      setError(String(e));
      return null;
    } finally {
      setRunning(false);
    }
  }

  function reset() {
    setResult(null);
    setError(null);
  }

  return { result, running, error, run, reset };
}
