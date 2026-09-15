import { useState } from "react";
import { ArrowLeft, GripVertical, HardHat } from "lucide-react";
import { usePlanner } from "../store";
import { DateBar } from "./ui";

export function PlanningTab() {
  const { state, day, setNeed, needTotal, worksOf, moveManager, setNote } = usePlanner();
  const [selected, setSelected] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const manager = state.managers.find((m) => m.id === selected) || null;

  if (manager) {
    const works = worksOf(manager.id);
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
          <p className="section-help">
            Escribe cuántas personas hace falta de cada categoría en cada obra. Los nombres concretos se ponen
            en “Reparto por nombre”.
          </p>
        </div>

        {works.length === 0 && (
          <div className="card-surface empty-state">
            Este jefe de obra no tiene obras asignadas. Añádelas en la pestaña “Jefes y obras”.
          </div>
        )}

        {works.map((w) => {
          const needs = day.needs[w.id] || {};
          const total = needTotal(w.id);
          const asignadas = (day.crew[w.id] || []).length;
          return (
            <div key={w.id} className="card-surface p-5 stack" style={{ gap: "0.75rem" }}>
              <div className="row">
                <div className="grow">
                  <p className="section-title">
                    <span className="mono">{w.code}</span> · {w.name}
                  </p>
                  <p className="section-help">Exp. {w.expediente}</p>
                </div>
                <div className="stat-tile">
                  <p className="v">{total}</p>
                  <p className="l">Previstas</p>
                </div>
                <div className="stat-tile">
                  <p className="v">{asignadas}</p>
                  <p className="l">Con nombre</p>
                </div>
              </div>

              <table className="table">
                <thead>
                  <tr>
                    <th>Categoría</th>
                    <th style={{ width: "7rem" }}>Personas</th>
                  </tr>
                </thead>
                <tbody>
                  {state.categories.map((cat) => (
                    <tr key={cat}>
                      <td>{cat}</td>
                      <td>
                        <input
                          className="num-input"
                          type="number"
                          min={0}
                          value={needs[cat] ?? 0}
                          onFocus={(ev) => ev.target.select()}
                          onChange={(ev) => setNeed(w.id, cat, Number(ev.target.value))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <input
                className="input"
                placeholder="Nota del día para esta obra (opcional)"
                value={day.notes?.[w.id] || ""}
                onChange={(ev) => setNote(w.id, ev.target.value)}
              />
            </div>
          );
        })}
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
          const hoy = works.reduce((acc, w) => acc + needTotal(w.id), 0);
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
                Este día: <strong className="nums">{hoy}</strong> personas
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
