import { useState } from "react";
import { Plus, Trash2, Truck } from "lucide-react";
import { usePlanner } from "../store";

export function VehiclesTab() {
  const { state, day, addVehicle, updateVehicle, removeVehicle } = usePlanner();
  const [plate, setPlate] = useState("");
  const [description, setDescription] = useState("");

  const workOfVehicle = (vehicleId: string) => {
    for (const [wid, list] of Object.entries(day.vehicles)) {
      if (list.includes(vehicleId)) return state.works.find((w) => w.id === wid);
    }
    return null;
  };

  return (
    <div className="stack">
      <div className="card-surface p-5 stack" style={{ gap: "0.75rem" }}>
        <div>
          <h2 className="section-title">Vehículos</h2>
          <p className="section-help">
            La flota disponible. Se asignan a cada obra desde la pestaña “Reparto por nombre”.
          </p>
        </div>
        <div className="row">
          <input
            className="input"
            style={{ maxWidth: "10rem" }}
            placeholder="1234 KLM"
            value={plate}
            onChange={(ev) => setPlate(ev.target.value.toUpperCase())}
          />
          <input
            className="input"
            style={{ maxWidth: "18rem" }}
            placeholder="Furgón taller"
            value={description}
            onChange={(ev) => setDescription(ev.target.value)}
          />
          <button
            className="btn btn-primary"
            onClick={() => {
              addVehicle(plate, description);
              setPlate("");
              setDescription("");
            }}
          >
            <Plus /> Añadir vehículo
          </button>
        </div>
      </div>

      <div className="card-surface p-5">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: "3rem" }} />
              <th style={{ width: "10rem" }}>Matrícula</th>
              <th>Descripción</th>
              <th>En obra (día seleccionado)</th>
              <th style={{ width: "7rem" }}>Estado</th>
              <th style={{ width: "3rem" }} />
            </tr>
          </thead>
          <tbody>
            {state.vehicles.map((v) => {
              const w = workOfVehicle(v.id);
              return (
                <tr key={v.id}>
                  <td className="muted">
                    <Truck size={18} />
                  </td>
                  <td>
                    <input
                      className="input mono"
                      value={v.plate}
                      onChange={(ev) => updateVehicle(v.id, { plate: ev.target.value.toUpperCase() })}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={v.description}
                      onChange={(ev) => updateVehicle(v.id, { description: ev.target.value })}
                    />
                  </td>
                  <td className="xs muted">{w ? `${w.code} · ${w.name}` : "Sin asignar"}</td>
                  <td>
                    <button className="btn" onClick={() => updateVehicle(v.id, { active: !v.active })}>
                      {v.active ? "Activo" : "Baja"}
                    </button>
                  </td>
                  <td>
                    <button
                      className="btn btn-icon btn-danger"
                      title="Eliminar vehículo"
                      onClick={() => {
                        if (window.confirm(`¿Eliminar el vehículo ${v.plate}?`)) removeVehicle(v.id);
                      }}
                    >
                      <Trash2 />
                    </button>
                  </td>
                </tr>
              );
            })}
            {state.vehicles.length === 0 && (
              <tr>
                <td colSpan={6} className="muted xs">
                  Todavía no hay vehículos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
