import { useMemo, useState } from "react";
import { AlertTriangle, CalendarOff, Truck, X } from "lucide-react";
import { usePlanner } from "../store";
import { DateBar } from "./ui";
import { Pawn } from "./Pawn";
import { ABSENCE_COLORS, CATEGORY_COLORS, parseSlot, slotKey } from "../types";
import type { Absence, Employee, Turno } from "../types";
import { esFinDeSemana, nombreFestivo } from "../festivos";

interface DragPayload {
  employeeId: string;
  fromWorkId: string | null;
}

export function CrewBoardTab() {
  const {
    state,
    day,
    assignEmployee,
    unassignEmployee,
    freeEmployee,
    toggleVehicle,
    needTotal,
    absencesOn,
    date,
    setShift,
    shiftOf,
    photos,
  } = usePlanner();

  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [drag, setDrag] = useState<DragPayload | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [picked, setPicked] = useState<DragPayload | null>(null);

  const employeeById = useMemo(() => {
    const map: Record<string, Employee> = {};
    for (const e of state.employees) map[e.id] = e;
    return map;
  }, [state.employees]);

  const ausencias: Record<string, Absence> = useMemo(() => absencesOn(date), [absencesOn, date]);

  /** Cuántas obras tiene asignadas cada persona ese día (para avisar de duplicados). */
  const vecesAsignado = useMemo(() => {
    const count: Record<string, number> = {};
    for (const list of Object.values(day.crew)) {
      for (const id of list) count[id] = (count[id] || 0) + 1;
    }
    return count;
  }, [day.crew]);

  const avisoDe = (employeeId: string): string | null => {
    if (ausencias[employeeId]) return ausencias[employeeId].type + ": no debería estar trabajando";
    if ((vecesAsignado[employeeId] || 0) > 1) return "Asignado a " + vecesAsignado[employeeId] + " obras este día";
    return null;
  };

  const vehiculosDuplicados = useMemo(() => {
    const count: Record<string, number> = {};
    for (const list of Object.values(day.vehicles || {})) {
      for (const k of list) count[k] = (count[k] || 0) + 1;
    }
    return count;
  }, [day.vehicles]);

  const festivo = nombreFestivo(date, state.festivosLocales);
  const finDeSemana = esFinDeSemana(date);

  const assignedIds = useMemo(() => {
    const set = new Set<string>();
    for (const list of Object.values(day.crew)) list.forEach((id) => set.add(id));
    return set;
  }, [day.crew]);

  const pool = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.employees
      .filter((e) => e.active)
      .filter((e) => !ausencias[e.id])
      .filter((e) => showAll || !assignedIds.has(e.id))
      .filter((e) => !q || e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [state.employees, assignedIds, search, showAll, ausencias]);

  const freeCount = state.employees.filter((e) => e.active && !assignedIds.has(e.id) && !ausencias[e.id]).length;

  const ausentes = state.employees
    .filter((e) => e.active && ausencias[e.id])
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const startDrag = (ev: React.DragEvent, payload: DragPayload) => {
    ev.dataTransfer.setData("text/plain", JSON.stringify(payload));
    ev.dataTransfer.effectAllowed = "move";
    setDrag(payload);
  };

  const readDrag = (ev: React.DragEvent): DragPayload | null => {
    try {
      const raw = ev.dataTransfer.getData("text/plain");
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignora */
    }
    return drag;
  };

  const dropOnWork = (workId: string, payload: DragPayload | null) => {
    if (!payload) return;
    if (payload.fromWorkId && payload.fromWorkId !== workId) unassignEmployee(payload.fromWorkId, payload.employeeId);
    assignEmployee(workId, payload.employeeId);
    setDrag(null);
    setPicked(null);
    setOverId(null);
  };

  const dropOnPool = (payload: DragPayload | null) => {
    if (!payload) return;
    freeEmployee(payload.employeeId);
    setDrag(null);
    setPicked(null);
    setOverId(null);
  };

  const managersWithWorks = state.managers
    .map((m) => ({ manager: m, works: state.works.filter((w) => w.managerId === m.id && w.active) }))
    .filter((g) => g.works.length > 0);

  const orphanWorks = state.works.filter(
    (w) => w.active && !state.managers.some((m) => m.id === w.managerId),
  );

  return (
    <div className="stack">
      <div className="card-surface p-5 stack" style={{ gap: "0.75rem" }}>
        <div>
          <h2 className="section-title">Reparto de personas por día</h2>
          <p className="section-help">
            Arrastra un muñeco desde la izquierda y suéltalo sobre la obra donde trabajará ese día. También
            puedes hacer clic en una persona y después en la obra. Para mover a alguien de obra, arrástralo de
            un cajón a otro.
          </p>
        </div>
        <DateBar />
        {(festivo || finDeSemana) && (
          <div className="day-notice">
            <CalendarOff size={15} />
            {festivo ? "Festivo: " + festivo : "Es fin de semana"}. Comprueba que de verdad se trabaja este día.
          </div>
        )}
        {day.updatedBy && (
          <p className="audit-line">
            Última edición: {day.updatedBy}
            {day.updatedAt ? " · " + new Date(day.updatedAt).toLocaleString("es-ES") : ""}
          </p>
        )}
        <div className="legend">
          {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
            <span key={cat}>
              <i style={{ background: color }} />
              {cat}
            </span>
          ))}
        </div>
      </div>

      <div className="crew-layout">
        <div
          className="card-surface pool"
          data-over={overId === "__pool__" ? "true" : "false"}
          onDragOver={(ev) => {
            ev.preventDefault();
            setOverId("__pool__");
          }}
          onDragLeave={() => setOverId((v) => (v === "__pool__" ? null : v))}
          onDrop={(ev) => {
            ev.preventDefault();
            dropOnPool(readDrag(ev));
          }}
          onClick={() => {
            if (picked?.fromWorkId) dropOnPool(picked);
          }}
        >
          <h2 className="section-title">Personas libres</h2>
          <p className="section-help">
            {freeCount} sin obra este día. Suéltalas aquí para liberarlas.
          </p>
          <input
            className="input"
            style={{ marginTop: "0.6rem" }}
            placeholder="Buscar nombre…"
            value={search}
            onChange={(ev) => setSearch(ev.target.value)}
          />
          <label className="row xs muted" style={{ marginTop: "0.5rem", gap: "0.35rem" }}>
            <input type="checkbox" checked={showAll} onChange={(ev) => setShowAll(ev.target.checked)} />
            Ver también los ya asignados
          </label>
          <div className="pool-scroll">
            {pool.length === 0 && <p className="xs muted">No queda nadie libre con ese filtro.</p>}
            {pool.map((e) => (
              <Pawn
                key={e.id}
                employee={e}
                photo={photos[e.id]}
                picked={picked?.employeeId === e.id && !picked.fromWorkId}
                dragging={drag?.employeeId === e.id && !drag.fromWorkId}
                onDragStart={(ev) => startDrag(ev, { employeeId: e.id, fromWorkId: null })}
                onDragEnd={() => setDrag(null)}
                onClick={() =>
                  setPicked((p) =>
                    p?.employeeId === e.id && !p.fromWorkId ? null : { employeeId: e.id, fromWorkId: null },
                  )
                }
              />
            ))}

            {ausentes.length > 0 && (
              <>
                <p className="manager-group-title" style={{ marginBottom: "0.25rem" }}>
                  No disponibles ({ausentes.length})
                </p>
                {ausentes.map((e) => {
                  const a = ausencias[e.id];
                  return (
                    <div key={e.id} className="absent-row" title={a.note || a.type}>
                      <AlertTriangle size={13} className="pawn-warn-inline" />
                      <span>{e.name}</span>
                      <span className="absent-tag" style={{ background: ABSENCE_COLORS[a.type] || "var(--muted-foreground)" }}>
                        {a.type}
                      </span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        <div>
          {managersWithWorks.length === 0 && orphanWorks.length === 0 && (
            <div className="card-surface empty-state">
              No hay obras activas. Créalas en la pestaña “Jefes y obras”.
            </div>
          )}

          {managersWithWorks.map(({ manager, works }) => (
            <div key={manager.id}>
              <h3 className="manager-group-title">{manager.name}</h3>
              <div className="works-grid">
                {works.map((w) => (
                  <WorkBox
                    key={w.id}
                    workId={w.id}
                    code={w.code}
                    name={w.name}
                    expediente={w.expediente}
                    crew={(day.crew[w.id] || []).map((id) => employeeById[id]).filter(Boolean)}
                    previstas={needTotal(w.id)}
                    vehicles={day.vehicles[w.id] || []}
                    allVehicles={state.vehicles.filter((v) => v.active)}
                    over={overId === w.id}
                    onOver={() => setOverId(w.id)}
                    onLeave={() => setOverId((v) => (v === w.id ? null : v))}
                    onDrop={(ev) => {
                      ev.preventDefault();
                      dropOnWork(w.id, readDrag(ev));
                    }}
                    onClickBox={() => {
                      if (picked) dropOnWork(w.id, picked);
                    }}
                    onPawnDragStart={(ev, empId) => startDrag(ev, { employeeId: empId, fromWorkId: w.id })}
                    onPawnDragEnd={() => setDrag(null)}
                    onPawnClick={(empId) =>
                      setPicked((p) =>
                        p?.employeeId === empId && p.fromWorkId === w.id
                          ? null
                          : { employeeId: empId, fromWorkId: w.id },
                      )
                    }
                    pickedId={picked?.fromWorkId === w.id ? picked.employeeId : null}
                    onRemovePawn={(empId) => unassignEmployee(w.id, empId)}
                    avisoDe={avisoDe}
                    photos={photos}
                    shiftOf={(empId) => shiftOf(w.id, empId)}
                    onTurno={(empId, turno) => setShift(w.id, empId, { turno })}
                    onDieta={(empId, dieta) => setShift(w.id, empId, { dieta })}
                    dupVehiculos={vehiculosDuplicados}
                    onToggleVehicle={(vid, turno) => toggleVehicle(w.id, vid, turno)}
                  />
                ))}
              </div>
            </div>
          ))}

          {orphanWorks.length > 0 && (
            <div>
              <h3 className="manager-group-title">Sin jefe de obra</h3>
              <div className="works-grid">
                {orphanWorks.map((w) => (
                  <WorkBox
                    key={w.id}
                    workId={w.id}
                    code={w.code}
                    name={w.name}
                    expediente={w.expediente}
                    crew={(day.crew[w.id] || []).map((id) => employeeById[id]).filter(Boolean)}
                    previstas={needTotal(w.id)}
                    vehicles={day.vehicles[w.id] || []}
                    allVehicles={state.vehicles.filter((v) => v.active)}
                    over={overId === w.id}
                    onOver={() => setOverId(w.id)}
                    onLeave={() => setOverId((v) => (v === w.id ? null : v))}
                    onDrop={(ev) => {
                      ev.preventDefault();
                      dropOnWork(w.id, readDrag(ev));
                    }}
                    onClickBox={() => {
                      if (picked) dropOnWork(w.id, picked);
                    }}
                    onPawnDragStart={(ev, empId) => startDrag(ev, { employeeId: empId, fromWorkId: w.id })}
                    onPawnDragEnd={() => setDrag(null)}
                    onPawnClick={(empId) =>
                      setPicked((p) =>
                        p?.employeeId === empId && p.fromWorkId === w.id
                          ? null
                          : { employeeId: empId, fromWorkId: w.id },
                      )
                    }
                    pickedId={picked?.fromWorkId === w.id ? picked.employeeId : null}
                    onRemovePawn={(empId) => unassignEmployee(w.id, empId)}
                    avisoDe={avisoDe}
                    photos={photos}
                    shiftOf={(empId) => shiftOf(w.id, empId)}
                    onTurno={(empId, turno) => setShift(w.id, empId, { turno })}
                    onDieta={(empId, dieta) => setShift(w.id, empId, { dieta })}
                    dupVehiculos={vehiculosDuplicados}
                    onToggleVehicle={(vid, turno) => toggleVehicle(w.id, vid, turno)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface WorkBoxProps {
  workId: string;
  code: string;
  name: string;
  expediente: string;
  crew: Employee[];
  previstas: number;
  vehicles: string[];
  allVehicles: { id: string; plate: string; description: string }[];
  over: boolean;
  onOver: () => void;
  onLeave: () => void;
  onDrop: (ev: React.DragEvent) => void;
  onClickBox: () => void;
  onPawnDragStart: (ev: React.DragEvent, employeeId: string) => void;
  onPawnDragEnd: () => void;
  onPawnClick: (employeeId: string) => void;
  pickedId: string | null;
  onRemovePawn: (employeeId: string) => void;
  onToggleVehicle: (vehicleId: string, turno?: Turno) => void;
  avisoDe: (employeeId: string) => string | null;
  photos: Record<string, string>;
  shiftOf: (employeeId: string) => { turno: Turno; dieta?: boolean };
  onTurno: (employeeId: string, turno: Turno) => void;
  onDieta: (employeeId: string, dieta: boolean) => void;
  dupVehiculos: Record<string, number>;
}

function WorkBox(p: WorkBoxProps) {
  const asignadas = p.crew.length;
  const full = p.previstas > 0 && asignadas === p.previstas;
  const over = p.previstas > 0 && asignadas > p.previstas;

  return (
    <div
      className="card-surface work-box"
      data-over={p.over ? "true" : "false"}
      onDragOver={(ev) => {
        ev.preventDefault();
        p.onOver();
      }}
      onDragLeave={p.onLeave}
      onDrop={p.onDrop}
      onClick={p.onClickBox}
    >
      <div className="work-box-head">
        <div>
          <p className="section-title">
            <span className="mono">{p.code}</span> · {p.name}
          </p>
          <p className="section-help">Exp. {p.expediente}</p>
        </div>
        <span
          className="count-badge"
          data-full={full ? "true" : "false"}
          data-over={over ? "true" : "false"}
          title={p.previstas ? `${asignadas} asignadas de ${p.previstas} previstas` : `${asignadas} asignadas`}
        >
          {p.previstas ? `${asignadas}/${p.previstas}` : asignadas}
        </span>
      </div>

      <div className="dropzone">
        {p.crew.length === 0 && <span className="dropzone-empty">Suelta aquí las personas de esta obra.</span>}
        {p.crew.map((e) => {
          const sh = p.shiftOf(e.id);
          return (
            <Pawn
              key={e.id}
              employee={e}
              variant="tile"
              picked={p.pickedId === e.id}
              photo={p.photos[e.id]}
              onDragStart={(ev) => p.onPawnDragStart(ev, e.id)}
              onDragEnd={p.onPawnDragEnd}
              onClick={() => p.onPawnClick(e.id)}
              onRemove={() => p.onRemovePawn(e.id)}
              warn={p.avisoDe(e.id)}
              footer={
                <span className="turno-row" onClick={(ev) => ev.stopPropagation()}>
                  <button
                    className="mini-btn"
                    data-on={sh.turno === "NOCHE" ? "true" : "false"}
                    title={sh.turno === "NOCHE" ? "Turno de noche" : "Turno de día"}
                    onClick={() => p.onTurno(e.id, sh.turno === "NOCHE" ? "DIA" : "NOCHE")}
                  >
                    {sh.turno === "NOCHE" ? "NOCHE" : "DÍA"}
                  </button>
                  <button
                    className="mini-btn"
                    data-kind="dieta"
                    data-on={sh.dieta ? "true" : "false"}
                    title={sh.dieta ? "Con dieta" : "Sin dieta"}
                    onClick={() => p.onDieta(e.id, !sh.dieta)}
                  >
                    D
                  </button>
                </span>
              }
            />
          );
        })}
      </div>

      <div className="row" onClick={(ev) => ev.stopPropagation()}>
        {p.vehicles.map((key) => {
          const { vehicleId, turno } = parseSlot(key);
          const v = p.allVehicles.find((x) => x.id === vehicleId);
          if (!v) return null;
          const dup = (p.dupVehiculos[key] || 0) > 1;
          return (
            <span
              key={key}
              className="chip"
              data-dup={dup ? "true" : "false"}
              title={dup ? "Este vehículo está en otra obra el mismo turno" : v.description}
            >
              <Truck size={14} />
              <span className="mono">{v.plate}</span>
              <span className="turno-tag" data-noche={turno === "NOCHE" ? "true" : "false"}>
                {turno === "NOCHE" ? "NOCHE" : "DÍA"}
              </span>
              <button className="pawn-remove" aria-label={"Quitar " + v.plate} onClick={() => p.onToggleVehicle(vehicleId, turno)}>
                <X size={12} />
              </button>
            </span>
          );
        })}
        <select
          className="select"
          style={{ width: "auto", minWidth: "10.5rem" }}
          value=""
          onChange={(ev) => {
            if (!ev.target.value) return;
            const { vehicleId, turno } = parseSlot(ev.target.value);
            p.onToggleVehicle(vehicleId, turno);
          }}
        >
          <option value="">+ Vehículo…</option>
          {(["DIA", "NOCHE"] as Turno[]).map((t) => (
            <optgroup key={t} label={t === "DIA" ? "Día" : "Noche"}>
              {p.allVehicles
                .filter((v) => !p.vehicles.includes(slotKey(v.id, t)))
                .map((v) => (
                  <option key={v.id + t} value={slotKey(v.id, t)}>
                    {v.plate} · {v.description}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>
    </div>
  );
}
