import { createClient } from "@supabase/supabase-js";

function enableCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  enableCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { fam, subscription, deviceId } = req.body || {};
    if (!fam || !subscription || !deviceId) {
      return res.status(400).json({ error: "Missing fam/subscription/deviceId" });
    }

    // Asegura familia
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
    return res.status(500).json({ error: "Server error" });
  }
}
