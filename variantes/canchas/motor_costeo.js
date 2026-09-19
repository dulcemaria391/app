/*
 * motor_costeo.js — Motor de costeo genérico (LÓGICA fija, sin datos de negocio)
 *
 * Generalización de costos.js. Este motor NO sabe qué es una "cancha", un
 * "fútbol 5" ni un "insumo" concreto — solo sabe sumar una receta contra una
 * tabla de precios de insumos y de trabajadores. Toda la variante "canchas"
 * vive en config_negocio.js; este archivo debe poder reusarse tal cual para
 * cualquier otro negocio que siga el mismo patrón (obleas, arequipe, etc.).
 *
 * Patrón "parche que falla a propósito" (ver SKILL.md): si la receta
 * referencia un insumo/trabajador/producto que no existe en la config, el
 * motor lanza un error descriptivo en vez de calcular un costo de 0 en
 * silencio.
 */
(function (global) {
  'use strict';

  function errorConfig(msg) {
    throw new Error('[motor_costeo] ' + msg);
  }

  function obtenerConfig(config) {
    var cfg = config || global.CONFIG_NEGOCIO;
    if (!cfg) errorConfig('no hay CONFIG_NEGOCIO cargado ni config explícita.');
    return cfg;
  }

  function indexarPorId(lista, nombreTabla) {
    var mapa = {};
    (lista || []).forEach(function (item) {
      mapa[item.id] = item;
    });
    return mapa;
  }

  // Busca un item de catálogo por id exacto o por alias (usado por
  // ia_lectura.js para traducir lo que la IA extrajo de una foto).
  function buscarEnCatalogo(config, texto) {
    var cfg = obtenerConfig(config);
    var t = String(texto || '').trim().toLowerCase();
    if (!t) return null;
    var directo = (cfg.catalogo || []).filter(function (i) { return i.id === texto; })[0];
    if (directo) return directo;
    return (cfg.catalogo || []).filter(function (item) {
      if (String(item.nombre || '').toLowerCase() === t) return true;
      return (item.alias || []).some(function (a) { return String(a).toLowerCase() === t; });
    })[0] || null;
  }

  // Costeo de 1 unidad de un item del catálogo (1 hora, 1 lote, lo que la
  // config defina como "unidad" — el motor no lo necesita saber).
  function calcularCostoUnidad(catalogoId, config) {
    var cfg = obtenerConfig(config);
    var insumos = indexarPorId(cfg.insumos, 'insumos');
    var trabajadores = indexarPorId(cfg.trabajadores, 'trabajadores');
    var item = (cfg.catalogo || []).filter(function (i) { return i.id === catalogoId; })[0];
    if (!item) errorConfig('catálogo sin id "' + catalogoId + '". Revisa config_negocio.js.');

    var recetaItem = (cfg.receta && cfg.receta[catalogoId]) || [];
    var manoObraItem = (cfg.manoDeObra && cfg.manoDeObra[catalogoId]) || [];

    var detalleInsumos = recetaItem.map(function (linea) {
      var insumo = insumos[linea.insumo];
      if (!insumo) errorConfig('receta de "' + catalogoId + '" usa insumo "' + linea.insumo + '" que no existe en config_negocio.js → insumos.');
      var subtotal = insumo.precio * linea.cantidad;
      return {
        insumoId: insumo.id,
        nombre: insumo.nombre,
        unidad: insumo.unidad,
        cantidad: linea.cantidad,
        precioUnitario: insumo.precio,
        subtotal: subtotal
      };
    });

    var detalleManoObra = manoObraItem.map(function (linea) {
      var trabajador = trabajadores[linea.trabajador];
      if (!trabajador) errorConfig('mano de obra de "' + catalogoId + '" usa trabajador "' + linea.trabajador + '" que no existe en config_negocio.js → trabajadores.');
      var subtotal = trabajador.valor * linea.cantidad;
      return {
        trabajadorId: trabajador.id,
        nombre: trabajador.nombre,
        tipoPago: trabajador.tipoPago,
        cantidad: linea.cantidad,
        valorUnitario: trabajador.valor,
        subtotal: subtotal
      };
    });

    var costoInsumos = detalleInsumos.reduce(function (acc, l) { return acc + l.subtotal; }, 0);
    var costoManoObra = detalleManoObra.reduce(function (acc, l) { return acc + l.subtotal; }, 0);
    var costoTotal = costoInsumos + costoManoObra;
    var precioVenta = typeof item.precioUnidad === 'number' ? item.precioUnidad : 0;
    var margen = precioVenta - costoTotal;
    var margenPct = precioVenta > 0 ? (margen / precioVenta) * 100 : null;

    return {
      catalogoId: catalogoId,
      nombre: item.nombre,
      unidad: item.unidad,
      insumos: detalleInsumos,
      manoDeObra: detalleManoObra,
      costoInsumos: costoInsumos,
      costoManoObra: costoManoObra,
      costoTotal: costoTotal,
      precioVenta: precioVenta,
      margen: margen,
      margenPct: margenPct
    };
  }

  // Igual que calcularCostoUnidad pero multiplicado por N unidades
  // (N horas reservadas, N lotes producidos — lo que la config represente).
  function calcularCostoLote(catalogoId, cantidad, config) {
    var n = Number(cantidad);
    if (!isFinite(n) || n < 0) errorConfig('cantidad inválida para "' + catalogoId + '": ' + cantidad);
    var unidad = calcularCostoUnidad(catalogoId, config);
    var escalar = function (v) { return v * n; };
    return Object.assign({}, unidad, {
      cantidad: n,
      insumos: unidad.insumos.map(function (l) { return Object.assign({}, l, { cantidad: l.cantidad * n, subtotal: l.subtotal * n }); }),
      manoDeObra: unidad.manoDeObra.map(function (l) { return Object.assign({}, l, { cantidad: l.cantidad * n, subtotal: l.subtotal * n }); }),
      costoInsumos: escalar(unidad.costoInsumos),
      costoManoObra: escalar(unidad.costoManoObra),
      costoTotal: escalar(unidad.costoTotal),
      precioVenta: escalar(unidad.precioVenta),
      margen: escalar(unidad.margen)
      // margenPct no se escala: es un porcentaje, se mantiene igual que en 1 unidad.
    });
  }

  // Costea todo el catálogo de una vez (para un reporte / tabla de referencia).
  function resumenCatalogo(config) {
    var cfg = obtenerConfig(config);
    return (cfg.catalogo || []).map(function (item) {
      return calcularCostoUnidad(item.id, cfg);
    });
  }

  var MotorCosteo = {
    calcularCostoUnidad: calcularCostoUnidad,
    calcularCostoLote: calcularCostoLote,
    resumenCatalogo: resumenCatalogo,
    buscarEnCatalogo: buscarEnCatalogo
  };

  global.MotorCosteo = MotorCosteo;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MotorCosteo;
  }

})(typeof window !== 'undefined' ? window : globalThis);
