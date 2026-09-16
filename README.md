# CRIMASA · Planificación de personal en obras

Aplicación web para planificar el personal de las obras día a día. **No lee ningún Excel**: todo se
rellena desde la propia web, se guarda en **Firestore** (lo ve cualquiera desde cualquier PC, en tiempo
real) y se puede exportar a `.xlsx` cuando haga falta.

## Pestañas

| Pestaña | Para qué sirve |
|---|---|
| **Asignación diaria** | Cuántas personas hacen falta en cada obra, por categoría. Se puede trabajar por **Día, Semana o Mes**: en semana y mes sale una rejilla de categorías × días editable de una vez, como en el Excel. |
| **Reparto por nombre** | Los muñecos: arrastras a cada trabajador al cajón de su obra. |
| **Previsión anual** | 12 meses de un vistazo; el calendario mantiene el número del día y resalta los que tienen previsión. Al pasar el ratón sale el detalle por obra. Junto a diciembre hay un panel para consultar un mes o un día concreto. |
| **Jefes y obras** | Alta de jefes de obra y de obras (código, nombre, expediente). |
| **Empleados** | Alta de trabajadores y categoría (la categoría da el color del muñeco). |
| **Vehículos** | La flota; se asigna a cada obra desde "Reparto por nombre". |

En "Reparto por nombre":

- **Arrastrar** un muñeco desde "Personas libres" hasta la obra.
- **Clic** en el muñeco y luego en la obra (alternativa al arrastre).
- **Arrastrar de una obra a otra** para mover a alguien.
- **Soltar sobre "Personas libres"** para liberar a alguien.
- Marcar *"Ver también los ya asignados"* si alguien tiene que estar en dos obras el mismo día.

Los vehículos funcionan igual: en cuanto asignas una matrícula a una obra en un turno, desaparece de la
lista de disponibles del resto de obras. Los ocupados siguen visibles al final del desplegable, en gris y
sin poder elegirse, indicando en qué obra están.

El contador de cada obra muestra `asignadas / previstas`: verde cuando cuadra con lo pedido en
"Asignación diaria", rojo si te has pasado.

## Acceso (login)

La app exige usuario y contraseña. No hay registro público: las cuentas las creas tú en
Firebase → Authentication → Users → Add user (correo y contraseña). Activa antes el proveedor
**Correo electrónico/contraseña** en Authentication → Sign-in method.

Si alguien olvida la contraseña, en la pantalla de login tiene "He olvidado la contraseña" y le llega un
correo de Firebase para cambiarla.

El correo del usuario queda grabado en cada día que toca, y se ve como "Última edición: ..." en las
pestañas de asignación y de reparto. También sale en el Excel.

## Datos compartidos (Firestore)

Todo se guarda en Firestore en dos sitios:

- `plan_catalogo/global` → jefes de obra, obras, empleados, vehículos, categorías, ausencias y festivos locales.
- `plan_dias/{AAAA-MM-DD}` → un documento por día con la planificación de ese día.

Son colecciones nuevas, independientes de las de FULLSERVICE, así que puedes reutilizar el mismo
proyecto de Firebase sin tocar nada de lo que ya funciona.

Los cambios se propagan **en tiempo real**: si Laura mueve a alguien de obra, tú lo ves en tu pantalla
sin recargar. El SDK arranca con `experimentalAutoDetectLongPolling`, porque en redes de empresa con
proxy o cortafuegos el canal en tiempo real de Firestore se corta en silencio y los cambios de los demás
no llegan hasta pulsar F5 — que es justo lo que pasaba antes. La píldora de la cabecera indica el estado: *En línea*, *Guardando…*, *Sin conexión* o
*Error al guardar*.

Escrituras: cada cambio escribe solo la parte que toca (`merge`), así que dos personas trabajando en
obras distintas del mismo día no se pisan. Si dos tocan **la misma obra el mismo día a la vez**, gana el
último en guardar — con 3 o 4 jefes de obra no es un problema real, pero conviene saberlo.

### Configuración

1. Consola de Firebase → Configuración del proyecto → Tus apps → Configuración del SDK.
2. Copia `.env.example` a `.env` y rellena los seis valores.
3. Copia el contenido de `firestore.rules` en Firestore → Reglas y publica.
4. Authentication → Sign-in method → activa **Correo electrónico/contraseña**.
5. Authentication → Users → Add user: crea una cuenta por persona (tú y cada jefe de obra).

