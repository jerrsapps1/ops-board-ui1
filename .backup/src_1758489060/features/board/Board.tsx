import React, { useEffect, useMemo, useState } from "react";
import { DB, Equipment, Project, equipmentLabel } from "../shared/types";
import { ensureSystemProjects, SYS_REPAIR_ID, SYS_WAREHOUSE_ID, startRepair, endRepair, daysInOpenRepair } from "../shared/systemProjects";

function uid() { return Math.random().toString(36).slice(2, 9); }
function readDB(): DB {
  const raw = localStorage.getItem("opsync-db");
  if (!raw) return { workers: [], equipment: [], projects: [], companies: [] };
  try { return JSON.parse(raw); } catch { return { workers: [], equipment: [], projects: [], companies: [] }; }
}
function writeDB(db: DB) { localStorage.setItem("opsync-db", JSON.stringify(db)); }

// naive in-memory mapping for which project holds which equipment (persisted)
type EquipIndex = Record<string, string | null>; // equipId -> projectId or null (unassigned)
function readEquipIndex(): EquipIndex {
  const raw = localStorage.getItem("opsync-equip-index");
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
function writeEquipIndex(ix: EquipIndex) {
  localStorage.setItem("opsync-equip-index", JSON.stringify(ix));
}

const Pill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center gap-1 bg-cyan-900/30 border border-cyan-400/30 rounded-xl px-2.5 py-1 text-cyan-100 text-sm mr-2 mb-2">
    {children}
  </span>
);

const Badge: React.FC<{ text: string; tone?: "amber" | "rose" | "cyan" }> = ({ text, tone="amber" }) => {
  const map = {
    amber: "bg-amber-500/10 text-amber-200 border-amber-400/30",
    rose: "bg-rose-500/10 text-rose-200 border-rose-400/30",
    cyan: "bg-cyan-500/10 text-cyan-200 border-cyan-400/30",
  } as const;
  return <span className={`text-[10px] uppercase tracking-wide border px-1.5 py-0.5 rounded ${map[tone]}`}>{text}</span>;
};

export default function Board() {
  const [db, setDb] = useState<DB>(() => ensureSystemProjects(readDB()));
  const [equipIndex, setEquipIndex] = useState<EquipIndex>(() => readEquipIndex());

  // Guarantee system projects exist even if user lands here first
  useEffect(() => {
    const ensured = ensureSystemProjects(db);
    if (ensured !== db) { setDb(ensured); writeDB(ensured); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const projects = useMemo<Project[]>(() => {
    // Show Warehouse and Repair first, then the rest
    const sys = db.projects.filter(p => p.id === SYS_WAREHOUSE_ID || p.id === SYS_REPAIR_ID);
    const rest = db.projects.filter(p => p.id !== SYS_WAREHOUSE_ID && p.id !== SYS_REPAIR_ID);
    return [...sys, ...rest];
  }, [db.projects]);

  const unassignedEquip = db.equipment.filter(e => !equipIndex[e.id]);

  function placeEquip(equipId: string, toProjectId: string | null) {
    setDb(current => {
      let next = { ...current };

      // open/close repair logs based on move
      const eqIdx = next.equipment.findIndex(e => e.id === equipId);
      if (eqIdx >= 0) {
        const wasInRepair = equipIndex[equipId] === SYS_REPAIR_ID;
        const goingToRepair = toProjectId === SYS_REPAIR_ID;

        if (!wasInRepair && goingToRepair) {
          const reason = window.prompt("Reason for sending to Repair Shop? (optional)") || undefined;
          next.equipment[eqIdx] = startRepair(next.equipment[eqIdx], reason);
        } else if (wasInRepair && !goingToRepair) {
          next.equipment[eqIdx] = endRepair(next.equipment[eqIdx]);
        }
      }

      writeDB(next);
      return next;
    });

    setEquipIndex(ix => {
      const next = { ...ix, [equipId]: toProjectId };
      writeEquipIndex(next);
      return next;
    });
  }

  function EquipChip({ e }: { e: Equipment }) {
    const label = equipmentLabel(e) || "(unnamed)";
    const isRental = !!e.isRental;
    const inRepair = (equipIndex[e.id] === SYS_REPAIR_ID);
    const repairDays = inRepair ? daysInOpenRepair(e) : 0;

    return (
      <div
        draggable
        onDragStart={(ev) => ev.dataTransfer.setData("text/equip", e.id)}
        className="inline-flex items-center gap-2 bg-cyan-900/30 border border-cyan-400/30 rounded-xl px-2.5 py-1 text-cyan-100 text-sm mr-2 mb-2 cursor-grab"
        title={e.rentalVendor ? `Vendor: ${e.rentalVendor}` : undefined}
      >
        <span>{label}</span>
        {isRental && <Badge text="Rental" />}
        {inRepair && <Badge text={`Repair • ${repairDays}d`} tone="rose" />}
      </div>
    );
  }

  const dropZoneProps = (projectId: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes("text/equip")) e.preventDefault();
    },
    onDrop: (e: React.DragEvent) => {
      const eid = e.dataTransfer.getData("text/equip");
      if (!eid) return;
      placeEquip(eid, projectId);
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-cyan-100 text-xl font-semibold">Dashboard</h2>
        <div className="text-cyan-300/80 text-sm">
          Unassigned Equip: {unassignedEquip.length} • Projects: {db.projects.length}
        </div>
      </div>

      {/* Unassigned Pool */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <div className="text-cyan-200 font-medium mb-2">Unassigned Pool (Equipment)</div>
        <div className="text-xs text-cyan-300/70 mb-3">
          Drag equipment into projects. Drag between projects to <span className="underline">move</span>.
        </div>
        <div className="min-h-[56px]" {...dropZoneProps(null)}>
          {unassignedEquip.map(e => <EquipChip key={e.id} e={e} />)}
        </div>
      </div>

      {/* Projects */}
      <div className="grid grid-cols-3 gap-5">
        {projects.map(p => (
          <div key={p.id} className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-cyan-100 font-medium">
                {p.name} {p.number ? <span className="opacity-60">• {p.number}</span> : null}
              </div>
              {p.special === "repair" && <Badge text="Special" tone="rose" />}
              {p.special === "warehouse" && <Badge text="Special" tone="cyan" />}
            </div>

            <div className="text-xs text-cyan-300/70 mb-2">
              {p.special === "repair"
                ? "Drop equipment here to open a repair log (you'll add a reason)."
                : p.special === "warehouse"
                  ? "Staging/yard location (no log)."
                  : "Project equipment"}
            </div>

            <div className="min-h-[56px]" {...dropZoneProps(p.id)}>
              {db.equipment
                .filter(e => equipIndex[e.id] === p.id)
                .map(e => <EquipChip key={e.id} e={e} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
