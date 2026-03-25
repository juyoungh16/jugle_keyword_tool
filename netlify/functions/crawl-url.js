// crawl-url.js — URL 본문 텍스트 크롤
exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  
  let url;
  try { url = JSON.parse(event.body).url; } catch(e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
  
  if (!url || !url.startsWith('http')) {
    return { statusCode: 400, body: JSON.stringify({ error: '유효한 URL이 아닙니다.' }) };
  }
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JugleBot/1.0; +https://jugle-keyword.netlify.app)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
      }
    });
    
    clearTimeout(timeout);
    
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return { statusCode: 200, body: JSON.stringify({ text: '', note: 'HTML 페이지가 아닙니다.' }) };
    }
    
    const html = await res.text();
    
    // HTML 태그 제거 및 주요 텍스트 추출
    const text = extractMainText(html);
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 8000) })
    };
  } catch(e) {
    const msg = e.name === 'AbortError' ? '연결 시간 초과 (8초)' : e.message;
    return { statusCode: 200, body: JSON.stringify({ text: '', error: msg }) };
  }
};

function extractMainText(html) {
  // 스크립트, 스타일, 내비게이션 등 불필요한 요소 제거
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  
  // meta 태그에서 title과 description 추출
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const descMatch = html.match(/meta[^>]*name="description"[^>]*content="([^"]+)"/i) ||
                   html.match(/meta[^>]*content="([^"]+)"[^>]*name="description"/i);
  
  const prefix = [
    titleMatch ? `[제목] ${titleMatch[1].trim()}` : '',
    descMatch ? `[설명] ${descMatch[1]}` : ''
  ].filter(Boolean).join('\n');
  
  return prefix + (prefix ? '\n\n' : '') + text;
}
