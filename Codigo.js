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
const SHEET_GASTOS = PROPS.getProperty('SHEET_GASTOS') || 'GASTOS CAJA';
const SHEET_NOMINA = PROPS.getProperty('SHEET_NOMINA') || 'NOMINA';
const SHEET_SIIGO = PROPS.getProperty('SHEET_SIIGO') || 'SIIGO';
const SHEET_MYS = PROPS.getProperty('SHEET_MYS') || 'MYSINVENTARIOS';

let cachedSpreadsheet = null;

function _norm_(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s\.\-_]+/g, '')
    .toLowerCase();
}

function getHeaderMapStrict_(sh) {
  const values = sh.getDataRange().getValues();
  if (!values.length) {
    throw new Error('La hoja "' + sh.getName() + '" no tiene encabezados definidos');
  }
  const header = (values[0] || []).map(x => String(x || ''));
  const headerMap = {};
  header.forEach((h, i) => { headerMap[h] = i; });
  const normMap = {};
  header.forEach((h, i) => { normMap[_norm_(h)] = i; });
  return { header, headerMap, normMap, values };
}

const ALIASES = {
  'GASTOS CAJA': {
    Fecha: 'Fecha', Sede: 'Sede', Turno: 'Turno',
    Encargado: 'Encargado', Observaciones: 'Observaciones',
    Ahorro: 'Ahorro', PropinaEntregada: 'Propina Entregada',
    Domicilio: 'Domicilio', OtrosGastos: 'Otros Gastos',
    DetalleOtrosGastos: 'Detalle Otros Gastos'
  },
  'GASTOS': {
    Fecha: 'Fecha', Sede: 'Sede', Turno: 'Turno',
    Encargado: 'Encargado', Observaciones: 'Observaciones',
    Ahorro: 'Ahorro', PropinaEntregada: 'Propina Entregada',
    Domicilio: 'Domicilio', OtrosGastos: 'Otros Gastos',
    DetalleOtrosGastos: 'Detalle Otros Gastos'
  },
  'NOMINA': {
    Fecha: 'Fecha', Sede: 'Sede', Turno: 'Turno',
    Encargado: 'Encargado', Observaciones: 'Observaciones',
    Empleado: 'Empleado', Salario: 'Salario', Transporte: 'Transporte', Extras: 'Extras',
    TotalNomina: 'Total Nomina'
  },
  'MYSINVENTARIOS': {
    Fecha: 'Fecha', Sede: 'Sede', Turno: 'Turno', Encargado: 'Encargado', Observaciones: 'Observaciones',
    CobroEfectivo: 'Cobro Efectivo', TotalEfectivoReal: 'Total Efectivo Real',
    EfectivoParaEntregar: 'Efectivo Para Entregar', SobroOFalto: 'Sobro o Falto',
    TotalVenta: 'Total Venta', CierreMys: 'Cierre MYS', Adjuntos: 'Adjuntos'
  },
  'SIIGO': {
    Fecha: 'Fecha', Sede: 'Sede', Turno: 'Turno', Encargado: 'Encargado', Observaciones: 'Observaciones',
    SinEfectivoSiigo: 'Sin Efectivo',
    CobroEfectivo: 'Cobro Efectivo', TotalEfectivoReal: 'Total Efectivo Real',
    EfectivoParaEntregar: 'Efectivo Para Entregar', SobroOFalto: 'Sobro o Falto',
    TarjetasVouchers: 'Tarjetas/Vouchers', CierreDatafono: 'Cierre Datafono',
    DifDatafono: 'Dif Datafono', Transferencia: 'Transferencia',
    TotalVenta: 'Total Venta', CierreSiigo: 'Cierre SIIGO', Adjuntos: 'Adjuntos'
  },
  'FACTURAS X PAGAR': {
    Fecha: 'Fecha', Sede: 'Sede', Turno: 'Turno', Encargado: 'Encargado', Observaciones: 'Observaciones',
    Proveedor: 'Proveedor', NumFactura: 'Num Factura',
    ValorFactura: 'Valor Factura', Categoria: 'Categoria', Adjuntos: 'Adjuntos'
  }
};

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
    by: data.by || data.responsable,
    notes: data.notes || data.observaciones
  };

  requireFields_(normalized, ['date', 'site', 'shift', 'amount']);

  const turnoNumber = toNumber_(normalized.shift);
  const amountNumber = toNumber_(normalized.amount);
  const detail = normalized.description
    ? (normalized.category ? normalized.category + ' - ' + normalized.description : normalized.description)
    : (normalized.category || '');

  const row = {
    Fecha: normalized.date,
    Sede: normalized.site,
    Turno: turnoNumber,
    Encargado: normalized.by || '',
    Observaciones: normalized.notes || normalized.description || '',
    Ahorro: 0,
    PropinaEntregada: 0,
    Domicilio: 0,
    OtrosGastos: amountNumber,
    DetalleOtrosGastos: detail
  };

  const rowIdx = SheetsService.appendRowsDetectingHeaders_(SHEET_GASTOS, [row]);
  const totals = computeTotals_(normalized.date, normalized.site, turnoNumber);

  return {
    sheet: SHEET_GASTOS,
    rowIdx,
    row: rowIdx,
    totals,
    gasto: {
      fecha: normalized.date,
      sede: normalized.site,
      turno: turnoNumber,
      valor: amountNumber,
      encargado: normalized.by || ''
    }
  };
}

