import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

function enableCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS,GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

function ensureVapid() {
  const subject = process.env.VAPID_SUBJECT;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !pub || !priv) throw new Error("Missing VAPID env vars");
  webpush.setVapidDetails(subject, pub, priv);
}

export default async function handler(req, res) {
  enableCors(req, res);

  // Preflight
  if (req.method === "OPTIONS") return res.status(200).end();

  // Ping útil para probar en navegador sin 500
  if (req.method === "GET") return res.status(200).json({ ok: true, msg: "notify endpoint up" });

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    ensureVapid();
    const supabase = getSupabase();

    const { fam, type, title, body, url, deviceId } = req.body || {};
    if (!fam || !type || !title || !body || !url || !deviceId) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("device_id, subscription")
      .eq("fam", fam);

    if (error) throw error;

    const targets = (subs || []).filter(s => s.device_id !== deviceId);

    const payload = JSON.stringify({ title, body, url, type });

    const results = await Promise.allSettled(
      targets.map(t => webpush.sendNotification(t.subscription, payload))
    );

    // Borra suscripciones muertas
    const toDelete = [];
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        const st = r.reason?.statusCode;
        if (st === 404 || st === 410) toDelete.push(targets[i].device_id);
      }
    });

    if (toDelete.length) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("fam", fam)
        .in("device_id", toDelete);
    }

    return res.json({ ok: true, sent: targets.length });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}

export const config = { runtime: "nodejs" };
