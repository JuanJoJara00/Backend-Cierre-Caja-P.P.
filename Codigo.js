/**
 * Backend Cierre de Caja – PanPanocha
 * -----------------------------------
 * Implementación centrada en las reglas descritas en README.md.
 *
 * Acciones disponibles vía doPost:
 *  - add_expense
 *  - add_payroll
 *  - calculate_closure
 *  - test_connection
 *
 * Se utilizan Script Properties para definir el Spreadsheet y las hojas
 * involucradas:
 *  - SHEET_ID (opcional, si todas las hojas están en el mismo Spreadsheet)
 *  - SHEET_GASTOS
 *  - SHEET_NOMINA
 */

const PROPS = PropertiesService.getScriptProperties();
const SHEET_ID = PROPS.getProperty('SHEET_ID') || '';
const SHEET_GASTOS = PROPS.getProperty('SHEET_GASTOS') || 'GASTOS';
const SHEET_NOMINA = PROPS.getProperty('SHEET_NOMINA') || 'NOMINA';

let cachedSpreadsheet = null;

function doGet(e) {
  try {
    if (e && e.parameter && (e.parameter.ping || e.parameter.action === 'ping')) {
      return jsonOk({ message: 'pong' });
    }
    return jsonOk({ message: 'Backend Cierre de Caja operativo' });
  } catch (error) {
    console.error('doGet error', error);
    return jsonError('internal_error', error.message);
  }
}

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    const action = String(payload.action || '').trim();

    switch (action) {
      case 'add_expense':
        return jsonOk(addExpense(payload));
      case 'add_payroll':
        return jsonOk(addPayroll(payload));
      case 'calculate_closure':
        return jsonOk(
          calculateClosure(
            payload.site || payload.sede,
            payload.shift || payload.turno,
            payload.cash !== undefined ? payload.cash : payload.efectivo,
            payload.date || payload.fecha
          )
        );
      case 'test_connection':
        return jsonOk({ message: 'ok' });
      default:
        throw new Error('Acción no soportada: ' + action);
    }
  } catch (error) {
    console.error('doPost error', error);
    return jsonError('internal_error', error.message);
  }
}

function addExpense(data) {
  const normalized = {
    date: data.date || data.fecha,
    time: data.time || data.hora,
    site: data.site || data.sede,
    shift: data.shift !== undefined ? data.shift : data.turno,
    category: data.category || data.categoria,
    description: data.description || data.descripcion,
    amount: data.amount !== undefined ? data.amount : data.valor,
    by: data.by || data.responsable
  };

/** ───────── Totales (Gastos + Nómina por Fecha, Sede, Turno) */

function computeTotals_(Fecha, Sede, Turno) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const gastosSheet = ss.getSheetByName(SHEET_NAMES.GASTOS_CAJA) || ss.getSheetByName(SHEET_NAMES.GASTOS);
  const nominaSheet = ss.getSheetByName(SHEET_NAMES.NOMINA);

  const gastosAlias = gastosSheet ? getAliasForSheetName_(gastosSheet.getName()) : {};
  const nominaAlias = nominaSheet ? getAliasForSheetName_(nominaSheet.getName()) : {};

  const gastos = sumByFST_(
    gastosSheet,
    ['Fecha', 'Sede', 'Turno'].map(k => gastosAlias[k] || k),
    GASTOS_TOTAL_HEADERS.map(k => gastosAlias[k] || k),
    Fecha, Sede, Turno
  );

  const nomina = sumByFST_(
    nominaSheet,
    ['Fecha', 'Sede', 'Turno'].map(k => nominaAlias[k] || k),
    NOMINA_TOTAL_HEADERS.map(k => nominaAlias[k] || k),
    Fecha, Sede, Turno
  );

  const totalAfectaciones = gastos + nomina;
  return { gastosTurno: gastos, nominaTurno: nomina, totalAfectaciones };
}

function sumByFST_(sheet, keyHeaders, sumHeaders, Fecha, Sede, Turno) {
  if (!sheet) return 0;
  const { headerMap, values } = getHeaderMapStrict_(sheet);
  const idx = keyHeaders.map(h => headerMap[h] ?? -1);
  const sumIdx = sumHeaders.map(h => headerMap[h]).filter(i => i >= 0);
  if (idx.some(i => i < 0) || !sumIdx.length) return 0;

  let sum = 0;
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (
      String(row[idx[0]] || '') === String(Fecha || '') &&
      String(row[idx[1]] || '') === String(Sede || '') &&
      String(row[idx[2]] || '') === String(Turno || '')
    ) {
      for (const j of sumIdx) sum += (+row[j] || 0);
    }
  };
}

