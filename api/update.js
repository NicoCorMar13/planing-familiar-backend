//Este archivo maneja las actualizaciones del planning y envía notificaciones push a los dispositivos suscritos cuando hay cambios

import { createClient } from "@supabase/supabase-js";//Importa la librería de Supabase para interactuar con la base de datos
import webpush from "web-push";//Importa la librería web-push para enviar notificaciones push a los navegadores

// Habilita CORS para permitir peticiones desde el frontend
function enableCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://nicocormar13.github.io");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// Días válidos para el planning
const DIAS = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];

// Configura las claves VAPID para web-push desde las variables de entorno
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Manejador de la API, exportador del handler por defecto(endpoint)
export default async function handler(req, res) {
  enableCors(req, res);//Habilita CORS para la respuesta en cada peticion

  // Maneja peticiones OPTIONS para CORS preflight, evitamos errores con esto
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Solo permite método POST para este endpoint
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  //Todo el acceso a la base de datos va dentro de este try/catch para manejar errores
  try {
    const { fam, dia, value, url, deviceId } = req.body || {};//Obtiene los datos enviados en el cuerpo de la petición: fam(código de familia), dia(día a actualizar), value(nuevo valor), url(url para la notificación), deviceId(identificador del dispositivo para evitar auto-notificaciones)
    if (!fam || !DIAS.includes(dia)) return res.status(400).json({ error: "Missing fam or invalid dia" });//Si falta el código de familia o el día es inválido, responde con error 400

    // Crea el cliente de Supabase usando las variables de entorno
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Leemos el planning actual
    const { data: row, error: selErr } = await supabase
      .from("planning")
      .select("data")
      .eq("fam", fam)
      .maybeSingle();
    if (selErr) throw selErr;//Si hay error en la consulta, lo lanza para ser capturado por el catch

    const current = row?.data || {};//ºObtiene los datos actuales del planning o un objeto vacío si no existen
    const next = { ...current, [dia]: String(value ?? "") };//Crea el nuevo objeto de planning con el día actualizado

    // Guardamos el planning
    if (!row) {//Si no existe el planning para esa familia, lo insertamos
      const { error: insErr } = await supabase.from("planning").insert({ fam, data: next });
      if (insErr) throw insErr;//Si hay error al insertar, lo lanza
    } else {//Si ya existe, lo actualizamos
      const { error: updErr } = await supabase.from("planning").update({ data: next }).eq("fam", fam);//Actualiza la fila correspondiente al código de familia
      if (updErr) throw updErr;// Si hay error al actualizar, lo lanza
    }

    // Enviamos la notificación push a la familia (menos este dispositivo si deviceId está presente)
    const { data: subs, error: subErr } = await supabase
      .from("subscriptions")//
      .select("endpoint,p256dh,auth,device_id")//
      .eq("fam", fam);//Obtiene todas las suscripciones asociadas a la familia
    if (subErr) throw subErr;//Si hay error al obtener las suscripciones, lo lanza

    // Prepara el payload de la notificación
    const payload = JSON.stringify({
      title: "Planning actualizado",//Título de la notificación
      body: `Se actualizó ${dia}`,//Cuerpo de la notificación
      url: url || `./?dia=${encodeURIComponent(dia)}`//URL a abrir al hacer clic en la notificación
    });

    const toDelete = [];//Array para almacenar endpoints inválidos y eliminarlos después
    // Envía la notificación a cada suscriptor, excepto al que hizo el cambio (si deviceId está presente)
    const tasks = (subs || [])
      .filter(s => !deviceId || s.device_id !== deviceId)
      //Para cada subscriptor, intenta enviar la notificación
      .map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload
          );
        } catch (err) {//Si hay error al enviar la notificación
          const code = err?.statusCode;//Obtiene el código de estado del error
          // Si el error indica que la suscripción ya no es válida, la marca para eliminarla
          if (code === 410 || code === 404) toDelete.push(s.endpoint);
        }
      });

    await Promise.all(tasks);//Espera a que todas las notificaciones se envíen

    // Elimina las suscripciones inválidas
    if (toDelete.length) {
      await supabase.from("subscriptions").delete().in("endpoint", toDelete);
    }

    return res.status(200).json({ ok: true });//Responde con éxito si todo va bien
  } catch (e) {//Manejo de errores generales
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
