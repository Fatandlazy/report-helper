import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { WorkspaceFolder, FileTreeNode, SAMPLE_SQL } from "../types";

interface Props {
  workspaceFolders: WorkspaceFolder[];
  onAddFolder: (folder: WorkspaceFolder) => void;
  onRemoveFolder: (path: string) => void;
  onOpenFile: (path: string, name: string) => void;
  activeFilePath: string | null;
  onCloseTabsByPath: (path: string) => void;
}

function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "rdl":
    case "rdlc": return { icon: "codicon-file-code", color: "#519aba" };
    case "sql": return { icon: "codicon-database", color: "#e38100" };
    case "json": return { icon: "codicon-json", color: "#cbcb41" };
    case "txt":
    case "md": return { icon: "codicon-file-text", color: "#888" };
    case "js":
    case "ts":
    case "tsx":
    case "jsx": return { icon: "codicon-symbol-file", color: "#51a1ed" };
    case "css": return { icon: "codicon-symbol-color", color: "#42a5f5" };
    case "html": return { icon: "codicon-symbol-structure", color: "#e34c26" };
    default: return { icon: "codicon-file", color: "#888" };
  }
}

 function buildTree(rootPath: string, filePaths: string[], creatingPath: string | null): FileTreeNode {
  const normalize = (p: string) => p.replace(/\\/g, "/").replace(/\/$/, "");
  const normRoot = normalize(rootPath);

  const root: FileTreeNode = {
    name: rootPath.split(/[\\/]/).pop() ?? rootPath,
    path: rootPath,
    isFolder: true,
    children: [],
  };

  for (const filePath of filePaths) {
    const isDir = filePath.endsWith("/");
    const cleanPath = isDir ? filePath.slice(0, -1) : filePath;
    const normPath = normalize(cleanPath);
    
    const relative = normPath.startsWith(normRoot)
      ? normPath.slice(normRoot.length).replace(/^\//, "")
      : normPath;
    
    if (!relative) continue; // Root itself

    const parts = relative.split("/");

    let current = root;
    let currentAccPath = normRoot;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      currentAccPath += "/" + part;
      
      let node = current.children.find(c => c.name === part);
      if (!node) {
        node = { 
          name: part, 
          path: currentAccPath, 
          isFolder: !isLast || isDir, 
          children: [] 
        };
        current.children.push(node);
      }
      current = node;
    }
  }
  
  if (creatingPath) {
    const normalize = (p: string) => p.replace(/\\/g, "/").replace(/\/$/, "");
    const normCreating = normalize(creatingPath);
    const normRoot = normalize(rootPath);
    
    if (normCreating === normRoot) {
      root.children.push({ name: "", path: normRoot + "/$NEW$", isFolder: true, children: [], isCreating: true });
    } else if (normCreating.startsWith(normRoot)) {
      const relative = normCreating.slice(normRoot.length).replace(/^\//, "");
      const parts = relative.split("/");
      let current = root;
      let found = true;
      for (const part of parts) {
        let next = current.children.find(c => c.name === part);
        if (!next) { found = false; break; }
        current = next;
      }
      if (found) {
        current.children.push({ name: "", path: normCreating + "/$NEW$", isFolder: true, children: [], isCreating: true });
      }
    }
  }
  
  // Sort: Folders first, then alphabetically
  const sortTree = (n: FileTreeNode) => {
    n.children.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    n.children.forEach(sortTree);
  };
  sortTree(root);
  
  return root;
}

function FileTreeView({
  node,
  depth = 0,
  activeFilePath,
  onOpenFile,
  onAction,
  onMove,
  renamingPath,
  onRenameComplete,
  onContextMenu,
}: {
  node: FileTreeNode;
  depth?: number;
  activeFilePath: string | null;
  onOpenFile: (path: string, name: string) => void;
  onAction: (action: "newFolder" | "newSql" | "rename" | "delete" | "reveal" | "refresh", path: string) => void;
  onMove: (oldPath: string, newParentPath: string) => void;
  renamingPath: string | null;
  onRenameComplete: (newName: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FileTreeNode) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [isDragOver, setIsDragOver] = useState(false);
  const isActive = !node.isFolder && node.path === activeFilePath;
  const isRenaming = renamingPath === node.path;
  const indent = 6 + depth * 14;

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", node.path);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (node.isFolder) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const oldPath = e.dataTransfer.getData("text/plain");
    if (oldPath && oldPath !== node.path) {
      onMove(oldPath, node.path);
    }
  };

  const renderName = () => {
    if (isRenaming) {
      return (
        <input
          autoFocus
          className="rename-input"
          defaultValue={node.name}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => onRenameComplete(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRenameComplete(e.currentTarget.value);
            if (e.key === "Escape") {
              e.stopPropagation();
              onRenameComplete(node.name);
            }
          }}
          onClick={e => e.stopPropagation()}
        />
      );
    }
    return (
      <span style={{ fontSize: 13, color: isActive ? "#00539c" : "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {node.name}
      </span>
    );
  };

  return (
    <div>
      <div
        className={`tree-row ${isActive ? "active" : ""} ${isDragOver ? "drag-over" : ""}`}
        style={{ paddingLeft: indent, paddingRight: 8 }}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => node.isFolder ? setExpanded(e => !e) : onOpenFile(node.path, node.name)}
        onContextMenu={(e) => onContextMenu(e, node)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, overflow: "hidden" }}>
          {node.isFolder ? (
            <>
              <span
                className={`codicon ${expanded ? "codicon-chevron-down" : "codicon-chevron-right"}`}
                style={{ fontSize: 11, color: "#888", flexShrink: 0 }}
              />
              <span
                className={`codicon ${expanded ? "codicon-folder-opened" : "codicon-folder"}`}
                style={{ fontSize: 15, color: "#dcb67a", flexShrink: 0 }}
              />
            </>
          ) : (
            (() => {
              const info = getFileIcon(node.name);
              return <span className={`codicon ${info.icon}`} style={{ fontSize: 14, color: isActive ? "#00539c" : info.color, flexShrink: 0, marginLeft: 16 }} />;
            })()
          )}
          {renderName()}
        </div>
      </div>
      
      {expanded && node.isFolder && node.children.map((child, i) => (
        <FileTreeView
          key={child.path + i}
          node={child}
          depth={depth + 1}
          activeFilePath={activeFilePath}
          onOpenFile={onOpenFile}
          onAction={onAction}
          onMove={onMove}
          renamingPath={renamingPath}
          onRenameComplete={onRenameComplete}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  );
}

function ContextMenu({ x, y, node, isRoot, onAction, onClose }: { 
  x: number, y: number, node: FileTreeNode | null, isRoot: boolean,
  onAction: (action: "newFolder" | "newSql" | "rename" | "delete" | "reveal" | "refresh", path: string) => void,
  onClose: () => void 
}) {
  if (!node) return null;

  return (
    <div className="context-menu" style={{ left: `${x}px`, top: `${y}px` }} onClick={e => e.stopPropagation()}>
      {node.isFolder && (
        <>
          <div className="context-menu-item" onClick={() => { onAction("newFolder", node.path); onClose(); }}>
            <span className="codicon codicon-new-folder" /> New Folder
          </div>
          <div className="context-menu-item" onClick={() => { onAction("newSql", node.path); onClose(); }}>
            <span className="codicon codicon-database" /> New SQL
          </div>
          <div className="context-menu-divider" />
        </>
      )}
      {!isRoot && (
        <div className="context-menu-item" onClick={() => { onAction("rename", node.path); onClose(); }}>
          <span className="codicon codicon-edit" /> Rename
        </div>
      )}
      <div className="context-menu-item" onClick={() => { onAction("reveal", node.path); onClose(); }}>
        <span className="codicon codicon-folder" /> Reveal in File Explorer
      </div>
      <div className="context-menu-item" onClick={() => { onAction("refresh", node.path); onClose(); }}>
        <span className="codicon codicon-refresh" /> Refresh
      </div>
      {!isRoot && (
        <>
          <div className="context-menu-divider" />
          <div className="context-menu-item" style={{ color: "#e81123" }} onClick={() => { onAction("delete", node.path); onClose(); }}>
            <span className="codicon codicon-trash" style={{ color: "#e81123" }} /> Delete
          </div>
        </>
      )}
    </div>
  );
}

export function ExplorerPanel({ workspaceFolders, onAddFolder, onRemoveFolder, onOpenFile, activeFilePath, onCloseTabsByPath }: Props) {
  const [folderFiles, setFolderFiles] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  const toggleFolder = (path: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };
  const [hoveredFolder, setHoveredFolder] = useState<string | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [creatingFolderParent, setCreatingFolderParent] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ visible: boolean, x: number; y: number; node: FileTreeNode | null, isRoot: boolean }>({
    visible: false, x: 0, y: 0, node: null, isRoot: false
  });

  const scanFolder = useCallback(async (folderPath: string) => {
    try {
      const files = await invoke<string[]>("scan_folder", { path: folderPath });
      setFolderFiles(prev => ({ ...prev, [folderPath]: files }));
    } catch (e) {
      console.error("scan failed", e);
    }
  }, []);

  useEffect(() => {
    workspaceFolders.forEach(wf => {
      if (!folderFiles[wf.path]) scanFolder(wf.path);
    });
  }, [workspaceFolders, scanFolder]);

  useEffect(() => {
    const handleClose = () => {
      console.log("Closing context menu");
      setMenu(m => ({ ...m, visible: false }));
    };
    window.addEventListener("click", handleClose);
    window.addEventListener("contextmenu", handleClose);
    return () => {
      window.removeEventListener("click", handleClose);
      window.removeEventListener("contextmenu", handleClose);
    };
  }, []);

  const handleAction = async (action: "newFolder" | "newSql" | "rename" | "delete" | "reveal" | "refresh", path: string) => {
    console.log("Action triggered:", action, path);
    const normPath = path.replace(/\\/g, "/").replace(/\/$/, "");

    if (action === "refresh") {
      workspaceFolders.forEach(wf => {
        if (normPath.startsWith(wf.path.replace(/\\/g, "/"))) scanFolder(wf.path);
      });
      return;
    }

    if (action === "newFolder") {
      setCreatingFolderParent(normPath);
      setRenamingPath(normPath + "/$NEW$");
    } else if (action === "newSql") {
      setCreatingFolderParent(normPath);
      setRenamingPath(normPath + "/$NEW_SQL$");
    } else if (action === "rename") {
      setRenamingPath(path);
    } else if (action === "delete") {
      const name = path.split(/[\\/]/).pop() || "this item";
      if (confirm(`Are you sure you want to move '${name}' to the Recycle Bin?`)) {
        await invoke("fs_remove", { path });
        onCloseTabsByPath(path);
        workspaceFolders.forEach(wf => {
          if (normPath.startsWith(wf.path.replace(/\\/g, "/"))) scanFolder(wf.path);
        });
      }
    } else if (action === "reveal") {
      await invoke("reveal_in_explorer", { path });
    }
  };

  const handleRenameComplete = async (newName: string) => {
    if (!renamingPath) return;
    const oldPath = renamingPath;
    setRenamingPath(null);
    setCreatingFolderParent(null);

      if (oldPath.endsWith("/$NEW$")) {
        // Folder creation
        if (!newName.trim()) return;
        const parentPath = oldPath.replace(/\/\$NEW\$/, "");
        const newPath = parentPath.endsWith("/") ? `${parentPath}${newName}` : `${parentPath}/${newName}`;
        try {
          await invoke("fs_create_dir", { path: newPath });
          workspaceFolders.forEach(wf => {
            if (newPath.replace(/\\/g, "/").startsWith(wf.path.replace(/\\/g, "/"))) scanFolder(wf.path);
          });
        } catch (e) {
          alert(`Failed to create folder: ${e}`);
        }
      } else if (oldPath.endsWith("/$NEW_SQL$")) {
        // SQL File creation
        if (!newName.trim()) return;
        let finalName = newName.trim();
        if (!finalName.toLowerCase().endsWith(".sql")) finalName += ".sql";
        
        const parentPath = oldPath.replace(/\/\$NEW_SQL\$/, "");
        const newPath = parentPath.endsWith("/") ? `${parentPath}${finalName}` : `${parentPath}/${finalName}`;
        try {
          await invoke("write_text_file", { path: newPath, content: SAMPLE_SQL });
          workspaceFolders.forEach(wf => {
            if (newPath.replace(/\\/g, "/").startsWith(wf.path.replace(/\\/g, "/"))) scanFolder(wf.path);
          });
          onOpenFile(newPath, finalName);
        } catch (e) {
          alert(`Failed to create SQL file: ${e}`);
        }
      }
      return;

    const normalizedOld = oldPath.replace(/\\/g, "/").replace(/\/$/, "");
    const parts = normalizedOld.split("/");
    const oldName = parts.pop();
    
    if (!newName || newName === oldName) return;

    const basePath = parts.join("/");
    const newPath = `${basePath}/${newName}`;

    try {
      await invoke("fs_rename", { oldPath, newPath });
      workspaceFolders.forEach(wf => {
        if (oldPath.replace(/\\/g, "/").startsWith(wf.path.replace(/\\/g, "/"))) scanFolder(wf.path);
      });
    } catch (e) {
      alert(`Rename failed: ${e}`);
    }
  };

  const handleMove = async (oldPath: string, newParentPath: string) => {
    // Normalize paths for reliable comparison and splitting
    const nOld = oldPath.replace(/\\/g, "/").replace(/\/$/, "");
    const nParent = newParentPath.replace(/\\/g, "/").replace(/\/$/, "");
    
    // Extract name correctly
    const name = nOld.split("/").pop();
    if (!name) return;

    const nNew = `${nParent}/${name}`;
    
    // Validation:
    // 1. Don't move to itself
    if (nOld === nNew) return;
    // 2. Don't move to its current parent
    if (nOld.substring(0, nOld.lastIndexOf("/")) === nParent) return;
    // 3. Don't move a folder into its own subfolder
    if (nParent.startsWith(nOld + "/")) {
      alert("Cannot move a folder into its own subfolder.");
      return;
    }

    try {
      console.log(`Moving from ${oldPath} to ${nNew}`);
      await invoke("fs_move", { oldPath, newPath: nNew });
      
      workspaceFolders.forEach(wf => {
        const nWf = wf.path.replace(/\\/g, "/").replace(/\/$/, "");
        if (nOld.startsWith(nWf) || nNew.startsWith(nWf)) scanFolder(wf.path);
      });
    } catch (e) {
      alert(`Move failed: ${e}`);
    }
  };

  const allFiles = Object.entries(folderFiles).flatMap(([, files]) => files);
  const filteredFiles = search.trim()
    ? allFiles.filter(f => !f.endsWith("/") && f.split(/[\\/]/).pop()?.toLowerCase().includes(search.toLowerCase()))
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f3f3f3" }}>

      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: "1px solid #e0e0e0",
      }}>
        <span className="section-label">Explorer</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={async () => {
              const dir = await open({ directory: true, multiple: false });
              if (typeof dir !== "string") return;
              const name = dir.split(/[\\/]/).pop() ?? dir;
              onAddFolder({ path: dir, name });
              scanFolder(dir);
            }}
            title="Add folder to workspace"
            style={{ 
              color: "#666", padding: "2px 6px", borderRadius: 3,
              display: "flex", alignItems: "center", gap: 4,
              border: "1px solid transparent", cursor: "pointer",
              transition: "all 0.1s"
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "rgba(0,0,0,0.05)";
              e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "transparent";
            }}
          >
            <span className="codicon codicon-add" style={{ fontSize: 13 }} />
            <span style={{ fontSize: 11, fontWeight: 500 }}>Add Folder</span>
          </button>
        </div>
      </div>

      {/* ── Search ── */}
      {workspaceFolders.length > 0 && (
        <div style={{ padding: "6px 10px", borderBottom: "1px solid #e0e0e0" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "#fff", border: "1px solid #cecece",
            borderRadius: 2, padding: "3px 8px",
          }}>
            <span className="codicon codicon-search" style={{ fontSize: 12, color: "#aaa", flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search files…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                flex: 1, border: "none", outline: "none", padding: 0,
                fontSize: 13, background: "transparent", color: "#333",
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                style={{ color: "#aaa", lineHeight: 1 }}
              >
                <span className="codicon codicon-close" style={{ fontSize: 12 }} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Content ── */}
      <div 
        style={{ flex: 1, overflowY: "auto" }}
        onContextMenu={(e) => {
          if (e.currentTarget === e.target && workspaceFolders.length > 0) {
            e.preventDefault();
            e.stopPropagation();
            console.log("Opening empty space context menu");
            // Show a menu that targets the first workspace by default for New Folder
            setMenu({ 
              visible: true, 
              x: e.clientX, 
              y: e.clientY, 
              node: { name: "Workspace", path: workspaceFolders[0].path, isFolder: true, children: [] },
              isRoot: true
            });
          }
        }}
      >

        {/* Empty workspace */}
        {workspaceFolders.length === 0 && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "100%", gap: 12, padding: "0 20px",
          }}>
            <span className="codicon codicon-folder-opened" style={{ fontSize: 44, color: "#ccc" }} />
            <span style={{ fontSize: 12, color: "#aaa", textAlign: "center", lineHeight: 1.6 }}>
              Open a folder to browse RDL files
            </span>
            <button onClick={async () => {
              const dir = await open({ directory: true, multiple: false });
              if (typeof dir !== "string") return;
              const name = dir.split(/[\\/]/).pop() ?? dir;
              onAddFolder({ path: dir, name });
              scanFolder(dir);
            }} className="btn-primary" style={{ borderRadius: 2 }}>
              Open Folder
            </button>
          </div>
        )}

        {/* Search results */}
        {filteredFiles && (
          <div>
            {filteredFiles.length === 0 && (
              <div style={{ fontSize: 12, color: "#aaa", textAlign: "center", marginTop: 24 }}>No results</div>
            )}
            {filteredFiles.map(path => {
              const name = path.split(/[\\/]/).pop() ?? path;
              const parentDir = path.replace(/[\\/][^\\/]+$/, "").split(/[\\/]/).pop();
              const isActive = path === activeFilePath;
              return (
                <div
                  key={path}
                  className={`tree-row ${isActive ? "active" : ""}`}
                  style={{ paddingLeft: 12, paddingRight: 8, justifyContent: "space-between" }}
                  onClick={() => onOpenFile(path, name)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                    <span className="codicon codicon-file" style={{ fontSize: 14, color: isActive ? "#00539c" : "#519aba", flexShrink: 0 }} />
                    <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                  </div>
                  <span style={{ fontSize: 11, color: "#aaa", flexShrink: 0, marginLeft: 8 }}>{parentDir}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Workspace folder trees */}
        {!filteredFiles && workspaceFolders.map(wf => {
          const files = folderFiles[wf.path] ?? [];
          const tree = buildTree(wf.path, files, creatingFolderParent);
          return (
            <div key={wf.path}>
              <div
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  height: 26, padding: "0 10px",
                  background: "#e8e8e8", borderBottom: "1px solid #d8d8d8",
                  cursor: "default",
                }}
                onMouseEnter={() => setHoveredFolder(wf.path)}
                onMouseLeave={() => setHoveredFolder(null)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log("Opening folder context menu at", e.clientX, e.clientY);
                  setMenu({ visible: true, x: e.clientX, y: e.clientY, node: tree, isRoot: true });
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setHoveredFolder(wf.path);
                }}
                onDragLeave={() => setHoveredFolder(null)}
                 onDrop={(e) => {
                  e.preventDefault();
                  setHoveredFolder(null);
                  const oldPath = e.dataTransfer.getData("text/plain");
                  if (oldPath) handleMove(oldPath, wf.path);
                }}
              >
                <div 
                  style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, height: "100%", cursor: "pointer" }}
                  onClick={() => toggleFolder(wf.path)}
                >
                  <span 
                    className={`codicon codicon-chevron-${collapsedFolders.has(wf.path) ? "right" : "down"}`} 
                    style={{ fontSize: 12, color: "#666", flexShrink: 0 }} 
                  />
                  <span className="section-label" style={{ userSelect: "none" }}>{wf.name}</span>
                </div>

                {hoveredFolder === wf.path && (
                  <div style={{ display: "flex", gap: 2 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleAction("newFolder", wf.path); }}
                      title="New Folder"
                      style={{ color: "#666", padding: 2, borderRadius: 2 }}
                    >
                      <span className="codicon codicon-new-folder" style={{ fontSize: 13 }} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); scanFolder(wf.path); }}
                      title="Refresh"
                      style={{ color: "#666", padding: 2, borderRadius: 2 }}
                    >
                      <span className="codicon codicon-refresh" style={{ fontSize: 13 }} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemoveFolder(wf.path); }}
                      title="Remove folder from workspace"
                      style={{ color: "#666", padding: 2, borderRadius: 2 }}
                    >
                      <span className="codicon codicon-close" style={{ fontSize: 13 }} />
                    </button>
                  </div>
                )}
              </div>

              {!collapsedFolders.has(wf.path) && (
                <>
                  {tree.children.map((child, i) => (
                    <FileTreeView
                      key={child.path + i}
                      node={child}
                      depth={0}
                      activeFilePath={activeFilePath}
                      onOpenFile={onOpenFile}
                      onAction={handleAction}
                      onMove={handleMove}
                      renamingPath={renamingPath}
                      onRenameComplete={handleRenameComplete}
                      onContextMenu={(ev, n) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        console.log("Opening context menu at", ev.clientX, ev.clientY, "for", n.name);
                        setMenu({ visible: true, x: ev.clientX, y: ev.clientY, node: n, isRoot: false });
                      }}
                    />
                  ))}
                  {files.length === 0 && (
                    <div style={{ fontSize: 12, color: "#aaa", padding: "8px 16px" }}>No RDL files found</div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {menu.visible && (
        <ContextMenu 
          x={menu.x} 
          y={menu.y} 
          node={menu.node} 
          isRoot={menu.isRoot}
          onAction={handleAction} 
          onClose={() => setMenu(m => ({ ...m, visible: false }))} 
        />
      )}
    </div>
  );
}
