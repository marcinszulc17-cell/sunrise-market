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
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??Deno.env.get("SUPABASE_SERVICE_KEY");
const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
async function trigger(id:string){const r=await fetch(`${SUPABASE_URL}/functions/v1/verify-run`,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${SERVICE_KEY}`},body:JSON.stringify({request_id:id})});return {status:r.status,body:await r.text()};}
Deno.serve(async(req)=>{
 if(req.method!=="POST") return json({error:"method_not_allowed"},405);
 if(!SERVICE_KEY) return json({error:"service_key_missing"},500);
 try{
  const sb=createClient(SUPABASE_URL,SERVICE_KEY,{db:{schema:"market"}});
  const stripe=new Stripe(await resolveStripeKey(),{apiVersion:"2024-06-20",httpClient:Stripe.createFetchHttpClient()});
  const {data:rows,error}=await sb.from("verification_requests").select("id,status,stripe_session_id").in("status",["payment_pending","paid","processing"]).order("created_at",{ascending:true}).limit(25);
  if(error) throw error;
  const out:any[]=[];
  for(const row of rows??[]){
   try{
    let status=row.status;
    if(status==="payment_pending"&&row.stripe_session_id){
      const s=await stripe.checkout.sessions.retrieve(String(row.stripe_session_id));
      if(s.payment_status==="paid"){
        await sb.from("verification_requests").update({status:"paid",paid_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",row.id);
        status="paid";
      }
    }
    if(status==="paid"||status==="processing") out.push({id:row.id,trigger:await trigger(row.id)});
   }catch(e){out.push({id:row.id,error:String((e as Error).message||e)});}
  }
  return json({ok:true,checked:rows?.length??0,results:out});
 }catch(e){return json({error:String((e as Error).message||e)},500);}
});
