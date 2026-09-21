# CLAUDE.md — Memoria del proyecto "Dulce María"

## 1. Qué es la app

App offline-first (HTML+CSS+JS puro, sin servidor propio) para **Obleas
Dulce María**, negocio de producción y venta de obleas y arequipe en
Sincelejo, Sucre. La usa la dueña (lucecita) en su celular/tablet de planta,
y un encargado en un celular en la calle (versión limitada). Controla:
producción por turno (Obleas, Arequipe), costeo de mano de obra/insumos,
inventario/bodega, ventas y facturación, nómina y préstamos a empleados,
finanzas (caja, bancos, cuentas por cobrar/pagar, balance general).

Nota: existe un documento (`contexto-proyecto-app-generica-costos.md`) sobre
generalizar esta app a otros negocios/clientes — la dueña confirmó (21 sep
2026) que esa idea queda **archivada/histórica** por ahora, no es un
objetivo activo de esta app.

## 2. Arquitectura

- 3 mini-apps originales, cada una una app HTML independiente:
  `obleas.html`, `arequipe.html`, `ventas.html` (+ Finanzas/Inventario/
  Nómina dentro de Ventas).
- Módulos JS compartidos entre las tres (`DM*` con patrón IIFE que expone
  una API pública): `costos.js`, `permisos.js`, `bodega.js`, `sync.js`,
  `autosync.js`, `deshacer.js`, `trabajadores.js`, `situacion.js`,
  `seguridad.js`, `corregir.js`, `saldos.js`, `apertura.js`, `recibo.js`,
  `catalogo.js`, `datos.js`, `avanzadas.js`.
- `build.py` une los tres HTML + módulos + `shell.*` (cáscara común: menú,
  cabecera) en un solo archivo, aislando el CSS y renombrando identificadores
  que chocan entre módulos (ver `toplevel.json`). Aplica una tabla `PARCHES`
  (búsqueda de texto exacto → reemplazo) para insertar/editar código de los
  HTML originales — **si el texto buscado ya no existe, el build falla a
  propósito** en vez de generar algo roto en silencio.
- Genera 3 variantes: `index.html` (datos reales, la dueña),
  `encargado.html` (sin finanzas/costos/utilidad — ver §5), `demo.html`
  (datos inventados, prefijo `demo_` en localStorage, nunca toca Firebase).
- **Nunca se edita el HTML compilado a mano.** Se edita el archivo fuente
  correspondiente y se corre `python3 build.py` (o `bash hacer.sh` para
  las 3 variantes + las 18 pruebas).
- `hacer.sh`: suite completa, 24 pasos, debe dar 0 fallos antes de entregar.

## 3. Mapa de archivos (fuente = raíz de este directorio)

- `obleas.html` / `arequipe.html` / `ventas.html` — las tres apps originales.
- `costos.js` — costeo + nómina + préstamos (`DMCostos`, `DMNomina`,
  `DMPrestamos`, `DMArequipeVentas`); puente producción→ventas.
- `permisos.js` (`DMPermisos`) — oculta secciones en la variante encargado.
- `bodega.js` (`DMBodega`) — compras/inventario de insumos, cuentas por pagar.
- `sync.js` (`DMSync`) / `autosync.js` (`DMAutoSync`) — unir datos entre los
  2 celulares (manual por archivo / automático por Firebase).
- `deshacer.js` (`DMDeshacer`) — revertir un registro de producción.
- `trabajadores.js`, `situacion.js`, `seguridad.js`, `corregir.js`,
  `saldos.js`, `apertura.js`, `recibo.js`, `catalogo.js`, `datos.js`,
  `avanzadas.js` — módulos de apoyo (ver tabla completa en `LEEME.md`).
- `build.py` — constructor; `toplevel.json` — mapa de símbolos globales;
  `extract_js.py` — extrae JS de los HTML originales.
- `test-*.js` (18 archivos, Playwright/Node) + `hacer.sh` — verificación.
- `index.html`, `encargado.html`, `demo.html` — **generados**, no tocar.
- `LEEME.md` — instrucciones de build (leer antes de tocar `build.py`).

## 4. Funciones clave

- `calcCostoVal(paq,harKg,gasCons,m1,m2,m3,ops,...)` — `obleas.html` — costo
  por paquete de oblea (harina+fijos+gas+MO+otros+arriendo).
- `calcMOporOps(ops)` — `obleas.html` — costo de mano de obra por lista de
  operarios del turno = jornal + bono por cada uno (ver §5).
