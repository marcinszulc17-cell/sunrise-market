const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  return new Response(JSON.stringify({ ok:false, error:"deprecated_endpoint", message:"Użyj aktualnej ścieżki anulowania i zwrotu rezerwacji." }), { status:410, headers:{...cors,"Content-Type":"application/json"} });
});
