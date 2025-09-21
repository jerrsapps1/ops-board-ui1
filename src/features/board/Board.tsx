import React, { useMemo, useRef, useState } from "react";

/** ---------- Brand / White-label ----------
 * Swap logoUrl to your own file later (e.g. /opsync-logo.png).
 */
const BRAND = {
  companyName: "OpsSync.AI",
  logoUrl: "/opsync-logo.svg",
  logoWidth: 28,
};

type RoleTag = "Lead" | "Assistant" | null;
type Status = "active" | "idle" | "repair" | "hold" | "leave";

interface Worker{
  id:string; name:string; role:string; certs:string[];
  phone?:string; email?:string; status?:Status; homeBase?:string; notes?:string;
}
interface Equip{
  id:string; code:string; kind:string; status:"active"|"idle"|"repair";
  owner?:string; serviceDue?:string; location?:string; fuel?:string; notes?:string;
}
interface Project{
  id:string; name:string; targetCrew:number; targetEquip:number;
  client?:string; address?:string; primeSupervisor?:string; status?:Status; notes?:string;
}
interface CrewSeg{ workerId:string; roleTag:RoleTag }
interface EquipSeg{ equipId:string }

type NavTab = "dashboard"|"profiles"|"time"|"logs"|"import";
type ToastState = { visible:boolean; text:string; undo?:()=>void };
type ProfileOpen =
  | { type:"worker"; id:string }
  | { type:"equip"; id:string }
  | { type:"project"; id:string }
  | null;

type LogEntry = {
  id:string;
  ts:string;           // ISO
  actor:string;        // e.g. "Sam" (placeholder)
  entity:"worker"|"equip"|"project"|"timesheet";
  entityId:string;
  action:string;       // e.g. "assign","move","unassign","save","add","complete"
  details?:string;
};

type TimeEntry = {
  id:string;
  workerId:string;
  projectId:string;
  date:string;     // YYYY-MM-DD
  hours:number;
  via:"supervisor"|"manual";
  approved:boolean;
};

// --- Seeds ---
const SEED_WORKERS: Worker[] = [
  { id:"w1", name:"Jose Garcia", role:"Operator", certs:["Skid Steer","Telehandler"], status:"active" },
  { id:"w2", name:"Aubrey M.", role:"Supervisor", certs:["Any"], status:"active" },
  { id:"w3", name:"Solomon S.", role:"Laborer", certs:[], status:"active" },
  { id:"w4", name:"Derrick T.", role:"Laborer", certs:[], status:"active" },
  { id:"w5", name:"James F.", role:"Operator", certs:["Excavator"], status:"active" },
];
const SEED_EQUIP: Equip[] = [
  { id:"e1", code:"YSK-032", kind:"Skid Steer", status:"active" },
  { id:"e2", code:"YEX-027", kind:"Excavator", status:"active" },
  { id:"e3", code:"TL943C-010", kind:"Telehandler", status:"idle" },
  { id:"e4", code:"ED800-008", kind:"Dump Buggy", status:"repair" },
];
const SEED_PROJECTS: Project[] = [
  { id:"p1", name:"San Marcos", targetCrew:6, targetEquip:3, status:"active" },
  { id:"p2", name:"Fort Sam", targetCrew:5, targetEquip:2, status:"active" },
  { id:"p3", name:"Tower of Life", targetCrew:4, targetEquip:2, status:"active" },
];

function tl(n:number,t:number){
  if(n>=t) return {tone:"ok",label:"OK"};
  if(n>=Math.max(1,t-1)) return {tone:"warn",label:"Low"};
  return {tone:"bad",label:"Under"};
}