- `getWorkerPago(nombre)` — `obleas.html` — jornal de un trabajador **sin**
  bono; lo usa `DMNomina.calcular()` para el pago de nómina de hoy.
- `corregirCostoHistoricoManoDeObra()` / `corregirJornalesNomina()` —
  `obleas.html` — migraciones one-time autoguardadas (ver §5).
- `DMCostos.manoDeObra(ops,m1,m2,m3)` / `.calcular(...)` — `costos.js` —
  espejo de lo anterior, compartido por Obleas y Arequipe.
- `DMNomina.calcular()` / `.liquidar()` — `costos.js` — cálculo y pago de
  nómina (Obleas + Arequipe), separa jornal de bono.
- `DMPrestamos.prestar()/.abonar()` — `costos.js` — préstamos a empleados
  (clase `financiero`, no afecta utilidad).
- `calcCostos()` / `verDesglose()` — `arequipe.html` — costeo por lote.
- `DMBodega.porPagar()` / `.egreso()` — `bodega.js` — compras con
  clasificación (producción vs. gasto) fijada al comprar, no al pagar.

## 5. Reglas y decisiones ya tomadas

- **Bono ($5.000/turno) — dos usos distintos, no confundir:**
  - Pago de nómina de HOY = solo jornal (sin bono). El bono se acumula
    aparte para pagarse en diciembre.
  - COSTO de mano de obra (para precio/margen) = jornal + bono. Aplica a
    Obleas y Arequipe por igual (corregido punto 27, ver §6).
- `getWorkerPago()` se usa solo para nómina y **nunca** debe llevar el bono.
- Encargado (`encargado.html`) nunca ve: utilidad, costos/márgenes, ni
  saldos consolidados de Caja/Bancos. Sí puede: vender, comprar, anotar
  gastos puntuales, ver stock, producir, nómina.
- `demo.html` nunca toca datos reales ni el canal Firebase real.
- Migración que toca datos ya guardados = siempre one-time, con bandera
  propia en localStorage; si la fórmula vuelve a cambiar, se **sube la
  versión de la bandera** (no se reutiliza ni se "desmarca").
- Llamadas tempranas en el arranque de un módulo pueden correr antes de que
  `var` más abajo en el mismo archivo tengan valor — si una migración
  necesita esas variables, diferir con `setTimeout(fn,0)`.
- Editar el texto de una función que un PARCHE de `build.py` busca por texto
  exacto rompe ese PARCHE — hay que actualizar ambos strings (buscar y
  reemplazar) a la vez.
- Préstamos/aportes de capital no cuentan como utilidad (clase `financiero`
  / `capital`, separado de `operativo`).

## 6. Cambios recientes (última sesión, 21 sep 2026)

- Punto (27): el costo de mano de obra de Obleas ahora incluye jornal+bono
  (antes solo jornal, quedó al revés de lo pedido). Cambios en
  `calcMOporOps`, fallback de `calcCostoVal`, fallback de `manoDeObra`
  (costos.js). `getWorkerPago` intacto. Bandera de migración subida a
  `...mo_corregido_21sep2026`. PARCHE de `build.py` actualizado. Verificado:
  13/13 (prueba puntual) + 24/24 `hacer.sh`. Documentado en el proyecto
  Claude, sección 27 de `estado-reconciliacion-final.md`.
- Se creó este `CLAUDE.md` como memoria de sesión.
- Reglas de seguridad de Firebase (proyecto `dulce-maria-sync`, Realtime
  Database) ya pegadas y publicadas por la dueña — confirmado 21 sep 2026.
  La base ya no depende del modo de prueba temporal; solo se puede
  leer/escribir dentro de `canales/<clave de 40 caracteres>/...`.

## 7. Pendientes actuales

- Sin pendientes explícitos de conversación en este momento.

## 8. Cómo trabajar con la dueña

- Pedir cambios precisos y ejemplos numéricos concretos cuando algo de
  costeo/nómina no cuadre (como en el punto 27).
- No releer archivos HTML completos de entrada — usar este archivo, `grep`
  y `toplevel.json` primero; leer solo la función/sección puntual que se va
  a tocar.
- Nunca editar `index.html`/`encargado.html`/`demo.html` directamente —
  siempre fuente + `build.py` + `hacer.sh` (0 fallos) antes de entregar.
- Al cerrar una tarea ("cierra tarea"), actualizar las secciones 6 y 7 de
  este archivo con lo hecho y lo que queda pendiente.
