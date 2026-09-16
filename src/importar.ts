/**
 * Lectura de los Excel de CRIMASA para la primera carga.
 *
 * Reconoce dos libros distintos:
 *   - PLANIFICACIÓN_ANUAL_CRIMASA.xlsx → hoja PREVISION (previsión por categoría) y PERSONAL.
 *   - PERSONAL_CRIMASA_2026.xlsm       → hojas SEMANAxx (reparto por nombre), PERSONAL,
 *                                        DATOS VEHICULOS y ACTIVAS.
 *
 * No escribe nada: devuelve lo leído y una lista de avisos para revisar antes de importar.
 */

import type { Absence, DayData, Employee, Manager, Shift, Vehicle, Work } from "./types";

export interface Importado {
  origen: string;
  managers: Manager[];
  works: Work[];
  employees: Employee[];
  vehicles: Vehicle[];
  absences: Absence[];
  days: Record<string, DayData>;
  avisos: string[];
  resumen: string[];
}

/** Categorías del Excel agrupadas a las que usa la aplicación (ST y BAL se unifican). */
const MAPA_CATEGORIAS: Record<string, string> = {
  "ENCARGADO ST": "Encargado",
  "ENCARGADO BAL": "Encargado",
  "OFICIAL 1º ST": "Oficial de 1ª",
  "OFICIAL 1º BAL": "Oficial de 1ª",
  "OFICIAL 2º ST": "Oficial de 2ª",
  "OFICIAL 2º BAL": "Oficial de 2ª",
  "OFICIAL 3º": "Oficial de 3ª",
  "SUBCONTRATA 1": "Subcontrata",
  SUBCONTRATA: "Subcontrata",
};

/** Filas de la previsión que no son categorías de personal. */
const FILAS_IGNORADAS = new Set(["TRABAJOS", "VEHICULOS", "TOTAL"]);

export const CATEGORIAS_CRIMASA = [
  "Encargado",
  "Oficial de 1ª",
  "Oficial de 2ª",
  "Oficial de 3ª",
  "Subcontrata",
];

function normalizarCategoria(texto: string): string {
  const limpio = String(texto || "").trim();
  const directo = MAPA_CATEGORIAS[limpio.toUpperCase()];
  if (directo) return directo;
  const bajo = limpio.toLowerCase();
  if (bajo.startsWith("encargado")) return "Encargado";
  if (bajo.includes("1ª") || bajo.includes("1º")) return "Oficial de 1ª";
  if (bajo.includes("2ª") || bajo.includes("2º")) return "Oficial de 2ª";
  if (bajo.includes("3ª") || bajo.includes("3º")) return "Oficial de 3ª";
  if (bajo.includes("subcontrata")) return "Subcontrata";
  return limpio || "Oficial de 3ª";
}

