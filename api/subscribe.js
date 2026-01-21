import { createClient } from "@supabase/supabase-js";

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

export default async function handler(req, res) {
  enableCors(req, res);

  // Preflight
  if (req.method === "OPTIONS") return res.status(200).end();

  // Ping útil para probar en navegador
  if (req.method === "GET") return res.status(200).json({ ok: true, msg: "subscribe endpoint up" });

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const supabase = getSupabase();

    const { fam, subscription, deviceId } = req.body || {};
    if (!fam || !subscription || !deviceId) {
      return res.status(400).json({ error: "Missing fam/subscription/deviceId" });
    }

    await supabase.from("families").upsert([{ fam }], { onConflict: "fam" });

    const { error } = await supabase
      .from("push_subscriptions")
      .upsert([{
        fam,
        device_id: deviceId,
        subscription,
        updated_at: new Date().toISOString()
      }], { onConflict: "fam,device_id" });

    if (error) throw error;

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}

export const config = { runtime: "nodejs" };

