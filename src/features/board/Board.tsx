import React, { useMemo, useRef, useState } from "react";
import Modal from "./Modal";

/** ---------- Brand / White-label ---------- */
const BRAND = {
  name: "OpsSync.AI",
  logoWordUrl: "/opsync-logo.svg", // top bar & sidebar word-mark
  // no small icon in sidebar (we want them to match)
  wordHeight: 32,        // top bar word-mark height
  sidebarWordHeight: 18, // sidebar word-mark height
};

const COMPANY_LIMIT = 10; // hard cap on labor vendors

type RoleTag = "Lead" | "Assistant" | null;
type Status = "active" | "idle" | "repair" | "hold" | "leave";

interface Company { id:string; name:string; contactName?:string; email?:string; phone?:string; notes?:string; }
interface Worker  { id:string; name:string; role:string; certs:string[]; companyId:string; wage?:number; phone?:string; email?:string; status?:Status; homeBase?:string; notes?:string; }
interface Equip   { id:string; code:string; kind:string; status:"active"|"idle"|"repair"; owner?:string; serviceDue?:string; location?:string; fuel?:string; notes?:string; }
type ProjectStatus = "active"|"pending"|"completed"|"canceled";
interface Project { id:string; name:string; projectNumber?:string; targetCrew:number; targetEquip:number; client?:string; address?:string; primeSupervisor?:string; status?:ProjectStatus; progress?:number; notes?:string; }

interface CrewSeg { workerId:string; roleTag:RoleTag }
interface EquipSeg { equipId:string }

type NavTab = "dashboard"|"profiles"|"time"|"logs"|"import";
type ToastState = { visible:boolean; text:string; undo?:()=>void };
type ProfileOpen =
  | { type:"worker"; id:string }
  | { type:"equip"; id:string }
  | { type:"project"; id:string }
  | null;

type LogEntry = { id:string; ts:string; actor:string; entity:"worker"|"equip"|"project"|"timesheet"|"company"; entityId:string; action:string; details?:string; };
type TimeEntry = { id:string; workerId:string; projectId:string; companyId:string; date:string; hours:number; via:"supervisor"|"manual"; approved:boolean; };

/* -------------------- Seeds -------------------- */
const SEED_COMPANIES: Company[] = [
  { id:"c1", name:"Acme Labor" },
  { id:"c2", name:"Prime Staffing" },
];
const SEED_WORKERS: Worker[] = [
  { id:"w1", name:"Jose Garcia", role:"Operator", certs:["Skid Steer","Telehandler"], status:"active", companyId:"c1", wage:28 },
  { id:"w2", name:"Aubrey M.",  role:"Supervisor", certs:["Any"], status:"active", companyId:"c1", wage:36 },
  { id:"w3", name:"Solomon S.", role:"Laborer",   certs:[], status:"active", companyId:"c2", wage:20 },
  { id:"w4", name:"Derrick T.", role:"Laborer",   certs:[], status:"active", companyId:"c2", wage:20 },
  { id:"w5", name:"James F.",   role:"Operator",  certs:["Excavator"], status:"active", companyId:"c1", wage:30 },
];
const SEED_EQUIP: Equip[] = [
  { id:"e1", code:"YSK-032",   kind:"Skid Steer",  status:"active" },
  { id:"e2", code:"YEX-027",   kind:"Excavator",   status:"active" },
  { id:"e3", code:"TL943C-010",kind:"Telehandler", status:"idle"  },
  { id:"e4", code:"ED800-008", kind:"Dump Buggy",  status:"repair"},
];
const SEED_PROJECTS: Project[] = [
  { id:"p1", name:"San Marcos", projectNumber:"", targetCrew:6, targetEquip:3, status:"active", progress:0 },
  { id:"p2", name:"Fort Sam", projectNumber:"", targetCrew:5, targetEquip:2, status:"active", progress:0 },
  { id:"p3", name:"Tower of Life", projectNumber:"", targetCrew:4, targetEquip:2, status:"active", progress:0 },
];

function tl(n:number,t:number){ if(n>=t) return{tone:"ok",label:"OK"}; if(n>=Math.max(1,t-1)) return{tone:"warn",label:"Low"}; return{tone:"bad",label:"Under"}; }

