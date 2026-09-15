# CRIMASA · Planificación de personal en obras

Aplicación web para planificar el personal de las obras día a día. **No lee ningún Excel**: todo se
rellena desde la propia web, se guarda en **Firestore** (lo ve cualquiera desde cualquier PC, en tiempo
real) y se puede exportar a `.xlsx` cuando haga falta.

## Pestañas

| Pestaña | Para qué sirve |
|---|---|
| **Asignación diaria** | Cuántas personas hacen falta en cada obra, por categoría (números). |
| **Reparto por nombre** | Los muñecos: arrastras a cada trabajador al cajón de su obra. |
| **Previsión anual** | 12 meses de un vistazo con la carga de personal de cada día. |
| **Jefes y obras** | Alta de jefes de obra y de obras (código, nombre, expediente). |
| **Empleados** | Alta de trabajadores y categoría (la categoría da el color del muñeco). |
| **Vehículos** | La flota; se asigna a cada obra desde "Reparto por nombre". |

En "Reparto por nombre":

- **Arrastrar** un muñeco desde "Personas libres" hasta la obra.
- **Clic** en el muñeco y luego en la obra (alternativa al arrastre).
- **Arrastrar de una obra a otra** para mover a alguien.
- **Soltar sobre "Personas libres"** para liberar a alguien.
- Marcar *"Ver también los ya asignados"* si alguien tiene que estar en dos obras el mismo día.

El contador de cada obra muestra `asignadas / previstas`: verde cuando cuadra con lo pedido en
"Asignación diaria", rojo si te has pasado.

## Datos compartidos (Firestore)

Todo se guarda en Firestore en dos sitios:

- `plan_catalogo/global` → jefes de obra, obras, empleados, vehículos y categorías.
- `plan_dias/{AAAA-MM-DD}` → un documento por día con la planificación de ese día.

Son colecciones nuevas, independientes de las de FULLSERVICE, así que puedes reutilizar el mismo
proyecto de Firebase sin tocar nada de lo que ya funciona.

Los cambios se propagan **en tiempo real**: si Laura mueve a alguien de obra, tú lo ves en tu pantalla
sin recargar. La píldora de la cabecera indica el estado: *En línea*, *Guardando…*, *Sin conexión* o
*Error al guardar*.

Escrituras: cada cambio escribe solo la parte que toca (`merge`), así que dos personas trabajando en
obras distintas del mismo día no se pisan. Si dos tocan **la misma obra el mismo día a la vez**, gana el
último en guardar — con 3 o 4 jefes de obra no es un problema real, pero conviene saberlo.

### Configuración

1. Consola de Firebase → Configuración del proyecto → Tus apps → Configuración del SDK.
2. Copia `.env.example` a `.env` y rellena los seis valores.
3. Copia el contenido de `firestore.rules` en Firestore → Reglas y publica.

Las reglas que dejo por defecto permiten leer y escribir a cualquiera que tenga la URL. Para una
herramienta interna suele valer, pero **no es seguridad real**. En el mismo archivo tienes comentada la
versión que exige usuario autenticado (activando el proveedor "Anónimo" en Firebase → Authentication).
Si quieres control de verdad, con usuario y contraseña por jefe de obra, se añade en un rato.

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
- `firebase` (Firestore en tiempo real), `xlsx` (SheetJS, se carga solo al exportar), `lucide-react`.
- Los muñecos son SVG generados del nombre: el mismo nombre da siempre la misma cara.
- Arrastrar y soltar usa el drag nativo de HTML5, pensado para PC. **En tablet o móvil el arrastre no
  funciona**; ahí se usa clic en la persona + clic en la obra, que sí está implementado.
- La primera vez que arranca contra una base vacía crea los datos de ejemplo. Pulsa *Restablecer*
  cuando vayas a meter los reales.
