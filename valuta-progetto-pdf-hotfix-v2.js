(()=>{
  'use strict';
  const q=id=>document.getElementById(id);
  let latestPdfBytes=null;
  let latestSourceName='';

  function injectFixStyle(){
    if(document.getElementById('valutatoreHotfixStyle'))return;
    const s=document.createElement('style');
    s.id='valutatoreHotfixStyle';
    s.textContent='[hidden]{display:none!important}';
    document.head.appendChild(s);
  }

  function setHidden(el,value){
    if(el && el.hidden!==value) el.hidden=value;
  }

  function syncButtons(){
    const docx=q('downloadDocxBtn'),pdf=q('printRewriteBtn');
    if(!docx||!pdf||typeof state==='undefined')return;
    const t=state?.type;
    if(t==='pdf'){
      setHidden(docx,true);
      setHidden(pdf,false);
      pdf.textContent='SCARICA PDF REVISIONATO';
    }else if(t==='docx'){
      setHidden(docx,false);
      docx.textContent='SCARICA DOCX REVISIONATO';
      setHidden(pdf,true);
    }else if(t==='xlsx'){
      setHidden(docx,false);
      docx.textContent='SCARICA XLSX REVISIONATO';
      setHidden(pdf,true);
    }else{
      setHidden(docx,true);setHidden(pdf,true);
    }
  }

  function winAnsiSafe(text,font){
    let s=String(text??'')
      .replace(/\u00a0/g,' ')
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g,'-')
      .replace(/[\u2018\u2019\u201a\u201b]/g,"'")
      .replace(/[\u201c\u201d\u201e\u201f]/g,'"')
      .replace(/\u2026/g,'...')
      .replace(/[\u2022\u2023\u2043\u25aa\u25ab\u25cf\u25cb\u25a0\u25a1\u25e6]/g,'-')
      .replace(/[\u2192\u21d2]/g,'->')
      .replace(/[\u2190\u21d0]/g,'<-')
      .replace(/\u20ac/g,'EUR ')
      .replace(/[\u200b\u200c\u200d\ufeff]/g,'');
    let out='';
    for(const ch of s){
      try{font.encodeText(ch);out+=ch;continue}catch{}
      const fallback=ch.normalize('NFKD').replace(/[\u0300-\u036f]/g,'');
      let added=false;
      for(const c of fallback){
        try{font.encodeText(c);out+=c;added=true}catch{}
      }
      if(!added)out+='?';
    }
    return out.replace(/\s+/g,' ').trim();
  }

  const norm=s=>String(s||'').replace(/\s+/g,' ').trim().toLowerCase();
  function findTextBlock(items,target){
    const t=norm(target).slice(0,180);if(!t)return null;
    for(let i=0;i<items.length;i++){
      let acc='';
      for(let j=i;j<Math.min(items.length,i+30);j++){
        acc+=(acc?' ':'')+(items[j].str||'');
        const n=norm(acc);
        if(n.includes(t)||t.includes(n.slice(0,Math.min(55,n.length)))){
          if(n.length>=Math.min(t.length,40))return{start:i,end:j};
        }
      }
    }
    return null;
  }

  function wrapText(text,font,size,maxWidth){
    const words=String(text||'').split(/\s+/).filter(Boolean),out=[];let line='';
    for(const word of words){
      const test=line?line+' '+word:word;
      let width=Infinity;
      try{width=font.widthOfTextAtSize(test,size)}catch{width=Infinity}
      if(width<=maxWidth)line=test;
      else{
        if(line)out.push(line);
        let part='';
        for(const ch of word){
          const next=part+ch;
          let w=Infinity;try{w=font.widthOfTextAtSize(next,size)}catch{}
          if(w<=maxWidth)part=next;else{if(part)out.push(part);part=ch}
        }
        line=part;
      }
    }
    if(line)out.push(line);
    return out;
  }

  async function buildSafePdf(){
    if(state?.type!=='pdf')throw new Error('Il file corrente non è un PDF');
    const edits=state.rewrite?.template_edits||[];
    if(!edits.length)throw new Error('La revisione non contiene modifiche PDF applicabili');
    if(!window.PDFLib)throw new Error('Modulo PDF non disponibile. Ricarica la pagina.');
    const {PDFDocument,StandardFonts,rgb}=PDFLib;
    const original=new Uint8Array(await state.file.arrayBuffer());
    const pdf=await PDFDocument.load(new Uint8Array(original));
    const font=await pdf.embedFont(StandardFonts.Helvetica);
    const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
    const src=await pdfjs.getDocument({data:new Uint8Array(original)}).promise;
    let applied=0;
    for(const e of edits){
      if(e.kind!=='pdf'||!e.page_number)continue;
      const pno=Number(e.page_number);
      if(pno<1||pno>src.numPages||pno>pdf.getPageCount())continue;
      const srcPage=await src.getPage(pno);
      const tc=await srcPage.getTextContent();
      const items=tc.items.filter(x=>x.str);
      const hit=findTextBlock(items,e.original_excerpt);if(!hit)continue;
      const block=items.slice(hit.start,hit.end+1),page=pdf.getPage(pno-1);
      const xs=block.map(it=>Number(it.transform?.[4]||0));
      const ys=block.map(it=>Number(it.transform?.[5]||0));
      const widths=block.map(it=>Number(it.width||0));
      const heights=block.map(it=>Math.max(7,Number(it.height||Math.abs(it.transform?.[0]||9))));
      const x1=Math.max(18,Math.min(...xs)-2);
      const x2=Math.min(page.getWidth()-18,Math.max(...block.map((it,k)=>xs[k]+widths[k]))+4);
      const yBottom=Math.max(12,Math.min(...ys)-Math.max(...heights)*.45-3);
      const yTop=Math.min(page.getHeight()-12,Math.max(...ys)+Math.max(...heights)*1.15+3);
      const rectH=Math.max(14,yTop-yBottom),maxWidth=Math.max(80,x2-x1);
      const clean=winAnsiSafe(e.replacement_text,font);if(!clean)continue;
      let size=Math.max(6.2,Math.min(10.5,Math.max(...heights)*.95));
      let lines=wrapText(clean,font,size,maxWidth);
      while(size>5.4&&lines.length*size*1.12>rectH){size-=.35;lines=wrapText(clean,font,size,maxWidth)}
      const lineHeight=size*1.12,needed=Math.max(rectH,lines.length*lineHeight+5),drawBottom=Math.max(8,yTop-needed);
      page.drawRectangle({x:x1,y:drawBottom,width:maxWidth,height:Math.min(needed,page.getHeight()-drawBottom-6),color:rgb(1,1,1)});
      let y=yTop-size;
      for(const line of lines){if(y<8)break;page.drawText(line,{x:x1+1,y,size,font,color:rgb(.04,.04,.05)});y-=lineHeight}
      applied++;
    }
    try{await src.destroy()}catch{}
    if(!applied)throw new Error('Non sono riuscito a localizzare nel PDF i testi da sostituire. Rigenera prima il progetto.');
    return new Uint8Array(await pdf.save());
  }

  function downloadBytes(bytes,name){
    const blob=new Blob([new Uint8Array(bytes)],{type:'application/pdf'}),url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(url);a.remove()},5000);
  }

  async function downloadPdf(){
    const btn=q('printRewriteBtn');if(btn)btn.disabled=true;
    try{
      const bytes=await buildSafePdf();latestPdfBytes=new Uint8Array(bytes);latestSourceName=state.file?.name||'';
      downloadBytes(bytes,(state.file?.name||'progetto.pdf').replace(/\.pdf$/i,'')+'_REVISIONATO.pdf');
      const re=q('reanalyzeBtn');if(re)re.hidden=false;
    }catch(err){console.error(err);alert('PDF revisionato: '+(err?.message||err))}
    finally{if(btn)btn.disabled=false;syncButtons()}
  }

  async function reanalyzePdf(){
    const btn=q('reanalyzeBtn');if(btn)btn.disabled=true;
    try{
      const bytes=(latestPdfBytes&&latestSourceName===state.file?.name)?new Uint8Array(latestPdfBytes):await buildSafePdf();
      const name=(state.file?.name||'progetto.pdf').replace(/\.pdf$/i,'')+'_REVISIONATO.pdf';
      const file=new File([new Uint8Array(bytes)],name,{type:'application/pdf'});
      await loadFile(file);
      requestAnimationFrame(()=>q('analyzeBtn')?.click());
    }catch(err){console.error(err);alert('Rianalisi PDF: '+(err?.message||err))}
    finally{if(btn)btn.disabled=false}
  }

  document.addEventListener('click',e=>{
    const pdf=e.target.closest?.('#printRewriteBtn');
    if(pdf&&state?.type==='pdf'){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();downloadPdf();return}
    const re=e.target.closest?.('#reanalyzeBtn');
    if(re&&state?.type==='pdf'){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();reanalyzePdf();return}
    const wrongDocx=e.target.closest?.('#downloadDocxBtn');
    if(wrongDocx&&state?.type==='pdf'){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();syncButtons()}
  },true);

  // Osserva solo l'apertura del pannello. Non osserva i pulsanti stessi: evita loop ricorsivi.
  const panel=q('rewritePanel');
  if(panel){
    const observer=new MutationObserver(()=>syncButtons());
    observer.observe(panel,{attributes:true,attributeFilter:['class']});
  }
  q('fileInput')?.addEventListener('change',()=>setTimeout(syncButtons,0),true);
  q('excelFileInput')?.addEventListener('change',()=>setTimeout(syncButtons,0),true);
  q('removeFile')?.addEventListener('click',()=>setTimeout(syncButtons,0),true);
  injectFixStyle();syncButtons();
})();