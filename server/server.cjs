// root/server/server.cjs
"use strict";

/**
 * WAVE - Certification Tracker Backend (MSSQL + Microsoft Graph)
 * - Serves API under /api/*
 * - Serves React build from ../dist on the SAME https port (29443)
 * - Creates tables if they do not exist (idempotent)
 * - Seeds initial certifications (only if table is empty)
 * - Optional daily email notifications (expiry milestones + overdue daily)
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const sql = require("mssql");
const XLSX = require("xlsx");

// Microsoft Graph
const { Client } = require("@microsoft/microsoft-graph-client");
const { ClientSecretCredential } = require("@azure/identity");
require("isomorphic-fetch");

/* ========================= Hardcoded Configs (as requested) ========================= */

// MSSQL
const dbConfig = {
  user: "PEL_DB",
  password: "Pel@0184",
  server: "10.0.50.17",
  port: 1433,
  database: "wave",
  requestTimeout: 100000,
  connectionTimeout: 10000000,
  pool: { idleTimeoutMillis: 300000 },
  options: { encrypt: false, trustServerCertificate: true },
};

// Graph
const CLIENT_ID = "3d310826-2173-44e5-b9a2-b21e940b67f7";
const TENANT_ID = "1c3de7f3-f8d1-41d3-8583-2517cf3ba3b1";
const CLIENT_SECRET = "2e78Q~yX92LfwTTOg4EYBjNQrXrZ2z5di1Kvebog";
const SENDER_EMAIL = "spot@premierenergies.com";

// Emails toggle
const EMAILS_DISABLED = false;

// HTTPS (identical)
const httpsOptions = {
  key: fs.readFileSync(path.join(__dirname, "certs", "mydomain.key")),
  cert: fs.readFileSync(path.join(__dirname, "certs", "d466aacf3db3f299.crt")),
  ca: fs.readFileSync(path.join(__dirname, "certs", "gd_bundle-g2-g1.crt")),
};

// Server
const PORT = 29443;
const HOST = "0.0.0.0";

/**
 * Optional: Public base URL used inside email links.
 * IMPORTANT: "0.0.0.0" is not reachable for recipients.
 * Set this in environment, e.g.:
 *   PUBLIC_BASE_URL=https://wave.premierenergies.com
 */
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || "").trim();

/* ========================= Graph Client ========================= */

const credential = new ClientSecretCredential(
  TENANT_ID,
  CLIENT_ID,
  CLIENT_SECRET
);
const graphClient = Client.initWithMiddleware({
  authProvider: {
    getAccessToken: async () => {
      const tokenResponse = await credential.getToken(
        "https://graph.microsoft.com/.default"
      );
      return tokenResponse.token;
    },
  },
});

async function sendEmail(toEmail, subject, htmlContent, ccEmail = []) {
  const toList = Array.isArray(toEmail)
    ? toEmail
    : String(toEmail || "")
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean);

  const ccList = Array.isArray(ccEmail)
    ? ccEmail
    : String(ccEmail || "")
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean);

  const normalize = (x) => {
    if (!x) return null;
    const s = String(x).trim();
    return s.includes("@") ? s : `${s}@premierenergies.com`;
  };
  const normalizedTo = toList.map(normalize).filter(Boolean);
  const normalizedCc = ccList.map(normalize).filter(Boolean);

  const message = {
    subject,
    body: { contentType: "HTML", content: htmlContent },
    toRecipients: normalizedTo.map((addr) => ({
      emailAddress: { address: addr },
    })),
    ccRecipients: normalizedCc.map((addr) => ({
      emailAddress: { address: addr },
    })),
  };

  // 🔇 SHORT-CIRCUIT WHEN EMAILS DISABLED
  if (EMAILS_DISABLED) {
    console.log("[EMAIL DISABLED] Would send email:", {
      to: normalizedTo,
      cc: normalizedCc,
      subject,
    });
    return;
  }

  try {
    await graphClient
      .api(`/users/${SENDER_EMAIL}/sendMail`)
      .post({ message, saveToSentItems: true });
  } catch (err) {
    const status = err?.statusCode || err?.status;
    const body = err?.body || err?.message;
    console.error("Graph sendMail failed:", status, body);
    throw err;
  }
}

/* ========================= App Setup ========================= */

const app = express();

app.use(helmet({ contentSecurityPolicy: false })); // keep relaxed for SPA assets
app.use(compression());
app.use(morgan("combined"));
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ✅ increased for optional attachments (base64 -> JSON)
app.use(express.json({ limit: "15mb" }));

/* ========================= DB Helpers ========================= */
/* ========================= Admin Reset (Excel -> DB) ========================= */

// Put the excel in: root/server/seed/BIS & IEC Certification Validity Tracker.xlsx
// OR set: CERT_SEED_XLSX_PATH=/absolute/path/to/file.xlsx
const CERT_SEED_XLSX_PATH =
  String(process.env.CERT_SEED_XLSX_PATH || "").trim() ||
  path.join(__dirname, "seed", "Book 96.xlsx");

// REQUIRED to protect destructive endpoint
// Call endpoint with header: x-admin-token: <value>
const ADMIN_RESET_TOKEN = String(process.env.ADMIN_RESET_TOKEN || "").trim();

// Common recipient list (seeded on every reset)
const DEFAULT_RECIPIENTS = [
  { name: "Chiranjeev Saluja", email: "saluja@premierenergies.com", role: "" },
  {
    name: "Vishnu Hazari",
    email: "vishnu.hazari@premierenergies.com",
    role: "",
  },
  {
    name: "Chandra Mauli Kumar",
    email: "chandra.kumar@premierenergies.com",
    role: "",
  },
  {
    name: "Vinay Rustagi",
    email: "vinay.rustagi@premierenergies.com",
    role: "",
  },
  {
    name: "Saumya Ranjan",
    email: "saumya.ranjan@premierenergies.com",
    role: "",
  },
  { name: "D N RAO", email: "nrao@premierenergies.com", role: "" },
  { name: "M P Singh", email: "singhmp@premierenergies.com", role: "" },
  { name: "Jasveen Saluja", email: "jasveen@premierenergies.com", role: "" },
  {
    name: "Venkata Pavan Kumar Koyyalamudi",
    email: "venkatapavankumar.k@premierenergies.com",
    role: "",
  },
  { name: "Ramesh T", email: "ramesh.t@premierenergies.com", role: "" },
  {
    name: "Baskara Pandian T",
    email: "baskara.pandian@premierenergies.com",
    role: "",
  },
  {
    name: "Praful Bharadwaj",
    email: "praful.bharadwaj@premierenergies.com",
    role: "",
  },
];
function isIdKey(k) {
  const s = String(k || "").toLowerCase();
  return s === "id" || s.endsWith("id"); // ✅ NOT includes("id")
}

function isValidityDateKey(k) {
  const s = String(k || "").toLowerCase();
  return s.endsWith("validityfrom") || s.endsWith("validityupto");
}

function isGuidKey(key) {
  const k = String(key || "").toLowerCase();
  return k === "id" || k.endsWith("id"); // ✅ do NOT use includes("id")
}

function isDateKey(key) {
  const k = String(key || "").toLowerCase();
  return (
    k === "validityfrom" ||
    k === "validityupto" ||
    k.endsWith("validityfrom") ||
    k.endsWith("validityupto")
  );
}

// Bind helper (re-used for transaction + non-transaction)
function bindInputs(req, bind = {}) {
  for (const [k, v] of Object.entries(bind)) {
    const key = String(k || "").toLowerCase();

    // ✅ NULL / UNDEFINED MUST HAVE AN EXPLICIT TYPE
    if (v === null || typeof v === "undefined") {
      if (key === "attachmentdata" || key.endsWith("data")) {
        req.input(k, sql.VarBinary(sql.MAX), null);
      } else if (isDateKey(key)) {
        req.input(k, sql.Date, null);
      } else if (key.endsWith("at")) {
        req.input(k, sql.DateTime2, null);
      } else if (key === "sno") {
        req.input(k, sql.Int, null);
      } else if (key === "isactive") {
        req.input(k, sql.Bit, null);
      } else if (isGuidKey(key)) {
        req.input(k, sql.UniqueIdentifier, null);
      } else {
        req.input(k, sql.NVarChar(sql.MAX), null);
      }
      continue;
    }

    // ✅ GUID strings (only for real id keys)
    if (
      isGuidKey(key) &&
      typeof v === "string" &&
      /^[0-9a-fA-F-]{36}$/.test(v)
    ) {
      req.input(k, sql.UniqueIdentifier, v);
      continue;
    }

    // ✅ booleans
    if (typeof v === "boolean") {
      req.input(k, sql.Bit, v);
      continue;
    }

    // ✅ numbers (int vs float)
    if (typeof v === "number" && Number.isFinite(v)) {
      if (Number.isInteger(v)) req.input(k, sql.Int, v);
      else req.input(k, sql.Float, v);
      continue;
    }

    // ✅ Date objects
    if (v instanceof Date) {
      if (isDateKey(key)) req.input(k, sql.Date, v);
      else req.input(k, sql.DateTime2, v);
      continue;
    }

    // ✅ Date strings for date keys (important for seed / excel paths)
    if (typeof v === "string" && isDateKey(key)) {
      const d = parseDateOrNull(v);
      req.input(k, sql.Date, d);
      continue;
    }
    if (typeof v === "string" && key.endsWith("at")) {
      const d = new Date(v);
      req.input(k, sql.DateTime2, Number.isNaN(d.getTime()) ? null : d);
      continue;
    }

    // ✅ buffers
    if (Buffer.isBuffer(v)) {
      req.input(k, sql.VarBinary(sql.MAX), v);
      continue;
    }

    // ✅ strings and everything else
    req.input(k, sql.NVarChar(sql.MAX), String(v));
  }
}

// Transaction-safe exec
async function execSqlTx(tx, queryText, bind = {}) {
  const req = tx.request();
  bindInputs(req, bind);
  return req.query(queryText);
}

function cleanStr(v) {
  if (v === null || typeof v === "undefined") return "";
  if (v instanceof Date) return toYMD(v);
  return String(v).replace(/\r\n/g, "\n").trim();
}

function normalizeCertType(raw) {
  const s = String(raw || "")
    .trim()
    .toUpperCase();
  const hasBIS = s.includes("BIS");
  const hasIEC = s.includes("IEC");

  if (hasBIS && hasIEC) return "BIS & IEC";
  if (hasIEC) return "IEC";
  return "BIS"; // default
}

// Excel -> certification rows (maps your sheet columns 1:1)
function excelSerialToDate(n) {
  // XLSX serial date -> JS Date (supports typical Excel 1900 date system)
  // XLSX.SSF.parse_date_code returns {y,m,d,...} for valid serials
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const dc = XLSX.SSF.parse_date_code(n);
  if (!dc || !dc.y || !dc.m || !dc.d) return null;
  return new Date(Date.UTC(dc.y, dc.m - 1, dc.d));
}

function parseLooseDateString(s) {
  const raw = String(s || "").trim();
  if (!raw) return null;

  // normalize multiple spaces
  const str = raw.replace(/\s+/g, " ");

  // Match dd.mm.yyyy OR dd/mm/yyyy OR mm/dd/yyyy OR dd-mm-yyyy etc.
  const m = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) {
    let a = parseInt(m[1], 10);
    let b = parseInt(m[2], 10);
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;

    const sep = (str.match(/[./-]/) || ["/"])[0];

    // If dot-separated, assume dd.mm.yyyy (common in your sheet)
    let day, month;
    if (sep === ".") {
      day = a;
      month = b;
    } else {
      // slash/hyphen: infer using >12 heuristic
      // 12/19/2023 => month/day
      // 31/01/2024 => day/month
      if (b > 12 && a <= 12) {
        month = a;
        day = b;
      } else if (a > 12 && b <= 12) {
        day = a;
        month = b;
      } else {
        // default to month/day (matches 7/29/2021 in your sheet)
        month = a;
        day = b;
      }
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return new Date(Date.UTC(y, month - 1, day));
  }

  // fallback: try native Date parse
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function excelCellToDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") return excelSerialToDate(v);

  const s = String(v).trim();
  if (!s) return null;

  return parseLooseDateString(s);
}

