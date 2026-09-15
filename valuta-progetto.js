const $=id=>document.getElementById(id);
const state={file:null,type:null,text:'',paragraphs:[],buffer:null,analysis:null,rewrite:null};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(Number(n)||0);
const severityRank={critical:4,high:3,medium:2,low:1};
const MAX_TEXT=300000;
function selectedBando(){return document.querySelector('input[name="bando"]:checked')?.value||'cciaa'}
function setBusy(on,text='Lettura e controllo del progetto…'){$('analyzeBtn').disabled=on||!state.file;$('progress').classList.toggle('show',on);$('progressText').textContent=text;$('rewriteBtn').disabled=on}
function humanSize(bytes){return bytes<1024*1024?`${(bytes/1024).toFixed(0)} KB`:`${(bytes/1024/1024).toFixed(2)} MB`}
function fileType(file){const n=file.name.toLowerCase();if(n.endsWith('.pdf'))return'pdf';if(n.endsWith('.docx'))return'docx';return null}
const drop=$('dropZone');
drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('drag')});
drop.addEventListener('dragleave',()=>drop.classList.remove('drag'));
drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('drag');const f=e.dataTransfer.files?.[0];if(f)loadFile(f)});
$('fileInput').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)loadFile(f)});
$('removeFile').addEventListener('click',()=>resetFile());
$('analyzeBtn').addEventListener('click',analyze);
$('rewriteBtn').addEventListener('click',rewriteProject);
$('printReportBtn').addEventListener('click',()=>window.print());
$('downloadDocxBtn').addEventListener('click',downloadRevisedDocx);
$('printRewriteBtn').addEventListener('click',openPrintableRewrite);
function resetFile(){state.file=null;state.type=null;state.text='';state.paragraphs=[];state.buffer=null;state.analysis=null;state.rewrite=null;$('fileInput').value='';$('fileInfo').classList.remove('show');$('analyzeBtn').disabled=true;$('results').classList.remove('show');$('rewritePanel').classList.remove('show')}
async function loadFile(file){
  const type=fileType(file);if(!type){alert('Carica un file PDF oppure DOCX.');return}
  resetFile();state.file=file;state.type=type;state.buffer=await file.arrayBuffer();
  $('fileName').textContent=file.name;$('fileMeta').textContent=`${type.toUpperCase()} · ${humanSize(file.size)}`;$('fileInfo').classList.add('show');
  $('parseNotice').className='notice';$('parseNotice').textContent='Sto leggendo la struttura del documento…';
  try{
    if(type==='docx')await parseDocx();else await parsePdf();
    if(state.text.trim().length<80){$('parseNotice').className='notice warn';$('parseNotice').textContent=type==='pdf'?'Il PDF contiene pochissimo testo estraibile. Se è una scansione, l’analisi può essere incompleta; sotto 3 MB proveremo anche la lettura diretta del file.':'Il DOCX contiene pochissimo testo leggibile: verifica che non sia composto solo da immagini.'}
    else{$('parseNotice').className='notice';$('parseNotice').textContent=`Documento letto: circa ${state.text.length.toLocaleString('it-IT')} caratteri${type==='docx'?` · ${state.paragraphs.length} paragrafi rilevati`:''}.`}
    $('analyzeBtn').disabled=false;
  }catch(err){console.error(err);$('parseNotice').className='notice warn';$('parseNotice').textContent='Non sono riuscito a leggere il file. Verifica che non sia protetto o danneggiato.';$('analyzeBtn').disabled=true}
}
async function parseDocx(){
  const zip=await window.JSZip.loadAsync(state.buffer);const xml=await zip.file('word/document.xml')?.async('string');if(!xml)throw new Error('document.xml non trovato');
  const doc=new DOMParser().parseFromString(xml,'application/xml');const ps=[...doc.getElementsByTagNameNS('*','p')];
  state.paragraphs=ps.map((p,index)=>{const texts=[...p.getElementsByTagNameNS('*','t')].map(t=>t.textContent||'');return{index,text:texts.join('')}}).filter(p=>p.text.trim());
  state.text=state.paragraphs.map(p=>`[P${p.index}] ${p.text}`).join('\n').slice(0,MAX_TEXT);
}
async function parsePdf(){
  const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
  const pdf=await pdfjs.getDocument({data:new Uint8Array(state.buffer)}).promise;const pages=[];
  for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);const tc=await page.getTextContent();const text=tc.items.map(x=>x.str||'').join(' ').replace(/\s+/g,' ').trim();pages.push(`=== PAGINA ${i} / ${pdf.numPages} ===\n${text}`);if(pages.join('\n').length>MAX_TEXT)break}
  state.text=pages.join('\n\n').slice(0,MAX_TEXT);
}
function detectDeterministicContext(){
  const out={};if(selectedBando()==='fesr'&&typeof AREA_MAP!=='undefined'){
    const norm=s=>String(s||'').toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’']/g,"'");const text=norm(state.text);const matches=Object.keys(AREA_MAP).filter(c=>text.includes(norm(c))).sort((a,b)=>b.length-a.length);if(matches.length){out.detected_municipality=matches[0];out.area_interna=true;out.area_name=AREA_MAP[matches[0]]}
  }return out
}
async function directFileFallback(){
  if(!state.file||state.type!=='pdf'||state.file.size>3*1024*1024||state.text.trim().length>=80)return null;const bytes=new Uint8Array(state.buffer);let binary='';const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));return btoa(binary)
}
async function analyze(){
  if(!state.file)return;setBusy(true,'Analisi istruttoria in corso…');$('backendCheck').className='check';$('backendCheck').textContent='AI server-side: analisi in corso';
  try{
    const fallback=await directFileFallback();const payload={action:'analyze',bando:selectedBando(),mode:$('mode').value,notes:$('notes').value.trim(),fileName:state.file.name,fileType:state.type,documentText:state.text,paragraphs:state.type==='docx'?state.paragraphs.slice(0,1200):[],fileBase64:fallback,fileMime:state.file.type||'application/pdf',deterministicContext:detectDeterministicContext()};
    const res=await fetch('/api/valuta-progetto',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const data=await res.json().catch(()=>({}));
    if(!res.ok){if(data.code==='MISSING_API_KEY'){$('backendCheck').className='check warn';$('backendCheck').textContent='AI server-side: manca OPENAI_API_KEY su Netlify';throw new Error('Il valutatore è installato, ma manca la chiave OpenAI nelle variabili ambiente Netlify.')}throw new Error(data.error||`Errore ${res.status}`)}
    state.analysis=data.analysis;$('backendCheck').className='check ok';$('backendCheck').textContent='✓ AI server-side configurata';renderAnalysis(state.analysis);$('results').classList.add('show');$('results').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(err){console.error(err);alert(err.message||'Errore durante l’analisi.')}finally{setBusy(false)}
}
function renderAnalysis(a){
  $('resultTitle').textContent=a.document?.title?`Analisi · ${a.document.title}`:'Risultato analisi';$('resultSummary').textContent=a.verdict?.executive_summary||'';$('verdict').textContent=a.verdict?.status||'DA VERIFICARE';
  const metrics=[];if(a.band==='fesr')metrics.push(['Premialità preliminari',`${a.score?.preliminary_total??0} / 25`],['Merito stimato',a.score?.merit_total==null?'parziale':`${a.score.merit_total} / 75`],['Soglia merito','40 / 75'],['Contributo',a.score?.contribution_rate?`${a.score.contribution_rate}%`:'da verificare']);else metrics.push(['Ammissibilità',a.verdict?.eligibility_label||'da verificare'],['Rischio istruttorio',`${a.score?.internal_risk_index??0} / 100`],['Investimento',a.document?.investment_total!=null?fmt(a.document.investment_total):'n.d.'],['Punteggio ufficiale','non previsto']);$('metrics').innerHTML=metrics.map(([l,v])=>`<div class="metric"><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join('');
  const els=a.eligibility||[];$('eligibilityList').innerHTML=els.length?els.map(x=>`<div class="criterion"><div class="top"><b>${esc(x.criterion)}</b><span class="pill ${x.status==='ok'?'ok':x.status==='no'?'bad':'warn'}">${esc(x.status_label||x.status)}</span></div><p>${esc(x.reason)}</p>${x.evidence?`<p><strong>Evidenza:</strong> ${esc(x.evidence)}</p>`:''}${x.rule_reference?`<p><strong>Rif.:</strong> ${esc(x.rule_reference)}</p>`:''}</div>`).join(''):'<div class="empty">Nessun requisito strutturato restituito.</div>';renderScore(a);
  const findings=[...(a.findings||[])].sort((x,y)=>(severityRank[y.severity]||0)-(severityRank[x.severity]||0));$('noFindings').hidden=!!findings.length;$('findingsList').innerHTML=findings.map(f=>`<div class="finding severity-${esc(f.severity)}"><div class="top"><b>${esc(f.title)}</b><span class="pill ${['critical','high'].includes(f.severity)?'bad':f.severity==='medium'?'warn':'ok'}">${esc((f.severity||'').toUpperCase())}</span></div><p><strong>${esc(f.type_label||f.type||'Criticità')}:</strong> ${esc(f.detail)}</p>${f.evidence?`<p><strong>Evidenza:</strong> “${esc(f.evidence)}”</p>`:''}${f.rule_reference?`<p><strong>Rif. bando:</strong> ${esc(f.rule_reference)}</p>`:''}${f.estimated_cut_eur!=null?`<p><strong>Taglio potenziale indicativo:</strong> ${fmt(f.estimated_cut_eur)}</p>`:''}<p class="fix"><strong>Come correggerla:</strong> ${esc(f.suggested_fix)}</p></div>`).join('');
  const actions=a.priority_actions||[];$('actionsList').innerHTML=actions.length?actions.map((x,i)=>`<div class="criterion"><div class="top"><b>${i+1}. ${esc(x.title)}</b><span class="pill ${x.priority==='alta'?'bad':x.priority==='media'?'warn':'ok'}">${esc((x.priority||'').toUpperCase())}</span></div><p>${esc(x.action)}</p>${x.expected_effect?`<p><strong>Effetto atteso:</strong> ${esc(x.expected_effect)}</p>`:''}</div>`).join(''):'<div class="empty">Nessuna azione prioritaria proposta.</div>';$('rewritePanel').classList.remove('show');state.rewrite=null
}
function renderScore(a){
  if(a.band==='fesr'){const s=a.score||{};$('scoreBox').innerHTML=`<table class="score-table"><tr><td>A1 · Impresa artigiana</td><td>${s.artigiana_points??0} / 10</td></tr><tr><td>A2 · Area Interna</td><td>${s.area_interna_points??0} / 10</td></tr><tr><td>A3 · ESG / ambientale</td><td>${s.esg_points??0} / 5</td></tr><tr><td><b>Preliminare</b></td><td><b>${s.preliminary_total??0} / 25</b></td></tr><tr><td>A · Innovatività</td><td>${s.merit_a??'—'} / 35</td></tr><tr><td>B · Ricadute</td><td>${s.merit_b??'—'} / 20</td></tr><tr><td>C · Quota privata</td><td>${s.merit_c??'—'} / 20</td></tr><tr><td><b>Merito stimato</b></td><td><b>${s.merit_total==null?'da completare':s.merit_total+' / 75'}</b></td></tr></table><p class="empty">A e B sono una stima istruttoria sul contenuto documentato. C è ricalcolato dal motore sulla percentuale di contributo: 40%=20, 45%=17, 50%=14, 55%=11, 60%=8, 65%=5, 70%=2.</p>`}else{const s=a.score||{};$('scoreBox').innerHTML=`<table class="score-table"><tr><td>Indice rischio interno</td><td>${s.internal_risk_index??0} / 100</td></tr><tr><td>Blocchi potenziali</td><td>${s.blocking_issues??0}</td></tr><tr><td>Voci da verificare</td><td>${s.warning_issues??0}</td></tr><tr><td>Possibili tagli</td><td>${s.potential_cuts??0}</td></tr></table><p class="empty">Il Voucher CCIAA non usa una graduatoria di merito come il FESR: questo è un indicatore interno Metallufficio, non un punteggio ufficiale.</p>`}
}
async function rewriteProject(){
  if(!state.analysis||!state.file)return;setBusy(true,'Rigenerazione del progetto…');try{const payload={action:'rewrite',bando:selectedBando(),fileName:state.file.name,fileType:state.type,documentText:state.text,paragraphs:state.type==='docx'?state.paragraphs.slice(0,1200):[],analysis:state.analysis};const res=await fetch('/api/valuta-progetto',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||`Errore ${res.status}`);state.rewrite=data.rewrite;renderRewrite(state.rewrite);$('rewritePanel').classList.add('show');$('rewritePanel').scrollIntoView({behavior:'smooth',block:'start'})}catch(err){console.error(err);alert(err.message||'Errore durante la rigenerazione.')}finally{setBusy(false)}
}
function renderRewrite(r){$('rewriteNote').textContent=r.note||'';$('rewriteSections').innerHTML=(r.sections||[]).map(s=>`<div class="rewrite-section"><b>${esc(s.title)}</b><p>${esc(s.text)}</p></div>`).join('')||'<div class="empty">Nessuna sezione rigenerata.</div>';$('downloadDocxBtn').hidden=!(state.type==='docx'&&(r.docx_edits||[]).length);$('printRewriteBtn').hidden=state.type==='docx'}
async function downloadRevisedDocx(){
  if(!state.buffer||state.type!=='docx'||!state.rewrite)return;const edits=state.rewrite.docx_edits||[];if(!edits.length)return;const zip=await window.JSZip.loadAsync(state.buffer);const file=zip.file('word/document.xml');if(!file)throw new Error('document.xml non trovato');const xml=await file.async('string');const doc=new DOMParser().parseFromString(xml,'application/xml');const ps=[...doc.getElementsByTagNameNS('*','p')];
  for(const e of edits){const p=ps[Number(e.paragraph_index)];if(!p)continue;const texts=[...p.getElementsByTagNameNS('*','t')];if(!texts.length)continue;texts[0].textContent=String(e.replacement_text||'').replace(/\s*\n\s*/g,' ');texts[0].setAttribute('xml:space','preserve');for(let i=1;i<texts.length;i++)texts[i].textContent=''}
  zip.file('word/document.xml',new XMLSerializer().serializeToString(doc));const blob=await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=state.file.name.replace(/\.docx$/i,'')+'_REVISIONATO.docx';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)
}
function openPrintableRewrite(){
  if(!state.rewrite)return;const w=window.open('','_blank');if(!w){alert('Consenti i popup per aprire la versione stampabile.');return}const sections=state.rewrite.sections||[];w.document.write(`<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Progetto revisionato</title><style>@page{size:A4;margin:15mm}body{font-family:Arial,sans-serif;color:#111;line-height:1.5}header{border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:22px}header img{width:210px}h1{font-size:22px}h2{font-size:15px;margin-top:22px}p{white-space:pre-wrap}.note{font-size:10px;color:#666;border:1px solid #ddd;padding:9px;margin:12px 0}</style></head><body><header><img src="metallufficio-logo.jpeg"><h1>Progetto revisionato · ${esc(state.file?.name||'')}</h1></header><div class="note">Versione ricostruita dal contenuto del PDF originale. La struttura testuale viene mantenuta per quanto possibile, ma non è una copia grafica pixel-per-pixel del PDF ricevuto.</div>${sections.map(s=>`<section><h2>${esc(s.title)}</h2><p>${esc(s.text)}</p></section>`).join('')}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);w.document.close()
}