/** ───────── Handlers por tipo ───────── */

function handleMYS_(p, meta) {
  const adjUrls = DriveService.saveBatchBase64_(
    { sede: p.Sede, tipo: SHEET_NAMES.MYS, fecha: p.Fecha, turno: p.Turno },
    p.AdjMYSINV
  );

  const row = {
    Fecha: p.Fecha, Sede: p.Sede, Turno: p.Turno,
    Encargado: p.Encargado || '', Observaciones: p.Observaciones || '',
    CobroEfectivo: +p.CobroEfectivo || 0,
    TotalEfectivoReal: +p.TotalEfectivoReal || 0,
    EfectivoParaEntregar: +p.EfectivoParaEntregar || 0,
    SobroOFalto: +p.SobroOFalto || 0,
    TotalVenta: +p.TotalVenta || 0,
    CierreMys: +p.CierreMys || 0,
    Adjuntos: (adjUrls || []).join(' | ')
  };

  const totals = computeTotals_(p.Fecha, p.Sede, p.Turno);
  row.GastosTurno = totals.gastosTurno;
  row.NominaTurno = totals.nominaTurno;
  row.TotalAfectaciones = totals.totalAfectaciones;

  const rowIdx = SheetsService.appendRowsDetectingHeaders_(SHEET_NAMES.MYS, [row]);

  // Supabase (opcional)
  try {
    SupabaseService.insertMany_('cierres_mys', [{
      id: Utilities.getUuid(),
      fecha: row.Fecha, sede: row.Sede, turno: row.Turno,
      encargado: row.Encargado, observaciones: row.Observaciones,
      cobro_efectivo: row.CobroEfectivo,
      total_efectivo_real: row.TotalEfectivoReal,
      efectivo_para_entregar: row.EfectivoParaEntregar,
      sobro_o_falto: row.SobroOFalto,
      total_venta: row.TotalVenta,
      cierre_mys: row.CierreMys,
      adjuntos: row.Adjuntos
    }]);
  } catch (err) { log_('SUPABASE_MYS_ERROR', meta, { err: String(err) }); }

  log_('MYS_INSERT', meta, row);
  return { ok: true, sheet: SHEET_NAMES.MYS, rowIdx, totals };
}