/* -------------- CSV helpers & downloads -------------- */
function parseCSV(text:string){
  const lines = text.trim().split(/\r?\n/);
  if(!lines.length) return [];
  const headers = lines.shift()!.split(",").map(h=>h.trim().toLowerCase());
  return lines.filter(Boolean).map(line=>{
    const cells = line.split(",").map(c=>c.trim());
    const obj:Record<string,string> = {};
    headers.forEach((h,i)=> obj[h] = cells[i] ?? "");
    return obj;
  });
}
function csvEscape(s:string){return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
function toCSV(r:string[][]){return r.map(a=>a.map(csvEscape).join(",")).join("\n");}
function download(name:string,content:string,mime="text/plain;charset=utf-8"){const b=new Blob([content],{type:mime});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=name;a.click();URL.revokeObjectURL(u);}

export default function Board(){
  /* ---------- Data ---------- */
  const [companies,setCompanies]=useState<Company[]>(SEED_COMPANIES);
  const [workers,setWorkers]=useState<Worker[]>(SEED_WORKERS);
  const [equip,setEquip]=useState<Equip[]>(SEED_EQUIP);
  const [projects,setProjects]=useState<Project[]>(SEED_PROJECTS);

  // Assignments
  const [crewByProject,setCrewByProject]=useState<Record<string,CrewSeg[]>>({});
  const [equipByProject,setEquipByProject]=useState<Record<string,EquipSeg[]>>({});

  // Time (demo)
  const today=new Date().toISOString().slice(0,10);
  const [timesheets,setTimesheets]=useState<TimeEntry[]>([
    { id:"t1", workerId:"w2", projectId:"p1", companyId:"c1", date:today, hours:4, via:"supervisor", approved:false },
    { id:"t2", workerId:"w3", projectId:"p1", companyId:"c2", date:today, hours:6, via:"supervisor", approved:true  },
  ]);

  // Logs
  const [logs,setLogs]=useState<LogEntry[]>([]);
  function logEvent(e:Omit<LogEntry,"id"|"ts"|"actor">){setLogs(p=>[{id:crypto.randomUUID(),ts:new Date().toISOString(),actor:"Sam",...e},...p]);}

  // UI
  const [nav,setNav]=useState<NavTab>("dashboard");
  const [toast,setToast]=useState<ToastState>({visible:false,text:""});
  const [globalSearch,setGlobalSearch]=useState("");
  const [companyScope,setCompanyScope]=useState<string>("all"); // "all" | companyId
  const toastTimer=useRef<number|undefined>(undefined);
  function showToast(text:string,undo?:()=>void){ if(toastTimer.current) window.clearTimeout(toastTimer.current); setToast({visible:true,text,undo}); /* @ts-ignore */ toastTimer.current=window.setTimeout(()=>setToast({visible:false,text:""}),3500); }

  /* ---------- Maps & filters ---------- */
  const companyMap=useMemo(()=>Object.fromEntries(companies.map(c=>[c.id,c])),[companies]);
  const workerMap =useMemo(()=>Object.fromEntries(workers.map(w=>[w.id,w])),[workers]);
  const equipMap  =useMemo(()=>Object.fromEntries(equip.map(e=>[e.id,e])),[equip]);

  const scopeWorker=(w:Worker)=>companyScope==="all"||w.companyId===companyScope;
  const scopeTime  =(t:TimeEntry)=>companyScope==="all"||t.companyId===companyScope;

  const assignedWorkerIds=useMemo(()=>new Set(Object.values(crewByProject).flat().map(s=>s.workerId)),[crewByProject]);
  const assignedEquipIds =useMemo(()=>new Set(Object.values(equipByProject).flat().map(s=>s.equipId)),[equipByProject]);

  const q=globalSearch.trim().toLowerCase();
  const poolWorkers=workers.filter(scopeWorker).filter(w=>!assignedWorkerIds.has(w.id))
    .filter(w=>!q||(w.name+" "+w.role+" "+w.certs.join(" ")+" "+(companyMap[w.companyId]?.name||"")).toLowerCase().includes(q));
  const poolEquip=equip.filter(e=>!assignedEquipIds.has(e.id))
    .filter(e=>!q||(e.code+" "+e.kind+" "+(e.location||"")).toLowerCase().includes(q));
  function projectMatches(p:Project){ if(!q) return true; if(p.name.toLowerCase().includes(q)) return true;
    const c=(crewByProject[p.id]||[]), e=(equipByProject[p.id]||[]); if(c.some(s=>scopeWorker(workerMap[s.workerId]!)&&(workerMap[s.workerId]?.name||"").toLowerCase().includes(q))) return true;
    if(e.some(s=>(equipMap[s.equipId]?.code||"").toLowerCase().includes(q))) return true; return false; }

  /* ---------- Drag & drop ---------- */
  function onDragStart(ev:React.DragEvent,p:any){ ev.dataTransfer.setData("application/json",JSON.stringify(p)); }
  function allowDrop(ev:React.DragEvent){ ev.preventDefault(); }

  function dropWorker(pid:string,ev:React.DragEvent){
    ev.preventDefault();
    try{
      const pl=JSON.parse(ev.dataTransfer.getData("application/json"));
      if(pl.type!=="worker") return;
      const wid=pl.id as string; const w=workerMap[wid]; if(!w) return;
      if(!scopeWorker(w)){ showToast("Worker not in current company scope."); return; }

      const prevSnapshot=crewByProject;
      setCrewByProject(prev=>{
        let fromPid:string|null=null;
        for(const [k,list] of Object.entries(prev)){ if((list||[]).some(s=>s.workerId===wid)){ fromPid=k; break; } }
        if(fromPid===pid) return prev;

        const next:typeof prev={}; for(const k of Object.keys(prev)) next[k]=[...(prev[k]||[])];
        let tag:RoleTag=null;
        if(fromPid){ const old=(prev[fromPid]||[]).find(s=>s.workerId===wid); tag=old?.roleTag??null; next[fromPid]=next[fromPid].filter(s=>s.workerId!==wid); }
        next[pid]=[...(next[pid]||[]),{workerId:wid, roleTag:tag}];

        const pName=projects.find(p=>p.id===pid)?.name??pid;
        showToast(`Moved ${w.name} → ${pName}`,()=>setCrewByProject(prevSnapshot));
        logEvent({entity:"worker", entityId:wid, action:"move", details:`to ${pName}`});
        return next;
      });
    }catch{}
  }

  function dropEquip(pid:string,ev:React.DragEvent){
    ev.preventDefault();
    try{
      const pl=JSON.parse(ev.dataTransfer.getData("application/json"));
      if(pl.type!=="equip") return;
      const eid=pl.id as string; const e=equipMap[eid]; if(!e) return;

      const prevSnapshot=equipByProject;
      setEquipByProject(prev=>{
        let fromPid:string|null=null;
        for(const [k,list] of Object.entries(prev)){ if((list||[]).some(s=>s.equipId===eid)){ fromPid=k; break; } }
        if(fromPid===pid) return prev;

        const next:typeof prev={}; for(const k of Object.keys(prev)) next[k]=[...(prev[k]||[])];
        if(fromPid){ next[fromPid]=next[fromPid].filter(s=>s.equipId!==eid); }
        next[pid]=[...(next[pid]||[]),{equipId:eid}];

        const pName=projects.find(p=>p.id===pid)?.name??pid;
        showToast(`Moved ${e.code} → ${pName}`,()=>setEquipByProject(prevSnapshot));
        logEvent({entity:"equip", entityId:eid, action:"move", details:`to ${pName}`});
        return next;
      });
    }catch{}
  }

  function removeCrewSeg(pid:string,idx:number){
    const prev=crewByProject; const seg=(prev[pid]||[])[idx];
    setCrewByProject(p=>({...p,[pid]:(p[pid]||[]).filter((_,i)=>i!==idx)}));
    showToast("Removed worker",()=>setCrewByProject(prev));
    if(seg) logEvent({entity:"worker", entityId:seg.workerId, action:"unassign", details:`from ${projects.find(p=>p.id===pid)?.name||pid}`});
  }
  function removeEquipSeg(pid:string,idx:number){
    const prev=equipByProject; const seg=(prev[pid]||[])[idx];
    setEquipByProject(p=>({...p,[pid]:(p[pid]||[]).filter((_,i)=>i!==idx)}));
    showToast("Removed equipment",()=>setEquipByProject(prev));
    if(seg) logEvent({entity:"equip", entityId:seg.equipId, action:"unassign", details:`from ${projects.find(p=>p.id===pid)?.name||pid}`});
  }
  function cycleTag(pid:string,idx:number){
    setCrewByProject(prev=>{
      const list=prev[pid]||[];
      const next=list.map((s,i)=> i!==idx ? s : ({...s, roleTag: s.roleTag==="Lead" ? "Assistant" : s.roleTag==="Assistant" ? null : "Lead"}));
      return {...prev,[pid]:next};
    });
  }

  /* ---------- Import / Export ---------- */
  const workerCSVRef=useRef<HTMLInputElement>(null);
  const equipCSVRef =useRef<HTMLInputElement>(null);

  function exportWorkersCSV(){
    const rows = [["id","name","role","skills","company","wage","status"],
      ...workers.filter(scopeWorker).map(w=>[w.id,w.name,w.role,w.certs.join("; "),companyMap[w.companyId]?.name||w.companyId,String(w.wage??0),w.status||""])];
    download("workers.csv", toCSV(rows), "text/csv;charset=utf-8");
  }
  function exportEquipCSV(){
    const rows = [["id","code","kind","status"],
      ...equip.map(e=>[e.id,e.code,e.kind,e.status])];
    download("equipment.csv", toCSV(rows), "text/csv;charset=utf-8");
  }
  function exportProjectsCSV(){
    const rows = [["id","name","targetCrew","targetEquip","status"],
      ...projects.map(p=>[p.id,p.name,String(p.targetCrew),String(p.targetEquip),p.status||""])];
    download("projects.csv", toCSV(rows), "text/csv;charset=utf-8");
  }
  function exportAssignmentsCSV(){
    const rows:string[][] = [["project","type","id","label","tag","company"]];
    projects.forEach(p=>{
      (crewByProject[p.id]||[]).forEach(s=>{
        const w = workerMap[s.workerId];
        rows.push([p.name,"worker",s.workerId,w?.name||"",s.roleTag||"",companyMap[w?.companyId||""]?.name||""]);
      });
      (equipByProject[p.id]||[]).forEach(s=>{
        const e = equipMap[s.equipId];
        rows.push([p.name,"equip",s.equipId,e?.code||"","",""]);
      });
    });
    download("assignments.csv", toCSV(rows), "text/csv;charset=utf-8");
  }

  function importWorkerCSV(file: File){
    file.text().then(txt=>{
      const rows = parseCSV(txt);
      let nextWorkers = workers.slice();
      let nextCompanies = companies.slice();
      let blocked = 0;

      const ensureCompany = (name: string) => {
        const nm = name.trim();
        if(!nm) return "";
        const exist = nextCompanies.find(c=>c.name.toLowerCase()===nm.toLowerCase());
        if(exist) return exist.id;
        if(nextCompanies.length >= COMPANY_LIMIT){
          blocked++;
          return nextCompanies[0]?.id || "c1";
        }
        const id = "c"+crypto.randomUUID();
        nextCompanies.push({ id, name: nm });
        logEvent({entity:"company", entityId:id, action:"add", details:nm});
        return id;
      };

      rows.forEach(r=>{
        const name = r["name"] || r["employee"] || r["full name"];
        if(!name) return;
        const role = r["role"] || "Worker";
        
        const certs = (r["skills"]||r["certs"]||"").split(/[;,]/).map(s=>s.trim()).filter(Boolean);
        const companyName = r["company"] || "";
        const companyId = companyName ? ensureCompany(companyName)
          : (companyScope!=="all" ? companyScope : (nextCompanies[0]?.id || "c1"));
        const id = "w"+crypto.randomUUID();
        nextWorkers.push({ id, name, role, certs, status:"active", companyId, wage: Number(r["wage"]||0) });
        logEvent({entity:"worker", entityId:id, action:"add", details:`import ${name}`});
      });

      setCompanies(nextCompanies);
      setWorkers(nextWorkers);
      alert(`Imported ${rows.length} workers.\nNew companies created: ${Math.max(nextCompanies.length - companies.length,0)}\nBlocked by 10-company limit: ${blocked}`);
    });
  }

  function importEquipCSV(file: File){
    file.text().then(txt=>{
      const rows = parseCSV(txt);
      let next = equip.slice();
      rows.forEach(r=>{
        const code = r["code"] || r["unit"] || r["id"];
        if(!code) return;
        const kind = r["kind"] || r["type"] || "Unknown";
        const status = ((r["status"]||"active").toLowerCase() as Equip["status"]);
        next.push({ id:"e"+crypto.randomUUID(), code, kind, status });
      });
      setEquip(next);
      alert(`Imported ${rows.length} equipment rows.`);
    });
  }

  /* ---------- Add/Edit state (Profiles) ---------- */
  const [profile,setProfile]=useState<ProfileOpen>(null);
  const [draft,setDraft]=useState<any>({});

  function openProfile(kind:ProfileOpen extends null ? never : ProfileOpen["type"], id:string){
    setProfile({type:kind as any, id});
    if(kind==="worker")  setDraft({...workers.find(w=>w.id===id)});
    if(kind==="equip")   setDraft({...equip.find(e=>e.id===id)});
    if(kind==="project") setDraft({...projects.find(p=>p.id===id)});
  }
  function closeProfile(){ setProfile(null); setDraft({}); }
  function saveProfile(){
    if(!profile) return;
    if(profile.type==="worker"){
      setWorkers(ws=>ws.map(w=>w.id===profile.id? {...w, ...draft, certs:(Array.isArray(draft.certs)?draft.certs:String(draft.certs||"").split(",").map((s:string)=>s.trim()).filter(Boolean)), wage:Number(draft.wage??0)} : w));
      showToast("Worker saved"); logEvent({entity:"worker", entityId:profile.id, action:"save"});
    }
    if(profile.type==="equip"){
      setEquip(es=>es.map(e=>e.id===profile.id? {...e, ...draft} : e));
      showToast("Equipment saved"); logEvent({entity:"equip", entityId:profile.id, action:"save"});
    }
    if(profile.type==="project"){
      setProjects(ps=>ps.map(p=>p.id===profile.id? {...p, ...draft, targetCrew:Number(draft.targetCrew||0), targetEquip:Number(draft.targetEquip||0), progress:Number(draft.progress||0)} : p));
      showToast("Project saved"); logEvent({entity:"project", entityId:profile.id, action:"save"});
    }
    closeProfile();
  }

  // Add forms
  const [showAddWorker,setShowAddWorker]=useState(false);
  const [showAddEquip,setShowAddEquip]=useState(false);
  const [showAddProject,setShowAddProject]=useState(false);
  const [showAddCompany,setShowAddCompany]=useState(false);

  const [newWorker,setNewWorker]=useState<Partial<Worker>>({ role:"Worker", certs:[], status:"active", companyId: SEED_COMPANIES[0].id, wage: 0 });
  const [newEquip,setNewEquip]=useState<Partial<Equip>>({ status:"active" });
  const [newProject,setNewProject]=useState<Partial<Project>>({ targetCrew:4, targetEquip:2, status:"active" });
  const [newCompany,setNewCompany]=useState<Partial<Company>>({});

  function addWorker(){
    if(!newWorker.name){ alert("Name required (or Cancel)."); return; }
    if(!newWorker.companyId){ alert("Pick a company."); return; }
    const id="w"+crypto.randomUUID();
    const certs = Array.isArray(newWorker.certs) ? newWorker.certs : String(newWorker.certs||"").split(",").map(s=>s.trim()).filter(Boolean);
    setWorkers(ws=>[...ws,{ id, name:newWorker.name!, role:newWorker.role||"Worker", certs,
      companyId:newWorker.companyId!, wage:Number(newWorker.wage??0),
      status:(newWorker.status as Status)||"active", phone:newWorker.phone||"", email:newWorker.email||"", homeBase:newWorker.homeBase||"", notes:newWorker.notes||""
    , emergencyContact:newWorker.emergencyContact||"" }]);
    setShowAddWorker(false); setNewWorker({ role:"Worker", certs:[], status:"active", companyId: companies[0]?.id || SEED_COMPANIES[0].id, wage: 0 });
    showToast("Worker added"); logEvent({entity:"worker", entityId:id, action:"add", details:newWorker.name});
  }
  function addEquip(){
    if(!newEquip.code){ alert("Equipment code required (or Cancel)."); return; }
    const id="e"+crypto.randomUUID();
    setEquip(es=>[...es,{ id, code:newEquip.code!, kind:newEquip.kind||"Unknown", status:(newEquip.status as Equip["status"])||"active", owner:newEquip.owner||"", serviceDue:newEquip.serviceDue||"", location:newEquip.location||"", fuel:newEquip.fuel||"", notes:newEquip.notes||"" }]);
    setShowAddEquip(false); setNewEquip({ status:"active" });
    showToast("Equipment added"); logEvent({entity:"equip", entityId:id, action:"add", details:newEquip.code});
  }
  function addProject(){
    if(!newProject.name){ alert("Project name required (or Cancel)."); return; }
    const id="p"+crypto.randomUUID();
    setProjects(ps=>[...ps,{ id, name:newProject.name!, projectNumber:newProject.projectNumber||"", targetCrew:Number(newProject.targetCrew||0), targetEquip:Number(newProject.targetEquip||0), client:newProject.client||"", address:newProject.address||"", primeSupervisor:newProject.primeSupervisor||"", status:(newProject.status as any)||"active", progress:Number(newProject.progress||0), notes:newProject.notes||"" }]);
    setShowAddProject(false); setNewProject({ targetCrew:4, targetEquip:2, status:"active" });
    showToast("Project added"); logEvent({entity:"project", entityId:id, action:"add", details:newProject.name});
  }
  function addCompany(){
    if(!newCompany.name){ alert("Company name required (or Cancel)."); return; }
    if(companies.length>=COMPANY_LIMIT){ alert(`Company limit reached (${COMPANY_LIMIT}).`); return; }
    const id="c"+crypto.randomUUID();
    const c:Company={ id, name:newCompany.name!, contactName:newCompany.contactName||"", email:newCompany.email||"", phone:newCompany.phone||"", notes:newCompany.notes||"" };
    setCompanies(cs=>[...cs,c]);
    setShowAddCompany(false); setNewCompany({});
    showToast("Company added"); logEvent({entity:"company", entityId:id, action:"add", details:newCompany.name});
  }

  /* -------------------- UI -------------------- */
  const NavButton=({id,label}:{id:NavTab;label:string})=>(
    <button onClick={()=>setNav(id)} className={`w-full text-left px-3 py-2 rounded-lg border transition ${nav===id?"bg-white/15 border-white/30":"bg-white/5 border-white/10 hover:bg-white/10"}`}>{label}</button>
  );

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-slate-100">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-56 border-r border-white/10 bg-white/5 p-4 z-20">
        <div className="mb-4 flex items-center gap-2">
          {BRAND.logoWordUrl && <img src={BRAND.logoWordUrl} style={{height:BRAND.sidebarWordHeight}} alt={BRAND.name} />}
        </div>
        <div className="space-y-2">
          <NavButton id="dashboard" label="Dashboard" />
          <NavButton id="profiles"  label="Profiles" />
          <NavButton id="time"      label="Time & Attendance" />
          <NavButton id="logs"      label="DB Logs" />
          <NavButton id="import"    label="Import / Export" />
        </div>
        <div className="mt-6 text-xs text-slate-400 space-y-1">
          <div>Companies: {companies.length}/{COMPANY_LIMIT}</div>
          <div>Crew: {Array.from(new Set(Object.values(crewByProject).flat().map(s=>s.workerId))).length}</div>
          <div>Equip: {Array.from(new Set(Object.values(equipByProject).flat().map(s=>s.equipId))).length}</div>
        </div>
      </aside>

      {/* Main */}
      <div className="ml-56 p-6">
        {/* Top bar (word-mark is a home button) */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button onClick={()=>setNav("dashboard")} className="flex items-center gap-3 group" title="Home">
            {BRAND.logoWordUrl
              ? <img src={BRAND.logoWordUrl} style={{height:BRAND.wordHeight}} alt={BRAND.name} />
              : <span className="text-2xl sm:text-3xl font-bold group-hover:underline">{BRAND.name}</span>}
          </button>

          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            <select className="bg-slate-800 border border-slate-700 rounded px-2 py-2 text-sm"
              value={companyScope} onChange={e=>setCompanyScope(e.target.value)}>
              <option value="all">All Companies</option>
              {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <input
              value={globalSearch}
              onChange={e=>setGlobalSearch(e.target.value)}
              placeholder="Search across projects, workers, equipment…"
              className="min-w-[360px] w-[44vw] max-w-[720px] bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm outline-none"
            />

            <button onClick={()=>{
              const lines:string[]=[];
              projects.forEach(p=>{
                const c=(crewByProject[p.id]||[]).filter(s=>scopeWorker(workerMap[s.workerId]!));
                const e=(equipByProject[p.id]||[]);
                lines.push(`${p.name}: ${c.length} workers, ${e.length} units`);
              });
              alert(lines.join("\n")||"No assignments yet.");
            }} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 border border-white/20 text-sm">
              Generate Daily Report
            </button>
          </div>
        </div>

        {/* ---------------- Dashboard ---------------- */}
        {nav==="dashboard" && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Unassigned Pool */}
            <div className="xl:col-span-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-lg font-semibold mb-2">Unassigned Pool</div>
                <div className="text-sm text-slate-400">Drag to assign. Drag between projects to move.</div>

                <div className="mt-4">
                  <div className="font-semibold mb-1">Workers</div>
                  <div className="rounded-lg bg-slate-900/40 p-2 max-h-72 overflow-auto">
                    {poolWorkers.length===0 && <div className="text-sm text-slate-400">No unassigned workers</div>}
                    {poolWorkers.map(w=>(
                      <div key={w.id}
                        draggable
                        onDragStart={(e)=>onDragStart(e,{type:"worker", id:w.id})}
                        className="mb-2 last:mb-0 flex items-center justify-between rounded border border-white/10 bg-white/5 px-2 py-1 text-sm">
                        <div className="truncate">
                          <span className="font-medium">{w.name}</span>
                          <span className="text-slate-400"> • {w.role}</span>
                          <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-white/10 border border-white/10">{companyMap[w.companyId]?.name||w.companyId}</span>
                        </div>
                        <button onClick={()=>openProfile("worker", w.id)} className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/10">Profile</button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="font-semibold mb-1">Equipment</div>
                  <div className="rounded-lg bg-slate-900/40 p-2 max-h-56 overflow-auto">
                    {poolEquip.length===0 && <div className="text-sm text-slate-400">No unassigned equipment</div>}
                    {poolEquip.map(e=>(
                      <div key={e.id}
                        draggable
                        onDragStart={(ev)=>onDragStart(ev,{type:"equip", id:e.id})}
                        className="mb-2 last:mb-0 flex items-center justify-between rounded border border-white/10 bg-white/5 px-2 py-1 text-sm">
                        <div><span className="font-medium">{e.code}</span> <span className="text-slate-400">• {e.kind}</span></div>
                        <button onClick={()=>openProfile("equip", e.id)} className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/10">Profile</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Projects */}
            <div className="xl:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              {projects.filter(projectMatches).map(p=>{
                const crew=(crewByProject[p.id]||[]).filter(s=>scopeWorker(workerMap[s.workerId]!));
                const eq  =(equipByProject[p.id]||[]);
                const cl  = tl(crew.length, p.targetCrew);
                const el  = tl(eq.length,   p.targetEquip);
                return (
                  <div key={p.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-lg font-semibold">{p.projectNumber ? ` • ` : p.name}</div>
                      <div className="flex gap-2 text-xs">
                        <span className={`px-2 py-1 rounded border ${cl.tone==="ok"?"border-emerald-400/40 bg-emerald-400/10":cl.tone==="warn"?"border-amber-400/40 bg-amber-400/10":"border-rose-400/40 bg-rose-400/10"}`}>Crew {crew.length}/{p.targetCrew} ({cl.label})</span>
                        <span className={`px-2 py-1 rounded border ${el.tone==="ok"?"border-emerald-400/40 bg-emerald-400/10":el.tone==="warn"?"border-amber-400/40 bg-amber-400/10":"border-rose-400/40 bg-rose-400/10"}`}>Equip {eq.length}/{p.targetEquip} ({el.label})</span>
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-semibold mb-1">Crew</div>
                      <div onDragOver={allowDrop} onDrop={(e)=>dropWorker(p.id,e)} className="rounded-lg border border-dashed border-white/15 bg-white/5 p-2 min-h-[56px]">
                        {crew.length===0 && <div className="text-sm text-slate-400">Drop workers here</div>}
                        <div className="flex flex-wrap gap-2">
                          {crew.map((s,idx)=>{
                            const w=workerMap[s.workerId]; if(!w) return null;
                            return (
                              <div key={s.workerId} className="flex items-center gap-2 px-2 py-1 rounded-full bg-slate-900/40 border border-white/10 text-sm">
                                <span className="font-medium truncate max-w-[140px]">{w.name}</span>
                                <button onClick={()=>cycleTag(p.id, idx)} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 border border-white/10">{s.roleTag||"Tag"}</button>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 border border-white/10">{companyMap[w.companyId]?.name||w.companyId}</span>
                                <button onClick={()=>removeCrewSeg(p.id, idx)} className="text-xs px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 border border-white/10">✕</button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="text-sm font-semibold mb-1">Equipment</div>
                      <div onDragOver={allowDrop} onDrop={(e)=>dropEquip(p.id,e)} className="rounded-lg border border-dashed border-white/15 bg-white/5 p-2 min-h-[56px]">
                        {eq.length===0 && <div className="text-sm text-slate-400">Drop equipment here</div>}
                        <div className="flex flex-wrap gap-2">
                          {eq.map((s,idx)=>{
                            const e=equipMap[s.equipId]; if(!e) return null;
                            return (
                              <div key={s.equipId} className="flex items-center gap-2 px-2 py-1 rounded-full bg-slate-900/40 border border-white/10 text-sm">
                                <span className="font-medium">{e.code}</span>
                                <span className="text-xs text-slate-400">{e.kind}</span>
                                <button onClick={()=>removeEquipSeg(p.id, idx)} className="text-xs px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 border border-white/10">✕</button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ---------------- Profiles ---------------- */}
        {nav==="profiles" && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Workers */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-lg font-semibold">Workers ({workers.length})</div>
                <button onClick={()=>setShowAddWorker(true)} className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/20 text-sm">Add</button>
              </div>
              <div className="space-y-2 max-h-[65vh] overflow-auto">
                {workers.filter(scopeWorker).map(w=>(
                  <div key={w.id} className="rounded border border-white/10 bg-white/5 p-2">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{w.name} <span className="text-slate-400">• {w.role}</span></div>
                      <button onClick={()=>openProfile("worker", w.id)} className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/10">Edit</button>
                    </div>
                    <div className="text-xs text-slate-400 mt-1">Company: {companyMap[w.companyId]?.name||w.companyId} • Wage: ${w.wage ?? 0}/hr</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Equipment */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-lg font-semibold">Equipment ({equip.length})</div>
                <button onClick={()=>setShowAddEquip(true)} className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/20 text-sm">Add</button>
              </div>
              <div className="space-y-2 max-h-[65vh] overflow-auto">
                {equip.map(e=>(
                  <div key={e.id} className="rounded border border-white/10 bg-white/5 p-2">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{e.code} <span className="text-slate-400">• {e.kind}</span></div>
                      <button onClick={()=>openProfile("equip", e.id)} className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/10">Edit</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Companies + Projects */}
            <div className="space-y-6">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-lg font-semibold">Companies ({companies.length}/{COMPANY_LIMIT})</div>
                  <button onClick={()=>setShowAddCompany(true)} className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/20 text-sm">Add</button>
                </div>
                <div className="space-y-2 max-h-64 overflow-auto">
                  {companies.map(c=>(
                    <div key={c.id} className="rounded border border-white/10 bg-white/5 p-2">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-slate-400">{[c.contactName,c.phone,c.email].filter(Boolean).join(" • ")}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-lg font-semibold">Projects ({projects.length})</div>
                  <button onClick={()=>setShowAddProject(true)} className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/20 text-sm">Add</button>
                </div>
                <div className="space-y-2 max-h-72 overflow-auto">
                  {projects.map(p=>(
                    <div key={p.id} className="rounded border border-white/10 bg-white/5 p-2">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{p.name}</div>
                        <button onClick={()=>openProfile("project", p.id)} className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/10">Edit</button>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">Targets: Crew {p.targetCrew}, Equip {p.targetEquip}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ---------------- Time & Attendance (demo) ---------------- */}
        {nav==="time" && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-lg font-semibold">Time & Attendance (demo)</div>
            </div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-slate-300">
                  <tr>
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Worker</th>
                    <th className="px-2 py-2">Company</th>
                    <th className="px-2 py-2">Project</th>
                    <th className="px-2 py-2">Hours</th>
                    <th className="px-2 py-2">Approved</th>
                  </tr>
                </thead>
                <tbody>
                  {timesheets.filter(scopeTime).map(t=>{
                    const w = workerMap[t.workerId]; const p = projects.find(x=>x.id===t.projectId);
                    return (
                      <tr key={t.id} className="border-t border-white/10">
                        <td className="px-2 py-2">{t.date}</td>
                        <td className="px-2 py-2">{w?.name||t.workerId} <span className="text-xs text-slate-400">(${w?.wage??0}/hr)</span></td>
                        <td className="px-2 py-2">{companyMap[t.companyId]?.name||t.companyId}</td>
                        <td className="px-2 py-2">{p?.name||t.projectId}</td>
                        <td className="px-2 py-2">{t.hours}</td>
                        <td className="px-2 py-2"><input type="checkbox" checked={t.approved} onChange={e=>setTimesheets(ts=>ts.map(x=>x.id===t.id?{...x, approved:e.target.checked}:x))} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ---------------- DB Logs ---------------- */}
        {nav==="logs" && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-lg font-semibold mb-3">DB Logs</div>
            <div className="overflow-auto max-h-[70vh]">
              <table className="min-w-full text-sm">
                <thead className="text-left text-slate-300">
                  <tr>
                    <th className="px-2 py-2">Time</th>
                    <th className="px-2 py-2">Actor</th>
                    <th className="px-2 py-2">Entity</th>
                    <th className="px-2 py-2">Action</th>
                    <th className="px-2 py-2">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(l=>(
                    <tr key={l.id} className="border-t border-white/10">
                      <td className="px-2 py-2">{new Date(l.ts).toLocaleString()}</td>
                      <td className="px-2 py-2">{l.actor}</td>
                      <td className="px-2 py-2">{l.entity}</td>
                      <td className="px-2 py-2">{l.action}</td>
                      <td className="px-2 py-2">{l.details||""}</td>
                    </tr>
                  ))}
                  {logs.length===0 && <tr><td className="px-2 py-2 text-slate-400" colSpan={5}>No log entries yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ---------------- Import / Export ---------------- */}
        {nav==="import" && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
            <div className="text-lg font-semibold">Import / Export</div>
            <div className="flex flex-wrap gap-2">
              <button onClick={()=>workerCSVRef.current?.click()} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 border border-white/20 text-sm">Import Workers CSV</button>
              <input ref={workerCSVRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(f) importWorkerCSV(f); e.currentTarget.value=""; }} />
              <button onClick={()=>equipCSVRef.current?.click()} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 border border-white/20 text-sm">Import Equipment CSV</button>
              <input ref={equipCSVRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(f) importEquipCSV(f); e.currentTarget.value=""; }} />

              <div className="w-px h-8 bg-white/10 mx-1" />

              <button onClick={exportWorkersCSV}     className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 border border-white/20 text-sm">Export Workers</button>
              <button onClick={exportEquipCSV}       className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 border border-white/20 text-sm">Export Equipment</button>
              <button onClick={exportProjectsCSV}    className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 border border-white/20 text-sm">Export Projects</button>
              <button onClick={exportAssignmentsCSV} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 border border-white/20 text-sm">Export Assignments</button>
            </div>

            <div className="text-xs text-slate-400">
              CSV columns (workers): <code>name, role, skills, company, wage</code> (wage optional).  
              New companies are created until the limit ({COMPANY_LIMIT}); extras fall back to your first company.
            </div>
          </div>
        )}

        {/* --------- ADD / EDIT MODALS (Profiles) --------- */}
        {showAddWorker && (
          <Modal title="Add Worker" onClose={()=>setShowAddWorker(false)} onPrimary={addWorker} primaryText="Add">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="col-span-2">Name<input className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                value={newWorker.name||""} onChange={e=>setNewWorker({...newWorker, name:e.target.value})}/></label>
                <label>Project #<input className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                  value={draft.projectNumber||""} onChange={e=>setDraft({...draft, projectNumber:e.target.value})}/></label>
                <label>Status<select className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                  value={draft.status||"active"} onChange={e=>setDraft({...draft, status:e.target.value})}>
                  <option>active</option><option>pending</option><option>completed</option><option>canceled</option>
                </select></label>
              <label>Project #<input className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                value={newProject.projectNumber||""} onChange={e=>setNewProject({...newProject, projectNumber:e.target.value})}/></label>
              <label>Status<select className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                value={(newProject.status as any)||"active"} onChange={e=>setNewProject({...newProject, status:e.target.value as any})}>
                <option>active</option><option>pending</option><option>completed</option><option>canceled</option>
              </select></label>
              <label>Role<input className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                value={newWorker.role||"Worker"} onChange={e=>setNewWorker({...newWorker, role:e.target.value})}/></label>
              <label>Company<select className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                value={newWorker.companyId||companies[0]?.id} onChange={e=>setNewWorker({...newWorker, companyId:e.target.value})}>
                {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
              <label>Wage ($/hr)<input type="number" step="0.01" className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                value={Number(newWorker.wage??0)} onChange={e=>setNewWorker({...newWorker, wage:Number(e.target.value)})}/></label>
              <label className="col-span-2">Skills (comma separated)<input className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                value={(newWorker.certs as any)?.join?.(", ") ?? ""} onChange={e=>setNewWorker({...newWorker, certs:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)})}/></label>
            </div>
          </Modal>
        )}

        {showAddEquip && (
          <Modal title="Add Equipment" onClose={()=>setShowAddEquip(false)} onPrimary={addEquip} primaryText="Add">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label>Code<input className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                value={newEquip.code||""} onChange={e=>setNewEquip({...newEquip, code:e.target.value})}/></label>
              <label>Type<input className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                value={newEquip.kind||""} onChange={e=>setNewEquip({...newEquip, kind:e.target.value})}/></label>
              <label>Status<select className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                value={newEquip.status||"active"} onChange={e=>setNewEquip({...newEquip, status:e.target.value as any})}>
                  <option>active</option><option>idle</option><option>repair</option>
              </select></label>
            </div>
          </Modal>
        )}

        {showAddProject && (
          <Modal title="Add Project" onClose={()=>setShowAddProject(false)} onPrimary={addProject} primaryText="Add">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="col-span-2">Name<input className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                value={newProject.name||""} onChange={e=>setNewProject({...newProject, name:e.target.value})}/></label>
              <label>Crew Target<input type="number" className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                value={Number(newProject.targetCrew||0)} onChange={e=>setNewProject({...newProject, targetCrew:Number(e.target.value)})}/></label>
              <label>Equip Target<input type="number" className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                value={Number(newProject.targetEquip||0)} onChange={e=>setNewProject({...newProject, targetEquip:Number(e.target.value)})}/></label>
                <label className="col-span-2">Progress (0–100)<input type="number" min="0" max="100" className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                  value={Number(draft.progress||0)} onChange={e=>setDraft({...draft, progress:Number(e.target.value)})}/></label>
            </div>
          </Modal>
        )}

        {showAddCompany && (
          <Modal title="Add Company" onClose={()=>setShowAddCompany(false)} onPrimary={addCompany} primaryText="Add">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="col-span-2">Name<input className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                value={newCompany.name||""} onChange={e=>setNewCompany({...newCompany, name:e.target.value})}/></label>
              <label>Contact<input className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                value={newCompany.contactName||""} onChange={e=>setNewCompany({...newCompany, contactName:e.target.value})}/></label>
              <label>Phone<input className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                value={newCompany.phone||""} onChange={e=>setNewCompany({...newCompany, phone:e.target.value})}/></label>
              <label className="col-span-2">Email<input className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                value={newCompany.email||""} onChange={e=>setNewCompany({...newCompany, email:e.target.value})}/></label>
            </div>
          </Modal>
        )}

        {profile && (
          <Modal
            title={`Edit ${profile.type === "worker" ? "Worker" : profile.type === "equip" ? "Equipment" : "Project"}`}
            onClose={closeProfile}
            onPrimary={saveProfile}
            primaryText="Save"
          >
            {profile.type==="worker" && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <label className="col-span-2">Name<input className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                  value={draft.name||""} onChange={e=>setDraft({...draft, name:e.target.value})}/></label>
                <label>Role<input className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                  value={draft.role||"Worker"} onChange={e=>setDraft({...draft, role:e.target.value})}/></label>
                <label>Company<select className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                  value={draft.companyId||companies[0]?.id} onChange={e=>setDraft({...draft, companyId:e.target.value})}>
                  {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select></label>
                <label>Wage ($/hr)<input type="number" step="0.01" className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                  value={Number(draft.wage??0)} onChange={e=>setDraft({...draft, wage:Number(e.target.value)})}/></label>
                <label className="col-span-2">Skills (comma separated)<input className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                  value={(Array.isArray(draft.certs)?draft.certs.join(", "):draft.certs)||""} onChange={e=>setDraft({...draft, certs:e.target.value})}/></label>
                <label className="col-span-2">Notes<textarea className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                  value={draft.notes||""} onChange={e=>setDraft({...draft, notes:e.target.value})}/></label>
              </div>
            )}
            {profile.type==="equip" && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <label>Code<input className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                  value={draft.code||""} onChange={e=>setDraft({...draft, code:e.target.value})}/></label>
                <label>Type<input className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                  value={draft.kind||""} onChange={e=>setDraft({...draft, kind:e.target.value})}/></label>
                <label>Status<select className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                  value={draft.status||"active"} onChange={e=>setDraft({...draft, status:e.target.value})}>
                    <option>active</option><option>idle</option><option>repair</option>
                </select></label>
                <label className="col-span-2">Notes<textarea className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                  value={draft.notes||""} onChange={e=>setDraft({...draft, notes:e.target.value})}/></label>
              </div>
            )}
            {profile.type==="project" && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <label className="col-span-2">Name<input className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                  value={draft.name||""} onChange={e=>setDraft({...draft, name:e.target.value})}/></label>
                <label>Crew Target<input type="number" className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                  value={Number(draft.targetCrew||0)} onChange={e=>setDraft({...draft, targetCrew:Number(e.target.value)})}/></label>
                <label>Equip Target<input type="number" className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                  value={Number(draft.targetEquip||0)} onChange={e=>setDraft({...draft, targetEquip:Number(e.target.value)})}/></label>
                <label className="col-span-2">Notes<textarea className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1"
                  value={draft.notes||""} onChange={e=>setDraft({...draft, notes:e.target.value})}/></label>
              </div>
            )}
          </Modal>
        )}
      </div>

      {/* Toast */}
      {toast.visible && (
        <div className="fixed bottom-4 right-4 z-40">
          <div className="rounded-lg bg-slate-900/95 border border-white/10 px-3 py-2 text-sm shadow-lg flex items-center gap-3">
            <span>{toast.text}</span>
            {toast.undo && <button onClick={()=>{toast.undo?.(); setToast({visible:false, text:""});}} className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/10">Undo</button>}
          </div>
        </div>
      )}
    </div>
  );
}
