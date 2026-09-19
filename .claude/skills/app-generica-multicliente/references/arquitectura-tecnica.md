# Arquitectura técnica detallada — patrón Dulce María → genérico multi-cliente

Fuente: documentos del proyecto del usuario (`guia-arquitectura-app-ejemplo.md`,
`dulce-maria-proyecto-completo.md`, `estado-real-index-vs-fuentes.md`,
`guia-modulo-generico-multicliente.md`) y el código real de `index.html`.
Lee este archivo cuando vayas a tocar código real (construir una variante,
generalizar un módulo, depurar el build) — el SKILL.md es el resumen para
decidir qué hacer, esto es el cómo exacto.

## Stack y por qué

Cero backend, cero build tools en el navegador. HTML+CSS+JS puro, corre
como archivo local o publicado en GitHub Pages. La razón es de negocio: la
app debe funcionar sin internet en planta y en la calle, así que un
servidor propio quedó descartado desde el diseño. Internet solo se usa,
opcionalmente, para sincronizar entre dispositivos y para llamar a la IA de
lectura de fotos.

El archivo final es estático pero no se escribe a mano: `build.py` toma
mini-apps que nacieron por separado (`obleas.html`, `arequipe.html`,
`ventas.html`, cada una con su propio HTML/CSS/JS) y las funde en un
`index.html`. Usa parsers reales, no regex:
- `acorn` para JS: detecta nombres de función/variable que chocan entre
  módulos y les pone prefijo (`ob_`, `ar_`, `vt_`).
- `tinycss2` para CSS: aísla el estilo de cada módulo bajo `#mod-<módulo>`.

**El archivo final nunca se edita a mano** — todo cambio va en las piezas
fuente y se reconstruye. Editar el final directo desincroniza todo y ya
pasó una vez en este proyecto.

## Estructura de módulos (Dulce María, base actual)

- `shell.js/css` + `shell_header.html/footer.html`: cáscara común — barra
  de módulos, cambio de pestaña, núcleo de datos compartido (`DM`).
- Lógica compartida entre mini-apps: `catalogo.js` (traduce nombres de
  producto entre módulos), `costos.js` (puente producción→ventas),
  `datos.js`/`datos_cli.js`, `recibo.js` (facturación), `saldos.js`,
  `apertura.js`, `deshacer.js`.
- `sync.js`/`autosync.js`: sincronización entre celulares.
- `permisos.js`: oculta pantallas según perfil.
- `toplevel.js`/`extract_js.py`: detectan colisiones de símbolos.
- 15-18 archivos `test*.js` con Playwright, encadenados en `hacer.sh`.
- Salida: `index.html` (real), `demo.html`, `encargado.html` — generados,
  nunca editados a mano.

## Base de datos

Sin servidor propio: cada dispositivo guarda todo en su propio navegador.
- **IndexedDB**: lo que puede crecer mucho o necesita consultarse por
  campos (facturas, movimientos, finanzas, cierres — 6 stores en Ventas).
- **localStorage**: lo más simple (turnos, lotes, préstamos, configuración).

Patrón clave para poder sincronizar después: cada tipo de registro tiene
una función que le saca una "llave natural" (ej. un movimiento de
inventario se identifica por `fecha+insumo+tipo+cantidad`), no un ID de
dispositivo — así se puede unir el trabajo de dos celulares sin duplicar ni
perder nada. **El stock nunca se sincroniza como saldo** (sumar dos saldos
inventa un número); se reconstruye solo a partir de los movimientos, que sí
se sincronizan como hechos con número propio — patrón event-sourced.

## Auth / perfiles

No hay autenticación de servidor ni login. Lo que hay: un PIN local delante
de la clave de IA y del panel de respaldo/restauración (`DMSeguridad`) —
"es una tranca, no una caja fuerte", documentado con esa honestidad en el
propio código. El control de acceso real se resuelve con perfiles/variantes:
`build.py` genera versiones distintas del mismo código (`dulcemaria`,
`demo`, `encargado`) con un diccionario de configuración, y `permisos.js`
oculta en pantalla lo que ese perfil no debe ver (finanzas, costos,
utilidad). La capa que de verdad protege no es esconder el botón: el
paquete de datos que un celular le manda a otro simplemente no incluye el
costo ni el margen — nunca sale del dispositivo del dueño.

### Extensión multi-cliente (capa nueva, encima de lo anterior)

Lo de arriba resuelve "quién ve qué dentro de un mismo negocio". Falta:
"qué negocio es este, y su copia sigue vigente":
1. Código de activación simple, no login — se pide una vez al abrir por
   primera vez, se guarda en `localStorage`, mismo patrón que la clave de IA.
2. Chequeo de vigencia solo cuando hay señal, nunca bloqueante offline: si
   el código sigue vigente en una fuente remota simple (hoja de cálculo
   publicada o webhook gratuito con columna "válido hasta"), la app guarda
   esa respuesta y sigue sirviendo offline con la última conocida. Sin
   esto no hay forma de cortar acceso a quien deja de pagar — parte del
   primer piloto, no opcional, porque el cobro es recurrente.
3. Peldaño intermedio entre "candado que no existe" (Dulce María hoy) y
   "SaaS con login" (descartado por el requisito offline). No hay base de
   datos por cliente ni panel — es una pregunta sí/no con fecha de corte.
4. El PIN local sigue igual, es ortogonal: protege el dispositivo, no la
   licencia.
