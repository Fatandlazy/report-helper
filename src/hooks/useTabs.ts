import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ReportTab, TabView } from "../types";

interface TabsState {
  tabs: ReportTab[];
  activeId: string | null;
}

export function useTabs() {
  const [state, setState] = useState<TabsState>({ tabs: [], activeId: null });

  const openTab = useCallback(async (
    path: string,
    title: string,
    source: "local" | "server",
    serverPath?: string,
    initialView: TabView = "overview",
  ) => {
    let lastModified: number | undefined;
    if (source === "local") {
      try {
        lastModified = await invoke<number>("get_file_modified_time", { path });
      } catch (e) {
        console.error("Failed to get mtime", e);
      }
    }

    setState(prev => {
      const existing = prev.tabs.find(t => 
        (serverPath && t.serverPath === serverPath) ||
        (t.path === path)
      );
      if (existing) return { ...prev, activeId: existing.id };
      const tab: ReportTab = {
        id: crypto.randomUUID(),
        title,
        path,
        source,
        serverPath,
        activeView: initialView,
        lastModified,
      };
      return { tabs: [...prev.tabs, tab], activeId: tab.id };
    });
  }, []);

  const closeTab = useCallback((id: string) => {
    setState(prev => {
      const idx = prev.tabs.findIndex(t => t.id === id);
      const next = prev.tabs.filter(t => t.id !== id);
      const newActiveId = prev.activeId === id
        ? (next[idx] ?? next[idx - 1] ?? null)?.id ?? null
        : prev.activeId;
      return { tabs: next, activeId: newActiveId };
    });
  }, []);

  const closeTabsByPath = useCallback((path: string) => {
    setState(prev => {
      const normalizedPath = path.replace(/\\/g, "/").replace(/\/$/, "");
      const next = prev.tabs.filter(t => {
        const tabPath = t.path.replace(/\\/g, "/").replace(/\/$/, "");
        // Close if exactly matches or if it's a child of the deleted folder
        return !(tabPath === normalizedPath || tabPath.startsWith(normalizedPath + "/"));
      });
      
      let newActiveId = prev.activeId;
      if (prev.activeId && !next.find(t => t.id === prev.activeId)) {
        // Active tab was closed, find a new one
        const oldIdx = prev.tabs.findIndex(t => t.id === prev.activeId);
        newActiveId = (next[oldIdx] ?? next[oldIdx - 1] ?? null)?.id ?? null;
      }
      
      return { tabs: next, activeId: newActiveId };
    });
  }, []);

  const setTabView = useCallback((id: string, view: TabView) => {
    setState(prev => ({
      ...prev,
      tabs: prev.tabs.map(t => t.id === id ? { ...t, activeView: view } : t),
    }));
  }, []);

  const setActiveId = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, activeId: id }));
  }, []);

  const updateTabMetadata = useCallback((id: string, metadata: Partial<ReportTab>) => {
    setState(prev => ({
      ...prev,
      tabs: prev.tabs.map(t => t.id === id ? { ...t, ...metadata } : t),
    }));
  }, []);

  const updateTabsByPath = useCallback((path: string, metadata: Partial<ReportTab>) => {
    setState(prev => ({
      ...prev,
      tabs: prev.tabs.map(t => t.path === path ? { ...t, ...metadata } : t),
    }));
  }, []);

  const closeOthers = useCallback((id: string) => {
    setState(prev => ({
      tabs: prev.tabs.filter(t => t.id === id),
      activeId: id
    }));
  }, []);

  const closeToRight = useCallback((id: string) => {
    setState(prev => {
      const idx = prev.tabs.findIndex(t => t.id === id);
      if (idx === -1) return prev;
      const next = prev.tabs.slice(0, idx + 1);
      const newActiveId = next.some(t => t.id === prev.activeId) ? prev.activeId : id;
      return { tabs: next, activeId: newActiveId };
    });
  }, []);

  const closeAll = useCallback(() => {
    setState({ tabs: [], activeId: null });
  }, []);

  const activeTab = state.tabs.find(t => t.id === state.activeId) ?? null;

  return { 
    tabs: state.tabs, 
    activeId: state.activeId, 
    activeTab, 
    openTab, 
    closeTab, 
    closeTabsByPath, 
    setTabView, 
    setActiveId,
    updateTabMetadata,
    updateTabsByPath,
    closeOthers,
    closeToRight,
    closeAll
  };
}
