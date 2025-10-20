/** ─────────────────────────────────────────────────────────────────
 * PanPanocha — Cierre de Caja (Apps Script Backend)
 * Front: Netlify (proxy /api → Web App /exec)
 * Datos: Google Sheets (+ Drive adjuntos) y opcional Supabase (mirror)
 *
 * Endpoints:
 *  - GET  /exec?meta=1
 *       → { user, role, sedes[], tipos[], logoBase64 }
 *  - POST /exec {action:"totals", Fecha, Sede, Turno}
 *       → { gastosTurno, nominaTurno, totalAfectaciones }
 *  - POST /exec {Tipo:"MYSINVENTARIOS" | "SIIGO" | "GASTOS" | "NOMINA" | "FACTURAS X PAGAR", ...}
 *
 * Configuración robusta con 3 capas (de mayor a menor prioridad):
 *  1) Script Properties     (rápidas)
 *  2) Hoja CONFIG en tu Sheet (persistente y visible)
 *  3) FALLBACK_CFG en código (último recurso / bootstrap)
 * ───────────────────────────────────────────────────────────────── */

/** ───────── 1) FALLBACK (edita la primera vez; luego usa la hoja CONFIG) */
const FALLBACK_CFG = {
  // << Coloca tus valores iniciales aquí (luego los podrás editar en CONFIG):
  SHEET_ID: '1KYna8RYho_qN-ZSD6F6hiLePi_F4AAonk7VRrNhucDU',
  DRIVE_PARENT_FOLDER_ID: '1R0NAvT_4jBWjCSVI4O3H2kPmDvIxSA1K',
  ALLOWED_SEDES: 'CERRITOS,CONDINA,DOSQUEBRADAS,SANTAROSA,PRIMAX',
  SUPABASE_URL: 'https://ducdbfrzqfxbzdwjrnkh.supabase.co',                  // opcional
  SUPABASE_SERVICE_ROLE: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1Y2RiZnJ6cWZ4Ynpkd2pybmtoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDM2NjI2NiwiZXhwIjoyMDc1OTQyMjY2fQ.6iSkdfE0NNIWKKm4IZbV1_gWoDxig-aHkiafZIc_7b0',         // opcional (service_role)
  // Preferible guardar el logo como archivo en Drive (png/jpg):
  BRAND_LOGO_FILE_ID: '1TkUMBlgFzL1OY5DgyrrlO1Mhdrs-1uWi',            // ID del logo en Drive
  // o como base64 (solo el payload, sin 'data:image/png;base64,'):
  BRAND_LOGO_BASE64: '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'
};

/** ───────── 2) Gestor de Config: mezcla Script Props + Hoja CONFIG + Fallbacks */
const Config = {
  getAll: function () {
    const out = {};

    // 2.1 Script Properties (si existen)
    try {
      Object.assign(out, PropertiesService.getScriptProperties().getProperties());
    } catch (e) {}

    // 2.2 Hoja CONFIG dentro del Sheet
    try {
      const sid = out.SHEET_ID || FALLBACK_CFG.SHEET_ID;
      if (sid) {
        const ss = SpreadsheetApp.openById(sid);
        const sh = ss.getSheetByName('CONFIG');
        if (sh) {
          const rows = sh.getDataRange().getValues().slice(1);
          rows.forEach(r => { if (r[0]) out[String(r[0]).trim()] = String(r[1] || ''); });
        }
      }
    } catch (e) {}

    // 2.3 Fallbacks en código (solo campos no presentes)
    Object.keys(FALLBACK_CFG).forEach(k => {
      if (out[k] === undefined && FALLBACK_CFG[k] !== undefined) out[k] = FALLBACK_CFG[k];
    });

    return out;
  },

  get: function (k) { return this.getAll()[k]; },

  set: function (k, v) {
    // Actualiza Hoja CONFIG + Script Properties
    const sid = this.get('SHEET_ID') || FALLBACK_CFG.SHEET_ID;
    if (sid) {
      const ss = SpreadsheetApp.openById(sid);
      let sh = ss.getSheetByName('CONFIG');
      if (!sh) { sh = ss.insertSheet('CONFIG'); sh.appendRow(['Key', 'Value']); }
      const data = sh.getDataRange().getValues();
      let placed = false;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === k) { sh.getRange(i + 1, 2).setValue(v); placed = true; break; }
      }
      if (!placed) sh.appendRow([k, v]);
    }
    PropertiesService.getScriptProperties().setProperty(k, String(v));
  }
};

