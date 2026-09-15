(()=>{
  'use strict';

  const q=id=>document.getElementById(id);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const MAX_TEXT=300000;
  let revised=null;

  const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const freshBytes=async file=>new Uint8Array(await file.arrayBuffer());
  const copyBytes=bytes=>new Uint8Array(bytes);
  const mimeFor=type=>type==='pdf'?'application/pdf':type==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const revisedName=(name,type)=>name.replace(/\.(pdf|docx|xlsx)$/i,'')+`_REVISIONATO.${type}`;

  // PDF.js può trasferire/detach l'ArrayBuffer ricevuto al worker. Leggiamo sempre
  // una copia nuova dal File, così il buffer originale non viene mai riutilizzato.
  parsePdf=async function(){
    const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
    const bytes=await freshBytes(state.file);
    const pdf=await pdfjs.getDocument({data:bytes}).promise;
    const pages=[];
    for(let i=1;i<=pdf.numPages;i++){
      const page=await pdf.getPage(i);
      const tc=await page.getTextContent();
      const text=tc.items.map(x=>x.str||'').join(' ').replace(/\s+/g,' ').trim();
      pages.push(`=== PAGINA ${i} / ${pdf.numPages} ===\n${text}`);
      if(pages.join('\n').length>MAX_TEXT)break;
    }
    state.text=pages.join('\n\n').slice(0,MAX_TEXT);
  };

  parseDocx=async function(){
    const raw=await state.file.arrayBuffer();
    const zip=await window.JSZip.loadAsync(raw);
    const xml=await zip.file('word/document.xml')?.async('string');
    if(!xml)throw new Error('document.xml non trovato');
    const doc=new DOMParser().parseFromString(xml,'application/xml');
    const ps=[...doc.getElementsByTagNameNS('*','p')];
    state.paragraphs=ps.map((p,index)=>{
      const texts=[...p.getElementsByTagNameNS('*','t')].map(t=>t.textContent||'');
      return{index,text:texts.join('')};
    }).filter(p=>p.text.trim());
    state.text=state.paragraphs.map(p=>`[P${p.index}] ${p.text}`).join('\n').slice(0,MAX_TEXT);
  };

  directFileFallback=async function(){
    if(!state.file||state.type!=='pdf'||state.file.size>3*1024*1024||state.text.trim().length>=80)return null;
    const bytes=await freshBytes(state.file);
    let binary='';
    const chunk=0x8000;
    for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
    return btoa(binary);
  };

  function setRewriteProgress(show,pct,text,kind='working'){
    const box=q('rewriteProgress'),bar=q('rewriteProgressBar'),label=q('rewriteProgressText');
    if(!box)return;
    box.classList.toggle('show',show);
    box.classList.remove('success','error');
    if(kind==='success')box.classList.add('success');
    if(kind==='error')box.classList.add('error');
    if(bar)bar.style.width=`${Math.max(0,Math.min(100,pct))}%`;
    if(label)label.textContent=text||'';
  }

  async function pollJob(jobId,label){
    const started=Date.now();let attempts=0;
    while(Date.now()-started<14*60*1000){
      attempts++;
      await sleep(attempts<4?1400:2600);
      const elapsed=Math.round((Date.now()-started)/1000);
      const pct=Math.min(92,16+Math.round(Math.min(elapsed,150)/150*76));
      setRewriteProgress(true,pct,`${label} · ${elapsed}s${elapsed>20?' · controllo approfondito in corso':''}`);
      const res=await fetch(`/api/valutatore-job?id=${encodeURIComponent(jobId)}`,{cache:'no-store'});
      if(res.status===404)continue;
      const data=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(data.error||`Errore stato job ${res.status}`);
      if(data.status==='done')return data.result||{};
      if(data.status==='error')throw new Error(data.error||'Errore durante la rigenerazione AI');
    }
    throw new Error('Rigenerazione ancora in corso oltre il tempo massimo della pagina');
  }

  async function submitRewrite(payload){
    const jobId=crypto.randomUUID().replace(/-/g,'');
    payload.jobId=jobId;
    const endpoint=state.type==='docx'?'/api/valuta-progetto-async':'/api/valuta-template-async';
    setRewriteProgress(true,8,'Preparazione del template originale…');
    const res=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
    if(!(res.ok||res.status===202)){
      const data=await res.json().catch(()=>({}));
      throw new Error(data.error||`Errore avvio rigenerazione ${res.status}`);
    }
    setRewriteProgress(true,14,'Progetto inviato al motore di revisione…');
    return pollJob(jobId,'Generazione delle correzioni');
  }

  function issueCards(){
    const items=[...(state.analysis?.findings||[])].sort((a,b)=>({critical:4,high:3,medium:2,low:1}[b.severity]||0)-({critical:4,high:3,medium:2,low:1}[a.severity]||0));
    if(!items.length)return'<div class="preview-empty">Nessuna criticità strutturata da mostrare.</div>';
    return items.map((x,i)=>`<article class="preview-card issue"><div class="preview-top"><b>${i+1}. ${escapeHtml(x.title||'Criticità')}</b><span>${escapeHtml((x.severity||'').toUpperCase())}</span></div><p>${escapeHtml(x.detail||'')}</p>${x.evidence?`<small><strong>Evidenza:</strong> ${escapeHtml(x.evidence)}</small>`:''}${x.suggested_fix?`<small><strong>Correzione attesa:</strong> ${escapeHtml(x.suggested_fix)}</small>`:''}</article>`).join('');
  }

  function editCards(){
    const docx=state.rewrite?.docx_edits||[];
    const tpl=state.rewrite?.template_edits||[];
    const items=docx.length?docx:tpl;
    if(!items.length){
      const sections=state.rewrite?.sections||[];
      if(!sections.length)return'<div class="preview-empty">Nessuna modifica puntuale restituita.</div>';
      return sections.map((s,i)=>`<article class="preview-card change"><div class="preview-top"><b>${i+1}. ${escapeHtml(s.title||'Sezione')}</b><span>RISCRITTA</span></div><p>${escapeHtml(s.text||'')}</p></article>`).join('');
    }
    return items.map((e,i)=>{
      const locator=state.type==='docx'?`Paragrafo P${e.paragraph_index}`:state.type==='xlsx'?`${e.sheet_name||'Foglio'} · ${e.cell||'cella'}`:`Pagina ${e.page_number||'?'}`;
      return`<article class="preview-card change"><div class="preview-top"><b>${i+1}. ${escapeHtml(locator)}</b><span>MODIFICA</span></div>${e.original_excerpt?`<div class="before"><strong>Prima</strong><p>${escapeHtml(e.original_excerpt)}</p></div>`:''}<div class="after"><strong>Dopo</strong><p>${escapeHtml(e.replacement_text||'')}</p></div>${e.reason?`<small><strong>Perché:</strong> ${escapeHtml(e.reason)}</small>`:''}</article>`;
    }).join('');
  }

  function renderComparison(){
    const left=q('rewriteIssuesPreview'),right=q('rewriteChangesPreview');
    if(left)left.innerHTML=issueCards();
    if(right)right.innerHTML=editCards();
    const count=q('rewriteChangeCount');
    if(count){const n=(state.rewrite?.docx_edits||state.rewrite?.template_edits||[]).length;count.textContent=`${n} modifiche puntuali generate`}
  }

  async function buildRevisedDocx(){
    const edits=state.rewrite?.docx_edits||[];
    if(!edits.length)throw new Error('La revisione non contiene modifiche DOCX applicabili');
    const zip=await JSZip.loadAsync(await state.file.arrayBuffer());
    const file=zip.file('word/document.xml');
    if(!file)throw new Error('document.xml non trovato nel DOCX');
    const xml=await file.async('string');
    const doc=new DOMParser().parseFromString(xml,'application/xml');
    const ps=[...doc.getElementsByTagNameNS('*','p')];
    let applied=0;
    for(const e of edits){
      const p=ps[Number(e.paragraph_index)];if(!p)continue;
      const texts=[...p.getElementsByTagNameNS('*','t')];if(!texts.length)continue;
      texts[0].textContent=String(e.replacement_text||'').replace(/\s+/g,' ').trim();
      texts[0].setAttribute('xml:space','preserve');
      for(let i=1;i<texts.length;i++)texts[i].textContent='';
      applied++;
    }
    if(!applied)throw new Error('Nessuna modifica DOCX ha trovato il paragrafo originale');
    zip.file('word/document.xml',new XMLSerializer().serializeToString(doc));
    return new Uint8Array(await zip.generateAsync({type:'arraybuffer',mimeType:mimeFor('docx')}));
  }

  async function sheetPathMap(zip){
    const wbxml=await zip.file('xl/workbook.xml')?.async('string');
    const relxml=await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
    if(!wbxml||!relxml)throw new Error('Struttura XLSX non valida');
    const wbd=new DOMParser().parseFromString(wbxml,'application/xml');
    const reld=new DOMParser().parseFromString(relxml,'application/xml');
    const rels={};
    [...reld.getElementsByTagNameNS('*','Relationship')].forEach(r=>rels[r.getAttribute('Id')]=r.getAttribute('Target'));
    const map={};
    [...wbd.getElementsByTagNameNS('*','sheet')].forEach(s=>{
      const name=s.getAttribute('name');
      const rid=s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')||s.getAttribute('r:id');
      let target=rels[rid];
      if(target){target=target.replace(/^\/?/,'');if(!target.startsWith('xl/'))target='xl/'+target.replace(/^\.\.\//,'');map[name]=target}
    });
    return map;
  }

  function setCellInlineString(doc,addr,text){
    const c=[...doc.getElementsByTagNameNS('*','c')].find(x=>x.getAttribute('r')===addr);if(!c)return false;
    [...c.childNodes].forEach(n=>{if(['v','is','f'].includes(n.localName||n.nodeName?.split(':').pop()))c.removeChild(n)});
    c.setAttribute('t','inlineStr');
    const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const is=doc.createElementNS(ns,'is'),t=doc.createElementNS(ns,'t');
    t.setAttribute('xml:space','preserve');t.textContent=String(text||'');is.appendChild(t);c.appendChild(is);return true;
  }

  async function buildRevisedXlsx(){
    const edits=state.rewrite?.template_edits||[];
    if(!edits.length)throw new Error('La revisione non contiene modifiche Excel applicabili');
    const zip=await JSZip.loadAsync(await state.file.arrayBuffer());
    const map=await sheetPathMap(zip);let applied=0;
    for(const e of edits){
      if(e.kind!=='xlsx'||!e.sheet_name||!e.cell)continue;
      const path=map[e.sheet_name],f=path&&zip.file(path);if(!f)continue;
      const xml=await f.async('string');const doc=new DOMParser().parseFromString(xml,'application/xml');
      if(setCellInlineString(doc,String(e.cell),e.replacement_text)){zip.file(path,new XMLSerializer().serializeToString(doc));applied++}
    }
    if(!applied)throw new Error('Nessuna modifica Excel ha trovato la cella originale');
    return new Uint8Array(await zip.generateAsync({type:'arraybuffer',mimeType:mimeFor('xlsx')}));
  }

  const norm=s=>String(s||'').replace(/\s+/g,' ').trim().toLowerCase();
  function wrapText(text,font,size,maxWidth){
    const words=String(text||'').split(/\s+/);const out=[];let line='';
    for(const w of words){const test=line?line+' '+w:w;if(font.widthOfTextAtSize(test,size)<=maxWidth)line=test;else{if(line)out.push(line);line=w}}
    if(line)out.push(line);return out;
  }
  function findTextBlock(items,target){
    const t=norm(target).slice(0,180);if(!t)return null;
    for(let i=0;i<items.length;i++){
      let acc='';
      for(let j=i;j<Math.min(items.length,i+28);j++){
        acc+=(acc?' ':'')+(items[j].str||'');
        const n=norm(acc);
        if(n.includes(t)||t.includes(n.slice(0,Math.min(55,n.length)))){
          if(n.length>=Math.min(t.length,40))return{start:i,end:j};
        }
      }
    }
    return null;
  }

  async function buildRevisedPdf(){
    const edits=state.rewrite?.template_edits||[];
    if(!edits.length)throw new Error('La revisione non contiene modifiche PDF applicabili');
    const {PDFDocument,StandardFonts,rgb}=PDFLib;
    const original=await freshBytes(state.file);
    const pdf=await PDFDocument.load(copyBytes(original));
    const font=await pdf.embedFont(StandardFonts.Helvetica);
    const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
    const src=await pdfjs.getDocument({data:copyBytes(original)}).promise;
    let applied=0;
    for(const e of edits){
      if(e.kind!=='pdf'||!e.page_number)continue;
      const pno=Number(e.page_number);if(pno<1||pno>src.numPages||pno>pdf.getPageCount())continue;
      const sourcePage=await src.getPage(pno),tc=await sourcePage.getTextContent(),items=tc.items.filter(x=>x.str);
      const hit=findTextBlock(items,e.original_excerpt);if(!hit)continue;
      const block=items.slice(hit.start,hit.end+1);const page=pdf.getPage(pno-1);
      const xs=block.map(it=>Number(it.transform?.[4]||0));
      const ys=block.map(it=>Number(it.transform?.[5]||0));
      const widths=block.map(it=>Number(it.width||0));
      const heights=block.map(it=>Math.max(7,Number(it.height||Math.abs(it.transform?.[0]||9))));
      const x1=Math.max(18,Math.min(...xs)-2),x2=Math.min(page.getWidth()-18,Math.max(...block.map((it,k)=>xs[k]+widths[k]))+3);
      const y1=Math.max(18,Math.min(...block.map((it,k)=>ys[k]-heights[k]*.35))-3),y2=Math.min(page.getHeight()-18,Math.max(...block.map((it,k)=>ys[k]+heights[k]))+3);
      const boxW=Math.max(120,x2-x1),boxH=Math.max(16,y2-y1);
      let size=Math.max(6.2,Math.min(11.5,Math.max(...heights)));
      let lines=wrapText(e.replacement_text,font,size,boxW-4);
      while(size>6.2&&lines.length*size*1.16>boxH){size-=.35;lines=wrapText(e.replacement_text,font,size,boxW-4)}
      // Non allarghiamo il blocco originale: se il testo è troppo lungo, lo riduciamo.
      while(size>5.2&&lines.length*size*1.12>boxH){size-=.25;lines=wrapText(e.replacement_text,font,size,boxW-4)}
      page.drawRectangle({x:x1,y:y1,width:boxW,height:boxH,color:rgb(1,1,1)});
      const startY=y2-size*1.02;
      lines.forEach((ln,k)=>page.drawText(ln,{x:x1+1.5,y:startY-k*size*1.12,size,font,color:rgb(.05,.05,.06)}));
      applied++;
    }
    if(!applied)throw new Error('Nessuna modifica PDF ha trovato il testo originale. Il PDF potrebbe avere testo frammentato o essere una scansione.');
    return new Uint8Array(await pdf.save());
  }

  async function makeRevised(){
    if(revised&&revised.sourceName===state.file?.name&&revised.sourceType===state.type)return revised;
    let bytes;
    if(state.type==='docx')bytes=await buildRevisedDocx();
    else if(state.type==='xlsx')bytes=await buildRevisedXlsx();
    else if(state.type==='pdf')bytes=await buildRevisedPdf();
    else throw new Error('Formato non supportato');
    revised={bytes:copyBytes(bytes),type:state.type,name:revisedName(state.file.name,state.type),sourceName:state.file.name,sourceType:state.type};
    return revised;
  }

  async function downloadRevised(type){
    const r=await makeRevised();if(r.type!==type&&!(type==='office'&&['docx','xlsx'].includes(r.type)))return;
    const blob=new Blob([copyBytes(r.bytes)],{type:mimeFor(r.type)}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=r.name;document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(url);a.remove()},8000);
  }

  async function loadExcelSafe(file){
    if(!window.XLSX)throw new Error('Modulo Excel non disponibile');
    state.file=file;state.type='xlsx';state.buffer=await file.arrayBuffer();
    const wb=XLSX.read(copyBytes(await freshBytes(file)),{type:'array',cellStyles:true,cellFormula:true,cellDates:true});
    state.excelWorkbook=wb;
    const lines=[];
    for(const name of wb.SheetNames){const ws=wb.Sheets[name];lines.push(`=== FOGLIO: ${name} ===`);for(const addr of Object.keys(ws)){if(addr[0]==='!')continue;const c=ws[addr];if(c==null||c.v==null||String(c.v).trim()==='')continue;lines.push(`[SHEET:${name}][${addr}] ${String(c.w??c.v).replace(/\s+/g,' ').trim()}`)}}
    state.text=lines.join('\n').slice(0,MAX_TEXT);state.paragraphs=[];state.analysis=null;state.rewrite=null;
    q('fileName').textContent=file.name;q('fileMeta').textContent=`XLSX · ${(file.size/1024).toFixed(0)} KB · ${wb.SheetNames.length} fogli`;q('fileInfo').classList.add('show');q('parseNotice').className='notice';q('parseNotice').textContent=`Versione revisionata caricata: ${wb.SheetNames.length} fogli.`;q('analyzeBtn').disabled=false;q('results').classList.remove('show');q('rewritePanel').classList.remove('show');
  }

  async function reanalyze(){
    try{
      setRewriteProgress(true,96,'Preparazione della versione revisionata per il nuovo controllo…');
      const r=await makeRevised();
      const file=new File([copyBytes(r.bytes)],r.name,{type:mimeFor(r.type)});
      revised=null;
      if(r.type==='xlsx')await loadExcelSafe(file);else await loadFile(file);
      setRewriteProgress(false,0,'');
      q('analyzeBtn').click();
    }catch(err){console.error(err);setRewriteProgress(true,100,err.message||'Errore rianalisi','error');alert(err.message||'Errore durante la rianalisi')}
  }

  async function rewrite(){
    if(!state.analysis||!state.file)return;
    const btn=q('rewriteBtn'),analyze=q('analyzeBtn');btn.disabled=true;if(analyze)analyze.disabled=true;revised=null;
    try{
      const payload={action:'rewrite',bando:selectedBando(),fileName:state.file.name,fileType:state.type,documentText:state.text,paragraphs:state.type==='docx'?state.paragraphs.slice(0,1200):[],analysis:state.analysis};
      const result=await submitRewrite(payload);
      if(!result.rewrite)throw new Error('Il job è terminato senza una versione revisionata valida');
      state.rewrite=result.rewrite;
      renderRewrite(state.rewrite);
      q('rewritePanel').classList.add('show');
      renderComparison();
      const office=q('downloadDocxBtn'),pdf=q('printRewriteBtn'),rean=q('reanalyzeBtn');
      if(office){office.hidden=!['docx','xlsx'].includes(state.type);office.textContent=state.type==='xlsx'?'SCARICA XLSX REVISIONATO':'SCARICA DOCX REVISIONATO'}
      if(pdf){pdf.hidden=state.type!=='pdf';pdf.textContent='SCARICA PDF REVISIONATO'}
      if(rean)rean.hidden=false;
      setRewriteProgress(true,100,'Versione migliorata pronta · controlla le modifiche qui sotto','success');
      q('rewritePanel').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(err){console.error(err);setRewriteProgress(true,100,err.message||'Errore durante la rigenerazione','error');alert(err.message||'Errore durante la rigenerazione')}
    finally{btn.disabled=false;if(analyze)analyze.disabled=false}
  }

  function replaceButton(id,handler){
    const old=q(id);if(!old)return null;
    const fresh=old.cloneNode(true);old.replaceWith(fresh);fresh.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();handler(e)});return fresh;
  }

  // Rimuove i listener legacy sovrapposti e lascia un solo controller per la rigenerazione.
  replaceButton('rewriteBtn',rewrite);
  replaceButton('downloadDocxBtn',async()=>{try{await downloadRevised('office')}catch(err){console.error(err);alert(err.message||'Errore download')}});
  replaceButton('printRewriteBtn',async()=>{try{await downloadRevised('pdf')}catch(err){console.error(err);alert(err.message||'Errore download PDF')}});
  replaceButton('reanalyzeBtn',reanalyze);

  q('fileInput')?.addEventListener('change',()=>{revised=null},true);
  q('excelFileInput')?.addEventListener('change',()=>{revised=null},true);
  q('removeFile')?.addEventListener('click',()=>{revised=null;setRewriteProgress(false,0,'')},true);
})();