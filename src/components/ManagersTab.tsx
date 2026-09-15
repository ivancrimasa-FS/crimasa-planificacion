import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { usePlanner } from "../store";
import { Field, Modal } from "./ui";
import type { Work } from "../types";

export function ManagersTab() {
  const { state, addManager, updateManager, removeManager, addWork, updateWork, removeWork } = usePlanner();
  const [newManager, setNewManager] = useState("");
  const [editing, setEditing] = useState<Work | null>(null);
  const [creating, setCreating] = useState(false);

  const blank: Omit<Work, "id"> = {
    code: "",
    name: "",
    expediente: "",
    managerId: state.managers[0]?.id || "",
    active: true,
  };

  return (
    <div className="stack">
      <div className="card-surface p-5 stack" style={{ gap: "0.75rem" }}>
        <div>
          <h2 className="section-title">Jefes de obra</h2>
          <p className="section-help">Cada obra se asigna a un jefe de obra. El orden se cambia en la pestaña de asignación diaria.</p>
        </div>
        <div className="row">
          <input
            className="input"
            style={{ maxWidth: "18rem" }}
            placeholder="Nombre y apellidos"
            value={newManager}
            onChange={(ev) => setNewManager(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") {
                addManager(newManager);
                setNewManager("");
              }
            }}
          />
          <button
            className="btn btn-primary"
            onClick={() => {
              addManager(newManager);
              setNewManager("");
            }}
          >
            <Plus /> Añadir jefe de obra
          </button>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Jefe de obra</th>
              <th style={{ width: "6rem" }}>Obras</th>
              <th style={{ width: "3rem" }} />
            </tr>
          </thead>
          <tbody>
            {state.managers.map((m) => (
              <tr key={m.id}>
                <td>
                  <input
                    className="input"
                    value={m.name}
                    onChange={(ev) => updateManager(m.id, { name: ev.target.value })}
                  />
                </td>
                <td className="nums">{state.works.filter((w) => w.managerId === m.id).length}</td>
                <td>
                  <button
                    className="btn btn-icon btn-danger"
                    title="Eliminar jefe de obra"
                    onClick={() => {
                      if (window.confirm(`¿Eliminar a ${m.name}? Sus obras quedarán sin jefe asignado.`))
                        removeManager(m.id);
                    }}
                  >
                    <Trash2 />
                  </button>
                </td>
              </tr>
            ))}
            {state.managers.length === 0 && (
              <tr>
                <td colSpan={3} className="muted xs">
                  Todavía no hay jefes de obra.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card-surface p-5 stack" style={{ gap: "0.75rem" }}>
        <div className="row">
          <div className="grow">
            <h2 className="section-title">Obras</h2>
            <p className="section-help">Código, nombre y expediente de cada obra.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus /> Nueva obra
          </button>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th style={{ width: "7rem" }}>Código</th>
              <th>Obra</th>
              <th style={{ width: "10rem" }}>Expediente</th>
              <th style={{ width: "12rem" }}>Jefe de obra</th>
              <th style={{ width: "6rem" }}>Estado</th>
              <th style={{ width: "6rem" }} />
            </tr>
          </thead>
          <tbody>
            {state.works.map((w) => (
              <tr key={w.id}>
                <td className="mono">{w.code}</td>
                <td>{w.name}</td>
                <td className="xs muted">{w.expediente}</td>
                <td>
                  <select
                    className="select"
                    value={w.managerId}
                    onChange={(ev) => updateWork(w.id, { managerId: ev.target.value })}
                  >
                    <option value="">(sin jefe)</option>
                    {state.managers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button className="btn" onClick={() => updateWork(w.id, { active: !w.active })}>
                    {w.active ? "Activa" : "Cerrada"}
                  </button>
                </td>
                <td>
                  <div className="row" style={{ flexWrap: "nowrap", gap: "0.25rem" }}>
                    <button className="btn" onClick={() => setEditing(w)}>
                      Editar
                    </button>
                    <button
                      className="btn btn-icon btn-danger"
                      title="Eliminar obra"
                      onClick={() => {
                        if (window.confirm(`¿Eliminar la obra ${w.code}? Se borrará su planificación de todos los días.`))
                          removeWork(w.id);
                      }}
                    >
                      <Trash2 />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {state.works.length === 0 && (
              <tr>
                <td colSpan={6} className="muted xs">
                  Todavía no hay obras.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(creating || editing) && (
        <WorkForm
          initial={editing ? { ...editing } : blank}
          managers={state.managers}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={(data) => {
            if (editing) updateWork(editing.id, data);
            else addWork(data);
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function WorkForm({
  initial,
  managers,
  onCancel,
  onSave,
}: {
  initial: Omit<Work, "id"> & { id?: string };
  managers: { id: string; name: string }[];
  onCancel: () => void;
  onSave: (data: Omit<Work, "id">) => void;
}) {
  const [code, setCode] = useState(initial.code);
  const [name, setName] = useState(initial.name);
  const [expediente, setExpediente] = useState(initial.expediente);
  const [managerId, setManagerId] = useState(initial.managerId);

  return (
    <Modal title={initial.id ? "Editar obra" : "Nueva obra"} onClose={onCancel}>
      <Field label="Código">
        <input className="input" value={code} placeholder="OB-1042" onChange={(ev) => setCode(ev.target.value)} />
      </Field>
      <Field label="Nombre de la obra">
        <input className="input" value={name} onChange={(ev) => setName(ev.target.value)} />
      </Field>
      <Field label="Expediente">
        <input
          className="input"
          value={expediente}
          placeholder="EXP/2026/0142"
          onChange={(ev) => setExpediente(ev.target.value)}
        />
      </Field>
      <Field label="Jefe de obra">
        <select className="select" value={managerId} onChange={(ev) => setManagerId(ev.target.value)}>
          <option value="">(sin jefe)</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={onCancel}>
          Cancelar
        </button>
        <button
          className="btn btn-primary"
          onClick={() => {
            if (!name.trim()) {
              window.alert("La obra necesita un nombre.");
              return;
            }
            onSave({ code: code.trim(), name: name.trim(), expediente: expediente.trim(), managerId, active: true });
          }}
        >
          Guardar obra
        </button>
      </div>
    </Modal>
  );
}
