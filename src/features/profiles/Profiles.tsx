import React, { useState } from "react";
import {
  DB, Worker, Equipment, Project, LaborCompany, Contact,
  equipmentLabel
} from "../shared/types";
import { readDB, writeDB } from "../shared/db";

function uid(){ return Math.random().toString(36).slice(2,9); }

export default function Profiles(){
  const [db,setDb] = useState<DB>(()=>readDB());
  const save = (next: DB)=>{ setDb(next); writeDB(next); };

  return (
    <div className="p-6 space-y-8">
      <Section title="Labor Companies (max 10)">
        <CompanyList db={db} onSave={save}/>
      </Section>
      <Section title="Workers">
        <WorkerList db={db} onSave={save}/>
      </Section>
      <Section title="Equipment">
        <EquipmentList db={db} onSave={save}/>
      </Section>
      <Section title="Projects">
        <ProjectList db={db} onSave={save}/>
      </Section>
    </div>
  );
}

const Section:React.FC<{title:string;children:React.ReactNode}> = ({title,children})=>(
  <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
    <div className="text-cyan-100 font-medium mb-3">{title}</div>
    {children}
  </div>
);

/* ---------------- Labor Companies ---------------- */

const CompanyList:React.FC<{db:DB;onSave:(db:DB)=>void}> = ({db,onSave})=>{
  const [open,setOpen] = useState(false);
  const [draft,setDraft] = useState<LaborCompany|null>(null);

  const begin = ()=>{
    if(db.companies.length>=10) return alert("Limit 10 companies.");
    setDraft({ id: uid(), name:"", contacts:[] });
    setOpen(true);
  };
  const save = ()=>{
    if(!draft?.name?.trim()) return alert("Company name required.");
    const exists = db.companies.some(c=>c.id===draft.id);
    const next = exists ? { ...db, companies: db.companies.map(c=>c.id===draft.id?draft:c) }
                        : { ...db, companies: [...db.companies, draft] };
    onSave(next); setOpen(false);
  };

  return (
    <>
      <div className="flex justify-end mb-2">
        <button onClick={begin} className="px-3 py-1.5 text-sm bg-emerald-600/80 hover:bg-emerald-600 rounded-lg text-white">Add</button>
      </div>
      <div className="space-y-2">
        {db.companies.map(c=>(
          <div key={c.id} className="bg-white/5 border border-white/10 rounded-xl p-3 flex justify-between">
            <div className="text-cyan-100">
              <div className="font-medium">{c.name}</div>
              <div className="text-xs opacity-70">
                {c.primaryContactName ? `Primary: ${c.primaryContactName}` : "No primary contact"}
                {c.billingEmail ? ` • Billing: ${c.billingEmail}`:""}
              </div>
            </div>
            <button onClick={()=>{setDraft(c);setOpen(true);}} className="px-3 py-1.5 text-sm bg-white/10 hover:bg-white/15 rounded-lg text-cyan-100">Edit</button>
          </div>
        ))}
      </div>

      {open&&draft&&(
        <Modal title={draft.name? "Edit Labor Company":"Add Labor Company"} onClose={()=>setOpen(false)}>
          <div className="grid grid-cols-2 gap-3">
            <Text label="Name" value={draft.name} onChange={v=>setDraft({...draft,name:v})} colSpan={2}/>
            <Text label="Address 1" value={draft.address1} onChange={v=>setDraft({...draft,address1:v})} colSpan={2}/>
            <Text label="Address 2" value={draft.address2} onChange={v=>setDraft({...draft,address2:v})} colSpan={2}/>
            <Text label="City" value={draft.city} onChange={v=>setDraft({...draft,city:v})}/>
            <Text label="State" value={draft.state} onChange={v=>setDraft({...draft,state:v})}/>
            <Text label="Zip" value={draft.zip} onChange={v=>setDraft({...draft,zip:v})}/>
            <Text label="Billing Email" value={draft.billingEmail} onChange={v=>setDraft({...draft,billingEmail:v})}/>
            <Text label="Net Terms" value={draft.netTerms} onChange={v=>setDraft({...draft,netTerms:v})}/>
            <div className="col-span-2 border-t border-white/10 pt-3 -mb-2"></div>
            <Text label="Primary Contact Name" value={draft.primaryContactName} onChange={v=>setDraft({...draft,primaryContactName:v})}/>
            <Text label="Primary Contact Phone" value={draft.primaryContactPhone} onChange={v=>setDraft({...draft,primaryContactPhone:v})}/>
            <Text label="Primary Contact Email" value={draft.primaryContactEmail} onChange={v=>setDraft({...draft,primaryContactEmail:v})}/>
            <div className="col-span-2 border-t border-white/10 pt-3"></div>
            <ContactEditor contacts={draft.contacts} onChange={(contacts)=>setDraft({...draft,contacts})}/>
          </div>
          <ModalActions onCancel={()=>setOpen(false)} onPrimary={save} primaryText="Save"/>
        </Modal>
      )}
    </>
  );
};

