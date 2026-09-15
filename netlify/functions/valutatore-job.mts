import { getStore, getDeployStore } from '@netlify/blobs';
declare const Netlify: any;

function store(){
  const prod = Netlify.context?.deploy?.context === 'production';
  return prod ? getStore('valutatore-jobs',{consistency:'strong'}) : getDeployStore('valutatore-jobs');
}

export default async (req:Request) => {
  if(req.method !== 'GET') return new Response(JSON.stringify({error:'Metodo non consentito'}),{status:405,headers:{'content-type':'application/json'}});
  const url=new URL(req.url);const id=String(url.searchParams.get('id')||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80);
  if(!id) return new Response(JSON.stringify({error:'ID job mancante'}),{status:400,headers:{'content-type':'application/json'}});
  const data=await store().get(`job-${id}`,{type:'json'});
  if(!data) return new Response(JSON.stringify({status:'pending'}),{status:404,headers:{'content-type':'application/json'}});
  return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
};

export const config = { path:'/api/valutatore-job' };
