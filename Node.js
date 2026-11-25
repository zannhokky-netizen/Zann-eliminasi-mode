
import express from "express";
import cors from "cors";
import crypto from "crypto";

const app = express();
app.use(express.json({ limit: "32kb" }));

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map(x => x.trim())
  .filter(Boolean);

if (!ADMIN_PASSWORD || !JWT_SECRET) {
  console.error("Set ADMIN_PASSWORD and JWT_SECRET in your environment variables.");
  process.exit(1);
}

app.use(cors({
  origin(origin, cb) {
    if (!origin || CORS_ORIGINS.length === 0 || CORS_ORIGINS.includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error("Origin not allowed"));
  }
}));

// Membuat token login Admin
function makeToken() {
  const payload = Buffer.from(
    JSON.stringify({
      admin: true,
      exp: Date.now() + 60 * 60 * 1000
    })
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

// Memeriksa akses khusus Admin
function adminOnly(req, res, next) {
  const token = (req.headers.authorization || "")
    .replace(/^Bearer\s+/i, "");

  const parts = token.split(".");

  if (parts.length !== 2) {
    return res.status(401).json({
      error: "Admin login required"
    });
  }

  const [payload, signature] = parts;

  const expected = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(payload)
    .digest("base64url");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  if (
    a.length !== b.length ||
    !crypto.timingSafeEqual(a, b)
  ) {
    return res.status(401).json({
      error: "Invalid token"
    });
  }

  let data;

  try {
    data = JSON.parse(
      Buffer.from(payload, "base64url").toString()
    );
  } catch {
    return res.status(401).json({
      error: "Invalid token"
    });
  }

  if (
    data.admin !== true ||
    !data.exp ||
    data.exp < Date.now()
  ) {
    return res.status(401).json({
      error: "Token expired or invalid"
    });
  }

  req.admin = true;
  next();
}

// Penyimpanan demo KEY sementara
const keys = new Map();

// Halaman status server
app.get("/", (_req, res) => {
  res.send("ZANN ELIMINASI VIP Node.js server is running.");
});

app.get("/api/status", (_req, res) => {
  res.json({
    ok: true,
    service: "ZANN ELIMINASI VIP"
  });
});

// LOGIN ADMIN
app.post("/api/admin/login", (req, res) => {
  const password = req.body?.password;

  if (
    typeof password !== "string" ||
    password !== ADMIN_PASSWORD
  ) {
    return res.status(401).json({
      error: "Password admin salah"
    });
  }

  res.json({
    ok: true,
    token: makeToken(),
    expiresIn: 3600
  });
});

// Pemeriksaan login Admin
app.get("/api/admin/check", adminOnly, (_req, res) => {
  res.json({
    ok: true,
    admin: true
  });
});

// GENERATE KEY — KHUSUS ADMIN
app.post("/api/admin/keys", adminOnly, (req, res) => {
  const duration = req.body?.duration;

  if (![3, 7, 30, "permanent"].includes(duration)) {
    return res.status(400).json({
      error: "Durasi harus 3, 7, 30, atau permanent"
    });
  }

  const key =
    "ZANN-" +
    crypto.randomBytes(12).toString("hex").toUpperCase();

  keys.set(key, {
    duration,
    createdAt: new Date().toISOString(),
    used: false
  });

  res.json({
    ok: true,
    key,
    duration
  });
});

// DAFTAR KEY — KHUSUS ADMIN
app.get("/api/admin/keys", adminOnly, (_req, res) => {
  res.json({
    keys: [...keys.entries()].map(([key, info]) => ({
      key,
      ...info
    }))
  });
});

// REDEEM KEY
app.post("/api/keys/redeem", (req, res) => {
  const key = req.body?.key;
  const record = keys.get(key);

  if (!record) {
    return res.status(404).json({
      error: "KEY tidak ditemukan"
    });
  }

  if (record.used) {
    return res.status(409).json({
      error: "KEY sudah digunakan"
    });
  }

  record.used = true;
  record.usedAt = new Date().toISOString();

  res.json({
    ok: true,
    duration: record.duration
  });
});

// Penanganan error
app.use((err, _req, res, _next) => {
  console.error(err?.message || err);

  res.status(500).json({
    error: "Server error"
  });
});

// Jalankan server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
