import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Home, { RadarApp } from "../app/page";
import "../app/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing application root");
}

const pathname = window.location.pathname
  .replace(/^\/biaokankan(?=\/|$)/, "")
  .replace(/\/+$/, "") || "/";

const page = pathname === "/radar/admin"
  ? <RadarApp initialView="admin" />
  : pathname === "/radar/project"
    ? <RadarApp initialView="radar" detailFromQuery />
    : pathname === "/radar"
      ? <RadarApp initialView="radar" />
      : <Home />;

createRoot(root).render(
  <StrictMode>
    {page}
  </StrictMode>,
);
