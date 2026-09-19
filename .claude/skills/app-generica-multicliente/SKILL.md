---
name: app-generica-multicliente
description: >
  Patrón de arquitectura del usuario para construir apps de control de negocio
  (producción, inventario, costeo, ventas, nómina) offline-first en
  HTML+CSS+JS puro, sin servidor propio, generadas con un constructor Python
  (build.py) a partir de mini-apps separadas. Úsala SIEMPRE que el usuario
  pida construir, adaptar, generalizar o crear una variante de una app de
  negocio a partir de la app base "Dulce María" (obleas/arequipe) o del
  prototipo genérico, aunque no lo diga con esas palabras. Por ejemplo,
  frases como "hazme una versión para [otro negocio]", "arma la app para
  este cliente" o "cómo genero una copia nueva". También úsala cuando
  mencione config_negocio, motor_costeo, build.py, index.html generado,
  lectura de fotos por IA con clave propia, o licencia y activación offline,
  o cuando pida delegar a Claude Code la construcción de una app siguiendo
  "cómo yo lo hago".
---

# App genérica multi-cliente (patrón Dulce María)

Esta skill documenta CÓMO el usuario construye sus apps de negocio, para que
cualquier instancia de Claude (chat o Claude Code) pueda extender el patrón
sin tener que re-explicarlo cada vez. Es la base técnica para generar copias
nuevas por cliente ("Camino A": copias independientes, offline-first,
código de activación simple — no SaaS con login).

**Antes de escribir código nuevo para un cliente, lee `references/arquitectura-tecnica.md`
completo** — tiene la mecánica exacta (nombres de archivos, funciones, manejo
de errores) que no cabe aquí. Este SKILL.md es el resumen operativo.

## Principio de diseño no negociable

**Cero backend, cero build tools en el navegador.** HTML+CSS+JS puro que
corre local o en GitHub Pages. Es una decisión de negocio, no de gusto
técnico: la app tiene que funcionar sin internet en planta/calle. Cualquier
propuesta que introduzca un servidor propio para lógica de negocio (no para
IA, ver abajo) rompe el requisito central — hay que señalarlo antes de
construir en esa dirección.

## Qué se reutiliza TAL CUAL (no reinventar)

Esto ya está resuelto y probado — es ~70% del trabajo:

- Offline-first: IndexedDB (datos que crecen / se consultan por campo) +
  localStorage (config simple). Cero servidor propio.
- `build.py`: constructor que funde mini-apps HTML/CSS/JS separadas en un
  `index.html` final, usando `acorn` (JS, prefija símbolos para evitar
  colisiones: `ob_`, `ar_`, `vt_`) y `tinycss2` (CSS, aísla bajo
  `#mod-<módulo>`). **Regla de oro: el archivo final generado NUNCA se
  edita a mano** — todo cambio va en las fuentes y se reconstruye.
- Patrón de variantes: distintas "caras" del mismo código (demo, blanco,
  por cliente) generadas por configuración, nunca copiando código.
- Llave natural por registro (no ID de dispositivo) + kardex event-sourced:
  el stock nunca se sincroniza como saldo, se reconstruye desde movimientos.
- Sincronización en dos capas: manual por archivo y automática por
  internet, misma función subyacente.
- Privacidad en dos capas: ocultar en pantalla (`permisos.js`) Y no incluir
  el dato en lo que se sincroniza entre dispositivos.
- PIN local (`DMSeguridad`) delante de la clave de IA y el panel de
  respaldo — "es una tranca, no una caja fuerte".
- Pruebas Playwright sobre Chromium real, un archivo por tema, que crecen
  con cada bug encontrado — nunca se salta este paso al agregar algo nuevo.
- Patrón de "parche que falla a propósito" en vez de fallar en silencio.

## Qué SÍ cambia: de código fijo a dato de instalación

La diferencia entre Dulce María (un negocio) y el producto vendible
(cualquier negocio) es mover esto de "escrito a mano en JS" a "tabla
configurable desde la app":

| Qué | Hoy (fijo en código) | Debe ser |
|---|---|---|
| Catálogo de productos | `catalogo.js` hardcodeado | Tabla configurable (nombre + alias) |
| Insumos/materiales | arrays fijos por módulo | Tabla: insumo, unidad, precio |
| Receta/fórmula de costeo | funciones fijas | Motor de costeo que lee la receta como dato |
| Trabajadores | resuelto para un módulo, falta generalizar a todos | Genérico por línea/módulo |
| Formato de remisión/factura | layout fijo en canvas | Plantilla configurable por campos |

