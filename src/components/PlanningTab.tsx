import { useState } from "react";
import { ArrowLeft, CalendarOff, GripVertical, HardHat } from "lucide-react";
import { daysOfMonth, daysOfWeek, fromISO, shortDay, usePlanner, weekNumber } from "../store";
import { esFinDeSemana, nombreFestivo } from "../festivos";
import { DateBar } from "./ui";

export function PlanningTab() {
  const { state, day, date, rangeMode, rangeDays, dayOf, setNeed, needTotal, worksOf, moveManager, setNote } =
    usePlanner();
  const [selected, setSelected] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const festivo = nombreFestivo(date, state.festivosLocales);
  const finDeSemana = esFinDeSemana(date);
  const manager = state.managers.find((m) => m.id === selected) || null;

  if (manager) {
    const works = worksOf(manager.id);

    /** Totales del jefe de obra sumando TODAS sus obras, en los tres periodos. */
    const totalEn = (isos: string[]) => {
      let previstas = 0;
      let conNombre = 0;
      for (const iso of isos) {
        const d = dayOf(iso);
        for (const w of works) {
          previstas += needTotal(w.id, iso);
          conNombre += (d.crew[w.id] || []).length;
        }
      }
      return { previstas, conNombre };
    };

    const periodos = [
      { etiqueta: "Este día", detalle: date, ...totalEn([date]) },
      { etiqueta: "Semana " + weekNumber(date), detalle: "lun a dom", ...totalEn(daysOfWeek(date)) },
      {
        etiqueta: fromISO(date).toLocaleDateString("es-ES", { month: "long" }),
        detalle: "mes completo",
        ...totalEn(daysOfMonth(date)),
      },
    ];
    return (
      <div className="stack">
        <div className="card-surface p-5 stack" style={{ gap: "0.75rem" }}>
          <div className="row">
            <button className="btn" onClick={() => setSelected(null)}>
              <ArrowLeft /> Jefes de obra
            </button>
            <h2 className="section-title">{manager.name}</h2>
            <span className="xs muted">
              {works.length} {works.length === 1 ? "obra" : "obras"}
            </span>
          </div>
          <DateBar />
          {rangeMode === "dia" && (festivo || finDeSemana) && (
            <div className="day-notice">
              <CalendarOff size={15} />
              {festivo ? "Festivo: " + festivo : "Es fin de semana"}.
            </div>
          )}
          {rangeMode === "dia" && day.updatedBy && (
            <p className="audit-line">
              Última edición: {day.updatedBy}
              {day.updatedAt ? " · " + new Date(day.updatedAt).toLocaleString("es-ES") : ""}
            </p>
          )}
          <div className="row" style={{ gap: "0.5rem" }}>
            {periodos.map((p) => (
              <div key={p.etiqueta} className="stat-tile" style={{ textAlign: "left" }}>
                <p className="v">{p.previstas}</p>
                <p className="l" style={{ textTransform: "capitalize" }}>
                  {p.etiqueta} · previstas
                </p>
                <p className="l">
                  con nombre: <strong className="nums">{p.conNombre}</strong>
                </p>
              </div>
            ))}
            <span className="xs muted">
              Totales de {manager.name} sumando sus {works.length} {works.length === 1 ? "obra" : "obras"}.
            </span>
          </div>
          <p className="section-help">
            Escribe cuántas personas hacen falta de cada categoría. En modo Semana o Mes editas todos los días
            de una vez; los nombres concretos se ponen en “Reparto por nombre”.
          </p>
        </div>

        {works.length === 0 && (
          <div className="card-surface empty-state">
            Este jefe de obra no tiene obras asignadas. Añádelas en la pestaña “Jefes y obras”.
          </div>
        )}

        {works.map((w) => (
          <div key={w.id} className="card-surface p-5 stack" style={{ gap: "0.75rem" }}>
            <div className="row">
              <div className="grow">
                <p className="section-title">
                  <span className="mono">{w.code}</span> · {w.name}
                </p>
                <p className="section-help">Exp. {w.expediente}</p>
              </div>
              <div className="stat-tile">
                <p className="v">{rangeDays.reduce((acc, iso) => acc + needTotal(w.id, iso), 0)}</p>
                <p className="l">Personas-día</p>
              </div>
            </div>

            <div className="range-scroll">
              <table className="range-grid">
                <thead>
                  <tr>
                    <th className="cat">Categoría</th>
                    {rangeDays.map((iso) => {
                      const f = nombreFestivo(iso, state.festivosLocales);
                      return (
                        <th
                          key={iso}
                          data-weekend={esFinDeSemana(iso) ? "true" : "false"}
                          data-festivo={f ? "true" : "false"}
                          title={f || iso}
                        >
                          {shortDay(iso)}
                          <br />
                          {fromISO(iso).getDate()}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {state.categories.map((cat) => (
                    <tr key={cat}>
                      <td className="cat">{cat}</td>
                      {rangeDays.map((iso) => {
                        const v = (dayOf(iso).needs[w.id] || {})[cat] ?? 0;
                        return (
                          <td key={iso} data-weekend={esFinDeSemana(iso) ? "true" : "false"}>
                            <input
                              type="number"
                              min={0}
                              value={v}
                              data-cero={v ? "false" : "true"}
                              title={cat + " · " + iso}
                              onFocus={(ev) => ev.target.select()}
                              onChange={(ev) => setNeed(w.id, cat, Number(ev.target.value), iso)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td className="cat">TOTAL</td>
                    {rangeDays.map((iso) => (
                      <td key={iso}>{needTotal(w.id, iso)}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {rangeMode === "dia" && (
              <input
                className="input"
                placeholder="Nota del día para esta obra (opcional)"
                value={day.notes?.[w.id] || ""}
                onChange={(ev) => setNote(w.id, ev.target.value)}
              />
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="card-surface p-5">
        <h2 className="section-title">Jefes de obra</h2>
        <p className="section-help">
          Elige un jefe de obra para ver sus obras, el personal necesario y editar la asignación diaria.
          Arrastra las tarjetas desde el asa para reordenarlas.
        </p>
      </div>

      <DateBar />

      {state.managers.length === 0 && (
        <div className="card-surface empty-state">
          Todavía no hay jefes de obra. Créalos en la pestaña “Jefes y obras”.
        </div>
      )}

      <div className="grid-cards">
        {state.managers.map((m) => {
          const works = worksOf(m.id);
          const total = works.reduce(
            (acc, w) => acc + rangeDays.reduce((a, iso) => a + needTotal(w.id, iso), 0),
            0,
          );
          return (
            <div
              key={m.id}
              className="card-surface manager-card"
              role="button"
              tabIndex={0}
              data-dragging={dragId === m.id ? "true" : "false"}
              draggable
              onDragStart={() => setDragId(m.id)}
              onDragEnd={() => setDragId(null)}
              onDragOver={(ev) => ev.preventDefault()}
              onDrop={() => {
                if (dragId) moveManager(dragId, m.id);
                setDragId(null);
              }}
              onClick={() => setSelected(m.id)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  setSelected(m.id);
                }
              }}
            >
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <span className="icon-square">
                  <HardHat size={20} />
                </span>
                <div>
                  <p className="section-title">{m.name}</p>
                  <p className="xs muted">
                    {works.length} {works.length === 1 ? "obra" : "obras"}
                  </p>
                </div>
                <span className="grip" title="Arrastrar para reordenar">
                  <GripVertical size={16} />
                </span>
              </div>
              <ul className="work-list">
                {works.map((w) => (
                  <li key={w.id}>
                    <span className="mono">{w.code}</span> · {w.name}
                  </li>
                ))}
              </ul>
              <p className="xs muted" style={{ marginTop: "auto" }}>
                {rangeMode === "dia" ? "Este día" : rangeMode === "semana" ? "Esta semana" : "Este mes"}:{" "}
                <strong className="nums">{total}</strong> personas
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
