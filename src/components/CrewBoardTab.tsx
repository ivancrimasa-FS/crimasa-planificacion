import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarOff, Truck, X } from "lucide-react";
import { formatLong, startOfWeek, usePlanner, weekNumber, daysOfWeek } from "../store";
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
    photos,
    rangeMode,
    setRangeMode,
    diasDestino,
    dayOf,
    incluirFinde,
    setIncluirFinde,
  } = usePlanner();

  const [search, setSearch] = useState("");
  const [jefeFiltro, setJefeFiltro] = useState<string>("");

  // Aquí el reparto es por día o por semana; el mes no tiene sentido.
  useEffect(() => {
    if (rangeMode === "mes") setRangeMode("semana");
  }, [rangeMode, setRangeMode]);
  const [showAll, setShowAll] = useState(false);
  const [drag, setDrag] = useState<DragPayload | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [picked, setPicked] = useState<DragPayload | null>(null);

  const employeeById = useMemo(() => {
    const map: Record<string, Employee> = {};
    for (const e of state.employees) map[e.id] = e;
    return map;
  }, [state.employees]);

  const enRango = rangeMode !== "dia";

  /**
   * Lo que se pinta. En modo día es el día tal cual; en semana o mes, la unión
   * de todos los días laborables: quien esté al menos un día aparece en la obra.
   */
  const vista = useMemo(() => {
    if (!enRango) return day;
    const crew: Record<string, string[]> = {};
    const vehicles: Record<string, string[]> = {};
    for (const iso of diasDestino) {
      const d = dayOf(iso);
      for (const [w, lista] of Object.entries(d.crew || {})) {
        crew[w] = crew[w] || [];
        for (const id of lista) if (!crew[w].includes(id)) crew[w].push(id);
      }
      for (const [w, lista] of Object.entries(d.vehicles || {})) {
        vehicles[w] = vehicles[w] || [];
        for (const k of lista) if (!vehicles[w].includes(k)) vehicles[w].push(k);
      }
    }
    return { ...day, crew, vehicles };
  }, [enRango, day, diasDestino, dayOf]);

  /** En cuántos días del rango está esa persona en esa obra. */
  const diasEn = (workId: string, employeeId: string) =>
    diasDestino.filter((iso) => (dayOf(iso).crew[workId] || []).includes(employeeId)).length;

  /** Turno y dieta: se toman del primer día del rango en que la persona está en la obra. */
  const shiftEnRango = (workId: string, employeeId: string) => {
    for (const iso of diasDestino) {
      const d = dayOf(iso);
      if ((d.crew[workId] || []).includes(employeeId)) {
        return ((d.shifts || {})[workId] || {})[employeeId] || { turno: "DIA" as Turno, dieta: false };
      }
    }
    return { turno: "DIA" as Turno, dieta: false };
  };

  const ausencias: Record<string, Absence> = useMemo(() => absencesOn(date), [absencesOn, date]);

  /** Cuántas obras tiene asignadas cada persona ese día (para avisar de duplicados). */
  const vecesAsignado = useMemo(() => {
    const count: Record<string, number> = {};
    for (const list of Object.values(vista.crew)) {
      for (const id of list) count[id] = (count[id] || 0) + 1;
    }
    return count;
  }, [vista.crew]);

  const avisoDe = (employeeId: string): string | null => {
    if (ausencias[employeeId]) return ausencias[employeeId].type + ": no debería estar trabajando";
    if ((vecesAsignado[employeeId] || 0) > 1) return "Asignado a " + vecesAsignado[employeeId] + " obras este día";
    return null;
  };

  /** Para cada vehículo+turno ya asignado, en qué obra está y cuántas veces. */
  const vehiculosOcupados = useMemo(() => {
    const mapa: Record<string, { obras: string[]; workIds: string[] }> = {};
    for (const [wid, list] of Object.entries(vista.vehicles || {})) {
      const obra = state.works.find((w) => w.id === wid);
      for (const k of list) {
        mapa[k] = mapa[k] || { obras: [], workIds: [] };
        mapa[k].obras.push(obra ? obra.code : "otra obra");
        mapa[k].workIds.push(wid);
      }
    }
    return mapa;
  }, [vista.vehicles, state.works]);

  const vehiculosDuplicados = useMemo(() => {
    const count: Record<string, number> = {};
    for (const [k, v] of Object.entries(vehiculosOcupados)) count[k] = v.obras.length;
    return count;
  }, [vehiculosOcupados]);

  const festivo = nombreFestivo(date, state.festivosLocales);
  const finDeSemana = esFinDeSemana(date);

  const assignedIds = useMemo(() => {
    const set = new Set<string>();
    for (const list of Object.values(vista.crew)) list.forEach((id) => set.add(id));
    return set;
  }, [vista.crew]);

  const pool = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.employees
      .filter((e) => e.active)
      .filter((e) => !ausencias[e.id])
      .filter((e) => showAll || !assignedIds.has(e.id))
      .filter((e) => !q || e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [state.employees, assignedIds, search, showAll, ausencias]);

  const activos = state.employees.filter((e) => e.active).length;
  const freeCount = state.employees.filter((e) => e.active && !assignedIds.has(e.id) && !ausencias[e.id]).length;
  const asignadas = assignedIds.size;
  /** Puestos cubiertos: si alguien está en dos obras, cuenta dos veces. */
  const puestos = Object.values(vista.crew).reduce((a, l) => a + l.length, 0);

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

  const todosLosGrupos = state.managers
    .map((m) => ({ manager: m, works: state.works.filter((w) => w.managerId === m.id && w.active) }))
    .filter((g) => g.works.length > 0);

  const managersWithWorks = jefeFiltro
    ? todosLosGrupos.filter((g) => g.manager.id === jefeFiltro)
    : todosLosGrupos;

  const orphanWorks = jefeFiltro
    ? []
    : state.works.filter((w) => w.active && !state.managers.some((m) => m.id === w.managerId));

  const obrasVisibles = managersWithWorks.reduce((a, g) => a + g.works.length, 0) + orphanWorks.length;

  /** Personas distintas asignadas a las obras que se están viendo ahora mismo. */
  const personasVisibles = (() => {
    const set = new Set<string>();
    for (const g of managersWithWorks) {
      for (const w of g.works) (vista.crew[w.id] || []).forEach((id) => set.add(id));
    }
    for (const w of orphanWorks) (vista.crew[w.id] || []).forEach((id) => set.add(id));
    return set.size;
  })();

  return (
    <div className="stack">
      <div className="card-surface p-5 stack" style={{ gap: "0.75rem" }}>
        <div>
          <h2 className="section-title">Reparto de personas</h2>
          <p className="section-help">
            Arrastra un muñeco desde la izquierda y suéltalo sobre la obra donde trabajará. También puedes
            hacer clic en una persona y después en la obra. Para mover a alguien de obra, arrástralo de un
            cajón a otro.
          </p>
        </div>
        <DateBar modes={["dia", "semana"]} />

        <div className="modo-banner" data-modo={enRango ? "semana" : "dia"}>
          <CalendarOff size={16} />
          {enRango ? (
            <>
              <span>
                Repartiendo <strong>TODA LA SEMANA {weekNumber(date)}</strong> · {formatLong(startOfWeek(date))} a{" "}
                {formatLong(daysOfWeek(date)[6])} · lo que asignes se aplica a los{" "}
                <strong>{diasDestino.length} días</strong> del rango.
              </span>
              <label className="row xs" style={{ gap: "0.3rem", marginLeft: "auto", flexWrap: "nowrap" }}>
                <input type="checkbox" checked={incluirFinde} onChange={(ev) => setIncluirFinde(ev.target.checked)} />
                Incluir findes y festivos
              </label>
            </>
          ) : (
            <span>
              Repartiendo <strong>UN SOLO DÍA</strong> · {formatLong(date)} · los cambios afectan solo a esta
              fecha. Pon el selector en <strong>Semana</strong> para repartir la semana entera.
            </span>
          )}
        </div>

        <div className="row">
          <span className="xs muted">Jefe de obra:</span>
          <div className="seg" style={{ flexWrap: "wrap" }}>
            <button className="seg-btn" data-active={jefeFiltro === "" ? "true" : "false"} onClick={() => setJefeFiltro("")}>
              Todos
            </button>
            {todosLosGrupos.map((g) => (
              <button
                key={g.manager.id}
                className="seg-btn"
                data-active={jefeFiltro === g.manager.id ? "true" : "false"}
                onClick={() => setJefeFiltro(g.manager.id)}
                title={g.works.length + " obras"}
              >
                {g.manager.name} <span className="seg-count">{g.works.length}</span>
              </button>
            ))}
          </div>
          <span className="xs muted">
            {obrasVisibles} {obrasVisibles === 1 ? "obra" : "obras"} en pantalla ·{" "}
            <strong className="nums">{personasVisibles}</strong>{" "}
            {personasVisibles === 1 ? "persona asignada" : "personas asignadas"}
          </span>
        </div>
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
          <div className="contadores">
            <span className="contador" data-tipo="asignadas">
              <strong className="nums">
                {asignadas}/{activos}
              </strong>{" "}
              asignadas{puestos !== asignadas && <em> ({puestos} puestos)</em>}
            </span>
            <span className="contador" data-tipo="libres">
              quedan <strong className="nums">{freeCount}</strong>
            </span>
            {ausentes.length > 0 && (
              <span className="contador" data-tipo="fuera">
                <strong className="nums">{ausentes.length}</strong> no disponibles
              </span>
            )}
          </div>
          <p className="section-help">Suelta aquí a quien quieras liberar.</p>
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
              {jefeFiltro
                ? "Este jefe de obra no tiene obras activas."
                : "No hay obras activas. Créalas en la pestaña “Jefes y obras”."}
            </div>
          )}

          {managersWithWorks.map(({ manager, works }) => (
            <div key={manager.id}>
              {!jefeFiltro && <h3 className="manager-group-title">{manager.name}</h3>}
              <div className="works-grid">
                {works.map((w) => (
                  <WorkBox
                    key={w.id}
                    workId={w.id}
                    code={w.code}
                    name={w.name}
                    expediente={w.expediente}
                    crew={(vista.crew[w.id] || []).map((id) => employeeById[id]).filter(Boolean)}
                    previstas={needTotal(w.id)}
                    vehicles={vista.vehicles[w.id] || []}
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
                    shiftOf={(empId) => shiftEnRango(w.id, empId)}
                    diasEn={(empId) => diasEn(w.id, empId)}
                    totalDias={diasDestino.length}
                    onTurno={(empId, turno) => setShift(w.id, empId, { turno })}
                    onDieta={(empId, dieta) => setShift(w.id, empId, { dieta })}
                    dupVehiculos={vehiculosDuplicados}
                    ocupados={vehiculosOcupados}
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
                    crew={(vista.crew[w.id] || []).map((id) => employeeById[id]).filter(Boolean)}
                    previstas={needTotal(w.id)}
                    vehicles={vista.vehicles[w.id] || []}
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
                    shiftOf={(empId) => shiftEnRango(w.id, empId)}
                    diasEn={(empId) => diasEn(w.id, empId)}
                    totalDias={diasDestino.length}
                    onTurno={(empId, turno) => setShift(w.id, empId, { turno })}
                    onDieta={(empId, dieta) => setShift(w.id, empId, { dieta })}
                    dupVehiculos={vehiculosDuplicados}
                    ocupados={vehiculosOcupados}
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
  diasEn: (employeeId: string) => number;
  totalDias: number;
  onTurno: (employeeId: string, turno: Turno) => void;
  onDieta: (employeeId: string, dieta: boolean) => void;
  dupVehiculos: Record<string, number>;
  ocupados: Record<string, { obras: string[]; workIds: string[] }>;
}

function WorkBox(p: WorkBoxProps) {
  const asignadas = p.crew.length;

  /**
   * Turnos que realmente se trabajan en esta obra hoy. Si solo hay gente de
   * día, no tiene sentido ofrecer furgonetas de noche, y al revés. Sin nadie
   * asignado todavía se ofrecen los dos.
   */
  const turnosEnObra = (() => {
    const s = new Set<Turno>();
    for (const e of p.crew) s.add(p.shiftOf(e.id).turno);
    return s.size ? Array.from(s) : (["DIA", "NOCHE"] as Turno[]);
  })();
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
          title={
            p.previstas
              ? asignadas + " personas asignadas de " + p.previstas + " previstas"
              : asignadas + " personas asignadas (sin previsión para este día)"
          }
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
              nota={p.totalDias > 1 ? p.diasEn(e.id) + "/" + p.totalDias + " días" : null}
              notaParcial={p.totalDias > 1 && p.diasEn(e.id) < p.totalDias}
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
          <option value="">
            {turnosEnObra.length === 1
              ? "+ Vehículo de " + (turnosEnObra[0] === "NOCHE" ? "noche…" : "día…")
              : "+ Vehículo…"}
          </option>
          {turnosEnObra.map((t) => {
            const libres = p.allVehicles.filter((v) => !p.ocupados[slotKey(v.id, t)]);
            return (
              <optgroup key={t} label={t === "DIA" ? "Día · libres" : "Noche · libres"}>
                {libres.map((v) => (
                  <option key={v.id + t} value={slotKey(v.id, t)}>
                    {v.plate} · {v.description}
                  </option>
                ))}
                {libres.length === 0 && <option disabled>No queda ninguno libre</option>}
              </optgroup>
            );
          })}
          {(() => {
            const ocupadosFuera = Object.entries(p.ocupados).filter(([, v]) => !v.workIds.includes(p.workId));
            if (!ocupadosFuera.length) return null;
            return (
              <optgroup label="Ya asignados a otra obra">
                {ocupadosFuera.map(([key, v]) => {
                  const { vehicleId, turno } = parseSlot(key);
                  const veh = p.allVehicles.find((x) => x.id === vehicleId);
                  if (!veh) return null;
                  return (
                    <option key={key} value={key} disabled>
                      {veh.plate} ({turno === "NOCHE" ? "noche" : "día"}) → {v.obras.join(", ")}
                    </option>
                  );
                })}
              </optgroup>
            );
          })()}
        </select>
      </div>
    </div>
  );
}
