//Este archivo maneja las peticiones al backend para obtener la planificación
import { createClient } from "@supabase/supabase-js";//Importa la librería de Supabase para interactuar con la base de datos

// Habilita CORS para permitir peticiones desde el frontend
function enableCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://nicocormar13.github.io");//Permite peticiones desde este origen específico
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");//Permite estos métodos HTTP
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");//Permite este encabezado específico, necesario para peticiones con cuerpo JSON
}

// Manejador de la API, exportador del handler por defecto(endpoint)
export default async function handler(req, res) {
    enableCors(req, res);//Habilita CORS para la respuesta en cada peticion

  // Maneja peticiones OPTIONS para CORS preflight, evitamos errores con esto
    if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Solo permite método GET para este endpoint
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  //Todo el acceso a la base de datos va dentro de este try/catch para manejar errores
  try {
    const fam = req.query.fam;//Obtiene el código de familia desde los parámetros de la consulta
    if (!fam) return res.status(400).json({ error: "Missing fam" });//Si no hay código de familia, responde con error 400

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);//Crea el cliente de Supabase usando las variables de entorno

    // Consulta la tabla "planning" para obtener los datos asociados al código de familia
    const { data, error } = await supabase
      .from("planning")
      .select("data, updated_at")
      .eq("fam", fam)
      .maybeSingle();

    if (error) throw error;//Si hay error en la consulta, lo lanza para ser capturado por el catch

    // Si no hay datos para esa familia, crea una entrada vacía y responde con datos vacíos
    if (!data) {
      const { error: insErr } = await supabase.from("planning").insert({ fam, data: {} });//Inserta una fila vacía para esa familia
      if (insErr) throw insErr;//Si hay error al insertar, lo lanza
      return res.status(200).json({ data: {}, updatedAt: null });//Responde con datos vacíos
    }

    return res.status(200).json({ data: data.data || {}, updatedAt: data.updated_at });//Si el planning ya existe, responde con los datos obtenidos y la fecha de actualización
  } catch (e) {//Manejo de errores generales
    return res.status(500).json({ error: String(e?.message || e) });//Responde con error 500 y el mensaje de error
  }
}