function iso(v: any): string | null {
  if (!v) return null;
  // Solo fechas de verdad: en estas hojas hay números sueltos (46280) que
  // new Date() interpretaría como 1970 y estropearían toda la semana.
  let d: Date;
  if (v instanceof Date) d = v;
  else if (typeof v === "string" && /\d{4}/.test(v)) d = new Date(v);
  else return null;
  if (isNaN(d.getTime())) return null;
  if (d.getFullYear() < 2000 || d.getFullYear() > 2100) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function slug(prefijo: string, texto: string): string {
  const base = String(texto)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return prefijo + "_" + (base || Math.random().toString(36).slice(2, 8));
}

/** "ÁLVARO Nº12" → "ÁLVARO" */
function nombreJefe(texto: string): string {
  return String(texto).replace(/\s*N[ºo°]\s*\d+\s*$/i, "").trim();
}

/**
 * "AEN_26_134 SVQ-31/2026 SUSTITUCIÓN CAJAS BASE" → código, expediente y título.
 * Tolera filas sin expediente o con el título pegado al código.
 */
function partirObra(texto: string): { code: string; expediente: string; name: string } | null {
  const limpio = String(texto || "").trim().replace(/\s+/g, " ");
  if (!limpio || /^[-\s]+$/.test(limpio)) return null;
  const partes = limpio.split(" ");
  const code = partes[0];
  if (!/^[A-Za-zÁÉÍÓÚÑ]{2,5}_\d{2}_\d{2,4}/.test(code)) {
    // No tiene el formato habitual de código: se guarda entero como título.
    return { code: limpio.slice(0, 20), expediente: "", name: limpio };
  }
  let expediente = "";
  let resto = partes.slice(1);
  if (resto.length > 1 && /[\d/–-]/.test(resto[0]) && resto[0].length <= 14) {
    expediente = resto[0];
    resto = resto.slice(1);
  }
  return { code, expediente, name: resto.join(" ") || limpio };
}

function diaAnterior(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const prev = new Date(y, m - 1, d - 1);
  return iso(prev)!;
}

function vacio(): DayData {
  return { needs: {}, crew: {}, vehicles: {}, notes: {}, shifts: {} };
}

/* ------------------------------------------------------------------ */

export async function leerExcel(file: File): Promise<Importado> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { cellDates: true });
  const hojas = wb.SheetNames;

  const out: Importado = {
    origen: file.name,
    managers: [],
    works: [],
    employees: [],
    vehicles: [],
    absences: [],
    days: {},
    avisos: [],
    resumen: [],
  };

  const aoa = (nombre: string): any[][] =>
    XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, raw: false, blankrows: true, defval: null }) as any[][];

  const aoaFechas = (nombre: string): any[][] =>
    XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, raw: true, blankrows: true, defval: null }) as any[][];

  if (hojas.includes("PREVISION")) {
    leerPrevision(aoaFechas("PREVISION"), out);
  }
  if (hojas.includes("ACTIVAS")) {
    leerActivas(aoa("ACTIVAS"), out);
  }
  if (hojas.includes("DATOS VEHICULOS")) {
    leerVehiculos(aoa("DATOS VEHICULOS"), out);
  }
  if (hojas.includes("PERSONAL")) {
    leerPersonal(aoa("PERSONAL"), out);
  }

  const semanas = hojas.filter((h) => /^SEMANA\s*\d+\./i.test(h));
  if (semanas.length) {
    for (const nombre of semanas) leerSemana(aoaFechas(nombre), nombre, out);
    out.resumen.push(semanas.length + " hojas de reparto semanal leídas");
  }

  if (!out.works.length && !out.employees.length && !Object.keys(out.days).length) {
    out.avisos.push(
      "No he reconocido ninguna hoja conocida en este archivo. Se esperaba PREVISION, PERSONAL, ACTIVAS, DATOS VEHICULOS o SEMANAxx.",
    );
  }

  out.resumen.unshift(
    out.managers.length +
      " jefes de obra · " +
      out.works.length +
      " obras · " +
      out.employees.length +
      " trabajadores · " +
      out.vehicles.length +
      " vehículos · " +
      Object.keys(out.days).length +
      " días con datos",
  );

  return out;
}

/* ---------------------------- PREVISION ---------------------------- */

function leerPrevision(filas: any[][], out: Importado) {
  const fechas: Record<number, string> = {};
  const filaFechas = filas[4] || [];
  for (let c = 3; c < filaFechas.length; c++) {
    const f = iso(filaFechas[c]);
    if (f) fechas[c] = f;
  }
  if (!Object.keys(fechas).length) {
    out.avisos.push("En PREVISION no he encontrado la fila de fechas (se esperaba en la fila 5).");
    return;
  }

  const jefes = new Map<string, Manager>();
  let obraActual: Work | null = null;
  let celdas = 0;
  let sinTitulo = 0;

  for (let r = 5; r < filas.length; r++) {
    const fila = filas[r] || [];
    const colJefe = fila[0] ? String(fila[0]).trim() : "";
    const colObra = fila[1] ? String(fila[1]).trim() : "";
    const colCat = fila[2] ? String(fila[2]).trim() : "";

    if (colJefe === "TOTAL" || colJefe.startsWith("NUMERO TOTAL")) break;

    // Cabecera de un bloque de obra
    if (colJefe && colCat.toUpperCase() === "TRABAJOS") {
      const nombre = nombreJefe(colJefe);
      if (!jefes.has(nombre)) jefes.set(nombre, { id: slug("mg", nombre), name: nombre });
      const partes = partirObra(colObra);
      if (!partes) {
        obraActual = null;
        sinTitulo++;
        continue;
      }
      const existente = out.works.find((w) => w.code === partes.code);
      if (existente) {
        obraActual = existente;
      } else {
        obraActual = {
          id: slug("wk", partes.code),
          code: partes.code,
          name: partes.name,
          expediente: partes.expediente,
          managerId: jefes.get(nombre)!.id,
          active: true,
        };
        out.works.push(obraActual);
      }
      continue;
    }

    if (!obraActual || !colCat) continue;
    if (FILAS_IGNORADAS.has(colCat.toUpperCase())) continue;

    const categoria = normalizarCategoria(colCat);
    for (const c of Object.keys(fechas)) {
      const col = Number(c);
      const valor = Number(fila[col]);
      if (!valor) continue;
      const f = fechas[col];
      const dia = (out.days[f] = out.days[f] || vacio());
      dia.needs[obraActual.id] = dia.needs[obraActual.id] || {};
      // ST y BAL se suman en la misma categoría.
      dia.needs[obraActual.id][categoria] = (dia.needs[obraActual.id][categoria] || 0) + valor;
      celdas++;
    }
  }

  out.managers.push(...jefes.values());
  out.resumen.push("PREVISION: " + celdas + " celdas de previsión importadas");
  if (sinTitulo) out.resumen.push("PREVISION: " + sinTitulo + " bloques de obra vacíos descartados");
}

