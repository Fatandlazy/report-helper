import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { WorkspaceFolder } from "../types";

interface SearchMatch {
  path: string;
  line: number;
  content: string;
}

interface Props {
  workspaceFolders: WorkspaceFolder[];
  onOpenFile: (path: string, name: string) => void;
}

export function SearchPanel({ workspaceFolders, onOpenFile }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (!query.trim() || workspaceFolders.length === 0) return;
    setSearching(true);
    setResults([]);
    
    try {
      // Search in the first workspace folder for now, or all of them
      const allResults: SearchMatch[] = [];
      for (const folder of workspaceFolders) {
        const folderResults = await invoke<SearchMatch[]>("search_in_files", {
          basePath: folder.path,
          query: query
        });
        allResults.push(...folderResults);
      }
      setResults(allResults);
    } catch (err) {
      console.error("Search failed", err);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#f3f3f3" }}>
      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#666", textTransform: "uppercase" }}>Search</div>
        <div style={{ position: "relative" }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="Search across files..."
            autoFocus
            style={{ 
              width: "100%", padding: "4px 8px", fontSize: 13, border: "1px solid #ddd", 
              borderRadius: 2, background: "#fff" 
            }}
          />
          <button 
            onClick={handleSearch}
            disabled={searching}
            style={{ 
              position: "absolute", right: 4, top: 4, padding: "2px 4px", 
              color: "#007acc", opacity: query ? 1 : 0.5 
            }}
          >
            <span className={`codicon ${searching ? "codicon-loading codicon-modifier-spin" : "codicon-search"}`} style={{ fontSize: 14 }} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 4px 10px 4px" }}>
        {results.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <div style={{ padding: "4px 10px", fontSize: 11, color: "#888" }}>
              {results.length} results found
            </div>
            {results.map((r, i) => {
              const fileName = r.path.split(/[\\/]/).pop() || "";
              return (
                <div 
                  key={i}
                  onClick={() => onOpenFile(r.path, fileName)}
                  style={{ 
                    padding: "6px 10px", cursor: "pointer", borderRadius: 3,
                    display: "flex", flexDirection: "column", gap: 2
                  }}
                  className="tree-item"
                  onMouseEnter={e => (e.currentTarget.style.background = "#e8e8e8")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="codicon codicon-file-code" style={{ fontSize: 14, color: "#777" }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>{fileName}</span>
                    <span style={{ fontSize: 11, color: "#aaa" }}>:{r.line}</span>
                  </div>
                  <div style={{ 
                    fontSize: 11, color: "#666", fontFamily: "monospace", 
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    paddingLeft: 20
                  }}>
                    {r.content}
                  </div>
                  <div style={{ fontSize: 9, color: "#aaa", paddingLeft: 20 }}>{r.path}</div>
                </div>
              );
            })}
          </div>
        ) : query && !searching ? (
          <div style={{ padding: 20, textAlign: "center", color: "#aaa", fontSize: 13 }}>
            No results found.
          </div>
        ) : null}
      </div>
    </div>
  );
}
