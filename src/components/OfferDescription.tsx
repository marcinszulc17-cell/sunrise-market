import React from "react";

function inline(text:string): React.ReactNode[] {
  const out:React.ReactNode[]=[];
  const re=/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^)]+\))/g;
  let last=0; let m:RegExpExecArray|null; let key=0;
  while((m=re.exec(text))){
    if(m.index>last) out.push(text.slice(last,m.index));
    const token=m[0];
    if(token.startsWith("**")) out.push(<strong key={key++}>{token.slice(2,-2)}</strong>);
    else if(token.startsWith("*")) out.push(<em key={key++}>{token.slice(1,-1)}</em>);
    else {
      const lm=token.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
      if(lm) out.push(<a key={key++} href={lm[2]} target="_blank" rel="noopener noreferrer" className="underline" style={{color:"var(--gold)"}}>{lm[1]}</a>);
      else out.push(token);
    }
    last=m.index+token.length;
  }
  if(last<text.length) out.push(text.slice(last));
  return out;
}

type Props = { text?: string; value?: string };

export default function OfferDescription({text,value}:Props) {
  const source=text ?? value ?? "";
  const lines=source.replace(/\r/g,"").split("\n");
  const nodes:React.ReactNode[]=[]; let bullets:string[]=[];
  const flush=()=>{ if(bullets.length){ nodes.push(<ul key={`u${nodes.length}`} className="ml-5 list-disc space-y-1">{bullets.map((b,i)=><li key={i}>{inline(b)}</li>)}</ul>); bullets=[]; } };
  lines.forEach((raw,i)=>{
    const line=raw.trimEnd();
    if(line.startsWith("- ")) { bullets.push(line.slice(2)); return; }
    flush();
    if(!line.trim()) { nodes.push(<div key={`s${i}`} className="h-2"/>); return; }
    if(line.startsWith("### ")) nodes.push(<h4 key={i} className="text-lg font-semibold">{inline(line.slice(4))}</h4>);
    else if(line.startsWith("## ")) nodes.push(<h3 key={i} className="text-xl font-semibold">{inline(line.slice(3))}</h3>);
    else if(line.startsWith("# ")) nodes.push(<h2 key={i} className="text-2xl font-semibold">{inline(line.slice(2))}</h2>);
    else nodes.push(<p key={i}>{inline(line)}</p>);
  });
  flush();
  return <div className="space-y-2 leading-7">{nodes}</div>;
}
