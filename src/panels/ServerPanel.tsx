import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TreeNode, CatalogItem } from "../types";

interface Props {
  initialUrl: string;
  initialUser: string;
  initialPass: string;
  onCredentialsSaved: (url: string, user: string, pass: string) => void;
  onOpenTab: (path: string, name: string, serverPath: string) => void;
  onStatus: (left: string, right: string) => void;
}

function buildTree(items: CatalogItem[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];
  const sorted = [...items].sort((a, b) => a.path.localeCompare(b.path));

  for (const item of sorted) {
    const node: TreeNode = {
      id: item.id, name: item.name, path: item.path,
      isFolder: item.type === "Folder", children: [],
    };
    nodeMap.set(item.path, node);
    const parentPath = item.path.substring(0, item.path.lastIndexOf("/")) || "/";
    if (parentPath === "/" || parentPath === item.path) roots.push(node);
    else {
      const parent = nodeMap.get(parentPath);
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  }
  return roots;
}

function TreeNodeView({ node, activeId, loadingIds, depth = 0, onSelect, onOpenPreview }: {
  node: TreeNode;
  activeId: string | null;
  loadingIds: Set<string>;
  depth?: number;
  onSelect: (n: TreeNode) => void;
  onOpenPreview: (n: TreeNode) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const isActive = !node.isFolder && node.id === activeId;
  const isLoading = loadingIds.has(node.id);
  const indent = 8 + depth * 14;

  if (node.isFolder) {
    return (
      <div>
        <div
          className="tree-row"
          style={{ paddingLeft: indent, paddingRight: 8 }}
          onClick={() => setExpanded(e => !e)}
        >
          <span
            className={`codicon ${expanded ? "codicon-chevron-down" : "codicon-chevron-right"}`}
            style={{ fontSize: 11, color: "#888", flexShrink: 0 }}
          />
          <span
            className={`codicon ${expanded ? "codicon-folder-opened" : "codicon-folder"}`}
            style={{ fontSize: 15, color: "#dcb67a", flexShrink: 0 }}
          />
          <span style={{ fontSize: 13, color: "#333", overflow: "hidden", textOverflow: "ellipsis" }}>
            {node.name}
          </span>
        </div>
        {expanded && node.children.map(c => (
          <TreeNodeView key={c.id} node={c} activeId={activeId} loadingIds={loadingIds} depth={depth + 1} onSelect={onSelect} onOpenPreview={onOpenPreview} />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`tree-row ${isActive ? "active" : ""}`}
      style={{ paddingLeft: indent + 16, paddingRight: 6, gap: 6 }}
      onClick={() => !isLoading && onSelect(node)}
    >
      <span
        className={`codicon ${isLoading ? "codicon-loading codicon-modifier-spin" : "codicon-file"}`}
        style={{ fontSize: 14, color: isActive ? "#00539c" : "#519aba", flexShrink: 0 }}
      />
      <span style={{ fontSize: 13, color: isActive ? "#00539c" : "#333", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
        {node.name}
      </span>
      {/* Preview icon — shown on hover via CSS .tree-row:hover .preview-btn */}
      {!isLoading && (
        <span
          className="codicon codicon-link-external preview-btn"
          title="Open in browser (SSRS Preview)"
          style={{ fontSize: 13, color: "#aaa", flexShrink: 0, display: "none" }}
          onClick={e => { e.stopPropagation(); onOpenPreview(node); }}
        />
      )}
    </div>
  );
}

export function ServerPanel({ initialUrl, initialUser, initialPass, onCredentialsSaved, onOpenTab, onStatus }: Props) {
  const [url, setUrl] = useState(initialUrl);
  const [user, setUser] = useState(initialUser);
  const [pass, setPass] = useState(initialPass);
  const [connecting, setConnecting] = useState(false);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    if (!url.trim()) return;
    setConnecting(true);
    setError(null);
    setTree([]);
    setActiveId(null);
    try {
      const items = await invoke<CatalogItem[]>("ssrs_get_items", { url: url.trim(), username: user, password: pass });
      setTree(buildTree(items));
      onCredentialsSaved(url.trim(), user, pass);
      onStatus("SSRS: " + url.trim(), `${items.filter(i => i.type === "Report").length} reports`);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setConnecting(false);
    }
  }

  async function handleSelectReport(node: TreeNode) {
    if (loadingIds.has(node.id)) return;
    setActiveId(node.id);
    setError(null);

    setLoadingIds(prev => new Set([...prev, node.id]));
    try {
      const tmpPath = await invoke<string>("ssrs_download_rdl", {
        url: url.trim(), username: user, password: pass,
        reportId: node.id, reportName: node.name,
      });
      onOpenTab(tmpPath, node.name, node.path);
      onStatus("SSRS", node.name);
    } catch (e: any) {
      setError(String(e));
      setActiveId(null);
    } finally {
      setLoadingIds(prev => { const s = new Set(prev); s.delete(node.id); return s; });
    }
  }

  function handleOpenPreview(node: TreeNode) {
    onOpenTab(node.id, node.name, node.path);
  }

  return (
    <div className="flex flex-col h-full" style={{ background: "#f3f3f3" }}>

      {/* ── Connection form ── */}
      <div style={{ padding: "10px 12px 12px", borderBottom: "1px solid #e0e0e0" }}>
        <div className="section-label" style={{ marginBottom: 10 }}>SSRS Server</div>

        <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 3 }}>URL</label>
        <input
          type="url"
          placeholder="http://server/Reports"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleConnect()}
          style={{ marginBottom: 8 }}
        />

        <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 3 }}>Username</label>
        <input
          type="text"
          placeholder="domain\user or user"
          value={user}
          onChange={e => setUser(e.target.value)}
          style={{ marginBottom: 8 }}
        />

        <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 3 }}>Password</label>
        <input
          type="password"
          placeholder="••••••••"
          value={pass}
          onChange={e => setPass(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleConnect()}
          style={{ marginBottom: 10 }}
        />

        <button
          onClick={handleConnect}
          disabled={connecting}
          className="btn-primary"
          style={{ width: "100%", justifyContent: "center", borderRadius: 2 }}
        >
          <span className="codicon codicon-plug" style={{ fontSize: 13 }} />
          {connecting ? "Connecting…" : "Connect"}
        </button>

        {error && (
          <div style={{
            marginTop: 8, padding: "6px 8px", fontSize: 12,
            color: "#c00", background: "#fff0f0",
            border: "1px solid #fcc", borderRadius: 2,
            wordBreak: "break-all",
          }}>
            {error}
          </div>
        )}
      </div>

      {/* ── Report tree ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {!connecting && tree.length === 0 && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "100%", gap: 10, padding: "0 20px",
          }}>
            <span className="codicon codicon-cloud" style={{ fontSize: 40, color: "#ccc" }} />
            <span style={{ fontSize: 12, color: "#aaa", textAlign: "center", lineHeight: 1.5 }}>
              Enter server credentials above and click Connect
            </span>
          </div>
        )}
        {connecting && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, color: "#999" }}>
            <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 16 }} />
            <span style={{ fontSize: 12 }}>Loading reports…</span>
          </div>
        )}
        {tree.map(n => (
          <TreeNodeView
            key={n.id}
            node={n}
            activeId={activeId}
            loadingIds={loadingIds}
            onSelect={handleSelectReport}
            onOpenPreview={handleOpenPreview}
          />
        ))}
      </div>

      {/* ── Hint ── */}
      {tree.length > 0 && (
        <div style={{ padding: "6px 12px", borderTop: "1px solid #e0e0e0", fontSize: 11, color: "#aaa" }}>
          Click a report to open · <span className="codicon codicon-link-external" style={{ fontSize: 11 }} /> to preview in browser
        </div>
      )}
    </div>
  );
}
