"""
Copia de seguridad de la planificacion de personal (Firestore -> carpeta compartida).

Exporta las colecciones plan_catalogo y plan_dias a un unico JSON con fecha,
en el mismo formato que el boton "Copia de seguridad" de la web, de modo que el
archivo se puede restaurar desde la propia aplicacion con el boton "Restaurar".

Uso previsto: tarea programada de Windows, una vez por semana.

Requisitos:
    pip install firebase-admin

Configuracion:
    1. Consola de Firebase -> Configuracion del proyecto -> Cuentas de servicio
       -> Generar nueva clave privada. Guarda el JSON en una carpeta que solo
          leas tu (NO lo subas a GitHub).
    2. Ajusta RUTA_CREDENCIALES y CARPETA_DESTINO aqui abajo, o pasalos como
       variables de entorno PLAN_CREDENCIALES y PLAN_DESTINO.

Salida:
    CARPETA_DESTINO/planificacion_AAAA-MM-DD.json
    Se conservan las ultimas COPIAS_A_CONSERVAR y se borran las mas antiguas.
"""

import json
import os
import sys
import traceback
from datetime import datetime
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore

# --------------------------------------------------------------------------
# Configuracion
# --------------------------------------------------------------------------

RUTA_CREDENCIALES = os.environ.get(
    "PLAN_CREDENCIALES",
    r"C:\scripts\credenciales\planificacion-firebase.json",
)

CARPETA_DESTINO = os.environ.get(
    "PLAN_DESTINO",
    r"\\NAS\compartida\INFORMATICA\backups\planificacion",
)

COL_CATALOGO = "plan_catalogo"
DOC_CATALOGO = "global"
COL_DIAS = "plan_dias"

COPIAS_A_CONSERVAR = 12

# --------------------------------------------------------------------------


def log(mensaje: str) -> None:
    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {mensaje}", flush=True)


def conectar():
    if not Path(RUTA_CREDENCIALES).is_file():
        raise FileNotFoundError(
            f"No encuentro el archivo de credenciales: {RUTA_CREDENCIALES}"
        )
    cred = credentials.Certificate(RUTA_CREDENCIALES)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    return firestore.client()


def exportar(db) -> dict:
    catalogo_doc = db.collection(COL_CATALOGO).document(DOC_CATALOGO).get()
    if not catalogo_doc.exists:
        raise RuntimeError(
            "El documento plan_catalogo/global no existe. "
            "Comprueba que la aplicacion ha arrancado al menos una vez."
        )

    datos = dict(catalogo_doc.to_dict() or {})

    dias = {}
    for doc in db.collection(COL_DIAS).stream():
        dias[doc.id] = doc.to_dict() or {}

    datos["days"] = dias
    datos["version"] = 2
    datos["_exportado"] = datetime.now().isoformat(timespec="seconds")

    log(
        "Exportados: "
        f"{len(datos.get('managers', []))} jefes de obra, "
        f"{len(datos.get('works', []))} obras, "
        f"{len(datos.get('employees', []))} empleados, "
        f"{len(datos.get('vehicles', []))} vehiculos, "
        f"{len(datos.get('absences', []))} ausencias, "
        f"{len(dias)} dias planificados"
    )

    # Aviso: si la base esta practicamente vacia, algo va mal y conviene saberlo
    # antes de sobrescribir copias buenas con una copia inutil.
    if not datos.get("employees") and not dias:
        log("AVISO: la base de datos parece vacia. Revisa antes de fiarte de esta copia.")

    return datos


def guardar(datos: dict) -> Path:
    destino = Path(CARPETA_DESTINO)
    destino.mkdir(parents=True, exist_ok=True)
    archivo = destino / f"planificacion_{datetime.now():%Y-%m-%d}.json"
    # Se escribe primero a un temporal para no dejar un archivo a medias
    # si el proceso se corta o se cae la red al NAS.
    temporal = archivo.with_suffix(".json.tmp")
    temporal.write_text(json.dumps(datos, ensure_ascii=False, indent=2), encoding="utf-8")
    temporal.replace(archivo)
    log(f"Copia guardada en {archivo} ({archivo.stat().st_size / 1024:.1f} KB)")
    return archivo


def rotar() -> None:
    destino = Path(CARPETA_DESTINO)
    copias = sorted(destino.glob("planificacion_*.json"), reverse=True)
    for viejo in copias[COPIAS_A_CONSERVAR:]:
        try:
            viejo.unlink()
            log(f"Borrada copia antigua: {viejo.name}")
        except OSError as err:
            log(f"No se pudo borrar {viejo.name}: {err}")


def main() -> int:
    try:
        log("Iniciando copia de seguridad de la planificacion")
        db = conectar()
        datos = exportar(db)
        guardar(datos)
        rotar()
        log("Copia completada correctamente")
        return 0
    except Exception as err:  # noqa: BLE001 - se registra y se devuelve codigo de error
        log(f"ERROR: {err}")
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