La mecánica alrededor (cómo se calcula costo, se descuenta stock, se
sincroniza, se oculta por perfil) **sigue siendo código fijo** — lo que
cambia es que lea configuración en vez de tener valores incrustados.

**Pregunta de diseño abierta, no decidir en abstracto:** si un solo motor
de costeo sirve para negocios "por lote/turno" y "por proyecto" (obra,
evento), o si son dos motores. Necesita 1-2 casos reales de cada tipo antes
de programarse — no asumir una respuesta al construir para un cliente nuevo.

## Estructura de carpetas objetivo

```
constructor/
├── produccion_generica.html   ← módulo de "lotes/avances" contra receta de config
├── ventas.html                ← se mantiene, es el módulo más maduro
├── config_negocio.js          ← catálogo, insumos, receta, trabajadores, plantilla — sin tocar código
├── motor_costeo.js            ← generalización de costos.js, lee receta de config_negocio
├── build.py                   ← agrega inyectar_config_cliente(datos)
├── shell.js/css, catalogo.js, datos.js, sync.js, autosync.js,
│   permisos.js, deshacer.js   ← se reutilizan casi sin cambios
├── ia_lectura.js              ← prompt configurable por tipo de documento (ver abajo)
├── test*.js                   ← + nuevos para config_negocio y motor_costeo
└── index.html                 ← por cliente, generado, nunca editado a mano
```

## Auth / licencia (no login, código de activación)

- Código de activación simple, se pide una vez, se guarda en `localStorage`
  — mismo patrón que la clave de IA.
- Chequeo de vigencia SOLO cuando hay señal de internet, nunca bloqueante
  offline: guarda la última respuesta conocida y sigue sirviendo con ella.
  Es parte del primer piloto, no un "nice to have", porque el cobro es
  recurrente y sin esto no hay forma de cortar acceso.
- El PIN local (`DMSeguridad`) es una capa distinta y ortogonal: protege el
  dispositivo, no la licencia.
- Cada copia generada necesita su propio prefijo de almacenamiento (no solo
  por variante) si dos clientes terminan bajo el mismo dominio.

## IA de lectura de fotos — patrón que se mantiene igual

- **Cada negocio usa su propia clave de API de Anthropic**, guardada en
  `localStorage`, y la llamada sale directo navegador→Anthropic. Nunca pasa
  por un servidor propio del usuario. Esto es intencional para el modelo de
  negocio: cada cliente paga su propio consumo de IA.
- Lo único configurable por cliente es **el prompt específico del
  documento** (qué campos extraer, reglas de conversión propias). El
  bloque de identidad/comportamiento general (JSON siempre, formatos
  latinoamericanos de documento/moneda/fecha) es genérico y no se toca.
- La mecánica de fetch, reintentos, fallback a proxy CORS y reparación de
  JSON malformado es 100% reutilizable — nunca reprogramarla por cliente.
  Detalle exacto en `references/arquitectura-tecnica.md`.

## Generar una copia nueva para un cliente (flujo)

1. Reunir: nombre del negocio, catálogo, insumos, receta de costeo,
   trabajadores, plantilla de documento, código de activación.
2. Llenar `config_negocio.js` con esos datos — nunca escribir el catálogo
   o la receta directo en un módulo de lógica.
3. Confirmar que `motor_costeo.js` e `ia_lectura.js` leen de esa config, no
   de valores fijos.
4. Correr `build.py` (con `inyectar_config_cliente`) para producir el
   `index.html` autocontenido de ese cliente.
5. Correr las pruebas Playwright relevantes antes de entregar — no al
   final del proyecto completo, en paralelo con cada pieza nueva.
6. Entregar como archivo único (igual que `demo.html` hoy), no como URL
   pública compartida entre clientes.

## Deuda técnica conocida — revisar antes de tocar build.py

Hay módulos ya en producción en el `index.html` compilado real
(`DMTrabajadores`, `DMBodega`, `DMCorregir`, `DMSituacion`, `DMSeguridad`)
que todavía **no están portados de vuelta** a las fuentes / `build.py`. Si
se corre el build hoy tal cual, esos módulos se pierden. Antes de generalizar
o generar una copia nueva, verificar si esto ya se resolvió; si no, es
prerrequisito.

## Contexto de negocio (para orientarse, no son reglas fijas)

El usuario planea vender este prototipo genérico cobrando una cantidad
pequeña por copia/licencia. Preguntas todavía abiertas y que cambian por
conversación con cada cliente piloto (no asumir una respuesta): motor de
costeo único vs. dos, con qué negocios pilotar primero, qué tan "en blanco"
arranca cada copia, quién da soporte. No tomar estas decisiones por el
usuario — solo tenerlas presentes.
