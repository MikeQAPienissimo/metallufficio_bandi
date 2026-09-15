declare const Netlify: any;

export default async () => {
  const configured = Boolean(Netlify.env.get('OPENAI_API_KEY'));
  const model = Netlify.env.get('OPENAI_MODEL') || 'gpt-5.6-terra';
  return new Response(JSON.stringify({
    ok: configured,
    service: 'valutatore-progetti',
    api_key_configured: configured,
    model
  }), {
    status: configured ? 200 : 503,
    headers: {'content-type':'application/json; charset=utf-8'}
  });
};

export const config = {
  path: '/api/valutatore-health'
};
