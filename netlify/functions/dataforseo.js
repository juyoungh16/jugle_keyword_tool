// dataforseo.js — DataForSEO Google 검색량 + KD 조회
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
  
  try {
    // Search Volume 조회
    const volRes = await fetch('https://api.dataforseo.com/v3/keywords_data/google/search_volume/live', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([{
        keywords: keywords.slice(0, 700), // DataForSEO 한 번에 최대 700개
        location_code: 2410, // 대한민국
        language_code: 'ko',
        date_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        date_to: new Date().toISOString().split('T')[0]
      }])
    });
    
    const result = {};
    
    if (volRes.ok) {
      const volData = await volRes.json();
      const items = volData?.tasks?.[0]?.result || [];
      for (const item of items) {
        result[item.keyword] = {
          volume_g: item.search_volume || 0,
          kd: item.keyword_difficulty || 0,
          competition: item.competition_level || 'UNSPECIFIED'
        };
      }
    }
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };
  } catch(e) {
    console.error('DataForSEO error:', e);
    return { statusCode: 200, body: JSON.stringify({ error: e.message, data: {} }) };
  }
};