// CSV utils
function parseCSV(text:string){
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift()!.split(",").map(h=>h.trim().toLowerCase());
  return lines.filter(l=>l.trim()).map(line=>{
    const cells = line.split(",").map(c=>c.trim());
    const obj:Record<string,string> = {};
    headers.forEach((h,i)=>obj[h]=cells[i]||"");
    return obj;
  });
}
function csvEscape(s:string){ return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }
function toCSV(rows:string[][]){ return rows.map(r=>r.map(csvEscape).join(",")).join("\n"); }
function download(filename:string, content:string, mime="text/plain;charset=utf-8"){
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function Board(){
  // Data
  const [workers,setWorkers]   = useState<Worker[]>(SEED_WORKERS);
  const [equip,setEquip]       = useState<Equip[]>(SEED_EQUIP);
  const [projects,setProjects] = useState<Project[]>(SEED_PROJECTS);

  // Assignments
  const [crewByProject,setCrewByProject]   = useState<Record<string,CrewSeg[]>>({});
  const [equipByProject,setEquipByProject] = useState<Record<string,EquipSeg[]>>({});

  // Time & Attendance
  const today = new Date().toISOString().slice(0,10);
  const [timeDate,setTimeDate] = useState<string>(today);
  const [timesheets,setTimesheets] = useState<TimeEntry[]>([
    { id:"t1", workerId:"w2", projectId:"p1", date:today, hours:4, via:"supervisor", approved:false },
    { id:"t2", workerId:"w3", projectId:"p1", date:today, hours:6, via:"supervisor", approved:true  },
  ]);

  // Audit logs
  const [logs,setLogs] = useState<LogEntry[]>([]);
  function logEvent(e:Omit<LogEntry,"id"|"ts"|"actor">){
    const entry:LogEntry = { id:crypto.randomUUID(), ts:new Date().toISOString(), actor:"Sam", ...e };
    setLogs(prev=>[entry, ...prev]);
  }

  // UI
  const [globalSearch,setGlobalSearch] = useState("");
  const [nav,setNav]       = useState<NavTab>("dashboard");
  const [toast,setToast]   = useState<ToastState>({visible:false, text:""});

  const workerCSVRef = useRef<HTMLInputElement>(null);
  const equipCSVRef  = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  function showToast(text:string, undo?:()=>void){
    if(toastTimer.current){ window.clearTimeout(toastTimer.current); }
    setToast({visible:true, text, undo});
    // @ts-ignore
    toastTimer.current = window.setTimeout(()=>setToast({visible:false, text:""}), 4000);
  }

  // Profile modal
  const [profile,setProfile] = useState<ProfileOpen>(null);
  const [draft,setDraft] = useState<any>({});
  function openProfile(kind: ProfileOpen["type"], id:string){
    setProfile({type:kind, id});
    if(kind==="worker") setDraft({...workers.find(w=>w.id===id)});
    if(kind==="equip")  setDraft({...equip.find(e=>e.id===id)});
    if(kind==="project") setDraft({...projects.find(p=>p.id===id)});
  }
  function closeProfile(){ setProfile(null); setDraft({}); }
  function saveProfile(){
    if(!profile) return;
    if(profile.type==="worker"){
      setWorkers(ws=>ws.map(w=>w.id===profile.id? {...w, ...draft, certs:(draft.certs||[])} : w));
      logEvent({entity:"worker", entityId:profile.id, action:"save", details:"Updated worker profile"});
      showToast("Worker profile saved");
    }
    if(profile.type==="equip"){
      setEquip(es=>es.map(e=>e.id===profile.id? {...e, ...draft} : e));
      logEvent({entity:"equip", entityId:profile.id, action:"save", details:"Updated equipment profile"});
      showToast("Equipment profile saved");
    }
    if(profile.type==="project"){
      setProjects(ps=>ps.map(p=>p.id===profile.id? {...p, ...draft, targetCrew:Number(draft.targetCrew||0), targetEquip:Number(draft.targetEquip||0)} : p));
      logEvent({entity:"project", entityId:profile.id, action:"save", details:"Updated project profile"});
      showToast("Project profile saved");
    }
    closeProfile();
  }

  // Maps & sets
  const workerMap = useMemo(()=>Object.fromEntries(workers.map(w=>[w.id,w])),[workers]);
  const equipMap  = useMemo(()=>Object.fromEntries(equip.map(e=>[e.id,e])),[equip]);

  const assignedWorkerIds = useMemo(()=> new Set(
    Object.values(crewByProject).flat().map(s=>s.workerId)
  ), [crewByProject]);
  const assignedEquipIds = useMemo(()=> new Set(
    Object.values(equipByProject).flat().map(s=>s.equipId)
  ), [equipByProject]);

  // Global search: lowercased
  const q = globalSearch.trim().toLowerCase();

  // Pools show only unassigned, then filtered
  const poolWorkers = workers
    .filter(w=>!assignedWorkerIds.has(w.id))
    .filter(w=>!q || (w.name+" "+w.role+" "+w.certs.join(" ")).toLowerCase().includes(q));
  const poolEquip = equip
    .filter(e=>!assignedEquipIds.has(e.id))
    .filter(e=>!q || (e.code+" "+e.kind+" "+(e.location||"")).toLowerCase().includes(q));

  // Cross-entity matchers (projects filter on Dashboard)
  function projectMatches(p:Project){
    if(!q) return true;
    if(p.name.toLowerCase().includes(q)) return true;
    const crew = (crewByProject[p.id]||[]);
    const eq   = (equipByProject[p.id]||[]);
    if(crew.some(s => (workerMap[s.workerId]?.name||"").toLowerCase().includes(q))) return true;
    if(eq.some(s => (equipMap[s.equipId]?.code||"").toLowerCase().includes(q))) return true;
    return false;
  }

  // Drag helpers
  function onDragStart(ev:React.DragEvent,p:any){
    ev.dataTransfer.setData("application/json",JSON.stringify(p));
  }
  function allowDrop(ev:React.DragEvent){ ev.preventDefault(); }

  // MOVE workers (no prompts). Toast + Undo. Also logs.
  function dropWorker(pid:string,ev:React.DragEvent){
    ev.preventDefault();
    try{
      const pl = JSON.parse(ev.dataTransfer.getData("application/json"));
      if(pl.type!=="worker") return;
      const wid = pl.id as string;

      const prevCrew = crewByProject;
      setCrewByProject(prev=>{
        let fromPid: string | null = null;
        for(const [k,list] of Object.entries(prev)){
          if((list||[]).some(s=>s.workerId===wid)){ fromPid = k; break; }
        }
        if(fromPid===pid) return prev;

        const next: typeof prev = {};
        for(const k of Object.keys(prev)) next[k] = [...(prev[k]||[])];

        let tag:RoleTag = null;
        if(fromPid){
          const oldSeg = (prev[fromPid]||[]).find(s=>s.workerId===wid);
          tag = oldSeg?.roleTag ?? null;
          next[fromPid] = next[fromPid].filter(s=>s.workerId!==wid);
        }
        next[pid] = [...(next[pid]||[]), {workerId:wid, roleTag:tag}];

        const pName = projects.find(p=>p.id===pid)?.name ?? pid;
        showToast(`Moved worker to ${pName}`, ()=>setCrewByProject(prevCrew));
        logEvent({entity:"worker", entityId:wid, action:"move", details:`to ${pName}`});
        return next;
      });
    }catch{}
  }

  // MOVE equipment
  function dropEquip(pid:string,ev:React.DragEvent){
    ev.preventDefault();
    try{
      const pl = JSON.parse(ev.dataTransfer.getData("application/json"));
      if(pl.type!=="equip") return;
      const eid = pl.id as string;

      const prevEquip = equipByProject;
      setEquipByProject(prev=>{
        let fromPid: string | null = null;
        for(const [k,list] of Object.entries(prev)){
          if((list||[]).some(s=>s.equipId===eid)){ fromPid = k; break; }
        }
        if(fromPid===pid) return prev;

        const next: typeof prev = {};
        for(const k of Object.keys(prev)) next[k] = [...(prev[k]||[])];

        if(fromPid){
          next[fromPid] = next[fromPid].filter(s=>s.equipId!==eid);
        }
        next[pid] = [...(next[pid]||[]), {equipId:eid}];

        const pName = projects.find(p=>p.id===pid)?.name ?? pid;
        showToast(`Moved equipment to ${pName}`, ()=>setEquipByProject(prevEquip));
        logEvent({entity:"equip", entityId:eid, action:"move", details:`to ${pName}`});
        return next;
      });
    }catch{}
  }

  // Chip actions
  function removeCrewSeg(pid:string,idx:number){
    const prev = crewByProject;
    const seg = (prev[pid]||[])[idx];
    setCrewByProject(p=>({...p,[pid]:(p[pid]||[]).filter((_,i)=>i!==idx)}));
    showToast("Removed worker from project", ()=>setCrewByProject(prev));
    if(seg) logEvent({entity:"worker", entityId:seg.workerId, action:"unassign", details:`from ${projects.find(p=>p.id===pid)?.name||pid}`});
  }
  function removeEquipSeg(pid:string,idx:number){
    const prev = equipByProject;
    const seg = (prev[pid]||[])[idx];
    setEquipByProject(p=>({...p,[pid]:(p[pid]||[]).filter((_,i)=>i!==idx)}));
    showToast("Removed equipment from project", ()=>setEquipByProject(prev));
    if(seg) logEvent({entity:"equip", entityId:seg.equipId, action:"unassign", details:`from ${projects.find(p=>p.id===pid)?.name||pid}`});
  }
  function cycleTag(pid:string, idx:number){
    setCrewByProject(prev=>{
      const list = prev[pid]||[];
      const nextList = list.map((s,i)=>{
        if(i!==idx) return s;
        const nextTag:RoleTag = s.roleTag==="Lead" ? "Assistant" : s.roleTag==="Assistant" ? null : "Lead";
        return {...s, roleTag: nextTag};
      });
      return {...prev, [pid]: nextList};
    });
  }

  // CSV import
  function importWorkerCSV(file:File){
    file.text().then(txt=>{
      const rows = parseCSV(txt);
      let next = workers.slice();
      rows.forEach(r=>{
        const name = r["name"] || r["employee"] || r["full name"]; if(!name) return;
        const role = r["role"] || "Worker";
        const certs = (r["certs"]||"").split(/[;,]/).map(s=>s.trim()).filter(Boolean);
        const id = "w"+(crypto.randomUUID());
        next.push({id,name,role,certs,status:"active"});
        logEvent({entity:"worker", entityId:id, action:"add", details:`import ${name}`});
      });
      setWorkers(next);
      alert(`Imported ${rows.length} worker rows.`);
    });
  }
  function importEquipCSV(file:File){
    file.text().then(txt=>{
      const rows = parseCSV(txt);
      let next = equip.slice();
      rows.forEach(r=>{
        const code = r["code"] || r["unit"] || r["id"]; if(!code) return;
        const kind = r["kind"] || r["type"] || "Unknown";
        const status = ((r["status"]||"active").toLowerCase() as Equip["status"]);
        const id = "e"+(crypto.randomUUID());
        next.push({id,code,kind,status});
        logEvent({entity:"equip", entityId:id, action:"add", details:`import ${code}`});
      });
      setEquip(next);
      alert(`Imported ${rows.length} equipment rows.`);
    });
  }

  // Report + Exports (lived on Import/Export tab previously)
  const [report,setReport] = useState("");
  function generateReport(){
    const lines:string[]=[];
    projects.forEach(p=>{
      const c = crewByProject[p.id]||[], e = equipByProject[p.id]||[];
      const cc = new Set(c.map(s=>s.workerId)).size, ec = new Set(e.map(s=>s.equipId)).size;
      lines.push(`${p.name}: ${cc} workers (${tl(cc,p.targetCrew).label}); ${ec} units (${tl(ec,p.targetEquip).label}).`);
    });
    lines.push("\nNote: Worker hours come from supervisor timekeeping (mobile).");
    setReport(lines.join("\n"));
  }
  function exportWorkersCSV(){
    const rows = [["id","name","role","certs","phone","email","status","homeBase","notes"],
      ...workers.map(w=>[w.id,w.name,w.role,w.certs.join("; "),w.phone||"",w.email||"",w.status||"",w.homeBase||"",w.notes||""])];
    download("workers.csv", toCSV(rows), "text/csv;charset=utf-8");
  }
  function exportEquipCSV(){
    const rows = [["id","code","kind","status","owner","serviceDue","location","fuel","notes"],
      ...equip.map(e=>[e.id,e.code,e.kind,e.status,e.owner||"",e.serviceDue||"",e.location||"",e.fuel||"",e.notes||""])];
    download("equipment.csv", toCSV(rows), "text/csv;charset=utf-8");
  }
  function exportProjectsCSV(){
    const rows = [["id","name","targetCrew","targetEquip","client","address","primeSupervisor","status","notes"],
      ...projects.map(p=>[p.id,p.name,String(p.targetCrew),String(p.targetEquip),p.client||"",p.address||"",p.primeSupervisor||"",p.status||"",p.notes||""])];
    download("projects.csv", toCSV(rows), "text/csv;charset=utf-8");
  }
  function exportAssignmentsCSV(){
    const rows:string[][] = [["project","type","id","label","tag"]];
    projects.forEach(p=>{
      (crewByProject[p.id]||[]).forEach(s=>{
        rows.push([p.name,"worker",s.workerId, workerMap[s.workerId]?.name || s.workerId, s.roleTag||""]);
      });
      (equipByProject[p.id]||[]).forEach(s=>{
        rows.push([p.name,"equip",s.equipId, equipMap[s.equipId]?.code || s.equipId, ""]);
      });
    });
    download("assignments.csv", toCSV(rows), "text/csv;charset=utf-8");
  }
  function downloadReportTXT(){
    if(!report) generateReport();
    const txt = report || "";
    download("daily-report.txt", txt, "text/plain;charset=utf-8");
  }

  const NavButton = ({id,label}:{id:NavTab; label:string}) => (
    <button
      onClick={()=>setNav(id)}
      className={`w-full text-left px-3 py-2 rounded-lg border transition ${nav===id?"bg-white/15 border-white/30":"bg-white/5 border-white/10 hover:bg-white/10"}`}
    >{label}</button>
  );

  // ---- Add forms for Profiles ----
  const [showAddWorker,setShowAddWorker]   = useState(false);
  const [showAddEquip,setShowAddEquip]     = useState(false);
  const [showAddProject,setShowAddProject] = useState(false);
  const [newWorker,setNewWorker]   = useState<Partial<Worker>>({ role:"Worker", certs:[], status:"active" });
  const [newEquip,setNewEquip]     = useState<Partial<Equip>>({ status:"active" });
  const [newProject,setNewProject] = useState<Partial<Project>>({ targetCrew:4, targetEquip:2, status:"active" });

  function resetAdds(){
    setNewWorker({ role:"Worker", certs:[], status:"active" });
    setNewEquip({ status:"active" });
    setNewProject({ targetCrew:4, targetEquip:2, status:"active" });
  }

  function addWorker(){
    if(!newWorker.name){ alert("Name required (or Cancel)."); return; }
    const id = "w"+(crypto.randomUUID());
    const certs = (newWorker.certs as any) || [];
    setWorkers(ws=>[...ws, {
      id,
      name:newWorker.name!,
      role:newWorker.role||"Worker",
      certs:Array.isArray(certs)?certs:String(certs).split(",").map((s:string)=>s.trim()).filter(Boolean),
      phone:newWorker.phone||"",
      email:newWorker.email||"",
      status:(newWorker.status as Status)||"active",
      homeBase:newWorker.homeBase||"",
      notes:newWorker.notes||""
    } ]);
    setShowAddWorker(false); resetAdds(); showToast("Worker added");
    logEvent({entity:"worker", entityId:id, action:"add", details:newWorker.name});
  }
  function addEquip(){
    if(!newEquip.code){ alert("Equipment code required (or Cancel)."); return; }
    const id = "e"+(crypto.randomUUID());
    setEquip(es=>[...es, {
      id, code:newEquip.code!, kind:newEquip.kind||"Unknown", status:(newEquip.status as any)||"active",
      owner:newEquip.owner||"", serviceDue:newEquip.serviceDue||"", location:newEquip.location||"", fuel:newEquip.fuel||"", notes:newEquip.notes||""
    } ]);
    setShowAddEquip(false); resetAdds(); showToast("Equipment added");
    logEvent({entity:"equip", entityId:id, action:"add", details:newEquip.code});
  }
  function addProject(){
    if(!newProject.name){ alert("Project name required (or Cancel)."); return; }
    const id = "p"+(crypto.randomUUID());
    setProjects(ps=>[...ps, {
      id, name:newProject.name!, targetCrew:Number(newProject.targetCrew||0), targetEquip:Number(newProject.targetEquip||0),
      client:newProject.client||"", address:newProject.address||"", primeSupervisor:newProject.primeSupervisor||"",
      status:(newProject.status as Status)||"active", notes:newProject.notes||""
    } ]);
    setShowAddProject(false); resetAdds(); showToast("Project added");
    logEvent({entity:"project", entityId:id, action:"add", details:newProject.name});
  }

  // ---- UI elements shared ----
  const TitleHome = (
    <button onClick={()=>setNav("dashboard")} className="flex items-center gap-3 group">
      {BRAND.logoUrl
        ? <img src={BRAND.logoUrl} width={BRAND.logoWidth} alt={`${BRAND.companyName} logo`} className="rounded" />
        : <div className="w-7 h-7 rounded bg-white/15 border border-white/20 flex items-center justify-center text-xs">{BRAND.companyName.slice(0,2)}</div>
      }
      <span className="text-2xl sm:text-3xl font-bold group-hover:underline">{BRAND.companyName}</span>
    </button>
  );

  // ------------- RENDER -------------
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-slate-100">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-56 border-r border-white/10 bg-white/5 p-4 z-20">
        <div className="mb-4 flex items-center gap-2">
          {BRAND.logoUrl
            ? <img src={BRAND.logoUrl} width={BRAND.logoWidth} alt={`${BRAND.companyName} logo`} className="rounded" />
            : <div className="w-7 h-7 rounded bg-white/15 border border-white/20 flex items-center justify-center text-xs">{BRAND.companyName.slice(0,2)}</div>
          }
          <div className="font-bold">{BRAND.companyName}</div>
        </div>
        <div className="space-y-2">
          <NavButton id="dashboard" label="Dashboard"/>
          <NavButton id="profiles"  label="Profiles"/>
          <NavButton id="time"      label="Time & Attendance"/>
          <NavButton id="logs"      label="DB Logs"/>
          <NavButton id="import"    label="Import / Export"/>
        </div>
        <div className="mt-6 text-xs text-slate-400">
          <div>Crew: {Array.from(new Set(Object.values(crewByProject).flat().map(s=>s.workerId))).length}</div>
          <div>Equip: {Array.from(new Set(Object.values(equipByProject).flat().map(s=>s.equipId))).length}</div>
        </div>
      </aside>

      {/* Main */}
      <div className="ml-56 p-6">
        {/* Top bar */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>{TitleHome}</div>

          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            {/* Tab buttons (also clickable) */}
            <div className="flex rounded-lg overflow-hidden border border-white/20">
              {(["dashboard","profiles","time","logs","import"] as NavTab[]).map(t => (
                <button
                  key={t}
                  onClick={()=>setNav(t)}
                  className={`px-3 py-2 text-sm ${nav===t ? "bg-white/20" : "bg-white/10 hover:bg-white/15"} border-r border-white/10 last:border-r-0`}
                >
                  {t==="dashboard" ? "Dashboard" : t==="profiles" ? "Profiles" : t==="time" ? "Time & Attendance" : t==="logs" ? "DB Logs" : "Import/Export"}
                </button>
              ))}
            </div>

            {/* Global search (wide + grows) */}
            <input
              className="bg-slate-800 border border-slate-700 rounded px-3 py-2 min-w-[360px] w-[clamp(360px,40vw,640px)] flex-grow"
              placeholder="Search anything (workers, equipment, projects, assignments, time, logs)…"
              value={globalSearch}
              onChange={e=>setGlobalSearch(e.target.value)}
            />
          </div>
        </div>

        {/* DASHBOARD */}
        {nav==="dashboard" && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              {/* Unassigned Pool */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur">
                <h2 className="text-lg font-semibold mb-3">Unassigned Pool</h2>

                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Workers</span>
                    <span className="text-xs text-slate-400">{poolWorkers.length}</span>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-auto pr-1">
                    {poolWorkers.map(w=>(
                      <div key={w.id}
                           draggable
                           onDragStart={e=>onDragStart(e,{type:"worker",id:w.id})}
                           className="cursor-grab active:cursor-grabbing rounded-2xl border border-white/10 bg-white/5 p-2 hover:bg-white/10">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium">{w.name}</div>
                          <button onClick={()=>openProfile("worker", w.id)} className="text-[10px] px-2 py-0.5 rounded bg-white/10 border border-white/20 hover:bg-white/20">Profile</button>
                        </div>
                        <div className="text-xs text-slate-300">{w.role} • Certs: {w.certs.join(", ")||"—"}</div>
                      </div>
                    ))}
                    {poolWorkers.length===0 && <div className="text-xs text-slate-400">No unassigned workers</div>}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Equipment</span>
                    <span className="text-xs text-slate-400">{poolEquip.length}</span>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-auto pr-1">
                    {poolEquip.map(ei=>(
                      <div key={ei.id}
                           draggable
                           onDragStart={e=>onDragStart(e,{type:"equip",id:ei.id})}
                           className="cursor-grab active:cursor-grabbing rounded-2xl border border-white/10 bg-white/5 p-2 hover:bg-white/10">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium">{ei.code} • {ei.kind}</div>
                          <button onClick={()=>openProfile("equip", ei.id)} className="text-[10px] px-2 py-0.5 rounded bg-white/10 border border-white/20 hover:bg-white/20">Profile</button>
                        </div>
                        <div className="text-xs text-slate-300">Status: {ei.status}</div>
                      </div>
                    ))}
                    {poolEquip.length===0 && <div className="text-xs text-slate-400">No unassigned equipment</div>}
                  </div>
                </div>
              </div>

              {/* Active projects */}
              {projects.filter(p=>p.status==="active").filter(projectMatches).map(p=>{
                const crewSegs=crewByProject[p.id]||[], eqSegs=equipByProject[p.id]||[];
                const cc=new Set(crewSegs.map(s=>s.workerId)).size; const ec=new Set(eqSegs.map(s=>s.equipId)).size;
                const cTL=tl(cc,p.targetCrew), eTL=tl(ec,p.targetEquip);
                return (
                  <div key={p.id}
                       className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur"
                       onDragOver={allowDrop}
                       onDrop={e=>{ try{ const pl=JSON.parse(e.dataTransfer.getData("application/json")); if(pl.type==="worker") dropWorker(p.id,e); if(pl.type==="equip") dropEquip(p.id,e);}catch{} }}>
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold">{p.name}</h2>
                        <button onClick={()=>openProfile("project", p.id)} className="text-[10px] px-2 py-0.5 rounded bg-white/10 border border-white/20 hover:bg-white/20">Profile</button>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`px-2 py-1 rounded border ${cTL.tone==="ok"?"bg-emerald-500/20 border-emerald-400/30":cTL.tone==="warn"?"bg-amber-500/20 border-amber-400/30":"bg-rose-500/20 border-rose-400/30"}`}>Crew {cc}/{p.targetCrew} ({cTL.label})</span>
                        <span className={`px-2 py-1 rounded border ${eTL.tone==="ok"?"bg-emerald-500/20 border-emerald-400/30":eTL.tone==="warn"?"bg-amber-500/20 border-amber-400/30":"bg-rose-500/20 border-rose-400/30"}`}>Equip {ec}/{p.targetEquip} ({eTL.label})</span>
                      </div>
                    </div>

                    <div className="grid gap-3">
                      <div>
                        <div className="text-sm font-medium mb-1">Crew (hours via supervisor)</div>
                        <div className="flex flex-wrap gap-2 min-h-10 border border-white/10 rounded-lg p-2">
                          {crewSegs.map((seg,idx)=>(
                            <div key={idx}
                                 draggable
                                 onDragStart={e=>onDragStart(e,{type:"worker",id:seg.workerId})}
                                 className="flex items-center gap-2 rounded-full px-3 py-1 text-sm bg-emerald-500/20 border border-emerald-400/30">
                              <button onClick={()=>removeCrewSeg(p.id,idx)} className="text-xs opacity-80 hover:opacity-100">✕</button>
                              <span>{(workerMap[seg.workerId]?.name || seg.workerId)}</span>
                              <button className="text-[10px] px-2 py-0.5 rounded bg-white/10 border border-white/20 hover:bg-white/20" onClick={()=>openProfile("worker", seg.workerId)}>Profile</button>
                              <button className="text-[10px] px-2 py-0.5 rounded bg-white/10 border border-white/20 hover:bg-white/20" title="Toggle: None → Lead → Assistant → None" onClick={()=>cycleTag(p.id, idx)}>{seg.roleTag ?? "Tag"}</button>
                            </div>
                          ))}
                          {crewSegs.length===0 && <div className="text-xs text-slate-400">Drop workers here</div>}
                        </div>
                      </div>

                      <div>
                        <div className="text-sm font-medium mb-1">Equipment</div>
                        <div className="flex flex-wrap gap-2 min-h-10 border border-white/10 rounded-lg p-2">
                          {eqSegs.map((seg,idx)=>(
                            <div key={idx}
                                 draggable
                                 onDragStart={e=>onDragStart(e,{type:"equip",id:seg.equipId})}
                                 className="flex items-center gap-2 rounded-full px-3 py-1 text-sm bg-sky-500/20 border border-sky-400/30">
                              <button onClick={()=>removeEquipSeg(p.id,idx)} className="text-xs opacity-80 hover:opacity-100">✕</button>
                              <span>{(equipMap[seg.equipId]?.code || seg.equipId)}</span>
                              <button className="text-[10px] px-2 py-0.5 rounded bg-white/10 border border-white/20 hover:bg-white/20" onClick={()=>openProfile("equip", seg.equipId)}>Profile</button>
                            </div>
                          ))}
                          {eqSegs.length===0 && <div className="text-xs text-slate-400">Drop equipment here</div>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Archived projects */}
            {projects.some(p=>p.status!=="active") && (
              <div className="mt-6">
                <h3 className="text-base font-semibold mb-2">Archived Projects</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {projects.filter(p=>p.status!=="active").filter(projectMatches).map(p=>(
                    <div key={p.id} className="bg-white/5 border border-white/10 rounded-2xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{p.name}</div>
                        <span className="text-xs px-2 py-1 rounded border bg-slate-600/30 border-slate-400/30">{p.status}</span>
                      </div>
                      <div className="text-xs text-slate-300 mt-1">Targets: {p.targetCrew} crew • {p.targetEquip} equip</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* PROFILES (unchanged fields from prior patch) */}
        {nav==="profiles" && (
          <ProfilesView
            workers={workers} setWorkers={setWorkers}
            equip={equip} setEquip={setEquip}
            projects={projects} setProjects={setProjects}
            showAddWorker={showAddWorker} setShowAddWorker={setShowAddWorker}
            showAddEquip={showAddEquip} setShowAddEquip={setShowAddEquip}
            showAddProject={showAddProject} setShowAddProject={setShowAddProject}
            newWorker={newWorker} setNewWorker={setNewWorker}
            newEquip={newEquip} setNewEquip={setNewEquip}
            newProject={newProject} setNewProject={setNewProject}
            resetAdds={resetAdds} addWorker={addWorker} addEquip={addEquip} addProject={addProject}
            openProfile={openProfile}
            search={q}
          />
        )}

        {/* TIME & ATTENDANCE */}
        {nav==="time" && (
          <TimeView
            date={timeDate} setDate={setTimeDate}
            timesheets={timesheets} setTimesheets={setTimesheets}
            workers={workers} projects={projects}
            onApprove={(id,approved)=>{
              setTimesheets(ts=>ts.map(t=>t.id===id? {...t, approved}:t));
              logEvent({entity:"timesheet", entityId:id, action:approved?"approve":"unapprove"});
            }}
            onAdd={(t)=>{
              setTimesheets(ts=>[t, ...ts]);
              logEvent({entity:"timesheet", entityId:t.id, action:"add", details:`${t.workerId} -> ${t.projectId} ${t.hours}h`});
            }}
            search={q}
          />
        )}

        {/* DB LOGS */}
        {nav==="logs" && (
          <LogsView logs={logs} workers={workers} equip={equip} projects={projects} search={q} onExport={()=>{
            const rows = [["ts","actor","entity","entityId","action","details"],
              ...logs.map(l=>[l.ts,l.actor,l.entity,l.entityId,l.action,l.details||""])];
            download("db-logs.csv", toCSV(rows), "text/csv;charset=utf-8");
          }}/>
        )}

        {/* IMPORT / EXPORT */}
        {nav==="import" && (
          <ImportExportView
            workerCSVRef={workerCSVRef}
            equipCSVRef={equipCSVRef}
            importWorkerCSV={importWorkerCSV}
            importEquipCSV={importEquipCSV}
            generateReport={generateReport}
            downloadReportTXT={downloadReportTXT}
            exportWorkersCSV={exportWorkersCSV}
            exportEquipCSV={exportEquipCSV}
            exportProjectsCSV={exportProjectsCSV}
            exportAssignmentsCSV={exportAssignmentsCSV}
            report={report}
          />
        )}
      </div>

      {/* Profile Drawer */}
      {profile && (
        <ProfileDrawer profile={profile} draft={draft} setDraft={setDraft} closeProfile={closeProfile} saveProfile={saveProfile} />
      )}

      {/* Undo Toast */}
      {toast.visible && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="flex items-center gap-2 rounded-xl px-4 py-3 bg-slate-900/95 border border-white/10 shadow-lg">
            <span className="text-sm">{toast.text}</span>
            {toast.undo && (
              <button onClick={()=>{ toast.undo?.(); setToast({visible:false, text:""}); }} className="text-xs px-2 py-1 rounded bg-white/10 border border-white/20 hover:bg-white/20">Undo</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Subviews & Components ---------- */

function ProfilesView(props:any){
  const {
    workers,setWorkers,equip,setEquip,projects,setProjects,
    showAddWorker,setShowAddWorker,showAddEquip,setShowAddEquip,showAddProject,setShowAddProject,
    newWorker,setNewWorker,newEquip,setNewEquip,newProject,setNewProject,
    resetAdds,addWorker,addEquip,addProject,openProfile,search
  } = props;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Workers */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Workers ({workers.length})</h3>
          <button onClick={()=>setShowAddWorker((s:boolean)=>!s)} className="text-xs px-2 py-1 rounded bg-white/10 border border-white/20 hover:bg-white/20">{showAddWorker?"Close":"Add"}</button>
        </div>
        {showAddWorker && (
          <div className="mb-3 grid gap-2 text-sm">
            <div className="grid gap-2">
              <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" placeholder="Name*" value={newWorker.name||""} onChange={(e:any)=>setNewWorker((n:any)=>({...n, name:e.target.value}))}/>
              <div className="grid grid-cols-2 gap-2">
                <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" placeholder="Role" value={newWorker.role||""} onChange={(e:any)=>setNewWorker((n:any)=>({...n, role:e.target.value}))}/>
                <select className="bg-slate-800 border border-slate-700 rounded px-2 py-1" value={newWorker.status||"active"} onChange={(e:any)=>setNewWorker((n:any)=>({...n, status:e.target.value}))}>
                  <option value="active">active</option><option value="hold">hold</option><option value="leave">leave</option>
                </select>
              </div>
              <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" placeholder="Certs (comma separated)" value={(newWorker.certs as any)||""} onChange={(e:any)=>setNewWorker((n:any)=>({...n, certs:e.target.value}))}/>
              <div className="grid grid-cols-2 gap-2">
                <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" placeholder="Phone" value={newWorker.phone||""} onChange={(e:any)=>setNewWorker((n:any)=>({...n, phone:e.target.value}))}/>
                <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" placeholder="Email" value={newWorker.email||""} onChange={(e:any)=>setNewWorker((n:any)=>({...n, email:e.target.value}))}/>
              </div>
              <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" placeholder="Home base" value={newWorker.homeBase||""} onChange={(e:any)=>setNewWorker((n:any)=>({...n, homeBase:e.target.value}))}/>
              <textarea className="bg-slate-800 border border-slate-700 rounded px-2 py-1" rows={3} placeholder="Notes" value={newWorker.notes||""} onChange={(e:any)=>setNewWorker((n:any)=>({...n, notes:e.target.value}))}/>
            </div>
            <div className="flex gap-2">
              <button onClick={addWorker} className="text-xs px-2 py-1 rounded bg-emerald-600/80 hover:bg-emerald-600 text-white">Save Worker</button>
              <button onClick={()=>{ setShowAddWorker(false); resetAdds(); }} className="text-xs px-2 py-1 rounded bg-white/10 border border-white/20 hover:bg-white/20">Cancel</button>
            </div>
          </div>
        )}
        <div className="space-y-2 max-h-80 overflow-auto pr-1">
          {workers.filter((w:any)=>!search || (w.name+" "+w.role+" "+w.certs.join(" ")).toLowerCase().includes(search)).map((w:any)=>(
            <div key={w.id} className="flex items-center justify-between rounded border border-white/10 bg-white/5 px-2 py-1 text-sm">
              <div>
                <div className="font-medium">{w.name}</div>
                <div className="text-xs text-slate-300">{w.role} • Certs: {w.certs.join(", ")||"—"}</div>
              </div>
              <button onClick={()=>openProfile("worker", w.id)} className="text-xs px-2 py-1 rounded bg-white/10 border border-white/20 hover:bg-white/20">Edit</button>
            </div>
          ))}
        </div>
      </div>

      {/* Equipment */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Equipment ({equip.length})</h3>
          <button onClick={()=>setShowAddEquip((s:boolean)=>!s)} className="text-xs px-2 py-1 rounded bg-white/10 border border-white/20 hover:bg-white/20">{showAddEquip?"Close":"Add"}</button>
        </div>
        {showAddEquip && (
          <div className="mb-3 grid gap-2 text-sm">
            <div className="grid gap-2">
              <div className="grid grid-cols-2 gap-2">
                <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" placeholder="Code*" value={newEquip.code||""} onChange={(e:any)=>setNewEquip((n:any)=>({...n, code:e.target.value}))}/>
                <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" placeholder="Kind" value={newEquip.kind||""} onChange={(e:any)=>setNewEquip((n:any)=>({...n, kind:e.target.value}))}/>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" placeholder="Owner" value={newEquip.owner||""} onChange={(e:any)=>setNewEquip((n:any)=>({...n, owner:e.target.value}))}/>
                <select className="bg-slate-800 border border-slate-700 rounded px-2 py-1" value={newEquip.status||"active"} onChange={(e:any)=>setNewEquip((n:any)=>({...n, status:e.target.value}))}>
                  <option value="active">active</option><option value="idle">idle</option><option value="repair">repair</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" placeholder="Location" value={newEquip.location||""} onChange={(e:any)=>setNewEquip((n:any)=>({...n, location:e.target.value}))}/>
                <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" type="date" placeholder="Service due" value={newEquip.serviceDue||""} onChange={(e:any)=>setNewEquip((n:any)=>({...n, serviceDue:e.target.value}))}/>
              </div>
              <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" placeholder="Fuel" value={newEquip.fuel||""} onChange={(e:any)=>setNewEquip((n:any)=>({...n, fuel:e.target.value}))}/>
              <textarea className="bg-slate-800 border border-slate-700 rounded px-2 py-1" rows={3} placeholder="Notes" value={newEquip.notes||""} onChange={(e:any)=>setNewEquip((n:any)=>({...n, notes:e.target.value}))}/>
            </div>
            <div className="flex gap-2">
              <button onClick={addEquip} className="text-xs px-2 py-1 rounded bg-emerald-600/80 hover:bg-emerald-600 text-white">Save Equipment</button>
              <button onClick={()=>{ setShowAddEquip(false); resetAdds(); }} className="text-xs px-2 py-1 rounded bg-white/10 border border-white/20 hover:bg-white/20">Cancel</button>
            </div>
          </div>
        )}
        <div className="space-y-2 max-h-80 overflow-auto pr-1">
          {equip.filter((e:any)=>!search || (e.code+" "+e.kind+" "+(e.location||"")).toLowerCase().includes(search)).map((ei:any)=>(
            <div key={ei.id} className="flex items-center justify-between rounded border border-white/10 bg-white/5 px-2 py-1 text-sm">
              <div>
                <div className="font-medium">{ei.code} • {ei.kind}</div>
                <div className="text-xs text-slate-300">Status: {ei.status}</div>
              </div>
              <button onClick={()=>openProfile("equip", ei.id)} className="text-xs px-2 py-1 rounded bg-white/10 border border-white/20 hover:bg-white/20">Edit</button>
            </div>
          ))}
        </div>
      </div>

      {/* Projects */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Projects ({projects.length})</h3>
          <button onClick={()=>setShowAddProject((s:boolean)=>!s)} className="text-xs px-2 py-1 rounded bg-white/10 border border-white/20 hover:bg-white/20">{showAddProject?"Close":"Add"}</button>
        </div>
        {showAddProject && (
          <div className="mb-3 grid gap-2 text-sm">
            <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" placeholder="Project name*" value={newProject.name||""} onChange={(e:any)=>setNewProject((n:any)=>({...n, name:e.target.value}))}/>
            <div className="grid grid-cols-2 gap-2">
              <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" placeholder="Client" value={newProject.client||""} onChange={(e:any)=>setNewProject((n:any)=>({...n, client:e.target.value}))}/>
              <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" placeholder="Prime supervisor" value={newProject.primeSupervisor||""} onChange={(e:any)=>setNewProject((n:any)=>({...n, primeSupervisor:e.target.value}))}/>
            </div>
            <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" placeholder="Address" value={newProject.address||""} onChange={(e:any)=>setNewProject((n:any)=>({...n, address:e.target.value}))}/>
            <div className="grid grid-cols-2 gap-2">
              <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" placeholder="Target crew" type="number" value={newProject.targetCrew as any} onChange={(e:any)=>setNewProject((n:any)=>({...n, targetCrew:Number(e.target.value)}))}/>
              <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" placeholder="Target equipment" type="number" value={newProject.targetEquip as any} onChange={(e:any)=>setNewProject((n:any)=>({...n, targetEquip:Number(e.target.value)}))}/>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select className="bg-slate-800 border border-slate-700 rounded px-2 py-1" value={newProject.status||"active"} onChange={(e:any)=>setNewProject((n:any)=>({...n, status:e.target.value}))}>
                <option value="active">active</option><option value="hold">hold</option>
              </select>
              <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" placeholder="Notes (short)" value={newProject.notes||""} onChange={(e:any)=>setNewProject((n:any)=>({...n, notes:e.target.value}))}/>
            </div>
            <div className="flex gap-2">
              <button onClick={addProject} className="text-xs px-2 py-1 rounded bg-emerald-600/80 hover:bg-emerald-600 text-white">Save Project</button>
              <button onClick={()=>{ setShowAddProject(false); resetAdds(); }} className="text-xs px-2 py-1 rounded bg-white/10 border border-white/20 hover:bg-white/20">Cancel</button>
            </div>
          </div>
        )}
        <div className="space-y-2 max-h-80 overflow-auto pr-1">
          {projects.filter((p:any)=>!search || p.name.toLowerCase().includes(search)).map((p:any)=>(
            <div key={p.id} className="flex items-center justify-between rounded border border-white/10 bg-white/5 px-2 py-1 text-sm">
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-slate-300">Targets: {p.targetCrew} crew • {p.targetEquip} equip • Status: {p.status}</div>
              </div>
              <button onClick={()=>openProfile("project", p.id)} className="text-xs px-2 py-1 rounded bg-white/10 border border-white/20 hover:bg-white/20">Edit</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ----- Time & Attendance view ----- */
function TimeView({date,setDate,timesheets,setTimesheets,workers,projects,onApprove,onAdd,search}:{date:string,setDate:(v:string)=>void,timesheets:TimeEntry[],setTimesheets:(fn:any)=>void,workers:Worker[],projects:Project[],onApprove:(id:string,approved:boolean)=>void,onAdd:(t:TimeEntry)=>void,search:string}){
  const workerMap = useMemo(()=>Object.fromEntries(workers.map(w=>[w.id,w])),[workers]);
  const projMap   = useMemo(()=>Object.fromEntries(projects.map(p=>[p.id,p])),[projects]);

  const filtered = timesheets.filter(t => t.date===date)
    .filter(t => !search ||
      (workerMap[t.workerId]?.name||"").toLowerCase().includes(search) ||
      (projMap[t.projectId]?.name||"").toLowerCase().includes(search)
    );

  // add manual entry demo
  const [newRow,setNewRow] = useState<Partial<TimeEntry>>({ hours:8, via:"manual", approved:false, date });

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-300">Date</label>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="bg-slate-800 border border-slate-700 rounded px-2 py-1" />
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Daily Time (Supervisor-submitted + Manual)</h3>
          <div className="text-xs text-slate-300">Showing {filtered.length} rows</div>
        </div>

        {/* Add manual row */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-3 text-sm">
          <select className="bg-slate-800 border border-slate-700 rounded px-2 py-1"
                  value={newRow.workerId||""} onChange={e=>setNewRow(r=>({...r, workerId:e.target.value}))}>
            <option value="">Worker…</option>
            {workers.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select className="bg-slate-800 border border-slate-700 rounded px-2 py-1"
                  value={newRow.projectId||""} onChange={e=>setNewRow(r=>({...r, projectId:e.target.value}))}>
            <option value="">Project…</option>
            {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="date" className="bg-slate-800 border border-slate-700 rounded px-2 py-1"
                 value={newRow.date||date} onChange={e=>setNewRow(r=>({...r, date:e.target.value}))}/>
          <input type="number" min={0.5} step={0.5} className="bg-slate-800 border border-slate-700 rounded px-2 py-1"
                 value={newRow.hours as any} onChange={e=>setNewRow(r=>({...r, hours:Number(e.target.value)}))}/>
          <button
            className="px-3 py-1 rounded bg-emerald-600/80 hover:bg-emerald-600 text-white"
            onClick={()=>{
              if(!newRow.workerId || !newRow.projectId || !newRow.hours){ alert("Pick worker, project, and hours"); return; }
              const row:TimeEntry = { id:crypto.randomUUID(), workerId:newRow.workerId!, projectId:newRow.projectId!, date:newRow.date||date, hours:newRow.hours!, via:"manual", approved:false };
              onAdd(row);
              setNewRow({ hours:8, via:"manual", approved:false, date });
            }}
          >Add Row</button>
        </div>

        {/* Table */}
        <div className="overflow-auto border border-white/10 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-white/10">
              <tr>
                <th className="text-left px-2 py-1">Worker</th>
                <th className="text-left px-2 py-1">Project</th>
                <th className="text-right px-2 py-1">Hours</th>
                <th className="text-left px-2 py-1">Source</th>
                <th className="text-center px-2 py-1">Approved</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t=>(
                <tr key={t.id} className="odd:bg-white/5">
                  <td className="px-2 py-1">{workerMap[t.workerId]?.name || t.workerId}</td>
                  <td className="px-2 py-1">{projMap[t.projectId]?.name || t.projectId}</td>
                  <td className="px-2 py-1 text-right">{t.hours.toFixed(1)}</td>
                  <td className="px-2 py-1">{t.via}</td>
                  <td className="px-2 py-1 text-center">
                    <input type="checkbox" checked={t.approved} onChange={e=>onApprove(t.id,e.target.checked)} />
                  </td>
                </tr>
              ))}
              {filtered.length===0 && (
                <tr><td colSpan={5} className="px-2 py-4 text-center text-slate-400">No entries for this day.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ----- DB Logs view ----- */
function LogsView({logs,workers,equip,projects,search,onExport}:{logs:LogEntry[],workers:Worker[],equip:Equip[],projects:Project[],search:string,onExport:()=>void}){
  const workerMap = useMemo(()=>Object.fromEntries(workers.map(w=>[w.id,w.name])),[workers]);
  const equipMap  = useMemo(()=>Object.fromEntries(equip.map(e=>[e.id,e.code])),[equip]);
  const projMap   = useMemo(()=>Object.fromEntries(projects.map(p=>[p.id,p.name])),[projects]);

  const filtered = logs.filter(l=>{
    if(!search) return true;
    const hay = `${l.ts} ${l.actor} ${l.entity} ${l.entityId} ${l.action} ${l.details||""} ${workerMap[l.entityId]||""} ${equipMap[l.entityId]||""} ${projMap[l.entityId]||""}`.toLowerCase();
    return hay.includes(search);
  });

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">DB Logs</h3>
        <button onClick={onExport} className="px-3 py-2 rounded bg-white/10 border border-white/20 hover:bg-white/20 text-sm">Export Logs CSV</button>
      </div>
      <div className="overflow-auto border border-white/10 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-white/10">
            <tr>
              <th className="text-left px-2 py-1">Timestamp</th>
              <th className="text-left px-2 py-1">Actor</th>
              <th className="text-left px-2 py-1">Entity</th>
              <th className="text-left px-2 py-1">ID / Label</th>
              <th className="text-left px-2 py-1">Action</th>
              <th className="text-left px-2 py-1">Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(l=>(
              <tr key={l.id} className="odd:bg-white/5">
                <td className="px-2 py-1">{new Date(l.ts).toLocaleString()}</td>
                <td className="px-2 py-1">{l.actor}</td>
                <td className="px-2 py-1">{l.entity}</td>
                <td className="px-2 py-1">
                  {(l.entity==="worker" && workerMap[l.entityId]) ||
                   (l.entity==="equip"  && equipMap[l.entityId]) ||
                   (l.entity==="project"&& projMap[l.entityId]) ||
                   l.entityId}
                </td>
                <td className="px-2 py-1">{l.action}</td>
                <td className="px-2 py-1">{l.details}</td>
              </tr>
            ))}
            {filtered.length===0 && (
              <tr><td colSpan={6} className="px-2 py-4 text-center text-slate-400">No log entries match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ----- Import/Export view ----- */
function ImportExportView(props:any){
  const {workerCSVRef,equipCSVRef,importWorkerCSV,importEquipCSV,generateReport,downloadReportTXT,exportWorkersCSV,exportEquipCSV,exportProjectsCSV,exportAssignmentsCSV,report} = props;
  return (
    <div className="grid gap-4">
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <h3 className="font-semibold mb-2">Import Workers</h3>
        <p className="text-sm text-slate-300 mb-2">CSV headers: <code>name,role,certs</code></p>
        <input ref={workerCSVRef} type="file" accept=".csv" className="hidden" onChange={(e:any)=>{ const f=e.target.files?.[0]; if(f) importWorkerCSV(f); e.currentTarget.value=""; }}/>
        <button className="px-3 py-2 rounded bg-white/10 border border-white/20 hover:bg-white/20" onClick={()=>workerCSVRef.current?.click()}>Choose CSV…</button>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <h3 className="font-semibold mb-2">Import Equipment</h3>
        <p className="text-sm text-slate-300 mb-2">CSV headers: <code>code,kind,status</code></p>
        <input ref={equipCSVRef} type="file" accept=".csv" className="hidden" onChange={(e:any)=>{ const f=e.target.files?.[0]; if(f) importEquipCSV(f); e.currentTarget.value=""; }}/>
        <button className="px-3 py-2 rounded bg-white/10 border border-white/20 hover:bg-white/20" onClick={()=>equipCSVRef.current?.click()}>Choose CSV…</button>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <h3 className="font-semibold mb-2">Exports</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          <button onClick={exportWorkersCSV} className="px-3 py-2 rounded bg-white/10 border border-white/20 hover:bg-white/20">Export Workers CSV</button>
          <button onClick={exportEquipCSV} className="px-3 py-2 rounded bg-white/10 border border-white/20 hover:bg-white/20">Export Equipment CSV</button>
          <button onClick={exportProjectsCSV} className="px-3 py-2 rounded bg-white/10 border border-white/20 hover:bg-white/20">Export Projects CSV</button>
          <button onClick={exportAssignmentsCSV} className="px-3 py-2 rounded bg-white/10 border border-white/20 hover:bg-white/20">Export Assignments CSV</button>
        </div>

        <div className="flex items-center gap-2 mb-2">
          <button onClick={generateReport} className="px-3 py-2 rounded bg-white/10 border border-white/20 hover:bg-white/20">Generate Daily Report</button>
          <button onClick={downloadReportTXT} className="px-3 py-2 rounded bg-white/10 border border-white/20 hover:bg-white/20">Download Report .txt</button>
        </div>
        <pre className="text-xs whitespace-pre-wrap text-slate-200 bg-black/20 rounded-xl p-3 border border-white/10 min-h-[96px]">{report || "(Click ‘Generate Daily Report’ to build the summary.)"}</pre>
      </div>
    </div>
  );
}

/* ----- Profile Drawer (edit existing) ----- */
function ProfileDrawer({profile,draft,setDraft,closeProfile,saveProfile}:{profile:ProfileOpen,draft:any,setDraft:(fn:any)=>void,closeProfile:()=>void,saveProfile:()=>void}){
  if(!profile) return null;
  const isWorker = profile.type==="worker";
  const isEquip  = profile.type==="equip";
  const isProj   = profile.type==="project";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40">
      <div className="h-full w-full max-w-md bg-slate-900 border-l border-white/10 p-4 overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">
            {isWorker && "Worker Profile"}{isEquip && "Equipment Profile"}{isProj && "Project Profile"}
          </h3>
          <button onClick={closeProfile} className="text-xs px-2 py-1 rounded bg-white/10 border border-white/20 hover:bg-white/20">Close</button>
        </div>

        {isWorker && (
          <div className="grid gap-2 text-sm">
            <label className="grid gap-1"><span className="text-xs text-slate-300">Name</span>
              <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" value={draft.name||""} onChange={(e:any)=>setDraft((d:any)=>({...d,name:e.target.value}))}/></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1"><span className="text-xs text-slate-300">Role</span>
                <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" value={draft.role||""} onChange={(e:any)=>setDraft((d:any)=>({...d,role:e.target.value}))}/></label>
              <label className="grid gap-1"><span className="text-xs text-slate-300">Status</span>
                <select className="bg-slate-800 border border-slate-700 rounded px-2 py-1" value={draft.status||"active"} onChange={(e:any)=>setDraft((d:any)=>({...d,status:e.target.value}))}>
                  <option value="active">active</option><option value="hold">hold</option><option value="leave">leave</option>
                </select></label>
            </div>
            <label className="grid gap-1"><span className="text-xs text-slate-300">Certs (comma separated)</span>
              <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" value={(draft.certs||[]).join(", ")} onChange={(e:any)=>setDraft((d:any)=>({...d,certs:e.target.value.split(",").map((s:string)=>s.trim()).filter(Boolean)}))}/></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1"><span className="text-xs text-slate-300">Phone</span>
                <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" value={draft.phone||""} onChange={(e:any)=>setDraft((d:any)=>({...d,phone:e.target.value}))}/></label>
              <label className="grid gap-1"><span className="text-xs text-slate-300">Email</span>
                <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" value={draft.email||""} onChange={(e:any)=>setDraft((d:any)=>({...d,email:e.target.value}))}/></label>
            </div>
            <label className="grid gap-1"><span className="text-xs text-slate-300">Home base</span>
              <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" value={draft.homeBase||""} onChange={(e:any)=>setDraft((d:any)=>({...d,homeBase:e.target.value}))}/></label>
            <label className="grid gap-1"><span className="text-xs text-slate-300">Notes</span>
              <textarea className="bg-slate-800 border border-slate-700 rounded px-2 py-1" rows={3} value={draft.notes||""} onChange={(e:any)=>setDraft((d:any)=>({...d,notes:e.target.value}))}/></label>
            <div className="mt-2">
              <button onClick={saveProfile} className="text-xs px-3 py-1 rounded bg-emerald-600/80 hover:bg-emerald-600 text-white">Save</button>
            </div>
          </div>
        )}

        {isEquip && (
          <div className="grid gap-2 text-sm">
            <label className="grid gap-1"><span className="text-xs text-slate-300">Code</span>
              <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" value={draft.code||""} onChange={(e:any)=>setDraft((d:any)=>({...d,code:e.target.value}))}/></label>
            <label className="grid gap-1"><span className="text-xs text-slate-300">Kind</span>
              <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" value={draft.kind||""} onChange={(e:any)=>setDraft((d:any)=>({...d,kind:e.target.value}))}/></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1"><span className="text-xs text-slate-300">Owner</span>
                <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" value={draft.owner||""} onChange={(e:any)=>setDraft((d:any)=>({...d,owner:e.target.value}))}/></label>
              <label className="grid gap-1"><span className="text-xs text-slate-300">Status</span>
                <select className="bg-slate-800 border border-slate-700 rounded px-2 py-1" value={draft.status||"active"} onChange={(e:any)=>setDraft((d:any)=>({...d,status:e.target.value}))}>
                  <option value="active">active</option><option value="idle">idle</option><option value="repair">repair</option>
                </select></label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1"><span className="text-xs text-slate-300">Location</span>
                <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" value={draft.location||""} onChange={(e:any)=>setDraft((d:any)=>({...d,location:e.target.value}))}/></label>
              <label className="grid gap-1"><span className="text-xs text-slate-300">Service due</span>
                <input type="date" className="bg-slate-800 border border-slate-700 rounded px-2 py-1" value={draft.serviceDue||""} onChange={(e:any)=>setDraft((d:any)=>({...d,serviceDue:e.target.value}))}/></label>
            </div>
            <label className="grid gap-1"><span className="text-xs text-slate-300">Fuel</span>
              <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" value={draft.fuel||""} onChange={(e:any)=>setDraft((d:any)=>({...d,fuel:e.target.value}))}/></label>
            <label className="grid gap-1"><span className="text-xs text-slate-300">Notes</span>
              <textarea className="bg-slate-800 border border-slate-700 rounded px-2 py-1" rows={3} value={draft.notes||""} onChange={(e:any)=>setDraft((d:any)=>({...d,notes:e.target.value}))}/></label>
            <div className="mt-2">
              <button onClick={saveProfile} className="text-xs px-3 py-1 rounded bg-emerald-600/80 hover:bg-emerald-600 text-white">Save</button>
            </div>
          </div>
        )}

        {isProj && (
          <div className="grid gap-2 text-sm">
            <label className="grid gap-1"><span className="text-xs text-slate-300">Project name</span>
              <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" value={draft.name||""} onChange={(e:any)=>setDraft((d:any)=>({...d,name:e.target.value}))}/></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1"><span className="text-xs text-slate-300">Target crew</span>
                <input type="number" className="bg-slate-800 border border-slate-700 rounded px-2 py-1" value={draft.targetCrew||0} onChange={(e:any)=>setDraft((d:any)=>({...d,targetCrew:Number(e.target.value)}))}/></label>
              <label className="grid gap-1"><span className="text-xs text-slate-300">Target equipment</span>
                <input type="number" className="bg-slate-800 border border-slate-700 rounded px-2 py-1" value={draft.targetEquip||0} onChange={(e:any)=>setDraft((d:any)=>({...d,targetEquip:Number(e.target.value)}))}/></label>
            </div>
            <label className="grid gap-1"><span className="text-xs text-slate-300">Client</span>
              <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" value={draft.client||""} onChange={(e:any)=>setDraft((d:any)=>({...d,client:e.target.value}))}/></label>
            <label className="grid gap-1"><span className="text-xs text-slate-300">Address</span>
              <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" value={draft.address||""} onChange={(e:any)=>setDraft((d:any)=>({...d,address:e.target.value}))}/></label>
            <label className="grid gap-1"><span className="text-xs text-slate-300">Prime supervisor</span>
              <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1" value={draft.primeSupervisor||""} onChange={(e:any)=>setDraft((d:any)=>({...d,primeSupervisor:e.target.value}))}/></label>
            <label className="grid gap-1"><span className="text-xs text-slate-300">Status</span>
              <select className="bg-slate-800 border border-slate-700 rounded px-2 py-1" value={draft.status||"active"} onChange={(e:any)=>setDraft((d:any)=>({...d,status:e.target.value}))}>
                <option value="active">active</option><option value="hold">hold</option>
              </select></label>
            <label className="grid gap-1"><span className="text-xs text-slate-300">Notes</span>
              <textarea className="bg-slate-800 border border-slate-700 rounded px-2 py-1" rows={3} value={draft.notes||""} onChange={(e:any)=>setDraft((d:any)=>({...d,notes:e.target.value}))}/></label>
            <div className="mt-2">
              <button onClick={saveProfile} className="text-xs px-3 py-1 rounded bg-emerald-600/80 hover:bg-emerald-600 text-white">Save</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
