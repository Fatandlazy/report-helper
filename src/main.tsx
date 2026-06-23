import React from "react";
import ReactDOM from "react-dom/client";
import "./monaco"; // configure Monaco to load locally (no CDN) before any editor mounts
import App from "./App";

if (!import.meta.env.DEV) {
  document.addEventListener("contextmenu", (e) => e.preventDefault());
}

// Prevent browser from opening files on drop
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
