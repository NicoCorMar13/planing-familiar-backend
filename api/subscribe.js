//Este archivo maneja las suscripciones push enviadas desde el frontend, sin este archivo el navegador se suscribe pero el servidor no sabria a quien enviar las notificaciones

import { createClient } from "@supabase/supabase-js";//Importa la librería de Supabase para interactuar con la base de datos, permitiendo ller y escribir datos desde la base de datos

// Funcion auxiliar para habilitar CORS y permitir peticiones desde el frontend
function enableCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://nicocormar13.github.io");//Permite peticiones desde este origen específico
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");//Permite estos métodos HTTP
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");//Permite este encabezado específico, necesario para peticiones con cuerpo JSON
}

//Manejador de la API, exportador del handler por defecto(endpoint)
export default async function handler(req, res) {
    enableCors(req, res);//Aplica CORS a la respuesta en cada petición

  // Maneja peticiones OPTIONS para CORS preflight, evitamos errores con esto, porque sin esto el navegador bloquearia el POST
    if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });//Solo permite método POST para este endpoint

  //Todo el acceso a la base de datos va dentro de este try/catch para manejar errores
  try {
    const { fam, subscription, deviceId } = req.body || {};//Obtiene los datos enviados en el cuerpo de la petición: fam(código de familia), subscription(datos de la suscripción push), deviceId(identificador del dispositivo para evitar auto-notificaciones)
    //Si falta alguno de los datos necesarios, responde con error 400
    if (!fam || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: "Missing fam/subscription" });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);//Crea el cliente de Supabase usando las variables de entorno para interactuar con la base de datos

    // Prepara los datos a insertar o actualizar en la tabla "subscriptions"
    const payload = {
      fam,//Código de familia para agrupar suscripciones
      endpoint: subscription.endpoint,//URL del endpoint de la suscripción push
      p256dh: subscription.keys.p256dh,// Clave pública para cifrado
      auth: subscription.keys.auth,// Clave de autenticación
      device_id: deviceId || null //Identificador del dispositivo, si se proporciona, para no notificar al mismo dispositivo
    };

    // Inserta o actualiza la suscripción en la tabla "subscriptions", usando upsert para evitar duplicados basados en el endpoint
    const { error } = await supabase
      .from("subscriptions")
      .upsert(payload, { onConflict: "endpoint" });//"upsert" inserta una nueva fila o actualiza la existente si ya hay una con el mismo endpoint. "onConflict" especifica la columna que se usa para detectar duplicados. "endpoint" es único para cada suscripción push, evita duplicados.

    if (error) throw error;//Si hay error en la operación, lo lanza para ser capturado por el catch

    return res.status(200).json({ ok: true });//Responde con éxito si todo va bien
  } catch (e) {//Manejo de errores generales
    return res.status(500).json({ error: String(e?.message || e) });//Responde con error 500 y el mensaje de error
  }
}