function handleSIIGO_(p, meta) {
  const adjUrls = DriveService.saveBatchBase64_(
    { sede: p.Sede, tipo: SHEET_NAMES.SIIGO, fecha: p.Fecha, turno: p.Turno },
    p.AdjSIIGO
  );

  const sinEf = !!p.SinEfectivoSiigo;
  const cobro = sinEf ? 0 : (+p.CobroEfectivo || 0);
  const entreg = sinEf ? 0 : (+p.EfectivoParaEntregar || 0);

  const totals = computeTotals_(p.Fecha, p.Sede, p.Turno);

  const row = {
    Fecha: p.Fecha, Sede: p.Sede, Turno: p.Turno,
    Encargado: p.Encargado || '', Observaciones: p.Observaciones || '',
    SinEfectivoSiigo: sinEf,
    CobroEfectivo: cobro,
    TotalEfectivoReal: +p.TotalEfectivoReal || 0,
    EfectivoParaEntregar: entreg,
    SobroOFalto: +p.SobroOFalto || 0,
    TarjetasVouchers: +p.TarjetasVouchers || 0,
    CierreDatafono: +p.CierreDatafono || 0,
    DifDatafono: +p.DifDatafono || 0,
    Transferencia: +p.Transferencia || 0,
    TotalVenta: +p.TotalVenta || 0,
    CierreSiigo: +p.CierreSiigo || 0,
    GastosTurno: totals.gastosTurno,
    NominaTurno: totals.nominaTurno,
    TotalAfectaciones: totals.totalAfectaciones,
    Adjuntos: (adjUrls || []).join(' | ')
  };

  const rowIdx = SheetsService.appendRowsDetectingHeaders_(SHEET_NAMES.SIIGO, [row]);

  try {
    SupabaseService.insertMany_('cierres_siigo', [{
      id: Utilities.getUuid(),
      fecha: row.Fecha, sede: row.Sede, turno: row.Turno,
      encargado: row.Encargado, observaciones: row.Observaciones,
      sin_efectivo: row.SinEfectivoSiigo,
      cobro_efectivo: row.CobroEfectivo,
      total_efectivo_real: row.TotalEfectivoReal,
      efectivo_para_entregar: row.EfectivoParaEntregar,
      sobro_o_falto: row.SobroOFalto,
      tarjetas_vouchers: row.TarjetasVouchers,
      cierre_datafono: row.CierreDatafono,
      dif_datafono: row.DifDatafono,
      transferencia: row.Transferencia,
      total_venta: row.TotalVenta,
      cierre_siigo: row.CierreSiigo,
      adjuntos: row.Adjuntos
    }]);
  } catch (err) { log_('SUPABASE_SIIGO_ERROR', meta, { err: String(err) }); }

  log_('SIIGO_INSERT', meta, row);
  return { ok: true, sheet: SHEET_NAMES.SIIGO, rowIdx, totals };
}

  return {
    turno: shiftNumber,
    sede: site,
    fecha: date,
    efectivo: efectivoNumber,
    gastos: gastos,
    nomina: nomina,
    saldo_real: saldoReal
  };
}

  const rowIdx = SheetsService.appendRowsDetectingHeaders_(SHEET_NAMES.GASTOS_CAJA, [row]);
  const totals = computeTotals_(p.Fecha, p.Sede, p.Turno);

  try {
    SupabaseService.insertMany_('gastos', [{
      id: Utilities.getUuid(),
      fecha: row.Fecha, sede: row.Sede, turno: row.Turno,
      encargado: row.Encargado, observaciones: row.Observaciones,
      ahorro: row.Ahorro, propina_entregada: row.PropinaEntregada, domicilio: row.Domicilio,
      otros_gastos: row.OtrosGastos,
      detalle_otros_gastos: row.DetalleOtrosGastos ? JSON.parse(row.DetalleOtrosGastos) : null
    }]);
  } catch (err) { log_('SUPABASE_GASTOS_ERROR', meta, { err: String(err) }); }

  log_('GASTOS_INSERT', meta, row);
  return { ok: true, sheet: SHEET_NAMES.GASTOS_CAJA, rowIdx, totals };
}

function handleNOMINA_(p, meta) {
  if (p.SinPagoNomina) {
    log_('NOMINA_SIN_PAGO', meta, {});
    const totals = computeTotals_(p.Fecha, p.Sede, p.Turno);
    return { ok: true, sheet: SHEET_NAMES.NOMINA, rowIdx: '-', totals };
  }

  const spreadsheet = getSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    throw new Error('No se encontró la hoja: ' + name);
  }
  return sheet;
}