/* ----------------------------- ACTIVAS ----------------------------- */

function leerActivas(filas: any[][], out: Importado) {
  let cabecera = -1;
  for (let r = 0; r < Math.min(filas.length, 10); r++) {
    const fila = filas[r] || [];
    if (String(fila[0] || "").trim().toLowerCase() === "obra") {
      cabecera = r;
      break;
    }
  }
  if (cabecera < 0) return;

  let nuevas = 0;
  let completadas = 0;
  for (let r = cabecera + 1; r < filas.length; r++) {
    const fila = filas[r] || [];
    const code = String(fila[0] || "").trim();
    if (!code) continue;
    const cliente = String(fila[1] || "").trim();
    const titulo = String(fila[2] || "").trim();
    const existente = out.works.find((w) => w.code === code);
    if (existente) {
      if (!existente.name || existente.name === existente.code) existente.name = titulo;
      if (cliente) existente.client = cliente;
      completadas++;
    } else {
      out.works.push({
        id: slug("wk", code),
        code,
        name: titulo || code,
        expediente: "",
        client: cliente,
        managerId: "",
        active: true,
      });
      nuevas++;
    }
  }
  out.resumen.push("ACTIVAS: " + nuevas + " obras nuevas, " + completadas + " completadas con cliente y título");
}

/* -------------------------- DATOS VEHICULOS ------------------------ */

function leerVehiculos(filas: any[][], out: Importado) {
  for (let r = 1; r < filas.length; r++) {
    const fila = filas[r] || [];
    const plate = String(fila[0] || "").trim().toUpperCase();
    if (!plate || plate === "MATRÍCULA") continue;
    const normal = plate.replace(/\s+/g, "");
    if (out.vehicles.some((v) => v.plate.replace(/\s+/g, "") === normal)) continue;
    const modelo = String(fila[1] || "").trim();
    const obs = String(fila[3] || "").trim();
    out.vehicles.push({
      id: slug("vh", normal),
      plate: normal,
      description: [modelo, obs].filter((x) => x && x !== " ").join(" · "),
      active: true,
    });
  }
  out.resumen.push("DATOS VEHICULOS: " + out.vehicles.length + " vehículos");
}

/* ----------------------------- PERSONAL ---------------------------- */

function leerPersonal(filas: any[][], out: Importado) {
  let colNombre = -1;
  let colCat = -1;
  let colOk = -1;
  let cabecera = -1;

  for (let r = 0; r < Math.min(filas.length, 8); r++) {
    const fila = (filas[r] || []).map((v) => String(v || "").trim().toLowerCase());
    const iNombre = fila.findIndex((v) => v.includes("nombre"));
    if (iNombre >= 0) {
      cabecera = r;
      colNombre = iNombre;
      colCat = fila.findIndex((v) => v.startsWith("categor"));
      colOk = fila.findIndex((v) => v === "ok");
      break;
    }
  }
  if (cabecera < 0) return;

  let nuevos = 0;
  for (let r = cabecera + 1; r < filas.length; r++) {
    const fila = filas[r] || [];
    const nombre = String(fila[colNombre] || "").trim();
    if (!nombre || nombre.length < 4) continue;
    if (out.employees.some((e) => e.name.toLowerCase() === nombre.toLowerCase())) continue;
    const activo = colOk >= 0 ? String(fila[colOk] || "").trim() !== "0" : true;
    out.employees.push({
      id: slug("em", nombre),
      name: nombre,
      category: normalizarCategoria(colCat >= 0 ? fila[colCat] : ""),
      active: activo,
    });
    nuevos++;
  }
  out.resumen.push("PERSONAL: " + nuevos + " trabajadores");
}