5. Cada copia generada necesita su propio prefijo de almacenamiento — no
   por privacidad entre módulos (eso ya lo resuelve `build.py` para
   demo/blanco/encargado), sino porque distintos clientes podrían terminar
   publicando su copia bajo el mismo dominio de GitHub Pages de quien
   vende el producto.

## Lectura de fotos por IA con clave propia del cliente

Patrón central para replicar en cualquier negocio nuevo. Cada negocio pone
su propia clave de API de Anthropic (`sk-ant-...`) en el panel ⚙️ Config,
se guarda en `localStorage` (`dm_apikey` / `obleas_apikey`), y la llamada a
la IA sale **directo desde el navegador del cliente**, nunca pasa por un
servidor propio — el costo de cada escaneo lo paga cada negocio con su
propia cuenta de Anthropic, y no hay backend que guarde ni vea esas claves.
Esto es importante para el modelo de negocio: el usuario no carga con el
costo variable de IA de todos sus clientes.

Mecánica concreta (reutilizable tal cual, no depende del negocio):
- `fetchAnthropic(body)` arma el POST a `https://api.anthropic.com/v1/messages`
  con headers `x-api-key` (la clave del `localStorage`), `anthropic-version`
  y `anthropic-dangerous-direct-browser-access: true` (necesario por ser
  llamada browser→API directa, sin proxy propio).
  - **Nota para Claude en artifacts**: este es el mismo patrón que
    `fetch("https://api.anthropic.com/v1/messages")` en `anthropic_api_in_artifacts`,
    pero aquí la clave la pone el cliente final, no Anthropic/la plataforma.
- Si falla por red/CORS, cae a un proxy público (`corsproxy.io`) como
  respaldo — no como método principal.
- Modelo usado: `claude-sonnet-4-5` (o `4-6` según el módulo),
  `temperature: 0`, mensaje con imagen en base64
  (`type: 'image', source: {type:'base64', media_type, data}`) + prompt de
  texto detallado y específico del documento a leer (remisión, planilla de
  producción, factura) — instrucciones como "lee solo la casilla de marca,
  no el manuscrito", reglas de conversión de unidades, formato de fecha.
- El prompt de identidad/comportamiento general (JSON siempre, nunca
  rechazar por mala calidad, entender RUT/NIT/RFC/RUC/DNI de toda
  Latinoamérica, monedas, fechas) está documentado en `00-LEEME.md` como
  las "instrucciones del proyecto" — es genérico, no se toca por cliente.
- La respuesta de texto se recorta al primer bloque `{...}` y pasa por
  `repararJSON()`, una cadena de reparaciones progresivas (comillas
  simples→dobles, comas colgantes, claves sin comillas) antes de tirar el
  parseo como fallido — tolera que el modelo no devuelva JSON perfecto.
- Manejo de errores específico por código: `401` → "clave incorrecta",
  `429` → reintenta hasta 3 veces con backoff, `403` → "sin créditos,
  recarga en console.anthropic.com".
- Si no hay clave configurada, la sección de escaneo ni se muestra
  (`checkApiKey()` oculta el área y muestra aviso de configurar clave
  primero) — nunca se intenta la llamada sin clave.

### Qué cambia por cliente (única parte configurable)

Solo **el prompt específico del documento** — qué campos extraer, qué
abreviaciones reconocer, reglas de conversión propias del negocio (ej. la
de harina en gramos→kg de Dulce María). Tiene que salir de
`config_negocio.js`: una plantilla por tipo de documento (remisión propia,
planilla de producción propia, factura de compra) que el negocio define
con sus campos, no el programador. En código: `PROMPT_IA` deja de ser
constante fija en el fuente y se construye en tiempo de ejecución a partir
de la plantilla configurada, concatenada con el bloque de identidad
genérico que sí se mantiene fijo.

## El generador de copias (evolución de `build.py --variante`)

Hoy generar una variante nueva es correr Python a mano con Claude Code o
Cowork abierto. Para escalar a "no necesariamente siempre instala el
usuario", el generador tiene que ser un proceso repetible:

1. Entrada: nombre del negocio, catálogo, insumos, receta de costeo,
   trabajadores, plantilla de remisión/documento, código de activación.
2. `build.py --variante=blanco` ya genera una copia vacía. Paso nuevo:
   `inyectar_config_cliente(datos)` llena esa copia con los datos de un
   negocio específico — mismo patrón de "parche que falla a propósito" si
   algún campo requerido no llega.
3. Salida: un `index.html` autocontenido, listo para entregar como hoy se
   comparte `demo.html` por WhatsApp — un archivo, no una URL pública
   compartida entre clientes (el repo público de GitHub Pages sirve para
   demos, no para el archivo real de un cliente pagador).

## Checklist antes de dar por lista una variante nueva

1. ¿`config_negocio.js` tiene catálogo, insumos, receta, trabajadores y
   plantilla de documento de ESTE cliente — nada hardcodeado en módulos?
2. ¿`motor_costeo.js` lee la receta de config, no tiene fórmula fija?
3. ¿El prompt de IA se construye desde la plantilla de `config_negocio.js`?
4. ¿El código de activación y el chequeo de vigencia offline-friendly están
   integrados?
5. ¿Prefijo de almacenamiento único para esta copia?
6. ¿Corrieron las pruebas Playwright relevantes?
7. ¿Se verificó la deuda técnica conocida (módulos no portados a fuentes:
   `DMTrabajadores`, `DMBodega`, `DMCorregir`, `DMSituacion`, `DMSeguridad`)
   antes de correr el build?
