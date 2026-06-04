import { useState, useEffect, useRef } from "react";

export function useEditorResize(initialHeight = 300) {
  const [height, setHeight] = useState(initialHeight);
  const [isResizing, setIsResizing] = useState(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(initialHeight);

  function startResizing(e: { clientY: number; preventDefault(): void }) {
    setIsResizing(true);
    startYRef.current = e.clientY;
    startHeightRef.current = height;
    e.preventDefault();
  }

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => {
      const newH = Math.max(80, Math.min(window.innerHeight - 100, startHeightRef.current + (e.clientY - startYRef.current)));
      setHeight(newH);
    };
    const onUp = () => setIsResizing(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizing]);

  return { height, isResizing, startResizing };
}