// Excel -> certification rows (Book 96 format: BIS row has S.No, IEC row has blank S.No)
function readCertificationsFromExcel(filePath) {
  if (!fs.existsSync(filePath)) {
    const err = new Error(`Excel file not found at: ${filePath}`);
    err.status = 400;
    throw err;
  }

  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheetName = wb.SheetNames?.[0];
  if (!sheetName) {
    const err = new Error("Excel has no sheets");
    err.status = 400;
    throw err;
  }

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    raw: true,
  });
  if (!rows?.length) return [];

  // Columns (0-index):
  // 0 S.no, 1 Plant, 2 Address, 3 R- No, 4 Type, 5 Status, 6 Model list, 7 Standard,
  // 8 Validity From, 9 Validity Upto, 10 Renewal Status, 11 Alarm Alert, 12 Action

  const out = [];

  let lastSno = null;
  let lastPlant = "";
  let lastAddress = "";

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];

    const snoRaw = r[0];
    let sno =
      typeof snoRaw === "number"
        ? Math.trunc(snoRaw)
        : /^\d+$/.test(String(snoRaw || "").trim())
        ? parseInt(String(snoRaw).trim(), 10)
        : null;

    // carry-forward like your sheet (blank sno rows)
    if (!sno && lastSno) sno = lastSno;
    if (!sno) continue;
    lastSno = sno;

    const plant = cleanStr(r[1]) || lastPlant || `Plant ${sno}`;
    const address = cleanStr(r[2]) || lastAddress || null;

    if (plant) lastPlant = plant;
    if (address) lastAddress = address;

    const rNo = cleanStr(r[3]) || null;
    const type = normalizeCertType(cleanStr(r[4]) || "BIS"); // BIS / IEC / BIS & IEC
    const status = cleanStr(r[5]) || null;
    const modelList = cleanStr(r[6]) || null;
    const standard = cleanStr(r[7]) || null;

    const vf = excelCellToDate(r[8]) || null;
    const vu = excelCellToDate(r[9]) || null;

    const renewalRaw = r[10];
    const renewalDate = excelCellToDate(renewalRaw);
    const renewalStatus = renewalDate
      ? toYMD(renewalDate)
      : cleanStr(renewalRaw) || null;

    const alarmAlert = cleanStr(r[11]) || null;
    const action = cleanStr(r[12]) || null;

    // If row is completely empty except carried sno, skip
    const hasAny =
      Boolean(rNo) ||
      Boolean(type) ||
      Boolean(status) ||
      Boolean(modelList) ||
      Boolean(standard) ||
      Boolean(vf) ||
      Boolean(vu) ||
      Boolean(renewalStatus) ||
      Boolean(alarmAlert) ||
      Boolean(action);

    if (!hasAny) continue;

    out.push({
      sno,
      plant,
      address,
      rNo,
      type: type === "BIS & IEC" ? "BIS" : type, // sheet is row-wise; keep single type
      status,
      modelList,
      standard,
      validityFrom: vf ? toYMD(vf) : null,
      validityUpto: vu ? toYMD(vu) : null,
      renewalStatus,
      alarmAlert,
      action,
    });
  }

  // stable order
  out.sort(
    (a, b) => a.sno - b.sno || String(a.type).localeCompare(String(b.type))
  );
  return out;
}

let pool;

