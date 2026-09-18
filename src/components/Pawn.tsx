import type { ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import { categoryColor } from "../types";
import type { Employee } from "../types";

/* Variaciones deterministas: el mismo nombre genera siempre el mismo muñeco. */
const SKINS = ["#f2d3b8", "#e0b596", "#c78d64", "#8d5a3b", "#f7e0cc"];
const HAIRS = ["#2f2a26", "#5b3a1e", "#8a6a3c", "#c9a227", "#9b9b9b", "#3b1f1f"];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

/** Abreviatura corta de la categoría, para que quepa bajo el muñeco. */
export function abreviaturaCategoria(cat: string): string {
  const c = (cat || "").toLowerCase();
  if (c.startsWith("encargado")) return "ENC";
  if (c.includes("1")) return "OF.1ª";
  if (c.includes("2")) return "OF.2ª";
  if (c.includes("3")) return "OF.3ª";
  if (c.includes("subcontrata")) return "SUBC";
  return (cat || "?").slice(0, 5).toUpperCase();
}

export function PawnFigure({ name, category, size = 30 }: { name: string; category: string; size?: number }) {
  const h = hash(name);
  const skin = SKINS[h % SKINS.length];
  const hair = HAIRS[(h >> 3) % HAIRS.length];
  const hairStyle = (h >> 6) % 3; // 0 corto, 1 raya, 2 recogido
  const color = categoryColor(category);

  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      role="img"
      aria-label={`${name}, ${category}`}
      style={{ display: "block" }}
    >
      <circle cx="20" cy="20" r="20" fill={color} opacity="0.16" />
      {/* hombros / mono de trabajo */}
      <path d="M8 40c0-6.6 5.4-10 12-10s12 3.4 12 10z" fill={color} />
      <path d="M17 31h6v4h-6z" fill={skin} />
      {/* cabeza */}
      <circle cx="20" cy="18" r="9.2" fill={skin} />
      {/* pelo */}
      {hairStyle === 0 && <path d="M10.8 17.5a9.2 9.2 0 0 1 18.4 0c-2.6-2.2-5.6-3.2-9.2-3.2s-6.6 1-9.2 3.2z" fill={hair} />}
      {hairStyle === 1 && (
        <path d="M10.8 17.2a9.2 9.2 0 0 1 18.4 0c-1-3-3.4-4.6-7-4.6-1.6 1.8-4.2 2.6-7.6 2.6-1.6 0-2.8.7-3.8 2z" fill={hair} />
      )}
      {hairStyle === 2 && (
        <>
          <path d="M10.8 18a9.2 9.2 0 0 1 18.4 0c-1.4-3.4-4.6-5.2-9.2-5.2s-7.8 1.8-9.2 5.2z" fill={hair} />
          <circle cx="29.6" cy="18.6" r="2.6" fill={hair} />
        </>
      )}
      {/* cara */}
      <circle cx="16.8" cy="19" r="1.15" fill="#2b2b2b" />
      <circle cx="23.2" cy="19" r="1.15" fill="#2b2b2b" />
      <path d="M16.8 22.6c1.8 1.6 4.6 1.6 6.4 0" stroke="#2b2b2b" strokeWidth="1.1" fill="none" strokeLinecap="round" />
    </svg>
  );
}

interface PawnProps {
  employee: Employee;
  variant?: "chip" | "tile";
  picked?: boolean;
  dragging?: boolean;
  onDragStart?: (ev: React.DragEvent) => void;
  onDragEnd?: () => void;
  onClick?: () => void;
  onRemove?: () => void;
  title?: string;
  /** Texto de aviso: pinta el muñeco en naranja y lo explica al pasar el ratón. */
  warn?: string | null;
  /** Foto real del trabajador (dataURL). Si no hay, se dibuja el muñeco. */
  photo?: string | null;
  /** Controles extra bajo el nombre (turno, dieta…). */
  footer?: ReactNode;
  /** Texto pequeño bajo el nombre, por ejemplo "3/5 días". */
  nota?: string | null;
  /** Resalta la nota cuando la asignación no cubre todo el rango. */
  notaParcial?: boolean;
}

export function Pawn({
  employee,
  variant = "chip",
  picked,
  dragging,
  onDragStart,
  onDragEnd,
  onClick,
  onRemove,
  title,
  warn,
  photo,
  footer,
  nota,
  notaParcial,
}: PawnProps) {
  const common = {
    draggable: true,
    onDragStart,
    onDragEnd,
    onClick,
    "data-picked": picked ? "true" : "false",
    "data-dragging": dragging ? "true" : "false",
    "data-warn": warn ? "true" : "false",
    title: warn ? `${employee.name} · ${employee.category} — ${warn}` : title || `${employee.name} · ${employee.category}`,
  } as const;

  if (variant === "tile") {
    return (
      <div className="pawn-tile" {...common}>
        <span className="pawn-figure" style={{ borderColor: categoryColor(employee.category) }}>
          {photo ? (
            <img src={photo} alt={employee.name} draggable={false} />
          ) : (
            <PawnFigure name={employee.name} category={employee.category} size={42} />
          )}
        </span>
        <span className="pawn-label">{employee.name}</span>
        <span className="cat-tag" style={{ background: categoryColor(employee.category) }} title={employee.category}>
          {abreviaturaCategoria(employee.category)}
        </span>
        {nota && (
          <span className="dias-tag" data-parcial={notaParcial ? "true" : "false"}>
            {nota}
          </span>
        )}
        {footer}
        {warn && (
          <span className="pawn-warn" aria-label={warn}>
            <AlertTriangle size={11} />
          </span>
        )}
        {onRemove && (
          <button
            className="pawn-remove"
            title="Quitar de esta obra"
            aria-label={`Quitar a ${employee.name} de esta obra`}
            onClick={(ev) => {
              ev.stopPropagation();
              onRemove();
            }}
          >
            <X size={11} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="pawn" style={{ borderLeft: "4px solid " + categoryColor(employee.category) }} {...common}>
      <span className="pawn-figure">
        {photo ? (
          <img src={photo} alt={employee.name} draggable={false} />
        ) : (
          <PawnFigure name={employee.name} category={employee.category} size={30} />
        )}
      </span>
      <span className="pawn-name">{employee.name}</span>
      <span className="cat-tag" style={{ background: categoryColor(employee.category) }} title={employee.category}>
        {abreviaturaCategoria(employee.category)}
      </span>
      {warn && <AlertTriangle size={13} className="pawn-warn-inline" />}
      {onRemove && (
        <button
          className="pawn-remove"
          aria-label={`Quitar a ${employee.name}`}
          onClick={(ev) => {
            ev.stopPropagation();
            onRemove();
          }}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