// Atajos (leídos ya mezclados)
const CFG = Config.getAll();
const SHEET_ID = CFG.SHEET_ID;
const DRIVE_PARENT_FOLDER_ID = CFG.DRIVE_PARENT_FOLDER_ID;
const ALLOWED_SEDES = (CFG.ALLOWED_SEDES || '').split(',').map(s => s.trim()).filter(Boolean);
const SUPABASE_URL = CFG.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE = CFG.SUPABASE_SERVICE_ROLE || '';
const SHEET_NAMES = {
  GASTOS_CAJA: CFG.SHEET_GASTOS_CAJA || 'GASTOS CAJA',
  GASTOS: CFG.SHEET_GASTOS || 'GASTOS',
  NOMINA: CFG.SHEET_NOMINA || 'NOMINA',
  MYS: CFG.SHEET_MYS || 'MYSINVENTARIOS',
  SIIGO: CFG.SHEET_SIIGO || 'SIIGO',
  FXP: CFG.SHEET_FACTURAS || 'FACTURAS X PAGAR'
};
const GASTOS_TOTAL_HEADERS = parseHeaderList_(CFG.GASTOS_TOTAL_HEADERS, ['Ahorro', 'PropinaEntregada', 'Domicilio', 'OtrosGastos']);
const NOMINA_TOTAL_HEADERS = parseHeaderList_(CFG.NOMINA_TOTAL_HEADERS, ['TotalNomina']);

function _norm_(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s\.\-_]+/g, '')
    .toLowerCase();
}

function parseHeaderList_(raw, fallback) {
  if (!raw) return fallback.slice();
  try {
    if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
    if (typeof raw === 'string') {
      if (raw.trim().startsWith('[')) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
      }
      return raw.split(',').map(s => s.trim()).filter(Boolean);
    }
  } catch (err) {}
  return fallback.slice();
}

const ALIASES = {
  'GASTOS CAJA': {
    Fecha: 'Fecha',
    Sede: 'Sede',
    Turno: 'Turno',
    Encargado: 'Encargado',
    Observaciones: 'Observaciones',
    Ahorro: 'Ahorro',
    PropinaEntregada: 'Propina Entregada',
    Domicilio: 'Domicilio',
    OtrosGastos: 'Otros Gastos',
    DetalleOtrosGastos: 'Detalle Otros Gastos'
  },
  'GASTOS': {
    Fecha: 'Fecha',
    Sede: 'Sede',
    Turno: 'Turno',
    Encargado: 'Encargado',
    Observaciones: 'Observaciones',
    Ahorro: 'Ahorro',
    PropinaEntregada: 'Propina Entregada',
    Domicilio: 'Domicilio',
    OtrosGastos: 'Otros Gastos',
    DetalleOtrosGastos: 'Detalle Otros Gastos'
  },
  'NOMINA': {
    Fecha: 'Fecha',
    Sede: 'Sede',
    Turno: 'Turno',
    Encargado: 'Encargado',
    Observaciones: 'Observaciones',
    Empleado: 'Empleado',
    Salario: 'Salario',
    Transporte: 'Transporte',
    Extras: 'Extras',
    TotalNomina: 'Total Nomina'
  },
  'MYSINVENTARIOS': {
    Fecha: 'Fecha',
    Sede: 'Sede',
    Turno: 'Turno',
    Encargado: 'Encargado',
    Observaciones: 'Observaciones',
    CobroEfectivo: 'Cobro Efectivo',
    TotalEfectivoReal: 'Total Efectivo Real',
    EfectivoParaEntregar: 'Efectivo Para Entregar',
    SobroOFalto: 'Sobro o Falto',
    TotalVenta: 'Total Venta',
    CierreMys: 'Cierre MYS',
    Adjuntos: 'Adjuntos'
  },
  'SIIGO': {
    Fecha: 'Fecha',
    Sede: 'Sede',
    Turno: 'Turno',
    Encargado: 'Encargado',
    Observaciones: 'Observaciones',
    SinEfectivoSiigo: 'Sin Efectivo',
    CobroEfectivo: 'Cobro Efectivo',
    TotalEfectivoReal: 'Total Efectivo Real',
    EfectivoParaEntregar: 'Efectivo Para Entregar',
    SobroOFalto: 'Sobro o Falto',
    TarjetasVouchers: 'Tarjetas/Vouchers',
    CierreDatafono: 'Cierre Datafono',
    DifDatafono: 'Dif Datafono',
    Transferencia: 'Transferencia',
    TotalVenta: 'Total Venta',
    CierreSiigo: 'Cierre SIIGO',
    Adjuntos: 'Adjuntos'
  },
  'FACTURAS X PAGAR': {
    Fecha: 'Fecha',
    Sede: 'Sede',
    Turno: 'Turno',
    Encargado: 'Encargado',
    Observaciones: 'Observaciones',
    Proveedor: 'Proveedor',
    NumFactura: 'Num Factura',
    ValorFactura: 'Valor Factura',
    Categoria: 'Categoria',
    Adjuntos: 'Adjuntos'
  }
};

