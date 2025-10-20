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

  requireFields_(normalized, ['date', 'time', 'site', 'shift', 'category', 'description', 'amount', 'by']);

  const sheet = getSheetByName(SHEET_GASTOS);
  const row = [
    normalized.date,
    normalized.time,
    normalized.site,
    toNumber_(normalized.shift),
    normalized.category,
    normalized.description,
    toNumber_(normalized.amount),
    normalized.by,
    formatTimestamp(normalized.date, normalized.time)
  ];

  const rowIndex = findLastRow(sheet) + 1;
  sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);

  return {
    sheet: SHEET_GASTOS,
    row: rowIndex,
    gasto: {
      fecha: normalized.date,
      hora: normalized.time,
      sede: normalized.site,
      turno: toNumber_(normalized.shift),
      categoria: normalized.category,
      descripcion: normalized.description,
      valor: toNumber_(normalized.amount),
      responsable: normalized.by
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

  requireFields_(normalized, ['date', 'time', 'site', 'shift', 'employee', 'concept', 'amount']);

  const sheet = getSheetByName(SHEET_NOMINA);
  const row = [
    normalized.date,
    normalized.time,
    normalized.site,
    toNumber_(normalized.shift),
    normalized.employee,
    normalized.concept,
    toNumber_(normalized.amount),
    normalized.note || '',
    formatTimestamp(normalized.date, normalized.time)
  ];

  const rowIndex = findLastRow(sheet) + 1;
  sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);

  return {
    sheet: SHEET_NOMINA,
    row: rowIndex,
    nomina: {
      fecha: normalized.date,
      hora: normalized.time,
      sede: normalized.site,
      turno: toNumber_(normalized.shift),
      empleado: normalized.employee,
      concepto: normalized.concept,
      valor: toNumber_(normalized.amount),
      observacion: normalized.note || ''
    }
  };
}

function calculateClosure(site, shift, efectivo, date) {
  requireFields_({ site: site, shift: shift, cash: efectivo, date: date }, ['site', 'shift', 'cash', 'date']);

  const efectivoNumber = toNumber_(efectivo);
  const shiftNumber = toNumber_(shift);

  const gastosSheet = getSheetByName(SHEET_GASTOS);
  const nominaSheet = getSheetByName(SHEET_NOMINA);

  const gastos = sumByCriteria_(gastosSheet, {
    dateIndex: 0,
    siteIndex: 2,
    shiftIndex: 3,
    amountIndex: 6,
    date: date,
    site: site,
    shift: shiftNumber
  });

  const nomina = sumByCriteria_(nominaSheet, {
    dateIndex: 0,
    siteIndex: 2,
    shiftIndex: 3,
    amountIndex: 6,
    date: date,
    site: site,
    shift: shiftNumber
  });

  const saldoReal = efectivoNumber - gastos - nomina;

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

function findLastRow(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    return 0;
  }

  const range = sheet.getRange(1, 1, lastRow, sheet.getLastColumn());
  const values = range.getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i].some(cell => cell !== '' && cell !== null)) {
      return i + 1;
    }
  }
  return 0;
}

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
