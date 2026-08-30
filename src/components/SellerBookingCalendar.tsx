import { useMemo, useState } from "react";

type BookingEvent = { id:string; offer_id:string; title:string; buyer_name:string|null; booking_type:string; starts_at:string; ends_at:string; status:string };
type BlockEvent = { id:string; offer_id:string; title:string; starts_at:string; ends_at:string; reason:string|null };
type Props = { bookings:BookingEvent[]; blocks:BlockEvent[]; onPickDate?:(start:Date,end:Date)=>void; onRescheduleDrop?:(bookingId:string,targetDay:Date)=>Promise<boolean>; onRescheduleTimeDrop?:(bookingId:string,targetTime:Date)=>Promise<boolean>; rescheduleBusy?:boolean };
type View = "month"|"week"|"day";
type CalendarEvent = { id:string; kind:"booking"|"block"; title:string; subtitle:string; startsAt:Date; endsAt:Date; status?:string; bookingId?:string; bookingType?:string };

const DAY=86400000;
const WEEKDAYS=["Pon","Wt","Śr","Czw","Pt","Sob","Nd"];
const monthFmt=new Intl.DateTimeFormat("pl-PL",{month:"long",year:"numeric"});
const dayFmt=new Intl.DateTimeFormat("pl-PL",{weekday:"long",day:"numeric",month:"long"});
const shortDayFmt=new Intl.DateTimeFormat("pl-PL",{day:"numeric",month:"short"});
const timeFmt=new Intl.DateTimeFormat("pl-PL",{hour:"2-digit",minute:"2-digit"});
const START_MIN=7*60;
const END_MIN=22*60;
const PX_PER_MINUTE=1.35;

