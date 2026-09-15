import { getStore, getDeployStore } from '@netlify/blobs';
declare const Netlify: any;

const RATE_POINTS: Record<number, number> = {40:20,45:17,50:14,55:11,60:8,65:5,70:2};

const CCIAA_RULES = `
BANDO VOUCHER DOPPIA TRANSIZIONE 2026 - CCIAA CHIETI PESCARA, MISURA A.
Valuta solo ciò che è documentato.
- beneficiario: MPMI con sede legale e/o unità operativa nella circoscrizione CCIAA Chieti-Pescara, attiva e regolare; requisiti amministrativi/contributivi e polizza catastrofale ove applicabile;
- esclusione dei beneficiari che hanno già ottenuto analoghi Voucher Digitali I4.0 / Transizione Energetica CCIAA 2023-2025; una domanda e una sola misura;
- investimento minimo ammissibile €3.000; contributo 70%, massimo €5.000; eventuale premialità €250 per i titoli previsti;
- tecnologie ammesse Art.7 comprendono CRM, ERP/processi integrati, cloud, cybersecurity, AI e altre tecnologie previste; e-commerce solo se interconnesso a tecnologia ammessa;
- consulenza per implementazione e formazione sono ammesse se pertinenti; per fornitori di consulenza/formazione verificare Art.6 e Allegato 3 quando richiesto, assenza di collegamento/controllo e storico documentabile;
- software: preventivo dettagliato e scheda tecnica; SaaS ammissibile solo per competenza nel periodo utile; rinnovi/upgrade esistenti vanno segnalati come da verificare se il documento non chiarisce la quota agevolabile;
- spese non ammesse o ad alto rischio: viaggi/vitto/alloggio, siti web, advertising/SEO/SEM, consulenza commerciale/amministrativa ordinaria, mera promozione, costi certificatore, supporto mero adempimento normativo; hardware informatico di base solo se strettamente collegato al progetto digitale;
- IVA normalmente esclusa; può essere ammissibile solo se sostenuta senza possibilità di recupero;
- progetto e preventivi devono essere coerenti, congrui, con output e attività verificabili; nessuna voce deve essere aggiunta solo per raggiungere la soglia;
- documentazione: Modulo Progetto, Self i4.0, preventivi, scheda tecnica software, Allegato 3 ove previsto e altri documenti del bando;
- il bando CCIAA non ha una graduatoria di merito a punti analoga al FESR: NON inventare un punteggio ufficiale. Produci solo ammissibilità e rischio istruttorio interno.
`;

const FESR_RULES = `
PR ABRUZZO FESR 2021-2027 - AZIONE 1.2.2 DIGITALIZZAZIONE PMI.
Valuta solo ciò che è documentato.
- beneficiario ammissibile e sede/unità del progetto in Abruzzo; settore e requisiti da verificare; regime de minimis con massimale €300.000 su tre anni;
- investimento minimo €10.000; intensità di aiuto selezionabile 40%-70%; contributo massimo €100.000; progetto normalmente 12 mesi con eventuale proroga massima prevista;
- IVA esclusa salvo indetraibilità/non recuperabilità documentata;
- progetto deve essere organico e realmente digitale; hardware ordinario da solo è debole; costi materiali/immateriali, consulenza, perizia e fideiussione devono essere pertinenti, congrui e correttamente classificati; costi indiretti forfettari 5% quando applicabili secondo Avviso;
- PREMIALITA' PRELIMINARI max 25: impresa artigiana +10; localizzazione in Area Interna +10; certificazione ambientale/rating ESG valido +5. Non assegnare punti se il requisito non è provato;
- MERITO: minimo 40/75. A Innovatività max 35; B Ricadute max 20; C Quota privata max 20. Valuta A e B severamente sulla qualità del testo, concretezza, integrazione, indicatori, innovazione rispetto allo stato attuale e ricadute misurabili;
- C è deterministico: 40%=20 punti, 45%=17, 50%=14, 55%=11, 60%=8, 65%=5, 70%=2. Non inventare C;
- evidenzia incoerenze fra percentuale richiesta, investimento, obiettivi, risultati, tempi, costi e indicatori; cerca elementi che possano ridurre A/B o portare al taglio di voci;
- se la percentuale di contributo non è indicata, restituisci null e segnala che C e totale 75 non sono definitivamente calcolabili.
`;

