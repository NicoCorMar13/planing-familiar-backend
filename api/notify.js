import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

function enableCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  enableCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
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

    const payload = JSON.stringify({
      title,
      body,
      url,     // lo usará el SW al hacer click
      type
    });

    const results = await Promise.allSettled(
      targets.map(t =>
        webpush.sendNotification(t.subscription, payload)
      )
    );

    // Limpieza de subs inválidas (410/404)
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
    return res.status(500).json({ error: "Server error" });
  }
}