function getAliasForSheetName_(sheetName) {
  if (!sheetName) return {};
  if (ALIASES[sheetName]) return ALIASES[sheetName];
  const targetNorm = _norm_(sheetName);
  for (const key in ALIASES) {
    if (_norm_(key) === targetNorm) return ALIASES[key];
  }
  return {};
}

/** ───────── Utilidad: logo como data:url (prioriza archivo Drive) */
function getBrandLogoDataUrl_() {
  try {
    if (CFG.BRAND_LOGO_FILE_ID) {
      const file = DriveApp.getFileById(CFG.BRAND_LOGO_FILE_ID);
      const blob = file.getBlob();
      const b64 = Utilities.base64Encode(blob.getBytes());
      return 'data:' + blob.getContentType() + ';base64,' + b64;
    }
    if (CFG.BRAND_LOGO_BASE64) return 'data:image/png;base64,' + CFG.BRAND_LOGO_BASE64;
  } catch (e) {}
  return '';
}

/** ───────── Bootstrap: crear/actualizar pestaña CONFIG + Script Properties */
function initConfig_() {
  var sid = FALLBACK_CFG.SHEET_ID;
  if (!sid) throw new Error('FALLBACK_CFG.SHEET_ID no está definido');

  var ss = SpreadsheetApp.openById(sid);
  var sh = ss.getSheetByName('CONFIG');
  if (!sh) {
    sh = ss.insertSheet('CONFIG');
    sh.appendRow(['Key', 'Value']);
  }
  var data = sh.getDataRange().getValues();
  var map = {};
  for (var i = 1; i < data.length; i++) {
    var k = String(data[i][0] || '').trim();
    if (k) map[k] = i + 1;
  }
  Object.keys(FALLBACK_CFG).forEach(function (k) {
    var v = FALLBACK_CFG[k] == null ? '' : String(FALLBACK_CFG[k]);
    if (map[k]) sh.getRange(map[k], 2).setValue(v); else sh.appendRow([k, v]);
  });

  // Copia también a Script Properties
  PropertiesService.getScriptProperties().setProperties(FALLBACK_CFG, true);

  Logger.log('CONFIG creada/actualizada y Script Properties repobladas.');
}
// Wrapper público para que siempre salga en el menú del editor
function initConfig() { return initConfig_(); }

/** ───────── Export/restore de Script Properties (útiles en soporte) */
function exportScriptProperties() {
  const props = PropertiesService.getScriptProperties().getProperties();
  Logger.log(JSON.stringify(props, null, 2));
}
function restoreScriptProperties() {
  const data = CFG; // mezcla CONFIG + Script Props + Fallback
  PropertiesService.getScriptProperties().setProperties(data, true);
  Logger.log('Script Properties restauradas desde CFG.');
}

/** ───────────────────────────────── HTTP ───────────────────────────────── */