const DOCUMENT_SCOPE_RULES = `
PRIMA CLASSIFICA IL RUOLO DEL FILE: PREVENTIVO/OFFERTA FORNITORE, RELAZIONE TECNICA/PROGETTO, DOMANDA/DOSSIER, oppure ALTRO.
- Se è PREVENTIVO/OFFERTA FORNITORE, l'assenza di visura, dichiarazione PMI/ATECO, de minimis, titoli delle sedi, certificazioni artigiana/ESG, percentuale di contributo, moduli amministrativi o preventivi comparativi NON è un difetto grave del preventivo. Questi elementi appartengono normalmente al dossier del beneficiario.
- Tali elementi possono essere segnalati solo come WARN / DA ACQUISIRE NEL DOSSIER e NON devono abbassare A o B.
- Se la percentuale di contributo non è nel preventivo, C resta null salvo dato verificato fornito dall'utente; non creare una criticità HIGH/CRITICAL per questa assenza.
- A e B dipendono dal merito progettuale pertinente: AS-IS/TO-BE, innovazione rispetto allo stato attuale, integrazione, canali digitali di vendita e CRM, interoperabilità, KPI e ricadute misurabili, fattibilità, output e cronoprogramma.
- Se manca un fatto reale che non puoi inventare, etichettalo INPUT UTENTE NECESSARIO. Non confonderlo con un errore di scrittura.
- Se è RELAZIONE TECNICA/PROGETTO o DOMANDA/DOSSIER, valuta invece i requisiti coerenti con quella funzione documentale.
- Nella rianalisi di una versione revisionata non riproporre come difetti del preventivo le mancanze amministrative del dossier esterno.
`;

const analysisSchema:any = {
  type:'object', additionalProperties:false,
  properties:{
    band:{type:'string',enum:['cciaa','fesr']},
    document:{type:'object',additionalProperties:false,properties:{title:{type:'string'},company:{type:['string','null']},investment_total:{type:['number','null']},requested_contribution_rate:{type:['number','null']},summary:{type:'string'}},required:['title','company','investment_total','requested_contribution_rate','summary']},
    verdict:{type:'object',additionalProperties:false,properties:{status:{type:'string'},eligibility_label:{type:'string'},executive_summary:{type:'string'}},required:['status','eligibility_label','executive_summary']},
    eligibility:{type:'array',items:{type:'object',additionalProperties:false,properties:{criterion:{type:'string'},status:{type:'string',enum:['ok','warn','no']},status_label:{type:'string'},reason:{type:'string'},evidence:{type:['string','null']},rule_reference:{type:['string','null']}},required:['criterion','status','status_label','reason','evidence','rule_reference']}},
    findings:{type:'array',items:{type:'object',additionalProperties:false,properties:{severity:{type:'string',enum:['critical','high','medium','low']},type:{type:'string'},type_label:{type:'string'},title:{type:'string'},detail:{type:'string'},evidence:{type:['string','null']},rule_reference:{type:['string','null']},estimated_cut_eur:{type:['number','null']},suggested_fix:{type:'string'}},required:['severity','type','type_label','title','detail','evidence','rule_reference','estimated_cut_eur','suggested_fix']}},
    priority_actions:{type:'array',items:{type:'object',additionalProperties:false,properties:{priority:{type:'string',enum:['alta','media','bassa']},title:{type:'string'},action:{type:'string'},expected_effect:{type:['string','null']}},required:['priority','title','action','expected_effect']}},
    score:{type:'object',additionalProperties:false,properties:{artigiana_status:{type:'string',enum:['yes','no','unclear']},area_interna_status:{type:'string',enum:['yes','no','unclear']},esg_status:{type:'string',enum:['yes','no','unclear']},artigiana_points:{type:'integer'},area_interna_points:{type:'integer'},esg_points:{type:'integer'},preliminary_total:{type:'integer'},merit_a:{type:['integer','null']},merit_b:{type:['integer','null']},merit_c:{type:['integer','null']},merit_total:{type:['integer','null']},contribution_rate:{type:['number','null']},internal_risk_index:{type:'integer'},blocking_issues:{type:'integer'},warning_issues:{type:'integer'},potential_cuts:{type:'integer'}},required:['artigiana_status','area_interna_status','esg_status','artigiana_points','area_interna_points','esg_points','preliminary_total','merit_a','merit_b','merit_c','merit_total','contribution_rate','internal_risk_index','blocking_issues','warning_issues','potential_cuts']}
  },
  required:['band','document','verdict','eligibility','findings','priority_actions','score']
};

const rewriteSchema:any = {
  type:'object', additionalProperties:false,
  properties:{
    note:{type:'string'},
    sections:{type:'array',items:{type:'object',additionalProperties:false,properties:{title:{type:'string'},text:{type:'string'}},required:['title','text']}},
    docx_edits:{type:'array',items:{type:'object',additionalProperties:false,properties:{paragraph_index:{type:'integer'},original_excerpt:{type:'string'},replacement_text:{type:'string'},reason:{type:'string'}},required:['paragraph_index','original_excerpt','replacement_text','reason']}}
  }, required:['note','sections','docx_edits']
};

