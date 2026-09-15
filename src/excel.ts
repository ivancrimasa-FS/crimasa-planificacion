import { addDays, fromISO } from "./store";
import type { PlannerState } from "./types";

let XLSX_MOD: any = null;

function autoWidth(rows: any[][]): { wch: number }[] {
  if (!rows.length) return [];
  const cols = rows[0].length;
  const widths: number[] = new Array(cols).fill(10);
  for (const row of rows) {
    row.forEach((cell, i) => {
      const len = String(cell ?? "").length + 2;
      if (len > widths[i]) widths[i] = Math.min(len, 55);
    });
  }
  return widths.map((wch) => ({ wch }));
}

function sheet(rows: any[][]): any {
  const XLSX = XLSX_MOD!;
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = autoWidth(rows);
  if (rows.length > 1) ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: rows[0].length - 1 } }) };
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  return ws;
}

function weekday(iso: string): string {
  return fromISO(iso).toLocaleDateString("es-ES", { weekday: "long" });
}

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard < 1000) {
    out.push(cur);
    cur = addDays(cur, 1);
    guard++;
  }
  return out;
}

/**
 * Genera y descarga el Excel con toda la planificación del rango indicado.
 * Devuelve el nombre del archivo generado.
 */
export async function exportToExcel(state: PlannerState, from: string, to: string): Promise<string> {
  const XLSX = await import("xlsx");
  XLSX_MOD = XLSX;
  const wb = XLSX.utils.book_new();
  const managerName = (id: string) => state.managers.find((m) => m.id === id)?.name || "(sin jefe)";
  const workById = (id: string) => state.works.find((w) => w.id === id);
  const employeeById = (id: string) => state.employees.find((e) => e.id === id);
  const vehicleById = (id: string) => state.vehicles.find((v) => v.id === id);

  const dates = datesBetween(from, to);

  /* --- Hoja 1: reparto por nombre --- */
  const crewRows: any[][] = [
    ["Fecha", "Día", "Jefe de obra", "Código", "Obra", "Expediente", "Trabajador", "Categoría"],
  ];
  /* --- Hoja 2: asignación diaria (números por categoría) --- */
  const needRows: any[][] = [
    ["Fecha", "Día", "Jefe de obra", "Código", "Obra", "Categoría", "Personas"],
  ];
  /* --- Hoja 3: vehículos --- */
  const vehRows: any[][] = [["Fecha", "Código", "Obra", "Matrícula", "Descripción"]];
  /* --- Hoja 4: resumen diario por obra --- */
  const summaryRows: any[][] = [
    ["Fecha", "Día", "Jefe de obra", "Código", "Obra", "Previstas", "Asignadas", "Diferencia", "Nota"],
  ];

  for (const iso of dates) {
    const d = state.days[iso];
    if (!d) continue;
    const dayName = weekday(iso);

    for (const work of state.works) {
      const crew = d.crew?.[work.id] || [];
      const needs = d.needs?.[work.id] || {};
      const vehs = d.vehicles?.[work.id] || [];
      const note = d.notes?.[work.id] || "";
      const previstas = Object.values(needs).reduce((a, b) => a + (Number(b) || 0), 0);

      for (const empId of crew) {
        const e = employeeById(empId);
        crewRows.push([
          iso,
          dayName,
          managerName(work.managerId),
          work.code,
          work.name,
          work.expediente,
          e?.name || "(eliminado)",
          e?.category || "",
        ]);
      }

      for (const [cat, n] of Object.entries(needs)) {
        if (!n) continue;
        needRows.push([iso, dayName, managerName(work.managerId), work.code, work.name, cat, n]);
      }

      for (const vid of vehs) {
        const v = vehicleById(vid);
        vehRows.push([iso, work.code, work.name, v?.plate || "(eliminado)", v?.description || ""]);
      }

      if (previstas || crew.length || note) {
        summaryRows.push([
          iso,
          dayName,
          managerName(work.managerId),
          work.code,
          work.name,
          previstas,
          crew.length,
          crew.length - previstas,
          note,
        ]);
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, sheet(summaryRows), "Resumen diario");
  XLSX.utils.book_append_sheet(wb, sheet(crewRows), "Reparto por nombre");
  XLSX.utils.book_append_sheet(wb, sheet(needRows), "Asignación diaria");
  XLSX.utils.book_append_sheet(wb, sheet(vehRows), "Vehículos");

  /* --- Fichas maestras --- */
  const worksRows: any[][] = [["Código", "Obra", "Expediente", "Jefe de obra", "Estado"]];
  for (const w of state.works) {
    worksRows.push([w.code, w.name, w.expediente, managerName(w.managerId), w.active ? "Activa" : "Cerrada"]);
  }
  XLSX.utils.book_append_sheet(wb, sheet(worksRows), "Obras");

  const empRows: any[][] = [["Trabajador", "Categoría", "Estado"]];
  for (const e of state.employees) empRows.push([e.name, e.category, e.active ? "Activo" : "Baja"]);
  XLSX.utils.book_append_sheet(wb, sheet(empRows), "Empleados");

  const vhRows: any[][] = [["Matrícula", "Descripción", "Estado"]];
  for (const v of state.vehicles) vhRows.push([v.plate, v.description, v.active ? "Activo" : "Baja"]);
  XLSX.utils.book_append_sheet(wb, sheet(vhRows), "Vehículos (ficha)");

  const fileName = `CRIMASA_Planificacion_${from}_a_${to}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return fileName;
}

/** Exporta una matriz obras × días con el total de personas asignadas (vista tipo cuadrante). */
export async function exportGrid(state: PlannerState, from: string, to: string): Promise<string> {
  const XLSX = await import("xlsx");
  XLSX_MOD = XLSX;
  const dates = datesBetween(from, to);
  const managerName = (id: string) => state.managers.find((m) => m.id === id)?.name || "";
  const header = ["Jefe de obra", "Código", "Obra", ...dates, "Total"];
  const rows: any[][] = [header];

  for (const w of state.works) {
    const cells = dates.map((iso) => (state.days[iso]?.crew?.[w.id] || []).length);
    const total = cells.reduce((a, b) => a + b, 0);
    rows.push([managerName(w.managerId), w.code, w.name, ...cells, total]);
  }
  const totals = dates.map((iso) => {
    const d = state.days[iso];
    if (!d) return 0;
    return Object.values(d.crew || {}).reduce((a, list) => a + list.length, 0);
  });
  rows.push(["", "", "TOTAL", ...totals, totals.reduce((a, b) => a + b, 0)]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet(rows), "Cuadrante");
  const fileName = `CRIMASA_Cuadrante_${from}_a_${to}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return fileName;
}
