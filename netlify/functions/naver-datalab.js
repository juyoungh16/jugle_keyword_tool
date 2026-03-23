exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  
  let keywords = [];
  try {
    const body = JSON.parse(event.body);
    keywords = body.keywords || [];
  } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }
  
  if (!keywords.length) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Keywords array is empty' }) };
  }

  const CLIENT_ID = process.env.NAVER_DATALAB_CLIENT_ID;
  const CLIENT_SECRET = process.env.NAVER_DATALAB_CLIENT_SECRET;
  
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing Datalab credentials (NAVER_DATALAB_CLIENT_ID, NAVER_DATALAB_CLIENT_SECRET)' }) };
  }
  
  const end = new Date();
  const start = new Date(end.getTime() - 84 * 24 * 60 * 60 * 1000); // 12주(84일) 전
  const endDate = end.toISOString().split('T')[0];
  const startDate = start.toISOString().split('T')[0];
  
  // 데이터랩 한 번에 검색 가능한 키워드는 최대 5개이므로, 5개씩 청크(chunk)로 나눈다.
  const chunks = [];
  for (let i = 0; i < keywords.length; i += 5) {
    chunks.push(keywords.slice(i, i + 5));
  }
  
  const results = {};
  
  // 제한 초과를 방지하기 위해 순차적으로 호출 (for...of)
  for (const chunk of chunks) {
    const keywordGroups = chunk.map(k => ({
      groupName: k,
      keywords: [k]
    }));
    
    const body = {
      startDate,
      endDate,
      timeUnit: 'week',
      keywordGroups
    };
    
    try {
      const res = await fetch('https://openapi.naver.com/v1/datalab/search', {
        method: 'POST',
        headers: {
          'X-Naver-Client-Id': CLIENT_ID,
          'X-Naver-Client-Secret': CLIENT_SECRET,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.results) {
          for (const item of data.results) {
            const ratios = item.data.map(d => d.ratio);
            
            // 트렌드 분석 (마지막 4주 평균 - 처음 4주 평균)
            let trend = '➡️';
            if (ratios.length >= 8) {
              const first4 = ratios.slice(0, 4).reduce((a,b)=>a+b,0)/4;
              const last4 = ratios.slice(-4).reduce((a,b)=>a+b,0)/4;
              const slope = last4 - first4;
              if (slope > 15) trend = '상승';
              else if (slope < -15) trend = '하락';
            } else if (ratios.length > 0) {
              // 8주 미만 데이터일 때의 약간의 보정 (단순 마지막-첫번째 차이)
              const slope = ratios[ratios.length - 1] - ratios[0];
              if (slope > 15) trend = '상승';
              else if (slope < -15) trend = '하락'; 
            }
            results[item.title] = { ratios, trend };
          }
        }
      } else {
        const errText = await res.text();
        console.error('Naver Datalab API Error:', errText);
      }
    } catch (e) {
      console.error('Request Error:', e);
    }
  }
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(results)
  };
};
