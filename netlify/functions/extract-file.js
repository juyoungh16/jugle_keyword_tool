// extract-file.js — PDF/DOCX/XLSX/PPTX 텍스트 추출
// npm 라이브러리 없이 순수 바이너리 파싱 (Netlify Functions 환경)
// PPTX/DOCX/XLSX는 ZIP 기반이므로 adm-zip 없이 최소한의 정규식 기반 파싱
const https = require('https');
const http = require('http');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    // Netlify Functions는 base64 인코딩된 바이너리를 받음
    const contentType = event.headers['content-type'] || '';
    
    // multipart/form-data 파싱
    if (contentType.includes('multipart/form-data')) {
      const boundary = contentType.split('boundary=')[1];
      const bodyBuffer = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
      
      const { fileName, fileBuffer, mimeType } = parseMultipart(bodyBuffer, boundary);
      
      let extractedText = '';
      
      if (mimeType.includes('pdf') || fileName.endsWith('.pdf')) {
        extractedText = extractTextFromPDF(fileBuffer);
      } else if (fileName.endsWith('.docx') || mimeType.includes('wordprocessingml')) {
        extractedText = extractTextFromZipXML(fileBuffer, 'word/document.xml', /<w:t[^>]*>(.*?)<\/w:t>/gs);
      } else if (fileName.endsWith('.pptx') || mimeType.includes('presentationml')) {
        extractedText = extractTextFromZipXML(fileBuffer, 'ppt/slides/slide', /<a:t>(.*?)<\/a:t>/gs);
      } else if (fileName.endsWith('.xlsx') || mimeType.includes('spreadsheetml')) {
        extractedText = extractTextFromZipXML(fileBuffer, 'xl/sharedStrings.xml', /<t[^>]*>(.*?)<\/t>/gs);
      } else {
        // 텍스트 기반 파일 (txt, csv 등)
        extractedText = fileBuffer.toString('utf8');
      }
      
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: extractedText.slice(0, 8000) }) // 최대 8000자
      };
    }
    
    return { statusCode: 400, body: JSON.stringify({ error: 'multipart/form-data 형식으로 전송해주세요.' }) };
  } catch(e) {
    console.error('extract-file error:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

function parseMultipart(buffer, boundary) {
  const boundaryBuf = Buffer.from('--' + boundary);
  const parts = [];
  let start = 0;
  
  for (let i = 0; i < buffer.length; i++) {
    if (buffer.slice(i, i + boundaryBuf.length).equals(boundaryBuf)) {
      if (start > 0) parts.push(buffer.slice(start, i - 2));
      start = i + boundaryBuf.length + 2;
    }
  }
  
  const part = parts[0] || buffer;
  const headerEnd = part.indexOf('\r\n\r\n');
  const headers = part.slice(0, headerEnd).toString();
  const fileBuffer = part.slice(headerEnd + 4);
  
  const nameMatch = headers.match(/filename="([^"]+)"/);
  const typeMatch = headers.match(/Content-Type: ([^\r\n]+)/);
  
  return {
    fileName: nameMatch ? nameMatch[1] : 'file',
    mimeType: typeMatch ? typeMatch[1] : 'application/octet-stream',
    fileBuffer
  };
}

function extractTextFromPDF(buffer) {
  // PDF의 스트림에서 BT...ET 사이의 텍스트를 추출
  const str = buffer.toString('latin1');
  const texts = [];
  const btMatches = str.matchAll(/BT([\s\S]*?)ET/g);
  for (const m of btMatches) {
    const tjMatches = m[1].matchAll(/\(([^)]*)\)\s*T[jJ]/g);
    for (const tj of tjMatches) {
      texts.push(tj[1].replace(/\\n/g, ' ').replace(/\\/g, ''));
    }
  }
  return texts.join(' ') || str.replace(/[^\x20-\x7E가-힣]/g, ' ').replace(/\s+/g, ' ');
}

function extractTextFromZipXML(buffer, targetPath, regex) {
  // ZIP 파일에서 중앙 디렉토리를 파싱하여 대상 파일의 압축 데이터를 찾음
  // 단순히 전체 버퍼를 UTF-8로 변환 후 XML 태그 파싱
  const str = buffer.toString('utf8', 0, Math.min(buffer.length, 500000));
  const texts = [];
  const matches = str.matchAll(regex);
  for (const m of matches) {
    if (m[1] && m[1].trim()) texts.push(m[1].trim());
  }
  return texts.join(' ');
}
