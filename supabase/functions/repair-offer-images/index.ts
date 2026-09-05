import { createClient } from "@supabase/supabase-js";
import decode from "heic-decode";
import jpeg from "jpeg-js";
import { Buffer } from "node:buffer";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const isHeic=(u:string|null|undefined)=>!!u&&/\.(heic|heif)(?:\?|$)/i.test(u);
function pathFromUrl(url:string){const m="/storage/v1/object/public/product-images/";const i=url.indexOf(m);if(i<0)throw new Error("Nieznany adres zdjęcia");return decodeURIComponent(url.slice(i+m.length).split("?")[0]);}

Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 let stage="start";
 try{
  const url=Deno.env.get("SUPABASE_URL")!; const anon=Deno.env.get("SUPABASE_ANON_KEY")!; const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth=req.headers.get("Authorization")??"";
  stage="auth";
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:u,error:ue}=await userClient.auth.getUser();
  if(ue||!u.user)return json({error:"unauthorized",stage,message:ue?.message??"Brak użytkownika"},401);
  const body=await req.json(); let offerId=body.offer_id as string|undefined;
  const supplied=Array.isArray(body.image_urls)?body.image_urls.filter((x:unknown)=>typeof x==="string") as string[]:[];
  const requestedUrl=typeof body.image_url==="string"?body.image_url:undefined;

  if(!requestedUrl && supplied.length>1){
    stage="batch";
    const targets=supplied.filter(isHeic);
    let total=0; let latest:string[]=[];
    for(let i=0;i<targets.length;i++){
      stage=`batch_${i+1}`;
      const r=await fetch(`${url}/functions/v1/repair-offer-images`,{
        method:"POST",
        headers:{"Authorization":auth,"apikey":anon,"Content-Type":"application/json"},
        body:JSON.stringify({offer_id:offerId,image_url:targets[i]})
      });
      const text=await r.text();
      let p:any={}; try{p=text?JSON.parse(text):{};}catch{}
      if(!r.ok||!p.ok)return json({error:"batch_item_failed",stage:`batch_${i+1}`,message:p.message||p.error||text||`HTTP ${r.status}`,child_stage:p.stage,http_status:r.status,repaired_count:total},r.status>=400?r.status:500);
      total+=Number(p.repaired_count||0);
      if(Array.isArray(p.image_urls)) latest=p.image_urls.filter((x:unknown)=>typeof x==="string");
    }
    return json({ok:true,repaired_count:total,image_urls:latest});
  }

  const admin=createClient(url,service);
  stage="resolve_offer";
  const resolveUrls=requestedUrl?[requestedUrl]:supplied;
  if(!offerId&&resolveUrls.length){
   const {data:d,error:e}=await admin.schema("market").from("offers").select("id").in("image_url",resolveUrls).limit(1); if(e)throw e; offerId=d?.[0]?.id;
   if(!offerId){const {data:x,error:xe}=await admin.schema("market").from("offer_images").select("offer_id").in("url",resolveUrls).limit(1);if(xe)throw xe;offerId=x?.[0]?.offer_id;}
  }
  if(!offerId)return json({error:"offer_not_resolved",stage,message:"Nie udało się rozpoznać oferty."},400);
  stage="load_offer";
  const {data:offer,error:oe}=await admin.schema("market").from("offers").select("id,seller_id,image_url").eq("id",offerId).single(); if(oe||!offer)throw new Error(oe?.message??"Oferta nie istnieje");
  stage="authorize";
  const {data:seller,error:se}=await admin.schema("market").from("sellers").select("auth_user_id,email").eq("id",offer.seller_id).single();if(se)throw se;
  const owner=seller?.auth_user_id===u.user.id||((seller?.email??"").toLowerCase()===(u.user.email??"").toLowerCase());
  const {data:operator,error:opErr}=await userClient.schema("market").rpc("ami_operator");if(opErr)throw new Error(`Sprawdzenie operatora: ${opErr.message}`);
  if(!owner&&operator!==true)return json({error:"forbidden",stage,message:"Brak uprawnień do oferty"},403);
  stage="gallery";
  const {data:extra,error:ee}=await admin.schema("market").from("offer_images").select("id,url,sort").eq("offer_id",offerId).order("sort",{ascending:true});if(ee)throw ee;
  const items:any[]=[];if(offer.image_url)items.push({kind:"main",url:offer.image_url});for(const r of extra??[])if(r.url)items.push({kind:"extra",id:r.id,url:r.url});
  let targets=items.filter(x=>isHeic(x.url));
  if(requestedUrl) targets=targets.filter(x=>x.url===requestedUrl);
  else if(supplied.length) targets=targets.filter(x=>supplied.includes(x.url));
  targets=targets.slice(0,1);
  if(!targets.length){
    const {data:o2}=await admin.schema("market").from("offers").select("image_url").eq("id",offerId).single();const {data:e2}=await admin.schema("market").from("offer_images").select("url,sort").eq("offer_id",offerId).order("sort",{ascending:true});
    return json({ok:true,repaired_count:0,image_urls:[o2?.image_url,...(e2??[]).map(x=>x.url)].filter(Boolean)});
  }
  const item=targets[0];const oldPath=pathFromUrl(item.url);
  stage="download_1";const {data:blob,error:de}=await admin.storage.from("product-images").download(oldPath);if(de||!blob)throw new Error(de?.message??"Nie można pobrać pliku");
  stage="decode_1";const input=Buffer.from(await blob.arrayBuffer());const raw:any=await decode({buffer:input});if(!raw?.data||!raw.width||!raw.height)throw new Error("Dekoder HEIC nie zwrócił obrazu");
  stage="encode_1";const encoded=jpeg.encode({data:Buffer.from(raw.data),width:raw.width,height:raw.height},84);if(!encoded?.data?.length)throw new Error("Nie udało się zakodować JPG");
  const newPath=oldPath.replace(/\.(heic|heif)$/i,"")+"-converted.jpg";
  stage="upload_1";const {error:up}=await admin.storage.from("product-images").upload(newPath,encoded.data,{contentType:"image/jpeg",upsert:true,cacheControl:"3600"});if(up)throw new Error(up.message);
  const newUrl=admin.storage.from("product-images").getPublicUrl(newPath).data.publicUrl;
  stage="db_1";if(item.kind==="main"){const {error:e}=await admin.schema("market").from("offers").update({image_url:newUrl,updated_at:new Date().toISOString()}).eq("id",offerId);if(e)throw e;}else{const {error:e}=await admin.schema("market").from("offer_images").update({url:newUrl}).eq("id",item.id);if(e)throw e;}
  stage="refresh";const {data:o2}=await admin.schema("market").from("offers").select("image_url").eq("id",offerId).single();const {data:e2}=await admin.schema("market").from("offer_images").select("url,sort").eq("offer_id",offerId).order("sort",{ascending:true});
  return json({ok:true,repaired_count:1,image_urls:[o2?.image_url,...(e2??[]).map(x=>x.url)].filter(Boolean)});
 }catch(e){console.error("repair-offer-images",stage,e);return json({error:"repair_failed",stage,message:e instanceof Error?e.message:String(e)},500);}
});