import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const win = getCurrentWindow();

interface WinBtnProps {
  onClick: () => void;
  icon: string;
  title: string;
  isClose?: boolean;
}

function WinBtn({ onClick, icon, title, isClose }: WinBtnProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 46,
        height: 30,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#cccccc",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = isClose ? "#e81123" : "rgba(255,255,255,0.1)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span className={`codicon ${icon}`} style={{ fontSize: 14, pointerEvents: "none" }} />
    </button>
  );
}

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const checkMax = async () => {
      const max = await win.isMaximized();
      setIsMaximized(max);
    };
    checkMax();
    
    // Listen for resize to update icon
    const unlisten = win.onResized(() => {
      checkMax();
    });
    
    return () => {
      unlisten.then(f => f());
    };
  }, []);

  return (
    <div
      className="flex items-center select-none"
      style={{ height: 30, background: "#3c3c3c", flexShrink: 0 }}
      data-tauri-drag-region
    >
      {/* App icon + title */}
      <div
        className="flex items-center gap-1.5 pointer-events-none"
        style={{ paddingLeft: 12, minWidth: 200 }}
        data-tauri-drag-region
      >
        <span className="codicon codicon-graph-scatter" style={{ color: "#cccccc", fontSize: 14 }} />
        <span style={{ color: "#cccccc", fontSize: 12 }}>Report Helper</span>
      </div>

      {/* Drag region */}
      <div className="flex-1" style={{ height: "100%" }} data-tauri-drag-region />

      {/* Window controls */}
      <div className="flex" style={{ pointerEvents: "auto" }}>
        <WinBtn onClick={() => win.minimize()} icon="codicon-chrome-minimize" title="Minimize" />
        <WinBtn 
          onClick={() => win.toggleMaximize()} 
          icon={isMaximized ? "codicon-chrome-restore" : "codicon-chrome-maximize"} 
          title={isMaximized ? "Restore" : "Maximize"} 
        />
        <WinBtn onClick={() => win.close()} icon="codicon-chrome-close" title="Close" isClose />
      </div>
    </div>
  );
}
