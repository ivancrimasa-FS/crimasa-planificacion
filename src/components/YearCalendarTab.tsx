import { useMemo, useState } from "react";
import { fromISO, toISO, todayISO, usePlanner } from "../store";
import { festivosDe } from "../festivos";

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
  const { state, date, setDate, addFestivoLocal, removeFestivoLocal } = usePlanner();
  const [hover, setHover] = useState<{ iso: string; x: number; y: number } | null>(null);
  const [consultaTipo, setConsultaTipo] = useState<"mes" | "dia">("mes");
  const [consultaMes, setConsultaMes] = useState(0);
  const [consultaDia, setConsultaDia] = useState(date);
  const [nuevoFestivo, setNuevoFestivo] = useState("");
  const [nombreFestivoLocal, setNombreFestivoLocal] = useState("");
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

  const festivos = useMemo(() => {
    return { ...festivosDe(year), ...state.festivosLocales };
  }, [year, state.festivosLocales]);

  const festivosDelAnio = useMemo(
    () =>
      Object.entries(festivos)
        .filter(([iso]) => iso.startsWith(String(year)))
        .sort((a, b) => a[0].localeCompare(b[0])),
    [festivos, year],
  );

  /** Desglose por obra de un día: [{obra, jefe, n}] */
  const detalleDe = (isoDia: string) => {
    const d = state.days[isoDia];
    if (!d) return [];
    const out: { code: string; name: string; manager: string; n: number }[] = [];
    for (const w of state.works) {
      if (workId && w.id !== workId) continue;
      const n =
        source === "crew"
          ? (d.crew?.[w.id] || []).length
          : Object.values(d.needs?.[w.id] || {}).reduce((a, b) => a + (Number(b) || 0), 0);
      if (!n) continue;
      out.push({
        code: w.code,
        name: w.name,
        manager: state.managers.find((m) => m.id === w.managerId)?.name || "Sin jefe",
        n,
      });
    }
    return out.sort((a, b) => b.n - a.n);
  };

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
                const nombreF = festivos[iso];
                return (
                  <button
                    key={iso}
                    className="day"
                    data-planificado={n ? "true" : "false"}
                    onMouseEnter={(ev) => {
                      if (!n) return;
                      const r = (ev.target as HTMLElement).getBoundingClientRect();
                      setHover({ iso, x: r.left + r.width / 2, y: r.top });
                    }}
                    onMouseLeave={() => setHover((h) => (h && h.iso === iso ? null : h))}
                    data-weekend={dow >= 5 ? "true" : "false"}
                    data-festivo={nombreF ? "true" : "false"}
                    data-today={iso === today ? "true" : "false"}
                    data-selected={iso === date ? "true" : "false"}
                    title={iso + " · " + n + " personas" + (nombreF ? " · " + nombreF : "")}
                    style={n ? { background: `color-mix(in oklab, var(--gold) ${Math.round(intensity * 100)}%, var(--card))` } : undefined}
                    onClick={() => setDate(iso)}
                  >
                    {cell.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="card-surface month consulta">
          <h3 style={{ textTransform: "none" }}>Consultar previsión</h3>
          <div className="seg" style={{ marginBottom: "0.5rem" }}>
            <button className="seg-btn" data-active={consultaTipo === "mes" ? "true" : "false"} onClick={() => setConsultaTipo("mes")}>
              Mes
            </button>
            <button className="seg-btn" data-active={consultaTipo === "dia" ? "true" : "false"} onClick={() => setConsultaTipo("dia")}>
              Día
            </button>
          </div>

          {consultaTipo === "mes" ? (
            <select className="select" value={consultaMes} onChange={(ev) => setConsultaMes(Number(ev.target.value))}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <input className="input" type="date" value={consultaDia} onChange={(ev) => setConsultaDia(ev.target.value)} />
          )}

          <div className="consulta-body">
            {consultaTipo === "dia" ? (
              (() => {
                const filas = detalleDe(consultaDia);
                const total = filas.reduce((a, f) => a + f.n, 0);
                if (!filas.length) return <p className="xs muted">Sin previsión ese día.</p>;
                return (
                  <>
                    <p className="xs">
                      <strong className="nums">{total}</strong> personas el {consultaDia}
                    </p>
                    <ul className="consulta-list">
                      {filas.map((f) => (
                        <li key={f.code}>
                          <span className="mono">{f.code}</span> · {f.name} — <strong>{f.n}</strong>
                          <br />
                          <span className="muted">{f.manager}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                );
              })()
            ) : (
              (() => {
                const prefijo = year + "-" + String(consultaMes + 1).padStart(2, "0");
                const dias = Object.keys(totals).filter((k) => k.startsWith(prefijo) && totals[k] > 0).sort();
                const total = dias.reduce((a, k) => a + totals[k], 0);
                const porObra: Record<string, { name: string; n: number }> = {};
                for (const d of dias) {
                  for (const f of detalleDe(d)) {
                    if (!porObra[f.code]) porObra[f.code] = { name: f.name, n: 0 };
                    porObra[f.code].n += f.n;
                  }
                }
                const filas = Object.entries(porObra).sort((a, b) => b[1].n - a[1].n);
                if (!dias.length) return <p className="xs muted">Sin previsión ese mes.</p>;
                return (
                  <>
                    <p className="xs">
                      <strong className="nums">{total}</strong> personas-día en {dias.length} días
                    </p>
                    <ul className="consulta-list">
                      {filas.map(([code, v]) => (
                        <li key={code}>
                          <span className="mono">{code}</span> · {v.name} — <strong>{v.n}</strong>
                        </li>
                      ))}
                    </ul>
                  </>
                );
              })()
            )}
          </div>
        </div>
      </div>

      {hover &&
        (() => {
          const filas = detalleDe(hover.iso);
          if (!filas.length) return null;
          const total = filas.reduce((a, f) => a + f.n, 0);
          return (
            <div
              className="cal-tooltip"
              style={{
                left: Math.min(Math.max(hover.x - 130, 8), window.innerWidth - 270),
                top: Math.max(hover.y - 12 - 40 - filas.length * 26, 8),
              }}
            >
              <h4>
                {hover.iso} · {total} {total === 1 ? "persona" : "personas"}
              </h4>
              <ul>
                {filas.slice(0, 6).map((f) => (
                  <li key={f.code}>
                    <span className="mono">{f.code}</span> {f.name} — <strong>{f.n}</strong> ({f.manager})
                  </li>
                ))}
              </ul>
              {filas.length > 6 && <p className="muted">y {filas.length - 6} obras más…</p>}
            </div>
          );
        })()}
      <p className="xs muted">
El calendario siempre muestra el número del día. Los días con previsión salen resaltados en dorado, con
        más intensidad cuanta más gente; pasa el ratón por encima para ver cuántas personas y en qué obras.
        Los festivos aparecen en rojo.
      </p>

      <div className="card-surface p-5 stack" style={{ gap: "0.75rem" }}>
        <div>
          <h2 className="section-title">Festivos</h2>
          <p className="section-help">
            Los nacionales y los de Andalucía se calculan solos cada año, Semana Santa incluida. Aquí añades
            los locales de cada municipio.
          </p>
        </div>
        <div className="row">
          <input className="input" style={{ width: "10.5rem" }} type="date" value={nuevoFestivo} onChange={(ev) => setNuevoFestivo(ev.target.value)} />
          <input
            className="input"
            style={{ maxWidth: "16rem" }}
            placeholder="Nombre del festivo local"
            value={nombreFestivoLocal}
            onChange={(ev) => setNombreFestivoLocal(ev.target.value)}
          />
          <button
            className="btn btn-primary"
            onClick={() => {
              if (!nuevoFestivo || !nombreFestivoLocal.trim()) {
                window.alert("Indica la fecha y el nombre del festivo.");
                return;
              }
              addFestivoLocal(nuevoFestivo, nombreFestivoLocal);
              setNombreFestivoLocal("");
            }}
          >
            Añadir festivo local
          </button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: "9rem" }}>Fecha</th>
              <th>Festivo</th>
              <th style={{ width: "7rem" }}>Origen</th>
              <th style={{ width: "3rem" }} />
            </tr>
          </thead>
          <tbody>
            {festivosDelAnio.map(([isoF, nombre]) => {
              const esLocal = Boolean(state.festivosLocales[isoF]);
              return (
                <tr key={isoF}>
                  <td className="nums xs">{isoF}</td>
                  <td>{nombre}</td>
                  <td className="xs muted">{esLocal ? "Local" : "Oficial"}</td>
                  <td>
                    {esLocal && (
                      <button className="btn btn-icon btn-danger" title="Quitar festivo local" onClick={() => removeFestivoLocal(isoF)}>
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
