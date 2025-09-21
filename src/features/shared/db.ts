import { DB, Equipment } from "./types";
import { ensureSystemProjects } from "./systemProjects";

export const DB_KEY = "opsync-db";
export const WIX_KEY = "opsync-assign-workers";
export const EIX_KEY = "opsync-assign-equip";

export function readDB(): DB {
  const raw = localStorage.getItem(DB_KEY);
  let db: DB = { workers:[], equipment:[], projects:[], companies:[] };
  if (raw) { try { db = JSON.parse(raw); } catch {} }
  // migration: prefer assetNumber
  db.equipment = (db.equipment||[]).map((e:Equipment)=>({
    ...e,
    assetNumber: e.assetNumber || e.code || "",
  }));
  return ensureSystemProjects(db);
}
export function writeDB(db: DB){ localStorage.setItem(DB_KEY, JSON.stringify(db)); }

export type IndexMap = Record<string,string|null>; // entityId -> projectId|null
export function readIndex(key:string): IndexMap {
  const raw = localStorage.getItem(key); if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}
export function writeIndex(key:string, ix:IndexMap){ localStorage.setItem(key, JSON.stringify(ix)); }
