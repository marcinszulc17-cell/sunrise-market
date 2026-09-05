import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Stripe przez npm: build esm.sh ciągnął polyfill std@0.177.1/node, który na obecnym runtime Supabase logował "Deno.core.runMicrotasks() is not supported".
import Stripe from "npm:stripe@16.12.0";

// Klucz Stripe: najpierw sekret środowiskowy, potem market.internal_secrets.
async function readInternalSecret(key: string): Promise<string> {
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? ""; const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const r = await fetch(`${url}/rest/v1/internal_secrets?select=value&key=eq.${key}`, { headers: { apikey: k, Authorization: `Bearer ${k}`, "Accept-Profile": "market" } });
    const rows = await r.json().catch(() => []); return String(rows?.[0]?.value ?? "");
  } catch { return ""; }
}
// STRIPE_SECRET_KEY w env bywa błędny (2026-09-05: zawierał URL) — właściwy klucz jest w market.internal_secrets.
async function resolveStripeKey(): Promise<string> {
  const env = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (/^(sk|rk)_/.test(env)) return env;
  return await readInternalSecret("stripe_secret_key");
}
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??Deno.env.get("SUPABASE_SERVICE_KEY");
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}})}
async function triggerRun(requestId:string){
  try{
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/verify-run`,{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":`Bearer ${SERVICE_KEY}`},
      body:JSON.stringify({request_id:requestId})
    });
  }catch(e){console.error("verify-run trigger",e);}
}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 try{
  const auth=req.headers.get("Authorization")??"";
  const userClient=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:auth}}});
  const {data:{user},error:uErr}=await userClient.auth.getUser();
  if(uErr||!user) return json({error:"Brak autoryzacji"},401);
  const {request_id,session_id}=await req.json();
  const sb=createClient(Deno.env.get("SUPABASE_URL")!,SERVICE_KEY!,{db:{schema:"market"}});
  const {data:r,error:rErr}=await sb.from("verification_requests").select("id,offer_id,user_id,kind,status,price_gross,stripe_session_id,result,error_message,created_at,updated_at,provider_status,automation_version").eq("id",request_id).eq("user_id",user.id).maybeSingle();
  if(rErr||!r) return json({error:"Nie znaleziono zlecenia"},404);
  let shouldRun=false;
  if(session_id&&r.stripe_session_id&&session_id===r.stripe_session_id&&["payment_pending","draft"].includes(r.status)){
   const stripe=new Stripe(await resolveStripeKey(),{apiVersion:"2024-06-20",httpClient:Stripe.createFetchHttpClient()});
   const s=await stripe.checkout.sessions.retrieve(session_id);
   if(s.payment_status==="paid"){
    await sb.from("verification_requests").update({status:"paid",paid_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",r.id).eq("user_id",user.id);
    r.status="paid"; shouldRun=true;
   }
  }
  if(["paid","processing"].includes(r.status)&&r.status!=="ready") shouldRun=true;
  if(shouldRun) triggerRun(r.id);
  return json({request:r,automation_triggered:shouldRun});
 }catch(e){return json({error:String((e as Error).message??e)},400)}
});