function store(){
  const prod = Netlify.context?.deploy?.context === 'production';
  return prod ? getStore('valutatore-jobs',{consistency:'strong'}) : getDeployStore('valutatore-jobs');
}
function outputText(data:any){if(typeof data?.output_text==='string')return data.output_text;for(const item of data?.output||[])for(const c of item?.content||[])if(c?.type==='output_text'&&typeof c.text==='string')return c.text;return''}
function clamp(n:number,min:number,max:number){return Math.max(min,Math.min(max,Math.round(Number(n)||0)))}
function computeRisk(a:any){let risk=0,blocks=0,warns=0,cuts=0;for(const e of a.eligibility||[]){if(e.status==='no'){risk+=18;blocks++}else if(e.status==='warn'){risk+=6;warns++}}for(const f of a.findings||[]){risk+=({critical:22,high:14,medium:7,low:2} as any)[f.severity]||0;if(f.severity==='critical')blocks++;if(['high','medium'].includes(f.severity))warns++;if(String(f.type).toLowerCase().includes('taglio')||f.estimated_cut_eur!=null)cuts++}return{risk:Math.min(100,risk),blocks,warns,cuts}}
function postProcess(a:any,bando:string,ctx:any){a.band=bando;a.score=a.score||{};if(bando==='fesr'){if(ctx?.area_interna===true)a.score.area_interna_status='yes';a.score.artigiana_points=a.score.artigiana_status==='yes'?10:0;a.score.area_interna_points=a.score.area_interna_status==='yes'?10:0;a.score.esg_points=a.score.esg_status==='yes'?5:0;a.score.preliminary_total=a.score.artigiana_points+a.score.area_interna_points+a.score.esg_points;a.score.merit_a=a.score.merit_a==null?null:clamp(a.score.merit_a,0,35);a.score.merit_b=a.score.merit_b==null?null:clamp(a.score.merit_b,0,20);const rawRate=ctx?.requested_contribution_rate??a.document?.requested_contribution_rate??a.score.contribution_rate;const rate=rawRate==null?null:Number(rawRate);a.score.contribution_rate=rate;const c=rate!=null&&RATE_POINTS[rate]!==undefined?RATE_POINTS[rate]:null;a.score.merit_c=c;a.score.merit_total=(a.score.merit_a!=null&&a.score.merit_b!=null&&c!=null)?a.score.merit_a+a.score.merit_b+c:null;const r=computeRisk(a);a.score.internal_risk_index=0;a.score.blocking_issues=r.blocks;a.score.warning_issues=r.warns;a.score.potential_cuts=r.cuts}else{const r=computeRisk(a);Object.assign(a.score,{artigiana_status:'unclear',area_interna_status:'unclear',esg_status:'unclear',artigiana_points:0,area_interna_points:0,esg_points:0,preliminary_total:0,merit_a:null,merit_b:null,merit_c:null,merit_total:null,contribution_rate:null,internal_risk_index:r.risk,blocking_issues:r.blocks,warning_issues:r.warns,potential_cuts:r.cuts})}return a}

async function callOpenAI(apiKey:string,model:string,instructions:string,userText:string,schema:any,name:string,file?:{base64:string,mime:string,name:string}|null){
  const content:any[]=[{type:'input_text',text:userText}];
  if(file?.base64)content.push({type:'input_file',filename:file.name,file_data:`data:${file.mime||'application/pdf'};base64,${file.base64}`});
  const body={model,store:false,reasoning:{effort:'high'},instructions,input:[{role:'user',content}],text:{format:{type:'json_schema',name,strict:true,schema}},max_output_tokens:24000};
  const resp=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify(body)});
  const data=await resp.json();if(!resp.ok)throw new Error(data?.error?.message||`OpenAI API ${resp.status}`);const text=outputText(data);if(!text)throw new Error('Il modello non ha restituito un output testuale.');return JSON.parse(text)
}