const ContactEditor:React.FC<{contacts:Contact[];onChange:(c:Contact[])=>void}> = ({contacts,onChange})=>{
  const add = ()=>{ if(contacts.length>=6) return alert("Max 6 contacts."); onChange([...contacts,{id:uid(),name:""}]); };
  const set = (id:string,patch:Partial<Contact>)=> onChange(contacts.map(c=>c.id===id?{...c,...patch}:c));
  const del = (id:string)=> onChange(contacts.filter(c=>c.id!==id));
  return (
    <div className="col-span-2">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-cyan-200">Contacts (max 6)</div>
        <button onClick={add} className="px-2 py-1 text-xs bg-white/10 hover:bg-white/15 rounded-lg text-cyan-100">Add contact</button>
      </div>
      <div className="space-y-2">
        {contacts.map(c=>(
          <div key={c.id} className="grid grid-cols-4 gap-2 bg-white/5 border border-white/10 rounded-lg p-2">
            <Text label="Name" value={c.name} onChange={v=>set(c.id,{name:v})}/>
            <Text label="Email" value={c.email} onChange={v=>set(c.id,{email:v})}/>
            <Text label="Phone" value={c.phone} onChange={v=>set(c.id,{phone:v})}/>
            <Text label="Role" value={c.role} onChange={v=>set(c.id,{role:v})}/>
            <div className="col-span-4 -mt-1"><button onClick={()=>del(c.id)} className="text-xs text-red-300/90 hover:text-red-200">Remove</button></div>
          </div>
        ))}
        {!contacts.length && <div className="text-xs text-cyan-300/60">No contacts added.</div>}
      </div>
    </div>
  );
};

/* ---------------- Workers ---------------- */

