import { useRef, useState } from "react";
import {
  CalendarDays,
  CalendarRange,
  Download,
  FileSpreadsheet,
  HardHat,
  RotateCcw,
  Truck,
  Upload,
  LogOut,
  Users,
  UsersRound,
} from "lucide-react";
import { PlannerProvider, addDays, todayISO, usePlanner } from "./store";
import { AuthGate, useAuth } from "./auth";
import { exportGrid, exportToExcel } from "./excel";
import { PlanningTab } from "./components/PlanningTab";
import { CrewBoardTab } from "./components/CrewBoardTab";
import { YearCalendarTab } from "./components/YearCalendarTab";
import { ManagersTab } from "./components/ManagersTab";
import { EmployeesTab } from "./components/EmployeesTab";
import { VehiclesTab } from "./components/VehiclesTab";
import { Field, Modal } from "./components/ui";

const TABS = [
  { id: "planning", label: "Asignación diaria", Icon: CalendarRange },
  { id: "crew", label: "Reparto por nombre", Icon: UsersRound },
  { id: "calendar", label: "Previsión anual", Icon: CalendarDays },
  { id: "managers", label: "Jefes y obras", Icon: HardHat },
  { id: "employees", label: "Empleados", Icon: Users },
  { id: "vehicles", label: "Vehículos", Icon: Truck },
] as const;

function Logo() {
  const [failed, setFailed] = useState(false);
  if (failed) {
    // Emblema de reserva mientras no esté public/crimasa-logo.png
    return (
      <svg width={48} height={48} viewBox="0 0 96 96" role="img" aria-label="CRIMASA">
        <rect x="1" y="1" width="94" height="94" rx="14" fill="var(--card)" stroke="var(--border)" />
        <path d="M48 20 66 52H30z" fill="var(--navy)" />
        <path d="M48 32 58 52H38z" fill="var(--card)" />
        <rect x="14" y="60" width="68" height="20" rx="6" fill="var(--gold)" />
        <text
          x="48"
          y="74"
          textAnchor="middle"
          fontSize="13"
          fontWeight="700"
          fill="var(--primary-foreground)"
          fontFamily="Inter Tight, sans-serif"
        >
          30 AÑOS
        </text>
      </svg>
    );
  }
  return (
    <img
      src="/crimasa-logo.png"
      alt="CRIMASA"
      className="brand-logo"
      width={96}
      height={96}
      onError={() => setFailed(true)}
    />
  );
}

const STATUS_TEXT: Record<string, string> = {
  conectando: "Conectando…",
  conectado: "En línea",
  guardando: "Guardando…",
  "sin-conexion": "Sin conexión",
  error: "Error al guardar",
};

function SyncBadge() {
  const { status, lastError } = usePlanner();
  return (
    <span
      className="sync-badge"
      data-status={status}
      title={lastError || "Los cambios se guardan solos y se ven en el resto de ordenadores"}
    >
      <i />
      {STATUS_TEXT[status] || status}
    </span>
  );
}

