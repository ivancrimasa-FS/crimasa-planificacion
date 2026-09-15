import { useEffect } from "react";
import type { ReactNode } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { addDays, formatLong, todayISO, usePlanner } from "../store";

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
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

export function DateBar({ showCopy = true }: { showCopy?: boolean }) {
  const { date, setDate, copyPreviousDay } = usePlanner();
  return (
    <div className="row">
      <button className="btn btn-icon" title="Día anterior" onClick={() => setDate(addDays(date, -1))}>
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
      <button className="btn btn-icon" title="Día siguiente" onClick={() => setDate(addDays(date, 1))}>
        <ChevronRight />
      </button>
      <span className="xs muted">{formatLong(date)}</span>
    </div>
  );
}