Las reglas exigen usuario autenticado y cierran todo lo demás. Sin haber iniciado sesión, Firestore
rechaza cualquier lectura o escritura, así que no basta con conocer la URL.

## Fotos de los trabajadores

En la pestaña Empleados, haz clic en el hueco de la foto de cada fila y elige la imagen. Se recorta a un
cuadrado de 200 px y se comprime antes de guardarla, así que ocupa unos 12 KB por persona. Clic derecho
sobre la foto para quitarla. Sin foto, se dibuja el muñeco generado a partir del nombre.

Las fotos van en su propia colección (`plan_fotos`), una por trabajador, para no engordar el catálogo.

## Turno y dieta

Cada persona asignada a una obra tiene dos botones bajo el nombre: **DÍA/NOCHE** y **D** (dieta). Los
vehículos se asignan también por turno: la misma matrícula puede estar de día en una obra y de noche en
otra, como en el Excel. Si el mismo vehículo y turno acaba en dos obras el mismo día, la etiqueta se
marca en naranja.

## Ausencias

En la pestaña Empleados, panel "Ausencias": eliges persona, tipo (Vacaciones, Baja, Curso o Permiso) y
rango de fechas. Durante esos días esa persona no aparece entre las disponibles en "Reparto por nombre",
sale en la lista "No disponibles" con su motivo, y si ya estaba asignada a una obra se marca en naranja.

## Avisos automáticos

- **Duplicado**: si la misma persona está en dos obras el mismo día, su muñeco sale en naranja indicando
  en cuántas obras está. No lo impide (a veces es correcto), solo lo señala.
- **Festivo o fin de semana**: aviso en la cabecera del día. Los festivos nacionales y de Andalucía se
  calculan solos cada año, Semana Santa incluida. Los locales se añaden a mano en la pestaña
  "Previsión anual".

## Primera carga desde Excel

Botón **Cargar Excel** en la cabecera. El archivo de partida es
`DATOS_PLANIFICACION_ANUAL.xlsx`, en `\\192.168.1.200\dpto gestión\2026\MACROS\CONEXION A DB`,
que se refresca solo cada 120 minutos desde la base de datos. De él salen obras, personal, vehículos y
jefes de obra, **leyendo siempre las hojas CyM** (CRIMASA y MAC juntos).

Además admite los dos libros antiguos:

- `PLANIFICACIÓN_ANUAL_CRIMASA.xlsx` → hoja PREVISION (jefes de obra, obras y previsión por categoría,
  agrupando ST y BAL en una sola categoría) y hoja PERSONAL.
- `PERSONAL_CRIMASA_2026.xlsm` → hojas ACTIVAS (obras con cliente), DATOS VEHICULOS, PERSONAL y todas
  las hojas SEMANAxx (reparto por nombre, con turno día/noche, vehículo y dieta; BAJA y VACACIONES se
  convierten en ausencias con su rango de fechas).

Primero enseña un resumen de lo leído y los avisos; no escribe nada hasta que confirmes. Dos modos:
**Fusionar** (añade y actualiza, conserva lo que ya haya) o **Reemplazar** (borra todo y deja solo el
Excel). Sube primero el libro anual y después el semanal, en ese orden, para que las obras existan
cuando se lea el reparto.

Si en el reparto aparece un código de obra que no está en ACTIVAS, la obra se crea sola para no perder
la asignación, y se avisa en el resumen.

## Actualización diaria automática

`scripts/sincronizar_maestros.py` mantiene al día **jefes de obra, personal, vehículos y obras** leyendo
`DATOS_PLANIFICACION_ANUAL.xlsx` (hojas CyM). No toca la planificación, solo las fichas. Pensado para una
tarea programada una vez al día.

```bash
pip install firebase-admin openpyxl
python sincronizar_maestros.py --simular     # informa de los cambios sin escribir
python sincronizar_maestros.py               # los aplica
```

Ruta del Excel en `RUTA_EXCEL` o en la variable de entorno `PLAN_EXCEL`; por defecto ya apunta a la
carpeta de CONEXION A DB. Cómo decide qué hacer:

