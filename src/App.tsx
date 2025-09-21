import React, { useState } from "react";
import Board from "./features/board/Board";
import Profiles from "./features/profiles/Profiles";
import { loadSampleData } from "./features/seed/seed";

type Tab = "board" | "profiles" | "time" | "logs" | "io";

export default function App(){
  const [tab,setTab] = useState<Tab>("board");

  const seed = () => {
    const ok = confirm("Load sample data now?\n\nThis replaces the in-browser demo data (no server yet).");
    if (!ok) return;
    loadSampleData();
    location.reload();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex">
      {/* Sidebar */}
      <aside className="w-[220px] border-r border-white/10 p-3">
        <div className="px-2 py-2 mb-2">
          {/* Wordmark logo only (no small square icon) */}
          <img
            src="/opsync-logo.svg"
            alt="OpsSync.AI"
            className="h-6 w-auto select-none"
            draggable={false}
          />
        </div>

        <NavItem active={tab==="board"} onClick={()=>setTab("board")}>Dashboard</NavItem>
        <NavItem active={tab==="profiles"} onClick={()=>setTab("profiles")}>Profiles</NavItem>
        <NavItem active={tab==="time"} onClick={()=>setTab("time")}>Time & Attendance</NavItem>
        <NavItem active={tab==="logs"} onClick={()=>setTab("logs")}>DB Logs</NavItem>
        <NavItem active={tab==="io"} onClick={()=>setTab("io")}>Import / Export</NavItem>

        <div className="mt-4 p-2 bg-white/5 border border-white/10 rounded-lg">
          <div className="text-xs text-cyan-300/70 mb-1">Utilities</div>
          <button
            onClick={seed}
            className="w-full text-left px-3 py-1.5 rounded bg-emerald-600/80 hover:bg-emerald-600 text-white text-sm">
            Load sample data
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1">
        {tab==="board"    && <Board/>}
        {tab==="profiles" && <Profiles/>}
        {tab==="time"     && <Placeholder title="Time & Attendance (coming soon)"/>}
        {tab==="logs"     && <Placeholder title="DB Logs (coming soon)"/>}
        {tab==="io"       && <Placeholder title="Import / Export (coming soon)"/>}
      </main>
    </div>
  );
}

const NavItem:React.FC<{active?:boolean;onClick:()=>void;children:React.ReactNode}> =
({active,onClick,children})=>(
  <button onClick={onClick}
    className={`w-full text-left px-3 py-2 rounded-lg mb-1 border ${
      active ? "bg-white/10 border-white/20 text-cyan-100"
             : "bg-transparent border-white/10 hover:bg-white/5"
    }`}>
    {children}
  </button>
);

const Placeholder:React.FC<{title:string}> = ({title})=>(
  <div className="p-8">
    <div className="text-cyan-100 text-xl font-semibold mb-2">{title}</div>
    <div className="text-cyan-300/70">We’ll wire this up after timekeeping flows.</div>
  </div>
);
