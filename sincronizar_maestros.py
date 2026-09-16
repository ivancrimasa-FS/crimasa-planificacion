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

# Excel de origen. Se refresca solo cada 120 minutos desde la base de datos.
RUTA_EXCEL = os.environ.get(
    "PLAN_EXCEL",
    r"\\192.168.1.200\dpto gestión\2026\MACROS\CONEXION A DB\DATOS_PLANIFICACION_ANUAL.xlsx",
)

COL_CATALOGO = "plan_catalogo"
DOC_CATALOGO = "global"

# Siempre las hojas CyM: llevan CRIMASA y MAC juntos.
HOJA_PERSONAL = "Personal_CyM"
HOJA_VEHICULOS = "Vehiculos_CyM"
HOJA_OBRAS = "Obras_CyM"
HOJA_JEFES = "JO_CyM"

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


def filas_dict(ws) -> list:
    """Devuelve las filas como diccionarios usando la primera fila como cabecera."""
    filas = list(ws.iter_rows(values_only=True))
    if not filas:
        return []
    cabecera = [normalizar(c) for c in filas[0]]
    salida = []
    for fila in filas[1:]:
        if not fila or all(v in (None, "") for v in fila):
            continue
        salida.append({cabecera[i]: fila[i] for i in range(min(len(cabecera), len(fila)))})
    return salida


def valor(fila: dict, *claves):
    for c in claves:
        v = fila.get(normalizar(c))
        if v not in (None, ""):
            return v
    return None


def leer_jefes(wb) -> list:
    """
    JO_CyM relaciona el codigo JO-xx con la persona (columnas COD y Nombre).
    Si el libro no trajera esa columna, se recurre al orden de las filas y se
    avisa en el log.
    """
    if HOJA_JEFES not in wb.sheetnames:
        return []
    salida = []
    for i, fila in enumerate(filas_dict(wb[HOJA_JEFES])):
        nombre = " ".join(
            str(x).strip() for x in (valor(fila, "nombre"), valor(fila, "apellidos")) if x
        ).strip()
        if not nombre:
            continue
        codigo = valor(fila, "cod", "codigo", "codigo_jo")
        if not codigo:
            codigo = f"JO-{i + 1:02d}"
            log(f"AVISO: {HOJA_JEFES} sin columna COD; {nombre} se asocia a {codigo} por orden de fila")
        salida.append(
            {"name": nombre, "codigo": str(codigo).strip().upper(), "dni": str(valor(fila, "dni") or "")}
        )
    return salida


def leer_personal(wb) -> list:
    if HOJA_PERSONAL not in wb.sheetnames:
        return []
    salida = []
    for fila in filas_dict(wb[HOJA_PERSONAL]):
        nombre = str(valor(fila, "nombre_completo", "nombre") or "").strip()
        if len(nombre) < 4:
            continue
        categoria = str(valor(fila, "categoria") or "").strip()
        # Los jefes de obra no son operarios: van en su propia lista.
        if "jefe de obra" in normalizar(categoria):
            continue
        salida.append({"name": nombre, "category": categoria_normalizada(categoria), "active": True})
    return salida


def leer_vehiculos(wb) -> list:
    if HOJA_VEHICULOS not in wb.sheetnames:
        return []
    salida = []
    for fila in filas_dict(wb[HOJA_VEHICULOS]):
        matricula = str(valor(fila, "matricula") or "").strip().upper().replace(" ", "")
        if not matricula:
            continue
        descripcion = " · ".join(
            str(x).strip()
            for x in (valor(fila, "marca"), valor(fila, "modelo"), valor(fila, "propiedad"))
            if x
        )
        salida.append({"plate": matricula, "description": descripcion, "active": True})
    return salida


def leer_obras(wb, jefes_por_codigo: dict) -> list:
    if HOJA_OBRAS not in wb.sheetnames:
        return []
    salida = []
    for fila in filas_dict(wb[HOJA_OBRAS]):
        code = str(valor(fila, "codigo_obra", "codigo") or "").strip()
        if not code:
            continue
        codigo_jo = str(valor(fila, "jefe_obra") or "").strip().upper()
        salida.append(
            {
                "code": code,
                "client": str(valor(fila, "empresa") or "").strip(),
                "name": str(valor(fila, "nombre") or code).strip(),
                "_codigoJefe": codigo_jo,
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
            jefes = leer_jefes(wb)
            personal = leer_personal(wb)
            vehiculos = leer_vehiculos(wb)
            obras = leer_obras(wb, {j["codigo"]: j for j in jefes})
        finally:
            wb.close()

        log(
            f"Excel: {len(jefes)} jefes de obra, {len(personal)} trabajadores, "
            f"{len(vehiculos)} vehiculos, {len(obras)} obras"
        )

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

        catalogo["managers"] = fusionar(
            catalogo.get("managers", []),
            [{"name": j["name"]} for j in jefes],
            lambda x: x["name"],
            "mg",
            [],
            cambios,
        )

        # Los jefes no se dan de baja automaticamente: la lista JO es corta y
        # una obra antigua puede seguir apuntando a uno que ya no esta.
        for m in catalogo["managers"]:
            m.pop("active", None)

        jefe_por_codigo = {}
        for j in jefes:
            encontrado = next(
                (m for m in catalogo["managers"] if normalizar(m["name"]) == normalizar(j["name"])), None
            )
            if encontrado:
                jefe_por_codigo[j["codigo"]] = encontrado["id"]

        sin_jefe = set()
        for o in obras:
            codigo = o.pop("_codigoJefe", "")
            if codigo and codigo in jefe_por_codigo:
                o["managerId"] = jefe_por_codigo[codigo]
            elif codigo:
                sin_jefe.add(codigo)
        if sin_jefe:
            log(
                "AVISO: estos codigos de jefe de obra no existen en "
                + HOJA_JEFES
                + ", las obras se quedan sin jefe: "
                + ", ".join(sorted(sin_jefe))
            )

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
                ["name", "client", "active", "managerId"],
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
