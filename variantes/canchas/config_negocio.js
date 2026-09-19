/*
 * config_negocio.js — Configuración del negocio (DATO de instalación, no lógica)
 *
 * Variante: Constructora de canchas de pádel — costeo POR PROYECTO/OBRA.
 * NO es un negocio de alquiler por hora ni de venta por lote: cada cancha
 * es una obra a la medida para un cliente. Ver ficha real del cliente y
 * .claude/skills/app-generica-multicliente/SKILL.md (sección "motor de
 * costeo por proyecto vs. por lote/turno").
 *
 * La unidad de negocio es la OBRA, con llave natural
 * cliente + ubicación + fecha_inicio. Los datos de cada obra (presupuesto
 * aprobado, movimientos de compras/pagos) son DATOS DE OPERACIÓN por obra
 * — viven en IndexedDB (datos.js) y se le pasan a motor_costeo.js como
 * argumentos. Este archivo SOLO trae los catálogos que el dueño llena una
 * vez y reutiliza obra tras obra.
 *
 * REGLA DE ORO: ningún módulo de lógica (motor_costeo.js, ia_lectura.js,
 * el módulo de obras) debe traer estas tablas escritas a mano.
 *
 * Los valores de catálogo de abajo (insumos, tarifas, tipos de ítem) son un
 * EJEMPLO representativo para que motor_costeo.js tenga algo real que
 * costear — reemplazar por los precios/tarifas reales de este negocio, que
 * además "se actualiza seguido porque el precio de materiales varía"
 * (ficha, sección 3).
 */
