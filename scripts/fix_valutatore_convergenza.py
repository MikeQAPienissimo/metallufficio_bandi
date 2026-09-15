from pathlib import Path
import re

ROOT=Path('.')
def read(p): return (ROOT/p).read_text(encoding='utf-8')
def write(p,s): (ROOT/p).write_text(s,encoding='utf-8')

# 1) UI: dati verificati del progetto
p='valuta-progetto.html'; s=read(p)
if 'id="projectContributionRate"' not in s:
    anchor='<div class="mode-grid" style="margin-top:12px"><div class="mode"><b>Modalità severa</b>'
    block='''<div class="mode" id="projectContextPanel" style="margin-top:12px">
<b>Dati reali del progetto</b>
<small>Questi dati vengono usati sia nell’analisi sia nella rigenerazione. Inseriamo solo informazioni reali e verificabili: il motore non deve inventarle.</small>
<div class="field" style="margin-top:12px"><label for="projectContributionRate">Percentuale di contributo richiesta · FESR</label><select id="projectContributionRate"><option value="">Da definire / non presente nel documento</option><option value="40">40%</option><option value="45">45%</option><option value="50">50%</option><option value="55">55%</option><option value="60">60%</option><option value="65">65%</option><option value="70">70%</option></select></div>
<div class="field" style="margin-top:11px"><label for="projectVerifiedFacts">Dati verificati da integrare</label><textarea id="projectVerifiedFacts" placeholder="Es. sistemi oggi in uso e criticità; baseline e target KPI reali; durata licenze; API/connettori confermati; numero casse/reparti e motivazione delle quantità; date e fasi del progetto..."></textarea></div>
</div>'''
    if anchor not in s: raise SystemExit('HTML: anchor contesto progetto non trovato')
    s=s.replace(anchor,block+anchor,1)
s=re.sub(r'<script src="valuta-progetto-async\.js(?:\?v=[^"]*)?"></script>','<script src="valuta-progetto-async.js?v=20260915-5"></script>',s)
s=re.sub(r'<script src="valuta-progetto-controller\.js(?:\?v=[^"]*)?"></script>','<script src="valuta-progetto-controller.js?v=20260915-5"></script>',s)
write(p,s)

# 2) Frontend analisi: contesto verificato + errori leggibili
p='valuta-progetto-async.js'; s=read(p)
if 'function friendlyAiError' not in s:
    s=s.replace("  const newJobId=()=>crypto.randomUUID().replace(/-/g,'');", "  const newJobId=()=>crypto.randomUUID().replace(/-/g,'');\n  function friendlyAiError(message){\n    const raw=String(message||'Errore durante il job AI.');\n    const x=raw.toLowerCase();\n    if(x.includes('usage_exceeded')||x.includes('insufficient_quota')||x.includes('quota')||x.includes('billing')||x.includes('credit'))return 'Credito o limite API OpenAI raggiunto. Aggiungi credito API oppure attendi il ripristino del limite e riprova.';\n    if(x.includes('rate_limit'))return 'Limite temporaneo API OpenAI raggiunto. Attendi qualche minuto e riprova.';\n    return raw;\n  }")
s=s.replace("if(data.status==='error')throw new Error(data.error||'Errore durante il job AI.');","if(data.status==='error')throw new Error(friendlyAiError(data.error||'Errore durante il job AI.'));" )
if 'projectContext:{requested_contribution_rate' not in s:
    old='deterministicContext:detectDeterministicContext()};'
    new="deterministicContext:detectDeterministicContext(),projectContext:{requested_contribution_rate:Number(document.getElementById('projectContributionRate')?.value)||null,verified_facts:document.getElementById('projectVerifiedFacts')?.value.trim()||''}};"
    if old not in s: raise SystemExit('JS async: payload analisi non trovato')
    s=s.replace(old,new,1)
if 'requestedContributionRate:Number(document.getElementById' not in s:
    old="const payload={action:'rewrite',bando:selectedBando(),fileName:state.file.name,fileType:state.type,documentText:state.text,paragraphs:state.type==='docx'?state.paragraphs.slice(0,1200):[],analysis:state.analysis};"
    new="const payload={action:'rewrite',bando:selectedBando(),fileName:state.file.name,fileType:state.type,documentText:state.text,paragraphs:state.type==='docx'?state.paragraphs.slice(0,1200):[],analysis:state.analysis,requestedContributionRate:Number(document.getElementById('projectContributionRate')?.value)||null,verifiedFacts:document.getElementById('projectVerifiedFacts')?.value.trim()||''};"
    if old in s: s=s.replace(old,new,1)
write(p,s)

# 3) Frontend controller: PDF/XLSX rewrite usa stessi dati ed errori leggibili
p='valuta-progetto-controller.js'; s=read(p)
if 'function friendlyAiError' not in s:
    s=s.replace('  const MAX_TEXT=300000;', "  const MAX_TEXT=300000;\n  function friendlyAiError(message){\n    const raw=String(message||'Errore durante la rigenerazione AI');\n    const x=raw.toLowerCase();\n    if(x.includes('usage_exceeded')||x.includes('insufficient_quota')||x.includes('quota')||x.includes('billing')||x.includes('credit'))return 'Credito o limite API OpenAI raggiunto. Aggiungi credito API oppure attendi il ripristino del limite e riprova.';\n    if(x.includes('rate_limit'))return 'Limite temporaneo API OpenAI raggiunto. Attendi qualche minuto e riprova.';\n    return raw;\n  }")
