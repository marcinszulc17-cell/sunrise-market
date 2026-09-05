// reprice-market: wycenia produkty dropship pod rynek PL (Allegro/Erli) z maksymalną marżą.
// AI estymuje typową cenę detaliczną; ustawiamy tuż pod nią, podłoga = landed*1.6, końcówki 9.
import { createClient } from 'jsr:@supabase/supabase-js@2';
const BRIDGE = Deno.env.get('BRIDGE_INTERNAL_TOKEN') ?? '';
const ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const pub = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

function niner(v:number){ v=Math.round(v); if(v<=19) return 19; const r = v<100 ? Math.ceil(v/10)*10-1 : Math.round(v/10)*10-1; return r; }

Deno.serve(async (req)=>{
  if (BRIDGE && req.headers.get('x-token')!==BRIDGE) return new Response('unauthorized',{status:401});
  if (!ANTHROPIC) return new Response(JSON.stringify({error:'no key'}),{status:500});
  const body = await req.json().catch(()=>({}));
  const limit = Math.min(Number(body.limit ?? 20), 25);
  const { data: claimed, error } = await pub.rpc('claim_reprice_batch', { p_limit: limit });
  if (error) return new Response(JSON.stringify({error:error.message}),{status:500});
  const todo = (claimed ?? []) as {id:string,title:string,cat:string,landed:number,price:number}[];
  if (todo.length===0) return new Response(JSON.stringify({done:0,message:'brak'}),{headers:{'Content-Type':'application/json'}});

  const prompt = `Jesteś ekspertem cen e-commerce w Polsce. Dla każdego produktu podaj TYPOWĄ cenę detaliczną brutto w PLN, jaką realnie ma na Allegro/Erli (mediana rynkowa dla podobnego produktu). Weź pod uwagę tytuł i kategorię. Zwróć TYLKO JSON: obiekt {id: cena_pln_liczba}. Bez komentarzy.\n\nPRODUKTY:\n${todo.map(t=>`${t.id} | ${t.title} | kat: ${t.cat||''}`).join('\n')}`;
  let map:Record<string,number> = {};
  try{
    const r = await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':ANTHROPIC,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:2000,messages:[{role:'user',content:prompt}]})});
    const j = await r.json(); let t=(j?.content?.[0]?.text||'').trim();
    const s=t.indexOf('{'), e=t.lastIndexOf('}'); if(s>=0&&e>s) t=t.slice(s,e+1);
    map = JSON.parse(t);
  }catch(_e){ map = {}; }

  let done=0; const doneIds=new Set<string>();
  for(const t of todo){
    try{
      const landed = Number(t.landed)||0;
      const floor = Math.max(19, Math.round(landed*1.6));
      const allegro = Number(map[t.id])||0;
      let sale:number;
      if (allegro > floor) sale = niner(allegro*0.95);          // tuż pod rynkiem, max marża
      else sale = niner(Math.max(floor, landed*2.2, Number(t.price)||0)); // fallback
      if (sale < floor) sale = niner(floor);
      const { data: ok } = await pub.rpc('apply_market_price', { p_id: t.id, p_price: sale });
      if (ok){ done++; doneIds.add(t.id); }
    }catch(_e){}
  }
  for(const t of todo){ if(!doneIds.has(t.id)) await pub.rpc('release_reprice_claim',{p_id:t.id}); }
  return new Response(JSON.stringify({done, batch:todo.length}),{headers:{'Content-Type':'application/json'}});
});
