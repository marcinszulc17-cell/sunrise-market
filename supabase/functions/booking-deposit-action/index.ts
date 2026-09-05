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
const PAY_BASE=(Deno.env.get("MYSUNRISE_PAY_BASE_URL")??"https://lvmrhgpxhqvfuoftblky.supabase.co/functions/v1").replace(/\/$/,"");
// Token serwisowy Sunrise Pay: najpierw sekret środowiskowy, potem market.internal_secrets.
// Fallback dodany 2026-09-05 — sekret SUNRISE_MARKET_SERVICE_TOKEN nie był ustawiony w projekcie,
// przez co portfel, checkout portfelem i wypłaty sprzedawców zwracały "Brak konfiguracji Sunrise Pay".
async function resolveSunrisePayToken(): Promise<string> {
  const fromEnv = Deno.env.get("SUNRISE_MARKET_SERVICE_TOKEN");
  if (fromEnv) return fromEnv;
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY") ?? "";
    const r = await fetch(`${url}/rest/v1/internal_secrets?select=value&key=eq.sunrise_pay_service_token`, { headers: { apikey: key, Authorization: `Bearer ${key}`, "Accept-Profile": "market" } });
    const rows = await r.json().catch(() => []);
    return String(rows?.[0]?.value ?? "");
  } catch { return ""; }
}
const PAY_TOKEN = await resolveSunrisePayToken();
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??Deno.env.get("SUPABASE_SERVICE_KEY");
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}})}
async function uuidv5(name:string):Promise<string>{const ns="6ba7b810-9dad-11d1-80b4-00c04fd430c8";const nsBytes=(ns.replace(/-/g,"").match(/.{2}/g) as string[]).map(h=>parseInt(h,16));const data=new Uint8Array([...nsBytes,...new TextEncoder().encode(name)]);const hash=new Uint8Array(await crypto.subtle.digest("SHA-1",data));hash[6]=(hash[6]&15)|80;hash[8]=(hash[8]&63)|128;const hex=Array.from(hash.slice(0,16)).map(b=>b.toString(16).padStart(2,"0")).join("");return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`}
async function payCredit(userRef:string,amountGrosz:number,reason:string,orderRef:string,idemName:string){if(amountGrosz<=0)return; if(!PAY_TOKEN)throw new Error("Brak konfiguracji Sunrise Pay");const idem=await uuidv5(idemName);const response=await fetch(`${PAY_BASE}/pay-credit`,{method:"POST",headers:{"Content-Type":"application/json","X-Sunrise-Service-Token":PAY_TOKEN},body:JSON.stringify({user_ref:userRef,amount_grosz:amountGrosz,reason,order_ref:orderRef,idempotency_key:idem})});const data=await response.json().catch(()=>({}));if(response.status!==200||data?.ok!==true)throw new Error(String(data?.message??data?.error??`Sunrise Pay ${response.status}`))}

Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
 const auth=req.headers.get("Authorization")??"";const anon=Deno.env.get("SUPABASE_ANON_KEY")!;const url=Deno.env.get("SUPABASE_URL")!;
 const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}},db:{schema:"market"}});
 const{data:{user},error:userError}=await userClient.auth.getUser();if(userError||!user)return json({ok:false,error:"unauthorized"},401);
 const body=await req.json().catch(()=>({}));const bookingId=String(body.booking_id??"").trim();
 const action=body.action==="retain"?"retain":body.action==="partial"?"partial":body.action==="refund"?"refund":"";
 const retainGross=body.retain_gross===null||body.retain_gross===undefined||body.retain_gross===""?null:Number(body.retain_gross);
 const note=String(body.note??"").trim().slice(0,1000)||null;
 if(!bookingId||!action)return json({ok:false,error:"invalid_request"},400);
 if(action==="partial"&&(!Number.isFinite(retainGross)||Number(retainGross)<=0))return json({ok:false,error:"invalid_retain_amount"},400);
 const service=createClient(url,SERVICE_KEY!,{db:{schema:"market"}});
 try{
  const{data,error}=await userClient.rpc("seller_booking_deposit_prepare_v2",{p_booking:bookingId,p_action:action,p_retain_gross:retainGross});if(error)throw error;
  const row=Array.isArray(data)?data[0]:data;if(!row)throw new Error("Nie udało się przygotować rozliczenia kaucji");
  const deposit=Number(row.deposit_gross??0);const refund=Number(row.refund_gross??0);const retain=Number(row.retain_gross??0);
  const refundGrosz=Math.round(refund*100);const retainGrosz=Math.round(retain*100);
  if(deposit<=0)throw new Error("Kaucja ma nieprawidłową kwotę");

  if(refundGrosz>0){
   if(row.payment_provider==="sunrise_pay"){
    await payCredit(String(row.buyer_email),refundGrosz,action==="partial"?"Częściowy zwrot kaucji Sunrise Market":"Zwrot kaucji Sunrise Market",String(row.order_id),`booking-deposit-refund:${bookingId}:${refundGrosz}`);
   }else if(row.payment_provider==="stripe"){
    if(!row.stripe_session_id)throw new Error("Brak sesji Stripe dla tej rezerwacji");
    const stripe=new Stripe(await resolveStripeKey(),{apiVersion:"2024-06-20",httpClient:Stripe.createFetchHttpClient()});
    const session=await stripe.checkout.sessions.retrieve(String(row.stripe_session_id));const paymentIntent=typeof session.payment_intent==="string"?session.payment_intent:session.payment_intent?.id;if(!paymentIntent)throw new Error("Brak płatności Stripe do zwrotu kaucji");
    await stripe.refunds.create({payment_intent:paymentIntent,amount:refundGrosz,metadata:{booking_id:bookingId,kind:action==="partial"?"deposit_partial_refund":"deposit_refund"}},{idempotencyKey:`booking-deposit-refund:${bookingId}:${refundGrosz}`});
   }else throw new Error("Nieobsługiwana metoda płatności kaucji");
  }

  if(retainGrosz>0){
   await payCredit(String(row.seller_email),retainGrosz,action==="partial"?"Potrącenie z kaucji Sunrise Market":"Zatrzymana kaucja Sunrise Market",String(row.order_id),`booking-deposit-retain:${bookingId}:${retainGrosz}`);
  }

  const finalStatus=retainGrosz>0?"retained":"refunded";
  const{error:finishError}=await service.from("bookings").update({deposit_status:finalStatus,deposit_resolved_at:new Date().toISOString(),deposit_retained_gross:retain,deposit_resolution_note:note,updated_at:new Date().toISOString()}).eq("id",bookingId).in("deposit_status",["refunding","retaining"]);if(finishError)throw finishError;
  await service.from("booking_handover_protocols").update({status:"closed",deposit_decision:action==="partial"?"partial":action,deposit_retained_requested_gross:retain,deposit_decision_note:note,updated_by:user.id,updated_at:new Date().toISOString()}).eq("booking_id",bookingId);
  return json({ok:true,action,deposit_status:finalStatus,deposit_gross:deposit,refunded_gross:refund,retained_gross:retain});
 }catch(error){
  await service.from("bookings").update({deposit_status:"failed",deposit_resolution_note:String((error as Error).message??error).slice(0,1000),updated_at:new Date().toISOString()}).eq("id",bookingId).in("deposit_status",["refunding","retaining"]);
  return json({ok:false,error:String((error as Error).message??error)},400)
 }
});
