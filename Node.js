
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const crypto = require("crypto");

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));

const origins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({ origin: origins.length ? origins : true }));

app.get("/", (_req, res) => {
  res.json({
    name: "ZANN ELIMINASI VIP API",
    status: "online"
  });
});

app.get("/api/status", (_req, res) => {
  res.json({ status: "online", firebase: "initialized" });
});

async function user(req, res, next) {
  try {
    const h = req.get("authorization") || "";
    if (!h.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing token" });
    }

    req.auth = await admin.auth().verifyIdToken(h.slice(7));
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function adminOnly(req, res, next) {
  if (req.auth?.admin === true) return next();
  return res.status(403).json({ error: "Admin required" });
}

// GAME DATA
app.get("/api/hosts/:hostId/game", user, async (req, res) => {
  try {
    const id = String(req.params.hostId).slice(0, 100);
    const ref = db.collection("users")
      .doc(req.auth.uid)
      .collection("hosts")
      .doc(id);

    const s = await ref.get();

    res.json({
      hostId: id,
      data: s.exists ? s.data() : {}
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Read failed" });
  }
});

app.put("/api/hosts/:hostId/game", user, async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object" ||
        Array.isArray(req.body)) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const id = String(req.params.hostId).slice(0, 100);

    await db.collection("users")
      .doc(req.auth.uid)
      .collection("hosts")
      .doc(id)
      .set({
        ...req.body,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

    res.json({ ok: true, hostId: id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Save failed" });
  }
});

// CREATE KEY (ADMIN)
app.post("/api/admin/keys", user, adminOnly, async (req, res) => {
  try {
    const { duration } = req.body || {};

    if (![3, 7, 30, "permanent"].includes(duration)) {
      return res.status(400).json({
        error: "duration must be 3, 7, 30, or permanent"
      });
    }

    const key = crypto.randomBytes(18).toString("hex").toUpperCase();

    const expiresAt = duration === "permanent"
      ? null
      : Date.now() + duration * 86400000;

    await db.collection("keys").doc(key).set({
      duration,
      expiresAt,
      active: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      issuedBy: req.auth.uid,
      redeemedBy: null
    });

    res.json({
      key,
      duration,
      expiresAt,
      permanent: duration === "permanent"
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Create failed" });
  }
});

// REDEEM KEY
app.post("/api/keys/redeem", user, async (req, res) => {
  const key = String(req.body?.key || "").trim().toUpperCase();

  if (!key) {
    return res.status(400).json({ error: "Key required" });
  }

  try {
    const ref = db.collection("keys").doc(key);

    const result = await db.runTransaction(async tx => {
      const s = await tx.get(ref);

      if (!s.exists) return { error: "Invalid key" };

      const d = s.data();

      if (!d.active) return { error: "Key disabled" };

      if (d.expiresAt !== null && d.expiresAt <= Date.now()) {
        return { error: "Key expired" };
      }

      if (d.redeemedBy && d.redeemedBy !== req.auth.uid) {
        return { error: "Key already used" };
      }

      tx.update(ref, { redeemedBy: req.auth.uid });

      tx.set(
        db.collection("users").doc(req.auth.uid),
        {
          entitlement: {
            duration: d.duration,
            expiresAt: d.expiresAt,
            keyId: key
          }
        },
        { merge: true }
      );

      return {
        ok: true,
        duration: d.duration,
        expiresAt: d.expiresAt
      };
    });

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Redeem failed" });
  }
});

// RELAY EVENT
app.post("/api/relay/events", async (req, res) => {
  if (!process.env.RELAY_SECRET ||
      req.get("x-relay-secret") !== process.env.RELAY_SECRET) {
    return res.status(401).json({ error: "Unauthorized relay" });
  }

  const { hostUid, hostId, eventId, event } = req.body || {};

  if (![hostUid, hostId, eventId].every(
    v => typeof v === "string" && v
  ) || !event || typeof event !== "object") {
    return res.status(400).json({ error: "Required fields missing" });
  }

  try {
    const dedupe = db.collection("relayEvents").doc(eventId);
    const host = db.collection("users")
      .doc(hostUid)
      .collection("hosts")
      .doc(hostId);

    const accepted = await db.runTransaction(async tx => {
      if ((await tx.get(dedupe)).exists) return false;

      tx.create(dedupe, {
        hostUid,
        hostId,
        receivedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      tx.set(host, {
        latestRelayEvent: event,
        relayUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      return true;
    });

    res.json({
      accepted,
      duplicate: !accepted
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Relay event failed" });
  }
});

app.use((e, _q, r, _n) => {
  console.error(e);
  r.status(500).json({ error: "Server error" });
});

app.listen(PORT, () => {
  console.log("API listening on " + PORT);
});