function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.meta == '1') {
      const out = {
        user: Session.getActiveUser().getEmail() || '',
        role: 'empleado',
        sedes: ALLOWED_SEDES,
        tipos: ['MYSINVENTARIOS', 'SIIGO', 'GASTOS', 'NOMINA', 'FACTURAS X PAGAR'],
        logoBase64: getBrandLogoDataUrl_()
      };
      return json_(out);
    }
    return json_({ ok: true, ping: 'pong' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const meta = { user: Session.getActiveUser().getEmail() || 'anon', now: new Date().toISOString() };

    if (payload.action === 'totals') {
      const totals = computeTotals_(payload.Fecha, payload.Sede, payload.Turno);
      return json_(totals);
    }

    switch (payload.Tipo) {
      case 'MYSINVENTARIOS':   return json_(handleMYS_(payload, meta));
      case 'SIIGO':            return json_(handleSIIGO_(payload, meta));
      case 'GASTOS':           return json_(handleGASTOS_(payload, meta));
      case 'NOMINA':           return json_(handleNOMINA_(payload, meta));
      case 'FACTURAS X PAGAR': return json_(handleFXP_(payload, meta));
      default: throw new Error('Tipo no soportado: ' + payload.Tipo);
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

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
  }
  return sum;
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

function handleGASTOS_(p, meta) {
  const sin = !!p.SinGastosCaja;
  const row = {
    Fecha: p.Fecha, Sede: p.Sede, Turno: p.Turno,
    Encargado: p.Encargado || '', Observaciones: p.Observaciones || '',
    Ahorro: sin ? 0 : (+p.Ahorro || 0),
    PropinaEntregada: sin ? 0 : (+p.PropinaEntregada || 0),
    Domicilio: sin ? 0 : (+p.Domicilio || 0),
    OtrosGastos: sin ? 0 : (+p.OtrosGastos || 0),
    DetalleOtrosGastos: p.DetalleOtrosGastos ? JSON.stringify(p.DetalleOtrosGastos) : ''
  };

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

  const entries = Array.isArray(p.NominaEntries) ? p.NominaEntries : [];
  if (!entries.length) throw new Error('NOMINA sin entries');

  const rows = entries.map(en => ({
    Fecha: p.Fecha, Sede: p.Sede, Turno: p.Turno,
    Encargado: p.Encargado || '', Observaciones: p.Observaciones || '',
    Empleado: en.Empleado || '',
    Salario: +en.Salario || 0,
    Transporte: +en.Transporte || 0,
    Extras: +en.Extras || 0,
    TotalNomina: +en.TotalNomina || ((+en.Salario || 0) + (+en.Transporte || 0) + (+en.Extras || 0))
  }));

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

  const entries = Array.isArray(p.FXPEntries) ? p.FXPEntries : [];
  if (!entries.length) throw new Error('FXP sin entries');

  const adjUrls = DriveService.saveBatchBase64_(
    { sede: p.Sede, tipo: SHEET_NAMES.FXP, fecha: p.Fecha, turno: p.Turno },
    p.AdjFXP
  );

  const rows = entries.map(en => ({
    Fecha: p.Fecha, Sede: p.Sede, Turno: p.Turno,
    Encargado: p.Encargado || '', Observaciones: p.Observaciones || '',
    Proveedor: en.Proveedor || '',
    NumFactura: en.NumFactura || '',
    ValorFactura: +en.ValorFactura || 0,
    Categoria: en.Categoria || '',
    Adjuntos: (adjUrls || []).join(' | ')
  }));

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

/** ───────── Drive utils (guardar adjuntos base64 en carpeta por sede/tipo/AÑO-MES) ───────── */

const DriveService = {
  saveBatchBase64_: function (meta, files) {
    try {
      if (!files || !files.length) return [];
      const parent = DriveApp.getFolderById(DRIVE_PARENT_FOLDER_ID);
      const sedeF = DriveService._ensure_(parent, safeName_(meta.sede || 'SEDE'));
      const tipoF = DriveService._ensure_(sedeF, safeName_(meta.tipo || 'TIPO'));
      const ym = (meta.fecha || '').slice(0, 7) ||
        Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
      const ymF = DriveService._ensure_(tipoF, ym);

      const urls = [];
      files.forEach(f => {
        const name = f.name || ('adj_' + Date.now() + '.jpg');
        const mime = f.mimeType || 'image/jpeg';
        const blob = Utilities.newBlob(
          Utilities.base64Decode(f.dataBase64 || ''),
          mime,
          name
        );
        const file = ymF.createFile(blob);
        urls.push(file.getUrl());
      });
      return urls;
    } catch (err) {
      return [];
    }
  },

  _ensure_: function (parent, name) {
    const it = parent.getFoldersByName(name);
    return it.hasNext() ? it.next() : parent.createFolder(name);
  }
};

function safeName_(s) {
  return String(s || '').replace(/[\\/:*?"<>|#\[\]]+/g, '-').trim().slice(0, 120);
}

/** ───────── Supabase utils (opcional) ───────── */

const SupabaseService = {
  insertMany_: function (table, arr) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !arr?.length) return;
    const url = SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/' + encodeURIComponent(table);
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(arr),
      headers: {
        apikey: SUPABASE_SERVICE_ROLE,
        Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE,
        Prefer: 'return=representation'
      },
      muteHttpExceptions: true
    });
    const code = res.getResponseCode();
    if (code >= 300) throw new Error('Supabase ' + table + ' error ' + code + ': ' + res.getContentText());
    return JSON.parse(res.getContentText() || '[]');
  }
};

/** ───────── Logs (simple) ───────── */

function log_(accion, meta, payload) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sh = ss.getSheetByName('LOGS') || ss.insertSheet('LOGS');
    const ts = new Date();
    const user = meta && meta.user || '';
    const hash = Utilities.base64EncodeWebSafe(
      Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(payload || {}))
    ).slice(0, 12);
    sh.appendRow([ts, user, accion, hash, JSON.stringify(payload || {})]);
  } catch (e) {}
}