function formatTimestamp(dateStr, timeStr) {
  try {
    if (!dateStr && !timeStr) {
      return new Date().toISOString();
    }

  const rowIdx = SheetsService.appendRowsDetectingHeaders_(SHEET_NAMES.NOMINA, rows);
  const totals = computeTotals_(p.Fecha, p.Sede, p.Turno);

  try {
    SupabaseService.insertMany_('nomina', rows.map(r => ({
      id: Utilities.getUuid(),
      fecha: r.Fecha, sede: r.Sede, turno: r.Turno,
      encargado: r.Encargado, observaciones: r.Observaciones,
      empleado: r.Empleado, salario: r.Salario, transporte: r.Transporte, extras: r.Extras,
      total: r.TotalNomina
    })));
  } catch (err) { log_('SUPABASE_NOMINA_ERROR', meta, { err: String(err) }); }

  log_('NOMINA_INSERTADAS', meta, { count: rows.length });
  return { ok: true, sheet: SHEET_NAMES.NOMINA, rowIdx, totals };
}

function handleFXP_(p, meta) {
  if (p.SinFXP) {
    log_('FXP_SIN_REGISTROS', meta, {});
    return { ok: true, sheet: SHEET_NAMES.FXP, rowIdx: '-' };
  }

function jsonError(code, message, details) {
  const error = {
    ok: false,
    error: {
      code: code || 'error',
      message: message || 'Error desconocido'
    }
  };

  const adjUrls = DriveService.saveBatchBase64_(
    { sede: p.Sede, tipo: SHEET_NAMES.FXP, fecha: p.Fecha, turno: p.Turno },
    p.AdjFXP
  );

  return createJsonResponse_(error);
}

  const rowIdx = SheetsService.appendRowsDetectingHeaders_(SHEET_NAMES.FXP, rows);

  try {
    SupabaseService.insertMany_('fxp', rows.map(r => ({
      id: Utilities.getUuid(),
      fecha: r.Fecha, sede: r.Sede, turno: r.Turno,
      encargado: r.Encargado, observaciones: r.Observaciones,
      proveedor: r.Proveedor, num_factura: r.NumFactura,
      valor: r.ValorFactura, categoria: r.Categoria, adjuntos: r.Adjuntos
    })));
  } catch (err) { log_('SUPABASE_FXP_ERROR', meta, { err: String(err) }); }

  log_('FXP_INSERTADAS', meta, { count: rows.length });
  return { ok: true, sheet: SHEET_NAMES.FXP, rowIdx };
}

/** ───────── Sheets utils ───────── */

const SheetsService = {
  appendRowsDetectingHeaders_: function (sheetName, rows) {
    if (!rows || !rows.length) throw new Error('No hay filas a insertar');
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sh = ss.getSheetByName(sheetName);
    if (!sh) {
      throw new Error('La hoja "' + sheetName + '" no existe en el Spreadsheet configurado');
    }

    const { header, headerMap, normMap } = getHeaderMapStrict_(sh);
    if (!header.length || header.every(h => !String(h || '').trim())) {
      throw new Error('La hoja "' + sheetName + '" no tiene encabezados definidos');
    }

    const alias = getAliasForSheetName_(sheetName);
    const data = rows.map(r => {
      const arr = Array(header.length).fill('');
      Object.keys(r || {}).forEach(k => {
        const value = r[k];
        const targetHeader = alias[k];
        if (targetHeader !== undefined && headerMap[targetHeader] !== undefined) {
          arr[headerMap[targetHeader]] = value;
          return;
        }
        const guessIdx = normMap[_norm_(k)];
        if (guessIdx !== undefined) {
          arr[guessIdx] = value;
        }
      });
      return arr;
    });

    const startRow = Math.max(2, sh.getLastRow() + 1);
    sh.getRange(startRow, 1, data.length, header.length).setValues(data);
    return startRow;
  }
};

function getHeaderMapStrict_(sh) {
  const rng = sh.getDataRange();
  const values = rng.getValues();
  if (!values.length) {
    return { header: [], headerMap: {}, normMap: {}, values: [] };
  }

  const header = (values[0] || []).map(x => String(x || ''));
  if (header.every(h => !String(h || '').trim())) {
    return { header: [], headerMap: {}, normMap: {}, values };
  }
  const headerMap = {};
  header.forEach((h, i) => { headerMap[h] = i; });
  const normMap = {};
  header.forEach((h, i) => { normMap[_norm_(h)] = i; });

  return { header, headerMap, normMap, values };
}

function sumByCriteria_(sheet, options) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return 0;
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  return rows.reduce((acc, row) => {
    const dateMatches = String(row[options.dateIndex] || '') === String(options.date || '');
    const siteMatches = String(row[options.siteIndex] || '').toUpperCase() === String(options.site || '').toUpperCase();
    const shiftMatches = toNumberSafe_(row[options.shiftIndex]) === options.shift;

    if (dateMatches && siteMatches && shiftMatches) {
      acc += toNumberSafe_(row[options.amountIndex]);
    }
    return acc;
  }, 0);
}

function toNumberSafe_(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function getSpreadsheet_() {
  if (cachedSpreadsheet) {
    return cachedSpreadsheet;
  }

  if (SHEET_ID) {
    cachedSpreadsheet = SpreadsheetApp.openById(SHEET_ID);
  } else {
    cachedSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  }

  if (!cachedSpreadsheet) {
    throw new Error('No fue posible obtener el Spreadsheet de trabajo');
  }

  return cachedSpreadsheet;
}

function createJsonResponse_(body) {
  return ContentService.createTextOutput(JSON.stringify(body, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}
