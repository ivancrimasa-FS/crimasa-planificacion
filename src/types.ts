export interface Manager {
  id: string;
  name: string;
}

export interface Work {
  id: string;
  code: string; // AEN_26_134
  name: string;
  expediente: string; // SVQ-31/2026
  /** Cliente o empresa: AENA, LIDL, DIA, Sampol… */
  client?: string;
  managerId: string;
  active: boolean;
}

export interface Employee {
  id: string;
  name: string;
  category: string;
  active: boolean;
}

export interface Vehicle {
  id: string;
  plate: string; // 1234 KLM
  description: string;
  active: boolean;
}

export type AbsenceType = "Vacaciones" | "Baja" | "Curso" | "Permiso";

export const ABSENCE_TYPES: AbsenceType[] = ["Vacaciones", "Baja", "Curso", "Permiso"];

export const ABSENCE_COLORS: Record<string, string> = {
  Vacaciones: "oklch(0.72 0.09 200)",
  Baja: "oklch(0.56 0.19 25)",
  Curso: "oklch(0.55 0.09 265)",
  Permiso: "oklch(0.62 0.13 40)",
};

export interface Absence {
  id: string;
  employeeId: string;
  /** Fechas inclusivas, formato YYYY-MM-DD */
  from: string;
  to: string;
  type: AbsenceType;
  note?: string;
}

export type Turno = "DIA" | "NOCHE";

export const TURNOS: Turno[] = ["DIA", "NOCHE"];

/** Detalle de una persona asignada a una obra un día: turno y dieta. */
export interface Shift {
  turno: Turno;
  dieta?: boolean;
}

/** Un vehículo se asigna por turno: la misma matrícula puede ir de día y de noche. */
export interface VehicleSlot {
  vehicleId: string;
  turno: Turno;
}

export function slotKey(vehicleId: string, turno: Turno): string {
  return vehicleId + "::" + turno;
}

export function parseSlot(key: string): VehicleSlot {
  const [vehicleId, turno] = key.split("::");
  return { vehicleId, turno: (turno === "NOCHE" ? "NOCHE" : "DIA") as Turno };
}

/** Datos de un día concreto. Las claves son ids de obra. */
export interface DayData {
  /** Nº de personas necesarias por obra y categoría: needs[workId][categoria] = n */
  needs: Record<string, Record<string, number>>;
  /** Personas asignadas por nombre: crew[workId] = [employeeId, ...] */
  crew: Record<string, string[]>;
  /** Vehículos asignados: vehicles[workId] = ["vh_1::DIA", ...] */
  vehicles: Record<string, string[]>;
  /** Turno y dieta por persona y obra: shifts[workId][employeeId] */
  shifts?: Record<string, Record<string, Shift>>;
  /** Nota libre por obra */
  notes?: Record<string, string>;
  /** Auditoría: quién y cuándo tocó este día por última vez */
  updatedBy?: string;
  updatedAt?: string;
}

export interface PlannerState {
  version: number;
  categories: string[];
  managers: Manager[];
  works: Work[];
  employees: Employee[];
  vehicles: Vehicle[];
  absences: Absence[];
  festivosLocales: Record<string, string>;
  days: Record<string, DayData>; // clave: YYYY-MM-DD
}

export const CATEGORIES = ["Encargado", "Oficial de 1ª", "Oficial de 2ª", "Oficial de 3ª", "Subcontrata"];

/** Color por categoría para los muñecos. */
export const CATEGORY_COLORS: Record<string, string> = {
  Encargado: "oklch(0.62 0.13 40)",
  "Oficial de 1ª": "oklch(0.7 0.11 82)",
  "Oficial de 2ª": "oklch(0.62 0.11 235)",
  "Oficial de 3ª": "oklch(0.72 0.09 200)",
  Subcontrata: "oklch(0.55 0.09 265)",
};

export const FALLBACK_COLOR = "oklch(0.53 0.03 250)";

export function categoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] || FALLBACK_COLOR;
}
