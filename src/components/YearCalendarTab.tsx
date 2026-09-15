import { useMemo, useState } from "react";
import { fromISO, toISO, todayISO, usePlanner } from "../store";

const DOW = ["L", "M", "X", "J", "V", "S", "D"];
const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

type Source = "crew" | "needs";

export function YearCalendarTab() {
  const { state, date, setDate } = usePlanner();
  const [year, setYear] = useState<number>(() => fromISO(date).getFullYear());
  const [workId, setWorkId] = useState<string>("");
  const [source, setSource] = useState<Source>("crew");

  const totals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [iso, d] of Object.entries(state.days)) {
      if (!iso.startsWith(String(year))) continue;
      let n = 0;
      if (source === "crew") {
        for (const [wid, list] of Object.entries(d.crew || {})) {
          if (workId && wid !== workId) continue;
          n += list.length;
        }
      } else {
        for (const [wid, byCat] of Object.entries(d.needs || {})) {
          if (workId && wid !== workId) continue;
          n += Object.values(byCat).reduce((a, b) => a + (Number(b) || 0), 0);
        }
      }
      out[iso] = n;
    }
    return out;
  }, [state.days, year, workId, source]);

  const max = Math.max(1, ...Object.values(totals));
  const today = todayISO();

  const yearTotal = Object.values(totals).reduce((a, b) => a + b, 0);
  const activeDays = Object.values(totals).filter((n) => n > 0).length;

  return (
    <div className="stack">
      <div className="card-surface p-5 stack" style={{ gap: "0.75rem" }}>
        <div>
          <h2 className="section-title">Previsión anual</h2>
          <p className="section-help">
            Carga de personal día a día. Haz clic en un día para abrirlo en el resto de pestañas.
          </p>
        </div>
        <div className="row">
          <select className="select" style={{ width: "auto" }} value={year} onChange={(ev) => setYear(Number(ev.target.value))}>
            {yearsAround(fromISO(date).getFullYear()).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select className="select" style={{ width: "auto" }} value={workId} onChange={(ev) => setWorkId(ev.target.value)}>
            <option value="">Todas las obras</option>
            {state.works.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} · {w.name}
              </option>
            ))}
          </select>
          <select
            className="select"
            style={{ width: "auto" }}
            value={source}
            onChange={(ev) => setSource(ev.target.value as Source)}
          >
            <option value="crew">Personas con nombre</option>
            <option value="needs">Personas previstas</option>
          </select>
          <span className="xs muted">
            {yearTotal} personas-día en {activeDays} días planificados
          </span>
        </div>
      </div>

      <div className="year-grid">
        {MONTHS.map((label, mi) => (
          <div key={label} className="card-surface month">
            <h3>{label}</h3>
            <div className="month-grid">
              {DOW.map((d, i) => (
                <div key={i} className="dow">
                  {d}
                </div>
              ))}
              {monthCells(year, mi).map((cell, i) => {
                if (!cell) return <div key={`e${i}`} />;
                const iso = toISO(cell);
                const n = totals[iso] || 0;
                const dow = (cell.getDay() + 6) % 7;
                const intensity = n ? 0.15 + (n / max) * 0.65 : 0;
                return (
                  <button
                    key={iso}
                    className="day"
                    data-weekend={dow >= 5 ? "true" : "false"}
                    data-today={iso === today ? "true" : "false"}
                    data-selected={iso === date ? "true" : "false"}
                    title={`${iso} · ${n} personas`}
                    style={n ? { background: `color-mix(in oklab, var(--gold) ${Math.round(intensity * 100)}%, var(--card))` } : undefined}
                    onClick={() => setDate(iso)}
                  >
                    {n || cell.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="xs muted">
        En los días con planificación se muestra el número de personas; en el resto, el número del día.
      </p>
    </div>
  );
}

function yearsAround(y: number): number[] {
  const out: number[] = [];
  for (let i = y - 3; i <= y + 3; i++) out.push(i);
  return out;
}

function monthCells(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  return cells;
}
