import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";

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
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}})}
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  try{
    const auth=req.headers.get("Authorization")||"";
    const userClient=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:auth}}});
    const {data:{user},error:uErr}=await userClient.auth.getUser();
    if(uErr||!user) return json({error:"Brak autoryzacji"},401);
    const {order_id}=await req.json();
    if(!order_id) return json({error:"Brak order_id"},400);
    const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{db:{schema:"market"}});
    const {data:ord,error:oErr}=await sb.from("orders").select("id,buyer_id,status,stripe_session_id").eq("id",order_id).maybeSingle();
    if(oErr) throw oErr;
    if(!ord||String(ord.buyer_id)!==user.id) return json({error:"Nie znaleziono zamówienia"},404);
    if(ord.status!=="created") return json({ok:true,released:false,status:ord.status});
    if(ord.stripe_session_id){
      const stripe=new Stripe(await resolveStripeKey(),{apiVersion:"2024-06-20",httpClient:Stripe.createFetchHttpClient()});
      const session=await stripe.checkout.sessions.retrieve(String(ord.stripe_session_id));
      if(session.payment_status==="paid") return json({ok:true,released:false,status:"paid"});
    }
    const {data:released,error:rErr}=await sb.rpc("release_unpaid_order",{p_order_id:order_id});
    if(rErr) throw rErr;
    return json({ok:true,released:released===true});
  }catch(e){return json({error:String((e as Error).message||e)},400)}
});