/** YYYY-MM-DD in IST-ish display; backend stores DATE, so time is irrelevant */
function toYMD(d) {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  const y = String(dt.getFullYear()).padStart(4, "0");
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toISO(d) {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString();
}

function asGuid(id) {
  if (!id) return crypto.randomUUID();
  return String(id);
}

function parseDateOrNull(ymd) {
  if (!ymd) return null;
  const s = String(ymd).trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

async function connectDb() {
  if (pool) return pool;
  pool = await new sql.ConnectionPool(dbConfig).connect();
  pool.on("error", (e) => console.error("[mssql pool error]", e));
  return pool;
}

async function execSql(queryText, bind = {}) {
  const p = await connectDb();
  const req = p.request();
  bindInputs(req, bind);
  return req.query(queryText);
}

/* ========================= CREATE IF NOT EXISTS (Tables + Indexes) ========================= */

async function ensureSchema() {
  const ddl = `
/* =========================
   Certifications
========================= */
IF OBJECT_ID(N'dbo.Certifications', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Certifications (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    sno INT NOT NULL,
    plant NVARCHAR(200) NOT NULL,
    address NVARCHAR(MAX) NULL,

    type NVARCHAR(20) NOT NULL,  -- BIS / IEC / BIS & IEC

    /* BIS fields */
    bisRNo NVARCHAR(120) NULL,
    bisStatus NVARCHAR(30) NULL,
    bisModelList NVARCHAR(MAX) NULL,
    bisStandard NVARCHAR(MAX) NULL,
    bisValidityFrom DATE NULL,
    bisValidityUpto DATE NULL,
    bisRenewalStatus NVARCHAR(120) NULL,
    bisAlarmAlert NVARCHAR(120) NULL,
    bisAction NVARCHAR(MAX) NULL,

    /* IEC fields */
    iecRNo NVARCHAR(120) NULL,
    iecStatus NVARCHAR(30) NULL,
    iecModelList NVARCHAR(MAX) NULL,
    iecStandard NVARCHAR(MAX) NULL,
    iecValidityFrom DATE NULL,
    iecValidityUpto DATE NULL,
    iecRenewalStatus NVARCHAR(120) NULL,
    iecAlarmAlert NVARCHAR(120) NULL,
    iecAction NVARCHAR(MAX) NULL,

    /* Attachment (optional) */
    attachmentName NVARCHAR(260) NULL,
    attachmentType NVARCHAR(120) NULL,
    attachmentData VARBINARY(MAX) NULL,

    createdAt DATETIME2(3) NOT NULL,
    updatedAt DATETIME2(3) NOT NULL
  );
END;

/* ---- Ensure type width (idempotent upgrade) ---- */
IF EXISTS (
  SELECT 1
  FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.Certifications')
    AND name = N'type'
    AND max_length < 40  -- NVARCHAR(20) = 40 bytes
)
BEGIN
  ALTER TABLE dbo.Certifications ALTER COLUMN type NVARCHAR(20) NOT NULL;
END;

/* ---- Ensure BIS columns exist (idempotent upgrades) ---- */
IF COL_LENGTH(N'dbo.Certifications', N'bisRNo') IS NULL ALTER TABLE dbo.Certifications ADD bisRNo NVARCHAR(120) NULL;
IF COL_LENGTH(N'dbo.Certifications', N'bisStatus') IS NULL ALTER TABLE dbo.Certifications ADD bisStatus NVARCHAR(30) NULL;
IF COL_LENGTH(N'dbo.Certifications', N'bisModelList') IS NULL ALTER TABLE dbo.Certifications ADD bisModelList NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.Certifications', N'bisStandard') IS NULL ALTER TABLE dbo.Certifications ADD bisStandard NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.Certifications', N'bisValidityFrom') IS NULL ALTER TABLE dbo.Certifications ADD bisValidityFrom DATE NULL;
IF COL_LENGTH(N'dbo.Certifications', N'bisValidityUpto') IS NULL ALTER TABLE dbo.Certifications ADD bisValidityUpto DATE NULL;
IF COL_LENGTH(N'dbo.Certifications', N'bisRenewalStatus') IS NULL ALTER TABLE dbo.Certifications ADD bisRenewalStatus NVARCHAR(120) NULL;
IF COL_LENGTH(N'dbo.Certifications', N'bisAlarmAlert') IS NULL ALTER TABLE dbo.Certifications ADD bisAlarmAlert NVARCHAR(120) NULL;
IF COL_LENGTH(N'dbo.Certifications', N'bisAction') IS NULL ALTER TABLE dbo.Certifications ADD bisAction NVARCHAR(MAX) NULL;

/* ---- Ensure IEC columns exist (idempotent upgrades) ---- */
IF COL_LENGTH(N'dbo.Certifications', N'iecRNo') IS NULL ALTER TABLE dbo.Certifications ADD iecRNo NVARCHAR(120) NULL;
IF COL_LENGTH(N'dbo.Certifications', N'iecStatus') IS NULL ALTER TABLE dbo.Certifications ADD iecStatus NVARCHAR(30) NULL;
IF COL_LENGTH(N'dbo.Certifications', N'iecModelList') IS NULL ALTER TABLE dbo.Certifications ADD iecModelList NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.Certifications', N'iecStandard') IS NULL ALTER TABLE dbo.Certifications ADD iecStandard NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.Certifications', N'iecValidityFrom') IS NULL ALTER TABLE dbo.Certifications ADD iecValidityFrom DATE NULL;
IF COL_LENGTH(N'dbo.Certifications', N'iecValidityUpto') IS NULL ALTER TABLE dbo.Certifications ADD iecValidityUpto DATE NULL;
IF COL_LENGTH(N'dbo.Certifications', N'iecRenewalStatus') IS NULL ALTER TABLE dbo.Certifications ADD iecRenewalStatus NVARCHAR(120) NULL;
IF COL_LENGTH(N'dbo.Certifications', N'iecAlarmAlert') IS NULL ALTER TABLE dbo.Certifications ADD iecAlarmAlert NVARCHAR(120) NULL;
IF COL_LENGTH(N'dbo.Certifications', N'iecAction') IS NULL ALTER TABLE dbo.Certifications ADD iecAction NVARCHAR(MAX) NULL;

/* ---- Ensure attachment columns exist (idempotent upgrades) ---- */
IF COL_LENGTH(N'dbo.Certifications', N'attachmentName') IS NULL
BEGIN
  ALTER TABLE dbo.Certifications ADD attachmentName NVARCHAR(260) NULL;
END;

IF COL_LENGTH(N'dbo.Certifications', N'attachmentType') IS NULL
BEGIN
  ALTER TABLE dbo.Certifications ADD attachmentType NVARCHAR(120) NULL;
END;

IF COL_LENGTH(N'dbo.Certifications', N'attachmentData') IS NULL
BEGIN
  ALTER TABLE dbo.Certifications ADD attachmentData VARBINARY(MAX) NULL;
END;

/* ---- Legacy single-row columns (backward compatibility) ---- */
/* Some existing DBs already have these columns as NOT NULL.
   Our Excel-reset path does not populate them, so we must allow NULLs. */

IF COL_LENGTH(N'dbo.Certifications', N'rNo') IS NULL
BEGIN
  ALTER TABLE dbo.Certifications ADD rNo NVARCHAR(120) NULL;
END
ELSE
BEGIN
  IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.Certifications')
      AND name = N'rNo'
      AND is_nullable = 0
  )
  BEGIN
    ALTER TABLE dbo.Certifications ALTER COLUMN rNo NVARCHAR(120) NULL;
  END
END;

IF COL_LENGTH(N'dbo.Certifications', N'status') IS NULL
BEGIN
  ALTER TABLE dbo.Certifications ADD status NVARCHAR(30) NULL;
END
ELSE
BEGIN
  IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.Certifications')
      AND name = N'status'
      AND is_nullable = 0
  )
  BEGIN
    ALTER TABLE dbo.Certifications ALTER COLUMN status NVARCHAR(30) NULL;
  END
END;

IF COL_LENGTH(N'dbo.Certifications', N'modelList') IS NULL
BEGIN
  ALTER TABLE dbo.Certifications ADD modelList NVARCHAR(MAX) NULL;
END;

IF COL_LENGTH(N'dbo.Certifications', N'standard') IS NULL
BEGIN
  ALTER TABLE dbo.Certifications ADD standard NVARCHAR(MAX) NULL;
END;

IF COL_LENGTH(N'dbo.Certifications', N'validityFrom') IS NULL
BEGIN
  ALTER TABLE dbo.Certifications ADD validityFrom DATE NULL;
END;

IF COL_LENGTH(N'dbo.Certifications', N'validityUpto') IS NULL
BEGIN
  ALTER TABLE dbo.Certifications ADD validityUpto DATE NULL;
END;

IF COL_LENGTH(N'dbo.Certifications', N'renewalStatus') IS NULL
BEGIN
  ALTER TABLE dbo.Certifications ADD renewalStatus NVARCHAR(120) NULL;
END;

IF COL_LENGTH(N'dbo.Certifications', N'alarmAlert') IS NULL
BEGIN
  ALTER TABLE dbo.Certifications ADD alarmAlert NVARCHAR(120) NULL;
END;

IF COL_LENGTH(N'dbo.Certifications', N'action') IS NULL
BEGIN
  ALTER TABLE dbo.Certifications ADD action NVARCHAR(MAX) NULL;
END;

/* ---- Indexes ---- */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_Certifications_Plant' AND object_id = OBJECT_ID(N'dbo.Certifications')
)
BEGIN
  CREATE INDEX IX_Certifications_Plant ON dbo.Certifications(plant);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_Certifications_Type' AND object_id = OBJECT_ID(N'dbo.Certifications')
)
BEGIN
  CREATE INDEX IX_Certifications_Type ON dbo.Certifications(type);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_Certifications_BIS_Status' AND object_id = OBJECT_ID(N'dbo.Certifications')
)
BEGIN
  CREATE INDEX IX_Certifications_BIS_Status ON dbo.Certifications(bisStatus);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_Certifications_IEC_Status' AND object_id = OBJECT_ID(N'dbo.Certifications')
)
BEGIN
  CREATE INDEX IX_Certifications_IEC_Status ON dbo.Certifications(iecStatus);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_Certifications_BIS_ValidityUpto' AND object_id = OBJECT_ID(N'dbo.Certifications')
)
BEGIN
  CREATE INDEX IX_Certifications_BIS_ValidityUpto ON dbo.Certifications(bisValidityUpto);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_Certifications_IEC_ValidityUpto' AND object_id = OBJECT_ID(N'dbo.Certifications')
)
BEGIN
  CREATE INDEX IX_Certifications_IEC_ValidityUpto ON dbo.Certifications(iecValidityUpto);
END;

/* =========================
   Email Recipients
========================= */
IF OBJECT_ID(N'dbo.EmailRecipients', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.EmailRecipients (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    name NVARCHAR(200) NOT NULL,
    email NVARCHAR(320) NOT NULL,
    role NVARCHAR(200) NULL,
    isActive BIT NOT NULL CONSTRAINT DF_EmailRecipients_isActive DEFAULT(1),
    createdAt DATETIME2(3) NOT NULL,
    updatedAt DATETIME2(3) NOT NULL
  );
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'UX_EmailRecipients_Email' AND object_id = OBJECT_ID(N'dbo.EmailRecipients')
)
BEGIN
  CREATE UNIQUE INDEX UX_EmailRecipients_Email ON dbo.EmailRecipients(email);
END;

/* =========================
   Email Logs
========================= */
IF OBJECT_ID(N'dbo.EmailLogs', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.EmailLogs (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    certificationId UNIQUEIDENTIFIER NOT NULL,
    recipientEmail NVARCHAR(320) NOT NULL,
    emailType NVARCHAR(20) NOT NULL,     -- reminder / overdue
    milestone NVARCHAR(50) NOT NULL,     -- BIS:6-months / IEC:overdue / etc.
    sentAt DATETIME2(3) NOT NULL,
    status NVARCHAR(20) NOT NULL,        -- sent / failed
    error NVARCHAR(MAX) NULL
  );

  ALTER TABLE dbo.EmailLogs
    ADD CONSTRAINT FK_EmailLogs_Certifications
    FOREIGN KEY (certificationId) REFERENCES dbo.Certifications(id)
    ON DELETE CASCADE;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_EmailLogs_Certification' AND object_id = OBJECT_ID(N'dbo.EmailLogs')
)
BEGIN
  CREATE INDEX IX_EmailLogs_Certification ON dbo.EmailLogs(certificationId);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_EmailLogs_Recipient' AND object_id = OBJECT_ID(N'dbo.EmailLogs')
)
BEGIN
  CREATE INDEX IX_EmailLogs_Recipient ON dbo.EmailLogs(recipientEmail);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_EmailLogs_Milestone' AND object_id = OBJECT_ID(N'dbo.EmailLogs')
)
BEGIN
  CREATE INDEX IX_EmailLogs_Milestone ON dbo.EmailLogs(milestone);
END;
`;
  await execSql(ddl);
}

/* ========================= Seed Initial Data (same as your db.ts) ========================= */

async function seedIfEmpty() {
  const res = await execSql(`SELECT COUNT(1) AS cnt FROM dbo.Certifications;`);
  const cnt = Number(res.recordset?.[0]?.cnt || 0);
  if (cnt > 0) return;

  const now = new Date();

  const initialData = [
    // =========================
    // 1) PEPPL (P2)
    // =========================

    // BIS (3 rows)
    {
      sno: 1,
      plant: "PEPPL (P2)",
      address:
        "PLOT NO 8/B/1 AND 8/B/2, SY NO 62 P 63 P AND 88 P, E CITY, RAVIRYALA VILLAGE, MAHESHWARAM MANDAL, RANGA REDDY, TELANGANA, 501359",
      rNo: "R-63002356",
      type: "BIS",
      status: "Active",
      modelList: "Perc Monofacial M10: PE-XXXHM(where xxx- 555 to 520)",
      standard:
        "IS 14286 : 2010/ IEC 61215 : 2005, IS/IEC 61730 (PART 1) : 2004 & IS/IEC 61730 (PART 2) : 2004",
      validityFrom: "2021-07-29",
      validityUpto: "2023-07-28",
      renewalStatus: "46962",
      alarmAlert: "",
      action: "",
    },
    {
      sno: 1,
      plant: "PEPPL (P2)",
      address:
        "PLOT NO 8/B/1 AND 8/B/2, SY NO 62 P 63 P AND 88 P, E CITY, RAVIRYALA VILLAGE, MAHESHWARAM MANDAL, RANGA REDDY, TELANGANA, 501359",
      rNo: "R-63002356",
      type: "BIS",
      status: "Active",
      modelList: "Perc Transparent BS M10: PE-XXXHB(where xxx- 550 to 525)",
      standard:
        "IS 14286 : 2010/ IEC 61215 : 2005, IS/IEC 61730 (PART 1) : 2004 & IS/IEC 61730 (PART 2) : 2004",
      validityFrom: "2021-07-29",
      validityUpto: "2023-07-28",
      renewalStatus: "46962",
      alarmAlert: "",
      action: "",
    },
    {
      sno: 1,
      plant: "PEPPL (P2)",
      address:
        "PLOT NO 8/B/1 AND 8/B/2, SY NO 62 P 63 P AND 88 P, E CITY, RAVIRYALA VILLAGE, MAHESHWARAM MANDAL, RANGA REDDY, TELANGANA, 501359",
      rNo: "R-63002356",
      type: "BIS",
      status: "Active",
      modelList: "Perc Dual Glass M10: PE-XXXHGB(where xxx- 550 to 525)",
      standard:
        "IS 14286 : 2010/ IEC 61215 : 2005, IS/IEC 61730 (PART 1) : 2004 & IS/IEC 61730 (PART 2) : 2004",
      validityFrom: "2021-07-29",
      validityUpto: "2023-07-28",
      renewalStatus: "46962",
      alarmAlert: "",
      action: "",
    },

    // IEC (6 rows)
    {
      sno: 1,
      plant: "PEPPL (P2)",
      address:
        "PLOT NO 8/B/1 AND 8/B/2, SY NO 62 P 63 P AND 88 P, E CITY, RAVIRYALA VILLAGE, MAHESHWARAM MANDAL, RANGA REDDY, TELANGANA, 501359",
      rNo: "4478021406749-182R2M1",
      type: "IEC",
      status: "Active",
      modelList: "Perc Monofacial M10: PE-XXXHM(where xxx- 555 to 520)",
      standard:
        "IEC/EN 61215:2016,IEC/EN 61215-1-1:2016,IEC 61215-2:2016,/EN 61215-2:2017+AC:2017+AC:2018,\nIEC 61730-1:2016/EN IEC 61730-1:2018+AC:2018,\nIEC 61730-2:2016/EN IEC 61730-2:2018+AC:2018",
      validityFrom: "2022-01-12",
      validityUpto: "2026-08-26",
      renewalStatus: "",
      alarmAlert: "",
      action: "",
    },
    {
      sno: 1,
      plant: "PEPPL (P2)",
      address:
        "PLOT NO 8/B/1 AND 8/B/2, SY NO 62 P 63 P AND 88 P, E CITY, RAVIRYALA VILLAGE, MAHESHWARAM MANDAL, RANGA REDDY, TELANGANA, 501359",
      rNo: "ID 1111261827",
      type: "IEC",
      status: "Active",
      modelList: "Perc Transparent BS M10: PE-XXXHB(where xxx- 555 to 525)",
      standard:
        "IEC 61215-1:2021,IEC 61215-1-1:2021, IEC 61215-2:2021\nIEC 61730-1:2016, IEC 61730-2:2016",
      validityFrom: "2024-01-31",
      validityUpto: "2027-11-20",
      renewalStatus: "",
      alarmAlert: "",
      action: "",
    },
    {
      sno: 1,
      plant: "PEPPL (P2)",
      address:
        "PLOT NO 8/B/1 AND 8/B/2, SY NO 62 P 63 P AND 88 P, E CITY, RAVIRYALA VILLAGE, MAHESHWARAM MANDAL, RANGA REDDY, TELANGANA, 501359",
      rNo: "ID 1111296708",
      type: "IEC",
      status: "Active",
      modelList: "Perc Dual Glass M10: PE-XXXHGB(where xxx- 560 to 525)",
      standard:
        "IEC 61215-1:2021 , IEC 61215-1-1:2021 ,IEC 61215-2:2021 ,IEC 61730-1:2023 ,IEC 61730-2:2023 ,EN IEC 61215-1:2021 \nEN IEC 61215-1-1:2021 ,EN IEC 61215-2:2021 \nEN IEC 61730-1:2018 ,EN IEC 61730-2:2018",
      validityFrom: "2025-01-24",
      validityUpto: "2030-01-23",
      renewalStatus: "",
      alarmAlert: "",
      action: "",
    },
    {
      sno: 1,
      plant: "PEPPL (P2)",
      address:
        "PLOT NO 8/B/1 AND 8/B/2, SY NO 62 P 63 P AND 88 P, E CITY, RAVIRYALA VILLAGE, MAHESHWARAM MANDAL, RANGA REDDY, TELANGANA, 501359",
      rNo: "ID 1111296708",
      type: "IEC",
      status: "Active",
      modelList:
        "TopCON Dual Glass M10: PEI-144-xxxTHGB-M10 (where xxx- 590 to 560)",
      standard:
        "IEC 61215-1:2021 , IEC 61215-1-1:2021 ,IEC 61215-2:2021 ,IEC 61730-1:2023 ,IEC 61730-2:2023 ,EN IEC 61215-1:2021 \nEN IEC 61215-1-1:2021 ,EN IEC 61215-2:2021 \nEN IEC 61730-1:2018 ,EN IEC 61730-2:2018",
      validityFrom: "2025-01-24",
      validityUpto: "2030-01-23",
      renewalStatus: "",
      alarmAlert: "",
      action: "",
    },
    {
      sno: 1,
      plant: "PEPPL (P2)",
      address:
        "PLOT NO 8/B/1 AND 8/B/2, SY NO 62 P 63 P AND 88 P, E CITY, RAVIRYALA VILLAGE, MAHESHWARAM MANDAL, RANGA REDDY, TELANGANA, 501359",
      rNo: "ID 1111296708",
      type: "IEC",
      status: "Active",
      modelList:
        "PERC Dual Glass G12: PEI-132-xxxHGB-G12(where xxx-670 to 645)",
      standard:
        "IEC 61215-1:2021 , IEC 61215-1-1:2021 ,IEC 61215-2:2021 ,IEC 61730-1:2023 ,IEC 61730-2:2023 ,EN IEC 61215-1:2021 \nEN IEC 61215-1-1:2021 ,EN IEC 61215-2:2021 \nEN IEC 61730-1:2018 ,EN IEC 61730-2:2018",
      validityFrom: "2025-01-24",
      validityUpto: "2030-01-23",
      renewalStatus: "",
      alarmAlert: "",
      action: "",
    },
    {
      sno: 1,
      plant: "PEPPL (P2)",
      address:
        "PLOT NO 8/B/1 AND 8/B/2, SY NO 62 P 63 P AND 88 P, E CITY, RAVIRYALA VILLAGE, MAHESHWARAM MANDAL, RANGA REDDY, TELANGANA, 501359",
      rNo: "ID 1111296708",
      type: "IEC",
      status: "Active",
      modelList:
        "TopCON Dual Glass G12R: PE-132-xxxTHGB-G12R (where xxx-630 to 570)",
      standard:
        "IEC 61215-1:2021 , IEC 61215-1-1:2021 ,IEC 61215-2:2021 ,IEC 61730-1:2023 ,IEC 61730-2:2023 ,EN IEC 61215-1:2021 \nEN IEC 61215-1-1:2021 ,EN IEC 61215-2:2021 \nEN IEC 61730-1:2018 ,EN IEC 61730-2:2018",
      validityFrom: "2025-01-24",
      validityUpto: "2030-01-23",
      renewalStatus: "",
      alarmAlert: "",
      action: "",
    },

    // =========================
    // 2) PEIPL (P4)
    // =========================
    {
      sno: 2,
      plant: "PEIPL (P4)",
      address:
        "PLOT NOS. S-95, S-96, S-100, S-101, S-102, S-103 & S-104, RAVIRYALA, RAVIRYAL(V),MAHESWARAM(M), RANGAREDDY(D)- 501359",
      rNo: "R-63003719",
      type: "BIS",
      status: "Inactive",
      modelList:
        "Perc Transparent M10: PEI-144-xxxHB-M10 (where xxx- 555 to 525)",
      standard:
        "IS 14286 : 2010/ IEC 61215 : 2005, IS/IEC 61730 (PART 1) : 2004 & IS/IEC 61730 (PART 2) : 2004",
      validityFrom: "2023-12-19",
      validityUpto: "2025-12-18",
      renewalStatus: "",
      alarmAlert: "Start Certification",
      action:
        "Samples are already submitted. Expected BIS certification by W3 of Jan'26",
    },
    {
      sno: 2,
      plant: "PEIPL (P4)",
      address:
        "PLOT NOS. S-95, S-96, S-100, S-101, S-102, S-103 & S-104, RAVIRYALA, RAVIRYAL(V),MAHESWARAM(M), RANGAREDDY(D)- 501359",
      rNo: "R-63003719",
      type: "BIS",
      status: "Inactive",
      modelList:
        "Perc Dual Glass M10: PEI-144-xxxHGB-M10 (where xxx- 555 to 525)",
      standard:
        "IS 14286 : 2010/ IEC 61215 : 2005, IS/IEC 61730 (PART 1) : 2004 & IS/IEC 61730 (PART 2) : 2004",
      validityFrom: "2023-12-19",
      validityUpto: "2025-12-18",
      renewalStatus: "",
      alarmAlert: "Start Certification",
      action: "Confirm if sample planning is required",
    },
    {
      sno: 2,
      plant: "PEIPL (P4)",
      address:
        "PLOT NOS. S-95, S-96, S-100, S-101, S-102, S-103 & S-104, RAVIRYALA, RAVIRYAL(V),MAHESWARAM(M), RANGAREDDY(D)- 501359",
      rNo: "R-63003719",
      type: "BIS",
      status: "Under process",
      modelList:
        "TopCON Dual Glass M10: PEI-144-xxxTHGB-M10 (where xxx- 590 to 560)",
      standard:
        "IS 14286 : 2010/ IEC 61215 : 2005, IS/IEC 61730 (PART 1) : 2004 & IS/IEC 61730 (PART 2) : 2004",
      validityFrom: "2023-12-19",
      validityUpto: "2025-12-18",
      renewalStatus: "",
      alarmAlert: "Start Certification",
      action: "Confirm if sample planning is required",
    },
    {
      sno: 2,
      plant: "PEIPL (P4)",
      address:
        "PLOT NOS. S-95, S-96, S-100, S-101, S-102, S-103 & S-104, RAVIRYALA, RAVIRYAL(V),MAHESWARAM(M), RANGAREDDY(D)- 501359",
      rNo: "R-63003719",
      type: "BIS",
      status: "Inactive",
      modelList:
        "PERC Dual Glass G12: PEI-132-xxxHGB-G12(where xxx-670 to 645)",
      standard:
        "IS 14286 : 2010/ IEC 61215 : 2005, IS/IEC 61730 (PART 1) : 2004 & IS/IEC 61730 (PART 2) : 2004",
      validityFrom: "2023-12-19",
      validityUpto: "2025-12-18",
      renewalStatus: "",
      alarmAlert: "Start Certification",
      action: "Confirm if sample planning is required",
    },
    {
      sno: 2,
      plant: "PEIPL (P4)",
      address:
        "PLOT NOS. S-95, S-96, S-100, S-101, S-102, S-103 & S-104, RAVIRYALA, RAVIRYAL(V),MAHESWARAM(M), RANGAREDDY(D)- 501359",
      rNo: "R-63003719",
      type: "BIS",
      status: "Inactive",
      modelList:
        "TopCON Dual Glass G12R: PE-132-xxxTHGB-G12R (where xxx-630 to 600)",
      standard:
        "IS 14286 : 2010/ IEC 61215 : 2005, IS/IEC 61730 (PART 1) : 2004 & IS/IEC 61730 (PART 2) : 2004",
      validityFrom: "2023-12-19",
      validityUpto: "2025-12-18",
      renewalStatus: "",
      alarmAlert: "Start Certification",
      action: "Confirm if sample planning is required",
    },

    // IEC (P4)
    {
      sno: 2,
      plant: "PEIPL (P4)",
      address:
        "PLOT NOS. S-95, S-96, S-100, S-101, S-102, S-103 & S-104, RAVIRYALA, RAVIRYAL(V),MAHESWARAM(M), RANGAREDDY(D)- 501359",
      rNo: "ID 1111261827",
      type: "IEC",
      status: "Active",
      modelList: "Perc Transparent BS M10: PE-XXXHB(where xxx- 555 to 525)",
      standard:
        "IEC 61215-1-1: 2021 & IS/IEC 61730-1: 2016 & IS/IEC 61730-2: 2016",
      validityFrom: "2024-01-31",
      validityUpto: "2027-11-20",
      renewalStatus: "",
      alarmAlert: "",
      action: "",
    },
    {
      sno: 2,
      plant: "PEIPL (P4)",
      address:
        "PLOT NOS. S-95, S-96, S-100, S-101, S-102, S-103 & S-104, RAVIRYALA, RAVIRYAL(V),MAHESWARAM(M), RANGAREDDY(D)- 501359",
      rNo: "ID 1111296708",
      type: "IEC",
      status: "Active",
      modelList: "Perc Dual Glass M10: PE-XXXHGB(where xxx- 560 to 525)",
      standard:
        "IEC 61215-1:2021 , IEC 61215-1-1:2021 ,IEC 61215-2:2021 ,IEC 61730-1:2023 ,IEC 61730-2:2023 ,EN IEC 61215-1:2021 \nEN IEC 61215-1-1:2021 ,EN IEC 61215-2:2021 \nEN IEC 61730-1:2018 ,EN IEC 61730-2:2018",
      validityFrom: "2025-01-24",
      validityUpto: "2030-01-23",
      renewalStatus: "",
      alarmAlert: "",
      action: "",
    },
    {
      sno: 2,
      plant: "PEIPL (P4)",
      address:
        "PLOT NOS. S-95, S-96, S-100, S-101, S-102, S-103 & S-104, RAVIRYALA, RAVIRYAL(V),MAHESWARAM(M), RANGAREDDY(D)- 501359",
      rNo: "ID 1111296708",
      type: "IEC",
      status: "Active",
      modelList:
        "TopCON Dual Glass M10: PEI-144-xxxTHGB-M10 (where xxx- 590 to 560)",
      standard:
        "IEC 61215-1:2021 , IEC 61215-1-1:2021 ,IEC 61215-2:2021 ,IEC 61730-1:2023 ,IEC 61730-2:2023 ,EN IEC 61215-1:2021 \nEN IEC 61215-1-1:2021 ,EN IEC 61215-2:2021 \nEN IEC 61730-1:2018 ,EN IEC 61730-2:2018",
      validityFrom: "2025-01-24",
      validityUpto: "2030-01-23",
      renewalStatus: "",
      alarmAlert: "",
      action: "",
    },
    {
      sno: 2,
      plant: "PEIPL (P4)",
      address:
        "PLOT NOS. S-95, S-96, S-100, S-101, S-102, S-103 & S-104, RAVIRYALA, RAVIRYAL(V),MAHESWARAM(M), RANGAREDDY(D)- 501359",
      rNo: "ID 1111296708",
      type: "IEC",
      status: "Active",
      modelList:
        "PERC Dual Glass G12: PEI-132-xxxHGB-G12(where xxx-670 to 645)",
      standard:
        "IEC 61215-1:2021 , IEC 61215-1-1:2021 ,IEC 61215-2:2021 ,IEC 61730-1:2023 ,IEC 61730-2:2023 ,EN IEC 61215-1:2021 \nEN IEC 61215-1-1:2021 ,EN IEC 61215-2:2021 \nEN IEC 61730-1:2018 ,EN IEC 61730-2:2018",
      validityFrom: "2025-01-24",
      validityUpto: "2030-01-23",
      renewalStatus: "",
      alarmAlert: "",
      action: "",
    },
    {
      sno: 2,
      plant: "PEIPL (P4)",
      address:
        "PLOT NOS. S-95, S-96, S-100, S-101, S-102, S-103 & S-104, RAVIRYALA, RAVIRYAL(V),MAHESWARAM(M), RANGAREDDY(D)- 501359",
      rNo: "ID 1111296708",
      type: "IEC",
      status: "Active",
      modelList:
        "TopCON Dual Glass G12R: PE-132-xxxTHGB-G12R (where xxx-630 to 570)",
      standard:
        "IEC 61215-1:2021 , IEC 61215-1-1:2021 ,IEC 61215-2:2021 ,IEC 61730-1:2023 ,IEC 61730-2:2023 ,EN IEC 61215-1:2021 \nEN IEC 61215-1-1:2021 ,EN IEC 61215-2:2021 \nEN IEC 61730-1:2018 ,EN IEC 61730-2:2018",
      validityFrom: "2025-01-24",
      validityUpto: "2030-01-23",
      renewalStatus: "",
      alarmAlert: "",
      action: "",
    },

    // =========================
    // 3) PEGEPL(P5)
    // =========================
    {
      sno: 3,
      plant: "PEGEPL(P5)",
      address:
        "S-95,S-96,S-100,S-101,S-102,S-103 AND S-104/ PART 1, E CITY,RAVIRYALA,MAHESWARAM, MAHESWARAM,RANGAREDDY-501359 TELANGANA,India-501359",
      rNo: "R-63004740",
      type: "BIS",
      status: "Active",
      modelList:
        "TopCON Dual Glass M10: PEI-144-xxxTHGB-M10 (where xxx- 590 to 560)",
      standard:
        "IS 14286 : 2010/ IEC 61215 : 2005, IS/IEC 61730 (PART 1) : 2004 & IS/IEC 61730 (PART 2) : 2004",
      validityFrom: "2025-01-21",
      validityUpto: "2027-01-09",
      renewalStatus: "",
      alarmAlert: "",
      action: "",
    },
    {
      sno: 3,
      plant: "PEGEPL(P5)",
      address:
        "S-95,S-96,S-100,S-101,S-102,S-103 AND S-104/ PART 1, E CITY,RAVIRYALA,MAHESWARAM, MAHESWARAM,RANGAREDDY-501359 TELANGANA,India-501359",
      rNo: "R-63004740",
      type: "BIS",
      status: "Active",
      modelList:
        "TopCON Dual Glass G12R: PE-132-xxxTHGB-G12R (where xxx-630 to 600)",
      standard:
        "IS 14286 : 2010/ IEC 61215 : 2005, IS/IEC 61730 (PART 1) : 2004 & IS/IEC 61730 (PART 2) : 2004",
      validityFrom: "2025-01-21",
      validityUpto: "2027-01-09",
      renewalStatus: "",
      alarmAlert: "",
      action: "",
    },
    {
      sno: 3,
      plant: "PEGEPL(P5)",
      address:
        "S-95,S-96,S-100,S-101,S-102,S-103 AND S-104/ PART 1, E CITY,RAVIRYALA,MAHESWARAM, MAHESWARAM,RANGAREDDY-501359 TELANGANA,India-501359",
      rNo: "R-63004740",
      type: "BIS",
      status: "Active",
      modelList:
        "TopCON Dual Glass G12: PE-132-xxxTHGB-G12 (where xxx-680 to 710)",
      standard:
        "IS 14286 : 2010/ IEC 61215 : 2005, IS/IEC 61730 (PART 1) : 2004 & IS/IEC 61730 (PART 2) : 2004",
      validityFrom: "2025-01-21",
      validityUpto: "2027-01-09",
      renewalStatus: "",
      alarmAlert: "",
      action: "",
    },

    // IEC (P5) (4 rows)
    {
      sno: 3,
      plant: "PEGEPL(P5)",
      address:
        "S-95,S-96,S-100,S-101,S-102,S-103 AND S-104/ PART 1, E CITY,RAVIRYALA,MAHESWARAM, MAHESWARAM,RANGAREDDY-501359 TELANGANA,India-501359",
      rNo: "ID 1111296708",
      type: "IEC",
      status: "Active",
      modelList: "Perc Dual Glass M10: PE-XXXHGB(where xxx- 560 to 525)",
      standard:
        "IEC 61215-1:2021 , IEC 61215-1-1:2021 ,IEC 61215-2:2021 ,IEC 61730-1:2023 ,IEC 61730-2:2023 ,EN IEC 61215-1:2021 \nEN IEC 61215-1-1:2021 ,EN IEC 61215-2:2021 \nEN IEC 61730-1:2018 ,EN IEC 61730-2:2018",
      validityFrom: "2025-01-24",
      validityUpto: "2030-01-23",
      renewalStatus: "",
      alarmAlert: "",
      action: "",
    },
    {
      sno: 3,
      plant: "PEGEPL(P5)",
      address:
        "S-95,S-96,S-100,S-101,S-102,S-103 AND S-104/ PART 1, E CITY,RAVIRYALA,MAHESWARAM, MAHESWARAM,RANGAREDDY-501359 TELANGANA,India-501359",
      rNo: "ID 1111296708",
      type: "IEC",
      status: "Active",
      modelList:
        "TopCON Dual Glass M10: PEI-144-xxxTHGB-M10 (where xxx- 590 to 560)",
      standard:
        "IEC 61215-1:2021 , IEC 61215-1-1:2021 ,IEC 61215-2:2021 ,IEC 61730-1:2023 ,IEC 61730-2:2023 ,EN IEC 61215-1:2021 \nEN IEC 61215-1-1:2021 ,EN IEC 61215-2:2021 \nEN IEC 61730-1:2018 ,EN IEC 61730-2:2018",
      validityFrom: "2025-01-24",
      validityUpto: "2030-01-23",
      renewalStatus: "",
      alarmAlert: "",
      action: "",
    },
    {
      sno: 3,
      plant: "PEGEPL(P5)",
      address:
        "S-95,S-96,S-100,S-101,S-102,S-103 AND S-104/ PART 1, E CITY,RAVIRYALA,MAHESWARAM, MAHESWARAM,RANGAREDDY-501359 TELANGANA,India-501359",
      rNo: "ID 1111296708",
      type: "IEC",
      status: "Active",
      modelList:
        "PERC Dual Glass G12: PEI-132-xxxHGB-G12(where xxx-670 to 645)",
      standard:
        "IEC 61215-1:2021 , IEC 61215-1-1:2021 ,IEC 61215-2:2021 ,IEC 61730-1:2023 ,IEC 61730-2:2023 ,EN IEC 61215-1:2021 \nEN IEC 61215-1-1:2021 ,EN IEC 61215-2:2021 \nEN IEC 61730-1:2018 ,EN IEC 61730-2:2018",
      validityFrom: "2025-01-24",
      validityUpto: "2030-01-23",
      renewalStatus: "",
      alarmAlert: "",
      action: "",
    },
    {
      sno: 3,
      plant: "PEGEPL(P5)",
      address:
        "S-95,S-96,S-100,S-101,S-102,S-103 AND S-104/ PART 1, E CITY,RAVIRYALA,MAHESWARAM, MAHESWARAM,RANGAREDDY-501359 TELANGANA,India-501359",
      rNo: "ID 1111296708",
      type: "IEC",
      status: "Active",
      modelList:
        "TopCON Dual Glass G12R: PE-132-xxxTHGB-G12R (where xxx-630 to 570)",
      standard:
        "IEC 61215-1:2021 , IEC 61215-1-1:2021 ,IEC 61215-2:2021 ,IEC 61730-1:2023 ,IEC 61730-2:2023 ,EN IEC 61215-1:2021 \nEN IEC 61215-1-1:2021 ,EN IEC 61215-2:2021 \nEN IEC 61730-1:2018 ,EN IEC 61730-2:2018",
      validityFrom: "2025-01-24",
      validityUpto: "2030-01-23",
      renewalStatus: "",
      alarmAlert: "",
      action: "",
    },

    // =========================
    // 4) PEGEPL(P6)
    // =========================
    {
      sno: 4,
      plant: "PEGEPL(P6)",
      address: "303, 304, 305 AND 306/2, IALA-MAHESWARAM, RANGAREDDY",
      rNo: "R-63005460",
      type: "BIS",
      status: "Active",
      modelList:
        "TopCON Dual Glass G12R: PE-132-xxxTHGB-G12R (where xxx-630 to 600)",
      standard:
        "IS 14286 (PART 1/SEC 1) : 2023/ IEC 61215-1-1: 2021 & IS/IEC 61730-1: 2016 & IS/IEC 61730-2: 2016",
      validityFrom: "2025-12-11",
      validityUpto: "2027-12-10",
      renewalStatus: "",
      alarmAlert: "",
      action: "",
    },

    // IEC (P6) (4 rows)
    {
      sno: 4,
      plant: "PEGEPL(P6)",
      address: "303, 304, 305 AND 306/2, IALA-MAHESWARAM, RANGAREDDY",
      rNo: "ID 1111296708",
      type: "IEC",
      status: "Active",
      modelList: "Perc Dual Glass M10: PE-XXXHGB(where xxx- 560 to 525)",
      standard:
        "IEC 61215-1:2021 , IEC 61215-1-1:2021 ,IEC 61215-2:2021 ,IEC 61730-1:2023 ,IEC 61730-2:2023 ,EN IEC 61215-1:2021 \nEN IEC 61215-1-1:2021 ,EN IEC 61215-2:2021 \nEN IEC 61730-1:2018 ,EN IEC 61730-2:2018",
      validityFrom: "2025-01-24",
      validityUpto: "2030-01-23",
      renewalStatus: "",
      alarmAlert: "",
      action: "",
    },
    {
      sno: 4,
      plant: "PEGEPL(P6)",
      address: "303, 304, 305 AND 306/2, IALA-MAHESWARAM, RANGAREDDY",
      rNo: "ID 1111296708",
      type: "IEC",
      status: "Active",
      modelList:
        "TopCON Dual Glass M10: PEI-144-xxxTHGB-M10 (where xxx- 590 to 560)",
      standard:
        "IEC 61215-1:2021 , IEC 61215-1-1:2021 ,IEC 61215-2:2021 ,IEC 61730-1:2023 ,IEC 61730-2:2023 ,EN IEC 61215-1:2021 \nEN IEC 61215-1-1:2021 ,EN IEC 61215-2:2021 \nEN IEC 61730-1:2018 ,EN IEC 61730-2:2018",
      validityFrom: "2025-01-24",
      validityUpto: "2030-01-23",
      renewalStatus: "",
      alarmAlert: "",
      action: "",
    },
    {
      sno: 4,
      plant: "PEGEPL(P6)",
      address: "303, 304, 305 AND 306/2, IALA-MAHESWARAM, RANGAREDDY",
      rNo: "ID 1111296708",
      type: "IEC",
      status: "Active",
      modelList:
        "PERC Dual Glass G12: PEI-132-xxxHGB-G12(where xxx-670 to 645)",
      standard:
        "IEC 61215-1:2021 , IEC 61215-1-1:2021 ,IEC 61215-2:2021 ,IEC 61730-1:2023 ,IEC 61730-2:2023 ,EN IEC 61215-1:2021 \nEN IEC 61215-1-1:2021 ,EN IEC 61215-2:2021 \nEN IEC 61730-1:2018 ,EN IEC 61730-2:2018",
      validityFrom: "2025-01-24",
      validityUpto: "2030-01-23",
      renewalStatus: "",
      alarmAlert: "",
      action: "",
    },
    {
      sno: 4,
      plant: "PEGEPL(P6)",
      address: "303, 304, 305 AND 306/2, IALA-MAHESWARAM, RANGAREDDY",
      rNo: "ID 1111296708",
      type: "IEC",
      status: "Active",
      modelList:
        "TopCON Dual Glass G12R: PE-132-xxxTHGB-G12R (where xxx-630 to 570)",
      standard:
        "IEC 61215-1:2021 , IEC 61215-1-1:2021 ,IEC 61215-2:2021 ,IEC 61730-1:2023 ,IEC 61730-2:2023 ,EN IEC 61215-1:2021 \nEN IEC 61215-1-1:2021 ,EN IEC 61215-2:2021 \nEN IEC 61730-1:2018 ,EN IEC 61730-2:2018",
      validityFrom: "2025-01-24",
      validityUpto: "2030-01-23",
      renewalStatus: "",
      alarmAlert: "",
      action: "",
    },

    // =========================
    // 5) PEGEPL(P7)
    // =========================
    {
      sno: 5,
      plant: "PEGEPL(P7)",
      address:
        "Plot no. UDL-5 . IP Seetharampur, Rangareddy  \nDt Shabad Rangareddy Seetharampur, \nTELANGANA-509217",
      rNo: "-",
      type: "BIS",
      status: "-",
      modelList:
        "TopCON Dual Glass G12R: PE-132-xxxTHGB-G12R (where xxx-630 to 600)",
      standard:
        "IS 14286 (PART 1/SEC 1) : 2023/ IEC 61215-1-1: 2021 & IS/IEC 61730-1: 2023 & IS/IEC 61730-2: 2023",
      validityFrom: null,
      validityUpto: null,
      renewalStatus: "",
      alarmAlert: "To Start Certification",
      action:
        "Samples are already submitted.Waiting for factory license, Expected BIS start March,2026 and completion by may,2026",
    },
    {
      sno: 5,
      plant: "PEGEPL(P7)",
      address:
        "Plot no. UDL-5 . IP Seetharampur, Rangareddy  \nDt Shabad Rangareddy Seetharampur, \nTELANGANA-509217",
      rNo: "-",
      type: "IEC",
      status: "-",
      modelList: "Perc Dual Glass M10: PE-XXXHGB(where xxx- 560 to 525)",
      standard:
        "IEC 61215-1:2021 , IEC 61215-1-1:2021 ,IEC 61215-2:2021 ,IEC 61730-1:2023 ,IEC 61730-2:2023 ,EN IEC 61215-1:2021 \nEN IEC 61215-1-1:2021 ,EN IEC 61215-2:2021 \nEN IEC 61730-1:2018 ,EN IEC 61730-2:2018",
      validityFrom: null,
      validityUpto: null,
      renewalStatus: "",
      alarmAlert: "To Start Certification",
      action:
        "Samples are already submitted.Waiting for factory witness in feb/march,once P7 is ready,Expected  IEC in March/April,2026",
    },
    {
      sno: 5,
      plant: "PEGEPL(P7)",
      address:
        "Plot no. UDL-5 . IP Seetharampur, Rangareddy  \nDt Shabad Rangareddy Seetharampur, \nTELANGANA-509217",
      rNo: "-",
      type: "IEC",
      status: "-",
      modelList:
        "TopCON Dual Glass M10: PEI-144-xxxTHGB-M10 (where xxx- 590 to 560)",
      standard:
        "IEC 61215-1:2021 , IEC 61215-1-1:2021 ,IEC 61215-2:2021 ,IEC 61730-1:2023 ,IEC 61730-2:2023 ,EN IEC 61215-1:2021 \nEN IEC 61215-1-1:2021 ,EN IEC 61215-2:2021 \nEN IEC 61730-1:2018 ,EN IEC 61730-2:2018",
      validityFrom: null,
      validityUpto: null,
      renewalStatus: "",
      alarmAlert: "To Start Certification",
      action:
        "Samples are already submitted.Waiting for factory witness in feb/march,once P7 is ready,Expected  IEC in March/April,2026",
    },
    {
      sno: 5,
      plant: "PEGEPL(P7)",
      address:
        "Plot no. UDL-5 . IP Seetharampur, Rangareddy  \nDt Shabad Rangareddy Seetharampur, \nTELANGANA-509217",
      rNo: "-",
      type: "IEC",
      status: "-",
      modelList:
        "PERC Dual Glass G12: PEI-132-xxxHGB-G12(where xxx-670 to 645)",
      standard:
        "IEC 61215-1:2021 , IEC 61215-1-1:2021 ,IEC 61215-2:2021 ,IEC 61730-1:2023 ,IEC 61730-2:2023 ,EN IEC 61215-1:2021 \nEN IEC 61215-1-1:2021 ,EN IEC 61215-2:2021 \nEN IEC 61730-1:2018 ,EN IEC 61730-2:2018",
      validityFrom: null,
      validityUpto: null,
      renewalStatus: "",
      alarmAlert: "To Start Certification",
      action:
        "Samples are already submitted.Waiting for factory witness in feb/march,once P7 is ready,Expected  IEC in March/April,2026",
    },
    {
      sno: 5,
      plant: "PEGEPL(P7)",
      address:
        "Plot no. UDL-5 . IP Seetharampur, Rangareddy  \nDt Shabad Rangareddy Seetharampur, \nTELANGANA-509217",
      rNo: "-",
      type: "IEC",
      status: "-",
      modelList:
        "TopCON Dual Glass G12R: PE-132-xxxTHGB-G12R (where xxx-630 to 570)",
      standard:
        "IEC 61215-1:2021 , IEC 61215-1-1:2021 ,IEC 61215-2:2021 ,IEC 61730-1:2023 ,IEC 61730-2:2023 ,EN IEC 61215-1:2021 \nEN IEC 61215-1-1:2021 ,EN IEC 61215-2:2021 \nEN IEC 61730-1:2018 ,EN IEC 61730-2:2018",
      validityFrom: null,
      validityUpto: null,
      renewalStatus: "",
      alarmAlert: "To Start Certification",
      action:
        "Samples are already submitted.Waiting for factory witness in feb/march,once P7 is ready,Expected  IEC in March/April,2026",
    },
  ];

  for (const c of initialData) {
    const id = crypto.randomUUID();
    await execSql(
      `
INSERT INTO dbo.Certifications (
  id, sno, plant, address, type,

  rNo, status, modelList, standard, validityFrom, validityUpto, renewalStatus, alarmAlert, action,

  /* keep split columns empty for new row-wise structure */
  bisRNo, bisStatus, bisModelList, bisStandard, bisValidityFrom, bisValidityUpto, bisRenewalStatus, bisAlarmAlert, bisAction,
  iecRNo, iecStatus, iecModelList, iecStandard, iecValidityFrom, iecValidityUpto, iecRenewalStatus, iecAlarmAlert, iecAction,

  attachmentName, attachmentType, attachmentData,
  createdAt, updatedAt
) VALUES (
  @id, @sno, @plant, @address, @type,

  @rNo, @status, @modelList, @standard, @validityFrom, @validityUpto, @renewalStatus, @alarmAlert, @action,

  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,

  NULL, NULL, NULL,
  @createdAt, @updatedAt
);
      `,
      {
        id,
        sno: c.sno,
        plant: c.plant,
        address: c.address || null,
        type:
          normalizeCertType(c.type || "BIS") === "BIS & IEC"
            ? "BIS"
            : normalizeCertType(c.type || "BIS"),

        rNo: c.rNo ?? null,
        status: c.status ?? null,
        modelList: c.modelList ?? null,
        standard: c.standard ?? null,
        validityFrom: c.validityFrom ? parseDateOrNull(c.validityFrom) : null,
        validityUpto: c.validityUpto ? parseDateOrNull(c.validityUpto) : null,
        renewalStatus: c.renewalStatus ?? null,
        alarmAlert: c.alarmAlert ?? null,
        action: c.action ?? null,

        createdAt: now,
        updatedAt: now,
      }
    );
  }
}

/* ========================= API Mappers ========================= */

function mapCertificationRow(r) {
  return {
    id: String(r.id),
    sno: Number(r.sno),
    plant: r.plant || "",
    address: r.address || "",
    type: r.type || "BIS",

    // ✅ LEGACY (row-wise) fields (this is what your new sheet/frontend needs)
    rNo: r.rNo || "",
    status: r.status || "",
    modelList: r.modelList || "",
    standard: r.standard || "",
    validityFrom: r.validityFrom ? toYMD(r.validityFrom) : "",
    validityUpto: r.validityUpto ? toYMD(r.validityUpto) : "",
    renewalStatus: r.renewalStatus || "",
    alarmAlert: r.alarmAlert || "",
    action: r.action || "",

    // Keep split columns for backward compatibility (safe to keep)
    bisRNo: r.bisRNo || "",
    bisStatus: r.bisStatus || "",
    bisModelList: r.bisModelList || "",
    bisStandard: r.bisStandard || "",
    bisValidityFrom: r.bisValidityFrom ? toYMD(r.bisValidityFrom) : "",
    bisValidityUpto: r.bisValidityUpto ? toYMD(r.bisValidityUpto) : "",
    bisRenewalStatus: r.bisRenewalStatus || "",
    bisAlarmAlert: r.bisAlarmAlert || "",
    bisAction: r.bisAction || "",

    iecRNo: r.iecRNo || "",
    iecStatus: r.iecStatus || "",
    iecModelList: r.iecModelList || "",
    iecStandard: r.iecStandard || "",
    iecValidityFrom: r.iecValidityFrom ? toYMD(r.iecValidityFrom) : "",
    iecValidityUpto: r.iecValidityUpto ? toYMD(r.iecValidityUpto) : "",
    iecRenewalStatus: r.iecRenewalStatus || "",
    iecAlarmAlert: r.iecAlarmAlert || "",
    iecAction: r.iecAction || "",

    hasAttachment: Boolean(r.hasAttachment),
    attachmentName: r.attachmentName || "",
    attachmentType: r.attachmentType || "",
    createdAt: r.createdAt ? toISO(r.createdAt) : "",
    updatedAt: r.updatedAt ? toISO(r.updatedAt) : "",
  };
}

function mapRecipientRow(r) {
  return {
    id: String(r.id),
    name: r.name || "",
    email: r.email || "",
    role: r.role || "",
    isActive: Boolean(r.isActive),
    createdAt: r.createdAt ? toISO(r.createdAt) : "",
  };
}

function mapEmailLogRow(r) {
  return {
    id: String(r.id),
    certificationId: String(r.certificationId),
    recipientEmail: r.recipientEmail || "",
    emailType: r.emailType || "reminder",
    milestone: r.milestone || "",
    sentAt: r.sentAt ? toISO(r.sentAt) : "",
    status: r.status || "sent",
  };
}

/* ========================= API Routes ========================= */

app.get("/api/health", async (_req, res) => {
  try {
    await connectDb();
    res.json({
      ok: true,
      service: "wave-cert-tracker",
      time: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/**
 * 🚨 ADMIN: Reset DB from Excel (DESTRUCTIVE)
 * - Clears Certifications, EmailRecipients, EmailLogs
 * - Seeds DEFAULT_RECIPIENTS
 * - Imports certifications from Excel (first sheet)
 *
 * Security:
 * - Requires ADMIN_RESET_TOKEN env to be set
 * - Call with header: x-admin-token: <token>
 */
app.post("/api/admin/reset-from-excel", async (req, res) => {
  try {
    if (!ADMIN_RESET_TOKEN) {
      return res.status(500).json({
        error:
          "ADMIN_RESET_TOKEN is not set on server. Refusing to run destructive reset.",
      });
    }

    const token =
      String(req.headers["x-admin-token"] || "").trim() ||
      String(req.query.token || "").trim();

    if (token !== ADMIN_RESET_TOKEN) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await connectDb();
    await ensureSchema();

    const certRows = readCertificationsFromExcel(CERT_SEED_XLSX_PATH);

    const now = new Date();
    const tx = new sql.Transaction(await connectDb());
    await tx.begin();

    try {
      // Clear everything (order matters)
      await execSqlTx(tx, `DELETE FROM dbo.EmailLogs;`);
      await execSqlTx(tx, `DELETE FROM dbo.Certifications;`);
      await execSqlTx(tx, `DELETE FROM dbo.EmailRecipients;`);

      // Seed recipients
      for (const r of DEFAULT_RECIPIENTS) {
        const id = crypto.randomUUID();
        await execSqlTx(
          tx,
          `
INSERT INTO dbo.EmailRecipients (id, name, email, role, isActive, createdAt, updatedAt)
VALUES (@id, @name, @email, @role, @isActive, @createdAt, @updatedAt);
          `,
          {
            id,
            name: String(r.name || "").trim(),
            email: String(r.email || "").trim(),
            role: String(r.role || "").trim() || null,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          }
        );
      }

      // Insert certifications from Excel (ROW-WISE)
      for (const c of certRows) {
        const id = crypto.randomUUID();
        await execSqlTx(
          tx,
          `
      INSERT INTO dbo.Certifications (
        id, sno, plant, address, type,
        rNo, status, modelList, standard, validityFrom, validityUpto, renewalStatus, alarmAlert, action,
        attachmentName, attachmentType, attachmentData,
        createdAt, updatedAt
      ) VALUES (
        @id, @sno, @plant, @address, @type,
        @rNo, @status, @modelList, @standard, @validityFrom, @validityUpto, @renewalStatus, @alarmAlert, @action,
        NULL, NULL, NULL,
        @createdAt, @updatedAt
      );
                `,
          {
            id,
            sno: c.sno,
            plant: c.plant,
            address: c.address || null,
            type:
              normalizeCertType(c.type || "BIS") === "BIS & IEC"
                ? "BIS"
                : normalizeCertType(c.type || "BIS"),

            rNo: c.rNo || null,
            status: c.status || null,
            modelList: c.modelList || null,
            standard: c.standard || null,
            validityFrom: c.validityFrom
              ? parseDateOrNull(c.validityFrom)
              : null,
            validityUpto: c.validityUpto
              ? parseDateOrNull(c.validityUpto)
              : null,
            renewalStatus: c.renewalStatus || null,
            alarmAlert: c.alarmAlert || null,
            action: c.action || null,

            createdAt: now,
            updatedAt: now,
          }
        );
      }

      await tx.commit();

      res.json({
        ok: true,
        excelPath: CERT_SEED_XLSX_PATH,
        inserted: {
          recipients: DEFAULT_RECIPIENTS.length,
          certifications: certRows.length,
        },
        note: "All data cleared and re-seeded from Excel + default recipients successfully.",
      });
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  } catch (e) {
    console.error("[admin reset-from-excel] failed:", e);
    res.status(e?.status || 500).json({ error: String(e?.message || e) });
  }
});

/* ---- Certifications CRUD ---- */

app.get("/api/certifications", async (req, res) => {
  try {
    const q = String(req.query.q || "")
      .trim()
      .toLowerCase();
    const status = String(req.query.status || "").trim();

    let where = "1=1";
    const bind = {};

    if (status) {
      where +=
        " AND (bisStatus = @status OR iecStatus = @status OR status = @status)";
      bind.status = status;
    }

    if (q) {
      where += `
AND (
  LOWER(plant) LIKE @q
  OR LOWER(ISNULL(bisRNo,'')) LIKE @q
  OR LOWER(ISNULL(iecRNo,'')) LIKE @q
  OR LOWER(ISNULL(rNo,'')) LIKE @q
  OR LOWER(type) LIKE @q
  OR LOWER(ISNULL(bisStatus,'')) LIKE @q
  OR LOWER(ISNULL(iecStatus,'')) LIKE @q
  OR LOWER(ISNULL(status,'')) LIKE @q
    OR LOWER(ISNULL(modelList,'')) LIKE @q
  OR LOWER(ISNULL(standard,'')) LIKE @q
  OR LOWER(ISNULL(action,'')) LIKE @q

)`;
      bind.q = `%${q}%`;
    }

    const out = await execSql(
      `
    SELECT
      id, sno, plant, address, type,

      rNo, status, modelList, standard, validityFrom, validityUpto, renewalStatus, alarmAlert, action,

    
      bisRNo, bisStatus, bisModelList, bisStandard, bisValidityFrom, bisValidityUpto, bisRenewalStatus, bisAlarmAlert, bisAction,
      iecRNo, iecStatus, iecModelList, iecStandard, iecValidityFrom, iecValidityUpto, iecRenewalStatus, iecAlarmAlert, iecAction,
    
      attachmentName, attachmentType,
      CASE WHEN attachmentData IS NULL THEN 0 ELSE 1 END AS hasAttachment,
      createdAt, updatedAt
    FROM dbo.Certifications
    WHERE ${where}
    ORDER BY sno ASC, createdAt ASC;
    `,
      bind
    );

    res.json(out.recordset.map(mapCertificationRow));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load certifications" });
  }
});

app.get("/api/certifications/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();

    const out = await execSql(
      `
SELECT TOP 1
  id, sno, plant, address, type,

  bisRNo, bisStatus, bisModelList, bisStandard, bisValidityFrom, bisValidityUpto, bisRenewalStatus, bisAlarmAlert, bisAction,
  iecRNo, iecStatus, iecModelList, iecStandard, iecValidityFrom, iecValidityUpto, iecRenewalStatus, iecAlarmAlert, iecAction,

  attachmentName, attachmentType,
  CASE WHEN attachmentData IS NULL THEN 0 ELSE 1 END AS hasAttachment,
  createdAt, updatedAt
FROM dbo.Certifications
WHERE id = @id;
      `,
      { id }
    );

    const row = out.recordset?.[0];
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(mapCertificationRow(row));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load certification" });
  }
});

/**
 * Download attachment
 */
app.get("/api/certifications/:id/attachment", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const out = await execSql(
      `
SELECT TOP 1 attachmentName, attachmentType, attachmentData
FROM dbo.Certifications
WHERE id = @id;
`,
      { id }
    );
    const row = out.recordset?.[0];
    if (!row || !row.attachmentData) {
      return res.status(404).json({ error: "No attachment" });
    }

    const name = row.attachmentName || "attachment";
    const type = row.attachmentType || "application/octet-stream";
    const buf = row.attachmentData;

    res.setHeader("Content-Type", type);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${String(name).replaceAll('"', "")}"`
    );
    res.send(buf);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to download attachment" });
  }
});

/**
 * Remove attachment
 */
app.delete("/api/certifications/:id/attachment", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    await execSql(
      `
UPDATE dbo.Certifications
SET attachmentName = NULL, attachmentType = NULL, attachmentData = NULL, updatedAt = @updatedAt
WHERE id = @id;
`,
      { id, updatedAt: new Date() }
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to remove attachment" });
  }
});

function parseAttachmentFromBody(body) {
  const att = body?.attachment;
  const clear = Boolean(body?.attachmentClear);

  if (clear) {
    return { clear: true, name: null, type: null, data: null };
  }

  if (!att) return { clear: false, name: null, type: null, data: null };

  const name = String(att.name || "").trim();
  const type = String(att.type || "application/octet-stream").trim();
  const base64 = String(att.base64 || "").trim();

  if (!name || !base64) {
    return { clear: false, name: null, type: null, data: null };
  }

  let data = null;
  try {
    data = Buffer.from(base64, "base64");
  } catch {
    data = null;
  }

  if (!data || !data.length) {
    return { clear: false, name: null, type: null, data: null };
  }

  // Basic safety: cap ~10MB decoded (base64 JSON already capped by 15mb limit)
  if (data.length > 10 * 1024 * 1024) {
    const err = new Error("Attachment too large (max 10MB)");
    err.status = 413;
    throw err;
  }

  return { clear: false, name, type, data };
}

app.post("/api/certifications", async (req, res) => {
  try {
    const body = req.body || {};
    const now = new Date();
    const id = asGuid(body.id);

    const sno = Number(body.sno);
    const plant = String(body.plant || "").trim();
    const address = String(body.address || "").trim();
    const type = normalizeCertType(body.type || "BIS");
    const rowType = type === "BIS & IEC" ? "BIS" : type;

    if (!Number.isFinite(sno) || sno <= 0) {
      return res.status(400).json({ error: "sno must be a positive number" });
    }
    if (!plant) {
      return res.status(400).json({ error: "plant is required" });
    }

    const parsedAtt = parseAttachmentFromBody(body);

    await execSql(
      `
INSERT INTO dbo.Certifications (
  id, sno, plant, address, type,

  rNo, status, modelList, standard, validityFrom, validityUpto, renewalStatus, alarmAlert, action,

  attachmentName, attachmentType, attachmentData,
  createdAt, updatedAt
) VALUES (
  @id, @sno, @plant, @address, @type,

  @rNo, @status, @modelList, @standard, @validityFrom, @validityUpto, @renewalStatus, @alarmAlert, @action,

  @attachmentName, @attachmentType, @attachmentData,
  @createdAt, @updatedAt
);
      `,
      {
        id,
        sno,
        plant,
        address: address || null,
        type: rowType,

        rNo: body.rNo ?? null,
        status: body.status ?? null,
        modelList: body.modelList ?? null,
        standard: body.standard ?? null,
        validityFrom: body.validityFrom ? parseDateOrNull(body.validityFrom) : null,
        validityUpto: body.validityUpto ? parseDateOrNull(body.validityUpto) : null,
        renewalStatus: body.renewalStatus ?? null,
        alarmAlert: body.alarmAlert ?? null,
        action: body.action ?? null,

        attachmentName: parsedAtt.name || null,
        attachmentType: parsedAtt.type || null,
        attachmentData: parsedAtt.data || null,

        createdAt: now,
        updatedAt: now,
      }
    );

    const out = await execSql(
      `
SELECT TOP 1
  id, sno, plant, address, type,

  rNo, status, modelList, standard, validityFrom, validityUpto, renewalStatus, alarmAlert, action,

  bisRNo, bisStatus, bisModelList, bisStandard, bisValidityFrom, bisValidityUpto, bisRenewalStatus, bisAlarmAlert, bisAction,
  iecRNo, iecStatus, iecModelList, iecStandard, iecValidityFrom, iecValidityUpto, iecRenewalStatus, iecAlarmAlert, iecAction,

  attachmentName, attachmentType,
  CASE WHEN attachmentData IS NULL THEN 0 ELSE 1 END AS hasAttachment,
  createdAt, updatedAt
FROM dbo.Certifications
WHERE id = @id;
      `,
      { id }
    );

    res.status(201).json(mapCertificationRow(out.recordset[0]));
  } catch (e) {
    console.error(e);
    const status = e?.status || 500;
    const msg =
      status === 413 ? String(e?.message || e) : "Failed to create certification";
    res.status(status).json({ error: msg });
  }
});


app.put("/api/certifications/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const body = req.body || {};
    const now = new Date();

    const allowed = [
      "sno",
      "plant",
      "address",
      "type",

      // ✅ legacy row-wise fields
      "rNo",
      "status",
      "modelList",
      "standard",
      "validityFrom",
      "validityUpto",
      "renewalStatus",
      "alarmAlert",
      "action",

      // split fields kept for backward compatibility
      "bisRNo",
      "bisStatus",
      "bisModelList",
      "bisStandard",
      "bisValidityFrom",
      "bisValidityUpto",
      "bisRenewalStatus",
      "bisAlarmAlert",
      "bisAction",
      "iecRNo",
      "iecStatus",
      "iecModelList",
      "iecStandard",
      "iecValidityFrom",
      "iecValidityUpto",
      "iecRenewalStatus",
      "iecAlarmAlert",
      "iecAction",
    ];


    const sets = [];
    const bind = { id, updatedAt: now };

    for (const k of allowed) {
      if (!(k in body)) continue;

      if (isDateKey(k)) {
        sets.push(`${k} = @${k}`);
        bind[k] = parseDateOrNull(body[k]);
        continue;
      }

      if (k === "type") {
        sets.push(`${k} = @${k}`);
        bind[k] = normalizeCertType(body[k]);
        continue;
      }

      sets.push(`${k} = @${k}`);
      bind[k] = body[k];
    }

    // Attachment update/clear support
    if ("attachmentClear" in body || "attachment" in body) {
      const parsedAtt = parseAttachmentFromBody(body);
      if (parsedAtt.clear) {
        sets.push("attachmentName = @attachmentName");
        sets.push("attachmentType = @attachmentType");
        sets.push("attachmentData = @attachmentData");
        bind.attachmentName = null;
        bind.attachmentType = null;
        bind.attachmentData = null;
      } else if (parsedAtt.data) {
        sets.push("attachmentName = @attachmentName");
        sets.push("attachmentType = @attachmentType");
        sets.push("attachmentData = @attachmentData");
        bind.attachmentName = parsedAtt.name;
        bind.attachmentType = parsedAtt.type;
        bind.attachmentData = parsedAtt.data;
      }
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    sets.push("updatedAt = @updatedAt");

    await execSql(
      `
UPDATE dbo.Certifications
SET ${sets.join(", ")}
WHERE id = @id;
`,
      bind
    );

    const out = await execSql(
      `
SELECT TOP 1
  id, sno, plant, address, type,

  bisRNo, bisStatus, bisModelList, bisStandard, bisValidityFrom, bisValidityUpto, bisRenewalStatus, bisAlarmAlert, bisAction,
  iecRNo, iecStatus, iecModelList, iecStandard, iecValidityFrom, iecValidityUpto, iecRenewalStatus, iecAlarmAlert, iecAction,

  attachmentName, attachmentType,
  CASE WHEN attachmentData IS NULL THEN 0 ELSE 1 END AS hasAttachment,
  createdAt, updatedAt
FROM dbo.Certifications
WHERE id = @id;
      `,
      { id }
    );

    const row = out.recordset?.[0];
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(mapCertificationRow(row));
  } catch (e) {
    console.error(e);
    const status = e?.status || 500;
    const msg =
      status === 413
        ? String(e?.message || e)
        : "Failed to update certification";
    res.status(status).json({ error: msg });
  }
});

app.delete("/api/certifications/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    await execSql(`DELETE FROM dbo.Certifications WHERE id = @id;`, { id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete certification" });
  }
});

