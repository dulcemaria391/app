/*
 * motor_costeo.js — Motor de costeo POR PROYECTO/OBRA (LÓGICA fija, sin datos de negocio)
 *
 * Generaliza costos.js para un negocio donde la unidad NO es un lote ni una
 * hora de alquiler, sino una OBRA completa (construir una cancha para un
 * cliente). El costo real de una obra se reconstruye SIEMPRE a partir de
 * sus movimientos — nunca se guarda ni se sincroniza como un saldo fijo
 * (mismo patrón event-sourced del kardex de insumos, ver SKILL.md).
 *
 * Este motor no sabe qué es una "cancha de pádel": solo sabe sumar
 * movimientos tipados contra los catálogos de config_negocio.js. Los
 * movimientos y el presupuesto de cada obra viven en IndexedDB (datos.js)
 * y se le pasan a estas funciones como argumentos — el motor no lee ni
 * escribe almacenamiento directamente.
 *
 * Patrón "parche que falla a propósito": un movimiento que referencia un
 * insumo/trabajador/subcontratista/tipo de costo fijo que no existe en la
 * config lanza un error descriptivo, nunca calcula costo 0 en silencio.
 */
(function (global) {
  'use strict';

  var TIPOS_MOVIMIENTO = {
    COMPRA_MATERIAL: 'compra_material',
    PAGO_CUADRILLA: 'pago_cuadrilla',
    PACTO_SUBCONTRATO: 'pacto_subcontrato',
    PAGO_SUBCONTRATISTA: 'pago_subcontratista',
    COSTO_FIJO: 'costo_fijo'
  };

  var CATEGORIAS = {
    MATERIALES: 'materiales',
    MANO_OBRA_PROPIA: 'mano_obra_propia',
    SUBCONTRATOS: 'subcontratos',
    FIJOS: 'fijos'
  };

  function errorConfig(msg) {
    throw new Error('[motor_costeo] ' + msg);
  }

  function obtenerConfig(config) {
    var cfg = config || global.CONFIG_NEGOCIO;
    if (!cfg) errorConfig('no hay CONFIG_NEGOCIO cargado ni config explícita.');
    return cfg;
  }

  function indexarPorId(lista) {
    var mapa = {};
    (lista || []).forEach(function (item) { mapa[item.id] = item; });
    return mapa;
  }

  // Llave natural por tipo de movimiento — identifica el HECHO (no el
  // dispositivo que lo registró), para poder unir el trabajo de dos
  // celulares sobre la misma obra sin duplicar ni perder nada.
  function claveNaturalMovimiento(mov) {
    if (!mov || !mov.tipo) errorConfig('movimiento sin tipo, no se puede sacar llave natural.');
    switch (mov.tipo) {
      case TIPOS_MOVIMIENTO.COMPRA_MATERIAL:
        return ['compra', mov.obraId, mov.proveedor, mov.factura, mov.fecha].join('|');
      case TIPOS_MOVIMIENTO.PAGO_CUADRILLA:
        return ['pago_cuadrilla', mov.obraId, mov.trabajadorId, mov.fecha].join('|');
      case TIPOS_MOVIMIENTO.PACTO_SUBCONTRATO:
        return ['pacto_subcontrato', mov.obraId, mov.subcontratistaId || mov.subcontratistaNombre, mov.concepto].join('|');
      case TIPOS_MOVIMIENTO.PAGO_SUBCONTRATISTA:
        return ['pago_subcontratista', mov.obraId, mov.subcontratistaId || mov.subcontratistaNombre, mov.fecha, mov.concepto].join('|');
      case TIPOS_MOVIMIENTO.COSTO_FIJO:
        return ['costo_fijo', mov.obraId, mov.tipoCostoFijoId, mov.fecha, mov.concepto].join('|');
      default:
        errorConfig('tipo de movimiento desconocido: "' + mov.tipo + '".');
    }
  }

  // Llave natural de una obra (proyecto): cliente + ubicación + fecha de inicio.
  function claveNaturalObra(obra) {
    if (!obra) errorConfig('obra vacía, no se puede sacar llave natural.');
    return ['obra', obra.cliente, obra.ubicacion, obra.fechaInicio].join('|');
  }

  // Convierte una cantidad en unidad de COMPRA a la unidad BASE del insumo
  // (bultos→kg, rollos→metros lineales, láminas→m2 — ficha, sección 4).
  function normalizarCantidadInsumo(insumoId, cantidad, unidadCompra, config) {
    var cfg = obtenerConfig(config);
    if (!unidadCompra) return cantidad; // ya viene en unidad base
    var conv = (cfg.conversiones || []).filter(function (c) {
      return c.insumo === insumoId && c.unidadCompra === unidadCompra;
    })[0];
    if (!conv) errorConfig('no hay conversión configurada de "' + unidadCompra + '" a unidad base para el insumo "' + insumoId + '". Agrégala en config_negocio.js → conversiones.');
    return cantidad * conv.factor;
  }

  // Busca un insumo por id exacto o por alias (para que ia_lectura.js
  // pueda traducir el nombre que trae una factura al insumo del catálogo).
  function buscarInsumo(config, texto) {
    var cfg = obtenerConfig(config);
    var t = String(texto || '').trim().toLowerCase();
    if (!t) return null;
    var directo = (cfg.insumos || []).filter(function (i) { return i.id === texto; })[0];
    if (directo) return directo;
    return (cfg.insumos || []).filter(function (item) {
      if (String(item.nombre || '').toLowerCase() === t) return true;
      return (item.alias || []).some(function (a) { return String(a).toLowerCase() === t; });
    })[0] || null;
  }

  function valorCompraMaterial(mov, config) {
    var cfg = obtenerConfig(config);
    var insumos = indexarPorId(cfg.insumos);
    var items = mov.items || [];
    return items.reduce(function (acc, it) {
      if (!insumos[it.insumoId]) errorConfig('compra de material referencia insumo "' + it.insumoId + '" que no existe en config_negocio.js → insumos.');
      return acc + (it.cantidad * it.precioUnitario);
    }, 0);
  }

  function valorPagoCuadrilla(mov, config) {
    var cfg = obtenerConfig(config);
    var cuadrilla = indexarPorId(cfg.cuadrillaPropia);
    var trabajador = cuadrilla[mov.trabajadorId];
    if (!trabajador) errorConfig('pago de cuadrilla referencia trabajador "' + mov.trabajadorId + '" que no existe en config_negocio.js → cuadrillaPropia.');
    var tarifa = typeof mov.valorDia === 'number' ? mov.valorDia : trabajador.tarifaDia;
    return tarifa * (mov.dias || 0);
  }

  function valorCostoFijo(mov, config) {
    var cfg = obtenerConfig(config);
    var tipos = indexarPorId(cfg.costosFijosTipo);
    if (!tipos[mov.tipoCostoFijoId]) errorConfig('costo fijo referencia tipo "' + mov.tipoCostoFijoId + '" que no existe en config_negocio.js → costosFijosTipo.');
    return mov.valor || 0;
  }

  function valorPactoSubcontrato(mov, config) {
    var cfg = obtenerConfig(config);
    var subs = indexarPorId(cfg.subcontratistas);
    if (mov.subcontratistaId && !subs[mov.subcontratistaId]) errorConfig('pacto de subcontrato referencia subcontratista "' + mov.subcontratistaId + '" que no existe en config_negocio.js → subcontratistas.');
    if (!mov.subcontratistaId && !mov.subcontratistaNombre) errorConfig('pacto de subcontrato sin subcontratistaId ni subcontratistaNombre.');
    return mov.valorPactado || 0;
  }

  function valorPagoSubcontratista(mov, config) {
    var cfg = obtenerConfig(config);
    var subs = indexarPorId(cfg.subcontratistas);
    if (mov.subcontratistaId && !subs[mov.subcontratistaId]) errorConfig('pago a subcontratista referencia subcontratista "' + mov.subcontratistaId + '" que no existe en config_negocio.js → subcontratistas.');
    if (!mov.subcontratistaId && !mov.subcontratistaNombre) errorConfig('pago a subcontratista sin subcontratistaId ni subcontratistaNombre.');
    return mov.valorPagado || 0;
  }

  // Valor monetario de un movimiento, cualquiera que sea su tipo.
  function valorMovimiento(mov, config) {
    switch (mov.tipo) {
      case TIPOS_MOVIMIENTO.COMPRA_MATERIAL: return valorCompraMaterial(mov, config);
      case TIPOS_MOVIMIENTO.PAGO_CUADRILLA: return valorPagoCuadrilla(mov, config);
      case TIPOS_MOVIMIENTO.PACTO_SUBCONTRATO: return valorPactoSubcontrato(mov, config);
      case TIPOS_MOVIMIENTO.PAGO_SUBCONTRATISTA: return valorPagoSubcontratista(mov, config);
      case TIPOS_MOVIMIENTO.COSTO_FIJO: return valorCostoFijo(mov, config);
      default: errorConfig('tipo de movimiento desconocido: "' + mov.tipo + '".');
    }
  }

  // A qué categoría de costo pertenece un movimiento. 'pacto_subcontrato'
  // no tiene categoría: es un COMPROMISO, no un gasto ya ejecutado (el
  // gasto real llega cuando se registra el 'pago_subcontratista').
  function categoriaMovimiento(mov) {
    switch (mov.tipo) {
      case TIPOS_MOVIMIENTO.COMPRA_MATERIAL: return CATEGORIAS.MATERIALES;
      case TIPOS_MOVIMIENTO.PAGO_CUADRILLA: return CATEGORIAS.MANO_OBRA_PROPIA;
      case TIPOS_MOVIMIENTO.PAGO_SUBCONTRATISTA: return CATEGORIAS.SUBCONTRATOS;
      case TIPOS_MOVIMIENTO.COSTO_FIJO: return CATEGORIAS.FIJOS;
      case TIPOS_MOVIMIENTO.PACTO_SUBCONTRATO: return null;
      default: errorConfig('tipo de movimiento desconocido: "' + mov.tipo + '".');
    }
  }

  // Costo real de una obra = suma de sus movimientos, agrupado por
  // categoría (materiales / mano de obra propia / subcontratos / fijos).
  // Recibe SOLO los movimientos de una obra (el filtrado por obraId es
  // responsabilidad de quien lee IndexedDB, no de este motor).
  function calcularCostoReal(movimientos, config) {
    var cfg = obtenerConfig(config);
    var totales = { materiales: 0, mano_obra_propia: 0, subcontratos: 0, fijos: 0 };
    var detalle = [];

    (movimientos || []).forEach(function (mov) {
      var categoria = categoriaMovimiento(mov);
      if (!categoria) return; // pacto_subcontrato: compromiso, no gasto ejecutado
      var valor = valorMovimiento(mov, cfg);
      totales[categoria] += valor;
      detalle.push({ movimiento: mov, categoria: categoria, valor: valor });
    });

    var total = totales.materiales + totales.mano_obra_propia + totales.subcontratos + totales.fijos;
    return {
      materiales: totales.materiales,
      manoObraPropia: totales.mano_obra_propia,
      subcontratos: totales.subcontratos,
      fijos: totales.fijos,
      total: total,
      detalle: detalle
    };
  }

  // Presupuesto (cotización aprobada), sumado por la misma categoría de
  // costo que usa calcularCostoReal, para comparar manzanas con manzanas.
  function calcularPresupuesto(presupuestoItems, config) {
    var totales = { materiales: 0, mano_obra_propia: 0, subcontratos: 0, fijos: 0 };
    (presupuestoItems || []).forEach(function (item) {
      if (!totales.hasOwnProperty(item.categoriaCosto)) {
        errorConfig('ítem de presupuesto con categoriaCosto inválida: "' + item.categoriaCosto + '".');
      }
      totales[item.categoriaCosto] += item.cantidadEstimada * item.precioUnitarioEstimado;
    });
    var total = totales.materiales + totales.mano_obra_propia + totales.subcontratos + totales.fijos;
    return {
      materiales: totales.materiales,
      manoObraPropia: totales.mano_obra_propia,
      subcontratos: totales.subcontratos,
      fijos: totales.fijos,
      total: total
    };
  }

  // El reporte central que pide el dueño (ficha, sección 6): presupuestado
  // vs. real por categoría, con diferencia y % de ejecución.
  function compararPresupuestoVsReal(presupuestoItems, movimientos, config) {
    var cfg = obtenerConfig(config);
    var presupuesto = calcularPresupuesto(presupuestoItems, cfg);
    var real = calcularCostoReal(movimientos, cfg);

    function linea(categoria, presupuestado, realCat) {
      return {
        categoria: categoria,
        presupuestado: presupuestado,
        real: realCat,
        diferencia: presupuestado - realCat,
        pctEjecutado: presupuestado > 0 ? (realCat / presupuestado) * 100 : null
      };
    }

    return {
      materiales: linea('materiales', presupuesto.materiales, real.materiales),
      manoObraPropia: linea('mano_obra_propia', presupuesto.manoObraPropia, real.manoObraPropia),
      subcontratos: linea('subcontratos', presupuesto.subcontratos, real.subcontratos),
      fijos: linea('fijos', presupuesto.fijos, real.fijos),
      total: linea('total', presupuesto.total, real.total)
    };
  }

  // Margen actual = precio pactado con el cliente (cotización aprobada)
  // menos el costo real acumulado a hoy. Nunca se guarda como número fijo:
  // se recalcula cada vez a partir de los movimientos (ficha, sección 5).
  function calcularMargen(precioVentaObra, costoRealTotal) {
    var margen = precioVentaObra - costoRealTotal;
    return {
      margen: margen,
      margenPct: precioVentaObra > 0 ? (margen / precioVentaObra) * 100 : null
    };
  }

  // Margen proyectado "si sigue al ritmo de gasto de hoy" (ficha, sección
  // 6). avanceFisico (0,1] es el % de obra realmente ejecutado si se mide
  // aparte (más preciso); si no se tiene, se usa como proxy
  // costoRealTotal/presupuestoTotal (asume que el gasto avanza al mismo
  // ritmo que la obra — es una aproximación, no un avance medido en obra).
  function proyectarMargenFinal(precioVentaObra, costoRealTotal, presupuestoTotal, avanceFisico) {
    var avance = typeof avanceFisico === 'number' ? avanceFisico
      : (presupuestoTotal > 0 ? costoRealTotal / presupuestoTotal : null);
    if (!avance || avance <= 0) errorConfig('no se puede proyectar sin avance > 0 (ni físico ni por presupuesto).');
    var costoProyectado = costoRealTotal / avance;
    var margenProyectado = precioVentaObra - costoProyectado;
    return {
      avanceUsado: avance,
      costoProyectado: costoProyectado,
      margenProyectado: margenProyectado,
      margenProyectadoPct: precioVentaObra > 0 ? (margenProyectado / precioVentaObra) * 100 : null
    };
  }

  // Corte de pagos pendientes a subcontratistas (ficha, sección 6):
  // pendiente = pactado - pagado, por subcontratista de esta obra.
  function corteSubcontratistas(movimientos, config) {
    var cfg = obtenerConfig(config);
    var subcontratistas = indexarPorId(cfg.subcontratistas);
    var porSub = {};

    (movimientos || []).forEach(function (mov) {
      if (mov.tipo !== TIPOS_MOVIMIENTO.PACTO_SUBCONTRATO && mov.tipo !== TIPOS_MOVIMIENTO.PAGO_SUBCONTRATISTA) return;
      var key = mov.subcontratistaId || mov.subcontratistaNombre;
      if (!key) errorConfig('movimiento de subcontratista sin subcontratistaId ni subcontratistaNombre.');
      if (mov.subcontratistaId && !subcontratistas[mov.subcontratistaId]) {
        errorConfig('movimiento referencia subcontratista "' + mov.subcontratistaId + '" que no existe en config_negocio.js → subcontratistas.');
      }
      if (!porSub[key]) {
        porSub[key] = {
          subcontratistaId: mov.subcontratistaId || null,
          nombre: mov.subcontratistaId ? subcontratistas[mov.subcontratistaId].nombre : mov.subcontratistaNombre,
          pactado: 0,
          pagado: 0
        };
      }
      if (mov.tipo === TIPOS_MOVIMIENTO.PACTO_SUBCONTRATO) porSub[key].pactado += mov.valorPactado || 0;
      if (mov.tipo === TIPOS_MOVIMIENTO.PAGO_SUBCONTRATISTA) porSub[key].pagado += mov.valorPagado || 0;
    });

    return Object.keys(porSub).map(function (key) {
      var s = porSub[key];
      return Object.assign({}, s, { pendiente: s.pactado - s.pagado });
    });
  }

  var MotorCosteo = {
    TIPOS_MOVIMIENTO: TIPOS_MOVIMIENTO,
    CATEGORIAS: CATEGORIAS,
    claveNaturalMovimiento: claveNaturalMovimiento,
    claveNaturalObra: claveNaturalObra,
    normalizarCantidadInsumo: normalizarCantidadInsumo,
    buscarInsumo: buscarInsumo,
    valorMovimiento: valorMovimiento,
    calcularCostoReal: calcularCostoReal,
    calcularPresupuesto: calcularPresupuesto,
    compararPresupuestoVsReal: compararPresupuestoVsReal,
    calcularMargen: calcularMargen,
    proyectarMargenFinal: proyectarMargenFinal,
    corteSubcontratistas: corteSubcontratistas
  };

  global.MotorCosteo = MotorCosteo;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MotorCosteo;
  }

})(typeof window !== 'undefined' ? window : globalThis);
