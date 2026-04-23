import { useEffect } from "react";

interface HotkeyMap {
  [key: string]: () => void;
}

export function useHotkeys(map: HotkeyMap) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Check for modifiers
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const alt = e.altKey;

      let key = "";
      if (ctrl) key += "ctrl+";
      if (shift) key += "shift+";
      if (alt) key += "alt+";
      key += e.key.toLowerCase();

      // Special handling for F-keys
      if (e.key.startsWith("F") && !isNaN(parseInt(e.key.substring(1)))) {
        // key is already correct (e.g., "f5")
      }

      if (map[key]) {
        e.preventDefault();
        map[key]();
      } else if (e.key === "F12") {
        e.preventDefault();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [map]);
}
