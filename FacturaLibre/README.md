# FacturaLibre

Sistema web de **facturación electrónica SUNAT** (factura, boleta, notas de crédito y débito), **guías de remisión electrónicas remitente y transportista (GRE)**, **compras, inventario y kardex valorizado** para pequeñas empresas de cualquier rubro (comercio, ferretería, textil, servicios, transporte, exportadores, etc.). **Multiempresa** desde la versión 2.

- **Stack:** .NET 8 · Blazor Server · PostgreSQL · Dapper · arquitectura N-capas
- **Envío a SUNAT:** directo por SEE – Del Contribuyente (sin OSE ni costos por comprobante)
- **Despliegue gratuito:** Render (web) + Neon (PostgreSQL)

---

## 1. Funcionalidades

| Módulo | Detalle |
|---|---|
| Ventas | Factura (01) y boleta (03) en soles o dólares, contado o **crédito con cuotas**, gravado / exonerado / inafecto, ítems de producto o libres, validación de RUC (dígito verificador), boletas ≥ S/ 700 con cliente identificado |
| Notas | Nota de crédito (07) y débito (08) sobre facturas o boletas. Los motivos 01, 02, 06 y 07 **devuelven stock al almacén** al costo de la venta original; control de no exceder lo vendido |
| SUNAT | XML UBL 2.1, firma digital XMLDSig con tu certificado .pfx, ZIP, envío SOAP `sendBill`, lectura de CDR (aceptado / observado / rechazado), reenvío, consulta de CDR en producción |
| Boletas | **Resumen diario (RC)** manual o automático (días anteriores y el día actual después de las 21:00) con consulta de ticket |
| Anulaciones | Facturas por **Comunicación de Baja (RA)**; boletas por resumen con estado 3. Al ser aceptadas se revierte el kardex |
| Guías | GRE remitente por la **API REST de SUNAT** (OAuth2), transporte público o privado, generada desde una factura/boleta o independiente. Motivo 04 (traslado entre establecimientos) **mueve el stock** entre almacenes |
| Compras | Registro de facturas/boletas de proveedores: entradas al kardex; el IGV se descuenta solo de productos gravados en facturas. Anulación con salida al costo original |
| Inventario | Stock por almacén, stock mínimo, saldo inicial, ajustes (tabla 12 SUNAT), mermas, transferencias internas |
| Kardex | Valorizado con **costo promedio ponderado** por almacén, saldo anterior, exportación CSV para Excel |
| Impresión | Representación impresa **A4 y ticket 80 mm** con QR y hash; botón "Guardar PDF" del navegador |
| Descargas | XML firmado, CDR (ZIP) de cada comprobante, resumen, baja y guía |
| Seguridad | Usuarios con roles ADMIN / VENDEDOR / ALMACEN, contraseñas con hash PBKDF2, sesiones por cookie |
| Detracciones | Operación 1001 (SPOT): código de bien/servicio (cat. 54) y % por producto, cuenta del Banco de la Nación, leyenda 2006, monto en soles redondeado, sugerencia automática cuando supera S/ 700 |
| Percepciones | Operación 2001 para agentes de percepción: régimen 51/52/53 (2 %, 1 %, 0.5 %), total a cobrar incluyendo la percepción, leyenda 2000 |
| Retenciones | Si el cliente está marcado como **agente de retención** y la factura supera S/ 700, se informa la retención del 3 % (cargo/descuento 62) y el neto pendiente de pago |
| ICBPER | Impuesto a las bolsas plásticas (tributo 7152) por unidad; tasa configurable (S/ 0.50 por defecto); también en resúmenes de boletas |
| Descuentos y anticipos | Descuento global (cód. 02). Facturas de **anticipo** (no mueven stock) y deducción en la factura final (cód. 04, `PrepaidPayment`) |
| Exportación | Operación 0200, afectación 40 (tributo 9995 EXP), cliente extranjero (tipo doc. 0/7/A…), en dólares |
| NC motivo 13 | Ajuste de montos y/o fechas de pago de facturas al crédito (nota en cero con nuevas cuotas) |
| GRE transportista | Guía 31 (serie V###) con remitente, destinatario, vehículo, conductor, registro MTC y TUCE opcional |
| Correo | Envío del comprobante (representación impresa HTML + XML + CDR) por **SMTP** o **API de Brevo**; envío automático opcional al emitir |
| Validar comprobante | Consulta de validez de comprobantes de proveedores con la **API oficial de SUNAT** (desde compras o en *Validar comprobante*) |
| Multiempresa | Varias empresas (RUC) en la misma base, **un esquema PostgreSQL por empresa**; selector en la cabecera; usuarios asignados a una o varias empresas |
| Compras en dólares | Compras en USD con tipo de cambio: el kardex se valoriza en soles |
| Opcional | Consulta de RUC/DNI con un token de [Decolecta](https://decolecta.com) (variable `CONSULTA_DOC_TOKEN`) |

## 2. Arquitectura (N-capas)

```
FacturaLibre.sln
├─ src/FacturaLibre.Entidades   Entidades, catálogos SUNAT, cálculo de IGV, número a letras
├─ src/FacturaLibre.Datos       PostgreSQL + Dapper: repositorios, scripts SQL y migrador automático
├─ src/FacturaLibre.Sunat       XML UBL 2.1 (CPE, RC, RA, GRE), firma, ZIP, cliente SOAP, cliente API GRE, lector de CDR
├─ src/FacturaLibre.Negocio     Reglas de negocio: ventas, notas, resúmenes, guías, compras, kardex, impresión
└─ src/FacturaLibre.Web         Blazor Server (interfaz), autenticación, descargas, tareas en segundo plano
```

La base de datos se crea sola: al iniciar, `MigradorBD` ejecuta los scripts que falten (tabla `schema_version`):
- `Scripts/Comun/*.sql` → esquema `public`: usuarios, registro de empresas, asignación usuario-empresa, llaves de protección.
- `Scripts/Empresa/*.sql` → se aplican a **cada** empresa (`public` para la empresa 1, `emp_2`, `emp_3`… para las demás).

Para cambios futuros agrega `003_xxx.sql` en la carpeta que corresponda.

**Actualizar desde la v1:** reemplaza el código y arranca; `002_ampliaciones.sql` agrega las columnas nuevas sin tocar tus datos. Borra el archivo antiguo `src/FacturaLibre.Datos/Scripts/001_inicial.sql` (se movió a `Scripts/Empresa/`).

Kardex: cada movimiento bloquea la fila de `stock` (`SELECT … FOR UPDATE`) dentro de la misma transacción del comprobante, recalcula el costo promedio y guarda el saldo en `movimiento`.

## 3. Ejecutar en tu PC

**Opción A – Visual Studio / Rider**
1. Instala PostgreSQL 14+ (o usa Docker: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16`).
2. Crea la base: `CREATE DATABASE facturalibre;`
3. Ajusta `ConnectionStrings:Default` en `src/FacturaLibre.Web/appsettings.json`.
4. Ejecuta `FacturaLibre.Web`. Ingresa con **admin / admin123** y cambia la contraseña en el ícono de llave.

**Opción B – Docker Compose**
```bash
docker compose up --build
# http://localhost:8080  (admin / admin123)
```

## 4. Primeras pruebas en BETA de SUNAT

1. **Configuración > Empresa y SUNAT:** RUC, razón social, dirección, ubigeo. Deja el ambiente en **BETA** con usuario `MODDATOS` y clave `moddatos`.
2. Carga un certificado `.pfx`. En beta sirve uno autofirmado:
   ```bash
   openssl req -x509 -newkey rsa:2048 -keyout k.pem -out c.pem -days 365 -nodes -subj "/CN=PRUEBAS"
   openssl pkcs12 -export -out prueba.pfx -inkey k.pem -in c.pem -passout pass:1234
   ```
3. **Productos:** crea algunos productos; en **Stock y ajustes** registra el saldo inicial.
4. Emite una factura, una boleta, una nota de crédito y una guía. Revisa el estado SUNAT y descarga el XML/CDR.
5. En **Resúmenes y bajas** envía el resumen de boletas del día.
6. Prueba las operaciones especiales (sección *Operaciones especiales* al emitir): detracción, percepción, descuento global, anticipo y su deducción, exportación, NC 13 y guía transportista.

> Las guías en BETA usan por defecto el entorno público de pruebas `gre-test.nubefact.com` con credenciales de prueba (se pueden cambiar en `appsettings.json`, sección `Sunat`). Si no responde, prueba las guías directamente en producción con una guía real de bajo riesgo.

## 5. Pasar a PRODUCCIÓN (checklist)

> Verifica cada paso con la normativa vigente de SUNAT; los procedimientos pueden cambiar.

1. **Certificado digital** (.pfx) emitido por una entidad acreditada. Regístralo en SUNAT Operaciones en Línea.
2. Estar habilitado como emisor electrónico y optar por el **SEE – Del Contribuyente** (desde 2018 no requiere homologación).
3. Crea un **usuario SOL secundario** con permisos de envío de comprobantes electrónicos y úsalo en la configuración.
4. Para guías: en Menú SOL > **Credenciales API SUNAT** registra una aplicación (servicio *GRE Emisión de Comprobantes*) y copia el `client_id` y `client_secret`.
5. Para **validar comprobantes de proveedores**: en Credenciales API SUNAT registra otra aplicación con el servicio *Consulta integrada de comprobantes de pago* y copia `client_id`/`client_secret` en Configuración > Empresa.
6. **Detracciones:** registra tu cuenta del Banco de la Nación; **guía transportista:** tu número de registro MTC.
7. Cambia el ambiente a **PRODUCCIÓN**, revisa las **series** (si vienes de otro sistema, coloca el último número usado) y emite un comprobante de prueba real.

## 6. Despliegue GRATUITO (Neon + Render)

**Base de datos – [Neon](https://neon.com)** (plan Free: 0.5 GB por proyecto, no expira, se suspende sola tras 5 min sin uso)
1. Crea una cuenta y un proyecto (elige la región disponible más cercana a Perú).
2. Copia la *connection string* (formato `postgresql://usuario:clave@ep-xxxx.aws.neon.tech/neondb?sslmode=require`).

**Aplicación – [Render](https://render.com)** (plan Free: 750 h/mes, se duerme tras 15 min sin tráfico y despierta en ~1 min)
1. Sube esta carpeta a un repositorio de **GitHub** (puede ser privado).
2. En Render: **New > Blueprint** y elige el repositorio (usa `render.yaml`), o **New > Web Service > Docker**.
3. Variables de entorno:
   - `DATABASE_URL` = la cadena de Neon
   - `ADMIN_PASSWORD` = contraseña inicial del usuario `admin`
   - `CONSULTA_DOC_TOKEN` = (opcional) token de consulta RUC/DNI
4. Deploy. Tu sistema quedará en `https://facturalibre-xxxx.onrender.com` con HTTPS.

Notas del plan gratuito:
- No es necesario mantenerlo despierto: cuando alguien entra, las tareas pendientes (tickets y resúmenes de boletas de días anteriores) se procesan en los siguientes minutos.
- La base de datos de Render gratis expira a los 30 días: por eso se usa Neon.
- Haz respaldos periódicos: `pg_dump "postgresql://…neon…" > respaldo.sql`.
- **Correo:** Render gratis bloquea los puertos SMTP (25/465/587). Usa **Brevo** (plan gratis: 300 correos/día): crea una API key y verifica tu remitente, luego elige "Brevo" en Configuración > Empresa > Correo. En tu PC o en otro hosting puedes usar SMTP (p. ej. Gmail con contraseña de aplicación, puerto 587).
- Neon Free (0.5 GB) alcanza para varias empresas pequeñas; los XML/CDR se guardan en la base, vigila el espacio.
- Para más usuarios o disponibilidad 24/7, basta subir de plan en Render (sin cambiar código).

## 7. Configuración (`appsettings.json` o variables de entorno)

| Clave | Descripción |
|---|---|
| `DATABASE_URL` / `ConnectionStrings:Default` | PostgreSQL (formato URL o Npgsql) |
| `ADMIN_PASSWORD` / `AdminPasswordInicial` | Clave del usuario `admin` creado en el primer arranque |
| `ResumenAutomatico` | `true` envía solo los resúmenes de boletas |
| `Sunat:FirmaSha256` | `false` = RSA-SHA1 (por defecto), `true` = RSA-SHA256 |
| `Sunat:BillServiceProduccion`, `Sunat:GreApiProduccion`, … | URLs de servicios (ver `SunatEndpoints`) |
| `CONSULTA_DOC_TOKEN` / `ConsultaDocumento:Token` | Token para consultar RUC/DNI |

## 8. Pruebas realizadas

- XML de factura, boleta, NC, ND y guía **validados contra los XSD oficiales UBL 2.1** (OASIS).
- Firma XMLDSig verificada; hash y QR generados.
- Flujos completos contra un **simulador de SUNAT**: aceptación, observaciones, rechazo (SOAP Fault), resumen diario, baja, anulación de boletas, ticket rechazado y reintento, GRE aceptada y rechazada (con reversión del traslado).
- Kardex: saldo inicial, compras (costo promedio), ventas, devoluciones por NC, anulaciones, traslados entre almacenes.
- v2: XML de detracción, percepción, retención, ICBPER + descuento global, exportación, anticipo y factura con deducción, NC 13, boleta con ICBPER y su resumen, GRE transportista — **todos válidos contra el XSD UBL 2.1**. Aislamiento entre empresas, compras en USD valorizadas en soles, envío de correo SMTP, interpretación de la respuesta de consulta de validez, migración de una base v1 existente y pruebas de interfaz de punta a punta.

**Pendiente de validar por ti:** el envío real al ambiente BETA/PRODUCCIÓN de SUNAT (el entorno donde se construyó no tenía acceso a los servidores de SUNAT). En especial, prueba en BETA antes de usar en producción:
- **Anticipos:** el `PayableAmount` se envía como total neto (después de deducir el anticipo). Si SUNAT observa/rechaza con un error de importes, ajusta `ComprobanteXml.LegalMonetaryTotal`.
- **Retención y percepción:** el tratamiento de redondeos y los validadores de SUNAT cambian; revisa las observaciones del CDR.
- **Consulta de validez y Brevo:** requieren tus credenciales reales.

## 9. No incluido (siguientes pasos sugeridos)

Comprobantes de retención (20) y percepción (40) emitidos por agentes · liquidación de compra (04) · PDF nativo (hoy se usa "Guardar como PDF" del navegador) · facturación por lotes/recurrente · reportes de ventas y registro de ventas/compras (PLE/SIRE).
