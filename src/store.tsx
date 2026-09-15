import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  FieldPath,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { COL_CATALOGO, COL_DIAS, DOC_CATALOGO, db, firebaseReady } from "./firebase";
import { useAuth } from "./auth";
import { CATEGORIES } from "./types";
import type { Absence, DayData, Employee, Manager, PlannerState, Vehicle, Work } from "./types";

/* ------------------------- utilidades de fecha ------------------------- */

export function todayISO(): string {
  return toISO(new Date());
}

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function formatLong(iso: string): string {
  return fromISO(iso).toLocaleDateString("es-ES", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

export const EMPTY_DAY: DayData = { needs: {}, crew: {}, vehicles: {}, notes: {} };

function uid(prefix: string): string {
  return prefix + "_" + Math.random().toString(36).slice(2, 9);
}

/* --------------------------- datos iniciales --------------------------- */

interface Catalog {
  categories: string[];
  managers: Manager[];
  works: Work[];
  employees: Employee[];
  vehicles: Vehicle[];
  absences: Absence[];
  /** Festivos locales añadidos a mano: { "2026-08-15": "Feria del pueblo" } */
  festivosLocales: Record<string, string>;
}

const EMPTY_CATALOG: Catalog = {
  categories: [...CATEGORIES],
  managers: [],
  works: [],
  employees: [],
  vehicles: [],
  absences: [],
  festivosLocales: {},
};

const EMPLOYEE_SEED: [string, string][] = [
  ["Javier Martín", "Encargado"],
  ["Rubén López", "Oficial 1ª"],
  ["Ana Serrano", "Oficial 1ª"],
  ["Sergio Navarro", "Oficial 1ª"],
  ["Iván Molina", "Oficial 1ª"],
  ["Marta Ibáñez", "Oficial 2ª"],
  ["David Cortés", "Oficial 2ª"],
  ["Lucía Ferrer", "Oficial 2ª"],
  ["Álvaro Cano", "Oficial 2ª"],
  ["Nuria Gálvez", "Ayudante"],
  ["Pablo Herrera", "Ayudante"],
  ["Rocío Pardo", "Ayudante"],
  ["Miguel Ángel Ruiz", "Ayudante"],
  ["Cristina Vega", "Peón"],
  ["Jorge Salas", "Peón"],
  ["Elena Bravo", "Peón"],
  ["Tomás Aguilar", "Peón"],
  ["Raúl Benítez", "Peón"],
  ["Silvia Domínguez", "Peón"],
  ["Adrián Quintana", "Oficial 1ª"],
  ["Beatriz Lorenzo", "Oficial 2ª"],
  ["Óscar Peña", "Ayudante"],
  ["Natalia Rivas", "Peón"],
];

function seedCatalog(): Catalog {
  const m1: Manager = { id: "mg_laura", name: "Laura Vidal" };
  const m2: Manager = { id: "mg_andres", name: "Andrés Puig" };
  const m3: Manager = { id: "mg_carmen", name: "Carmen Ríos" };
  return {
    categories: [...CATEGORIES],
    managers: [m1, m2, m3],
    works: [
      { id: "wk_1042", code: "OB-1042", name: "Rehabilitación Nave Industrial Norte", expediente: "EXP/2026/0142", managerId: m1.id, active: true },
      { id: "wk_1058", code: "OB-1058", name: "Colector Avenida del Puerto", expediente: "EXP/2026/0189", managerId: m1.id, active: true },
      { id: "wk_1061", code: "OB-1061", name: "Edificio Residencial Los Almendros", expediente: "EXP/2026/0203", managerId: m2.id, active: true },
      { id: "wk_1070", code: "OB-1070", name: "Refuerzo Estructural Puente Sur", expediente: "EXP/2026/0231", managerId: m3.id, active: true },
    ],
    employees: EMPLOYEE_SEED.map(([name, category], i) => ({ id: "em_" + (i + 1), name, category, active: true })),
    vehicles: [
      { id: "vh_1", plate: "1234 KLM", description: "Furgón taller", active: true },
      { id: "vh_2", plate: "5678 BNP", description: "Pick-up", active: true },
      { id: "vh_3", plate: "9012 TRD", description: "Furgoneta", active: true },
    ],
    absences: [],
    festivosLocales: {},
  };
}

function normalizeCatalog(input: any): Catalog {
  if (!input || typeof input !== "object") return { ...EMPTY_CATALOG };
  return {
    categories: Array.isArray(input.categories) && input.categories.length ? input.categories : [...CATEGORIES],
    managers: Array.isArray(input.managers) ? input.managers : [],
    works: Array.isArray(input.works) ? input.works.map((w: Work) => ({ ...w, active: w.active !== false })) : [],
    employees: Array.isArray(input.employees) ? input.employees.map((e: Employee) => ({ ...e, active: e.active !== false })) : [],
    vehicles: Array.isArray(input.vehicles) ? input.vehicles.map((v: Vehicle) => ({ ...v, active: v.active !== false })) : [],
    absences: Array.isArray(input.absences) ? input.absences : [],
    festivosLocales:
      input.festivosLocales && typeof input.festivosLocales === "object" ? input.festivosLocales : {},
  };
}

function normalizeDay(input: any): DayData {
  return {
    needs: input && typeof input.needs === "object" && input.needs ? input.needs : {},
    crew: input && typeof input.crew === "object" && input.crew ? input.crew : {},
    vehicles: input && typeof input.vehicles === "object" && input.vehicles ? input.vehicles : {},
    notes: input && typeof input.notes === "object" && input.notes ? input.notes : {},
    updatedBy: input && typeof input.updatedBy === "string" ? input.updatedBy : undefined,
    updatedAt: input && typeof input.updatedAt === "string" ? input.updatedAt : undefined,
  };
}

/* ------------------------------ contexto ------------------------------ */

export type SyncStatus = "conectando" | "conectado" | "guardando" | "sin-conexion" | "error";

interface PlannerContextValue {
  state: PlannerState;
  status: SyncStatus;
  lastError: string | null;
  date: string;
  setDate: (iso: string) => void;
  day: DayData;
  dayOf: (iso: string) => DayData;

  setNeed: (workId: string, category: string, value: number) => void;
  assignEmployee: (workId: string, employeeId: string) => void;
  unassignEmployee: (workId: string, employeeId: string) => void;
  freeEmployee: (employeeId: string) => void;
  toggleVehicle: (workId: string, vehicleId: string) => void;
  setNote: (workId: string, text: string) => void;
  copyPreviousDay: () => void;
  clearDay: () => void;

  addManager: (name: string) => void;
  updateManager: (id: string, patch: Partial<Manager>) => void;
  removeManager: (id: string) => void;
  moveManager: (fromId: string, toId: string) => void;

  addWork: (w: Omit<Work, "id">) => void;
  updateWork: (id: string, patch: Partial<Work>) => void;
  removeWork: (id: string) => void;

  addEmployee: (name: string, category: string) => void;
  updateEmployee: (id: string, patch: Partial<Employee>) => void;
  removeEmployee: (id: string) => void;

  addVehicle: (plate: string, description: string) => void;
  updateVehicle: (id: string, patch: Partial<Vehicle>) => void;
  removeVehicle: (id: string) => void;

  addAbsence: (a: Omit<Absence, "id">) => void;
  removeAbsence: (id: string) => void;
  absenceOf: (employeeId: string, iso?: string) => Absence | null;
  absencesOn: (iso: string) => Record<string, Absence>;

  addFestivoLocal: (fecha: string, nombre: string) => void;
  removeFestivoLocal: (fecha: string) => void;

  reset: () => void;
  replaceState: (json: string) => string | null;
  worksOf: (managerId: string) => Work[];
  needTotal: (workId: string, iso?: string) => number;
}

const PlannerContext = createContext<PlannerContextValue | null>(null);

export function PlannerProvider({ children }: { children: ReactNode }) {
  const { email } = useAuth();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [days, setDays] = useState<Record<string, DayData>>({});
  const [date, setDate] = useState<string>(() => todayISO());
  const [status, setStatus] = useState<SyncStatus>("conectando");
  const [lastError, setLastError] = useState<string | null>(null);

  /* --- suscripción en tiempo real --- */
  useEffect(() => {
    if (!firebaseReady || !db) return;
    const unsubs: (() => void)[] = [];

    {
      const catalogRef = doc(db, COL_CATALOGO, DOC_CATALOGO);

      // Si el catálogo todavía no existe en Firestore, se crea una sola vez.
      getDoc(catalogRef)
        .then((snap) => {
          if (!snap.exists()) return setDoc(catalogRef, seedCatalog());
        })
        .catch((err: any) => {
          console.error("No se pudo comprobar el catálogo:", err);
          setStatus("error");
          setLastError(err && err.message ? err.message : String(err));
        });

      unsubs.push(
        onSnapshot(
          catalogRef,
          (snap) => {
            setCatalog(normalizeCatalog(snap.data()));
            setStatus(snap.metadata.fromCache ? "sin-conexion" : "conectado");
          },
          (err: any) => {
            console.error("Error leyendo el catálogo:", err);
            setStatus("error");
            setLastError(err && err.message ? err.message : String(err));
          },
        ),
      );

      unsubs.push(
        onSnapshot(
          collection(db, COL_DIAS),
          (snap) => {
            const next: Record<string, DayData> = {};
            snap.forEach((d) => {
              next[d.id] = normalizeDay(d.data());
            });
            setDays(next);
            setStatus(snap.metadata.fromCache ? "sin-conexion" : "conectado");
          },
          (err: any) => {
            console.error("Error leyendo los días:", err);
            setStatus("error");
            setLastError(err && err.message ? err.message : String(err));
          },
        ),
      );
    }

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, []);

  /* --- escrituras --- */

  const write = useCallback(async (fn: () => Promise<void>) => {
    setStatus("guardando");
    try {
      await fn();
      setStatus("conectado");
      setLastError(null);
    } catch (err: any) {
      const msg = err && err.message ? err.message : String(err);
      console.error("Error guardando en Firestore:", err);
      setStatus("error");
      setLastError(msg);
      window.alert(
        "No se ha podido guardar el cambio. Comprueba la conexión y las reglas de Firestore.\n\n" + msg,
      );
    }
  }, []);

  const saveCatalog = useCallback(
    (patch: Partial<Catalog>) => {
      if (!db) return;
      setCatalog((c) => ({ ...(c || EMPTY_CATALOG), ...patch }));
      write(() => setDoc(doc(db, COL_CATALOGO, DOC_CATALOGO), patch, { merge: true }));
    },
    [write],
  );

  const saveDay = useCallback(
    (iso: string, patch: any) => {
      if (!db) return;
      const conAuditoria = { ...patch, updatedBy: email || "desconocido", updatedAt: new Date().toISOString() };
      write(() => setDoc(doc(db, COL_DIAS, iso), conAuditoria, { merge: true }));
    },
    [write, email],
  );

  const dayOf = useCallback((iso: string): DayData => days[iso] || EMPTY_DAY, [days]);
  const day = dayOf(date);

  const state: PlannerState = useMemo(
    () => ({ version: 2, ...(catalog || EMPTY_CATALOG), days }),
    [catalog, days],
  );

  /** Limpia referencias borradas en todos los días (al eliminar obras, personas o vehículos). */
  const purgeFromDays = useCallback(
    async (touch: (d: DayData) => DayData | null) => {
      if (!db) return;
      const batch = writeBatch(db);
      let count = 0;
      for (const entry of Object.entries(days)) {
        const next = touch(entry[1]);
        if (!next) continue;
        batch.set(doc(db, COL_DIAS, entry[0]), next);
        count++;
        if (count >= 400) break;
      }
      if (count) await batch.commit();
    },
    [days],
  );

  const value: PlannerContextValue = useMemo(() => {
    const cat = catalog || EMPTY_CATALOG;

    return {
      state,
      status,
      lastError,
      date,
      setDate,
      day,
      dayOf,

      setNeed: (workId, category, valueRaw) => {
        const v = Math.max(0, Math.min(999, Math.round(Number(valueRaw) || 0)));
        const forWork: Record<string, number> = {};
        forWork[category] = v;
        const needs: Record<string, any> = {};
        needs[workId] = forWork;
        saveDay(date, { needs });
      },

      assignEmployee: (workId, employeeId) => {
        const list = day.crew[workId] || [];
        if (list.includes(employeeId)) return;
        const crew: Record<string, string[]> = {};
        crew[workId] = list.concat([employeeId]);
        saveDay(date, { crew });
      },

      unassignEmployee: (workId, employeeId) => {
        const list = day.crew[workId] || [];
        const crew: Record<string, string[]> = {};
        crew[workId] = list.filter((id) => id !== employeeId);
        saveDay(date, { crew });
      },

      freeEmployee: (employeeId) => {
        const crew: Record<string, string[]> = {};
        for (const entry of Object.entries(day.crew)) {
          if (entry[1].includes(employeeId)) crew[entry[0]] = entry[1].filter((id) => id !== employeeId);
        }
        if (Object.keys(crew).length) saveDay(date, { crew });
      },

      toggleVehicle: (workId, vehicleId) => {
        const list = day.vehicles[workId] || [];
        const next = list.includes(vehicleId) ? list.filter((id) => id !== vehicleId) : list.concat([vehicleId]);
        const vehicles: Record<string, string[]> = {};
        vehicles[workId] = next;
        saveDay(date, { vehicles });
      },

      setNote: (workId, text) => {
        const notes: Record<string, string> = {};
        notes[workId] = text;
        saveDay(date, { notes });
      },

      copyPreviousDay: () => {
        const prev = days[addDays(date, -1)];
        if (!prev) {
          window.alert("El día anterior está vacío, no hay nada que copiar.");
          return;
        }
        if (!db) return;
        write(() => setDoc(doc(db, COL_DIAS, date), JSON.parse(JSON.stringify(prev))));
      },

      clearDay: () => {
        if (!db) return;
        if (!window.confirm("¿Vaciar toda la planificación del " + date + "?")) return;
        write(() => deleteDoc(doc(db, COL_DIAS, date)));
      },

      addManager: (name) => {
        const clean = name.trim();
        if (!clean) return;
        saveCatalog({ managers: cat.managers.concat([{ id: uid("mg"), name: clean }]) });
      },

      updateManager: (id, patch) => {
        saveCatalog({ managers: cat.managers.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
      },

      removeManager: (id) => {
        saveCatalog({
          managers: cat.managers.filter((m) => m.id !== id),
          works: cat.works.map((w) => (w.managerId === id ? { ...w, managerId: "" } : w)),
        });
      },

      moveManager: (fromId, toId) => {
        if (fromId === toId) return;
        const list = cat.managers.slice();
        const from = list.findIndex((m) => m.id === fromId);
        const to = list.findIndex((m) => m.id === toId);
        if (from < 0 || to < 0) return;
        const moved = list.splice(from, 1)[0];
        list.splice(to, 0, moved);
        saveCatalog({ managers: list });
      },

      addWork: (w) => saveCatalog({ works: cat.works.concat([{ ...w, id: uid("wk") }]) }),

      updateWork: (id, patch) =>
        saveCatalog({ works: cat.works.map((w) => (w.id === id ? { ...w, ...patch } : w)) }),

      removeWork: (id) => {
        saveCatalog({ works: cat.works.filter((w) => w.id !== id) });
        purgeFromDays((d) => {
          if (!d.needs[id] && !d.crew[id] && !d.vehicles[id]) return null;
          const needs = { ...d.needs };
          const crew = { ...d.crew };
          const vehicles = { ...d.vehicles };
          delete needs[id];
          delete crew[id];
          delete vehicles[id];
          return { ...d, needs, crew, vehicles };
        });
      },

      addEmployee: (name, category) => {
        const clean = name.trim();
        if (!clean) return;
        saveCatalog({
          employees: cat.employees.concat([{ id: uid("em"), name: clean, category, active: true }]),
        });
      },

      updateEmployee: (id, patch) =>
        saveCatalog({ employees: cat.employees.map((e) => (e.id === id ? { ...e, ...patch } : e)) }),

      removeEmployee: (id) => {
        saveCatalog({ employees: cat.employees.filter((e) => e.id !== id) });
        purgeFromDays((d) => {
          const affected = Object.values(d.crew).some((list) => list.includes(id));
          if (!affected) return null;
          const crew: Record<string, string[]> = {};
          for (const entry of Object.entries(d.crew)) crew[entry[0]] = entry[1].filter((x) => x !== id);
          return { ...d, crew };
        });
      },

      addVehicle: (plate, description) => {
        const clean = plate.trim();
        if (!clean) return;
        saveCatalog({
          vehicles: cat.vehicles.concat([{ id: uid("vh"), plate: clean, description, active: true }]),
        });
      },

      updateVehicle: (id, patch) =>
        saveCatalog({ vehicles: cat.vehicles.map((v) => (v.id === id ? { ...v, ...patch } : v)) }),

      removeVehicle: (id) => {
        saveCatalog({ vehicles: cat.vehicles.filter((v) => v.id !== id) });
        purgeFromDays((d) => {
          const affected = Object.values(d.vehicles).some((list) => list.includes(id));
          if (!affected) return null;
          const vehicles: Record<string, string[]> = {};
          for (const entry of Object.entries(d.vehicles)) vehicles[entry[0]] = entry[1].filter((x) => x !== id);
          return { ...d, vehicles };
        });
      },

      addAbsence: (a) => {
        if (!a.employeeId || !a.from || !a.to) return;
        const from = a.from <= a.to ? a.from : a.to;
        const to = a.from <= a.to ? a.to : a.from;
        saveCatalog({ absences: cat.absences.concat([{ ...a, from, to, id: uid("ab") }]) });
      },

      removeAbsence: (id) => saveCatalog({ absences: cat.absences.filter((a) => a.id !== id) }),

      absenceOf: (employeeId, isoDate) => {
        const d = isoDate || date;
        return cat.absences.find((a) => a.employeeId === employeeId && a.from <= d && d <= a.to) || null;
      },

      absencesOn: (isoDate) => {
        const out: Record<string, Absence> = {};
        for (const a of cat.absences) {
          if (a.from <= isoDate && isoDate <= a.to) out[a.employeeId] = a;
        }
        return out;
      },

      addFestivoLocal: (fecha, nombre) => {
        if (!fecha || !nombre.trim()) return;
        saveCatalog({ festivosLocales: { ...cat.festivosLocales, [fecha]: nombre.trim() } });
      },

      removeFestivoLocal: (fecha) => {
        if (!db) return;
        const next = { ...cat.festivosLocales };
        delete next[fecha];
        setCatalog((c) => ({ ...(c || EMPTY_CATALOG), festivosLocales: next }));
        // merge no borra claves, así que se elimina el campo explícitamente.
        write(() =>
          updateDoc(doc(db, COL_CATALOGO, DOC_CATALOGO), new FieldPath("festivosLocales", fecha), deleteField()),
        );
      },

      reset: () => {
        if (!db) return;
        write(async () => {
          if (!db) return;
          const batch = writeBatch(db);
          Object.keys(days).forEach((iso) => batch.delete(doc(db, COL_DIAS, iso)));
          batch.set(doc(db, COL_CATALOGO, DOC_CATALOGO), seedCatalog());
          await batch.commit();
        });
      },

      replaceState: (json) => {
        try {
          const parsed = JSON.parse(json);
          if (!parsed || typeof parsed !== "object") return "El archivo no contiene una copia válida.";
          if (!Array.isArray(parsed.works) || !Array.isArray(parsed.employees)) {
            return "El archivo no parece una copia de seguridad de esta aplicación.";
          }
          if (!db) return "Sin conexión con la base de datos.";
          const nextCatalog = normalizeCatalog(parsed);
          const nextDays = parsed.days && typeof parsed.days === "object" ? parsed.days : {};
          write(async () => {
            if (!db) return;
            const batch = writeBatch(db);
            batch.set(doc(db, COL_CATALOGO, DOC_CATALOGO), nextCatalog);
            let n = 0;
            for (const entry of Object.entries(nextDays)) {
              batch.set(doc(db, COL_DIAS, entry[0]), normalizeDay(entry[1]));
              n++;
              if (n >= 400) break;
            }
            await batch.commit();
          });
          return null;
        } catch {
          return "No se pudo leer el archivo: no es un JSON válido.";
        }
      },

      worksOf: (managerId) => cat.works.filter((w) => w.managerId === managerId && w.active),

      needTotal: (workId, iso) => {
        const d = days[iso || date];
        if (!d) return 0;
        return Object.values(d.needs[workId] || {}).reduce((a, b) => a + (Number(b) || 0), 0);
      },
    };
  }, [state, catalog, days, date, day, dayOf, status, lastError, saveCatalog, saveDay, purgeFromDays, write]);

  if (!firebaseReady) return <ConfigMissing />;

  if (!catalog) {
    return (
      <div className="app-shell">
        <div className="wrap" style={{ paddingTop: "4rem" }}>
          <div className="card-surface empty-state">Conectando con la base de datos…</div>
        </div>
      </div>
    );
  }

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
}

function ConfigMissing() {
  return (
    <div className="app-shell">
      <div className="wrap" style={{ paddingTop: "4rem", maxWidth: "42rem" }}>
        <div className="card-surface p-5 stack">
          <h2 className="section-title">Falta la configuración de Firebase</h2>
          <p className="xs muted">
            La aplicación necesita las variables de entorno de Firebase para guardar los datos. En local,
            crea un archivo <code>.env</code> copiando <code>.env.example</code>. En Vercel, añádelas en
            Settings → Environment Variables y vuelve a desplegar.
          </p>
          <pre
            className="xs"
            style={{ background: "var(--muted)", padding: "0.75rem", borderRadius: "8px", overflowX: "auto" }}
          >
            VITE_FIREBASE_API_KEY={"\n"}
            VITE_FIREBASE_AUTH_DOMAIN={"\n"}
            VITE_FIREBASE_PROJECT_ID={"\n"}
            VITE_FIREBASE_STORAGE_BUCKET={"\n"}
            VITE_FIREBASE_MESSAGING_SENDER_ID={"\n"}
            VITE_FIREBASE_APP_ID=
          </pre>
        </div>
      </div>
    </div>
  );
}

export function usePlanner(): PlannerContextValue {
  const ctx = useContext(PlannerContext);
  if (!ctx) throw new Error("usePlanner debe usarse dentro de <PlannerProvider>");
  return ctx;
}
