import { useMemo, useState } from "react";
import { Truck, X } from "lucide-react";
import { usePlanner } from "../store";
import { DateBar } from "./ui";
import { Pawn } from "./Pawn";
import { CATEGORY_COLORS } from "../types";
import type { Employee } from "../types";

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

  const assignedIds = useMemo(() => {
    const set = new Set<string>();
    for (const list of Object.values(day.crew)) list.forEach((id) => set.add(id));
    return set;
  }, [day.crew]);

  const pool = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.employees
      .filter((e) => e.active)
      .filter((e) => showAll || !assignedIds.has(e.id))
      .filter((e) => !q || e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [state.employees, assignedIds, search, showAll]);

  const freeCount = state.employees.filter((e) => e.active && !assignedIds.has(e.id)).length;

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
                    onToggleVehicle={(vid) => toggleVehicle(w.id, vid)}
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
                    onToggleVehicle={(vid) => toggleVehicle(w.id, vid)}
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
  onToggleVehicle: (vehicleId: string) => void;
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
        {p.crew.map((e) => (
          <Pawn
            key={e.id}
            employee={e}
            variant="tile"
            picked={p.pickedId === e.id}
            onDragStart={(ev) => p.onPawnDragStart(ev, e.id)}
            onDragEnd={p.onPawnDragEnd}
            onClick={() => p.onPawnClick(e.id)}
            onRemove={() => p.onRemovePawn(e.id)}
          />
        ))}
      </div>

      <div className="row" onClick={(ev) => ev.stopPropagation()}>
        {p.vehicles.map((vid) => {
          const v = p.allVehicles.find((x) => x.id === vid);
          if (!v) return null;
          return (
            <span key={vid} className="chip">
              <Truck size={14} />
              <span className="mono">{v.plate}</span>
              <button
                className="pawn-remove"
                aria-label={`Quitar ${v.plate}`}
                onClick={() => p.onToggleVehicle(vid)}
              >
                <X size={12} />
              </button>
            </span>
          );
        })}
        <select
          className="select"
          style={{ width: "auto", minWidth: "9rem" }}
          value=""
          onChange={(ev) => {
            if (ev.target.value) p.onToggleVehicle(ev.target.value);
          }}
        >
          <option value="">+ Vehículo…</option>
          {p.allVehicles
            .filter((v) => !p.vehicles.includes(v.id))
            .map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate} · {v.description}
              </option>
            ))}
        </select>
      </div>
    </div>
  );
}