/* ------------------------- SEMANAS (reparto) ----------------------- */

const AUSENCIAS_TEXTO: Record<string, string> = {
  BAJA: "Baja",
  VACACIONES: "Vacaciones",
  CURSO: "Curso",
  PERMISO: "Permiso",
};

const DIAS_SEMANA = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"];

function sinTildes(v: any): string {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

/**
 * Las hojas de semana no tienen siempre las mismas columnas (unas llevan 25 y
 * otras 27), así que el bloque de cada día se localiza por su cabecera y dentro
 * del bloque se buscan PROYECTO / PERIODO / VEHICULO / DIETA por nombre.
 */
function mapaColumnas(filas: any[][]): {
  filaDatos: number;
  colNombre: number;
  bloques: { proyecto: number; periodo: number; vehiculo: number; dieta: number }[];
} | null {
  for (let r = 0; r < Math.min(filas.length, 12); r++) {
    const fila = filas[r] || [];
    const inicios: number[] = [];
    for (let c = 0; c < fila.length; c++) {
      if (DIAS_SEMANA.includes(sinTildes(fila[c]))) inicios.push(c);
    }
    if (inicios.length < 5) continue;

    const colNombre = fila.findIndex((v) => sinTildes(v) === "NOMBRE");
    const sub = filas[r + 1] || [];
    const bloques = inicios.slice(0, 7).map((inicio, i) => {
      const fin = i + 1 < inicios.length ? inicios[i + 1] : inicio + 5;
      const buscar = (etiqueta: string, pordefecto: number) => {
        for (let c = inicio; c < Math.min(fin, sub.length); c++) {
          if (sinTildes(sub[c]).startsWith(etiqueta)) return c;
        }
        return pordefecto;
      };
      return {
        proyecto: buscar("PROYECTO", inicio),
        periodo: buscar("PERIODO", inicio + 1),
        vehiculo: buscar("VEHICULO", inicio + 2),
        dieta: buscar("DIETA", inicio + 3),
      };
    });

    return { filaDatos: r + 2, colNombre: colNombre >= 0 ? colNombre : 2, bloques };
  }
  return null;
}

function leerSemana(filas: any[][], nombreHoja: string, out: Importado) {
  // Fecha de inicio: fila 2, tras la etiqueta DEL
  let inicio: string | null = null;
  for (let r = 0; r < Math.min(filas.length, 5); r++) {
    for (const v of filas[r] || []) {
      const f = iso(v);
      if (f) {
        inicio = f;
        break;
      }
    }
    if (inicio) break;
  }
  if (!inicio) {
    out.avisos.push(nombreHoja + ": no he encontrado la fecha de inicio de la semana, se omite.");
    return;
  }

  const fechas: string[] = [];
  const base = new Date(inicio);
  for (let i = 0; i < 7; i++) {
    const d = new Date(base.getTime());
    d.setDate(d.getDate() + i);
    fechas.push(iso(d)!);
  }

  const buscaEmpleado = (nombre: string): Employee | null => {
    const limpio = nombre.trim().toLowerCase();
    return (
      out.employees.find((e) => e.name.toLowerCase() === limpio) ||
      out.employees.find((e) => e.name.toLowerCase().startsWith(limpio.split(" ")[0])) ||
      null
    );
  };

  const buscaObra = (code: string): Work | null => {
    const limpio = code.trim().toUpperCase();
    return out.works.find((w) => w.code.toUpperCase() === limpio) || null;
  };

  const mapa = mapaColumnas(filas);
  if (!mapa) {
    out.avisos.push(nombreHoja + ": no he reconocido la cabecera de días, se omite.");
    return;
  }

  const sinObra = new Set<string>();
  const creadas = new Set<string>();

  for (let r = mapa.filaDatos; r < filas.length; r++) {
    const fila = filas[r] || [];
    const nombre = String(fila[mapa.colNombre] || "").trim();
    if (!nombre || nombre.toUpperCase().includes("PERSONAL MAC")) continue;
    if (nombre.toUpperCase().includes("JEFES DE PRODUCCION")) break;
    const emp = buscaEmpleado(nombre);
    if (!emp) continue;

    for (let d = 0; d < mapa.bloques.length; d++) {
      const bloque = mapa.bloques[d];
      const proyecto = String(fila[bloque.proyecto] || "").trim();
      if (!proyecto) continue;
      const fecha = fechas[d];

      const tipoAusencia = AUSENCIAS_TEXTO[proyecto.toUpperCase()];
      if (tipoAusencia) {
        // Si el día anterior ya tenía la misma ausencia, se alarga el tramo
        // en vez de crear una ficha por cada día.
        const ayer = diaAnterior(fecha);
        const previa = out.absences.find(
          (a) => a.employeeId === emp.id && a.type === (tipoAusencia as any) && a.to === ayer,
        );
        if (previa) previa.to = fecha;
        else
          out.absences.push({
            id: slug("ab", emp.id + fecha),
            employeeId: emp.id,
            from: fecha,
            to: fecha,
            type: tipoAusencia as any,
          });
        continue;
      }

      let obra = buscaObra(proyecto);
      if (!obra) {
        // Si tiene pinta de código de obra, se crea para no perder el reparto.
        if (/^[A-Za-zÁÉÍÓÚÑ]{2,6}[_-]/.test(proyecto)) {
          obra = {
            id: slug("wk", proyecto),
            code: proyecto,
            name: proyecto,
            expediente: "",
            managerId: "",
            active: true,
          };
          out.works.push(obra);
          creadas.add(proyecto);
        } else {
          sinObra.add(proyecto);
          continue;
        }
      }

      const periodo = String(fila[bloque.periodo] || "").trim().toUpperCase();
      const vehiculo = String(fila[bloque.vehiculo] || "").trim();
      const dietaCelda = fila[bloque.dieta];
      const dieta = dietaCelda === true || String(dietaCelda).toUpperCase() === "TRUE" || String(dietaCelda).toUpperCase() === "VERDADERO";
      const turno = periodo === "NOCHE" ? "NOCHE" : "DIA";

      const dia = (out.days[fecha] = out.days[fecha] || vacio());
      dia.crew[obra.id] = dia.crew[obra.id] || [];
      if (!dia.crew[obra.id].includes(emp.id)) dia.crew[obra.id].push(emp.id);
      dia.shifts = dia.shifts || {};
      dia.shifts[obra.id] = dia.shifts[obra.id] || {};
      dia.shifts[obra.id][emp.id] = { turno, dieta } as Shift;

      if (vehiculo) {
        const m = vehiculo.match(/^([A-Z0-9\s]+?)\s*\((DIA|DÍA|NOCHE)\)$/i);
        const matricula = (m ? m[1] : vehiculo).replace(/\s+/g, "").toUpperCase();
        const turnoVeh = m && /NOCHE/i.test(m[2]) ? "NOCHE" : "DIA";
        const v = out.vehicles.find((x) => x.plate.replace(/\s+/g, "") === matricula);
        if (v) {
          const key = v.id + "::" + turnoVeh;
          dia.vehicles[obra.id] = dia.vehicles[obra.id] || [];
          if (!dia.vehicles[obra.id].includes(key)) dia.vehicles[obra.id].push(key);
        }
      }
    }
  }

  if (creadas.size) {
    out.resumen.push(nombreHoja + ": " + creadas.size + " obras creadas desde el reparto (no estaban en ACTIVAS)");
  }
  if (sinObra.size) {
    out.avisos.push(
      nombreHoja +
        ": " +
        sinObra.size +
        " valores de la columna de proyecto que no he sabido interpretar (" +
        Array.from(sinObra).slice(0, 5).join(", ") +
        (sinObra.size > 5 ? "…" : "") +
        ").",
    );
  }
}
