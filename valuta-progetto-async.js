(()=>{
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const newJobId=()=>crypto.randomUUID().replace(/-/g,'');
  function friendlyAiError(message){
    const raw=String(message||'Errore durante il job AI.');
    const x=raw.toLowerCase();
    if(x.includes('usage_exceeded')||x.includes('insufficient_quota')||x.includes('quota')||x.includes('billing')||x.includes('credit'))return 'Credito o limite API OpenAI raggiunto. Aggiungi credito API oppure attendi il ripristino del limite e riprova.';
    if(x.includes('rate_limit'))return 'Limite temporaneo API OpenAI raggiunto. Attendi qualche minuto e riprova.';
    return raw;
  }

  async function pollJob(jobId,label){
    const started=Date.now();let attempts=0;
    while(Date.now()-started < 14*60*1000){
      attempts++;await delay(attempts<4?1400:2800);
      const elapsed=Math.round((Date.now()-started)/1000);
      const p=document.getElementById('progressText');if(p)p.textContent=`${label} · ${elapsed}s${elapsed>20?' · il controllo approfondito può richiedere alcuni minuti':''}`;
      const res=await fetch(`/api/valutatore-job?id=${encodeURIComponent(jobId)}`,{cache:'no-store'});
      if(res.status===404)continue;
      const data=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(data.error||`Errore stato job ${res.status}`);
      if(data.status==='done')return data.result||{};
      if(data.status==='error')throw new Error(friendlyAiError(data.error||'Errore durante il job AI.'));
    }
    throw new Error('Analisi ancora in corso oltre il tempo massimo di attesa della pagina. Riprova tra poco.');
  }

  async function submitBackground(payload,label){
    const jobId=newJobId();payload.jobId=jobId;
    const res=await fetch('/api/valuta-progetto-async',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
    if(!(res.ok||res.status===202)){
      const data=await res.json().catch(()=>({}));throw new Error(data.error||`Errore avvio job ${res.status}`);
    }
    return pollJob(jobId,label);
  }

  async function analyzeAsync(e){
    e.preventDefault();e.stopImmediatePropagation();
    if(!state.file)return;
    setBusy(true,'Avvio analisi istruttoria…');
    const backend=document.getElementById('backendCheck');backend.className='check';backend.textContent='AI server-side: job in avvio';
    try{
      const fallback=state.file.size<=2.2*1024*1024?await directFileFallback():null;
      const payload={action:'analyze',bando:selectedBando(),mode:document.getElementById('mode').value,notes:document.getElementById('notes').value.trim(),fileName:state.file.name,fileType:state.type,documentText:state.text,paragraphs:state.type==='docx'?state.paragraphs.slice(0,1200):[],fileBase64:fallback,fileMime:state.file.type||'application/pdf',deterministicContext:detectDeterministicContext(),projectContext:{requested_contribution_rate:Number(document.getElementById('projectContributionRate')?.value)||null,verified_facts:document.getElementById('projectVerifiedFacts')?.value.trim()||''}};
      backend.textContent='AI server-side: analisi approfondita in background';
      const result=await submitBackground(payload,'Analisi istruttoria in corso');
      if(!result.analysis)throw new Error('Il job è terminato senza un’analisi valida.');
      state.analysis=result.analysis;backend.className='check ok';backend.textContent='✓ AI server-side configurata';
      renderAnalysis(state.analysis);document.getElementById('results').classList.add('show');document.getElementById('results').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(err){console.error(err);backend.className='check warn';backend.textContent='AI server-side: controllo non completato';alert(err.message||'Errore durante l’analisi.')}finally{setBusy(false)}
  }

  async function rewriteAsync(e){
    e.preventDefault();e.stopImmediatePropagation();
    if(!state.analysis||!state.file)return;
    setBusy(true,'Avvio rigenerazione del progetto…');
    try{
      const payload={action:'rewrite',bando:selectedBando(),fileName:state.file.name,fileType:state.type,documentText:state.text,paragraphs:state.type==='docx'?state.paragraphs.slice(0,1200):[],analysis:state.analysis,requestedContributionRate:Number(document.getElementById('projectContributionRate')?.value)||null,verifiedFacts:document.getElementById('projectVerifiedFacts')?.value.trim()||''};
      const result=await submitBackground(payload,'Rigenerazione progetto in corso');
      if(!result.rewrite)throw new Error('Il job è terminato senza una versione revisionata valida.');
      state.rewrite=result.rewrite;renderRewrite(state.rewrite);document.getElementById('rewritePanel').classList.add('show');document.getElementById('rewritePanel').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(err){console.error(err);alert(err.message||'Errore durante la rigenerazione.')}finally{setBusy(false)}
  }

  async function health(){
    const box=document.getElementById('backendCheck');
    try{const r=await fetch('/api/valutatore-health',{cache:'no-store'});const x=await r.json();if(r.ok&&x.ok){box.className='check ok';box.textContent=`✓ AI pronta · ${x.model}`}else throw new Error('backend')}catch{box.className='check warn';box.textContent='AI server-side: da verificare'}
  }

  document.getElementById('analyzeBtn')?.addEventListener('click',analyzeAsync,true);
  document.getElementById('rewriteBtn')?.addEventListener('click',rewriteAsync,true);
  health();
})();
