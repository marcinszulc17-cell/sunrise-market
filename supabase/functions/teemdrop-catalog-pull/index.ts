import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') || '';
const INTERNAL = Deno.env.get('BRIDGE_INTERNAL_TOKEN') || '';
const TD = 'https://seller.teemdrop.com/gateway/product/productSeach/searchProduct';

const cors = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'*', 'Access-Control-Allow-Methods':'POST,OPTIONS', 'Content-Type':'application/json' };

function price(usd:number){
  const landed = Math.round(usd*4.0*1.23 + 12);
  let p = Math.max(9, Math.round(landed*2.2));
  p = Math.ceil(p/10)*10 - 1;
  return { landed, price: p };
}

async function aiCategorize(items:any[], cats:{id:string,label:string}[]):Promise<Record<string,string>>{
  if(!ANTHROPIC || items.length===0) return {};
  const catList = cats.map(c=>`${c.id}|${c.label}`).join('\n');
  const prods = items.map(i=>`${i.spu}: ${i.nameEn||''}`).join('\n');
  const prompt = `Dopasuj kazdy produkt do NAJLEPSZEJ kategorii z listy (sklep e-commerce PL).\n\nKATEGORIE (id|sciezka):\n${catList}\n\nPRODUKTY (spu: tytul EN):\n${prods}\n\nZwroc TYLKO JSON: obiekt mapujacy spu -> id kategorii (dokladnie jedno id z listy). Bez komentarzy.`;
  try{
    const r = await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':ANTHROPIC,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:2000,messages:[{role:'user',content:prompt}]})});
    const j = await r.json();
    let t = (j?.content?.[0]?.text||'').trim();
    const s=t.indexOf('{'), e=t.lastIndexOf('}');
    if(s>=0&&e>s) t=t.slice(s,e+1);
    return JSON.parse(t);
  }catch(_e){ return {}; }
}

Deno.serve(async (req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
  try{
    const body = await req.json().catch(()=>({}));
    if(INTERNAL && req.headers.get('x-token')!==INTERNAL){
      return new Response(JSON.stringify({error:'unauthorized'}),{status:401,headers:cors});
    }
    const pageSize = Math.min(30, body.pageSize||20);
    const pages = Math.min(20, body.pages||1);
    const startPage = body.startPage||1;
    const keyword = body.keyword||'';
    const doAI = body.categorize!==false;

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: cats } = await sb.rpc('tt_leaf_categories');
    const catList = (cats||[]) as {id:string,label:string}[];

    let pulled=0, inserted=0, skipped=0, errors=0;
    for(let p=startPage; p<startPage+pages; p++){
      const tr = await fetch(TD,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pageNum:p,pageSize,keyword})});
      const tj = await tr.json();
      const items = (tj?.data?.data||[]) as any[];
      if(items.length===0) break;
      pulled += items.length;
      const map = doAI ? await aiCategorize(items, catList) : {};
      for(const it of items){
        try{
          const usd = parseFloat(it.productPrice)||0;
          const { landed, price:pr } = price(usd);
          const imgs = Array.from(new Set([it.image, ...((it.images)||[])].filter((u:string)=>u&&u.startsWith('http'))));
          const catId = map[it.spu] && catList.find(c=>c.id===map[it.spu]) ? map[it.spu] : null;
          const { data: offerId } = await sb.rpc('ingest_teemdrop_offer',{ p_spu:it.spu, p_title:it.nameEn||it.spu, p_price:pr, p_landed:landed, p_image:it.image, p_images:imgs, p_category_id:catId });
          if(offerId) inserted++; else skipped++;
        }catch(_e){ errors++; }
      }
    }
    return new Response(JSON.stringify({ ok:true, pulled, inserted, skipped, errors }),{headers:cors});
  }catch(e){
    return new Response(JSON.stringify({ error:String(e) }),{status:500,headers:cors});
  }
});
