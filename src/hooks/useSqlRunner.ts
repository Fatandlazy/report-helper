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
  const [results, setResults] = useState<QueryResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(opts: RunOptions): Promise<{ results: QueryResult[]; isSafeApplied: boolean } | null> {
    const { sql, connectionString, params = {}, isStoredProc = false, database = null, safeRun = false } = opts;

    const batches = sql.split(/^[ \t]*GO[ \t]*(?:\d+)?[ \t]*\r?$/gim).map(s => s.trim()).filter(s => s.length > 0);
    if (batches.length === 0) return null;

    setRunning(true);
    setError(null);
    try {
      let accumulated: QueryResult[] = [];
      let finalIsSafe = false;

      for (const batch of batches) {
        const clean = batch.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
        const isDDL = /^(CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i.test(clean);
        const isSafeApplied = safeRun && !isDDL;
        const finalSql = isSafeApplied ? `BEGIN TRANSACTION;\n${batch}\nROLLBACK;` : batch;

        const res = await invoke<QueryResult>("run_sql", {
          sql: finalSql, connectionString, params, isStoredProc, database,
        });
        accumulated.push(res);
        finalIsSafe = isSafeApplied;
      }
      setResults(accumulated);
      return { results: accumulated, isSafeApplied: finalIsSafe };
    } catch (e: any) {
      setError(String(e));
      return null;
    } finally {
      setRunning(false);
    }
  }

  function reset() {
    setResults(null);
    setError(null);
  }

  return { results, running, error, run, reset };
}
