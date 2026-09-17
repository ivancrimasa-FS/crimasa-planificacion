import { useMemo, useState } from "react";
import { fromISO, toISO, todayISO, usePlanner } from "../store";
import { festivosDe } from "../festivos";
import { esFinDeSemana } from "../festivos";

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
type Semaforo = "verde" | "amarillo" | "rojo" | "vacio";

/**
 * Semáforo del día: compara las personas previstas con las que realmente hay
 * disponibles (plantilla activa menos ausencias de ese día).
 *   verde    → cubierto
 *   amarillo → falta gente, pero poca (hasta un 10 %, mínimo 2 personas)
 *   rojo     → falta bastante
 */
function semaforoDe(previstas: number, disponibles: number): Semaforo {
  if (!previstas) return "vacio";
  const faltan = previstas - disponibles;
  if (faltan <= 0) return "verde";
  const margen = Math.max(2, Math.round(disponibles * 0.1));
  return faltan <= margen ? "amarillo" : "rojo";
}

export function YearCalendarTab() {
  const { state, date, setDate, addFestivoLocal, removeFestivoLocal } = usePlanner();
  const [hover, setHover] = useState<{ iso: string; x: number; y: number } | null>(null);
  const [consultaTipo, setConsultaTipo] = useState<"mes" | "dia">("mes");
  const [consultaMes, setConsultaMes] = useState(fromISO(date).getMonth());
  const [consultaDia, setConsultaDia] = useState(date);
  const [nuevoFestivo, setNuevoFestivo] = useState("");
  const [nombreFestivoLocal, setNombreFestivoLocal] = useState("");
  const [year, setYear] = useState<number>(() => fromISO(date).getFullYear());
  const [workId, setWorkId] = useState<string>("");
  const [source, setSource] = useState<Source>("needs");

  const plantilla = state.employees.filter((e) => e.active).length;

  /** Personas realmente disponibles ese día: plantilla activa menos ausencias. */
  const disponiblesEn = useMemo(() => {
    const cache: Record<string, number> = {};
    return (iso: string) => {
      if (cache[iso] !== undefined) return cache[iso];
      const fuera = new Set<string>();
      for (const a of state.absences || []) {
        if (a.from <= iso && iso <= a.to) fuera.add(a.employeeId);
      }
      const activos = state.employees.filter((e) => e.active && !fuera.has(e.id)).length;
      cache[iso] = activos;
      return activos;
    };
  }, [state.absences, state.employees]);

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

  /** Previsión total del día (todas las obras), que es lo que se compara con la plantilla. */
  const previstasTotales = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [iso, d] of Object.entries(state.days)) {
      if (!iso.startsWith(String(year))) continue;
      let n = 0;
      for (const byCat of Object.values(d.needs || {})) {
        n += Object.values(byCat).reduce((a, b) => a + (Number(b) || 0), 0);
      }
      out[iso] = n;
    }
    return out;
  }, [state.days, year]);

  const festivos = useMemo(() => ({ ...festivosDe(year), ...state.festivosLocales }), [year, state.festivosLocales]);

  const festivosDelAnio = useMemo(
    () =>
      Object.entries(festivos)
        .filter(([iso]) => iso.startsWith(String(year)))
        .sort((a, b) => a[0].localeCompare(b[0])),
    [festivos, year],
  );

  /** Desglose por obra de un día. */
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

  const diasPlanificados = Object.keys(previstasTotales).filter((k) => previstasTotales[k] > 0);
  const balance = useMemo(() => {
    let verde = 0;
    let amarillo = 0;
    let rojo = 0;
    let peor: { iso: string; faltan: number } | null = null;
    for (const iso of diasPlanificados) {
      const disp = disponiblesEn(iso);
      const s = semaforoDe(previstasTotales[iso], disp);
      if (s === "verde") verde++;
      if (s === "amarillo") amarillo++;
      if (s === "rojo") rojo++;
      const faltan = previstasTotales[iso] - disp;
      if (faltan > 0 && (!peor || faltan > peor.faltan)) peor = { iso, faltan };
    }
    return { verde, amarillo, rojo, peor };
  }, [diasPlanificados, previstasTotales, disponiblesEn]);

  /** Reparto de personas-día por jefe de obra, como la tabla de porcentajes del Excel. */
  const porJefe = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const [iso, d] of Object.entries(state.days)) {
      if (!iso.startsWith(String(year))) continue;
      for (const [wid, byCat] of Object.entries(d.needs || {})) {
        const w = state.works.find((x) => x.id === wid);
        const jefe = state.managers.find((m) => m.id === w?.managerId)?.name || "Sin jefe";
        acc[jefe] = (acc[jefe] || 0) + Object.values(byCat).reduce((a, b) => a + (Number(b) || 0), 0);
      }
    }
    const total = Object.values(acc).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(acc)
      .map(([jefe, n]) => ({ jefe, n, pct: Math.round((n / total) * 100) }))
      .sort((a, b) => b.n - a.n);
  }, [state.days, state.works, state.managers, year]);

  const yearTotal = Object.values(totals).reduce((a, b) => a + b, 0);

  return (
    <div className="stack">
      <div className="card-surface p-5 stack" style={{ gap: "0.75rem" }}>
        <div>
          <h2 className="section-title">Previsión anual</h2>
          <p className="section-help">
            Carga de personal día a día comparada con la plantilla disponible. Haz clic en un día para
            abrirlo en el resto de pestañas.
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
          <select className="select" style={{ width: "auto" }} value={source} onChange={(ev) => setSource(ev.target.value as Source)}>
            <option value="needs">Personas previstas</option>
            <option value="crew">Personas con nombre</option>
          </select>
          <span className="xs muted">{yearTotal} personas-día</span>
        </div>

        <div className="row" style={{ gap: "0.5rem" }}>
          <div className="stat-tile">
            <p className="v">{plantilla}</p>
            <p className="l">Plantilla activa</p>
          </div>
          <div className="stat-tile">
            <p className="v" style={{ color: "var(--ok)" }}>{balance.verde}</p>
            <p className="l">Días cubiertos</p>
          </div>
          <div className="stat-tile">
            <p className="v" style={{ color: "oklch(0.72 0.15 75)" }}>{balance.amarillo}</p>
            <p className="l">Días justos</p>
          </div>
          <div className="stat-tile">
            <p className="v" style={{ color: "var(--destructive)" }}>{balance.rojo}</p>
            <p className="l">Días con falta</p>
          </div>
          {balance.peor && (
            <div className="stat-tile">
              <p className="v" style={{ color: "var(--destructive)" }}>{balance.peor.faltan}</p>
              <p className="l">Peor día: {balance.peor.iso.slice(5)}</p>
            </div>
          )}
        </div>

        {source === "needs" && (
          <div className="legend">
            <span><i className="sem sem-verde" />Cubierto: la plantilla da de sobra</span>
            <span><i className="sem sem-amarillo" />Justo: faltan pocas personas</span>
            <span><i className="sem sem-rojo" />Falta gente: hay que subcontratar o mover obras</span>
            <span><i className="sem sem-vacio" />Sin previsión</span>
          </div>
        )}
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
                const nombreF = festivos[iso];
                const disp = disponiblesEn(iso);
                const sem = semaforoDe(previstasTotales[iso] || 0, disp);
                const intensity = n ? 0.15 + (n / max) * 0.65 : 0;
                const estilo =
                  source === "needs"
                    ? undefined
                    : n
                      ? { background: `color-mix(in oklab, var(--gold) ${Math.round(intensity * 100)}%, var(--card))` }
                      : undefined;
                return (
                  <button
                    key={iso}
                    className="day"
                    data-weekend={dow >= 5 ? "true" : "false"}
                    data-festivo={nombreF ? "true" : "false"}
                    data-today={iso === today ? "true" : "false"}
                    data-selected={iso === date ? "true" : "false"}
                    data-planificado={n ? "true" : "false"}
                    data-sem={source === "needs" ? sem : "off"}
                    style={estilo}
                    title={nombreF || iso}
                    onMouseEnter={(ev) => {
                      if (!n && !previstasTotales[iso]) return;
                      const r = (ev.target as HTMLElement).getBoundingClientRect();
                      setHover({ iso, x: r.left + r.width / 2, y: r.top });
                    }}
                    onMouseLeave={() => setHover((h) => (h && h.iso === iso ? null : h))}
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
                const disp = disponiblesEn(consultaDia);
                const prev = previstasTotales[consultaDia] || 0;
                if (!filas.length) return <p className="xs muted">Sin previsión ese día.</p>;
                return (
                  <>
                    <p className="xs">
                      <strong className="nums">{total}</strong> personas el {consultaDia}
                    </p>
                    <p className="xs muted">
                      Previstas {prev} · Disponibles {disp} ·{" "}
                      {prev > disp ? <strong style={{ color: "var(--destructive)" }}>faltan {prev - disp}</strong> : "cubierto"}
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
                const rojos = dias.filter((d) => semaforoDe(previstasTotales[d] || 0, disponiblesEn(d)) === "rojo");
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
                    {rojos.length > 0 && (
                      <p className="xs" style={{ color: "var(--destructive)" }}>
                        {rojos.length} días con falta de personal
                      </p>
                    )}
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
          const disp = disponiblesEn(hover.iso);
          const prev = previstasTotales[hover.iso] || 0;
          const faltan = prev - disp;
          return (
            <div
              className="cal-tooltip"
              style={{
                left: Math.min(Math.max(hover.x - 130, 8), window.innerWidth - 280),
                top: Math.max(hover.y - 60 - filas.length * 26, 8),
              }}
            >
              <h4>{hover.iso}</h4>
              <p className="xs" style={{ marginBottom: "0.35rem" }}>
                Previstas <strong>{prev}</strong> · Disponibles <strong>{disp}</strong> ·{" "}
                {faltan > 0 ? (
                  <strong style={{ color: "var(--destructive)" }}>faltan {faltan}</strong>
                ) : (
                  <strong style={{ color: "var(--ok)" }}>sobran {-faltan}</strong>
                )}
              </p>
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

      <div className="card-surface p-5 stack" style={{ gap: "0.75rem" }}>
        <div>
          <h2 className="section-title">Reparto de la carga por jefe de obra en {year}</h2>
          <p className="section-help">Personas-día previstas de cada jefe de obra sobre el total del año.</p>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Jefe de obra</th>
              <th style={{ width: "8rem" }}>Personas-día</th>
              <th style={{ width: "40%" }}>% del total</th>
            </tr>
          </thead>
          <tbody>
            {porJefe.map((f) => (
              <tr key={f.jefe}>
                <td>{f.jefe}</td>
                <td className="nums">{f.n}</td>
                <td>
                  <span className="barra">
                    <span style={{ width: f.pct + "%" }} />
                  </span>
                  <span className="xs muted" style={{ marginLeft: "0.4rem" }}>
                    {f.pct}%
                  </span>
                </td>
              </tr>
            ))}
            {porJefe.length === 0 && (
              <tr>
                <td colSpan={3} className="muted xs">
                  Todavía no hay previsión cargada para {year}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
                  <td className="nums xs">
                    {isoF}
                    {esFinDeSemana(isoF) && <span className="xs muted"> (finde)</span>}
                  </td>
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
