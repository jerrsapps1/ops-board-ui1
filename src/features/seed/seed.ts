import { DB, LaborCompany, Worker, Equipment, Project } from "../shared/types";
import { DB_KEY, WIX_KEY, EIX_KEY } from "../shared/db";
import { SYS_REPAIR_ID, SYS_WAREHOUSE_ID } from "../shared/systemProjects";

function save(db: DB, wIx: Record<string,string|null>, eIx: Record<string,string|null>){
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  localStorage.setItem(WIX_KEY, JSON.stringify(wIx));
  localStorage.setItem(EIX_KEY, JSON.stringify(eIx));
}

export function loadSampleData(){
  const C1="co-acme", C2="co-prime";
  const P1="p-san-marcos", P2="p-fort-sam", P3="p-tower-life";
  const W1="w-jose", W2="w-aubrey", W3="w-solomon", W4="w-derrick", W5="w-james";
  const E1="e-ysk032", E2="e-yex027", E3="e-tl943c010", E4="e-ed800008";

  const companies: LaborCompany[] = [
    { id:C1, name:"Acme Labor", contacts:[], primaryContactName:"Rita V.", primaryContactPhone:"(210) 555-1010", primaryContactEmail:"rita@acmelabor.com" },
    { id:C2, name:"Prime Staffing", contacts:[], primaryContactName:"Andre P.", primaryContactPhone:"(210) 555-2020", primaryContactEmail:"andre@primestaffing.com" },
  ];

  const workers: Worker[] = [
    { id:W1, name:"Jose Garcia", role:"Operator", companyId:C1, skills:["Skid Steer","Telehandler"], wage:24 },
    { id:W2, name:"Aubrey M.", role:"Supervisor", companyId:C1, skills:["Any"], wage:30 },
    { id:W3, name:"Solomon S.", role:"Laborer", companyId:C2, skills:[], wage:18 },
    { id:W4, name:"Derrick T.", role:"Laborer", companyId:C2, skills:[], wage:18 },
    { id:W5, name:"James F.", role:"Operator", companyId:C1, skills:["Excavator"], wage:26 },
  ];

  const equipment: Equipment[] = [
    { id:E1, assetNumber:"YSK-032", type:"Skid Steer", status:"active", make:"Yanmar", model:"YSK-032", owner:"Company" },
    { id:E2, assetNumber:"YEX-027", type:"Excavator", status:"active", make:"Yanmar", model:"YEX-027", owner:"Company" },
    { id:E3, assetNumber:"TL943C-010", type:"Telehandler", status:"idle", owner:"Company" },
    { id:E4, assetNumber:"ED800-008", type:"Dump Buggy", status:"repair", owner:"Company",
      repairHistory:[{ start:new Date().toISOString(), reason:"Clutch issue" }] },
  ];

  const projects: Project[] = [
    { id:P1, name:"San Marcos",   number:"SM-01", crewTarget:6, equipTarget:3, status:"active", progress:10 },
    { id:P2, name:"Fort Sam",     number:"FS-02", crewTarget:5, equipTarget:2, status:"active", progress:5  },
    { id:P3, name:"Tower of Life",number:"TL-03", crewTarget:4, equipTarget:2, status:"active", progress:0  },
    { id:SYS_WAREHOUSE_ID, name:"Warehouse / Yard", number:"WH", status:"active", progress:0, special:"warehouse" },
    { id:SYS_REPAIR_ID,    name:"Repair Shop",      number:"RS", status:"active", progress:0, special:"repair"    },
  ];

  const workerIndex: Record<string,string|null> = {
    [W1]: P1, [W2]: P1, [W3]: P1, [W4]: P1, [W5]: P2,
  };
  const equipIndex:  Record<string,string|null> = {
    [E1]: P1, [E2]: P1, [E3]: P2, [E4]: SYS_REPAIR_ID,
  };

  const db: DB = { workers, equipment, projects, companies };
  save(db, workerIndex, equipIndex);
}