- Ficha en el Excel que no está en Firestore → se crea.
- Ficha en los dos → se actualizan sus datos conservando su id.
- Ficha que ya no aparece en el Excel → se marca como baja. **Nunca se borra**, porque la planificación
  de los días pasados apunta a ese id y borrarla dejaría huecos en el histórico.

Los jefes de obra son la excepción: se añaden y se actualizan, pero **no se dan de baja solos**, porque
la lista es corta y una obra antigua puede seguir apuntando a uno que ya no está.

Lleva dos frenos de seguridad: si la hoja de personal sale vacía, o si trae menos de la mitad de
trabajadores de los que hay en Firestore, aborta sin tocar nada. Un Excel a medio guardar o una hoja
renombrada no puede darte de baja a la plantilla entera.

## Copia de seguridad automática

En `scripts/backup_planificacion.py` tienes un script que exporta Firestore a un JSON con fecha en la
carpeta que le digas, y conserva las últimas 12 copias. El archivo vale para el botón "Restaurar" de la
web, así que una copia sirve para recuperar de verdad, no solo para mirarla.

```bash
pip install firebase-admin
```

Necesita una clave de cuenta de servicio: Firebase → Configuración del proyecto → Cuentas de servicio →
Generar nueva clave privada. Guarda ese JSON en una carpeta local y **no lo subas a GitHub** (da acceso
total a la base de datos). Ajusta `RUTA_CREDENCIALES` y `CARPETA_DESTINO` en la cabecera del script, o
pásalos como variables de entorno `PLAN_CREDENCIALES` y `PLAN_DESTINO`.

Luego, Programador de tareas de Windows: semanal, acción `python C:\scripts\backup_planificacion.py`.
El script devuelve código 1 si falla, así que la tarea se marca en rojo si algo va mal.

## Exportar a Excel

Botón **Exportar a Excel** en la cabecera. Eliges rango de fechas y formato:

- **Detalle**: hojas *Resumen diario*, *Reparto por nombre*, *Asignación diaria*, *Vehículos*, más las
  fichas de obras, empleados y vehículos.
- **Cuadrante**: obras en filas, días en columnas, con el total de personas por día.

## Logo

Copia `crimasa-logo.png` en la carpeta `public/`. Si no está, aparece un emblema dibujado en su lugar y
la app sigue funcionando. Lo mismo con `public/favicon.png`.

Para sacar el logo del proyecto de Lovable: abre la vista previa, clic derecho sobre el logo →
*Guardar imagen como…*. El archivo está en
`https://preview--site-staff-simple.lovable.app/__l5e/assets-v1/2b3206d7-2ab8-4f0b-b469-9f359adc42cf/crimasa-logo.png`.

## Arrancar en local

```bash
npm install
cp .env.example .env    # y rellenar
npm run dev
```

http://localhost:5173

## GitHub y Vercel

```bash
cd crimasa-planificacion
git init
git add .
git commit -m "Planificacion de personal CRIMASA"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/crimasa-planificacion.git
git push -u origin main
```

En Vercel: **Add New → Project → Import Git Repository**. Detecta Vite solo; si lo pregunta:

- Framework Preset: **Vite**
- Build Command: `npm run build`
- Output Directory: `dist`

**Importante**: antes del primer despliegue, añade las seis variables `VITE_FIREBASE_*` en
Settings → Environment Variables (marca Production, Preview y Development). Si faltan, la app arranca
pero muestra una pantalla explicando qué falta en lugar de quedarse en blanco.

También hay que añadir el dominio de Vercel en Firebase → Authentication → Settings → Dominios
autorizados, si usas la opción con login anónimo.

Cada `git push` a `main` redespliega solo.

## Detalles técnicos

- Vite + React 18 + TypeScript, CSS propio (sin Tailwind).
- `firebase` (Firestore en tiempo real + Auth), `xlsx` (SheetJS, se carga solo al exportar), `lucide-react`.
- Festivos calculados en `src/festivos.ts` (algoritmo de Meeus para la Pascua), sin depender de internet.
- Los muñecos son SVG generados del nombre: el mismo nombre da siempre la misma cara.
- Arrastrar y soltar usa el drag nativo de HTML5, pensado para PC. **En tablet o móvil el arrastre no
  funciona**; ahí se usa clic en la persona + clic en la obra, que sí está implementado.
- La primera vez que arranca contra una base vacía crea los datos de ejemplo. Pulsa *Restablecer*
  cuando vayas a meter los reales.
