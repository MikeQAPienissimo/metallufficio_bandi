// Logo ufficiale Metallufficio: sorgente locale al sito con fallback automatici.
// Questa logica viene caricata in ogni pagina di Metallufficio Quote e forza sempre lo stesso logo.
const MQ_LOGO_CANDIDATES=[
  '../metallufficio-logo.svg?v=20260908',
  '/metallufficio-logo.svg?v=20260908',
  'https://digitalizzazione2026.netlify.app/metallufficio-logo.svg?v=20260908'
];
window.MQ_LOGO=MQ_LOGO_CANDIDATES[0];
const MQ_LOGO=window.MQ_LOGO;

function MQ_installLogo(img){
  if(!img || img.dataset.mqLogoInstalled==='1') return;
  const src=img.getAttribute('src')||'';
  const isLogo=img.closest('.brand,.login-card-v2') || /metallufficio-logo|raw\.githubusercontent\.com.*metallufficio/i.test(src) || /Metallufficio/i.test(img.getAttribute('alt')||'');
  if(!isLogo) return;
  img.dataset.mqLogoInstalled='1';
  let idx=0;
  img.onerror=()=>{
    idx++;
    if(idx<MQ_LOGO_CANDIDATES.length) img.src=MQ_LOGO_CANDIDATES[idx];
  };
  img.src=MQ_LOGO_CANDIDATES[0];
}

function MQ_applyOfficialLogo(){
  document.querySelectorAll('img').forEach(MQ_installLogo);
}
window.MQ_applyOfficialLogo=MQ_applyOfficialLogo;

const MQ_logoObserver=new MutationObserver(()=>MQ_applyOfficialLogo());
MQ_logoObserver.observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',MQ_applyOfficialLogo);
else MQ_applyOfficialLogo();