(function (global) {
  'use strict';

  var CONFIG_NEGOCIO = {

    negocio: {
      nombre: 'Canchas de Pádel — Constructora', // EJEMPLO
      tipo: 'constructora_canchas_padel',
      lugar: '',
      moneda: 'COP',

      // Prefijo único de almacenamiento de ESTA copia (localStorage/IndexedDB).
      prefijoAlmacenamiento: 'ccp_',
      prefijoFactura: 'CCP-',

      activacion: {
        codigo: '',
        urlVigencia: ''
      }
    },

    // Tipos de ítem de obra — líneas de cotización REUTILIZABLES, no un
    // catálogo fijo de productos. Cada obra combina las que necesite y en
    // la cantidad que necesite (ver plantillaCotizacion más abajo).
    tiposItemObra: [
      { id: 'cimentacion',         nombre: 'Cimentación',                    unidadReferencia: 'm2' },
      { id: 'estructura_metalica', nombre: 'Estructura metálica',            unidadReferencia: 'ml' },
      { id: 'cerramiento_malla',   nombre: 'Cerramiento en malla',           unidadReferencia: 'm2' },
      { id: 'cerramiento_vidrio',  nombre: 'Cerramiento en vidrio templado', unidadReferencia: 'm2' },
      { id: 'cesped_sintetico',    nombre: 'Césped sintético',               unidadReferencia: 'm2' },
      { id: 'iluminacion',         nombre: 'Iluminación',                    unidadReferencia: 'unidad' },
      { id: 'pintura',             nombre: 'Pintura de líneas y estructura', unidadReferencia: 'm2' }
    ], // EJEMPLO

    // Insumos de construcción — tabla plana: insumo, unidad BASE, precio.
    // Se actualiza seguido porque el precio de materiales varía. "alias"
    // ayuda a que la IA de lectura de facturas empate nombres distintos
    // del mismo insumo ("cemento gris", "cemento Rioclaro 50kg", etc).
    insumos: [
      { id: 'cemento',          nombre: 'Cemento',           unidad: 'kg',           precio: 950,    alias: ['cemento gris', 'bulto de cemento'] },
      { id: 'arena',            nombre: 'Arena',             unidad: 'm3',           precio: 65000,  alias: ['arena de rio', 'arena de río'] },
      { id: 'grava',            nombre: 'Grava / triturado', unidad: 'm3',           precio: 75000,  alias: ['triturado', 'gravilla'] },
      { id: 'malla',            nombre: 'Malla eslabonada',  unidad: 'metro_lineal', precio: 18000,  alias: ['malla eslabonada', 'malla ciclon', 'malla ciclón'] },
      { id: 'postes',           nombre: 'Postes metálicos',  unidad: 'unidad',       precio: 85000,  alias: ['poste', 'poste metalico', 'poste metálico'] },
      { id: 'cesped_sintetico', nombre: 'Césped sintético',  unidad: 'm2',           precio: 45000,  alias: ['grama sintetica', 'grama sintética', 'pasto sintetico'] },
      { id: 'vidrio_templado',  nombre: 'Vidrio templado',   unidad: 'm2',           precio: 220000, alias: ['vidrio templado', 'lamina de vidrio', 'lámina de vidrio'] },
      { id: 'reflector_led',    nombre: 'Reflector LED',     unidad: 'unidad',       precio: 180000, alias: ['reflector', 'foco led', 'luminaria led'] },
      { id: 'cable',            nombre: 'Cable eléctrico',   unidad: 'metro_lineal', precio: 3200,   alias: ['cable electrico', 'cable eléctrico'] }
    ], // EJEMPLO

    // Cuadrilla propia — igual que DMTrabajadores, generalizado: tarifa
    // por DÍA (este negocio paga por jornada de obra, no por hora).
    cuadrillaPropia: [
      { id: 'oficial_obra',  nombre: 'Oficial de construcción', tarifaDia: 90000 },
      { id: 'ayudante_obra', nombre: 'Ayudante de obra',        tarifaDia: 60000 },
      { id: 'electricista',  nombre: 'Electricista',            tarifaDia: 110000 }
    ], // EJEMPLO

    // Subcontratistas — SOLO directorio (nombre + especialidad). A
    // diferencia de la cuadrilla propia, NO tienen tarifa fija aquí: la
    // tarifa se pacta obra por obra y se registra como movimiento
    // 'pacto_subcontrato' de esa obra (campo libre, no catálogo).
    subcontratistas: [
      { id: 'sub_cimentacion', nombre: 'Cimentaciones JM',   especialidad: 'Cimentación y obra civil' },
      { id: 'sub_estructura',  nombre: 'Estructuras Andino', especialidad: 'Estructura metálica' }
    ], // EJEMPLO

    // Tipos de costo fijo asignable a una obra.
    costosFijosTipo: [
      { id: 'transporte', nombre: 'Transporte de materiales/equipo' },
      { id: 'permisos',   nombre: 'Permisos y trámites' }
    ], // EJEMPLO

    // Conversión de unidad de COMPRA → unidad BASE del insumo (la que usa
    // el catálogo de insumos arriba). Quien capture el dato (IA de lectura
    // de facturas o captura manual) convierte con esta tabla ANTES de
    // guardar el movimiento — motor_costeo.js siempre trabaja en unidad
    // base, nunca hace la conversión por su cuenta.
    // Factores de EJEMPLO: varían por proveedor/formato real, ajustar.
    conversiones: [
      { insumo: 'cemento',         unidadCompra: 'bulto_50kg', unidadBase: 'kg',           factor: 50 },
      { insumo: 'malla',           unidadCompra: 'rollo',      unidadBase: 'metro_lineal', factor: 50 },
      { insumo: 'vidrio_templado', unidadCompra: 'lamina',     unidadBase: 'm2',           factor: 5.4 }
    ], // EJEMPLO

    // Plantilla de cotización/presupuesto — el MOLDE de una línea de
    // presupuesto de obra (qué campos tiene), no datos de una obra real.
    // categoriaCosto es la misma clasificación que usa motor_costeo.js
    // para poder comparar presupuestado vs. real por categoría.
    plantillaCotizacion: {
      titulo: 'Ítem de presupuesto de obra',
      campos: [
        { id: 'tipoItem',              etiqueta: 'Tipo de ítem',              tipo: 'tiposItemObra', requerido: true },
        { id: 'categoriaCosto',        etiqueta: 'Categoría de costo',        tipo: 'enum', opciones: ['materiales', 'mano_obra_propia', 'subcontratos', 'fijos'], requerido: true },
        { id: 'cantidadEstimada',      etiqueta: 'Cantidad estimada',         tipo: 'numero', requerido: true },
        { id: 'unidad',                etiqueta: 'Unidad',                    tipo: 'texto', requerido: true },
        { id: 'precioUnitarioEstimado', etiqueta: 'Precio unitario estimado', tipo: 'moneda', requerido: true }
      ]
    },

    // Plantilla de factura/recibo de compra de material — para que la IA
    // (y la captura manual) sepan exactamente qué extraer.
    plantillaFacturaCompra: {
      titulo: 'Factura de compra de material',
      campos: [
        { id: 'proveedor', etiqueta: 'Proveedor',   tipo: 'texto', requerido: true },
        { id: 'nit',       etiqueta: 'NIT/RUT',     tipo: 'texto', requerido: false },
        { id: 'fecha',     etiqueta: 'Fecha',       tipo: 'fecha', requerido: true },
        {
          id: 'items', etiqueta: 'Ítems', tipo: 'lista', requerido: true,
          subcampos: [
            { id: 'material',       etiqueta: 'Material',        tipo: 'insumos' },
            { id: 'cantidad',       etiqueta: 'Cantidad',        tipo: 'numero' },
            { id: 'unidad',         etiqueta: 'Unidad',          tipo: 'texto' },
            { id: 'precioUnitario', etiqueta: 'Precio unitario', tipo: 'moneda' },
            { id: 'total',          etiqueta: 'Total',           tipo: 'moneda', calculado: true }
          ]
        },
        { id: 'formaPago', etiqueta: 'Forma de pago', tipo: 'texto', requerido: false }
      ]
    },

    // Prompt de IA de lectura de fotos — SOLO la parte específica de este
    // documento (factura de compra de material). El bloque de identidad/
    // comportamiento general (JSON siempre, formatos LatAm de NIT/fecha/
    // moneda) vive en ia_lectura.js y NO se toca por cliente.
    promptsIA: {
      facturaCompra: [
        'Estás leyendo una factura o recibo de compra de material de construcción.',
        'Extrae: proveedor, NIT/RUT, fecha, y por cada ítem: material, cantidad, unidad,',
        'precio unitario y total; también la forma de pago si aparece.',
        'Reglas de conversión de unidad antes de devolver el JSON:',
        '- Si el material viene en "bultos" de cemento, convierte la cantidad a kilogramos',
        '  (1 bulto = 50 kg salvo que la factura indique otro peso).',
        '- Si el material viene en "rollos" de malla, convierte la cantidad a metros lineales',
        '  usando la longitud del rollo indicada en la factura, o 50 metros si no se indica.',
        '- Si el material son "láminas" de vidrio, convierte la cantidad a metros cuadrados',
        '  usando el ancho x alto de la lámina indicados en la factura.',
        'Si el nombre del material no coincide exacto con el catálogo, usa el más parecido',
        'por significado (ej. "cemento gris" = cemento, "grama sintética" = césped sintético).'
      ].join(' ')
    } // EJEMPLO
  };

  global.CONFIG_NEGOCIO = CONFIG_NEGOCIO;

})(typeof window !== 'undefined' ? window : globalThis);
