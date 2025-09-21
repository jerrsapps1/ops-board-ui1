import { DB, Equipment, Project } from "./types";

export const SYS_WAREHOUSE_ID = "sys-warehouse";
export const SYS_REPAIR_ID = "sys-repair";

export function ensureSystemProjects(db: DB): DB {
  const exists = new Set(db.projects.map(p => p.id));
  const add: Project[] = [];
  if (!exists.has(SYS_WAREHOUSE_ID)) {
    add.push({
      id: SYS_WAREHOUSE_ID,
      name: "Warehouse / Yard",
      number: "WH",
      status: "active",
      progress: 0,
      special: "warehouse",
    });
  }
  if (!exists.has(SYS_REPAIR_ID)) {
    add.push({
      id: SYS_REPAIR_ID,
      name: "Repair Shop",
      number: "RS",
      status: "active",
      progress: 0,
      special: "repair",
    });
  }
  if (!add.length) return db;
  return { ...db, projects: [...db.projects, ...add] };
}

export function startRepair(e: Equipment, reason?: string): Equipment {
  const history = [...(e.repairHistory ?? [])];
  // If already in open repair, don't duplicate
  if (history.some(h => !h.end)) return e;
  history.push({ start: new Date().toISOString(), reason: reason?.trim() || undefined });
  return { ...e, repairHistory: history };
}

export function endRepair(e: Equipment): Equipment {
  const history = [...(e.repairHistory ?? [])];
  for (let i = history.length - 1; i >= 0; i--) {
    if (!history[i].end) { history[i] = { ...history[i], end: new Date().toISOString() }; break; }
  }
  return { ...e, repairHistory: history };
}

export function daysInOpenRepair(e: Equipment): number {
  const h = (e.repairHistory ?? []).find(x => !x.end);
  if (!h) return 0;
  const ms = Date.now() - new Date(h.start).getTime();
  return Math.max(1, Math.round(ms / 86400000));
}
