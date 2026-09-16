"""
Sincroniza las fichas maestras (personal, vehiculos y obras) desde un Excel
hacia Firestore, para que la aplicacion de planificacion se mantenga sola.

Pensado para una tarea programada diaria. NO toca la planificacion: solo el
documento plan_catalogo/global, y dentro de el solo las tres listas de fichas.

Reglas de actualizacion (importante):
    - Ficha que esta en el Excel y no en Firestore  -> se crea.
    - Ficha que esta en los dos                     -> se actualizan sus datos,
                                                       conservando su id.
    - Ficha que esta en Firestore y ya no en Excel  -> se marca active=False.
      NUNCA se borra: la planificacion de dias pasados apunta a esos ids y
      borrarlos dejaria huecos en el historico.

Requisitos:
    pip install firebase-admin openpyxl

Uso:
    python sincronizar_maestros.py                 # aplica los cambios
    python sincronizar_maestros.py --simular       # solo informa, no escribe
"""

import argparse
import os
import re
import sys
import traceback
import unicodedata
from datetime import datetime
from pathlib import Path

import firebase_admin
import openpyxl
from firebase_admin import credentials, firestore

# --------------------------------------------------------------------------
# Configuracion
# --------------------------------------------------------------------------

RUTA_CREDENCIALES = os.environ.get(
    "PLAN_CREDENCIALES",
    r"C:\scripts\credenciales\planificacion-firebase.json",
)

# Excel de origen. Ivan indicara la ruta definitiva en la carpeta compartida.
RUTA_EXCEL = os.environ.get(
    "PLAN_EXCEL",
    r"\\NAS\compartida\PLANIFICACION\PERSONAL_CRIMASA_2026.xlsm",
)

COL_CATALOGO = "plan_catalogo"
DOC_CATALOGO = "global"

HOJA_PERSONAL = "PERSONAL"
HOJA_VEHICULOS = "DATOS VEHICULOS"
HOJA_OBRAS = "ACTIVAS"

CATEGORIAS = ["Encargado", "Oficial de 1ª", "Oficial de 2ª", "Oficial de 3ª", "Subcontrata"]

# --------------------------------------------------------------------------


def log(mensaje: str) -> None:
    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {mensaje}", flush=True)


def normalizar(texto) -> str:
    """Clave de comparacion: sin tildes, sin espacios dobles y en minusculas."""
    s = str(texto or "").strip().lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s)


