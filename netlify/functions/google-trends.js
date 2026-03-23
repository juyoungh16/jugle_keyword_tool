exports.handler = async function(event) {
  try {
    const res = await fetch('https://trends.google.com/trending/rss?geo=KR');
    if (!res.ok) {
      throw new Error('Google Trends RSS fetch failed');
    }
    const xml = await res.text();
    
    // Parse XML using regex to avoid external dependencies
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
    const keywords = [];
    
    for (const match of items) {
      const itemXml = match[1];
      
      const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/);
      const trafficMatch = itemXml.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/);
      const newsMatch = itemXml.match(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/);
      
      if (titleMatch) {
        keywords.push({
          keyword: titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/, '$1').trim(),
          traffic: trafficMatch ? trafficMatch[1].replace(/,/g, '').replace(/\+/g, '').trim() : '0',
          traffic_str: trafficMatch ? trafficMatch[1].trim() : '0',
          news_title: newsMatch ? newsMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/, '$1').trim() : ''
        });
      }
    }
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords })
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
