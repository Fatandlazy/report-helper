import { useState } from "react";
import "./index.css";
import { useSettings } from "./hooks/useSettings";
import { useTabs } from "./hooks/useTabs";
import { TabView, TreeNode, Section } from "./types";
import { ActivityBar } from "./components/ActivityBar";
import { TitleBar } from "./components/TitleBar";
import { StatusBar } from "./components/StatusBar";
import { TabBar } from "./components/TabBar";
import { ExplorerPanel } from "./panels/ExplorerPanel";
import { ServerPanel } from "./panels/ServerPanel";
import { SqlEditorPanel } from "./panels/SqlEditorPanel";
import { ReportTabContent } from "./panels/ReportTabContent";

export default function App() {
  const {
    settings, setSection, updateSettings,
    addWorkspaceFolder, removeWorkspaceFolder,
    addConnection, removeConnection, updateConnection,
    toggleHiddenSsrsPath,
  } = useSettings();

  const { tabs, activeId, activeTab, openTab, closeTab, closeTabsByPath, setTabView, setActiveId } = useTabs();
  const [status, setStatus] = useState({ left: "", right: "" });
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [ssrsTree, setSsrsTree] = useState<TreeNode[]>([]);

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

  function handleTabViewChange(view: TabView) {
    if (activeId) setTabView(activeId, view);
  }

  const section = settings.lastSection;
  const activeFilePath = activeTab?.source === "local" ? activeTab.path : null;

  return (
    <div className="flex flex-col" style={{ height: "100vh", overflow: "hidden" }}>
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        <ActivityBar active={section} onChange={handleSectionChange} />

        {/* Side panel — hidden for sqleditor or if toggled off */}
        {section !== "sqleditor" && sidebarVisible && (
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
          </div>
        )}

        {/* Main area */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {section === "sqleditor" ? (
            <SqlEditorPanel
              connections={settings.connections}
              onAddConnection={addConnection}
              onRemoveConnection={removeConnection}
              onUpdateConnection={updateConnection}
              onStatus={onStatus}
              sidebarVisible={sidebarVisible}
            />
          ) : (
            <>
              <TabBar
                tabs={tabs}
                activeId={activeId}
                onSelect={setActiveId}
                onClose={closeTab}
              />
              <div className="flex-1 overflow-hidden">
                {activeTab ? (
                  <ReportTabContent
                    key={activeTab.id}
                    tab={activeTab}
                    connections={settings.connections}
                    activeConnectionId={settings.activeConnectionId}
                    ssrsUrl={settings.ssrsUrl}
                    ssrsUsername={settings.ssrsUsername}
                    ssrsPassword={settings.ssrsPassword}
                    onViewChange={handleTabViewChange}
                    onStatus={onStatus}
                  />
                ) : (
                  <WelcomeScreen section={section} />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <StatusBar left={status.left} right={status.right} />
    </div>
  );
}

function WelcomeScreen({ section }: { section: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4" style={{ background: "#fff" }}>
      <span className="codicon codicon-file-code" style={{ fontSize: 56, color: "#ddd" }} />
      <div className="text-gray-400 text-sm text-center">
        {section === "explorer"
          ? "Open a folder in the Explorer or click a file to get started"
          : "Select a report from the Server panel"}
      </div>
    </div>
  );
}
