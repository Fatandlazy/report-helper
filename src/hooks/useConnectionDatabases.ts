import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DbConnection } from "../types";

export function useConnectionDatabases(connections: DbConnection[], connId: string) {
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedDb, setSelectedDb] = useState("");

  useEffect(() => {
    const conn = connections.find(c => c.id === connId);
    if (!conn) {
      setDatabases([]);
      setSelectedDb("");
      return;
    }
    const initialDb = conn.connectionString.match(/(?:Initial Catalog|Database)=([^;]+)/i)?.[1]?.trim() ?? "";
    setSelectedDb(initialDb);
    invoke<string[]>("get_databases", { connectionString: conn.connectionString })
      .then(dbs => {
        setDatabases(dbs);
        if (initialDb && !dbs.some(d => d.toLowerCase() === initialDb.toLowerCase())) {
          setDatabases(prev => [...new Set([initialDb, ...prev])].sort());
        }
      })
      .catch(() => setDatabases([]));
  }, [connId, connections]);

  return { databases, selectedDb, setSelectedDb };
}
