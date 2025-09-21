export type RoleTag = "Lead" | "Assistant" | null;
export type Status = "active" | "idle" | "repair" | "hold" | "leave";

export interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
}

export interface LaborCompany {
  id: string;
  name: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  billingEmail?: string;
  netTerms?: string;
  primaryContactName?: string;
  primaryContactPhone?: string;
  primaryContactEmail?: string;
  contacts: Contact[];
}

export interface Worker {
  id: string;
  name: string;
  role: string;
  companyId?: string;
  wage?: number;
  phone?: string;
  email?: string;
  dob?: string;
  doh?: string;
  ssn4?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  skills?: string[];
  notes?: string;
}

export interface RepairLog {
  start: string;        // ISO
  end?: string | null;  // null/undefined = open
  reason?: string;
}

export interface Equipment {
  id: string;
  code?: string;                 // legacy
  assetNumber?: string;          // preferred
  type?: string;
  status?: Status;
  make?: string;
  model?: string;
  year?: string;
  vin?: string;
  plate?: string;
  bodyStyle?: string;
  purchaseDate?: string;
  lastServiceDate?: string;
  serviceIntervalMiles?: number; // primary
  serviceIntervalHours?: number; // optional
  odometer?: number;
  hoursMeter?: number;
  assignedDriverId?: string | null;
  owner?: string;
  location?: string;

  isRental?: boolean;
  rentalVendor?: string;
  rentalStart?: string;
  rentalEnd?: string;
  rentalRatePerDay?: number;

  repairHistory?: RepairLog[];
  notes?: string;
}

export interface Project {
  id: string;
  name: string;
  number?: string;
  crewTarget?: number;
  equipTarget?: number;
  status?: "active" | "pending" | "completed" | "canceled";
  progress?: number;
  special?: "warehouse" | "repair";
}

export interface DB {
  workers: Worker[];
  equipment: Equipment[];
  projects: Project[];
  companies: LaborCompany[];
}

export function equipmentLabel(e: Equipment) {
  return (e.assetNumber || e.code || "").trim();
}
