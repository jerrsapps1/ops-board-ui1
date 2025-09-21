import { DB, Equipment, Project } from "./types";

export const SYS_WAREHOUSE_ID = "sys-warehouse";
export const SYS_REPAIR_ID = "sys-repair";

export function ensureSystemProjects(db: DB): DB {
  const ids = new Set(db.projects.map(p=>p.id));
  const add: Project[] = [];
  if (!ids.has(SYS_WAREHOUSE_ID)) {
    add.push({ id: SYS_WAREHOUSE_ID, name: "Warehouse / Yard", number: "WH", status:"active", progress:0, special:"warehouse" });
  }
  if (!ids.has(SYS_REPAIR_ID)) {
    add.push({ id: SYS_REPAIR_ID, name: "Repair Shop", number: "RS", status:"active", progress:0, special:"repair" });
  }
  return add.length ? { ...db, projects: [...db.projects, ...add] } : db;
}

export function startRepair(e: Equipment, reason?: string): Equipment {
  const h = [...(e.repairHistory ?? [])];
  if (h.some(x=>!x.end)) return e;
  h.push({ start: new Date().toISOString(), reason: reason?.trim() || undefined });
  return { ...e, repairHistory: h };
}

export function endRepair(e: Equipment): Equipment {
  const h = [...(e.repairHistory ?? [])];
  for (let i=h.length-1;i>=0;i--) { if (!h[i].end){ h[i]={...h[i], end:new Date().toISOString()}; break; } }
  return { ...e, repairHistory: h };
}

export function daysInOpenRepair(e: Equipment): number {
  const open = (e.repairHistory ?? []).find(x=>!x.end);
  if (!open) return 0;
  const ms = Date.now() - new Date(open.start).getTime();
  return Math.max(1, Math.round(ms/86400000));
}