/* ---- Email Recipients CRUD ---- */

app.get("/api/recipients", async (_req, res) => {
  try {
    const out = await execSql(
      `
SELECT id, name, email, role, isActive, createdAt, updatedAt
FROM dbo.EmailRecipients
ORDER BY createdAt DESC;
`
    );
    res.json(out.recordset.map(mapRecipientRow));
  } catch (e) {
    res.status(500).json({ error: "Failed to load recipients" });
  }
});

app.post("/api/recipients", async (req, res) => {
  try {
    const body = req.body || {};
    const now = new Date();
    const id = asGuid(body.id);

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const role = String(body.role || "").trim();
    const isActive = typeof body.isActive === "boolean" ? body.isActive : true;

    if (!name || !email)
      return res.status(400).json({ error: "name and email are required" });

    await execSql(
      `
INSERT INTO dbo.EmailRecipients (id, name, email, role, isActive, createdAt, updatedAt)
VALUES (@id, @name, @email, @role, @isActive, @createdAt, @updatedAt);
`,
      {
        id,
        name,
        email,
        role: role || null,
        isActive,
        createdAt: now,
        updatedAt: now,
      }
    );

    const out = await execSql(
      `
SELECT TOP 1 id, name, email, role, isActive, createdAt, updatedAt
FROM dbo.EmailRecipients
WHERE id = @id;
`,
      { id }
    );

    res.status(201).json(mapRecipientRow(out.recordset[0]));
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.toLowerCase().includes("ux_emailrecipients_email")) {
      return res.status(409).json({ error: "Recipient email already exists" });
    }
    console.error(e);
    res.status(500).json({ error: "Failed to create recipient" });
  }
});

