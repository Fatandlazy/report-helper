import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import "./index.css";
import { useSettings } from "./hooks/useSettings";
import { useTabs } from "./hooks/useTabs";
import { useHotkeys } from "./hooks/useHotkeys";
import { TabView, TreeNode, Section } from "./types";
import { ActivityBar } from "./components/ActivityBar";
import { TitleBar } from "./components/TitleBar";
import { StatusBar } from "./components/StatusBar";
import { TabBar } from "./components/TabBar";
import { ExplorerPanel } from "./panels/ExplorerPanel";
import { ServerPanel } from "./panels/ServerPanel";
import { SqlEditorPanel } from "./panels/SqlEditorPanel";
import { ReportTabContent } from "./panels/report/ReportTabContent";
import { SettingsPanel } from "./panels/SettingsPanel";
import { SearchPanel } from "./panels/SearchPanel";
import { ChatPanel } from "./panels/ChatPanel";
import { ClaudeSessionsPanel } from "./panels/ClaudeSessionsPanel";

export default function App() {
  const {
    settings, setSection, updateSettings,
    addWorkspaceFolder, removeWorkspaceFolder,
    addConnection, removeConnection, updateConnection,
    toggleHiddenSsrsPath, toggleHiddenLocalPath, addToHistory,
  } = useSettings();

  const { 
    tabs, activeId, activeTab, openTab, closeTab, closeTabsByPath, 
    setTabView, setActiveId, updateTabMetadata, updateTabsByPath, closeOthers, closeToRight, closeAll 
  } = useTabs();
  const [status, setStatus] = useState({ left: "", right: "" });
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [ssrsTree, setSsrsTree] = useState<TreeNode[]>([]);

  useHotkeys({
    "ctrl+b": () => setSidebarVisible(v => !v),
    "ctrl+,": () => setSection("settings"),
    "ctrl+alt+1": () => setSection("explorer"),
    "ctrl+alt+2": () => setSection("server"),
    "ctrl+alt+3": () => setSection("sqleditor"),
    "ctrl+alt+4": () => setSection("chat"),
    "ctrl+shift+f": () => {
      setSection("search");
      setSidebarVisible(true);
    },
    "ctrl+alt+e": () => setSection("explorer"),
    "ctrl+alt+s": () => setSection("server"),
    "ctrl+alt+q": () => setSection("sqleditor"),
    "ctrl+w": () => {
      if (activeId) closeTab(activeId);
    }
  });
  
  const [reloadKeys, setReloadKeys] = useState<Record<string, number>>({});

  // File change detection for tabs
  useEffect(() => {
    const handleFocus = async () => {
      if (settings.lastSection === "sqleditor") return; // Handled in SqlEditorPanel
      if (!activeTab || activeTab.source !== "local" || !activeTab.lastModified) return;

      try {
        const mtime = await invoke<number>("get_file_modified_time", { path: activeTab.path });
        if (mtime > activeTab.lastModified) {
          const fileName = activeTab.path.split(/[\\/]/).pop();
          const confirmed = await ask(
            `File "${fileName}" has been modified by another editor. Do you want to reload it?`,
            { title: "File Changed", kind: "warning" }
          );

          if (confirmed) {
            updateTabMetadata(activeTab.id, { lastModified: mtime });
            setReloadKeys(prev => ({ ...prev, [activeTab.id]: (prev[activeTab.id] ?? 0) + 1 }));
          } else {
            // Update timestamp anyway to stop asking until next change
            updateTabMetadata(activeTab.id, { lastModified: mtime });
          }
        }
      } catch (e) {
        console.error("Focus check failed", e);
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [activeTab, settings.lastSection, updateTabMetadata]);

  function handleSectionChange(newSection: Section) {
    if (newSection === settings.lastSection) {
      setSidebarVisible(!sidebarVisible);
    } else {
      setSection(newSection);
      setSidebarVisible(true);
    }
  }


  function onStatus(left: string, right: string) {
    setStatus({ left, right });
  }

  function handleOpenFile(path: string, name: string) {
    openTab(path, name, "local");
  }

  function handleOpenChatSession(id: string, title: string) {
    openTab(id, title, "chat");
  }

  useEffect(() => {
    const handleSessionDeleted = (e: Event) => {
      const { id } = (e as CustomEvent<{ id: string }>).detail;
      closeTabsByPath(id);
    };
    window.addEventListener("claude-session-deleted", handleSessionDeleted);
    return () => window.removeEventListener("claude-session-deleted", handleSessionDeleted);
  }, [closeTabsByPath]);

  useEffect(() => {
    const handleSessionsUpdate = () => {
      try {
        const raw = localStorage.getItem("claude_sessions_v1");
        if (raw) {
          const sessions = JSON.parse(raw);
          if (Array.isArray(sessions)) {
            sessions.forEach((s: any) => {
              updateTabsByPath(s.id, { title: s.title });
            });
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    window.addEventListener("claude-sessions-updated", handleSessionsUpdate);
    return () => window.removeEventListener("claude-sessions-updated", handleSessionsUpdate);
  }, [updateTabsByPath]);

  // Server: "SQL Test" downloads RDL → open as local tab
  // Server: "Preview" → open as server tab (webview)
  function handleOpenServerTab(path: string, name: string, serverPath: string) {
    const isPreview = /^[0-9a-f-]{36}$/i.test(path);
    if (isPreview) {
      openTab(path, name, "server", serverPath, "preview");
    } else {
      openTab(path, name, "local", serverPath);
    }
  }

  const handleTabViewChange = (view: TabView) => {
    if (activeId) setTabView(activeId, view);
  };

  const handleCloseTab = async (id: string) => {
    const tab = tabs.find(t => t.id === id);
    if (tab?.isDirty) {
      const confirmed = await ask(`"${tab.title}" has unsaved changes. Do you want to close it anyway?`, {
        title: "Unsaved Changes",
        kind: "warning",
        okLabel: "Close Anyway",
        cancelLabel: "Cancel"
      });
      if (!confirmed) return;
    }
    closeTab(id);
  };

  const handleCloseOthers = async (id: string) => {
    const others = tabs.filter(t => t.id !== id && t.isDirty);
    if (others.length > 0) {
      const confirmed = await ask(`${others.length} tab(s) have unsaved changes. Close them anyway?`, {
        title: "Unsaved Changes",
        kind: "warning",
        okLabel: "Close Anyway",
        cancelLabel: "Cancel"
      });
      if (!confirmed) return;
    }
    closeOthers(id);
  };

  const handleCloseToRight = async (id: string) => {
    const idx = tabs.findIndex(t => t.id === id);
    const toRight = tabs.slice(idx + 1).filter(t => t.isDirty);
    if (toRight.length > 0) {
      const confirmed = await ask(`${toRight.length} tab(s) have unsaved changes. Close them anyway?`, {
        title: "Unsaved Changes",
        kind: "warning",
        okLabel: "Close Anyway",
        cancelLabel: "Cancel"
      });
      if (!confirmed) return;
    }
    closeToRight(id);
  };

  const handleCloseAll = async () => {
    const dirty = tabs.filter(t => t.isDirty);
    if (dirty.length > 0) {
      const confirmed = await ask(`${dirty.length} tab(s) have unsaved changes. Close all anyway?`, {
        title: "Unsaved Changes",
        kind: "warning",
        okLabel: "Close Anyway",
        cancelLabel: "Cancel"
      });
      if (!confirmed) return;
    }
    closeAll();
  };

  const section = settings.lastSection;
  const activeFilePath = activeTab?.source === "local" ? activeTab.path : null;

  return (
    <div className="flex flex-col" style={{ height: "100vh", overflow: "hidden" }}>
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        <ActivityBar active={section} onChange={handleSectionChange} />

        {/* Side panel — hidden for sqleditor or if toggled off */}
        {section !== "sqleditor" && section !== "settings" && sidebarVisible && (
          <div
            className="flex flex-col border-r overflow-hidden"
            style={{ width: 280, borderColor: "#d4d4d4", flexShrink: 0 }}
          >
            {section === "explorer" && (
              <ExplorerPanel
                workspaceFolders={settings.workspaceFolders}
                onAddFolder={addWorkspaceFolder}
                onRemoveFolder={removeWorkspaceFolder}
                onOpenFile={handleOpenFile}
                activeFilePath={activeFilePath}
                onCloseTabsByPath={closeTabsByPath}
                hiddenPaths={settings.hiddenLocalPaths || []}
                onToggleHiddenPath={toggleHiddenLocalPath}
              />
            )}
            {section === "search" && (
              <SearchPanel
                workspaceFolders={settings.workspaceFolders}
                onOpenFile={handleOpenFile}
              />
            )}
            {section === "server" && (
              <ServerPanel
                initialUrl={settings.ssrsUrl}
                initialUser={settings.ssrsUsername}
                initialPass={settings.ssrsPassword}
                ssrsTree={ssrsTree}
                setSsrsTree={setSsrsTree}
                hiddenSsrsPaths={settings.hiddenSsrsPaths}
                onToggleHiddenPath={toggleHiddenSsrsPath}
                onCredentialsSaved={(url, user, pass) => updateSettings({ ssrsUrl: url, ssrsUsername: user, ssrsPassword: pass })}
                onOpenTab={handleOpenServerTab}
                onStatus={onStatus}
              />
            )}
            {section === "chat" && (
              <ClaudeSessionsPanel
                onOpenSession={handleOpenChatSession}
                activeSessionId={activeTab?.source === "chat" ? activeTab.path : null}
                claudeFolder={settings.claudeFolder}
                onUpdateClaudeFolder={(path) => updateSettings({ claudeFolder: path })}
              />
            )}
          </div>
        )}

        {/* Main area */}
        <div className="flex flex-col flex-1 overflow-hidden relative">
          {/* SQL Editor Panel */}
          <div className="flex flex-col flex-1 overflow-hidden" style={{ display: section === "sqleditor" ? "flex" : "none" }}>
            <SqlEditorPanel
              connections={settings.connections}
              workspaceFolders={settings.workspaceFolders}
              onAddConnection={addConnection}
              onRemoveConnection={removeConnection}
              onUpdateConnection={updateConnection}
              onStatus={onStatus}
              sidebarVisible={sidebarVisible}
              defaultSafeRun={settings.defaultSafeRun}
              onUpdateTabMetadata={updateTabsByPath}
              addToHistory={addToHistory}
              history={settings.sqlHistory}
            />
          </div>

          {/* Settings Panel */}
          <div className="flex flex-col flex-1 overflow-hidden" style={{ display: section === "settings" ? "flex" : "none" }}>
            <SettingsPanel
              settings={settings}
              onUpdateSettings={updateSettings}
              onAddConnection={addConnection}
              onRemoveConnection={removeConnection}
            />
          </div>

          {/* Reports Panel (Explorer/Search/Server Tabs) */}
          <div className="flex flex-col flex-1 overflow-hidden" style={{ display: (section === "explorer" || section === "search" || section === "server" || section === "chat") ? "flex" : "none" }}>
            <TabBar
              tabs={tabs}
              activeId={activeId}
              onSelect={setActiveId}
              onClose={handleCloseTab}
              onCloseOthers={handleCloseOthers}
              onCloseToRight={handleCloseToRight}
              onCloseAll={handleCloseAll}
            />
            <div className="flex-1 overflow-hidden">
              {tabs.length === 0 ? (
                <WelcomeScreen section={section} />
              ) : (
                tabs.map(tab => (
                  <div key={tab.id} style={{ display: tab.id === activeId ? "flex" : "none", flexDirection: "column", height: "100%", overflow: "hidden" }}>
                    {tab.source === "chat" ? (
                      <ChatPanel
                        tab={tab}
                        settings={settings}
                        onStatus={onStatus}
                      />
                    ) : (
                      <ReportTabContent
                        tab={tab}
                        connections={settings.connections}
                        activeConnectionId={settings.activeConnectionId}
                        ssrsUrl={settings.ssrsUrl}
                        ssrsUsername={settings.ssrsUsername}
                        ssrsPassword={settings.ssrsPassword}
                        onViewChange={handleTabViewChange}
                        onStatus={onStatus}
                        defaultSafeRun={settings.defaultSafeRun}
                        onUpdateTabMetadata={updateTabsByPath}
                        reloadKey={reloadKeys[tab.id] ?? 0}
                      />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <StatusBar left={status.left} right={status.right} />
    </div>
  );
}

function WelcomeScreen({ section }: { section: string }) {
  const getMessage = () => {
    switch (section) {
      case "explorer":
        return "Open a folder in the Explorer or click a file to get started";
      case "chat":
        return "Create or select a chat session from the sidebar to start coding with Claude Code";
      default:
        return "Select a report from the Server panel";
    }
  };

  const getIcon = () => {
    switch (section) {
      case "chat":
        return "codicon-comment-discussion";
      default:
        return "codicon-file-code";
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4" style={{ background: "#fff" }}>
      <span className={`codicon ${getIcon()}`} style={{ fontSize: 56, color: "#ddd" }} />
      <div className="text-gray-400 text-sm text-center max-w-[280px] px-4">
        {getMessage()}
      </div>
    </div>
  );
}