s=s.replace("if(data.status==='error')throw new Error(data.error||'Errore durante la rigenerazione AI');","if(data.status==='error')throw new Error(friendlyAiError(data.error||'Errore durante la rigenerazione AI'));" )
s=s.replace("throw new Error(data.error||`Errore avvio rigenerazione ${res.status}`);","throw new Error(friendlyAiError(data.error||`Errore avvio rigenerazione ${res.status}`));")
if 'verifiedFacts:q(' not in s:
    old="const payload={action:'rewrite',bando:selectedBando(),fileName:state.file.name,fileType:state.type,documentText:state.text,paragraphs:state.type==='docx'?state.paragraphs.slice(0,1200):[],analysis:state.analysis};"
    new="const payload={action:'rewrite',bando:selectedBando(),fileName:state.file.name,fileType:state.type,documentText:state.text,paragraphs:state.type==='docx'?state.paragraphs.slice(0,1200):[],analysis:state.analysis,requestedContributionRate:Number(q('projectContributionRate')?.value)||null,verifiedFacts:q('projectVerifiedFacts')?.value.trim()||''};"
    if old not in s: raise SystemExit('Controller: payload rewrite non trovato')
    s=s.replace(old,new,1)
write(p,s)

# 4) Backend analisi: distingue preventivo dal dossier
p='netlify/functions/valuta-progetto-async-background.mts'; s=read(p)
if 'const DOCUMENT_SCOPE_RULES' not in s:
    scope='''const DOCUMENT_SCOPE_RULES = `
PRIMA CLASSIFICA IL RUOLO DEL FILE: PREVENTIVO/OFFERTA FORNITORE, RELAZIONE TECNICA/PROGETTO, DOMANDA/DOSSIER, oppure ALTRO.
- Se è PREVENTIVO/OFFERTA FORNITORE, l'assenza di visura, dichiarazione PMI/ATECO, de minimis, titoli delle sedi, certificazioni artigiana/ESG, percentuale di contributo, moduli amministrativi o preventivi comparativi NON è un difetto grave del preventivo. Questi elementi appartengono normalmente al dossier del beneficiario.
- Tali elementi possono essere segnalati solo come WARN / DA ACQUISIRE NEL DOSSIER e NON devono abbassare A o B.
- Se la percentuale di contributo non è nel preventivo, C resta null salvo dato verificato fornito dall'utente; non creare una criticità HIGH/CRITICAL per questa assenza.
- A e B dipendono dal merito progettuale pertinente: AS-IS/TO-BE, innovazione rispetto allo stato attuale, integrazione, canali digitali di vendita e CRM, interoperabilità, KPI e ricadute misurabili, fattibilità, output e cronoprogramma.
- Se manca un fatto reale che non puoi inventare, etichettalo INPUT UTENTE NECESSARIO. Non confonderlo con un errore di scrittura.
- Se è RELAZIONE TECNICA/PROGETTO o DOMANDA/DOSSIER, valuta invece i requisiti coerenti con quella funzione documentale.
- Nella rianalisi di una versione revisionata non riproporre come difetti del preventivo le mancanze amministrative del dossier esterno.
`;

'''
    marker='const analysisSchema:any'
    if marker not in s: raise SystemExit('Backend analysis: schema marker non trovato')
    s=s.replace(marker,scope+marker,1)
# sostituisce solo il prompt di analisi
s,n=re.subn(r"const instructions=`Agisci come un istruttore pubblico molto severo.*?\\n\\n\$\{rules\}`;",
'''const instructions=`Agisci come un istruttore pubblico molto severo ma corretto rispetto alla funzione del documento. Cerca contestazioni reali senza pretendere che un singolo preventivo contenga l'intero dossier della domanda. Non premiare ciò che non è documentato nel file o nel contesto verificato. Distingui fatti, dati esterni da acquisire e vere lacune progettuali. Usa estimated_cut_eur solo con base concreta; altrimenti null.\n\n${DOCUMENT_SCOPE_RULES}\n\n${rules}`;''',s,count=1,flags=re.S)
if n==0 and 'molto severo ma corretto rispetto alla funzione del documento' not in s: raise SystemExit('Backend analysis: prompt non trovato')
# aggiunge contesto verificato al testo utente
if 'CONTESTO PROGETTO VERIFICATO' not in s:
    target="const contextNote=p.notes?`NOTE INTERNE METALLUFFICIO: ${String(p.notes).slice(0,3000)}\\n`:'';"
    if target in s:
        repl=target+"const projectContextNote=p.projectContext?`CONTESTO PROGETTO VERIFICATO: ${JSON.stringify(p.projectContext)}\\n`:'';"
        s=s.replace(target,repl,1)
        s=s.replace('${contextNote}DOCUMENTO DA VALUTARE:','${contextNote}${projectContextNote}DOCUMENTO DA VALUTARE:',1)
