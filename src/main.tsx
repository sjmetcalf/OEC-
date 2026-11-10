import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist/wght.css";
import App from "./App.tsx";
import { applyDarkTheme } from "./theme.tsx";
import "./styles.css";

applyDarkTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