const WorkerList:React.FC<{db:DB;onSave:(db:DB)=>void}> = ({db,onSave})=>{
  const [open,setOpen] = useState(false);
  const [draft,setDraft] = useState<Worker|null>(null);
  const begin = ()=>{ setDraft({ id: uid(), name:"", role:"Worker", skills:[] }); setOpen(true); };
  const save = ()=>{
    if(!draft?.name?.trim()) return alert("Worker name required.");
    const exists = db.workers.some(w=>w.id===draft.id);
    const next = exists ? { ...db, workers: db.workers.map(w=>w.id===draft.id?draft:w) }
                        : { ...db, workers: [...db.workers, draft] };
    onSave(next); setOpen(false);
  };
  return (
    <>
      <div className="flex justify-end mb-2">
        <button onClick={begin} className="px-3 py-1.5 text-sm bg-emerald-600/80 hover:bg-emerald-600 rounded-lg text-white">Add</button>
      </div>
      <div className="space-y-2">
        {db.workers.map(w=>(
          <div key={w.id} className="bg-white/5 border border-white/10 rounded-xl p-3 flex justify-between">
            <div className="text-cyan-100">
              <div className="font-medium">{w.name}</div>
              <div className="text-xs opacity-70">{w.role} {w.wage ? `• $${w.wage}/hr`:""}</div>
            </div>
            <button onClick={()=>{setDraft(w);setOpen(true);}} className="px-3 py-1.5 text-sm bg-white/10 hover:bg-white/15 rounded-lg text-cyan-100">Edit</button>
          </div>
        ))}
      </div>

      {open&&draft&&(
        <Modal title={draft.name? "Edit Worker":"Add Worker"} onClose={()=>setOpen(false)}>
          <div className="grid grid-cols-2 gap-3">
            <Text label="Name" value={draft.name} onChange={v=>setDraft({...draft,name:v})}/>
            <Text label="Role" value={draft.role} onChange={v=>setDraft({...draft,role:v})}/>
            <Select label="Labor Company" value={draft.companyId||""} onChange={v=>setDraft({...draft,companyId:v||undefined})}
              options={[{value:"",label:"—"}, ...db.companies.map(c=>({value:c.id,label:c.name}))]} />
            <Number label="Wage ($/hr)" value={draft.wage??0} onChange={v=>setDraft({...draft,wage:v})}/>
            <Text label="Phone" value={draft.phone} onChange={v=>setDraft({...draft,phone:v})}/>
            <Text label="Email" value={draft.email} onChange={v=>setDraft({...draft,email:v})}/>
            <Text label="DOB (mm/dd/yyyy)" value={draft.dob} onChange={v=>setDraft({...draft,dob:v})}/>
            <Text label="DOH (mm/dd/yyyy)" value={draft.doh} onChange={v=>setDraft({...draft,doh:v})}/>
            <Text label="SSN (last 4)" value={draft.ssn4} onChange={v=>setDraft({...draft,ssn4:v})}/>
            <Text label="Emergency Contact Name" value={draft.emergencyContactName} onChange={v=>setDraft({...draft,emergencyContactName:v})}/>
            <Text label="Emergency Contact Phone" value={draft.emergencyContactPhone} onChange={v=>setDraft({...draft,emergencyContactPhone:v})}/>
            <Text label="Skills (comma separated)" value={(draft.skills||[]).join(", ")} onChange={v=>setDraft({...draft,skills:v.split(",").map(s=>s.trim()).filter(Boolean)})} colSpan={2}/>
            <Text label="Address 1" value={draft.address1} onChange={v=>setDraft({...draft,address1:v})}/>
            <Text label="Address 2" value={draft.address2} onChange={v=>setDraft({...draft,address2:v})}/>
            <Text label="City" value={draft.city} onChange={v=>setDraft({...draft,city:v})}/>
            <Text label="State" value={draft.state} onChange={v=>setDraft({...draft,state:v})}/>
            <Text label="Zip" value={draft.zip} onChange={v=>setDraft({...draft,zip:v})}/>
            <Text label="Notes" value={draft.notes} onChange={v=>setDraft({...draft,notes:v})} colSpan={2}/>
          </div>
          <ModalActions onCancel={()=>setOpen(false)} onPrimary={save} primaryText="Save"/>
        </Modal>
      )}
    </>
  );
};

/* ---------------- Equipment ---------------- */