function addPayroll(data) {
  const normalized = {
    date: data.date || data.fecha,
    time: data.time || data.hora,
    site: data.site || data.sede,
    shift: data.shift !== undefined ? data.shift : data.turno,
    employee: data.employee || data.empleado,
    concept: data.concept || data.concepto,
    amount: data.amount !== undefined ? data.amount : data.valor,
    note: data.note || data.observacion
  };

  requireFields_(normalized, ['date', 'site', 'shift', 'employee', 'amount']);

  const turnoNumber = toNumber_(normalized.shift);
  const amountNumber = toNumber_(normalized.amount);

  const row = {
    Fecha: normalized.date,
    Sede: normalized.site,
    Turno: turnoNumber,
    Encargado: '',
    Observaciones: normalized.note || normalized.concept || '',
    Empleado: normalized.employee,
    Salario: amountNumber,
    Transporte: 0,
    Extras: 0,
    TotalNomina: amountNumber
  };

  const rowIdx = SheetsService.appendRowsDetectingHeaders_(SHEET_NOMINA, [row]);
  const totals = computeTotals_(normalized.date, normalized.site, turnoNumber);

  return {
    sheet: SHEET_NOMINA,
    rowIdx,
    row: rowIdx,
    totals,
    nomina: {
      fecha: normalized.date,
      sede: normalized.site,
      turno: turnoNumber,
      empleado: normalized.employee,
      valor: amountNumber
    }
  };
}

function calculateClosure(site, shift, efectivo, date) {
  requireFields_({ site: site, shift: shift, cash: efectivo, date: date }, ['site', 'shift', 'cash', 'date']);

  const efectivoNumber = toNumber_(efectivo);
  const shiftNumber = toNumber_(shift);
  const totals = computeTotals_(date, site, shiftNumber);
  const gastos = totals.gastosTurno;
  const nomina = totals.nominaTurno;
  const saldoReal = efectivoNumber - totals.totalAfectaciones;

  return {
    turno: shiftNumber,
    sede: site,
    fecha: date,
    efectivo: efectivoNumber,
    gastos: gastos,
    nomina: nomina,
    saldo_real: saldoReal,
    totalAfectaciones: totals.totalAfectaciones
  };
}

function computeTotals_(fecha, sede, turno) {
  const result = { gastosTurno: 0, nominaTurno: 0, totalAfectaciones: 0 };
  if (!fecha || !sede || turno === undefined || turno === null) {
    return result;
  }

  const ss = getSpreadsheet_();
  const matchFecha = String(fecha || '').trim();
  const matchSede = String(sede || '').trim();
  const matchTurno = String(turno || '').trim();

  const gastosSheet = ss.getSheetByName(SHEET_GASTOS) ||
    ss.getSheetByName('GASTOS CAJA') ||
    ss.getSheetByName('GASTOS');
  if (gastosSheet) {
    result.gastosTurno = sumSheetByCriteria_(
      gastosSheet,
      ['Fecha', 'Sede', 'Turno'],
      [matchFecha, matchSede, matchTurno],
      ['Ahorro', 'Propina Entregada', 'Domicilio', 'Otros Gastos']
    );
  }

  const nominaSheet = ss.getSheetByName(SHEET_NOMINA) || ss.getSheetByName('NOMINA');
  if (nominaSheet) {
    result.nominaTurno = sumSheetByCriteria_(
      nominaSheet,
      ['Fecha', 'Sede', 'Turno'],
      [matchFecha, matchSede, matchTurno],
      ['Total Nomina', 'Total', 'total']
    );
  }

  result.totalAfectaciones = result.gastosTurno + result.nominaTurno;
  return result;
}

