import { useEffect, useState } from "react";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(){
  return window.matchMedia?.('(display-mode: standalone)').matches || (window.navigator as Navigator & {standalone?:boolean}).standalone===true;
}

export default function PwaInstallPrompt(){
  const [deferred,setDeferred]=useState<InstallEvent|null>(null);
  const [ios,setIos]=useState(false);
  const [iosSafari,setIosSafari]=useState(false);
  const [show,setShow]=useState(false);

  useEffect(()=>{
    const syncStandaloneState=()=>setShow(!isStandalone());
    if(isStandalone()) return;

    const ua=navigator.userAgent.toLowerCase();
    const isiOS=/iphone|ipad|ipod/.test(ua) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
    const safari=/safari/.test(ua)&&!/crios|fxios|edgios|opios|duckduckgo/.test(ua);
    setIos(isiOS);
    setIosSafari(isiOS&&safari);

    const onPrompt=(e:Event)=>{
      e.preventDefault();
      setDeferred(e as InstallEvent);
      setShow(true);
    };
    const onInstalled=()=>{
      setDeferred(null);
      setShow(false);
    };
    const media=window.matchMedia?.('(display-mode: standalone)');

    window.addEventListener('beforeinstallprompt',onPrompt as EventListener);
    window.addEventListener('appinstalled',onInstalled);
    media?.addEventListener?.('change',syncStandaloneState);

    setShow(true);
    return()=>{
      window.removeEventListener('beforeinstallprompt',onPrompt as EventListener);
      window.removeEventListener('appinstalled',onInstalled);
      media?.removeEventListener?.('change',syncStandaloneState);
    };
  },[]);

  if(!show||isStandalone()) return null;

  async function install(){
    if(!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    // Odrzucenie systemowego dialogu nie ukrywa naszego komunikatu.
    setDeferred(null);
    setShow(true);
  }

  const text=deferred
    ? "Dodaj Sunrise Market do telefonu i uruchamiaj jak zwykłą aplikację."
    : iosSafari
      ? "Na iPhone stuknij Udostępnij (kwadrat ze strzałką), a potem „Do ekranu początkowego”."
      : ios
        ? "Na iPhone otwórz tę stronę w Safari, potem wybierz Udostępnij → „Do ekranu początkowego”."
        : "Otwórz menu przeglądarki i wybierz „Zainstaluj aplikację” lub „Dodaj do ekranu głównego”.";

  return <div className="fixed left-1/2 top-20 z-[100] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl p-4 shadow-2xl" style={{background:"var(--bg)",border:"1px solid rgba(200,150,90,.55)",color:"var(--ink)"}} role="dialog" aria-label="Instalacja Sunrise Market">
    <div className="flex items-start gap-3">
      <img src="/icon-192x192.png" alt="" className="h-12 w-12 rounded-xl"/>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">📲 Zainstaluj Sunrise Market</div>
        <div className="mt-1 text-xs leading-5" style={{color:"var(--mut)"}}>{text}</div>
      </div>
    </div>
    {deferred&&<button onClick={install} className="mt-3 w-full rounded-xl py-2.5 font-semibold text-black" style={{background:"linear-gradient(135deg,#C8965A,#E8C896)"}}>Zainstaluj aplikację</button>}
    {!deferred&&ios&&<div className="mt-3 rounded-xl px-3 py-2 text-xs" style={{background:"rgba(200,150,90,.10)",border:"1px solid rgba(200,150,90,.20)",color:"var(--gold)"}}>Na iOS instalacja odbywa się przez menu Udostępnij w Safari.</div>}
  </div>;
}