app.put("/api/recipients/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const body = req.body || {};
    const now = new Date();

    const allowed = ["name", "email", "role", "isActive"];
    const sets = [];
    const bind = { id, updatedAt: now };

    for (const k of allowed) {
      if (!(k in body)) continue;
      sets.push(`${k} = @${k}`);
      bind[k] = body[k];
    }
    if (sets.length === 0)
      return res.status(400).json({ error: "No valid fields to update" });
    sets.push("updatedAt = @updatedAt");

    await execSql(
      `UPDATE dbo.EmailRecipients SET ${sets.join(", ")} WHERE id = @id;`,
      bind
    );

    const out = await execSql(
      `
SELECT TOP 1 id, name, email, role, isActive, createdAt, updatedAt
FROM dbo.EmailRecipients
WHERE id = @id;
`,
      { id }
    );
    const row = out.recordset?.[0];
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(mapRecipientRow(row));
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.toLowerCase().includes("ux_emailrecipients_email")) {
      return res.status(409).json({ error: "Recipient email already exists" });
    }
    res.status(500).json({ error: "Failed to update recipient" });
  }
});

app.delete("/api/recipients/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    await execSql(`DELETE FROM dbo.EmailRecipients WHERE id = @id;`, { id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete recipient" });
  }
});

/* ---- Email Logs ---- */

