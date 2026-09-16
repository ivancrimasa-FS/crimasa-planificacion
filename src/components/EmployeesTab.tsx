import { useMemo, useRef, useState } from "react";
import { Camera, CalendarOff, Plus, Trash2 } from "lucide-react";
import { todayISO, usePlanner } from "../store";
import { ABSENCE_COLORS, ABSENCE_TYPES } from "../types";
import type { AbsenceType } from "../types";
import { PawnFigure } from "./Pawn";

/** Recorta la foto a un cuadrado de 200px y la comprime, para no cargar la base de datos. */
async function prepararFoto(file: File): Promise<string> {
  const dataUrl: string = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("No se pudo leer la imagen"));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("El archivo no es una imagen válida"));
    i.src = dataUrl;
  });
  const lado = Math.min(img.width, img.height);
  const canvas = document.createElement("canvas");
  canvas.width = 200;
  canvas.height = 200;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no permite procesar la imagen");
  ctx.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 200, 200);
  return canvas.toDataURL("image/jpeg", 0.75);
}

function FotoEmpleado({ id, nombre, categoria }: { id: string; nombre: string; categoria: string }) {
  const { photos, setPhoto, removePhoto } = usePlanner();
  const ref = useRef<HTMLInputElement>(null);
  const foto = photos[id];

  return (
    <>
      <span
        className="foto-cell"
        title={foto ? "Cambiar foto (clic) · Quitar (clic derecho)" : "Añadir foto"}
        onClick={() => ref.current?.click()}
        onContextMenu={(ev) => {
          ev.preventDefault();
          if (foto && window.confirm("¿Quitar la foto de " + nombre + "?")) removePhoto(id);
        }}
      >
        {foto ? <img src={foto} alt={nombre} /> : <Camera size={15} className="muted" />}
      </span>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={async (ev) => {
          const file = ev.target.files?.[0];
          ev.target.value = "";
          if (!file) return;
          try {
            setPhoto(id, await prepararFoto(file));
          } catch (err: any) {
            window.alert("No se pudo usar esa imagen: " + (err?.message || err));
          }
        }}
      />
    </>
  );
}

