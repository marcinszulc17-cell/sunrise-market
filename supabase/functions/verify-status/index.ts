import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??Deno.env.get("SUPABASE_SERVICE_KEY");
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}})}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 try{
  const auth=req.headers.get("Authorization")??"";
  const userClient=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:auth}}});
  const {data:{user},error:uErr}=await userClient.auth.getUser();
  if(uErr||!user) return json({error:"Brak autoryzacji"},401);
  const {request_id,session_id}=await req.json();
  const sb=createClient(Deno.env.get("SUPABASE_URL")!,SERVICE_KEY!,{db:{schema:"market"}});
  const {data:r,error:rErr}=await sb.from("verification_requests").select("id,offer_id,user_id,kind,status,price_gross,stripe_session_id,result,error_message,created_at,updated_at").eq("id",request_id).eq("user_id",user.id).maybeSingle();
  if(rErr||!r) return json({error:"Nie znaleziono zlecenia"},404);
  if(session_id&&r.stripe_session_id&&session_id===r.stripe_session_id&&["payment_pending","draft"].includes(r.status)){
   const stripe=new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!,{apiVersion:"2024-06-20",httpClient:Stripe.createFetchHttpClient()});
   const s=await stripe.checkout.sessions.retrieve(session_id);
   if(s.payment_status==="paid"){
    await sb.from("verification_requests").update({status:"processing",paid_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",r.id).eq("user_id",user.id);
    r.status="processing";
   }
  }
  return json({request:r});
 }catch(e){return json({error:String((e as Error).message??e)},400)}
});