app.get("/api/email-logs", async (req, res) => {
  try {
    const certificationId = String(req.query.certificationId || "").trim();
    const top = Math.min(
      Math.max(parseInt(String(req.query.top || "200"), 10) || 200, 1),
      2000
    );

    if (certificationId) {
      const out = await execSql(
        `
SELECT TOP (${top}) id, certificationId, recipientEmail, emailType, milestone, sentAt, status, error
FROM dbo.EmailLogs
WHERE certificationId = @certificationId
ORDER BY sentAt DESC;
`,
        { certificationId }
      );
      return res.json(out.recordset.map(mapEmailLogRow));
    }

    const out = await execSql(
      `
SELECT TOP (${top}) id, certificationId, recipientEmail, emailType, milestone, sentAt, status, error
FROM dbo.EmailLogs
ORDER BY sentAt DESC;
`
    );
    res.json(out.recordset.map(mapEmailLogRow));
  } catch (e) {
    res.status(500).json({ error: "Failed to load email logs" });
  }
});

/* ========================= Notification Engine (Milestones + Overdue Daily) ========================= */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function monthDiff(a, b) {
  // approximate "differenceInMonths" style (calendar months)
  const ay = a.getFullYear();
  const am = a.getMonth();
  const ad = a.getDate();
  const by = b.getFullYear();
  const bm = b.getMonth();
  const bd = b.getDate();
  let diff = (by - ay) * 12 + (bm - am);
  if (bd < ad) diff -= 1;
  return diff;
}
function daysDiff(a, b) {
  return Math.floor(
    (startOfDay(b).getTime() - startOfDay(a).getTime()) / MS_PER_DAY
  );
}
function getExpiryStatus(validityUptoYmd) {
  if (!validityUptoYmd) return "safe";
  const expiry = startOfDay(new Date(validityUptoYmd));
  const today = startOfDay(new Date());
  if (expiry.getTime() < today.getTime()) return "overdue";

  const daysUntil = daysDiff(today, expiry);
  if (daysUntil <= 1) return "day-before";
  if (daysUntil <= 7) return "week";
  if (daysUntil <= 14) return "2-weeks";

  const monthsUntil = monthDiff(today, expiry);
  if (monthsUntil <= 1) return "month";
  if (monthsUntil <= 3) return "3-months";
  if (monthsUntil <= 6) return "6-months";

  return "safe";
}
function milestoneLabel(status) {
  const map = {
    overdue: "Overdue",
    "day-before": "1 Day Before Expiry",
    week: "1 Week Before Expiry",
    "2-weeks": "2 Weeks Before Expiry",
    month: "1 Month Before Expiry",
    "3-months": "3 Months Before Expiry",
    "6-months": "6 Months Before Expiry",
    safe: "Valid",
  };
  return map[status] || status;
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateInEmail(ymd) {
  if (!ymd) return "-";
  const d = new Date(ymd);
  if (Number.isNaN(d.getTime())) return String(ymd);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * ✅ Updated: email includes ALL details and attachment info/link (if PUBLIC_BASE_URL set)
 */
function buildEmailHtml(cert, status) {
  const isOverdue = status === "overdue";
  const title = isOverdue ? "Overdue Alert" : "Expiry Reminder";
  const accent = isOverdue ? "#dc2626" : "#f59e0b";
  const label = milestoneLabel(status);

  const attachmentBlock = cert.hasAttachment
    ? (() => {
        const name = cert.attachmentName
          ? escapeHtml(cert.attachmentName)
          : "attachment";
        const link = PUBLIC_BASE_URL
          ? `${PUBLIC_BASE_URL.replace(
              /\/+$/,
              ""
            )}/api/certifications/${encodeURIComponent(cert.id)}/attachment`
          : "";
        if (link) {
          return `<div style="margin-top:14px;">
            <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:6px;">Attachment</div>
            <div style="background:#f3f4f6;border-radius:10px;padding:12px;font-size:13px;line-height:1.55;color:#111827;">
              <div><b>File:</b> ${name}</div>
              <div style="margin-top:6px;"><a href="${escapeHtml(
                link
              )}" style="color:#1d4ed8;text-decoration:none;font-weight:700;">Download attachment</a></div>
            </div>
          </div>`;
        }
        return `<div style="margin-top:14px;">
          <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:6px;">Attachment</div>
          <div style="background:#f3f4f6;border-radius:10px;padding:12px;font-size:13px;line-height:1.55;color:#111827;">
            <div><b>File:</b> ${name}</div>
            <div style="margin-top:6px;color:#6b7280;">(Set PUBLIC_BASE_URL on server to include a clickable download link)</div>
          </div>
        </div>`;
      })()
    : `<div style="margin-top:14px;">
        <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:6px;">Attachment</div>
        <div style="background:#f3f4f6;border-radius:10px;padding:12px;font-size:13px;line-height:1.55;color:#111827;">No attachment</div>
      </div>`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;background:#f6f7fb;font-family:Segoe UI,Arial,sans-serif;">
  <div style="max-width:720px;margin:32px auto;padding:0 16px;">
    <div style="background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.08);overflow:hidden;">
      <div style="padding:22px 24px;background:${accent};color:#fff;">
        <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.95;font-weight:700;">${escapeHtml(
          title
        )}</div>
        <div style="margin-top:8px;font-size:22px;font-weight:800;">${escapeHtml(
          cert.plant
        )} — ${escapeHtml(cert.type)}</div>
        <div style="margin-top:6px;font-size:14px;opacity:.95;">${escapeHtml(
          label
        )}</div>
      </div>

      <div style="padding:22px 24px;">
        <div style="padding:14px 14px;border-left:4px solid ${accent};background:${
    isOverdue ? "#fef2f2" : "#fffbeb"
  };border-radius:10px;">
          <div style="font-size:14px;line-height:1.55;color:${
            isOverdue ? "#7f1d1d" : "#7c2d12"
          };">
            ${
              isOverdue
                ? "<b>Immediate action required.</b> This certification is expired. Please renew immediately."
                : "<b>Action needed.</b> Please initiate renewal to avoid compliance issues."
            }
          </div>
        </div>

        <h3 style="margin:18px 0 10px 0;font-size:14px;letter-spacing:1px;text-transform:uppercase;color:#6b7280;">Certification Details</h3>

        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #eef0f5;color:#6b7280;">S.No</td>
            <td style="padding:10px 0;border-bottom:1px solid #eef0f5;font-weight:700;color:#111827;">${escapeHtml(
              String(cert.sno || "-")
            )}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #eef0f5;color:#6b7280;">Registration No.</td>
            <td style="padding:10px 0;border-bottom:1px solid #eef0f5;font-weight:700;color:#111827;">${escapeHtml(
              cert.rNo
            )}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #eef0f5;color:#6b7280;">Type</td>
            <td style="padding:10px 0;border-bottom:1px solid #eef0f5;color:#111827;">${escapeHtml(
              cert.type
            )}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #eef0f5;color:#6b7280;">Status</td>
            <td style="padding:10px 0;border-bottom:1px solid #eef0f5;font-weight:700;color:${
              isOverdue ? "#dc2626" : "#059669"
            };">
              ${escapeHtml(isOverdue ? "Expired" : cert.status)}
            </td>
          </tr>
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #eef0f5;color:#6b7280;">Validity</td>
            <td style="padding:10px 0;border-bottom:1px solid #eef0f5;color:#111827;">
              ${escapeHtml(
                formatDateInEmail(cert.validityFrom)
              )} — ${escapeHtml(formatDateInEmail(cert.validityUpto))}
            </td>
          </tr>
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #eef0f5;color:#6b7280;">Renewal Status</td>
            <td style="padding:10px 0;border-bottom:1px solid #eef0f5;color:#111827;">${escapeHtml(
              cert.renewalStatus || "-"
            )}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #eef0f5;color:#6b7280;">Alarm Alert</td>
            <td style="padding:10px 0;border-bottom:1px solid #eef0f5;color:#111827;">${escapeHtml(
              cert.alarmAlert || "-"
            )}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#6b7280;vertical-align:top;">Address</td>
            <td style="padding:10px 0;color:#111827;">${escapeHtml(
              cert.address || "-"
            )}</td>
          </tr>
        </table>

        ${
          cert.modelList
            ? `<div style="margin-top:14px;">
                 <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:6px;">Model List</div>
                 <div style="background:#f3f4f6;border-radius:10px;padding:12px;font-size:13px;line-height:1.55;color:#111827;white-space:pre-wrap;">${escapeHtml(
                   cert.modelList
                 )}</div>
               </div>`
            : ""
        }

        ${
          cert.standard
            ? `<div style="margin-top:14px;">
                 <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:6px;">Standard</div>
                 <div style="background:#f3f4f6;border-radius:10px;padding:12px;font-size:13px;line-height:1.55;color:#111827;white-space:pre-wrap;">${escapeHtml(
                   cert.standard
                 )}</div>
               </div>`
            : ""
        }

        ${
          cert.action
            ? `<div style="margin-top:14px;">
                 <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:6px;">Action / Notes</div>
                 <div style="background:#eef2ff;border-radius:10px;padding:12px;font-size:13px;line-height:1.55;color:#111827;white-space:pre-wrap;">${escapeHtml(
                   cert.action
                 )}</div>
               </div>`
            : ""
        }

        ${attachmentBlock}
      </div>

      <div style="padding:14px 24px;background:#fafafa;border-top:1px solid #eef0f5;color:#6b7280;font-size:12px;line-height:1.5;">
        Automated notification from Premier Energies Certification Tracker.
        ${
          isOverdue
            ? "Overdue alerts are sent daily until updated."
            : "You will receive next reminders as expiry approaches."
        }
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function fetchActiveRecipients() {
  const out = await execSql(
    `
SELECT id, name, email, role, isActive, createdAt, updatedAt
FROM dbo.EmailRecipients
WHERE isActive = 1;
`
  );
  return out.recordset.map(mapRecipientRow);
}

