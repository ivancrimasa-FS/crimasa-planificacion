export interface Manager {
  id: string;
  name: string;
}

export interface Work {
  id: string;
  code: string; // OB-1042
  name: string;
  expediente: string; // EXP/2026/0142
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

/** Datos de un día concreto. Las claves son ids de obra. */
export interface DayData {
  /** Nº de personas necesarias por obra y categoría: needs[workId][categoria] = n */
  needs: Record<string, Record<string, number>>;
  /** Personas asignadas por nombre: crew[workId] = [employeeId, ...] */
  crew: Record<string, string[]>;
  /** Vehículos asignados: vehicles[workId] = [vehicleId, ...] */
  vehicles: Record<string, string[]>;
  /** Nota libre por obra */
  notes?: Record<string, string>;
}

export interface PlannerState {
  version: number;
  categories: string[];
  managers: Manager[];
  works: Work[];
  employees: Employee[];
  vehicles: Vehicle[];
  days: Record<string, DayData>; // clave: YYYY-MM-DD
}

export const CATEGORIES = ["Encargado", "Oficial 1ª", "Oficial 2ª", "Ayudante", "Peón"];

/** Color por categoría para los muñecos. */
export const CATEGORY_COLORS: Record<string, string> = {
  Encargado: "oklch(0.62 0.13 40)",
  "Oficial 1ª": "oklch(0.7 0.11 82)",
  "Oficial 2ª": "oklch(0.62 0.11 235)",
  Ayudante: "oklch(0.72 0.09 200)",
  Peón: "oklch(0.55 0.09 265)",
};

export const FALLBACK_COLOR = "oklch(0.53 0.03 250)";

export function categoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] || FALLBACK_COLOR;
}