export function EmployeesTab() {
  const { state, addEmployee, updateEmployee, removeEmployee } = usePlanner();
  const [name, setName] = useState("");
  const [category, setCategory] = useState(state.categories[0] || "Peón");
  const [bulk, setBulk] = useState("");
  const [search, setSearch] = useState("");

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.employees.filter((e) => !q || e.name.toLowerCase().includes(q));
  }, [state.employees, search]);

  const addBulk = () => {
    const lines = bulk
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;
    for (const line of lines) {
      const [n, c] = line.split(/[;,\t]/).map((s) => (s || "").trim());
      if (!n) continue;
      addEmployee(n, state.categories.includes(c) ? c : category);
    }
    setBulk("");
  };

  return (
    <div className="stack">
      <div className="card-surface p-5 stack" style={{ gap: "0.75rem" }}>
        <div>
          <h2 className="section-title">Empleados</h2>
          <p className="section-help">
            Los que estén activos aparecen en “Reparto por nombre”. Haz clic en el hueco de la foto para subir
            la del trabajador; si no hay foto se dibuja un muñeco. Clic derecho sobre la foto para quitarla.
          </p>
        </div>
        <div className="row">
          <input
            className="input"
            style={{ maxWidth: "18rem" }}
            placeholder="Nombre y apellidos"
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") {
                addEmployee(name, category);
                setName("");
              }
            }}
          />
          <select className="select" style={{ width: "auto" }} value={category} onChange={(ev) => setCategory(ev.target.value)}>
            {state.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            onClick={() => {
              addEmployee(name, category);
              setName("");
            }}
          >
            <Plus /> Añadir
          </button>
          <input
            className="input"
            style={{ maxWidth: "14rem", marginLeft: "auto" }}
            placeholder="Buscar…"
            value={search}
            onChange={(ev) => setSearch(ev.target.value)}
          />
        </div>

        <details>
          <summary className="xs muted" style={{ cursor: "pointer" }}>
            Pegar una lista entera (un nombre por línea, opcional “Nombre; Categoría”)
          </summary>
          <textarea
            className="input"
            style={{ height: "7rem", padding: "0.5rem 0.6rem", marginTop: "0.5rem" }}
            value={bulk}
            onChange={(ev) => setBulk(ev.target.value)}
            placeholder={"Juan Pérez; Oficial 1ª\nMaría Gómez; Peón"}
          />
          <button className="btn btn-primary" style={{ marginTop: "0.5rem" }} onClick={addBulk}>
            <Plus /> Añadir lista
          </button>
        </details>
      </div>

      <AbsencesPanel />

      <div className="card-surface p-5">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: "3rem" }}>Foto</th>
              <th>Trabajador</th>
              <th style={{ width: "11rem" }}>Categoría</th>
              <th style={{ width: "7rem" }}>Estado</th>
              <th style={{ width: "3rem" }} />
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id}>
                <td>
                  <FotoEmpleado id={e.id} nombre={e.name} categoria={e.category} />
                </td>
                <td>
                  <input className="input" value={e.name} onChange={(ev) => updateEmployee(e.id, { name: ev.target.value })} />
                </td>
                <td>
                  <select
                    className="select"
                    value={e.category}
                    onChange={(ev) => updateEmployee(e.id, { category: ev.target.value })}
                  >
                    {state.categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button className="btn" onClick={() => updateEmployee(e.id, { active: !e.active })}>
                    {e.active ? "Activo" : "Baja"}
                  </button>
                </td>
                <td>
                  <button
                    className="btn btn-icon btn-danger"
                    title="Eliminar trabajador"
                    onClick={() => {
                      if (window.confirm(`¿Eliminar a ${e.name}? Se quitará de todas las obras planificadas.`))
                        removeEmployee(e.id);
                    }}
                  >
                    <Trash2 />
                  </button>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={5} className="muted xs">
                  No hay trabajadores con ese filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AbsencesPanel() {
  const { state, addAbsence, removeAbsence } = usePlanner();
  const [employeeId, setEmployeeId] = useState("");
  const [type, setType] = useState<AbsenceType>("Vacaciones");
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [note, setNote] = useState("");
  const [verPasadas, setVerPasadas] = useState(false);

  const hoy = todayISO();
  const nombre = (id: string) => state.employees.find((e) => e.id === id)?.name || "(eliminado)";

  const lista = useMemo(() => {
    return state.absences
      .filter((a) => verPasadas || a.to >= hoy)
      .sort((a, b) => b.from.localeCompare(a.from));
  }, [state.absences, verPasadas, hoy]);

  const guardar = () => {
    if (!employeeId) {
      window.alert("Elige a quién corresponde la ausencia.");
      return;
    }
    addAbsence({ employeeId, type, from, to, note: note.trim() });
    setNote("");
  };

  return (
    <div className="card-surface p-5 stack" style={{ gap: "0.75rem" }}>
      <div>
        <h2 className="section-title">Ausencias</h2>
        <p className="section-help">
          Vacaciones, bajas, cursos o permisos. Mientras dure la ausencia, esa persona no aparece entre las
          disponibles en "Reparto por nombre", y si ya estaba asignada se marca en naranja.
        </p>
      </div>

      <div className="row">
        <select className="select" style={{ width: "auto", minWidth: "12rem" }} value={employeeId} onChange={(ev) => setEmployeeId(ev.target.value)}>
          <option value="">Elige trabajador…</option>
          {state.employees
            .filter((e) => e.active)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </select>
        <select className="select" style={{ width: "auto" }} value={type} onChange={(ev) => setType(ev.target.value as AbsenceType)}>
          {ABSENCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label className="row xs muted" style={{ gap: "0.35rem" }}>
          Desde
          <input className="input" style={{ width: "9.5rem" }} type="date" value={from} onChange={(ev) => setFrom(ev.target.value)} />
        </label>
        <label className="row xs muted" style={{ gap: "0.35rem" }}>
          Hasta
          <input className="input" style={{ width: "9.5rem" }} type="date" value={to} onChange={(ev) => setTo(ev.target.value)} />
        </label>
        <input
          className="input"
          style={{ maxWidth: "14rem" }}
          placeholder="Nota (opcional)"
          value={note}
          onChange={(ev) => setNote(ev.target.value)}
        />
        <button className="btn btn-primary" onClick={guardar}>
          <Plus /> Añadir ausencia
        </button>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th style={{ width: "2.5rem" }} />
            <th>Trabajador</th>
            <th style={{ width: "8rem" }}>Tipo</th>
            <th style={{ width: "13rem" }}>Fechas</th>
            <th>Nota</th>
            <th style={{ width: "3rem" }} />
          </tr>
        </thead>
        <tbody>
          {lista.map((a) => (
            <tr key={a.id}>
              <td className="muted">
                <CalendarOff size={16} />
              </td>
              <td>{nombre(a.employeeId)}</td>
              <td>
                <span className="absent-tag" style={{ marginLeft: 0, background: ABSENCE_COLORS[a.type] || "var(--muted-foreground)" }}>
                  {a.type}
                </span>
              </td>
              <td className="xs nums">
                {a.from === a.to ? a.from : a.from + " → " + a.to}
              </td>
              <td className="xs muted">{a.note}</td>
              <td>
                <button
                  className="btn btn-icon btn-danger"
                  title="Eliminar ausencia"
                  onClick={() => removeAbsence(a.id)}
                >
                  <Trash2 />
                </button>
              </td>
            </tr>
          ))}
          {lista.length === 0 && (
            <tr>
              <td colSpan={6} className="muted xs">
                No hay ausencias {verPasadas ? "registradas" : "activas ni futuras"}.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <label className="row xs muted" style={{ gap: "0.35rem" }}>
        <input type="checkbox" checked={verPasadas} onChange={(ev) => setVerPasadas(ev.target.checked)} />
        Ver también las ausencias ya terminadas
      </label>
    </div>
  );
}
