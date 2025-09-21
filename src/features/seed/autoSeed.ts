import { loadSampleData } from "./seed";
import { DB_KEY } from "../shared/db";

export function autoSeedIfEmpty(){
  try {
    const url = new URL(location.href);
    if (url.searchParams.has("seed")) { loadSampleData(); return; }

    const raw = localStorage.getItem(DB_KEY);
    if (!raw) { loadSampleData(); return; }

    const db = JSON.parse(raw);
    const normals = (db.projects || []).filter((p:any)=>!p.special);
    if (normals.length === 0) { loadSampleData(); }
  } catch {
    loadSampleData();
  }
}
