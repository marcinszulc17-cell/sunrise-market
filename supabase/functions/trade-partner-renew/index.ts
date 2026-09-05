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

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY");
const PAY_BASE = (Deno.env.get("MYSUNRISE_PAY_BASE_URL") ?? "https://lvmrhgpxhqvfuoftblky.supabase.co/functions/v1").replace(/\/$/, "");
// Token serwisowy Sunrise Pay: z env, a gdy brak — z market.internal_secrets (klucz sunrise_pay_service_token).
// Bez literału w kodzie (repo jest publiczne) — 2026-09-05.
async function resolveSunrisePayToken(): Promise<string> {
  const fromEnv = Deno.env.get("SUNRISE_MARKET_SERVICE_TOKEN");
  if (fromEnv) return fromEnv;
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const r = await fetch(`${url}/rest/v1/internal_secrets?select=value&key=eq.sunrise_pay_service_token`, { headers: { apikey: key, Authorization: `Bearer ${key}`, "Accept-Profile": "market" } });
    const rows = await r.json().catch(() => []);
    return String(rows?.[0]?.value ?? "");
  } catch { return ""; }
}
const PAY_TOKEN = await resolveSunrisePayToken();
function json(body: unknown, status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}})}
async function pay(path:string, body:unknown){
  if(!PAY_TOKEN) throw new Error("Brak konfiguracji Sunrise Pay");
  const r=await fetch(`${PAY_BASE}/${path}`,{method:"POST",headers:{"Content-Type":"application/json","X-Sunrise-Service-Token":PAY_TOKEN},body:JSON.stringify(body)});
  const data=await r.json().catch(()=>({})); return {status:r.status,data};
}
function isoDate(d:Date){return d.toISOString().slice(0,10)}
function addYearsMinusDay(start:string){const d=new Date(start+"T00:00:00Z"); d.setUTCFullYear(d.getUTCFullYear()+1); d.setUTCDate(d.getUTCDate()-1); return isoDate(d)}
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  try{
    const auth=req.headers.get("Authorization")??"";
    const userClient=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:auth}}});
    const {data:{user},error:uErr}=await userClient.auth.getUser();
    if(uErr||!user||!user.email) return json({error:"Brak autoryzacji"},401);
    const sb=createClient(Deno.env.get("SUPABASE_URL")!,SERVICE_KEY!,{db:{schema:"market"}});
    const body=await req.json().catch(()=>({}));
    const stripe=new Stripe(await resolveStripeKey(),{apiVersion:"2024-06-20",httpClient:Stripe.createFetchHttpClient()});

    if(body.action==="verify"){
      const sessionId=String(body.session_id??""); if(!sessionId) return json({error:"Brak sesji płatności"},400);
      const s=await stripe.checkout.sessions.retrieve(sessionId);
      const renewalId=String(s.metadata?.trade_partner_renewal_id??"");
      if(!renewalId||s.metadata?.user_id!==user.id||s.payment_status!=="paid") return json({error:"Płatność nie jest potwierdzona"},400);
      const {data:r,error:rErr}=await sb.from("partner_membership_renewals").select("id,seller_id,amount_gross,status").eq("id",renewalId).single();
      if(rErr) throw rErr;
      if(Math.round(Number(r.amount_gross)*100)!==Number(s.amount_total)||String(s.currency??"").toLowerCase()!=="pln") throw new Error("Kwota płatności nie zgadza się z odnowieniem");
      const {data:seller}=await sb.from("sellers").select("auth_user_id").eq("id",r.seller_id).single();
      if(String(seller?.auth_user_id)!==user.id) return json({error:"Brak dostępu"},403);
      if(r.status!=="paid") await sb.from("partner_membership_renewals").update({status:"paid",paid_at:new Date().toISOString(),payment_reference:sessionId}).eq("id",renewalId);
      return json({ok:true,renewal_id:renewalId});
    }

    const {data:seller,error:sErr}=await sb.from("sellers").select("id,seller_type,subscription_billing_starts,status").eq("auth_user_id",user.id).maybeSingle();
    if(sErr) throw sErr;
    if(!seller||seller.seller_type!=="private_partner") return json({error:"Brak prywatnego Partnera Handlowego"},400);
    if(seller.status!=="active") return json({error:"Konto sprzedawcy jest nieaktywne"},400);
    const {data:cfg,error:cErr}=await sb.from("partner_program_config").select("annual_fee_gross,active").eq("id",1).single();
    if(cErr) throw cErr; if(!cfg.active) return json({error:"Program Partner Handlowy jest chwilowo niedostępny"},400);
    const amount=Number(cfg.annual_fee_gross); if(!(amount>0)) throw new Error("Brak ceny odnowienia");
    const today=isoDate(new Date());
    const {data:last}=await sb.from("partner_membership_renewals").select("period_end").eq("seller_id",seller.id).eq("status","paid").order("period_end",{ascending:false}).limit(1).maybeSingle();
    let periodStart=String(seller.subscription_billing_starts||today);
    if(periodStart<today) periodStart=today;
    if(last?.period_end){const d=new Date(String(last.period_end)+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+1);const next=isoDate(d);if(next>periodStart) periodStart=next;}
    const periodEnd=addYearsMinusDay(periodStart);
    const {data:renewal,error:renErr}=await sb.from("partner_membership_renewals").upsert({seller_id:seller.id,period_start:periodStart,period_end:periodEnd,amount_gross:amount,status:"pending"},{onConflict:"seller_id,period_start"}).select("id,status,amount_gross,period_start,period_end").single();
    if(renErr) throw renErr;
    if(renewal.status==="paid") return json({ok:true,already_paid:true,renewal});

    const method=body.payment_method==="wallet"?"wallet":"card";
    if(method==="wallet"){
      const charge=await pay("pay-charge",{user_ref:user.email,amount_grosz:Math.round(amount*100),order_ref:`trade-partner:${renewal.id}`,idempotency_key:renewal.id});
      if(charge.status===402||(charge.data?.ok===false&&charge.data?.error==="insufficient_funds")) return json({error:"Za mało środków w Sunrise Wallet",need_topup:true,balance:Number(charge.data?.balance_grosz??0)/100,shortfall:Number(charge.data?.shortfall_grosz??0)/100},402);
      if(charge.status!==200||charge.data?.ok!==true) return json({error:String(charge.data?.message??charge.data?.error??"Płatność nieudana")},402);
      await sb.from("partner_membership_renewals").update({status:"paid",paid_at:new Date().toISOString(),payment_reference:String(charge.data?.tx_id??`wallet:${renewal.id}`)}).eq("id",renewal.id);
      return json({ok:true,payment:"wallet",renewal_id:renewal.id,period_start:periodStart,period_end:periodEnd});
    }

    const origin=Deno.env.get("PUBLIC_WEB_URL")??req.headers.get("origin")??"https://sunrisemarket.pl";
    const session=await stripe.checkout.sessions.create({mode:"payment",payment_method_types:["card","p24","blik"],currency:"pln",line_items:[{price_data:{currency:"pln",product_data:{name:"Partner Handlowy MySunrise — odnowienie na 12 miesięcy"},unit_amount:Math.round(amount*100)},quantity:1}],metadata:{trade_partner_renewal_id:String(renewal.id),seller_id:String(seller.id),user_id:user.id,user_email:user.email},customer_email:user.email,success_url:`${origin}/sprzedawca/partner?renewal=success&session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${origin}/sprzedawca/partner?renewal=cancel`},{idempotencyKey:`trade-partner-renewal:${renewal.id}`});
    await sb.from("partner_membership_renewals").update({payment_reference:session.id}).eq("id",renewal.id);
    return json({ok:true,payment:"card",url:session.url,renewal_id:renewal.id,amount,period_start:periodStart,period_end:periodEnd});
  }catch(e){return json({error:String((e as Error).message??e)},400)}
});