async function fetchCertificationsForNotifications() {
  const out = await execSql(
    `
SELECT
  id, sno, plant, address, rNo, type, status, modelList, standard,
  validityFrom, validityUpto, renewalStatus, alarmAlert, action,
  attachmentName, attachmentType,
  CASE WHEN attachmentData IS NULL THEN 0 ELSE 1 END AS hasAttachment,
  createdAt, updatedAt
FROM dbo.Certifications;
`
  );
  return out.recordset.map(mapCertificationRow);
}

function todayYmdIST() {
  // IST = UTC+5:30, used only for "already sent today" logic
  const now = new Date();
  const istMs = now.getTime() + 330 * 60 * 1000;
  const ist = new Date(istMs);
  const y = String(ist.getUTCFullYear()).padStart(4, "0");
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function hasSentMilestone(certId, recipientEmail, milestone) {
  const out = await execSql(
    `
SELECT TOP 1 id
FROM dbo.EmailLogs
WHERE certificationId = @certificationId
  AND recipientEmail = @recipientEmail
  AND emailType = 'reminder'
  AND milestone = @milestone
  AND status = 'sent'
ORDER BY sentAt DESC;
`,
    { certificationId: certId, recipientEmail, milestone }
  );
  return Boolean(out.recordset?.[0]?.id);
}

async function hasSentOverdueToday(certId, recipientEmail, overdueMilestone) {
  const out = await execSql(
    `
SELECT TOP 1 sentAt
FROM dbo.EmailLogs
WHERE certificationId = @certificationId
  AND recipientEmail = @recipientEmail
  AND emailType = 'overdue'
  AND milestone = @milestone
  AND status = 'sent'
ORDER BY sentAt DESC;
`,
    { certificationId: certId, recipientEmail, milestone: overdueMilestone }
  );

  const sentAt = out.recordset?.[0]?.sentAt;
  if (!sentAt) return false;

  // Compare by IST day (same logic you use elsewhere)
  const lastYmd = toYMD(new Date(sentAt.getTime() + 330 * 60 * 1000));
  const todayYmd = todayYmdIST();
  return lastYmd === todayYmd;
}

async function addEmailLogRow({
  certificationId,
  recipientEmail,
  emailType,
  milestone,
  status,
  error,
}) {
  const id = crypto.randomUUID();
  const sentAt = new Date();
  await execSql(
    `
INSERT INTO dbo.EmailLogs (id, certificationId, recipientEmail, emailType, milestone, sentAt, status, error)
VALUES (@id, @certificationId, @recipientEmail, @emailType, @milestone, @sentAt, @status, @error);
`,
    {
      id,
      certificationId,
      recipientEmail,
      emailType,
      milestone,
      sentAt,
      status,
      error: error ? String(error).slice(0, 4000) : null,
    }
  );
}

async function runNotificationJob() {
  const recipients = await fetchActiveRecipients();
  if (!recipients.length) {
    console.log("[notify] No active recipients; skipping.");
    return { ok: true, sent: 0, skipped: 0, reason: "no_recipients" };
  }

  const certs = await fetchCertificationsForNotifications();
  let sent = 0;
  let skipped = 0;

  // Expand a combined row into "virtual" BIS and/or IEC rows so all existing
  // email builder logic can keep using: rNo, status, validityFrom, validityUpto...
  function expandCert(row) {
    // ✅ If legacy row-wise fields exist, treat this as ONE notification unit
    const hasLegacy =
      Boolean(row.rNo) ||
      Boolean(row.validityUpto) ||
      Boolean(row.validityFrom) ||
      Boolean(row.status) ||
      Boolean(row.modelList) ||
      Boolean(row.standard) ||
      Boolean(row.action) ||
      Boolean(row.alarmAlert);

    if (hasLegacy) {
      const t = normalizeCertType(row.type || "BIS");
      const oneType = t === "BIS & IEC" ? "BIS" : t;
      return [{ ...row, type: oneType, _typeKey: oneType }];
    }

    // ✅ Fallback (older combined rows) — keep your existing logic
    const out = [];

    const hasBIS =
      Boolean(row.bisRNo) ||
      Boolean(row.bisValidityUpto) ||
      Boolean(row.bisValidityFrom) ||
      Boolean(row.bisStatus);

    const hasIEC =
      Boolean(row.iecRNo) ||
      Boolean(row.iecValidityUpto) ||
      Boolean(row.iecValidityFrom) ||
      Boolean(row.iecStatus);

    if (hasBIS) {
      out.push({
        ...row,
        type: "BIS",
        rNo: row.bisRNo || "",
        status: row.bisStatus || "",
        modelList: row.bisModelList || "",
        standard: row.bisStandard || "",
        validityFrom: row.bisValidityFrom || "",
        validityUpto: row.bisValidityUpto || "",
        renewalStatus: row.bisRenewalStatus || "",
        alarmAlert: row.bisAlarmAlert || "",
        action: row.bisAction || "",
        _typeKey: "BIS",
      });
    }

    if (hasIEC) {
      out.push({
        ...row,
        type: "IEC",
        rNo: row.iecRNo || "",
        status: row.iecStatus || "",
        modelList: row.iecModelList || "",
        standard: row.iecStandard || "",
        validityFrom: row.iecValidityFrom || "",
        validityUpto: row.iecValidityUpto || "",
        renewalStatus: row.iecRenewalStatus || "",
        alarmAlert: row.iecAlarmAlert || "",
        action: row.iecAction || "",
        _typeKey: "IEC",
      });
    }

    return out;
  }


  for (const parent of certs) {
    const virtuals = expandCert(parent);
    if (!virtuals.length) {
      skipped += 1;
      continue;
    }

    for (const cert of virtuals) {
      const status = getExpiryStatus(cert.validityUpto);
      if (status === "safe") {
        skipped += 1;
        continue;
      }

      const isOverdue = status === "overdue";
      const milestoneBase = isOverdue ? "overdue" : status;
      const milestone = `${cert._typeKey}:${milestoneBase}`;

      // Determine per-recipient needs
      const toSend = [];
      for (const r of recipients) {
        if (isOverdue) {
          // NOTE: update signature: hasSentOverdueToday(certId, email, milestone)
          const already = await hasSentOverdueToday(
            cert.id,
            r.email,
            milestone
          );
          if (!already) toSend.push(r);
        } else {
          const already = await hasSentMilestone(cert.id, r.email, milestone);
          if (!already) toSend.push(r);
        }
      }

      if (!toSend.length) {
        skipped += 1;
        continue;
      }

      const subject = isOverdue
        ? `🚨 OVERDUE: ${cert.plant} ${cert.type} Certification Has Expired`
        : `⚠️ REMINDER: ${cert.plant} ${
            cert.type
          } Certification - ${milestoneLabel(status)}`;

      const html = buildEmailHtml(cert, status);

      try {
        await sendEmail(
          toSend.map((x) => x.email),
          subject,
          html,
          []
        );

        for (const r of toSend) {
          await addEmailLogRow({
            certificationId: cert.id,
            recipientEmail: r.email,
            emailType: isOverdue ? "overdue" : "reminder",
            milestone,
            status: "sent",
            error: null,
          });
        }
        sent += 1;
      } catch (e) {
        for (const r of toSend) {
          await addEmailLogRow({
            certificationId: cert.id,
            recipientEmail: r.email,
            emailType: isOverdue ? "overdue" : "reminder",
            milestone,
            status: "failed",
            error: String(e?.message || e),
          });
        }
        console.error("[notify] send failed:", e);
      }
    }
  }

  return { ok: true, sent, skipped };
}

app.post("/api/notifications/run", async (_req, res) => {
  try {
    const result = await runNotificationJob();
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to run notifications" });
  }
});

/* ========================= Serve Frontend (dist) on same port ========================= */

const STATIC_DIR = path.resolve(__dirname, "../dist");
if (fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));

  app.get("/", (req, res) => {
    res.sendFile(path.join(STATIC_DIR, "index.html"));
  });

  // SPA fallback (supports /settings, etc.)
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(STATIC_DIR, "index.html"));
  });
}