const EquipmentList:React.FC<{db:DB;onSave:(db:DB)=>void}> = ({db,onSave})=>{
  const [open,setOpen] = useState(false);
  const [draft,setDraft] = useState<Equipment|null>(null);

  const begin = ()=>{ setDraft({ id: uid(), assetNumber:"", status:"active" }); setOpen(true); };
  const save = ()=>{
    if(!draft) return;
    const normalized:Equipment = { ...draft, code: draft.assetNumber || draft.code };
    if(!equipmentLabel(normalized)) return alert("Asset # is required.");
    const exists = db.equipment.some(e=>e.id===normalized.id);
    const next = exists ? { ...db, equipment: db.equipment.map(e=>e.id===normalized.id?normalized:e) }
                        : { ...db, equipment: [...db.equipment, normalized] };
    onSave(next); setOpen(false);
  };

  return (
    <>
      <div className="flex justify-end mb-2">
        <button onClick={begin} className="px-3 py-1.5 text-sm bg-emerald-600/80 hover:bg-emerald-600 rounded-lg text-white">Add</button>
      </div>
      <div className="space-y-2">
        {db.equipment.map(e=>(
          <div key={e.id} className="bg-white/5 border border-white/10 rounded-xl p-3 flex justify-between">
            <div className="text-cyan-100">
              <div className="font-medium">{equipmentLabel(e) || "(unnamed)"}</div>
              <div className="text-xs opacity-70">{e.type||"—"} {e.make?`• ${e.make}`:""} {e.model?`• ${e.model}`:""}</div>
            </div>
            <button onClick={()=>{setDraft(e);setOpen(true);}} className="px-3 py-1.5 text-sm bg-white/10 hover:bg-white/15 rounded-lg text-cyan-100">Edit</button>
          </div>
        ))}
      </div>

      {open&&draft&&(
        <Modal title={equipmentLabel(draft)? "Edit Equipment":"Add Equipment"} onClose={()=>setOpen(false)}>
          <div className="grid grid-cols-2 gap-3">
            <Text label="Asset #" value={draft.assetNumber ?? draft.code ?? ""} onChange={v=>setDraft({...draft,assetNumber:v})}/>
            <Text label="Type" value={draft.type} onChange={v=>setDraft({...draft,type:v})}/>
            <Select label="Status" value={draft.status||"active"} onChange={v=>setDraft({...draft,status:v as any})}
              options={["active","idle","repair","hold","leave"].map(s=>({value:s,label:s}))}/>
            <Select label="Assigned driver" value={draft.assignedDriverId||""} onChange={v=>setDraft({...draft,assignedDriverId:v||null})}
              options={[{value:"",label:"—"}, ...db.workers.map(w=>({value:w.id,label:w.name}))]} />
            <Text label="Make" value={draft.make} onChange={v=>setDraft({...draft,make:v})}/>
            <Text label="Model" value={draft.model} onChange={v=>setDraft({...draft,model:v})}/>
            <Text label="Year" value={draft.year} onChange={v=>setDraft({...draft,year:v})}/>
            <Text label="VIN / Serial" value={draft.vin} onChange={v=>setDraft({...draft,vin:v})}/>
            <Text label="Body Style" value={draft.bodyStyle} onChange={v=>setDraft({...draft,bodyStyle:v})}/>
            <Text label="Plate #" value={draft.plate} onChange={v=>setDraft({...draft,plate:v})}/>
            <Text label="Purchase Date (mm/dd/yyyy)" value={draft.purchaseDate} onChange={v=>setDraft({...draft,purchaseDate:v})}/>
            <Text label="Last Service Date (mm/dd/yyyy)" value={draft.lastServiceDate} onChange={v=>setDraft({...draft,lastServiceDate:v})}/>
            <Number label="Service Interval (miles)" value={draft.serviceIntervalMiles ?? 0} onChange={v=>setDraft({...draft,serviceIntervalMiles:v})}/>
            <Number label="Service Interval (hours)" value={draft.serviceIntervalHours ?? 0} onChange={v=>setDraft({...draft,serviceIntervalHours:v})}/>
            <Number label="Odometer" value={draft.odometer ?? 0} onChange={v=>setDraft({...draft,odometer:v})}/>
            <Number label="Hours Meter" value={draft.hoursMeter ?? 0} onChange={v=>setDraft({...draft,hoursMeter:v})}/>
            <Text label="Owner" value={draft.owner} onChange={v=>setDraft({...draft,owner:v})}/>
            <Text label="Location" value={draft.location} onChange={v=>setDraft({...draft,location:v})}/>
            <Text label="Notes" value={draft.notes} onChange={v=>setDraft({...draft,notes:v})} colSpan={2}/>
          </div>
          <ModalActions onCancel={()=>setOpen(false)} onPrimary={save} primaryText="Save"/>
        </Modal>
      )}
    </>
  );
};

/* ---------------- Projects ---------------- */