function ExportDialog({ onClose }: { onClose: () => void }) {
  const { state, date } = usePlanner();
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(date);
  const [kind, setKind] = useState<"detalle" | "cuadrante">("detalle");

  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (from > to) {
      window.alert("La fecha de inicio es posterior a la de fin.");
      return;
    }
    setBusy(true);
    try {
      if (kind === "detalle") await exportToExcel(state, from, to);
      else await exportGrid(state, from, to);
      onClose();
    } catch (err: any) {
      window.alert("No se pudo generar el Excel: " + (err?.message || String(err)));
    } finally {
      setBusy(false);
    }
  };

  const quick = (days: number) => {
    setFrom(date);
    setTo(addDays(date, days - 1));
  };

  return (
    <Modal title="Exportar a Excel" onClose={onClose}>
      <p className="xs muted">
        Se descarga un .xlsx con la planificación del rango elegido. Los datos siguen guardados en la
        aplicación.
      </p>
      <div className="row">
        <button className="btn" onClick={() => quick(1)}>
          Solo este día
        </button>
        <button className="btn" onClick={() => quick(7)}>
          7 días
        </button>
        <button className="btn" onClick={() => quick(30)}>
          30 días
        </button>
      </div>
      <Field label="Desde">
        <input className="input" type="date" value={from} onChange={(ev) => setFrom(ev.target.value)} />
      </Field>
      <Field label="Hasta">
        <input className="input" type="date" value={to} onChange={(ev) => setTo(ev.target.value)} />
      </Field>
      <Field label="Formato">
        <select className="select" value={kind} onChange={(ev) => setKind(ev.target.value as any)}>
          <option value="detalle">Detalle (resumen, nombres, categorías, vehículos)</option>
          <option value="cuadrante">Cuadrante (obras en filas, días en columnas)</option>
        </select>
      </Field>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-primary" onClick={run} disabled={busy}>
          <FileSpreadsheet /> {busy ? "Generando…" : "Descargar Excel"}
        </button>
      </div>
    </Modal>
  );
}

function UserChip() {
  const { email, logout } = useAuth();
  return (
    <>
      <span className="user-chip" title={email}>
        <span>{email}</span>
      </span>
      <button
        className="btn"
        title="Cerrar sesión"
        onClick={() => {
          if (window.confirm("¿Cerrar sesión?")) logout();
        }}
      >
        <LogOut /> Salir
      </button>
    </>
  );
}

function Header() {
  const { state, reset, replaceState } = usePlanner();
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);

  const backup = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crimasa-planificacion-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stats = [
    { label: "Jefes de obra", value: state.managers.length },
    { label: "Obras", value: state.works.filter((w) => w.active).length },
    { label: "Empleados activos", value: state.employees.filter((e) => e.active).length },
  ];

  return (
    <header className="header-surface">
      <div className="wrap header-inner">
        <div className="brand">
          <Logo />
          <div>
            <h1>
              CRIMASA <span className="muted">·</span> Planificación de personal
            </h1>
            <div className="gold-rule" />
          </div>
        </div>
        <div className="header-actions">
          <SyncBadge />
          {stats.map((s) => (
            <div key={s.label} className="stat-tile">
              <p className="v">{s.value}</p>
              <p className="l">{s.label}</p>
            </div>
          ))}
          <button className="btn btn-primary" onClick={() => setExporting(true)}>
            <FileSpreadsheet /> Exportar a Excel
          </button>
          <button
            className="btn"
            onClick={() => {
              if (window.confirm("Esto borrará todos tus datos y volverá a los datos de ejemplo. ¿Continuar?"))
                reset();
            }}
          >
            <RotateCcw /> Restablecer
          </button>
          <button className="btn" onClick={backup}>
            <Download /> Copia de seguridad
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Upload /> Restaurar
          </button>
          <UserChip />
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={async (ev) => {
              const file = ev.target.files?.[0];
              ev.target.value = "";
              if (!file) return;
              const err = replaceState(await file.text());
              if (err) window.alert(err);
            }}
          />
        </div>
      </div>
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
    </header>
  );
}

function Shell() {
  const [tab, setTab] = useState<string>("planning");
  return (
    <div className="app-shell">
      <Header />
      <main className="wrap">
        <div className="tabs-list" role="tablist">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              data-active={tab === id ? "true" : "false"}
              className="tab-trigger"
              onClick={() => setTab(id)}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>
        {tab === "planning" && <PlanningTab />}
        {tab === "crew" && <CrewBoardTab />}
        {tab === "calendar" && <YearCalendarTab />}
        {tab === "managers" && <ManagersTab />}
        {tab === "employees" && <EmployeesTab />}
        {tab === "vehicles" && <VehiclesTab />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthGate>
      <PlannerProvider>
        <Shell />
      </PlannerProvider>
    </AuthGate>
  );
}
