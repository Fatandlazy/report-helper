import { useState, useEffect } from "react";
import { AppSettings, DbConnection, Section, WorkspaceFolder } from "../types";

const SETTINGS_KEY = "app_settings_v2";

const defaultSettings: AppSettings = {
  workspaceFolders: [],
  connections: [],
  ssrsUrl: "",
  ssrsUsername: "",
  ssrsPassword: "",
  lastSection: "explorer",
  activeConnectionId: "",
};

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {}
  return defaultSettings;
}

function save(s: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(load);

  useEffect(() => { save(settings); }, [settings]);

  function updateSettings(partial: Partial<AppSettings>) {
    setSettings(prev => ({ ...prev, ...partial }));
  }

  function addWorkspaceFolder(folder: WorkspaceFolder) {
    setSettings(prev =>
      prev.workspaceFolders.some(f => f.path === folder.path)
        ? prev
        : { ...prev, workspaceFolders: [...prev.workspaceFolders, folder] }
    );
  }

  function removeWorkspaceFolder(path: string) {
    setSettings(prev => ({
      ...prev,
      workspaceFolders: prev.workspaceFolders.filter(f => f.path !== path),
    }));
  }

  function addConnection(conn: DbConnection) {
    setSettings(prev => ({ ...prev, connections: [...prev.connections, conn] }));
  }

  function removeConnection(id: string) {
    setSettings(prev => ({
      ...prev,
      connections: prev.connections.filter(c => c.id !== id),
      activeConnectionId: prev.activeConnectionId === id ? "" : prev.activeConnectionId,
    }));
  }

  function updateConnection(conn: DbConnection) {
    setSettings(prev => ({
      ...prev,
      connections: prev.connections.map(c => c.id === conn.id ? conn : c),
    }));
  }

  function setSection(section: Section) {
    setSettings(prev => ({ ...prev, lastSection: section }));
  }

  return {
    settings,
    updateSettings,
    addWorkspaceFolder,
    removeWorkspaceFolder,
    addConnection,
    removeConnection,
    updateConnection,
    setSection,
  };
}