const ProjectList:React.FC<{db:DB;onSave:(db:DB)=>void}> = ({db,onSave})=>{
  const [open,setOpen] = useState(false);
  const [draft,setDraft] = useState<Project|null>(null);
  const begin = ()=>{ setDraft({ id: uid(), name:"", status:"active", progress:0, crewTarget:4, equipTarget:2 }); setOpen(true); };
  const save = ()=>{
    if(!draft?.name?.trim()) return alert("Project name required.");
    const exists = db.projects.some(p=>p.id===draft.id);
    const next = exists ? { ...db, projects: db.projects.map(p=>p.id===draft.id?draft:p) }
                        : { ...db, projects: [...db.projects, draft] };
    onSave(next); setOpen(false);
  };
  return (
    <>
      <div className="flex justify-end mb-2">
        <button onClick={begin} className="px-3 py-1.5 text-sm bg-emerald-600/80 hover:bg-emerald-600 rounded-lg text-white">Add</button>
      </div>
      <div className="space-y-2">
        {db.projects
          .filter(p=>!p.special) /* hide system ones here */
          .map(p=>(
          <div key={p.id} className="bg-white/5 border border-white/10 rounded-xl p-3 flex justify-between">
            <div className="text-cyan-100">
              <div className="font-medium">{p.name}{p.number?` • ${p.number}`:""}</div>
              <div className="text-xs opacity-70">Targets: Crew {p.crewTarget??0}, Equip {p.equipTarget??0}</div>
            </div>
            <button onClick={()=>{setDraft(p);setOpen(true);}} className="px-3 py-1.5 text-sm bg-white/10 hover:bg-white/15 rounded-lg text-cyan-100">Edit</button>
          </div>
        ))}
      </div>

      {open&&draft&&(
        <Modal title={draft.name? "Edit Project":"Add Project"} onClose={()=>setOpen(false)}>
          <div className="grid grid-cols-2 gap-3">
            <Text label="Name" value={draft.name} onChange={v=>setDraft({...draft,name:v})}/>
            <Text label="Project #" value={draft.number} onChange={v=>setDraft({...draft,number:v})}/>
            <Number label="Crew Target" value={draft.crewTarget ?? 0} onChange={v=>setDraft({...draft,crewTarget:v})}/>
            <Number label="Equip Target" value={draft.equipTarget ?? 0} onChange={v=>setDraft({...draft,equipTarget:v})}/>
            <Select label="Status" value={draft.status||"active"} onChange={v=>setDraft({...draft,status:v as any})}
              options={["active","pending","completed","canceled"].map(s=>({value:s,label:s}))}/>
            <Number label="Progress (%)" value={draft.progress ?? 0} onChange={v=>setDraft({...draft,progress:v})}/>
          </div>
          <ModalActions onCancel={()=>setOpen(false)} onPrimary={save} primaryText="Save"/>
        </Modal>
      )}
    </>
  );
};

/* ---------------- UI helpers ---------------- */

const Modal:React.FC<{title:string;onClose:()=>void;children:React.ReactNode}> = ({title,onClose,children})=>(
  <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
    <div className="bg-slate-900 border border-white/10 rounded-2xl w-[860px] max-w-[92vw] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-cyan-100 font-medium">{title}</div>
        <button onClick={onClose} className="px-2 py-1 text-sm bg-white/10 hover:bg-white/15 rounded text-cyan-100">Close</button>
      </div>
      {children}
    </div>
  </div>
);

const ModalActions:React.FC<{onCancel:()=>void;onPrimary:()=>void;primaryText?:string}> =
({onCancel,onPrimary,primaryText="Save"})=>(
  <div className="mt-4 flex justify-end gap-2">
    <button onClick={onCancel} className="px-3 py-1.5 text-sm bg-white/10 hover:bg-white/15 rounded-lg text-cyan-100">Cancel</button>
    <button onClick={onPrimary} className="px-3 py-1.5 text-sm bg-emerald-600/80 hover:bg-emerald-600 rounded-lg text-white">{primaryText}</button>
  </div>
);

const Text:React.FC<{label:string;value?:string;onChange:(v:string)=>void;colSpan?:number}> =
({label,value="",onChange,colSpan})=>(
  <label className={`flex flex-col gap-1 ${colSpan?`col-span-${colSpan}`:""}`}>
    <span className="text-xs text-cyan-300/80">{label}</span>
    <input className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-cyan-100 outline-none focus:ring-2 focus:ring-cyan-500/40"
      value={value} onChange={e=>onChange(e.target.value)} />
  </label>
);

const Number:React.FC<{label:string;value:number;onChange:(v:number)=>void}> =
({label,value,onChange})=>(
  <label className="flex flex-col gap-1">
    <span className="text-xs text-cyan-300/80">{label}</span>
    <input type="number" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-cyan-100 outline-none focus:ring-2 focus:ring-cyan-500/40"
      value={Number.isFinite(value)?value:0} onChange={e=>onChange(Number(e.target.value))} />
  </label>
);

const Select:React.FC<{label:string;value:string;onChange:(v:string)=>void;options:{value:string;label:string}[]}> =
({label,value,onChange,options})=>(
  <label className="flex flex-col gap-1">
    <span className="text-xs text-cyan-300/80">{label}</span>
    <select className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-cyan-100 outline-none focus:ring-2 focus:ring-cyan-500/40"
      value={value} onChange={e=>onChange(e.target.value)}>
      {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </label>
);