export default async (req:Request) => {
  let jobId='';
  try{
    const p:any=await req.json();jobId=String(p.jobId||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80);if(!jobId)return;
    const s=store();await s.setJSON(`job-${jobId}`,{status:'processing',action:p.action||'analyze',startedAt:new Date().toISOString()});
    const apiKey=Netlify.env.get('OPENAI_API_KEY');if(!apiKey)throw new Error('OPENAI_API_KEY non configurata');
    const model=Netlify.env.get('OPENAI_MODEL')||'gpt-5.6-terra';
    const bando=p.bando==='fesr'?'fesr':'cciaa';const rules=bando==='fesr'?FESR_RULES:CCIAA_RULES;const safeText=String(p.documentText||'').slice(0,320000);const paragraphText=Array.isArray(p.paragraphs)?p.paragraphs.slice(0,1200).map((x:any)=>`[P${x.index}] ${String(x.text||'')}`).join('\n'):'';
    if(p.action==='rewrite'){
      const instructions=`Sei un redattore senior di progetti di finanza agevolata. OBIETTIVO DI CONVERGENZA: una nuova analisi dello STESSO TIPO DI DOCUMENTO non deve riproporre criticità che potevano essere corrette testualmente. Risolvi tutte le criticità testualmente correggibili dell'analisi precedente. Non inventare fatti, numeri, certificazioni, date, baseline o target. Usa i DATI VERIFICATI forniti dall'utente; ciò che manca resta [DA COMPLETARE]. Se il file è un preventivo/offerta, NON inserire dichiarazioni amministrative del beneficiario: appartengono al dossier esterno. Per FESR sostituisci dove utile il copy promozionale con contenuto tecnico su obiettivi, AS-IS/TO-BE se supportato, architettura e integrazioni, ruolo delle dotazioni, licenze/durate se note, piano attività e deliverable, KPI e metodo di misura, cronoprogramma, output, test e collaudo. Mantieni ordine e struttura del documento.

${DOCUMENT_SCOPE_RULES}

${rules}`;
      const user=`BANDO: ${bando.toUpperCase()}\nFILE: ${p.fileName||''}\nPERCENTUALE CONTRIBUTO VERIFICATA: ${p.requestedContributionRate??p.projectContext?.requested_contribution_rate??'non indicata'}\nDATI VERIFICATI UTENTE: ${p.verifiedFacts||p.projectContext?.verified_facts||'nessuno'}\nANALISI PRECEDENTE:\n${JSON.stringify(p.analysis||{})}\n\nDOCUMENTO ORIGINALE:\n${safeText}\n\n${p.fileType==='docx'?`PARAGRAFI INDICIZZATI:\n${paragraphText}`:''}\n\nGenera una versione più forte, pronta per revisione umana. Se DOCX, usa solo indici reali [P#]. Se PDF, lascia docx_edits vuoto e ricostruisci sections nello stesso ordine logico.`;
      const rewrite=await callOpenAI(apiKey,model,instructions,user,rewriteSchema,'project_rewrite');
      await s.setJSON(`job-${jobId}`,{status:'done',action:'rewrite',completedAt:new Date().toISOString(),result:{rewrite}});return;
    }
    const mode=String(p.mode||'full');
    const instructions=`Agisci come un istruttore pubblico molto severo ma corretto rispetto alla funzione del documento. Cerca contestazioni reali senza pretendere che un singolo preventivo contenga l'intero dossier della domanda. Non premiare ciò che non è documentato nel file o nel contesto verificato. Distingui fatti, dati esterni da acquisire e vere lacune progettuali. Usa estimated_cut_eur solo con base concreta; altrimenti null.

${DOCUMENT_SCOPE_RULES}

${rules}`;
    const contextNote=p.deterministicContext&&Object.keys(p.deterministicContext).length?`\nCONTESTO DETERMINISTICO DAL SITO: ${JSON.stringify(p.deterministicContext)}. Se Area Interna=true, consideralo verificato ai soli fini della simulazione.`:'';
    const user=`TIPO CONTROLLO: ${mode}\nBANDO: ${bando.toUpperCase()}\nFILE: ${p.fileName||''}\nNOTE METALLUFFICIO: ${p.notes||'nessuna'}${contextNote}\n\nDOCUMENTO DA ISTRUIRE:\n${safeText}\n\nProduci una valutazione istruttoria severa. Nel FESR assegna A e B solo in base alla qualità documentata; C verrà ricalcolato dal motore. Nel CCIAA non inventare punteggi ufficiali.`;
    const file=p.fileBase64?{base64:String(p.fileBase64),mime:String(p.fileMime||'application/pdf'),name:String(p.fileName||'documento.pdf')}:null;
    let analysis=await callOpenAI(apiKey,model,instructions,user,analysisSchema,'project_analysis',file);if(p.projectContext?.requested_contribution_rate!=null&&analysis?.document)analysis.document.requested_contribution_rate=Number(p.projectContext.requested_contribution_rate);analysis=postProcess(analysis,bando,{...(p.deterministicContext||{}),...(p.projectContext||{})});
    await s.setJSON(`job-${jobId}`,{status:'done',action:'analyze',completedAt:new Date().toISOString(),result:{analysis}});
  } catch(err:any){
    if(jobId){try{await store().setJSON(`job-${jobId}`,{status:'error',completedAt:new Date().toISOString(),error:String(err?.message||err||'Errore sconosciuto')})}catch{}}
  }
};

export const config = { path:'/api/valuta-progetto-async' };
