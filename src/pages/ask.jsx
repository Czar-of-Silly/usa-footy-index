// pages/ask.jsx — extracted verbatim from the former inline app (Phase 5.3). Do not edit behaviour here without tests.
import { T } from "../theme.mjs";
import { useState } from "../ui/runtime.jsx";

export function AskDesk(){
  const[q,setQ]=useState("");
  const[busy,setBusy]=useState(false);
  const[ans,setAns]=useState(null);
  const[err,setErr]=useState(null);
  const suggestions=["Who is the best defender right now?","Who leads the Golden Boot race?","How good is Messi this season?"];
  const ask=(text)=>{
    const question=(text||q).trim();
    if(question.length<3||busy)return;
    setBusy(true);setErr(null);setAns(null);setQ(question);
    fetch("/api/ask",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question})})
      .then(r=>r.json().then(d=>({ok:r.ok,d})))
      .then(({ok,d})=>{if(ok&&d.answer)setAns(d.answer);else setErr(d.error||"The desk is briefly unavailable.");})
      .catch(()=>setErr("The desk is briefly unavailable."))
      .finally(()=>setBusy(false));
  };
  return <div style={{animation:"fadeUp .4s ease",maxWidth:720,margin:"0 auto"}}>
    <div style={{marginBottom:6,fontFamily:T.mono,fontSize:11.5,fontWeight:700,letterSpacing:2,color:T.accent,textTransform:"uppercase"}}>The Desk · Q&A</div>
    <div style={{fontFamily:T.display,fontWeight:900,fontSize:34,color:T.ink,letterSpacing:-.5,lineHeight:1.05}}>Ask USFI</div>
    <div style={{fontFamily:T.serif,fontStyle:"italic",fontSize:14,color:T.textDim,margin:"8px 0 18px"}}>Questions answered strictly from the Index record: grades, races, the table. Updated with every data run.</div>
    <div style={{height:2,background:T.ink,marginBottom:2}}></div><div style={{height:1,background:T.border,marginBottom:18}}></div>
    <div style={{display:"flex",gap:8}}>
      <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")ask();}} maxLength={300} placeholder="Ask about any player, club, or race..." style={{flex:1,padding:"12px 14px",fontFamily:T.serif,fontSize:15,color:T.ink,background:T.surface,border:"1px solid "+T.border,borderRadius:0,outline:"none"}}/>
      <button onClick={()=>ask()} disabled={busy} style={{padding:"12px 22px",fontFamily:T.mono,fontSize:12,fontWeight:700,letterSpacing:2,color:T.bg,background:T.ink,border:"none",borderRadius:0,cursor:busy?"default":"pointer",opacity:busy?.6:1}}>ASK</button>
    </div>
    <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:12}}>
      {suggestions.map(s=><button key={s} onClick={()=>ask(s)} disabled={busy} style={{padding:"6px 12px",fontFamily:T.mono,fontSize:11.5,color:T.textDim,background:"transparent",border:"1px solid "+T.borderLt,borderRadius:0,cursor:"pointer"}}>{s}</button>)}
    </div>
    {busy&&<div style={{marginTop:24,fontFamily:T.serif,fontStyle:"italic",fontSize:14,color:T.textMute}}>Consulting the record...</div>}
    {err&&<div style={{marginTop:24,fontFamily:T.serif,fontSize:14,color:T.red}}>{err}</div>}
    {ans&&<div style={{marginTop:24,padding:"18px 20px",background:T.surface,border:"1px solid "+T.border,borderLeft:"3px solid "+T.ink}}>
      <div style={{fontFamily:T.serif,fontSize:15.5,color:T.text,lineHeight:1.65}}>{ans}</div>
      <div style={{marginTop:12,fontFamily:T.mono,fontSize:11,letterSpacing:1.5,color:T.textMute,textTransform:"uppercase"}}>From the record · {new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"})}</div>
    </div>}
  </div>;
}

