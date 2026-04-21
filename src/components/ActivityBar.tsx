import { useState } from "react";
import { Section } from "../types";

interface ActivityItem {
  id: Section;
  icon: string;
  title: string;
}

const items: ActivityItem[] = [
  { id: "explorer",  icon: "codicon-files",             title: "Explorer" },
  { id: "server",    icon: "codicon-cloud",              title: "Server" },
  { id: "sqleditor", icon: "codicon-terminal-powershell", title: "SQL Editor" },
];

interface Props {
  active: Section;
  onChange: (s: Section) => void;
}

export function ActivityBar({ active, onChange }: Props) {
  const [hovered, setHovered] = useState<Section | null>(null);

  return (
    <div
      className="flex flex-col items-center py-1"
      style={{ width: 48, background: "#2c2c2c", flexShrink: 0 }}
    >
      {items.map(item => {
        const isActive = active === item.id;
        const isHovered = hovered === item.id;
        return (
          <div key={item.id} className="relative w-full flex justify-center">
            {isActive && (
              <span
                className="absolute left-0 top-2 bottom-2 rounded-r"
                style={{ width: 2, background: "#007acc" }}
              />
            )}
            <button
              title={item.title}
              onClick={() => onChange(item.id)}
              onMouseEnter={() => setHovered(item.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                width: 48,
                height: 48,
                background: "none",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: isActive ? "#cccccc" : isHovered ? "#cccccc" : "#858585",
              }}
            >
              <span className={`codicon ${item.icon}`} style={{ fontSize: 22 }} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
