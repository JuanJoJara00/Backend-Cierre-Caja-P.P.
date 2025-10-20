# Backend Cierre de Caja – PanPanocha (Apps Script)

Este backend gestiona la **operación diaria de cierre de caja** en las sedes del restaurante PanPanocha.  
El objetivo es centralizar los datos de **ventas**, **gastos** y **nómina por turno**, para obtener automáticamente el **saldo real en efectivo** y generar reportes diarios consolidados.

---

## 🧩 Objetivos principales

1. Automatizar el flujo de **cierres diarios de caja** (dos por día: Turno #1 y Turno #2).
2. Registrar y descontar correctamente **gastos** y **nómina** del efectivo recibido.
3. Asegurar que los datos de cada turno no afecten los cálculos del otro.
4. Sincronizar toda la información en **Google Sheets**.
5. Permitir consultas o reportes vía endpoint (doGet/doPost).
6. Estar conectado a un frontend (web app o formulario) desarrollado en HTML/JS o Flutter, que envía los datos al backend mediante `fetch` o `axios`.

---

## 🧱 Arquitectura

### 🔹 Tecnologías
- **Google Apps Script (V8)** – Backend principal (doPost/doGet)
- **Google Sheets API interna** – Base de datos operativa
- **CLASP** – Sincronización local → Apps Script
- **GitHub** – Control de versiones y CI/CD (se activa el jueves)
- **JSON / HTTP** – Comunicación entre frontend y backend

### 🔹 Estructura del repositorio

```
.
├─ Codigo.js              # Código principal (doPost, doGet, helpers)
├─ appsscript.json        # Manifest de Apps Script
├─ .clasp.json            # Configuración de CLASP
├─ .claspignore
├─ .gitignore
└─ README.md              # Este documento
```

---

## 🧩 Funcionalidades principales

### 🟢 Registro de gastos
Guarda un gasto en la hoja `GASTOS` con los siguientes campos:
| Campo | Tipo | Descripción |
|--------|------|-------------|
| Fecha | string (YYYY-MM-DD) | Fecha del gasto |
| Hora | string (HH:mm) | Hora exacta del gasto |
| Sede | string | Ej. “CERRITOS”, “DOSQUE” |
| Turno | number | 1 (mañana) o 2 (noche) |
| Categoría | string | Tipo de gasto (insumos, transporte, imprevistos, etc.) |
| Descripción | string | Texto libre |
| Valor | number | Valor numérico del gasto |
| Responsable | string | Empleado o cajero que lo registró |

📄 Guardar en **la primera fila vacía disponible** de la hoja `GASTOS`.

---

### 🟣 Registro de nómina
Guarda un pago de nómina temporal (anticipo o pago parcial del día) en la hoja `NOMINA`.

| Campo | Tipo | Descripción |
|--------|------|-------------|
| Fecha | string | Fecha del pago |
| Hora | string | Hora del registro |
| Sede | string | Sede donde se pagó |
| Turno | number | Turno #1 o #2 |
| Empleado | string | Nombre del trabajador |
| Concepto | string | Ej. “Turno mañana”, “Hora extra”, “Bono” |
| Valor | number | Valor pagado |
| Observación | string | Texto opcional |

📄 Igual que gastos, se escribe **debajo del último registro existente**.

---

### 🟠 Cálculo de cierre por turno
- El backend recibe desde el frontend el monto total **en efectivo** del turno.
- Consulta los totales de **gastos** y **nómina** del mismo turno y sede.
- Calcula:
  ```
  Saldo Real = Efectivo Reportado - (Gastos + Nómina)
  ```
- Retorna un JSON de confirmación con el resultado:
  ```json
  {
    "ok": true,
    "turno": 1,
    "sede": "CERRITOS",
    "efectivo": 1250000,
    "gastos": 235000,
    "nomina": 420000,
    "saldo_real": 595000
  }
  ```

---

## ⚙️ Endpoints definidos

### 🔹 doPost(e)
Recibe peticiones del frontend con JSON o parámetros.  
Identifica la acción con `e.parameter.action` o `payload.action`.

**Acciones previstas:**
- `"add_expense"` → agregar gasto  
- `"add_payroll"` → agregar nómina  
- `"calculate_closure"` → calcular cierre de turno  
- `"test_connection"` → prueba de conexión  

Ejemplo:
```json
{
  "action": "add_expense",
  "date": "2025-10-19",
  "time": "15:40",
  "site": "CERRITOS",
  "shift": 1,
  "category": "Insumos",
  "description": "Compra de harina",
  "amount": 45000,
  "by": "Cajera #1"
}
```

---

### 🔹 doGet(e)
Permite pruebas rápidas desde navegador o curl.

Ejemplo:
```
GET https://script.google.com/macros/s/DEPLOYMENT_ID/exec?ping=1
→ "ok"
```

---

## 📊 Reglas de negocio

1. **Turnos independientes:**  
   Los datos de 4:00 pm y 10:00 pm no deben mezclarse.
2. **Hojas separadas por tipo:**  
   - `GASTOS` → gastos  
   - `NOMINA` → pagos  
3. **Encabezados fijos:**  
   La app detecta la fila con encabezados y pega debajo.
4. **Timestamp controlado:**  
   Se usa la hora exacta del registro, no la del envío del formulario.
5. **Control de sede:**  
   Cada sede se identifica con su hoja de Google Sheets o columna “Sede”.

---

## 🔐 Configuración segura
Usar **Script Properties** para variables globales:
```js
const PROPS = PropertiesService.getScriptProperties();
const SHEET_GASTOS = PROPS.getProperty("SHEET_GASTOS");
const SHEET_NOMINA = PROPS.getProperty("SHEET_NOMINA");
```

Esto evita exponer IDs o rutas de hojas en el código público.

---

## 🧮 Estructura de funciones internas (requerimientos Codex)
Codex deberá implementar y mantener las siguientes funciones:

| Función | Descripción | Estado |
|----------|-------------|--------|
| `addExpense(data)` | Guarda un gasto en la hoja correspondiente | ✅ existente |
| `addPayroll(data)` | Guarda registro de nómina | ✅ existente |
| `calculateClosure(site, shift, efectivo)` | Calcula cierre descontando gastos y nómina | ⚙️ pendiente de validación |
| `findLastRow(sheet)` | Encuentra última fila con datos | ⚙️ pendiente |
| `getSheetByName(name)` | Devuelve instancia de la hoja por nombre | ✅ existente |
| `formatTimestamp()` | Convierte hora/fecha local | ⚙️ mejora |
| `jsonOk(data)` y `jsonError(code,msg)` | Estandarizan respuesta JSON | ✅ existente |

---

## 🧭 Flujo de trabajo (Codex)
1. Backend recibe datos del formulario web.
2. Valida campos requeridos.
3. Determina la hoja de destino (`GASTOS` o `NOMINA`).
4. Escribe los datos al final de la hoja.
5. Si la acción es `calculate_closure`, consulta totales y devuelve JSON.
6. Maneja errores con `jsonError`.

---

## 🔄 CI/CD (Activación jueves)
- Deploy automático desde GitHub → Apps Script (mediante Service Account).
- Archivos de configuración:
  - `.github/workflows/apps-script-ci.yml`
  - Secretos: `GOOGLE_CREDENTIALS`, `SCRIPT_ID`, `DEPLOYMENT_ID`

---

## 🧩 Pruebas de endpoints (curl)
```bash
# Health check
curl "https://script.google.com/macros/s/DEPLOYMENT_ID/exec?ping=1"

# Agregar gasto
curl -X POST "https://script.google.com/macros/s/DEPLOYMENT_ID/exec"   -H "Content-Type: application/json"   -d '{"action":"add_expense","site":"CERRITOS","shift":1,"amount":50000}'
```

---

## 🛠️ Buenas prácticas para Codex
- No usar tildes ni espacios en nombres de funciones o archivos.
- Estandarizar nombres en inglés para lógica, en español para variables de negocio.
- Siempre devolver JSON estructurado (ok/data/error).
- Evitar `Logger.log()` — usar `console.log()` o `console.error()`.

---

## 📅 Próximos pasos (implementación Codex)
1. Validar estructura de columnas de las hojas reales.
2. Asegurar que `calculateClosure()` filtre correctamente por turno y sede.
3. Agregar logs internos (nivel info/error).
4. Añadir endpoint `generateDailyReport()` para consolidar ventas.
5. Conectar con dashboard de supervisión.
