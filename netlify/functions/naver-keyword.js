const crypto = require('crypto');

exports.handler = async function(event, context) {
  const { hintKeyword } = event.queryStringParameters;
  if (!hintKeyword) {
    return { statusCode: 400, body: JSON.stringify({ error: 'hintKeyword is required' }) };
  }

  const API_KEY = process.env.NAVER_API_KEY;
  const SECRET_KEY = process.env.NAVER_SECRET_KEY;
  const CUSTOMER_ID = process.env.NAVER_CUSTOMER_ID;

  if (!API_KEY || !SECRET_KEY || !CUSTOMER_ID) {
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: 'Naver API 환경변수(API_KEY, SECRET_KEY, CUSTOMER_ID) 설정이 누락되었습니다.' }) 
    };
  }

  const timestamp = new Date().getTime().toString();
  const method = 'GET';
  const path = '/keywordstool';
  const message = timestamp + '.' + method + '.' + path;
  
  const hmac = crypto.createHmac('sha256', SECRET_KEY);
  hmac.update(message);
  const signature = hmac.digest('base64');

  try {
    // 쉼표로 구분된 키워드를 개별 hintKeywords 파라미터로 변환
    // 네이버 API는 공백 포함 키워드를 거부하므로 공백 제거 후 전송
    const keywords = hintKeyword
      .split(',')
      .map(k => k.trim().replace(/\s+/g, ''))
      .filter(Boolean)
      .slice(0, 5);
    const kwParams = keywords.map(k => `hintKeywords=${encodeURIComponent(k)}`).join('&');

    const response = await fetch(`https://api.naver.com/keywordstool?${kwParams}&showDetail=1`, {
      method: 'GET',
      headers: {
        'X-API-KEY': API_KEY,
        'X-Customer': CUSTOMER_ID,
        'X-Signature': signature,
        'X-Timestamp': timestamp
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      return { statusCode: response.status, body: JSON.stringify({ error: errText }) };
    }

    const data = await response.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