function sumSheetByCriteria_(sheet, keyHeaders, keyValues, sumHeaders) {
  const { headerMap, values } = getHeaderMapStrict_(sheet);
  const keyIndexes = keyHeaders.map(header => headerMap[header]);
  if (keyIndexes.some(idx => idx === undefined)) {
    return 0;
  }

  const sumIndexes = sumHeaders
    .map(header => headerMap[header])
    .filter(idx => idx !== undefined);
  if (!sumIndexes.length) {
    return 0;
  }

  let total = 0;
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    let matches = true;
    for (let k = 0; k < keyIndexes.length; k++) {
      const idx = keyIndexes[k];
      const expected = String(keyValues[k] || '').trim();
      const actual = String(row[idx] || '').trim();
      if (expected !== actual) {
        matches = false;
        break;
      }
    }
    if (!matches) {
      continue;
    }
    for (const idx of sumIndexes) {
      const value = Number(row[idx]);
      if (!Number.isNaN(value)) {
        total += value;
      }
    }
  }
  return total;
}

const SheetsService = {
  appendRowsDetectingHeaders_: function (sheetName, rows) {
    if (!rows || !rows.length) throw new Error('No hay filas a insertar');
    const ss = getSpreadsheet_();
    const sh = ss.getSheetByName(sheetName);
    if (!sh) {
      throw new Error('No se encontró la hoja: ' + sheetName);
    }

    const { header, headerMap, normMap } = getHeaderMapStrict_(sh);
    const alias = ALIASES[sheetName] || {};

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

function getSheetByName(name) {
  if (!name) {
    throw new Error('Nombre de hoja no definido');
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

    const dateParts = String(dateStr || '').split('-');
    if (dateParts.length !== 3) {
      return new Date().toISOString();
    }

    const timeParts = String(timeStr || '00:00').split(':');
    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const day = parseInt(dateParts[2], 10);
    const hours = parseInt(timeParts[0] || '0', 10);
    const minutes = parseInt(timeParts[1] || '0', 10);

    const date = new Date(year, month, day, hours, minutes);
    return date.toISOString();
  } catch (error) {
    console.error('formatTimestamp error', error);
    return new Date().toISOString();
  }
}

function jsonOk(payload) {
  const body = Object.assign({ ok: true }, payload && typeof payload === 'object' ? payload : { result: payload });
  return createJsonResponse_(body);
}

function jsonError(code, message, details) {
  const error = {
    ok: false,
    error: {
      code: code || 'error',
      message: message || 'Error desconocido'
    }
  };

  if (details !== undefined) {
    error.error.details = details;
  }

  return createJsonResponse_(error);
}

function parsePayload_(e) {
  if (!e) {
    return {};
  }

  if (e.postData && e.postData.contents) {
    const type = String(e.postData.type || '').toLowerCase();
    const contents = e.postData.contents;

    if (type.indexOf('application/json') !== -1) {
      try {
        return JSON.parse(contents);
      } catch (error) {
        throw new Error('JSON inválido en la petición');
      }
    }

    const trimmed = contents.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        return JSON.parse(trimmed);
      } catch (error) {
        throw new Error('JSON inválido en la petición');
      }
    }
  }

  if (e.parameter) {
    const out = {};
    Object.keys(e.parameter).forEach(key => {
      out[key] = e.parameter[key];
    });
    return out;
  }

  return {};
}

function requireFields_(object, fields) {
  fields.forEach(field => {
    if (object[field] === undefined || object[field] === null || String(object[field]) === '') {
      throw new Error('Campo requerido faltante: ' + field);
    }
  });
}

function toNumber_(value) {
  const num = Number(value);
  if (Number.isNaN(num)) {
    throw new Error('Valor numérico inválido: ' + value);
  }
  return num;
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