/* ========================= Startup ========================= */

async function bootstrap() {
  await connectDb();
  await ensureSchema();
  await seedIfEmpty();

  // Lightweight daily scheduler (runs after 09:00 IST once per day)
  let lastRunYmd = null;

  setInterval(async () => {
    try {
      const now = new Date();
      const ist = new Date(now.getTime() + 330 * 60 * 1000);
      const hh = ist.getUTCHours();
      const mm = ist.getUTCMinutes();

      const ymd = todayYmdIST();
      const afterNine = hh > 9 || (hh === 9 && mm >= 0);

      if (afterNine && lastRunYmd !== ymd) {
        console.log("[notify] Daily run starting (IST):", ymd);
        await runNotificationJob();
        lastRunYmd = ymd;
        console.log("[notify] Daily run completed (IST):", ymd);
      }
    } catch (e) {
      console.error("[notify] scheduler error:", e);
    }
  }, 15 * 60 * 1000); // every 15 minutes
}

bootstrap()
  .then(() => {
    const server = https.createServer(httpsOptions, app);
    server.listen(PORT, HOST, () => {
      console.log(`✅ WAVE server running: https://${HOST}:${PORT}`);
      console.log(
        `✅ Static dir: ${
          fs.existsSync(STATIC_DIR) ? STATIC_DIR : "(missing)"
        } `
      );
      console.log(`✅ API base: https://${HOST}:${PORT}/api`);
      console.log(
        `✅ Email link base: ${
          PUBLIC_BASE_URL ? PUBLIC_BASE_URL : "(PUBLIC_BASE_URL not set)"
        }`
      );
    });

    const shutdown = async (sig) => {
      try {
        console.log(`\n🛑 Received ${sig}, shutting down...`);
        server.close(() => console.log("HTTP server closed"));
        if (pool) await pool.close();
        process.exit(0);
      } catch (e) {
        console.error("Shutdown error:", e);
        process.exit(1);
      }
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  })
  .catch((e) => {
    console.error("❌ Bootstrap failed:", e);
    process.exit(1);
  });
