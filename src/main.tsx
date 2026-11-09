import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { readWorkspace } from "./storage";
import "./style.css";
import { applyTheme, readTheme } from "./theme";
applyTheme(readTheme());
readWorkspace().then((workspace) =>
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App initial={workspace} />
    </React.StrictMode>,
  ),
);
