/**
 * Festivos nacionales de España y de Andalucía, calculados para cualquier año.
 * Los festivos locales de cada municipio se añaden a mano desde la app.
 */

/** Domingo de Pascua por el algoritmo de Meeus/Butcher. */
function pascua(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, mes - 1, dia);
}

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function sumar(d: Date, dias: number): Date {
  const out = new Date(d.getTime());
  out.setDate(out.getDate() + dias);
  return out;
}

/** Devuelve { "2026-01-01": "Año Nuevo", ... } para el año pedido. */
export function festivosDe(year: number): Record<string, string> {
  const p = pascua(year);
  const out: Record<string, string> = {
    [year + "-01-01"]: "Año Nuevo",
    [year + "-01-06"]: "Reyes",
    [year + "-02-28"]: "Día de Andalucía",
    [year + "-05-01"]: "Fiesta del Trabajo",
    [year + "-08-15"]: "Asunción de la Virgen",
    [year + "-10-12"]: "Fiesta Nacional",
    [year + "-11-01"]: "Todos los Santos",
    [year + "-12-06"]: "Día de la Constitución",
    [year + "-12-08"]: "Inmaculada Concepción",
    [year + "-12-25"]: "Navidad",
  };
  out[iso(sumar(p, -3))] = "Jueves Santo";
  out[iso(sumar(p, -2))] = "Viernes Santo";
  return out;
}

/** Comprueba una fecha concreta contra los festivos calculados y los locales guardados. */
export function nombreFestivo(fecha: string, locales: Record<string, string> = {}): string | null {
  if (locales[fecha]) return locales[fecha];
  const year = Number(fecha.slice(0, 4));
  if (!year) return null;
  return festivosDe(year)[fecha] || null;
}

export function esFinDeSemana(fecha: string): boolean {
  const [y, m, d] = fecha.split("-").map(Number);
  const dow = new Date(y, (m || 1) - 1, d || 1).getDay();
  return dow === 0 || dow === 6;
}
