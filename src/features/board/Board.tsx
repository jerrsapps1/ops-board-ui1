import React, { useEffect, useMemo, useState } from "react";
import { DB, Worker, Equipment, Project, equipmentLabel } from "../shared/types";
import { readDB, writeDB, readIndex, writeIndex, EIX_KEY, WIX_KEY } from "../shared/db";
import { ensureSystemProjects, SYS_REPAIR_ID, SYS_WAREHOUSE_ID, startRepair, endRepair, daysInOpenRepair } from "../shared/systemProjects";
import Notifications from "./Notifications";

type IndexMap = Record<string,string|null>;

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
  const [equipIndex, setEquipIndex] = useState<IndexMap>(() => readIndex(EIX_KEY));
  const [workerIndex, setWorkerIndex] = useState<IndexMap>(() => readIndex(WIX_KEY));

  // Ensure the two persistent projects exist
  useEffect(() => {
    const ensured = ensureSystemProjects(db);
    if (ensured !== db) { setDb(ensured); writeDB(ensured); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const projects = useMemo<Project[]>(() => {
    const sys = db.projects.filter(p => p.id === SYS_WAREHOUSE_ID || p.id === SYS_REPAIR_ID);
    const rest = db.projects.filter(p => p.id !== SYS_WAREHOUSE_ID && p.id !== SYS_REPAIR_ID);
    return [...rest, ...sys]; // show normal projects first
  }, [db.projects]);

  const unassignedWorkers = db.workers.filter(w => !workerIndex[w.id]);
  const unassignedEquip   = db.equipment.filter(e => !equipIndex[e.id]);

  function placeWorker(workerId: string, toProjectId: string | null) {
    setWorkerIndex(ix => { const next = { ...ix, [workerId]: toProjectId }; writeIndex(WIX_KEY, next); return next; });
  }

  function placeEquip(equipId: string, toProjectId: string | null) {
    setDb(current => {
      let next = { ...current };
      const eqIdx = next.equipment.findIndex(e => e.id === equipId);
      if (eqIdx >= 0) {
        const wasInRepair  = equipIndex[equipId] === SYS_REPAIR_ID;
        const toRepair     = toProjectId === SYS_REPAIR_ID;
        if (!wasInRepair && toRepair) {
          const reason = window.prompt("Reason for sending to Repair Shop? (optional)") || undefined;
          next.equipment[eqIdx] = startRepair(next.equipment[eqIdx], reason);
        } else if (wasInRepair && !toRepair) {
          next.equipment[eqIdx] = endRepair(next.equipment[eqIdx]);
        }
      }
      writeDB(next);
      return next;
    });
    setEquipIndex(ix => { const next = { ...ix, [equipId]: toProjectId }; writeIndex(EIX_KEY, next); return next; });
  }

  const dropZoneProps = (projectId: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes("text/worker") || e.dataTransfer.types.includes("text/equip")) e.preventDefault();
    },
    onDrop: (e: React.DragEvent) => {
      const wid = e.dataTransfer.getData("text/worker");
      const eid = e.dataTransfer.getData("text/equip");
      if (wid) return placeWorker(wid, projectId);
      if (eid) return placeEquip(eid, projectId);
    },
  });

  const ProjectHeader:React.FC<{p:Project}> = ({p})=>{
    const crewCount  = db.workers.filter(w => workerIndex[w.id] === p.id).length;
    const equipCount = db.equipment.filter(e => equipIndex[e.id] === p.id).length;
    const crewTarget = p.crewTarget ?? 0;
    const equipTarget= p.equipTarget ?? 0;
    return (
      <div className="flex items-center justify-between mb-2">
        <div className="text-cyan-100 font-medium">
          {p.name} {p.number ? <span className="opacity-60">• {p.number}</span> : null}
        </div>
        <div className="flex gap-2">
          <span className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-cyan-200">Crew {crewCount}/{crewTarget}</span>
          <span className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-cyan-200">Equip {equipCount}/{equipTarget}</span>
          {p.special === "repair" && <Badge text="Special" tone="rose" />}
          {p.special === "warehouse" && <Badge text="Special" tone="cyan" />}
        </div>
      </div>
    );
  };

  const WorkerChip:React.FC<{w:Worker}> = ({w})=>(
    <Pill>
      <span>{w.name}</span>
    </Pill>
  );

  const EquipChip:React.FC<{e:Equipment}> = ({e})=>{
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
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-cyan-100 text-xl font-semibold">Dashboard</h2>
        <Notifications db={db} equipIndex={equipIndex}/>
      </div>

      {/* Unassigned Pool */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <div className="text-cyan-200 font-medium mb-2">Unassigned Pool</div>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-xs text-cyan-300/70 mb-1">Workers</div>
            <div className="min-h-[56px]" {...dropZoneProps(null)}>
              {unassignedWorkers.map(w=>(
                <div
                  key={w.id}
                  draggable
                  onDragStart={(ev)=>ev.dataTransfer.setData("text/worker", w.id)}
                  className="inline-block"
                >
                  <WorkerChip w={w}/>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-cyan-300/70 mb-1">Equipment</div>
            <div className="min-h-[56px]" {...dropZoneProps(null)}>
              {unassignedEquip.map(e=> <EquipChip key={e.id} e={e}/>)}
            </div>
          </div>
        </div>
      </div>

      {/* Projects */}
      <div className="grid grid-cols-3 gap-5">
        {projects.map(p=>(
          <div key={p.id} className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <ProjectHeader p={p}/>
            <div className="text-xs text-cyan-300/70 mb-1">Crew</div>
            <div className="min-h-[56px] mb-3" {...dropZoneProps(p.id)}>
              {db.workers.filter(w=>workerIndex[w.id]===p.id).map(w=> <WorkerChip key={w.id} w={w}/>)}
            </div>

            <div className="text-xs text-cyan-300/70 mb-1">Equipment</div>
            <div className="min-h-[56px]" {...dropZoneProps(p.id)}>
              {db.equipment.filter(e=>equipIndex[e.id]===p.id).map(e=> <EquipChip key={e.id} e={e}/>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
