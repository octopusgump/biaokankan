import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Home, { RadarApp, type RadarSnapshot } from "../app/page";
import { PreviewAccess } from "./preview-access";
import "../app/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing application root");
}

const pathname = window.location.pathname
  .replace(/^\/biaokankan(?=\/|$)/, "")
  .replace(/\/+$/, "") || "/";

function pageForRoute(snapshot: RadarSnapshot | null) {
  return pathname === "/radar/admin"
    ? <RadarApp initialView="admin" initialSnapshot={snapshot} />
    : pathname === "/radar/project"
      ? <RadarApp initialView="radar" detailFromQuery initialSnapshot={snapshot} />
      : pathname === "/radar"
        ? <RadarApp initialView="radar" initialSnapshot={snapshot} />
        : <Home />;
}

createRoot(root).render(
  <StrictMode>
    {import.meta.env.BIAOKANKAN_PAGES_ENCRYPTED
      ? <PreviewAccess>{pageForRoute}</PreviewAccess>
      : pageForRoute(null)}
  </StrictMode>,
);
