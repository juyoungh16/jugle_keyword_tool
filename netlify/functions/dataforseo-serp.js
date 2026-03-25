// dataforseo-serp.js — DataForSEO SERP Google 상위 5개 결과
exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  
  const CLIENT_ID = process.env.DATAFORSEO_CLIENT_ID;
  const CLIENT_SECRET = process.env.DATAFORSEO_CLIENT_SECRET;
  
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'DATAFORSEO credentials not configured', data: {} })
    };
  }
  
  let keywords = [];
  try { keywords = JSON.parse(event.body).keywords || []; } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }
  
  if (!keywords.length) return { statusCode: 400, body: JSON.stringify({ error: 'keywords is empty' }) };
  
  const authHeader = 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  
  const result = {};
  
  // SERP는 키워드별 개별 요청 (API 제약) — 최대 10개만 처리
  const limited = keywords.slice(0, 10);
  
  await Promise.all(limited.map(async (kw) => {
    try {
      const res = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([{
          keyword: kw,
          location_code: 2410,
          language_code: 'ko',
          device: 'desktop',
          depth: 5
        }])
      });
      
      if (res.ok) {
        const data = await res.json();
        const items = data?.tasks?.[0]?.result?.[0]?.items || [];
        result[kw] = items
          .filter(item => item.type === 'organic')
          .slice(0, 5)
          .map(item => ({ title: item.title, url: item.url }));
      }
    } catch(e) {}
  }));
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result)
  };
};
