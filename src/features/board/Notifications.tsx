import React, { useMemo, useState } from "react";
import { DB } from "../shared/types";
import { SYS_REPAIR_ID, daysInOpenRepair } from "../shared/systemProjects";

export default function Notifications({ db, equipIndex }:{ db:DB; equipIndex:Record<string,string|null> }){
  const [open,setOpen] = useState(false);
  const repairNotices = useMemo(()=>{
    return db.equipment
      .filter(e => equipIndex[e.id] === SYS_REPAIR_ID)
      .map(e => ({
        id: e.id,
        text: `${(e.assetNumber||e.code||"Asset")} in Repair • ${daysInOpenRepair(e)}d`,
      }));
  },[db.equipment,equipIndex]);
  const total = repairNotices.length;

  return (
    <>
      <button onClick={()=>setOpen(true)} className="relative px-3 py-1.5 text-sm bg-white/10 hover:bg-white/15 rounded-lg text-cyan-100">
        🔔 Notifications
        {total>0 && (<span className="absolute -top-2 -right-2 bg-rose-500 text-white text-[10px] rounded-full px-1.5 py-0.5">{total}</span>)}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start justify-end">
          <div className="mt-16 mr-6 w-[420px] bg-slate-900 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-cyan-100 font-medium">Notifications</div>
              <button onClick={()=>setOpen(false)} className="px-2 py-1 text-sm bg-white/10 hover:bg-white/15 rounded text-cyan-100">Close</button>
            </div>

            <Section title="Repair in progress">
              {repairNotices.length ? (
                <ul className="space-y-1">
                  {repairNotices.map(n=><li key={n.id} className="text-sm text-cyan-100">{n.text}</li>)}
                </ul>
              ) : <Empty/>}
            </Section>

            <Section title="Rentals ending soon (coming next)"><Empty/></Section>
            <Section title="Service reminders (coming next)"><Empty/></Section>
          </div>
        </div>
      )}
    </>
  );
}

const Section:React.FC<{title:string;children:React.ReactNode}> = ({title,children})=>(
  <div className="mb-4">
    <div className="text-xs uppercase tracking-wide text-cyan-300/70 mb-1">{title}</div>
    <div className="bg-white/5 border border-white/10 rounded-xl p-3">{children}</div>
  </div>
);
const Empty = ()=> <div className="text-sm text-cyan-300/70">No items.</div>;
