import { useEffect } from "react";
import type { ReactNode } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { addDays, daysOfWeek, formatLong, startOfWeek, todayISO, usePlanner, weekNumber } from "../store";
import type { RangeMode } from "../store";

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal" onMouseDown={(ev) => ev.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

const MODOS: { id: RangeMode; label: string }[] = [
  { id: "dia", label: "Día" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mes" },
];

/**
 * Barra de fecha con tres modos: un día suelto, la semana completa o el mes.
 * Las flechas avanzan según el modo elegido.
 */
export function DateBar({
  showCopy = true,
  showModes = true,
  modes,
}: {
  showCopy?: boolean;
  showModes?: boolean;
  /** Modos que se ofrecen. Por defecto los tres; el reparto solo usa día y semana. */
  modes?: RangeMode[];
}) {
  const { date, setDate, copyPreviousDay, rangeMode, setRangeMode } = usePlanner();

  const salto = rangeMode === "dia" ? 1 : rangeMode === "semana" ? 7 : 30;
  const mover = (dir: number) => {
    if (rangeMode === "mes") {
      const d = new Date(date);
      d.setMonth(d.getMonth() + dir);
      setDate(d.toISOString().slice(0, 10));
    } else {
      setDate(addDays(date, dir * salto));
    }
  };

  const semana = daysOfWeek(date);
  const etiqueta =
    rangeMode === "dia"
      ? formatLong(date)
      : rangeMode === "semana"
        ? "Semana " + weekNumber(date) + " · " + formatLong(startOfWeek(date)) + " a " + formatLong(semana[6])
        : new Date(date).toLocaleDateString("es-ES", { month: "long", year: "numeric" });

  return (
    <div className="row">
      {showModes && (
        <div className="seg">
          {MODOS.filter((m) => !modes || modes.includes(m.id)).map((m) => (
            <button
              key={m.id}
              className="seg-btn"
              data-active={rangeMode === m.id ? "true" : "false"}
              onClick={() => setRangeMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
      <button className="btn btn-icon" title="Anterior" onClick={() => mover(-1)}>
        <ChevronLeft />
      </button>
      <input
        className="input"
        type="date"
        value={date}
        style={{ width: "10.5rem" }}
        onChange={(ev) => ev.target.value && setDate(ev.target.value)}
      />
      <button className="btn" onClick={() => setDate(todayISO())}>
        <CalendarDays /> Hoy
      </button>
      {showCopy && (
        <button className="btn" onClick={copyPreviousDay} title="Copia la planificación del día anterior">
          <Copy /> Copiar día anterior
        </button>
      )}
      <button className="btn btn-icon" title="Siguiente" onClick={() => mover(1)}>
        <ChevronRight />
      </button>
      <span className="xs muted">{etiqueta}</span>
    </div>
  );
}
