const $=id=>document.getElementById(id);
const normalize=s=>String(s||'').trim().toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’']/g,"'").replace(/\s+/g,' ');
const comuniIndex=Object.fromEntries(ALL_COMUNI.map(c=>[normalize(c),c]));
const areaIndex=Object.fromEntries(Object.entries(AREA_MAP).map(([c,a])=>[normalize(c),{comune:c,area:a}]));
const eur=v=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(Number(v)||0);
const num=(id,min=0,max=Infinity)=>{let v=parseFloat($(id)?.value||0);if(!Number.isFinite(v))v=0;return Math.min(max,Math.max(min,v))};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
let seq=0;

$('comuniAbruzzo').innerHTML=ALL_COMUNI.map(c=>`<option value="${esc(c)}"></option>`).join('');

function completeComune(){
  const raw=$('comune').value.trim(), n=normalize(raw);
  if(!raw)return;
  if(comuniIndex[n]){$('comune').value=comuniIndex[n];update();return}
  if(n.length>=3){const matches=ALL_COMUNI.filter(c=>normalize(c).startsWith(n));if(matches.length===1){$('comune').value=matches[0];update()}}
}
$('comune').addEventListener('blur',completeComune);

function productOptions(kind,selected=''){
  const list=productCatalog[kind]||productCatalog.all;
  return list.map(v=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${v||'— Nessuno —'}</option>`).join('');
}
function addItem(data={}){
  const id=++seq,rawStatus=data.status||'validate',kind=data.kind||'all';
  const status=rawStatus==='ok'?'include':rawStatus;
  const el=document.createElement('div');
  el.className='item';el.dataset.id=id;el.dataset.kind=kind;el.dataset.package=data.packageName||'';el.dataset.hyp=data.hyp?'1':'0';el.dataset.outputs=JSON.stringify(data.outputs||[]);
  el.innerHTML=`
    <div class="field desc"><label>Descrizione</label><input class="i-desc" id="d_${id}" value="${esc(data.desc||'Voce personalizzata da verificare')}"></div>
    <div class="field product"><label>Prodotto interno</label><select class="i-prod">${productOptions(kind,data.product||'')}</select></div>
    <div class="field"><label>Categoria</label><select class="i-cat" id="cat_${id}">
      <option value="A" ${data.cat==='A'?'selected':''}>A · Materiale</option><option value="B" ${data.cat==='B'?'selected':''}>B · Immateriale</option>
      <option value="C" ${data.cat==='C'?'selected':''}>C · Consulenza</option><option value="D" ${data.cat==='D'?'selected':''}>D · Perizia</option>
      <option value="E" ${data.cat==='E'?'selected':''}>E · Fideiussione</option><option value="S" ${data.cat==='S'?'selected':''}>S · Servizio da classificare</option>
      <option value="X" ${data.cat==='X'?'selected':''}>Non agevolabile</option></select></div>
    <div class="field"><label>Prezzo €</label><input class="i-price ${data.hyp?'hyp':''}" id="price_${id}" type="number" min="0" step="10" value="${Number(data.price)||0}"></div>
    <div class="field"><label>Mesi</label><input class="i-months" id="months_${id}" type="number" min="1" max="60" value="${Number(data.months)||1}"></div>
    <div class="field"><label>Pagamento</label><select class="i-pay" id="pay_${id}"><option value="once" ${data.pay==='once'?'selected':''}>Unica soluzione</option><option value="monthly" ${data.pay==='monthly'?'selected':''}>Mensile</option></select></div>
    <div class="field"><label>Trattamento FESR</label><select class="i-status status-${status}" id="status_${id}">
      <option value="include" ${status==='include'?'selected':''}>Includi</option>
      <option value="warn" ${status==='warn'?'selected':''}>Includi · da motivare</option>
      <option value="validate" ${status==='validate'?'selected':''}>Da validare · non conteggiare</option>
      <option value="exclude" ${status==='exclude'?'selected':''}>Escludi</option>
    </select></div>
    <div class="item-total"><b id="tot_${id}">€ 0</b><small id="formula_${id}"></small></div>
    <button class="remove" type="button" aria-label="Rimuovi">×</button>`;
  $('items').appendChild(el);
  el.querySelectorAll('input,select').forEach(x=>x.addEventListener('input',()=>{if(x.classList.contains('i-status'))x.className=`i-status status-${x.value}`;update()}));
  el.querySelector('.remove').addEventListener('click',()=>{el.remove();update()});
}
function itemData(){
  return [...document.querySelectorAll('.item')].map(el=>({
    el,id:el.dataset.id,kind:el.dataset.kind,packageName:el.dataset.package,hyp:el.dataset.hyp==='1',
    desc:el.querySelector('.i-desc').value.trim(),product:el.querySelector('.i-prod').value,cat:el.querySelector('.i-cat').value,
    price:Math.max(0,parseFloat(el.querySelector('.i-price').value)||0),months:Math.max(1,parseFloat(el.querySelector('.i-months').value)||1),
    pay:el.querySelector('.i-pay').value,status:el.querySelector('.i-status').value,outputs:JSON.parse(el.dataset.outputs||'[]')
  }));
}
function lineTotal(r){return r.pay==='monthly'?r.price*r.months:r.price}
function eligibleLineTotal(r,projectMonths){
  if(r.cat==='B'&&r.pay==='monthly')return r.price*Math.min(r.months,projectMonths);
  return lineTotal(r);
}
function isEligibleRow(r){return !['X','S'].includes(r.cat)&&['include','warn'].includes(r.status)}
function shortLabel(r){
  if(r.packageName)return r.packageName;
  const by={crm:'CRM / clienti',cassa:'Gestionale cassa',erp:'ERP / magazzino',ecommerce:'E-commerce',cyber:'Cybersecurity',backup:'Backup / storage',network:'Rete / Wi-Fi',cashlogy:'Automazione contante',analytics:'AI / analytics'};
  if(by[r.kind])return by[r.kind];if(r.cat==='C')return'Consulenza';if(r.cat==='D')return'Perizia';if(r.cat==='E')return'Fideiussione';
  return (r.desc||'Voce progetto').slice(0,34);
}
function selectedNeeds(){return [...document.querySelectorAll('#needs input:checked')].map(x=>x.value)}
function build(){
  const n=selectedNeeds();if(!n.length){flash('soluzioneCard');return}
  $('items').innerHTML='';n.forEach(k=>addItem(presets[k]));update();$('compositionCard').scrollIntoView({behavior:'smooth',block:'start'});
}
function currentConnect(){
  const level=$('cpack').value;if(level!=='full')return level;return $('cmode').value==='onsite'?'full_onsite':'full_remote'
}
function refreshConnect(){
  $('cmodeWrap').hidden=$('cpack').value!=='full';
  const p=connectPackages[currentConnect()];$('cprice').textContent=eur(p.price);$('cdesc').textContent=`${p.desc} Abbinato a: ${$('ctarget').value}.`;
}
function addConnect(){
  const p=connectPackages[currentConnect()],target=$('ctarget').value;
  addItem({kind:'connect',product:target,packageName:p.name,hyp:true,desc:`Servizi tecnici di configurazione e supporto operativo · ${p.name}`,cat:'S',price:p.price,months:1,pay:'once',status:'validate',outputs:['report attività svolte','checklist configurazioni','verbale di verifica tecnica']});
  update();$('compositionCard').scrollIntoView({behavior:'smooth',block:'start'});
}
function flash(target){
  const el=$(target);if(!el)return;
  el.scrollIntoView({behavior:'smooth',block:'center'});el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash');
  setTimeout(()=>el.classList.remove('flash'),1600);setTimeout(()=>{if(['INPUT','SELECT','BUTTON'].includes(el.tagName))el.focus({preventScroll:true})},350);
}
function alertHTML(a){
  const attr=a.target?` data-target="${esc(a.target)}" tabindex="0" role="button"`:'';
  return `<div class="alert ${a.type}"${attr}>${esc(a.text)}</div>`;
}
$('alerts').addEventListener('click',e=>{const a=e.target.closest('.alert[data-target]');if(a)flash(a.dataset.target)});
$('alerts').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.alert[data-target]')){e.preventDefault();flash(e.target.dataset.target)}});

function update(){
  const rows=itemData(), rate=parseInt($('rate').value,10)||55, cPts=ratePoints[rate]||0;
  const scoreA=num('scoreA',0,35),scoreB=num('scoreB',0,20),merit=scoreA+scoreB+cPts,needAB=Math.max(0,40-cPts);
  const comune=$('comune').value.trim(),area=areaIndex[normalize(comune)]||null,art=$('artigiana').value==='yes',esg=$('esg').value==='yes';
  const prelim=(art?10:0)+(area?10:0)+(esg?5:0),projectMonths=num('mesi',1,15),deminimisUsed=num('deminimis',0,999999999),deminimisLeft=Math.max(0,300000-deminimisUsed);
  const settoreCliente=$('settoreCliente').value,mercati=$('mercati').value==='yes',fatturato=num('fatturato',0,9999999999),incremento=num('incremento',0,999);

  let totalCommercial=0,eligibleDirect=0,abc=0,cons=0,perizia=0,fide=0;
  rows.forEach(r=>{
    const commercial=lineTotal(r), eligibleRow=isEligibleRow(r), eligibleLine=eligibleRow?eligibleLineTotal(r,projectMonths):0;
    totalCommercial+=commercial;eligibleDirect+=eligibleLine;
    if(eligibleRow&&['A','B','C'].includes(r.cat))abc+=eligibleLine;
    if(eligibleRow&&r.cat==='C')cons+=eligibleLine;
    if(eligibleRow&&r.cat==='D')perizia+=eligibleLine;
    if(eligibleRow&&r.cat==='E')fide+=eligibleLine;

    $('tot_'+r.id).textContent=eur(commercial);
    const formula=$('formula_'+r.id);
    if(r.pay==='monthly'){
      formula.textContent=`${eur(r.price)} × ${r.months} mesi`;
      if(r.cat==='B'&&r.months>projectMonths&&eligibleRow)formula.textContent+=` · agev. stimato ${eur(eligibleLine)} (${projectMonths} mesi)`;
    }else formula.textContent=r.price?'una tantum':'';

    r.el.classList.remove('eligible-row','warning-row','validate-row','exclude-row');
    if(r.cat==='X'||r.status==='exclude')r.el.classList.add('exclude-row');
    else if(r.cat==='S'||r.status==='validate')r.el.classList.add('validate-row');
    else if(r.status==='warn')r.el.classList.add('warning-row');
    else r.el.classList.add('eligible-row');
  });

  const indirect=$('indirect').checked?abc*.05:0;
  const eligible=eligibleDirect+indirect;
  const excludedCommercial=Math.max(0,totalCommercial-eligibleDirect);
  const rawGrant=eligible*(rate/100),grant=Math.max(0,Math.min(rawGrant,100000,deminimisLeft));
  const clientShare=Math.max(0,totalCommercial-grant);

  $('totalCommercial').textContent=eur(totalCommercial);
  $('eligibleSpend').textContent=eur(eligible);
  $('grant').textContent=eur(grant);
  $('clientShare').textContent=eur(clientShare);
  $('totalCommercialHint').textContent=eligibleDirect>0?`di cui ${eur(eligibleDirect)} conteggiati come spesa diretta FESR`:'somma delle voci di fornitura';
  const eligHintParts=['IVA esclusa'];
  if(excludedCommercial>0)eligHintParts.push(`${eur(excludedCommercial)} esclusi / da validare`);
  if(indirect>0)eligHintParts.push(`+ ${eur(indirect)} costi indiretti`);
  $('eligibleHint').textContent=eligHintParts.join(' · ');
  $('eligibleHint').className=excludedCommercial>0?'emphasis-warn':'';
  $('grantHint').textContent=`${rate}% · max €100.000 · de minimis residuo ${eur(deminimisLeft)}`;

  $('pArt').textContent=art?'10':'0';$('pArea').textContent=area?'10':'0';$('pEsg').textContent=esg?'5':'0';$('pPre').textContent=`${prelim} / 25`;
  $('pC').textContent=`${cPts} / 20`;$('pMerit').textContent=`${merit} / 75`;$('meter').style.width=`${Math.min(100,merit/75*100)}%`;
  $('needText').textContent=`Con il ${rate}% servono almeno ${needAB} punti complessivi in A+B per arrivare a 40/75.`;
  $('sidePre').textContent=`${prelim} / 25`;$('sideMerit').textContent=`${merit} / 75`;$('sideDeminimis').textContent=eur(deminimisLeft);

  const areaBox=$('areaResult');
  if(!comune){areaBox.className='auto-result';areaBox.textContent="Scrivi il Comune: il simulatore verifica anche l'eventuale Area Interna (+10 punti)."}
  else if(area){areaBox.className='auto-result ok';areaBox.textContent=`${area.comune}: Area Interna “${area.area}” → +10 punti preliminari.`}
  else if(comuniIndex[normalize(comune)]){areaBox.className='auto-result warn';areaBox.textContent=`${comune}: Comune abruzzese, ma non risulta nell'elenco delle Aree Interne → 0 punti A2.`}
  else{areaBox.className='auto-result warn';areaBox.textContent=`“${comune}” non corrisponde a un Comune abruzzese dell'elenco: verifica la sede/unità del progetto.`}

  const costs=rows.filter(r=>lineTotal(r)>0).map(r=>{
    let state='ok',stateLabel='FESR';
    if(r.cat==='X'||r.status==='exclude'){state='no';stateLabel='NO'}
    else if(r.cat==='S'||r.status==='validate'){state='warn';stateLabel='DA VALIDARE'}
    else if(r.status==='warn'){state='warn';stateLabel='DA MOTIVARE'}
    const commercial=lineTotal(r),eligibleLine=isEligibleRow(r)?eligibleLineTotal(r,projectMonths):0;
    return {label:shortLabel(r),total:commercial,hyp:r.hyp,state,stateLabel,eligibleLine};
  });
  $('costList').innerHTML=costs.length?costs.map(c=>{
    const detail=c.eligibleLine!==c.total&&c.eligibleLine>0?` · agev. ${eur(c.eligibleLine)}`:'';
    return `<div class="cost-line"><div class="cost-left"><span>${esc(c.label)}${c.hyp?' *':''}</span><span class="cost-badge ${c.state}">${c.stateLabel}</span></div><b>${eur(c.total)}${detail}</b></div>`;
  }).join(''):'<div class="cost-line"><span>Nessuna voce valorizzata</span><b>€ 0</b></div>';
  if(indirect>0)$('costList').insertAdjacentHTML('beforeend',`<div class="cost-line"><div class="cost-left"><span>Costi indiretti FESR 5%</span><span class="cost-badge fesr">FESR</span></div><b>${eur(indirect)}</b></div>`);

  const hasPricedRows=totalCommercial>0;
  const alerts=[];
  const reqs=[['beneficiario','Beneficiario ammissibile','beneficiario'],['abruzzo','Sede/unità in Abruzzo','abruzzo'],['registro','Iscrizione/attività','registro'],['settoreOk','Settore/attività','settoreOk'],['regolarita','Regolarità fiscale/contributiva e sicurezza','regolarita'],['difficolta','Assenza stato di difficoltà/procedure concorsuali','difficolta'],['periodoSpesa','Spese sostenute solo dopo la domanda','periodoSpesa']];
  reqs.forEach(([id,label,target])=>{const v=$(id).value;if(v==='check')alerts.push({type:'warn',text:`? ${label}: da verificare.`,target});if(v==='no')alerts.push({type:'bad',text:`✕ ${label}: requisito non soddisfatto.`,target});});
  if($('esg').value==='check')alerts.push({type:'warn',text:'? Certificazione ESG/ambientale da verificare.',target:'esg'});
  if(comune&&!comuniIndex[normalize(comune)])alerts.push({type:'warn',text:'? Comune non riconosciuto come Comune abruzzese.',target:'comune'});
  if(incremento>0)alerts.push({type:'warn',text:`? Obiettivo incremento fatturato ${incremento}%: deve essere prudente, misurabile e documentabile perché può incidere sul punteggio di merito.`,target:'incremento'});
  if(hasPricedRows&&scoreB>0&&!mercati&&incremento===0)alerts.push({type:'warn',text:`? Hai stimato B = ${scoreB}/20 ma non hai indicato nuovi mercati né incremento di fatturato: verifica la motivazione del punteggio.`,target:'scoreB'});

  if(hasPricedRows&&eligible<10000){
    const diff=excludedCommercial>0?` Il totale commerciale è ${eur(totalCommercial)}, ma ${eur(excludedCommercial)} non sono conteggiati come spesa diretta ammissibile.`:'';
    alerts.push({type:'bad',text:`✕ Spesa potenzialmente ammissibile ${eur(eligible)}: sotto il minimo di €10.000.${diff}`,target:'compositionCard'});
  }
  if(eligible>=10000)alerts.push({type:'ok',text:`✓ Spesa potenzialmente ammissibile ${eur(eligible)}: superata la soglia minima di €10.000.`});
  if(projectMonths>12)alerts.push({type:'warn',text:'? Durata oltre 12 mesi: serve una proroga autorizzata, massimo 3 mesi e una sola volta.',target:'mesi'});

  const consRows=rows.filter(r=>isEligibleRow(r)&&r.cat==='C');
  if(cons>0&&eligible>0&&cons>eligible*.10+.01)alerts.push({type:'bad',text:`✕ Consulenza ${eur(cons)}: supera il limite del 10% dell’investimento ammissibile stimato.`,target:consRows[0]?`price_${consRows[0].id}`:'compositionCard'});
  const pMax=Math.min(5000,eligible*.02),periziaRows=rows.filter(r=>r.cat==='D');
  if(perizia===0&&hasPricedRows)alerts.push({type:'warn',text:'? Perizia giurata non inserita: è richiesta in rendicontazione finale; valuta di prevederne il costo.',target:'addPerizia'});
  if(perizia>pMax+.01)alerts.push({type:'bad',text:`✕ Perizia ${eur(perizia)}: supera il limite stimato del 2% e/o €5.000 (max ${eur(pMax)}).`,target:periziaRows[0]?`price_${periziaRows[0].id}`:'compositionCard'});
  if($('advance').checked&&fide===0)alerts.push({type:'warn',text:'? Anticipazione selezionata ma fideiussione/polizza non inserita.',target:'addFide'});
  if(rawGrant>100000)alerts.push({type:'warn',text:'? Il contributo percentuale supera €100.000: il simulatore applica automaticamente il tetto del bando.',target:'rate'});
  if(rawGrant>deminimisLeft)alerts.push({type:'bad',text:`✕ Plafond de minimis residuo ${eur(deminimisLeft)} inferiore al contributo percentuale teorico.`,target:'deminimis'});
  if(hasPricedRows){if(merit<40)alerts.push({type:'bad',text:`✕ Merito stimato ${merit}/75: sotto la soglia minima di 40.`,target:'rate'});else alerts.push({type:'ok',text:`✓ Merito stimato ${merit}/75: sopra la soglia minima (stima interna).`});}

  rows.forEach(r=>{
    if(r.cat==='S')alerts.push({type:'warn',text:`? ${r.packageName||r.desc}: scegli una categoria FESR prima di provare a conteggiarlo.`,target:`cat_${r.id}`});
    else if(r.cat==='X'||r.status==='exclude'){}
    else if(r.status==='validate')alerts.push({type:'warn',text:`? “${r.desc}” è da validare e al momento NON entra nella spesa ammissibile.`,target:`status_${r.id}`});
    else if(r.status==='warn')alerts.push({type:'warn',text:`? “${r.desc}” è conteggiato, ma va motivato come direttamente funzionale al progetto.`,target:`status_${r.id}`});
    if(r.cat==='B'&&r.pay==='monthly'&&r.months>projectMonths&&isEligibleRow(r))alerts.push({type:'warn',text:`? Canone “${r.desc}”: ${r.months} mesi commerciali, ma il simulatore conteggia prudenzialmente ${projectMonths} mesi come agevolabili. Puoi modificare durata o scegliere pagamento in unica soluzione se coerente con il contratto.`,target:`pay_${r.id}`});
  });

  if(!alerts.length)alerts.push({type:'warn',text:'? Inserisci i dati del cliente e almeno una soluzione.',target:'cliente'});
  $('alerts').innerHTML=alerts.map(alertHTML).join('');

  const hasBad=alerts.some(a=>a.type==='bad'),hasWarn=alerts.some(a=>a.type==='warn');
  const head=$('summaryHead');
  if(hasBad){head.className='summary-head bad';$('statusTitle').textContent='NON PRONTO';$('statusText').textContent='Ci sono criticità bloccanti o numeriche da risolvere prima di proporre la pratica.'}
  else if(hasWarn){head.className='summary-head';$('statusTitle').textContent='DA VERIFICARE';$('statusText').textContent='La struttura economica può funzionare, ma restano punti da chiudere prima di presentarla come agevolabile.'}
  else{head.className='summary-head good';$('statusTitle').textContent='STRUTTURA COERENTE';$('statusText').textContent='Lo screening non evidenzia criticità immediate. Serve comunque la verifica finale sul bando.'}

  const outputItems=[...new Set(rows.filter(r=>isEligibleRow(r)).flatMap(r=>r.outputs||[]))];
  $('outputList').innerHTML=outputItems.length?outputItems.map(x=>`<span>${esc(x)}</span>`).join(''):'<span>Seleziona una soluzione per generare gli output.</span>';

  const cashMode=$('cashMode').value;
  if(cashMode==='anticipo'||$('advance').checked)$('cashText').textContent=`Anticipo: fino al 40% del contributo assegnato. Su ${eur(grant)} significa circa ${eur(grant*.40)}, con fideiussione/polizza conforme.`;
  else if(cashMode==='sal')$('cashText').textContent=`SAL: possibile dopo aver sostenuto tra il 40% e l'80% della spesa ammissibile. Su ${eur(eligible)}: circa ${eur(eligible*.40)} – ${eur(eligible*.80)}.`;
  else $('cashText').textContent='Saldo finale: richiesta entro 30 giorni dalla conclusione, con rendicontazione finale, perizia giurata e relazione descrittiva.';

  const genericRows=rows.filter(r=>lineTotal(r)>0).map(r=>{
    const elig=isEligibleRow(r)?eligibleLineTotal(r,projectMonths):0;
    const statusNote=elig===0?' [non conteggiato nella spesa ammissibile]':(elig<lineTotal(r)?` [agevolabile stimato ${eur(elig)}]`:'');
    return `${shortLabel(r)}: ${eur(lineTotal(r))}${r.pay==='monthly'?` (${eur(r.price)} × ${r.months} mesi)`:''}${r.hyp?' [prezzo ipotetico]':''}${statusNote}`;
  });
  if(indirect>0)genericRows.push(`Costi indiretti FESR: ${eur(indirect)}`);
  const client=$('cliente').value.trim()||'il cliente';
  const projected=fatturato>0&&incremento>0?fatturato*(1+incremento/100):0;
  const settoreLabel={ristorazione:'Ristorazione / hospitality',retail:'Retail / commercio',pmi:'PMI / servizi',professionista:'Professionista regolamentato',altro:'Altro'}[settoreCliente]||settoreCliente;
  $('recapText').value=[
    `Progetto FESR 1.2.2 – screening interno Metallufficio.`,
    `Cliente: ${client}${comune?` · Comune/unità del progetto: ${comune}`:''}.`,
    `Settore: ${settoreLabel}. Nuovi mercati/canali: ${mercati?'sì':'non definiti/no'}.`,
    projected?`Obiettivo economico inserito: fatturato corrente ${eur(fatturato)}, incremento atteso ${incremento}%, valore prospettico circa ${eur(projected)}. La previsione deve essere prudente e documentabile.`:'',
    `Totale commerciale simulato: ${eur(totalCommercial)}. Spesa potenzialmente ammissibile: ${eur(eligible)}${excludedCommercial>0?` (${eur(excludedCommercial)} di voci commerciali non conteggiate o da validare)`:''}. Contributo teorico al ${rate}%: ${eur(grant)}. Quota residua cliente: ${eur(clientShare)}.`,
    genericRows.length?`Riepilogo economico: ${genericRows.join('; ')}.`:'',
    outputItems.length?`Output tecnici da prevedere: ${outputItems.join(', ')}.`:'',
    `Punteggio preliminare: ${prelim}/25. Valutazione di merito stimata: ${merit}/75 (A ${scoreA}/35, B ${scoreB}/20, C ${cPts}/20).`,
    `Nota: i nomi commerciali dei software/gestionali sono volutamente esclusi da questo recap; la descrizione definitiva dovrà rappresentare processi, integrazioni, output tecnici verificabili e obiettivi misurabili.`
  ].filter(Boolean).join('\n\n');
  $('recapTotal').textContent=eur(totalCommercial);$('recapEligible').textContent=eur(eligible);$('recapGrant').textContent=eur(grant);$('recapStatus').textContent=$('statusTitle').textContent;
}

$('build').addEventListener('click',build);
$('add').addEventListener('click',()=>{addItem({kind:'all',desc:'Voce personalizzata da verificare',cat:'A',months:1,pay:'once',status:'validate'});update()});
$('addCons').addEventListener('click',()=>{addItem({kind:'none',desc:'Consulenza specialistica strategica funzionale al progetto',cat:'C',months:1,pay:'once',status:'include'});update()});
$('addPerizia').addEventListener('click',()=>{addItem({kind:'none',desc:'Perizia giurata finale',cat:'D',months:1,pay:'once',status:'include'});update()});
$('addFide').addEventListener('click',()=>{addItem({kind:'none',desc:'Fideiussione bancaria / polizza assicurativa',cat:'E',months:1,pay:'once',status:'include'});update()});
$('clear').addEventListener('click',()=>{$('items').innerHTML='';document.querySelectorAll('#needs input').forEach(x=>x.checked=false);update()});
$('cpack').addEventListener('input',refreshConnect);$('cmode').addEventListener('input',refreshConnect);$('ctarget').addEventListener('input',refreshConnect);$('cadd').addEventListener('click',addConnect);
['cliente','comune','settoreCliente','mercati','fatturato','incremento','beneficiario','abruzzo','registro','settoreOk','regolarita','difficolta','periodoSpesa','artigiana','esg','deminimis','mesi','scoreA','scoreB','rate','cashMode','indirect','advance'].forEach(id=>$(id).addEventListener('input',update));
document.querySelectorAll('#needs input').forEach(x=>x.addEventListener('input',update));

const INFO={
  status:{title:'Stato dello screening',body:'<p><strong>NON PRONTO</strong> significa che esiste almeno una criticità bloccante o numerica, per esempio spesa ammissibile sotto €10.000 o merito stimato sotto 40/75.</p><p><strong>DA VERIFICARE</strong> significa che i numeri possono funzionare ma restano requisiti o voci da validare.</p><p><strong>STRUTTURA COERENTE</strong> significa soltanto che il simulatore non rileva criticità immediate: non equivale ad ammissione della Regione.</p>'},
  totalCommercial:{title:'Totale commerciale',body:'<p>È la somma delle <strong>voci di fornitura inserite</strong>, indipendentemente dal fatto che siano o meno ammissibili al FESR.</p><div class="info-callout">Il minimo di €10.000 del bando <strong>non si controlla su questo importo</strong>, ma sulla spesa potenzialmente ammissibile.</div>'},
  eligibleSpend:{title:'Spesa potenzialmente ammissibile',body:'<p>È la parte del progetto che il simulatore sta conteggiando come coerente con le categorie FESR, più gli eventuali costi indiretti forfettari.</p><p>Il progetto deve mantenere una spesa ammissibile di almeno <strong>€10.000</strong>. Le voci “da validare”, “da classificare” o escluse restano nel totale commerciale ma non entrano qui.</p><p>Per canoni software/SaaS mensili il calcolo è prudenziale e considera i mesi entro la durata del progetto; con pagamento in unica soluzione l’Avviso consente l’intero canone pagato nel periodo eleggibile anche se l’abbonamento dura di più.</p>'},
  grant:{title:'Contributo teorico',body:'<p>È la spesa potenzialmente ammissibile moltiplicata per la percentuale scelta (40–70%), con tetto di <strong>€100.000</strong> e nel limite del de minimis residuo.</p><p>È una simulazione: l’importo effettivo dipende dalle spese riconosciute e dalla concessione regionale.</p>'},
  clientShare:{title:'Costo residuo cliente',body:'<p>È una lettura commerciale: <strong>totale commerciale − contributo teorico</strong>.</p><p>Non è una garanzia del costo finale e non considera eventuali effetti fiscali, IVA recuperabile/non recuperabile o tagli in rendicontazione.</p>'},
  costs:{title:'Voci di prezzo e badge',body:'<p><strong>FESR</strong>: voce conteggiata. <strong>DA MOTIVARE</strong>: conteggiata ma richiede una motivazione tecnica forte. <strong>DA VALIDARE</strong>: resta nel totale commerciale ma non viene conteggiata nella spesa ammissibile. <strong>NO</strong>: esclusa.</p><p>Puoi modificare “Categoria” e “Trattamento FESR” direttamente nella riga della voce.</p>'},
  semaforo:{title:'Semaforo pratica',body:'<p>Il semaforo raccoglie controlli automatici su requisiti, soglia €10.000, durata, de minimis, consulenza, perizia, punteggio e classificazione delle singole voci.</p><p>Le righe gialle e rosse con collegamento sono cliccabili: portano <strong>al campo preciso da correggere</strong>, non semplicemente alla sezione.</p>'},
  prelim:{title:'Primo esame · 0–25 punti',body:'<p>È la graduatoria preliminare giornaliera: <strong>artigiana +10</strong>, <strong>Area Interna +10</strong>, <strong>certificazione ambientale/ESG +5</strong>.</p><p>Questi punti servono alla priorità nella graduatoria parziale e <strong>non si sommano</strong> ai 75 punti della valutazione di merito.</p>'},
  merit:{title:'Secondo esame · 0–75 punti',body:'<p>La Commissione valuta il progetto: <strong>A Innovatività max 35</strong>, <strong>B ricadute economiche max 20</strong>, <strong>C quota privata max 20</strong>.</p><p>Servono almeno <strong>40/75</strong>. A e B nel simulatore sono una stima interna; C è calcolato automaticamente dalla percentuale di contributo richiesta.</p>'},
  punteggio:{title:'Punteggio rapido',body:'<p>Mostra separatamente il punteggio preliminare (max 25), il merito stimato (minimo 40/75) e il de minimis residuo.</p><p>Non sommare mai 25 + 75: sono due fasi differenti della procedura.</p>'},
  deminimis:{title:'De minimis',body:'<p>Il bando opera nel regime de minimis. Per ogni nuova concessione bisogna considerare gli aiuti concessi nei <strong>tre anni precedenti</strong>, entro il massimale complessivo applicabile di €300.000.</p><p>Inserisci qui gli aiuti già ottenuti dal beneficiario per stimare il plafond residuo.</p>'},
  duration:{title:'Durata del progetto',body:'<p>La durata ordinaria è di <strong>12 mesi</strong> dalla pubblicazione della graduatoria sul BURAT. È ammessa una sola proroga, motivata, fino a <strong>3 mesi</strong>, da richiedere almeno 30 giorni prima della scadenza.</p>'},
  indirect:{title:'Costi indiretti · max 5%',body:'<p>I costi indiretti possono essere rendicontati a tasso forfettario fino al <strong>5% dei costi diretti ammissibili A+B+C</strong>.</p><p>Non sono una voce commerciale Metallufficio: per questo vengono aggiunti alla spesa FESR stimata, ma non al totale commerciale delle forniture.</p>'},
  advance:{title:'Anticipazione del 40%',body:'<p>La Regione può erogare una prima quota come anticipazione pari al <strong>40% del contributo assegnato</strong>, con fideiussione bancaria o polizza assicurativa conforme e di importo pari all’anticipo.</p>'},
  cashflow:{title:'Cash flow del contributo',body:'<p>Le modalità principali simulate sono: <strong>saldo finale</strong>, <strong>SAL</strong> dopo spesa sostenuta tra il 40% e l’80% delle spese ammissibili, oppure <strong>anticipazione 40%</strong> con garanzia.</p><p>Il saldo richiede rendicontazione finale, perizia giurata e relazione descrittiva.</p>'},
  connect:{title:'METALLUFFICIO CONNECT nel FESR',body:'<p>I pacchetti BASIC, PRIME e FULL EXPERIENCE sono strumenti commerciali interni abbinati a Pienissimo Pro o ai gestionali Zucchetti.</p><p>Nel simulatore partono come <strong>servizio da classificare</strong> e non vengono conteggiati automaticamente. Dopo la verifica devi scegliere la categoria corretta e il trattamento FESR.</p><div class="info-callout">Attività di formazione, assistenza ordinaria, presentazione della domanda, rendicontazione e monitoraggio non vanno confuse con le spese tecniche agevolabili. Se il pacchetto contiene componenti diverse, può essere necessario separarle economicamente.</div>'},
  outputs:{title:'Output tecnici verificabili',body:'<p>Il progetto FESR non dovrebbe fermarsi alla lista di acquisti. Vanno previsti <strong>output tecnici verificabili</strong>: ambienti configurati, integrazioni, URL/piattaforme, dashboard, report, configurazioni di sicurezza, procedure di backup, test e verbali di collaudo.</p><p>La lista viene generata dalle soluzioni selezionate e serve come promemoria interno per preventivo, consegna e rendicontazione.</p>'},
  composition:{title:'Come classificare le voci',body:'<p><strong>A</strong> beni materiali nuovi e direttamente funzionali; <strong>B</strong> software/licenze/beni immateriali; <strong>C</strong> consulenza specialistica strategica entro il 10%; <strong>D</strong> perizia entro 2% e max €5.000; <strong>E</strong> fideiussione; <strong>S</strong> servizio ancora da classificare; <strong>X</strong> non agevolabile.</p><p>Hardware ordinario di singola postazione, software ordinario, manutenzione/assistenza ricorrente e formazione sono tra le aree da escludere o verificare con particolare attenzione.</p>'}
};
const modal=$('infoModal'),modalTitle=$('infoTitle'),modalBody=$('infoBody');
function openInfo(key){const d=INFO[key];if(!d)return;modalTitle.textContent=d.title;modalBody.innerHTML=d.body;modal.hidden=false;modal.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');setTimeout(()=>modal.querySelector('.info-close')?.focus(),0)}
function closeInfo(){modal.hidden=true;modal.setAttribute('aria-hidden','true');document.body.classList.remove('modal-open')}
document.addEventListener('click',e=>{const b=e.target.closest('[data-info]');if(b){e.preventDefault();e.stopPropagation();openInfo(b.dataset.info);return}if(e.target.closest('[data-close-info]'))closeInfo()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)closeInfo()});

refreshConnect();update();