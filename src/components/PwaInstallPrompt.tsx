import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export default function PwaInstallPrompt(){
  const [deferred,setDeferred]=useState<InstallEvent|null>(null);
  const [showIos,setShowIos]=useState(false);
  const [hidden,setHidden]=useState(false);

  useEffect(()=>{
    const standalone=window.matchMedia?.('(display-mode: standalone)').matches || (window.navigator as any).standalone===true;
    if(standalone) return;
    const onPrompt=(e:Event)=>{e.preventDefault();setDeferred(e as InstallEvent);};
    window.addEventListener('beforeinstallprompt',onPrompt as EventListener);
    const ua=navigator.userAgent.toLowerCase();
    const ios=/iphone|ipad|ipod/.test(ua);
    const safari=/safari/.test(ua)&&!/crios|fxios|edgios/.test(ua);
    if(ios&&safari) setShowIos(true);
    return()=>window.removeEventListener('beforeinstallprompt',onPrompt as EventListener);
  },[]);

  if(hidden||(!deferred&&!showIos)) return null;

  async function install(){
    if(!deferred) return;
    await deferred.prompt();
    const result=await deferred.userChoice;
    if(result.outcome==='accepted') setHidden(true);
    setDeferred(null);
  }

  return <div className="fixed bottom-4 left-1/2 z-[80] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl p-4 shadow-2xl" style={{background:"var(--bg)",border:"1px solid rgba(200,150,90,.35)",color:"var(--ink)"}}>
    <div className="flex items-start gap-3"><img src="/icon-192x192.png" alt="" className="h-12 w-12 rounded-xl"/><div className="min-w-0 flex-1"><div className="font-semibold">Zainstaluj Sunrise Market</div><div className="mt-1 text-xs leading-5" style={{color:"var(--mut)"}}>{showIos&&!deferred?"Na iPhone: Udostępnij → Do ekranu początkowego.":"Dodaj Sunrise Market do telefonu i uruchamiaj jak zwykłą aplikację."}</div></div><button onClick={()=>setHidden(true)} aria-label="Zamknij" className="text-xl">×</button></div>
    {deferred&&<button onClick={install} className="mt-3 w-full rounded-xl py-2.5 font-semibold text-black" style={{background:"linear-gradient(135deg,#C8965A,#E8C896)"}}>Zainstaluj aplikację</button>}
  </div>;
}
