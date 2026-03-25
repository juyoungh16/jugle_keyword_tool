// news-rss.js — 업계 RSS 피드 파싱
const RSS_FEEDS = {
  'tech': [
    'https://feeds.feedburner.com/TechCrunch',
    'https://www.zdnet.com/news/rss.xml',
    'https://bloter.net/feed',
    'https://www.itworld.co.kr/rss/all',
    'https://www.ciokorea.com/rss/all'
  ],
  'default': [
    'https://feeds.feedburner.com/TechCrunch',
    'https://bloter.net/feed',
    'https://zdnet.co.kr/rss/all'
  ]
};

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  
  let topic = 'tech';
  try { topic = JSON.parse(event.body).topic || 'tech'; } catch(e) {}
  
  const feeds = RSS_FEEDS['tech']; // topic 관계없이 기술 중심 피드 사용
  const articles = [];
  
  await Promise.all(feeds.map(async (feedUrl) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const res = await fetch(feedUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'JugleBot/1.0' }
      });
      clearTimeout(timeout);
      
      if (!res.ok) return;
      
      const xml = await res.text();
      const items = parseRSS(xml);
      articles.push(...items);
    } catch(e) {
      // 개별 피드 실패는 무시
    }
  }));
  
  // 중복 제거
  const seen = new Set();
  const unique = articles.filter(a => {
    if (seen.has(a.title)) return false;
    seen.add(a.title);
    return true;
  });

  // topic 키워드로 필터링 (tech가 아닐 때만)
  let filtered = unique;
  if (topic && topic !== 'tech') {
    const topicWords = topic.split(/[\s,]+/).filter(Boolean).map(w => w.toLowerCase());
    const relevant = unique.filter(a => {
      const hay = (a.title + ' ' + a.summary).toLowerCase();
      return topicWords.some(w => hay.includes(w));
    });
    // 관련 기사가 3개 이상이면 필터링 적용, 아니면 전체 반환
    filtered = relevant.length >= 3 ? relevant : unique;
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ articles: filtered.slice(0, 20), topic })
  };
};

function parseRSS(xml) {
  const items = [];
  const matches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
  
  for (const m of matches) {
    const itemXml = m[1];
    const title = extractTag(itemXml, 'title');
    const link = extractTag(itemXml, 'link') || extractTag(itemXml, 'guid');
    const desc = extractTag(itemXml, 'description') || extractTag(itemXml, 'summary') || '';
    
    if (title) {
      items.push({
        title: cleanCDATA(title),
        url: cleanCDATA(link),
        summary: cleanCDATA(desc).replace(/<[^>]+>/g, '').slice(0, 200)
      });
    }
  }
  
  return items;
}

function extractTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? m[1].trim() : '';
}

function cleanCDATA(str) {
  return str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}
