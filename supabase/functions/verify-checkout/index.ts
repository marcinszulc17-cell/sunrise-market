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
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??Deno.env.get("SUPABASE_SERVICE_KEY");
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}})}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 try{
  const auth=req.headers.get("Authorization")??"";
  const userClient=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:auth}}});
  const {data:{user},error:uErr}=await userClient.auth.getUser();
  if(uErr||!user) return json({error:"Zaloguj się, aby zamówić Sunrise Verify."},401);
  const {offer_id,kind}=await req.json();
  if(!offer_id||!["vehicle","property"].includes(kind)) return json({error:"Nieprawidłowe dane zlecenia."},400);
  const sb=createClient(Deno.env.get("SUPABASE_URL")!,SERVICE_KEY!,{db:{schema:"market"}});
  const {data:o,error:oErr}=await sb.from("offers").select("id,title,status,category_id,categories!inner(slug)").eq("id",offer_id).eq("status","active").maybeSingle();
  if(oErr||!o) return json({error:"Oferta nie istnieje lub jest nieaktywna."},404);
  const slug=String((o as any).categories?.slug??"");
  if(kind==="vehicle"&&!slug.includes("motoryzacja-samochody-osobowe")) return json({error:"Ta oferta nie obsługuje raportu pojazdu."},400);
  if(kind==="property"&&!slug.startsWith("nieruchomosci-")) return json({error:"Ta oferta nie obsługuje raportu nieruchomości."},400);
  const price=kind==="vehicle"?79.90:49.90;
  const {data:r,error:rErr}=await sb.from("verification_requests").insert({offer_id,user_id:user.id,kind,status:"payment_pending",price_gross:price,input:{source:"listing"}}).select("id").single();
  if(rErr) throw rErr;
  const stripe=new Stripe(await resolveStripeKey(),{apiVersion:"2024-06-20",httpClient:Stripe.createFetchHttpClient()});
  const origin=Deno.env.get("PUBLIC_WEB_URL")??req.headers.get("origin")??"https://sunrisemarket.pl";
  const session=await stripe.checkout.sessions.create({mode:"payment",payment_method_types:["card","p24","blik"],currency:"pln",line_items:[{price_data:{currency:"pln",product_data:{name:kind==="vehicle"?"Sunrise Verify — raport pojazdu":"Sunrise Verify — analiza nieruchomości"},unit_amount:Math.round(price*100)},quantity:1}],metadata:{verification_request_id:r.id,user_id:user.id,kind,offer_id},success_url:`${origin}/verify/${r.id}?session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${origin}/produkt/${offer_id}?verify=cancel`});
  await sb.from("verification_requests").update({stripe_session_id:session.id}).eq("id",r.id);
  return json({url:session.url,request_id:r.id});
 }catch(e){return json({error:String((e as Error).message??e)},400)}
});