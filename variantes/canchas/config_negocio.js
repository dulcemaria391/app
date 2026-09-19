/*
 * config_negocio.js — Configuración del negocio (DATO de instalación, no lógica)
 *
 * Variante: Canchas deportivas (alquiler por hora/turno)
 * Patrón: ver .claude/skills/app-generica-multicliente/SKILL.md
 *
 * REGLA DE ORO: este archivo es la ÚNICA fuente de catálogo, insumos, receta
 * de costeo, trabajadores y plantillas. Ningún módulo de lógica
 * (motor_costeo.js, produccion_generica.html, ia_lectura.js) debe traer
 * estos datos escritos a mano — todos deben leer de CONFIG_NEGOCIO.
 *
 * No hay una "ficha" del cliente real todavía: los valores de negocio,
 * catálogo, precios y receta de abajo son un EJEMPLO representativo de un
 * negocio de canchas (fútbol 5/8, tenis, pádel, baloncesto) para que
 * motor_costeo.js tenga algo real que costear. Antes de entregarle esta
 * copia a un cliente, reemplazar todo lo marcado "// EJEMPLO" con los datos
 * reales de ese negocio (flujo: ver SKILL.md, sección "Generar una copia
 * nueva para un cliente").
 */
(function (global) {
  'use strict';

  var CONFIG_NEGOCIO = {

    negocio: {
      nombre: 'Canchas Deportivas El Golazo', // EJEMPLO
      tipo: 'canchas',
      lugar: '',
      moneda: 'COP',

      // Prefijo único de almacenamiento de ESTA copia (localStorage/IndexedDB).
      // Obligatorio y distinto por cliente aunque compartan variante "canchas"
      // y aunque terminen publicados bajo el mismo dominio de GitHub Pages.
      prefijoAlmacenamiento: 'cch_',
      prefijoFactura: 'CCH-',

      // Licencia / activación offline-first (no login). Se pide una vez,
      // se guarda con prefijoAlmacenamiento + 'activacion' en localStorage.
      // urlVigencia: hoja de cálculo publicada o webhook con columna
      // "válido hasta"; solo se consulta si hay señal, nunca bloqueante offline.
      activacion: {
        codigo: '',
        urlVigencia: ''
      }
    },

    // Catálogo = catálogo de UNIDADES DE RESERVA, no de productos físicos.
    // "unidad" para este negocio es 1 hora de uso de esa cancha.
    // alias sirve para traducir nombres entre módulos (ventas, IA de lectura, etc).
    catalogo: [
      { id: 'futbol5',    nombre: 'Cancha fútbol 5',    alias: ['5', 'f5', 'futbol 5', 'fútbol 5'],       unidad: 'hora', precioUnidad: 60000 },
      { id: 'futbol8',    nombre: 'Cancha fútbol 8',    alias: ['8', 'f8', 'futbol 8', 'fútbol 8'],       unidad: 'hora', precioUnidad: 90000 },
      { id: 'tenis',      nombre: 'Cancha tenis',       alias: ['tenis'],                                  unidad: 'hora', precioUnidad: 40000 },
      { id: 'padel',      nombre: 'Cancha pádel',       alias: ['padel', 'pádel'],                         unidad: 'hora', precioUnidad: 50000 },
      { id: 'baloncesto', nombre: 'Cancha baloncesto',  alias: ['basquet', 'básquet', 'baloncesto'],       unidad: 'hora', precioUnidad: 45000 }
    ], // EJEMPLO

    // Insumos/materiales — tabla plana: insumo, unidad, precio. Igual forma
    // que en Dulce María, aplicada a lo que consume una cancha por hora de uso
    // (servicios prorateados + consumibles), no materia prima de producción.
    insumos: [
      { id: 'energia',                 nombre: 'Energía / iluminación',            unidad: 'kWh',      precio: 850 },
      { id: 'agua',                    nombre: 'Agua (riego / aseo)',              unidad: 'm3',       precio: 6500 },
      { id: 'mantenimiento_sintetica', nombre: 'Mantenimiento grama sintética',    unidad: 'hora_uso', precio: 3500 },
      { id: 'balon',                   nombre: 'Balón (préstamo / desgaste)',      unidad: 'uso',      precio: 1500 },
      { id: 'chaleco',                 nombre: 'Chalecos (juego x2)',              unidad: 'uso',      precio: 500 },
      { id: 'gas_duchas',              nombre: 'Gas duchas',                       unidad: 'uso',      precio: 800 }
    ], // EJEMPLO

    // Receta de costeo — motor_costeo.js SOLO lee esto, no tiene fórmula fija.
    // Por cada item del catálogo: qué insumos consume 1 unidad (1 hora) y cuánto.
    receta: {
      futbol5: [
        { insumo: 'energia', cantidad: 6 },
        { insumo: 'mantenimiento_sintetica', cantidad: 1 },
        { insumo: 'balon', cantidad: 0.3 },
        { insumo: 'chaleco', cantidad: 0.2 }
      ],
      futbol8: [
        { insumo: 'energia', cantidad: 9 },
        { insumo: 'mantenimiento_sintetica', cantidad: 1 },
        { insumo: 'balon', cantidad: 0.3 },
        { insumo: 'chaleco', cantidad: 0.2 }
      ],
      tenis: [
        { insumo: 'energia', cantidad: 3 },
        { insumo: 'agua', cantidad: 0.05 }
      ],
      padel: [
        { insumo: 'energia', cantidad: 3.5 }
      ],
      baloncesto: [
        { insumo: 'energia', cantidad: 4 },
        { insumo: 'agua', cantidad: 0.02 },
        { insumo: 'gas_duchas', cantidad: 0.5 }
      ]
    }, // EJEMPLO

    // Trabajadores — genérico por línea/módulo. Aquí "línea" es el turno/cancha
    // en operación, no una línea de producción.
    trabajadores: [
      { id: 'administrador', nombre: 'Administrador de turno', tipoPago: 'hora',  valor: 8000 },
      { id: 'aseo',          nombre: 'Aseo y mantenimiento',   tipoPago: 'hora',  valor: 6000 },
      { id: 'vigilante',     nombre: 'Vigilancia',             tipoPago: 'turno', valor: 25000 }
    ], // EJEMPLO

    // Mano de obra por unidad de catálogo: cuántas "unidades" de cada
    // trabajador consume 1 hora de uso. El motor los suma igual que un
    // insumo más, con su propio precio (valor del trabajador).
    manoDeObra: {
      futbol5:    [{ trabajador: 'administrador', cantidad: 1 }],
      futbol8:    [{ trabajador: 'administrador', cantidad: 1 }],
      tenis:      [{ trabajador: 'administrador', cantidad: 0.5 }],
      padel:      [{ trabajador: 'administrador', cantidad: 0.5 }],
      baloncesto: [{ trabajador: 'administrador', cantidad: 1 }]
    }, // EJEMPLO

    // Plantilla de documento (recibo de reserva) — reemplaza el layout fijo
    // en canvas por campos configurables.
    plantillaDocumento: {
      titulo: 'Recibo de reserva',
      campos: [
        { id: 'cliente',     etiqueta: 'Cliente',     tipo: 'texto',     requerido: true },
        { id: 'telefono',    etiqueta: 'Teléfono',    tipo: 'texto',     requerido: false },
        { id: 'cancha',      etiqueta: 'Cancha',      tipo: 'catalogo',  requerido: true },
        { id: 'fecha',       etiqueta: 'Fecha',       tipo: 'fecha',     requerido: true },
        { id: 'horaInicio',  etiqueta: 'Hora inicio', tipo: 'hora',      requerido: true },
        { id: 'horas',       etiqueta: 'Horas',       tipo: 'numero',    requerido: true },
        { id: 'abono',       etiqueta: 'Abono',       tipo: 'moneda',    requerido: false },
        { id: 'saldo',       etiqueta: 'Saldo',       tipo: 'moneda',    requerido: false, calculado: true }
      ]
    }, // EJEMPLO

    // Prompt de IA de lectura de fotos — SOLO la parte específica del
    // documento de este negocio. El bloque de identidad/comportamiento
    // general (JSON siempre, formatos LatAm de fecha/moneda/documento) es
    // fijo, vive en ia_lectura.js, y NO se toca por cliente.
    promptsIA: {
      reciboReserva: [
        'Estás leyendo un recibo o nota de reserva de cancha, escrito a mano o impreso.',
        'Extrae: nombre del cliente, cancha o tipo de cancha reservada, fecha, hora de inicio,',
        'número de horas, valor por hora, abono/anticipo pagado y saldo pendiente.',
        'Si el papel dice solo "5" o "8" interpreta como fútbol 5 / fútbol 8 según el catálogo.',
        'Si no hay abono explícito, usa 0.'
      ].join(' ')
    } // EJEMPLO
  };

  global.CONFIG_NEGOCIO = CONFIG_NEGOCIO;

})(typeof window !== 'undefined' ? window : globalThis);