# rate da contesto UI
s=s.replace('const rawRate=a.document?.requested_contribution_rate??a.score.contribution_rate;','const rawRate=ctx?.requested_contribution_rate??a.document?.requested_contribution_rate??a.score.contribution_rate;')
s=s.replace('analysis=postProcess(analysis,bando,p.deterministicContext||{});',"if(p.projectContext?.requested_contribution_rate!=null&&analysis?.document)analysis.document.requested_contribution_rate=Number(p.projectContext.requested_contribution_rate);analysis=postProcess(analysis,bando,{...(p.deterministicContext||{}),...(p.projectContext||{})});")
# prompt rewrite DOCX convergente
s,n2=re.subn(r"const instructions=`Sei un redattore senior di progetti di finanza agevolata\..*?\\n\\n\$\{rules\}`;",
'''const instructions=`Sei un redattore senior di progetti di finanza agevolata. OBIETTIVO DI CONVERGENZA: una nuova analisi dello STESSO TIPO DI DOCUMENTO non deve riproporre criticità che potevano essere corrette testualmente. Risolvi tutte le criticità testualmente correggibili dell'analisi precedente. Non inventare fatti, numeri, certificazioni, date, baseline o target. Usa i DATI VERIFICATI forniti dall'utente; ciò che manca resta [DA COMPLETARE]. Se il file è un preventivo/offerta, NON inserire dichiarazioni amministrative del beneficiario: appartengono al dossier esterno. Per FESR sostituisci dove utile il copy promozionale con contenuto tecnico su obiettivi, AS-IS/TO-BE se supportato, architettura e integrazioni, ruolo delle dotazioni, licenze/durate se note, piano attività e deliverable, KPI e metodo di misura, cronoprogramma, output, test e collaudo. Mantieni ordine e struttura del documento.\n\n${DOCUMENT_SCOPE_RULES}\n\n${rules}`;''',s,count=1,flags=re.S)
if 'OBIETTIVO DI CONVERGENZA' not in s: raise SystemExit('Backend analysis: prompt rewrite non patchato')
if 'DATI VERIFICATI UTENTE:' not in s:
    s=s.replace("FILE: ${p.fileName||''}\\nANALISI PRECEDENTE:","FILE: ${p.fileName||''}\\nPERCENTUALE CONTRIBUTO VERIFICATA: ${p.requestedContributionRate??p.projectContext?.requested_contribution_rate??'non indicata'}\\nDATI VERIFICATI UTENTE: ${p.verifiedFacts||p.projectContext?.verified_facts||'nessuno'}\\nANALISI PRECEDENTE:",1)
write(p,s)

# 5) Backend PDF/XLSX rewrite: convergenza sul template originale
p='netlify/functions/valuta-template-async-background.mts'; s=read(p)
if 'OBIETTIVO DI CONVERGENZA' not in s:
    s,n=re.subn(r"const instructions=`Sei un redattore senior di progetti di finanza agevolata\..*?Per PDF:",
'''const instructions=`Sei un redattore senior di progetti di finanza agevolata. OBIETTIVO DI CONVERGENZA: una nuova analisi dello STESSO TIPO DI DOCUMENTO non deve riproporre criticità correggibili con una migliore formulazione. Non inventare fatti, numeri, date, certificazioni, baseline o target. Usa solo documento e DATI VERIFICATI UTENTE. Se un dato reale manca, usa [DA COMPLETARE]. Se è un PREVENTIVO/OFFERTA FORNITORE, non inserire visura, PMI/ATECO, de minimis, titoli sede, premialità o altri adempimenti del dossier beneficiario. Per FESR usa anche il copy promozionale generico come spazio per rafforzare obiettivi, AS-IS/TO-BE se supportato, architettura/interoperabilità, ruolo delle dotazioni e quantità, licenze/durate se note, piano attività/deliverable, KPI e metodo di misura, cronoprogramma, output tecnici, test e collaudo. ${rules}\n\nPer PDF:''',s,count=1,flags=re.S)
    if n==0: raise SystemExit('Template backend: prompt non trovato')
if 'DATI VERIFICATI UTENTE:' not in s:
    s=s.replace("FILE: ${p.fileName||''}\\nANALISI PRECEDENTE:","FILE: ${p.fileName||''}\\nPERCENTUALE CONTRIBUTO VERIFICATA: ${p.requestedContributionRate??'non indicata'}\\nDATI VERIFICATI UTENTE: ${p.verifiedFacts||'nessuno'}\\nANALISI PRECEDENTE:",1)
s=s.replace('Genera modifiche minime e mirate per rafforzare il progetto mantenendo il layout originale al 100% al di fuori dei soli testi sostituiti.','Risolvi tutte le criticità testualmente correggibili dell’analisi precedente mantenendo il layout originale al 100% al di fuori dei soli testi sostituiti. Non trasformare le mancanze del dossier amministrativo in testo artificiale del preventivo.')
write(p,s)

print('Patch convergenza applicata')
