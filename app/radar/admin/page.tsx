import { headers } from "next/headers";
import { RadarApp } from "../../page";
import { requireTenderAdmin } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const host = (await headers()).get("host")?.split(":")[0];
  if (host !== "localhost" && host !== "127.0.0.1") await requireTenderAdmin("/radar/admin");
  return <RadarApp initialView="admin" />;
}
