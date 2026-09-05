import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??Deno.env.get("SUPABASE_SERVICE_KEY");
const MY_BASE=(Deno.env.get("MYSUNRISE_PAY_BASE_URL")??"https://lvmrhgpxhqvfuoftblky.supabase.co/functions/v1").replace(/\/$/,"");
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
const TOKEN = await resolveSunrisePayToken();
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}})}
function today(){return new Date().toISOString().slice(0,10)}
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  try{
    const auth=req.headers.get("Authorization")??"";
    const userClient=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:auth}}});
    const {data:{user},error:uErr}=await userClient.auth.getUser();
    if(uErr||!user||!user.email) return json({error:"Brak autoryzacji"},401);
    const sb=createClient(Deno.env.get("SUPABASE_URL")!,SERVICE_KEY!,{db:{schema:"market"}});
    const {data:seller,error:sErr}=await sb.from("sellers").select("id,seller_type,status,partner_since,subscription_free_until,subscription_billing_starts").eq("auth_user_id",user.id).maybeSingle();
    if(sErr) throw sErr;
    if(!seller) return json({seller:null});
    const sellerId=seller.id;
    const [{data:offers},{data:settlements},{data:items},{data:cfg},{data:renewals}]=await Promise.all([
      sb.from("offers").select("id,status").eq("seller_id",sellerId),
      sb.from("seller_settlements").select("amount,status,created_at").eq("seller_id",sellerId),
      sb.from("order_items").select("order_id,seller_payout,orders!inner(status,created_at)").eq("seller_id",sellerId),
      sb.from("partner_program_config").select("annual_fee_gross,free_months,active").eq("id",1).maybeSingle(),
      sb.from("partner_membership_renewals").select("period_start,period_end,status,amount_gross,paid_at").eq("seller_id",sellerId).eq("status","paid").order("period_end",{ascending:false})
    ]);
    const validSettlement=(x:any)=>["settled","pending","scheduled"].includes(String(x.status));
    const ownAll=(settlements??[]).filter(validSettlement).reduce((s:number,x:any)=>s+Number(x.amount||0),0);
    const now=new Date();
    const ownMonth=(settlements??[]).filter((x:any)=>{const d=new Date(x.created_at);return validSettlement(x)&&d.getUTCFullYear()===now.getUTCFullYear()&&d.getUTCMonth()===now.getUTCMonth();}).reduce((s:number,x:any)=>s+Number(x.amount||0),0);
    const paidOrderIds=new Set((items??[]).filter((x:any)=>["paid","completed"].includes(String(x.orders?.status))).map((x:any)=>String(x.order_id)));
    const renewal=(renewals??[])[0]??null;
    const t=today();
    const privatePartner=seller.seller_type==="private_partner";
    const inFree=privatePartner&&!!seller.subscription_billing_starts&&t<String(seller.subscription_billing_starts);
    const paidNow=!!renewal&&t>=String(renewal.period_start)&&t<=String(renewal.period_end);
    const canSell=seller.status==="active"&&(!privatePartner||inFree||paidNow);
    const renewalDue=privatePartner&&seller.status==="active"&&!inFree&&!paidNow;
    let ambassador=null;
    if(TOKEN){
      try{
        const r=await fetch(`${MY_BASE}/market-partner-summary`,{method:"POST",headers:{"Content-Type":"application/json","X-Sunrise-Service-Token":TOKEN},body:JSON.stringify({email:user.email})});
        if(r.ok) ambassador=await r.json();
      }catch{}
    }
    return json({
      seller:{id:sellerId,type:seller.seller_type,status:seller.status},
      membership:{partner_since:seller.partner_since,free_until:seller.subscription_free_until,billing_starts:seller.subscription_billing_starts,annual_fee_gross:Number(cfg?.annual_fee_gross??299),renewal_due:renewalDue,can_sell:canSell,paid_until:renewal?.period_end??null},
      offers:{active:(offers??[]).filter((x:any)=>x.status==="active").length,total:(offers??[]).length},
      sales:{count:paidOrderIds.size,earned_all:Math.round(ownAll*100)/100,earned_month:Math.round(ownMonth*100)/100},
      ambassador
    });
  }catch(e){return json({error:String((e as Error).message??e)},400)}
});