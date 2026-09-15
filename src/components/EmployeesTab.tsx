import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { usePlanner } from "../store";
import { PawnFigure } from "./Pawn";

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
            Los que estén activos aparecen como muñecos en “Reparto por nombre”. La categoría define su color.
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

      <div className="card-surface p-5">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: "3rem" }} />
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
                  <PawnFigure name={e.name} category={e.category} size={28} />
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