function startOfDay(d:Date){const x=new Date(d);x.setHours(0,0,0,0);return x}
function addDays(d:Date,n:number){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function startOfWeek(d:Date){const x=startOfDay(d);const js=x.getDay();return addDays(x,js===0?-6:1-js)}
function sameDay(a:Date,b:Date){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()}
function overlapsDay(e:CalendarEvent,d:Date){const from=startOfDay(d).getTime(),to=from+DAY;return e.startsAt.getTime()<to&&e.endsAt.getTime()>from}
function eventTime(e:CalendarEvent){return `${timeFmt.format(e.startsAt)}–${timeFmt.format(e.endsAt)}`}
function minutesOf(d:Date){return d.getHours()*60+d.getMinutes()}
function eventStyle(e:CalendarEvent):React.CSSProperties{
  if(e.kind==="block")return{background:"rgba(148,163,184,.10)",border:"1px dashed rgba(148,163,184,.35)",color:"var(--mut)"};
  if(e.status==="confirmed")return{background:"rgba(34,197,94,.11)",border:"1px solid rgba(34,197,94,.28)"};
  if(e.status==="pending_payment"||e.status==="held")return{background:"rgba(200,150,90,.12)",border:"1px solid rgba(200,150,90,.30)"};
  if(e.status==="cancelled"||e.status==="expired")return{background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.18)",opacity:.65};
  return{background:"rgba(56,224,240,.08)",border:"1px solid rgba(56,224,240,.20)"};
}

export default function SellerBookingCalendar({bookings,blocks,onPickDate,onRescheduleDrop,onRescheduleTimeDrop,rescheduleBusy=false}:Props){
  const[view,setView]=useState<View>("month");
  const[cursor,setCursor]=useState(()=>new Date());
  const[draggingBookingId,setDraggingBookingId]=useState<string|null>(null);
  const[dropDay,setDropDay]=useState<Date|null>(null);
  const[dropTime,setDropTime]=useState<Date|null>(null);
  const events=useMemo<CalendarEvent[]>(()=>[
    ...bookings.map(b=>({id:`booking-${b.id}`,kind:"booking" as const,title:b.title,subtitle:b.buyer_name||"Klient",startsAt:new Date(b.starts_at),endsAt:new Date(b.ends_at),status:b.status,bookingId:b.id,bookingType:b.booking_type})),
    ...blocks.map(b=>({id:`block-${b.id}`,kind:"block" as const,title:b.title,subtitle:b.reason||"Blokada terminu",startsAt:new Date(b.starts_at),endsAt:new Date(b.ends_at)})),
  ].filter(e=>!Number.isNaN(e.startsAt.getTime())&&!Number.isNaN(e.endsAt.getTime())),[bookings,blocks]);

  function move(direction:number){if(view==="day")setCursor(addDays(cursor,direction));else if(view==="week")setCursor(addDays(cursor,direction*7));else setCursor(new Date(cursor.getFullYear(),cursor.getMonth()+direction,1))}
  function pickDay(day:Date){setCursor(day);if(view==="month")setView("day");onPickDate?.(new Date(day.getFullYear(),day.getMonth(),day.getDate(),9),new Date(day.getFullYear(),day.getMonth(),day.getDate(),10))}
  function beginDrag(event:CalendarEvent,e:React.DragEvent){if(event.kind!=="booking"||event.status!=="confirmed"||!event.bookingId||rescheduleBusy)return;e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",event.bookingId);setDraggingBookingId(event.bookingId)}
  async function dropBooking(day:Date,e:React.DragEvent){if(!onRescheduleDrop||rescheduleBusy)return;e.preventDefault();const id=e.dataTransfer.getData("text/plain")||draggingBookingId;if(!id)return;setDropDay(null);const ok=await onRescheduleDrop(id,day);if(ok)setDraggingBookingId(null)}
  async function dropBookingAtTime(target:Date,e:React.DragEvent){if(!onRescheduleTimeDrop||rescheduleBusy)return;e.preventDefault();const id=e.dataTransfer.getData("text/plain")||draggingBookingId;if(!id)return;setDropTime(null);const ok=await onRescheduleTimeDrop(id,target);if(ok)setDraggingBookingId(null)}

  const label=view==="month"?monthFmt.format(cursor):view==="day"?dayFmt.format(cursor):`${shortDayFmt.format(startOfWeek(cursor))} – ${shortDayFmt.format(addDays(startOfWeek(cursor),6))}`;
  return <section className="mb-6 overflow-hidden rounded-3xl" style={{background:"var(--glass)",border:"1px solid var(--line)"}}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:p-5" style={{borderColor:"var(--line)"}}>
      <div><div className="text-xs font-semibold tracking-[.14em]" style={{color:"var(--gold)"}}>KALENDARZ SPRZEDAWCY</div><h2 className="mt-1 text-xl font-semibold capitalize">{label}</h2>{draggingBookingId&&<div className="mt-1 text-xs" style={{color:"var(--gold)"}}>{view==="month"?"Upuść rezerwację na wybrany dzień.":"Upuść wizytę na konkretny dzień i godzinę."}</div>}</div>
      <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={()=>setCursor(new Date())} className="rounded-xl px-3 py-2 text-sm" style={{border:"1px solid var(--line)"}}>Dzisiaj</button><button type="button" onClick={()=>move(-1)} className="rounded-xl px-3 py-2" style={{border:"1px solid var(--line)"}}>←</button><button type="button" onClick={()=>move(1)} className="rounded-xl px-3 py-2" style={{border:"1px solid var(--line)"}}>→</button><div className="flex rounded-xl p-1" style={{background:"var(--header)",border:"1px solid var(--line)"}}>{(["month","week","day"] as View[]).map(v=><button type="button" key={v} onClick={()=>setView(v)} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{background:view===v?"rgba(200,150,90,.18)":"transparent",color:view===v?"var(--gold)":"var(--mut)"}}>{v==="month"?"Miesiąc":v==="week"?"Tydzień":"Dzień"}</button>)}</div></div>
    </div>
    {view==="month"&&<MonthView cursor={cursor} events={events} onPickDay={pickDay} draggingBookingId={draggingBookingId} dropDay={dropDay} setDropDay={setDropDay} beginDrag={beginDrag} dropBooking={dropBooking} rescheduleBusy={rescheduleBusy}/>} 
    {view==="week"&&<WeekTimeline cursor={cursor} events={events} onPickDay={pickDay} onPickDate={onPickDate} beginDrag={beginDrag} draggingBookingId={draggingBookingId} dropBookingAtTime={dropBookingAtTime} dropTime={dropTime} setDropTime={setDropTime} rescheduleBusy={rescheduleBusy}/>} 
    {view==="day"&&<DayTimeline cursor={cursor} events={events} onPickDate={onPickDate} beginDrag={beginDrag} draggingBookingId={draggingBookingId} dropBookingAtTime={dropBookingAtTime} dropTime={dropTime} setDropTime={setDropTime} rescheduleBusy={rescheduleBusy}/>} 
    <div className="flex flex-wrap gap-4 border-t px-4 py-3 text-xs" style={{borderColor:"var(--line)",color:"var(--mut)"}}><span>● Potwierdzona</span><span style={{color:"var(--gold)"}}>● Oczekuje / blokada płatności</span><span>▧ Ręczna blokada</span><span>Tydzień i dzień: przeciągnij wizytę na dokładny slot 30 min.</span></div>
  </section>;
}

type DragProps={draggingBookingId:string|null;dropDay:Date|null;setDropDay:(d:Date|null)=>void;beginDrag:(event:CalendarEvent,e:React.DragEvent)=>void;dropBooking:(day:Date,e:React.DragEvent)=>Promise<void>;rescheduleBusy:boolean};
function MonthView({cursor,events,onPickDay,draggingBookingId,dropDay,setDropDay,beginDrag,dropBooking,rescheduleBusy}:{cursor:Date;events:CalendarEvent[];onPickDay:(d:Date)=>void}&DragProps){
  const first=new Date(cursor.getFullYear(),cursor.getMonth(),1),gridStart=startOfWeek(first),days=Array.from({length:42},(_,i)=>addDays(gridStart,i)),today=new Date();
  return <div><div className="grid grid-cols-7 border-b text-center text-[11px] font-semibold" style={{borderColor:"var(--line)",color:"var(--mut)"}}>{WEEKDAYS.map(d=><div key={d} className="py-2">{d}</div>)}</div><div className="grid grid-cols-7">{days.map(day=>{const all=events.filter(e=>overlapsDay(e,day)),shown=all.slice(0,3),outside=day.getMonth()!==cursor.getMonth(),target=!!draggingBookingId&&!!dropDay&&sameDay(day,dropDay);return <div key={day.toISOString()} onDragOver={e=>{if(draggingBookingId&&!rescheduleBusy){e.preventDefault();setDropDay(day)}}} onDragLeave={()=>target&&setDropDay(null)} onDrop={e=>dropBooking(day,e)} className="min-h-[105px] border-b border-r p-1.5 sm:min-h-[125px] sm:p-2" style={{borderColor:target?"var(--gold)":"var(--line)",background:target?"rgba(200,150,90,.10)":undefined,opacity:outside?.45:1}}><button type="button" onClick={()=>onPickDay(day)} className="mb-1 grid h-7 w-7 place-items-center rounded-full text-xs font-semibold" style={sameDay(day,today)?{background:"var(--gold)",color:"#211406"}:undefined}>{day.getDate()}</button><div className="space-y-1">{shown.map(e=><CalendarEventChip key={e.id} event={e} compact onDragStart={beginDrag} rescheduleBusy={rescheduleBusy}/>)}{all.length>3&&<button type="button" onClick={()=>onPickDay(day)} className="text-[10px] underline" style={{color:"var(--mut)"}}>+{all.length-3} więcej</button>}</div></div>})}</div></div>
}

function WeekTimeline({cursor,events,onPickDay,onPickDate,beginDrag,draggingBookingId,dropBookingAtTime,dropTime,setDropTime,rescheduleBusy}:{cursor:Date;events:CalendarEvent[];onPickDay:(d:Date)=>void;onPickDate?: (s:Date,e:Date)=>void;beginDrag:(e:CalendarEvent,x:React.DragEvent)=>void;draggingBookingId:string|null;dropBookingAtTime:(d:Date,e:React.DragEvent)=>Promise<void>;dropTime:Date|null;setDropTime:(d:Date|null)=>void;rescheduleBusy:boolean}){
  const start=startOfWeek(cursor),days=Array.from({length:7},(_,i)=>addDays(start,i)),today=new Date(),height=(END_MIN-START_MIN)*PX_PER_MINUTE;
  const slots=Array.from({length:31},(_,i)=>START_MIN+i*30);
  const daily=events.filter(e=>e.kind==="booking"&&e.bookingType==="daily"&&days.some(d=>overlapsDay(e,d)));
  return <div className="overflow-x-auto">
    {daily.length>0&&<div className="min-w-[980px] border-b p-3" style={{borderColor:"var(--line)"}}><div className="mb-2 text-xs font-semibold" style={{color:"var(--mut)"}}>WYNAJMY DOBOWE</div><div className="flex flex-wrap gap-2">{daily.map(e=><CalendarEventChip key={e.id} event={e} onDragStart={beginDrag} rescheduleBusy={rescheduleBusy}/>)}</div></div>}
    <div className="min-w-[980px]">
      <div className="grid grid-cols-[64px_repeat(7,minmax(126px,1fr))] border-b" style={{borderColor:"var(--line)"}}><div/>{days.map(day=><button type="button" key={day.toISOString()} onClick={()=>onPickDay(day)} className="p-2 text-center" style={sameDay(day,today)?{background:"rgba(200,150,90,.10)"}:undefined}><div className="text-xs" style={{color:"var(--mut)"}}>{day.toLocaleDateString("pl-PL",{weekday:"short"})}</div><div className="text-lg font-semibold">{day.getDate()}</div></button>)}</div>
      <div className="grid grid-cols-[64px_repeat(7,minmax(126px,1fr))]">
        <div className="relative" style={{height}}>{slots.filter((_,i)=>i%2===0).map(m=><div key={m} className="absolute right-2 text-[11px]" style={{top:(m-START_MIN)*PX_PER_MINUTE-7,color:"var(--mut)"}}>{String(Math.floor(m/60)).padStart(2,"0")}:00</div>)}</div>
        {days.map(day=>{const timed=events.filter(e=>overlapsDay(e,day)&&e.kind==="booking"&&e.bookingType==="appointment");const blocks=events.filter(e=>overlapsDay(e,day)&&e.kind==="block");return <div key={day.toISOString()} className="relative border-l" style={{height,background:"var(--header)",borderColor:"var(--line)"}}>
          {slots.map(m=>{const slot=new Date(day.getFullYear(),day.getMonth(),day.getDate(),Math.floor(m/60),m%60);const active=!!dropTime&&sameDay(slot,dropTime)&&minutesOf(slot)===minutesOf(dropTime);return <div key={m} className="absolute left-0 right-0" style={{top:(m-START_MIN)*PX_PER_MINUTE,height:30*PX_PER_MINUTE,borderTop:"1px solid var(--line)",background:active?"rgba(200,150,90,.14)":undefined}} onDragOver={e=>{if(draggingBookingId&&!rescheduleBusy){e.preventDefault();e.dataTransfer.dropEffect="move";setDropTime(slot)}}} onDragLeave={()=>active&&setDropTime(null)} onDrop={e=>dropBookingAtTime(slot,e)} onDoubleClick={()=>onPickDate?.(slot,new Date(slot.getTime()+30*60000))}/>})}
          {blocks.map(e=>{const top=Math.max(0,(minutesOf(e.startsAt)-START_MIN)*PX_PER_MINUTE),h=Math.max(18,(minutesOf(e.endsAt)-minutesOf(e.startsAt))*PX_PER_MINUTE);return <div key={e.id} className="absolute left-1 right-1 z-[5] overflow-hidden rounded-md px-1.5 py-1 text-[10px]" style={{...eventStyle(e),top,height:h}}>▧ {e.subtitle}</div>})}
          {timed.map(e=>{const top=Math.max(0,(minutesOf(e.startsAt)-START_MIN)*PX_PER_MINUTE),h=Math.max(32,(minutesOf(e.endsAt)-minutesOf(e.startsAt))*PX_PER_MINUTE),draggable=e.status==="confirmed"&&!rescheduleBusy;return <a href={`#booking-${e.bookingId}`} key={e.id} draggable={draggable} onDragStart={x=>beginDrag(e,x)} className={`absolute left-1 right-1 z-10 overflow-hidden rounded-lg p-1.5 text-[11px] ${draggable?"cursor-grab active:cursor-grabbing":""}`} style={{...eventStyle(e),top,height:h}}><div className="truncate font-semibold">{draggable?"↕ ":"● "}{e.title}</div><div className="truncate">{eventTime(e)}</div><div className="truncate" style={{color:"var(--mut)"}}>{e.subtitle}</div></a>})}
        </div>})}
      </div>
    </div><div className="min-w-[980px] p-3 text-xs" style={{color:"var(--mut)"}}>Przeciągnij wizytę między dniami i godzinami. Siatka ma sloty co 30 minut; backend ostatecznie sprawdza dostępność i kolizje.</div>
  </div>
}

function DayTimeline({cursor,events,onPickDate,beginDrag,draggingBookingId,dropBookingAtTime,dropTime,setDropTime,rescheduleBusy}:{cursor:Date;events:CalendarEvent[];onPickDate?:(s:Date,e:Date)=>void;beginDrag:(e:CalendarEvent,x:React.DragEvent)=>void;draggingBookingId:string|null;dropBookingAtTime:(d:Date,e:React.DragEvent)=>Promise<void>;dropTime:Date|null;setDropTime:(d:Date|null)=>void;rescheduleBusy:boolean}){
  const slots=Array.from({length:31},(_,i)=>START_MIN+i*30),dayEvents=events.filter(e=>overlapsDay(e,cursor)).sort((a,b)=>a.startsAt.getTime()-b.startsAt.getTime()),timed=dayEvents.filter(e=>e.kind==="booking"&&e.bookingType==="appointment"),others=dayEvents.filter(e=>!(e.kind==="booking"&&e.bookingType==="appointment")),height=(END_MIN-START_MIN)*1.6;
  return <div className="p-3 sm:p-5">{others.length>0&&<div className="mb-4 space-y-2">{others.map(e=><CalendarEventChip key={e.id} event={e} onDragStart={beginDrag} rescheduleBusy={rescheduleBusy}/>)}</div>}<div className="overflow-x-auto rounded-2xl" style={{border:"1px solid var(--line)"}}><div className="grid min-w-[680px] grid-cols-[72px_1fr]"><div className="relative" style={{height}}>{slots.filter((_,i)=>i%2===0).map(m=><div key={m} className="absolute right-3 text-xs" style={{top:(m-START_MIN)*1.6-7,color:"var(--mut)"}}>{String(Math.floor(m/60)).padStart(2,"0")}:00</div>)}</div><div className="relative" style={{height,background:"var(--header)"}}>{slots.map(m=>{const slot=new Date(cursor.getFullYear(),cursor.getMonth(),cursor.getDate(),Math.floor(m/60),m%60),active=!!dropTime&&sameDay(slot,dropTime)&&minutesOf(slot)===minutesOf(dropTime);return <div key={m} className="absolute left-0 right-0" style={{top:(m-START_MIN)*1.6,height:48,borderTop:"1px solid var(--line)",background:active?"rgba(200,150,90,.14)":undefined}} onDragOver={e=>{if(draggingBookingId&&!rescheduleBusy){e.preventDefault();setDropTime(slot)}}} onDragLeave={()=>active&&setDropTime(null)} onDrop={e=>dropBookingAtTime(slot,e)} onDoubleClick={()=>onPickDate?.(slot,new Date(slot.getTime()+30*60000))}/>})}{timed.map(e=>{const top=Math.max(0,(minutesOf(e.startsAt)-START_MIN)*1.6),h=Math.max(38,(minutesOf(e.endsAt)-minutesOf(e.startsAt))*1.6),draggable=e.status==="confirmed"&&!rescheduleBusy;return <a href={`#booking-${e.bookingId}`} key={e.id} draggable={draggable} onDragStart={x=>beginDrag(e,x)} className={`absolute left-2 right-2 z-10 rounded-xl p-2 text-sm shadow-sm ${draggable?"cursor-grab active:cursor-grabbing":""}`} style={{...eventStyle(e),top,height:h}}><div className="flex items-center justify-between gap-2"><div className="truncate font-semibold">{draggable?"↕ ":"● "}{e.title}</div><div className="shrink-0 text-xs">{eventTime(e)}</div></div><div className="mt-1 truncate text-xs" style={{color:"var(--mut)"}}>{e.subtitle}</div></a>})}</div></div></div><div className="mt-3 text-xs" style={{color:"var(--mut)"}}>Siatka 30 minut. Podwójne kliknięcie slotu przygotowuje blokadę terminu.</div></div>
}

function CalendarEventChip({event,compact=false,onDragStart,rescheduleBusy=false}:{event:CalendarEvent;compact?:boolean;onDragStart?:(event:CalendarEvent,e:React.DragEvent)=>void;rescheduleBusy?:boolean}){const draggable=event.kind==="booking"&&event.status==="confirmed"&&!!event.bookingId&&!rescheduleBusy;const content=<><div className="truncate font-semibold">{event.kind==="block"?"▧ ":draggable?"↔ ":"● "}{event.title}</div>{!compact&&<><div className="mt-1 text-xs" style={{color:"var(--mut)"}}>{eventTime(event)}</div><div className="mt-1 truncate text-xs" style={{color:"var(--mut)"}}>{event.subtitle}</div></>}</>;if(event.kind==="booking"&&event.bookingId)return <a href={`#booking-${event.bookingId}`} draggable={draggable} onDragStart={e=>onDragStart?.(event,e)} className={`block rounded-lg ${compact?"px-1.5 py-1 text-[10px]":"p-3 text-sm"} ${draggable?"cursor-grab active:cursor-grabbing":""}`} style={eventStyle(event)}>{content}</a>;return <div className={`rounded-lg ${compact?"px-1.5 py-1 text-[10px]":"p-3 text-sm"}`} style={eventStyle(event)}>{content}</div>}
