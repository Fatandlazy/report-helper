import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

document.addEventListener("contextmenu", (e) => e.preventDefault());

// Prevent browser from opening files on drop
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