def slug(prefijo: str, texto: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", normalizar(texto)).strip("_")[:40]
    if not base:
        base = datetime.now().strftime("%H%M%S")
    return f"{prefijo}_{base}"


def categoria_normalizada(valor) -> str:
    s = normalizar(valor)
    if s.startswith("encargado"):
        return "Encargado"
    if "1" in s:
        return "Oficial de 1ª"
    if "2" in s:
        return "Oficial de 2ª"
    if "3" in s:
        return "Oficial de 3ª"
    if "subcontrata" in s:
        return "Subcontrata"
    return "Oficial de 3ª"


# --------------------------------------------------------------------------
# Lectura del Excel
# --------------------------------------------------------------------------


def buscar_cabecera(ws, etiquetas, filas_max=10):
    """Devuelve (fila, {etiqueta: columna}) de la primera fila que contenga las etiquetas."""
    for fila in range(1, min(ws.max_row, filas_max) + 1):
        encontradas = {}
        for col in range(1, ws.max_column + 1):
            valor = normalizar(ws.cell(fila, col).value)
            for etiqueta in etiquetas:
                if etiqueta not in encontradas and valor.startswith(etiqueta):
                    encontradas[etiqueta] = col
        if etiquetas[0] in encontradas:
            return fila, encontradas
    return None, {}


def leer_personal(wb) -> list:
    if HOJA_PERSONAL not in wb.sheetnames:
        return []
    ws = wb[HOJA_PERSONAL]
    fila, cols = buscar_cabecera(ws, ["nombre", "categor", "ok"])
    if not fila:
        raise RuntimeError(f"No encuentro la cabecera en la hoja {HOJA_PERSONAL}")

    salida = []
    for r in range(fila + 1, ws.max_row + 1):
        nombre = str(ws.cell(r, cols["nombre"]).value or "").strip()
        if len(nombre) < 4:
            continue
        activo = True
        if "ok" in cols:
            activo = str(ws.cell(r, cols["ok"]).value or "").strip() != "0"
        salida.append(
            {
                "name": nombre,
                "category": categoria_normalizada(ws.cell(r, cols["categor"]).value if "categor" in cols else ""),
                "active": activo,
            }
        )
    return salida


def leer_vehiculos(wb) -> list:
    if HOJA_VEHICULOS not in wb.sheetnames:
        return []
    ws = wb[HOJA_VEHICULOS]
    salida = []
    for r in range(2, ws.max_row + 1):
        matricula = str(ws.cell(r, 1).value or "").strip().upper().replace(" ", "")
        if not matricula or matricula == "MATRÍCULA":
            continue
        modelo = str(ws.cell(r, 2).value or "").strip()
        observaciones = str(ws.cell(r, 4).value or "").strip()
        descripcion = " · ".join(x for x in (modelo, observaciones) if x and x != " ")
        salida.append({"plate": matricula, "description": descripcion, "active": True})
    return salida


def leer_obras(wb) -> list:
    if HOJA_OBRAS not in wb.sheetnames:
        return []
    ws = wb[HOJA_OBRAS]
    fila, _ = buscar_cabecera(ws, ["obra", "empresa", "titulo"])
    if not fila:
        return []
    salida = []
    for r in range(fila + 1, ws.max_row + 1):
        code = str(ws.cell(r, 1).value or "").strip()
        if not code:
            continue
        salida.append(
            {
                "code": code,
                "client": str(ws.cell(r, 2).value or "").strip(),
                "name": str(ws.cell(r, 3).value or "").strip() or code,
                "active": True,
            }
        )
    return salida


# --------------------------------------------------------------------------
# Fusion con lo que ya hay en Firestore
# --------------------------------------------------------------------------


def fusionar(actuales, nuevos, clave, prefijo_id, campos, cambios):
    """
    Cruza la lista de Firestore con la del Excel y devuelve la lista resultante.
    Registra en `cambios` un resumen legible de lo que se ha tocado.
    """
    indice = {normalizar(clave(x)): x for x in actuales}
    vistos = set()
    salida = [dict(x) for x in actuales]
    por_id = {x["id"]: x for x in salida}

    for nuevo in nuevos:
        k = normalizar(clave(nuevo))
        vistos.add(k)
        existente = indice.get(k)
        if existente:
            destino = por_id[existente["id"]]
            for campo in campos:
                if campo in nuevo and nuevo[campo] not in (None, "") and destino.get(campo) != nuevo[campo]:
                    cambios.append(f"actualizado {clave(nuevo)}: {campo} = {nuevo[campo]}")
                    destino[campo] = nuevo[campo]
            if destino.get("active") is False and nuevo.get("active") is True:
                cambios.append(f"reactivado {clave(nuevo)}")
                destino["active"] = True
        else:
            ficha = dict(nuevo)
            ficha["id"] = slug(prefijo_id, clave(nuevo))
            salida.append(ficha)
            cambios.append(f"NUEVO {clave(nuevo)}")

    # Los que ya no vienen en el Excel se desactivan, nunca se borran.
    for ficha in salida:
        if normalizar(clave(ficha)) not in vistos and ficha.get("active", True):
            ficha["active"] = False
            cambios.append(f"dado de baja {clave(ficha)} (ya no aparece en el Excel)")

    return salida


def main() -> int:
    parser = argparse.ArgumentParser(description="Sincroniza fichas maestras desde Excel a Firestore")
    parser.add_argument("--simular", action="store_true", help="no escribe nada, solo informa")
    parser.add_argument("--excel", default=RUTA_EXCEL, help="ruta del Excel de origen")
    args = parser.parse_args()

    try:
        log("Iniciando sincronizacion de fichas maestras")

        ruta = Path(args.excel)
        if not ruta.is_file():
            raise FileNotFoundError(f"No encuentro el Excel: {ruta}")
        log(f"Leyendo {ruta}")
        wb = openpyxl.load_workbook(ruta, data_only=True, read_only=True)
        try:
            personal = leer_personal(wb)
            vehiculos = leer_vehiculos(wb)
            obras = leer_obras(wb)
        finally:
            wb.close()

        log(f"Excel: {len(personal)} trabajadores, {len(vehiculos)} vehiculos, {len(obras)} obras")

        # Salvaguarda: si el Excel viene vacio o casi, algo ha ido mal (fichero a
        # medio guardar, hoja renombrada). Mejor no tocar nada que dar de baja
        # a toda la plantilla de golpe.
        if not personal:
            raise RuntimeError("La hoja de personal ha salido vacia. No se toca Firestore.")

        if not Path(RUTA_CREDENCIALES).is_file():
            raise FileNotFoundError(f"No encuentro las credenciales: {RUTA_CREDENCIALES}")
        cred = credentials.Certificate(RUTA_CREDENCIALES)
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred)
        db = firestore.client()

        ref = db.collection(COL_CATALOGO).document(DOC_CATALOGO)
        snap = ref.get()
        if not snap.exists:
            raise RuntimeError("plan_catalogo/global no existe. Abre la aplicacion al menos una vez.")
        catalogo = snap.to_dict() or {}

        if len(personal) < len(catalogo.get("employees", [])) * 0.5:
            raise RuntimeError(
                "El Excel trae menos de la mitad de trabajadores que Firestore. "
                "Parece un fichero incompleto; no se toca nada."
            )

        cambios = []
        catalogo["employees"] = fusionar(
            catalogo.get("employees", []), personal, lambda x: x["name"], "em", ["category", "active"], cambios
        )
        catalogo["vehicles"] = fusionar(
            catalogo.get("vehicles", []), vehiculos, lambda x: x["plate"], "vh", ["description", "active"], cambios
        )
        if obras:
            catalogo["works"] = fusionar(
                catalogo.get("works", []),
                obras,
                lambda x: x["code"],
                "wk",
                ["name", "client", "active"],
                cambios,
            )
        catalogo.setdefault("categories", CATEGORIAS)

        if not cambios:
            log("Sin cambios: Firestore ya coincide con el Excel")
            return 0

        log(f"{len(cambios)} cambios detectados:")
        for c in cambios[:60]:
            log(f"   - {c}")
        if len(cambios) > 60:
            log(f"   ... y {len(cambios) - 60} mas")

        if args.simular:
            log("Modo simulacion: no se ha escrito nada")
            return 0

        ref.set(catalogo, merge=True)
        log("Firestore actualizado correctamente")
        return 0

    except Exception as err:  # noqa: BLE001
        log(f"ERROR: {err}")
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
