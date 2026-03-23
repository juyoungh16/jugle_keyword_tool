// ============================================================
// Jugle — main.js
// ============================================================
// 섹션 구조:
//   1. 전역 상태 & 상수
//   2. Intent / 유틸 헬퍼
//   3. 네비게이션
//   4. Intent 필터 (테이블 인라인)
//   5. 체크박스 선택 저장
//   6. 테이블 헤더 생성
//   7. 키워드 비교 (compareSelected)
//   8. 케밥 메뉴
//   9. 트렌드 탐색 (exploreTrend / renderTrendCards)
//  10. 키워드 확장 (expandLongtail / renderLongtailTable)
//  11. 저장함 (renderSaved)
//  12. 콘텐츠 전략 (generateTopicCluster / renderTopicCluster)
//  13. Claude API
//  14. API 키 관리 / 백업
//  15. 초기화
// ============================================================


// ── 전역 상태 ────────────────────────────────────────────────
let savedKeywords = JSON.parse(localStorage.getItem('jugle_keywords')||'[]');
let sessions = parseInt(localStorage.getItem('jugle_sessions')||'0');
let currentIntentFilter = 'all';
let openKebab = null;
let openIntentDropdown = null;
// 테이블별 인텐트 필터 상태
const tableIntentFilter = {};

// ── Intent 정의 ───────────────────────────────────────────────
const INTENTS = {
  '인지':{ cls:'ip-인지', color:'var(--인지-c)' },
  '고려':{ cls:'ip-고려', color:'var(--고려-c)' },
  '전환':{ cls:'ip-전환', color:'var(--전환-c)' },
};
function intentPill(code, tableId, rowIdx) {
  const i = INTENTS[code]||INTENTS['인지'];
  const clickAttr = tableId ? `onclick="openIntentFilter('${tableId}', '${code}', this, event)"` : '';
  return `<span class="intent-pill ${i.cls}" ${clickAttr} title="클릭해 필터링">${code}</span>`;
}
function kdColor(v){ return v<=30?'#059669':v<=60?'#D97706':'#DC2626'; }
function kdBar(v){ return `<div class="kd-wrap"><div class="kd-bar-bg"><div class="kd-bar" style="width:${v}%;background:${kdColor(v)}"></div></div><span class="kd-num" style="color:${kdColor(v)}">${v}</span></div>`; }
function fmtVol(v){ return v>=10000?(v/10000).toFixed(1)+'만':v>=1000?(v/1000).toFixed(1)+'천':String(v); }
function escStr(s){ return s.replace(/'/g,"\\'").replace(/"/g,'&quot;'); }

// ── 네비게이션 ────────────────────────────────────────────────
function showPage(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(item=>{
    if(item.getAttribute('onclick')?.includes("'"+id+"'")) item.classList.add('active');
  });
  if(id==='saved') renderSaved();
  closeAllKebabs(); closeAllIntentDropdowns();
}

// ── Intent 인라인 필터 (테이블 배지 클릭) ────────────────────
function openIntentFilter(tableId, intent, el, event) {
  event.stopPropagation();
  // 토글: 이미 같은 필터면 해제
  const current = tableIntentFilter[tableId];
  if(current === intent) {
    tableIntentFilter[tableId] = null;
  } else {
    tableIntentFilter[tableId] = intent;
  }
  applyTableIntentFilter(tableId);
}

function applyTableIntentFilter(tableId) {
  const filter = tableIntentFilter[tableId];
  const tbody = document.querySelector(`#${tableId} tbody`);
  if(!tbody) return;
  tbody.querySelectorAll('tr').forEach(row=>{
    const rowIntent = row.dataset.intent;
    row.style.display = (!filter || rowIntent===filter) ? '' : 'none';
  });
  // 필터 상태 표시 업데이트
  updateFilterBadge(tableId, filter);
}

function updateFilterBadge(tableId, filter) {
  const indicator = document.getElementById('filter-indicator-'+tableId);
  if(!indicator) return;
  if(filter) {
    const i = INTENTS[filter];
    indicator.textContent = filter + ' 필터 중 · 해제하려면 배지 다시 클릭';
    indicator.style.display = 'inline';
    indicator.className = 'intent-pill '+i.cls;
  } else {
    indicator.style.display = 'none';
  }
}

// ── 체크박스 선택 ─────────────────────────────────────────────
function updateSelectCount(tableId) {
  const checked = document.querySelectorAll(`#${tableId} tbody input.row-checkbox:checked`);
  const countEl = document.getElementById('sel-count-'+tableId);
  const compareBtn = document.getElementById('sel-compare-btn-'+tableId);
  const saveBtn = document.getElementById('sel-save-btn-'+tableId);
  if(countEl) countEl.textContent = checked.length;
  const canCompare = checked.length >= 2;
  if(compareBtn){ compareBtn.disabled=!canCompare; compareBtn.style.opacity=canCompare?'1':'0.4'; }
  if(saveBtn){ saveBtn.disabled=checked.length===0; saveBtn.style.opacity=checked.length>0?'1':'0.4'; }
}

function toggleAllRows(tableId, masterCb) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  tbody.querySelectorAll('tr:not([style*="none"]) input.row-checkbox').forEach(cb=>{
    cb.checked = masterCb.checked;
    cb.closest('tr').classList.toggle('row-selected', masterCb.checked);
  });
  updateSelectCount(tableId);
}

function toggleRow(tableId, cb) {
  cb.closest('tr').classList.toggle('row-selected', cb.checked);
  const master = document.getElementById('master-cb-'+tableId);
  const allCbs = document.querySelectorAll(`#${tableId} tbody tr:not([style*="none"]) input.row-checkbox`);
  if(master) master.checked = allCbs.length > 0 && [...allCbs].every(c=>c.checked);
  updateSelectCount(tableId);
}

function saveSelected(tableId) {
  const checked = document.querySelectorAll(`#${tableId} tbody input.row-checkbox:checked`);
  let count = 0;
  checked.forEach(cb=>{
    const row = cb.closest('tr');
    const kw = row.querySelector('.keyword-cell')?.textContent.trim();
    const intent = row.dataset.intent;
    if(kw && intent && !savedKeywords.some(k=>k.keyword===kw)) {
      savedKeywords.push({keyword:kw, intent, source:'선택저장', savedAt:new Date().toISOString()});
      count++;
    }
    cb.checked = false;
    row.classList.remove('row-selected');
  });
  const master = document.getElementById('master-cb-'+tableId);
  if(master) master.checked = false;
  localStorage.setItem('jugle_keywords', JSON.stringify(savedKeywords));
  updateSavedBadge(); updateSelectCount(tableId);
  showToast(count ? `${count}개 키워드 저장됨` : '이미 모두 저장됐어요.');
}

function clearSelection(tableId) {
  document.querySelectorAll(`#${tableId} tbody input.row-checkbox`).forEach(cb=>{
    cb.checked=false; cb.closest('tr').classList.remove('row-selected');
  });
  const master = document.getElementById('master-cb-'+tableId);
  if(master) master.checked=false;
  updateSelectCount(tableId);
}

// ── 테이블 공통 헤더 생성 ───────────────────────────────────
function makeTableHeader(tableId, cols) {
  let th = `<tr>
    <th style="width:36px"><input type="checkbox" class="th-checkbox" id="master-cb-${tableId}" onchange="toggleAllRows('${tableId}',this)"></th>`;
  cols.forEach(c=>{
    if(c.key==='intent') {
      th += `<th style="width:90px">
        <div style="display:flex;align-items:center;gap:4px">
          의도
          <span id="filter-indicator-${tableId}" class="intent-pill" style="display:none;font-size:10px;margin-left:4px"></span>
        </div>
      </th>`;
    } else if(c.sortable) {
      th += `<th class="sortable" onclick="sortTable('${tableId}','${c.key}',this)" style="${c.width?'width:'+c.width:''}"> ${c.label} <span class="sort-icon">↕</span></th>`;
    } else {
      th += `<th style="${c.width?'width:'+c.width:''}">${c.label}</th>`;
    }
  });
  th += `<th style="width:36px"></th></tr>`;
  return th;
}

// makeToolbar 제거 — result-summary 안에 통합
function makeToolbar(tableId) { return ''; }


// ── 키워드 비교 ───────────────────────────────────────────────
async function compareSelected(tableId){
  const checked = document.querySelectorAll(`#${tableId} tbody input.row-checkbox:checked`);
  if(checked.length < 2){ alert('2개 이상 선택해주세요.'); return; }
  const keywords = [];
  checked.forEach(cb=>{
    const row = cb.closest('tr');
    keywords.push({
      keyword: row.querySelector('.keyword-cell')?.textContent.trim(),
      intent: row.dataset.intent,
      volume: parseFloat(row.dataset.volume||0),
      kd: parseFloat(row.dataset.kd||0),
    });
  });

  const modal = document.getElementById('compare-modal');
  const body = document.getElementById('compare-body');
  modal.style.display='flex';

  const maxVol = Math.max(...keywords.map(k=>k.volume));
  const scores = keywords.map(kw=>Math.round((kw.volume/maxVol*50)+((100-kw.kd)/100*50)));

  body.innerHTML=`
    <!-- 시계열 트렌드 차트 -->
    <div style="margin-bottom:20px">
      <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.8px;font-weight:500;margin-bottom:10px">시간에 따른 관심도 변화 (AI 추론 기반)</div>
      <div style="position:relative;height:200px;"><canvas id="compare-chart"></canvas></div>
      <div style="display:flex;gap:14px;margin-top:10px;flex-wrap:wrap" id="chart-legend"></div>
    </div>
    <!-- 수치 비교 -->
    <div style="margin-bottom:20px">
      <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.8px;font-weight:500;margin-bottom:10px">수치 비교</div>
      <div class="kw-table-wrap">
        <table class="kw-table">
          <thead><tr><th>키워드</th><th>의도</th><th>Volume</th><th>KD %</th><th>우선순위 점수</th></tr></thead>
          <tbody>${keywords.map((kw,i)=>`<tr>
            <td class="keyword-cell">${kw.keyword}</td>
            <td>${intentPill(kw.intent)}</td>
            <td class="num-cell">${fmtVol(kw.volume)}</td>
            <td>${kdBar(kw.kd)}</td>
            <td><span style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700;color:${scores[i]>=70?'var(--green)':scores[i]>=40?'var(--amber)':'var(--red)'}">${scores[i]}</span><span class="text-xs">/100</span></td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>
    <!-- AI 분석 로딩 -->
    <div id="ai-analysis-wrap">
      <div class="loading-wrap" style="padding:20px"><div class="spinner"></div><div class="loading-text">AI 우선순위 분석 중…</div></div>
    </div>`;

  // Chart.js 라인 차트 그리기
  _drawCompareChart(keywords);

  // AI 분석 요청
  const kwList = keywords.map((k,i)=>`${k.keyword}(의도:${k.intent}, Volume:${fmtVol(k.volume)}, KD:${k.kd}, 점수:${scores[i]})`).join(', ');
  const prompt=`SEO 콘텐츠 전략가. 다음 키워드들을 비교하고 콘텐츠 작성 우선순위를 제안해주세요.
키워드: ${kwList}
JSON만: {"analysis":[{"keyword":"키워드","priority":1~${keywords.length},"reason":"우선순위 이유 20자","strategy":"콘텐츠 전략 한 줄"}],"overall_tip":"전체 전략 팁 1~2문장"}`;

  const response = await callClaude(prompt);
  const wrap = document.getElementById('ai-analysis-wrap');
  if(!wrap) return;
  if(!response){ wrap.innerHTML='<div class="text-xs" style="color:var(--text3)">AI 분석을 불러오지 못했어요. 수치 비교를 참고하세요.</div>'; return; }
  try{
    const data = JSON.parse(response.replace(/```json|```/g,'').trim());
    const sorted = [...data.analysis].sort((a,b)=>a.priority-b.priority);
    wrap.innerHTML=`
      <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.8px;font-weight:500;margin-bottom:10px">AI 우선순위 분석</div>
      <div class="banner banner-info" style="margin-bottom:12px"><span>💡</span><span>${data.overall_tip}</span></div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${sorted.map((a,i)=>`
          <div style="display:flex;align-items:flex-start;gap:12px;padding:11px 14px;background:var(--bg3);border-radius:9px;border-left:3px solid ${i===0?'var(--accent)':i===1?'var(--green)':'var(--border2)'}">
            <span style="font-family:'Syne',sans-serif;font-size:18px;font-weight:800;color:${i===0?'var(--accent)':i===1?'var(--green)':'var(--text3)'};min-width:20px;line-height:1.2">${a.priority}</span>
            <div>
              <div style="font-size:13px;font-weight:500;margin-bottom:3px">${a.keyword}</div>
              <div class="text-xs" style="margin-bottom:2px">📌 ${a.reason}</div>
              <div class="text-xs" style="color:var(--accent)">→ ${a.strategy}</div>
            </div>
          </div>`).join('')}
      </div>`;
  } catch {
    wrap.innerHTML='<div class="text-xs" style="color:var(--text3)">AI 분석 결과를 처리하지 못했어요.</div>';
  }
}

function _drawCompareChart(keywords){
  // 구글 트렌드 스타일 시계열 차트
  // 12개월치 AI 추론 데이터 생성 (Volume 기반 노이즈 추가)
  const months = ['3월','4월','5월','6월','7월','8월','9월','10월','11월','12월','1월','2월'];
  const COLORS = ['#2563EB','#DC2626','#059669','#D97706','#7C3AED','#DB2777'];

  const datasets = keywords.map((kw, i)=>{
    const base = Math.round((kw.volume / Math.max(...keywords.map(k=>k.volume))) * 80) + 10;
    // 시드 기반 의사 랜덤으로 일관된 파형 생성
    const seed = kw.keyword.split('').reduce((a,c)=>a+c.charCodeAt(0),0);
    const data = months.map((_,mi)=>{
      const noise = Math.sin(seed+mi*1.7)*12 + Math.cos(seed*0.3+mi*2.3)*8;
      return Math.max(5, Math.min(100, Math.round(base + noise)));
    });
    return {
      label: kw.keyword,
      data,
      borderColor: COLORS[i % COLORS.length],
      backgroundColor: COLORS[i % COLORS.length]+'22',
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5,
      tension: 0.4,
      fill: false,
    };
  });

  // 범례
  const legendEl = document.getElementById('chart-legend');
  if(legendEl){
    legendEl.innerHTML = keywords.map((kw,i)=>`
      <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text2)">
        <span style="width:20px;height:2.5px;background:${COLORS[i%COLORS.length]};border-radius:2px;display:inline-block"></span>
        ${kw.keyword}
      </span>`).join('');
  }

  // Chart.js 로드 후 그리기
  if(window.Chart){
    _renderChart(months, datasets);
  } else {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
    script.onload = () => _renderChart(months, datasets);
    document.head.appendChild(script);
  }
}

function _renderChart(labels, datasets){
  const canvas = document.getElementById('compare-chart');
  if(!canvas) return;
  if(window._compareChartInstance){ window._compareChartInstance.destroy(); }
  window._compareChartInstance = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode:'index', intersect:false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}`
          }
        }
      },
      scales: {
        x: {
          grid: { color:'rgba(0,0,0,0.05)' },
          ticks: { font:{ size:11 }, color:'#9CA3AF' }
        },
        y: {
          min: 0, max: 100,
          grid: { color:'rgba(0,0,0,0.05)' },
          ticks: { font:{ size:11 }, color:'#9CA3AF', stepSize:20 }
        }
      }
    }
  });
}

function closeCompareModal(){ document.getElementById('compare-modal').style.display='none'; if(window._compareChartInstance){ window._compareChartInstance.destroy(); window._compareChartInstance=null; } }

function toggleKebab(id, event) {
  event.stopPropagation();
  const menu = document.getElementById('kebab-'+id);
  if(!menu) return;
  const wasOpen = menu.classList.contains('open');
  closeAllKebabs();
  if(!wasOpen) { menu.classList.add('open'); openKebab=id; }
}
function closeAllKebabs() {
  document.querySelectorAll('.kebab-menu.open').forEach(m=>m.classList.remove('open'));
  openKebab=null;
}
function closeAllIntentDropdowns() {
  document.querySelectorAll('.intent-dropdown.open').forEach(d=>d.classList.remove('open'));
  openIntentDropdown=null;
}
document.addEventListener('click', ()=>{ closeAllKebabs(); closeAllIntentDropdowns(); });

function kebabLongtail(keyword) {
  closeAllKebabs();
  document.getElementById('seed-keyword').value=keyword;
  showPage('longtail');
  setTimeout(()=>expandLongtail(), 150);
}
function makeKebab(id, keyword, intent, source, isSaved) {
  const saveLabel = isSaved ? '✓ 저장됨' : '💾 저장';
  const saveStyle = isSaved ? 'color:var(--green)' : '';
  return `<div class="kebab-wrap">
    <button class="kebab-btn" onclick="toggleKebab('${id}',event)">⋮</button>
    <div class="kebab-menu" id="kebab-${id}">
      <div class="kebab-item" style="${saveStyle}" onclick="kebabSave('${escStr(keyword)}','${intent||''}','${source||''}',this)">${saveLabel}</div>
      <div class="kebab-divider"></div>
      <div class="kebab-item" onclick="kebabLongtail('${escStr(keyword)}')">🌿 롱테일 확장</div>
    </div>
  </div>`;
}

function kebabSave(keyword, intent, source, el) {
  closeAllKebabs();
  const idx = savedKeywords.findIndex(k=>k.keyword===keyword);
  if(idx>=0) {
    savedKeywords.splice(idx,1);
    el.textContent='💾 저장'; el.style.color='';
    showToast(`"${keyword}" 저장 해제`);
  } else {
    savedKeywords.push({keyword, intent, source, savedAt:new Date().toISOString()});
    el.textContent='✓ 저장됨'; el.style.color='var(--green)';
    showToast(`"${keyword}" 저장됨`);
  }
  localStorage.setItem('jugle_keywords', JSON.stringify(savedKeywords));
  updateSavedBadge();
}

// ── 트렌드 탐색 ───────────────────────────────────────────────
function selectTSeg(el){ document.querySelectorAll('.tseg').forEach(b=>b.classList.remove('active')); el.classList.add('active'); const isOther=el.dataset.val==='other'; document.getElementById('trend-other-input').style.display=isOther?'block':'none'; document.getElementById('trend-spacer').style.display=isOther?'none':'block'; }

function selectPlatform(el){
  document.querySelectorAll('#platform-switch .psw-btn').forEach(b=>b.classList.remove('active','active-naver'));
  const isGoogle = el.dataset.val==='google';
  el.classList.add(isGoogle ? 'active' : 'active-naver');
  // 기간 버튼: 구글만 활성화 (개수 선택 버튼은 건드리지 않도록 data-range 필터 추가)
  document.querySelectorAll('.range-btn[data-range]').forEach(b=>{
    if(b.dataset.range==='1m') return; // 1개월은 항상 활성
    b.disabled = !isGoogle;
  });
  document.getElementById('range-note').textContent = isGoogle
    ? '구글 트렌드: 기간별 관심도 비교 (상대값 0~100)'
    : '네이버: 최근 1개월 고정 · 구글 탭 선택 시 기간 조절 가능';
}

function selectRange(el){
  if(el.disabled) return;
  document.querySelectorAll('.range-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
}

function getCurrentPlatform(){ return document.querySelector('#platform-switch .psw-btn.active, #platform-switch .psw-btn.active-naver')?.dataset.val==='google'?'구글':'네이버'; }
function getCurrentRange(){ return document.querySelector('.range-btn.active')?.dataset.range||'1m'; }

function selectCount(el){
  document.querySelectorAll('[data-count]').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
}
function getCurrentCount(){ return parseInt(document.querySelector('[data-count].active')?.dataset.count||'10'); }

async function exploreTrend(){
  const activeSeg=document.querySelector('.tseg.active');
  let category=activeSeg?.dataset.val==='other'?document.getElementById('trend-other-input').value.trim():'IT/테크';
  if(!category){alert('분야를 입력해주세요.');return;}
  const platform=getCurrentPlatform();
  const range=getCurrentRange();
  const count=getCurrentCount();
  const rangeLabel={'7d':'최근 7일','1m':'최근 1개월','3m':'최근 3개월','12m':'최근 12개월'}[range];
  const result=document.getElementById('trend-result');
  result.innerHTML=`<div class="card"><div class="loading-wrap"><div class="spinner"></div><div class="loading-text">${platform} · ${category} 트렌드 분석 중… (${count}개)</div></div></div>`;
  sessions++; localStorage.setItem('jugle_sessions',sessions);

  const prompt=`한국 IT/테크 SEO 전문가. ${platform} 기준 "${category}" 분야에서 ${rangeLabel} 동안 검색량이 높거나 급상승한 트렌드 키워드 ${count}개를 분석해주세요.

반드시 JSON만 출력하세요 (설명 없이):
{"platform":"${platform}","category":"${category}","range":"${rangeLabel}","keywords":[
  {"keyword":"키워드","intent":"인지|고려|전환","volume":숫자,"reason":"급상승 이유 20자 이내","related":["연관키워드1","연관키워드2","연관키워드3","연관키워드4","연관키워드5"]}
]}
- volume: ${platform==='네이버'?'네이버 월간 검색량 절댓값 추정(PC+모바일 합산)':'구글 트렌드 관심도 기반 추정 검색량'}
- related: 이 키워드와 함께 검색되는 연관 키워드 5개 (짧고 간결하게)`;

  const response=await callClaude(prompt); if(!response) return;
  try{
    let cleanJson = response.replace(/```json|```/g,'').trim();
    // AI 출력 초과로 JSON이 중간에 잘린 경우를 복구하기 위한 최후의 방어
    if (!cleanJson.endsWith("}")) {
      cleanJson = cleanJson.replace(/,([^,]*)$/, '') + "]}";
    }
    
    const data=JSON.parse(cleanJson);
    data.range=rangeLabel;
    
    if (data.platform === '네이버') {
      const totalKws = data.keywords.length;
      result.innerHTML=`<div class="card"><div class="loading-wrap"><div class="spinner"></div><div class="loading-text" id="api-progress">네이버 API 연동 중… (0/${totalKws})</div></div></div>`;
      
      // 5개 단위 청크
      const kwChunks = [];
      for (let i = 0; i < totalKws; i += 5) {
        kwChunks.push(data.keywords.slice(i, i + 5));
      }
      
      let processed = 0;
      for (const chunk of kwChunks) {
        const hintKeywords = chunk.map(k => k.keyword.replace(/[^a-zA-Z0-9가-힣\s]/g, '')).filter(k=>k).join(',');
        const keywordsOnly = chunk.map(k => k.keyword);
        
        let p1 = Promise.resolve();
        let p2 = Promise.resolve();
        
        if (hintKeywords) {
          p1 = fetch(`/.netlify/functions/naver-keyword?hintKeyword=${encodeURIComponent(hintKeywords)}`)
               .then(res => res.ok ? res.json() : null).catch(() => null);
        }
        p2 = fetch('/.netlify/functions/naver-datalab', {
          method: 'POST', body: JSON.stringify({ keywords: keywordsOnly })
        }).then(res => res.ok ? res.json() : null).catch(() => null);

        const [apiData, dlData] = await Promise.all([p1, p2]);

        if (apiData && apiData.keywordList) {
          for (const kw of chunk) {
            const cleanKw = kw.keyword.replace(/ /g,'');
            const exact = apiData.keywordList.find(k => k.relKeyword.replace(/ /g,'') === cleanKw);
            if (exact) {
              const pc = typeof exact.monthlyPcQcCnt === 'number' ? exact.monthlyPcQcCnt : 10;
              const mo = typeof exact.monthlyMobileQcCnt === 'number' ? exact.monthlyMobileQcCnt : 10;
              kw.volume = pc + mo;
              kw.isRealData = true;
            }
          }
        }
        if (dlData) {
          for (const kw of chunk) {
            if (dlData[kw.keyword]) {
              kw.sparkline = dlData[kw.keyword].ratios;
              kw.trend = dlData[kw.keyword].trend;
            }
          }
        }
        
        processed += chunk.length;
        const progressEl = document.getElementById('api-progress');
        if (progressEl) progressEl.textContent = `네이버 API 연동 중… (${processed}/${totalKws})`;
        
        // Rate Limit (초당 검색광고 5회, 데이터랩 10회 방어) 딜레이
        await new Promise(r => setTimeout(r, 200));
      }
    }

    renderTrendCards(data);
  } catch(e){ result.innerHTML=`<div class="card"><div class="stream-box">${response}</div></div>`; }
}

// 스파크라인 SVG 생성
function makeSparkline(values, color){
  if(!values||!values.length) return '';
  const w=80, h=28, pad=2;
  const max=Math.max(...values,1);
  const min=Math.min(...values);
  const range=max-min||1;
  const pts=values.map((v,i)=>{
    const x=pad+(i/(values.length-1))*(w-pad*2);
    const y=h-pad-((v-min)/range)*(h-pad*2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  // 면적 채우기 경로
  const first=values.map((_,i)=>i===0)[0];
  const areaStart=`${pad.toFixed(1)},${(h-pad).toFixed(1)}`;
  const areaEnd=`${(w-pad).toFixed(1)},${(h-pad).toFixed(1)}`;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="flex-shrink:0">
    <polyline points="${areaStart} ${pts} ${areaEnd}" fill="${color}22" stroke="none"/>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${values.map((_,i)=>(pad+(i/(values.length-1))*(w-pad*2)).toFixed(1)).at(-1)}" cy="${(h-pad-((values.at(-1)-min)/range)*(h-pad*2)).toFixed(1)}" r="2.5" fill="${color}"/>
  </svg>`;
}

function renderTrendCards(data){
  const TID='trend-table';
  const result=document.getElementById('trend-result');
  const kws=data.keywords||[];
  tableIntentFilter[TID]=null;
  const platIcon=data.platform==='네이버'?'🇰🇷':'🌐';

  const intentColor={'인지':'#0284C7','고려':'#CA8A04','전환':'#16A34A'};

  let html=`
    <div class="result-summary">
      <span>${platIcon} <strong>${data.platform}</strong> · ${data.category}</span>
      <span class="text-xs">📅 ${data.range||'최근 1개월'}</span>
      <span>총 <strong>${kws.length}개</strong></span>
      <span class="text-xs" style="color:${data.platform==='네이버'?'var(--green)':'var(--amber)'};background:${data.platform==='네이버'?'var(--green-lt)':'var(--amber-lt)'};padding:2px 7px;border-radius:4px;border:1px solid ${data.platform==='네이버'?'#BBF7D0':'#FDE68A'};">${data.platform==='네이버'?'📊 네이버 실제 데이터':'⚠️ AI 추론'}</span>
      <div class="result-actions">
        <button class="btn btn-secondary btn-sm" id="sel-compare-btn-${TID}" onclick="compareSelected('${TID}')" disabled style="opacity:0.4">⚖️ 비교 (<span id="sel-count-${TID}">0</span>)</button>
        <button class="btn btn-secondary btn-sm" id="sel-save-btn-${TID}" onclick="saveSelected('${TID}')" disabled style="opacity:0.4">💾 선택 저장</button>
        <button class="btn btn-secondary btn-sm" onclick="saveAllTrend()">+ 전체 저장</button>
      </div>
    </div>
    <div class="kw-table-wrap">
      <table class="kw-table" id="${TID}">
        <thead><tr>
          <th style="width:36px"><input type="checkbox" class="th-checkbox" id="master-cb-${TID}" onchange="_trendMasterCheck(this)"></th>
          <th>키워드</th>
          <th style="width:70px">의도</th>
          <th style="width:90px">${data.platform==='네이버'?'12주 추이':'24h 추이'}</th>
          <th style="width:110px">검색량</th>
          <th>급상승 이유</th>
          <th>연관 키워드</th>
          <th style="width:36px"></th>
        </tr></thead>
        <tbody>`;

  kws.forEach((kw,idx)=>{
    const isSaved=savedKeywords.some(k=>k.keyword===kw.keyword);
    const ic=intentColor[kw.intent]||'#64748B';
    const related=(kw.related||[]);
    const spark=makeSparkline(kw.sparkline||genSparkline(kw.volume), ic);
    
    html+=`<tr data-volume="${kw.volume}" data-kd="0" data-intent="${kw.intent}" id="tr-${TID}-${idx}">
      <td><input type="checkbox" class="row-checkbox" onchange="_trendRowCheck('${TID}',this)"></td>
      <td class="keyword-cell" style="font-weight:500">${kw.keyword}</td>
      <td>${intentPill(kw.intent)}</td>
      <td style="padding:8px 12px">${spark}</td>
      <td class="num-cell">${fmtVol(kw.volume)}</td>
      <td class="text-xs" style="color:var(--text2);line-height:1.4">${kw.reason||'-'}</td>
      <td style="padding:10px 12px">
        <div style="display:flex;flex-wrap:wrap;gap:4px">
          ${related.map(r=>`<span style="font-size:10px;padding:2px 7px;background:var(--bg3);border-radius:10px;color:var(--text2);cursor:pointer;white-space:nowrap;border:1px solid var(--border)"
            onclick="kebabLongtail('${escStr(r)}')" title="${r}으로 키워드 확장">${r}</span>`).join('')}
        </div>
      </td>
      <td>${makeKebab('t'+idx,kw.keyword,kw.intent,'트렌드탐색',isSaved)}</td>
    </tr>`;
  });

  html+=`</tbody></table></div>`;
  result.innerHTML=html;
}

// 검색량 기반 의사 스파크라인 생성 (API 없을 때)
function genSparkline(volume){
  const seed=volume%997;
  return Array.from({length:24},(_,i)=>{
    const base=50+Math.round(Math.sin(seed*0.1+i*0.8)*18+Math.cos(seed*0.2+i*0.5)*12);
    return Math.max(5,Math.min(100,base));
  });
}

function _trendMasterCheck(masterCb){
  document.querySelectorAll('#trend-table tbody input.row-checkbox').forEach(cb=>{
    cb.checked=masterCb.checked;
  });
  _updateTrendSelCount();
}
function _trendRowCheck(TID, cb){
  const master=document.getElementById('master-cb-'+TID);
  const all=document.querySelectorAll(`#${TID} tbody input.row-checkbox`);
  if(master) master.checked=[...all].every(c=>c.checked);
  _updateTrendSelCount();
}
function _updateTrendSelCount(){
  const TID='trend-table';
  const checked=document.querySelectorAll(`#${TID} tbody input.row-checkbox:checked`);
  const countEl=document.getElementById('sel-count-'+TID);
  const compareBtn=document.getElementById('sel-compare-btn-'+TID);
  const saveBtn=document.getElementById('sel-save-btn-'+TID);
  if(countEl) countEl.textContent=checked.length;
  if(compareBtn){ compareBtn.disabled=checked.length<2; compareBtn.style.opacity=checked.length>=2?'1':'0.4'; }
  if(saveBtn){ saveBtn.disabled=checked.length===0; saveBtn.style.opacity=checked.length>0?'1':'0.4'; }
}

function saveAllTrend(){
  const rows=document.querySelectorAll('#trend-table tbody tr');
  let count=0;
  rows.forEach(row=>{
    const kw=row.querySelector('.keyword-cell')?.textContent.trim();
    const intent=row.dataset.intent;
    if(kw&&intent&&!savedKeywords.some(k=>k.keyword===kw)){
      savedKeywords.push({keyword:kw,intent,source:'트렌드탐색',savedAt:new Date().toISOString()});
      count++;
    }
  });
  localStorage.setItem('jugle_keywords',JSON.stringify(savedKeywords));
  updateSavedBadge();
  showToast(count?`${count}개 저장됨`:'이미 모두 저장됐어요.');
}

function demoTrend(){
  renderTrendCards({platform:'네이버',category:'IT/테크',range:'최근 1개월',keywords:[
    {keyword:'AI 코딩 도구',intent:'고려',volume:49500,
      reason:'Cursor·Copilot 경쟁 심화로 비교 검색 급증',
      related:['Cursor AI','GitHub Copilot','코드 자동완성'],
      sparkline:[42,45,43,48,55,62,70,75,78,80,82,79,75,72,68,65,70,74,80,85,88,90,87,82]},
    {keyword:'LLM 프롬프트 엔지니어링',intent:'인지',volume:33100,
      reason:'AI 도입 기업 증가로 실무 적용 방법 탐색',
      related:['프롬프트 작성법','ChatGPT 활용','Claude 사용법'],
      sparkline:[30,32,35,38,40,42,45,50,55,60,62,65,68,65,62,58,60,64,68,72,75,73,70,68]},
    {keyword:'Claude API 사용법',intent:'인지',volume:18200,
      reason:'Anthropic 신모델 출시 이후 관심 급증',
      related:['Anthropic API','Claude 3.5','API 키 발급'],
      sparkline:[20,22,25,28,32,38,45,50,55,58,60,62,60,58,55,52,55,58,62,65,68,70,68,65]},
    {keyword:'AI 에이전트 만들기',intent:'인지',volume:13200,
      reason:'자율 AI 에이전트 트렌드 확산',
      related:['LangChain','AutoGPT','AI 자동화'],
      sparkline:[25,28,30,35,40,45,50,55,58,60,62,65,68,65,62,58,60,62,65,68,70,72,70,68]},
    {keyword:'Cursor 구독 신청',intent:'전환',volume:27100,
      reason:'Cursor Pro 기능 확대 후 전환 사용자 증가',
      related:['Cursor 가격','Cursor Pro','Cursor 무료'],
      sparkline:[35,38,40,45,52,60,68,75,80,82,85,88,85,82,78,75,78,82,85,88,90,92,90,88]},
    {keyword:'RAG 구현 방법',intent:'인지',volume:22000,
      reason:'기업 AI 도입 시 RAG 파이프라인 수요',
      related:['벡터DB','LangChain RAG','임베딩'],
      sparkline:[18,20,22,25,28,32,38,42,45,48,50,52,50,48,45,42,45,48,50,52,55,53,50,48]},
    {keyword:'ChatGPT API 가격',intent:'인지',volume:40500,
      reason:'OpenAI 가격 정책 변경으로 비교 검색 증가',
      related:['GPT-4 가격','OpenAI 요금제','Claude API 비교'],
      sparkline:[50,52,55,58,62,68,72,75,78,80,82,80,78,75,72,70,72,75,78,80,82,80,78,75]},
    {keyword:'벡터DB 비교',intent:'고려',volume:9900,
      reason:'RAG 파이프라인 구축 증가로 DB 선택 탐색',
      related:['Pinecone','Weaviate','ChromaDB'],
      sparkline:[15,17,19,22,25,28,32,35,38,40,42,45,42,40,38,35,38,40,42,45,47,45,42,40]},
    {keyword:'GitHub Copilot 무료체험',intent:'전환',volume:16500,
      reason:'무료 플랜 출시 이후 체험 사용자 급증',
      related:['Copilot 무료','VS Code 확장','Copilot 설정'],
      sparkline:[28,30,32,35,40,45,50,55,58,60,62,65,62,60,58,55,58,60,62,65,68,66,63,60]},
    {keyword:'AI 개발 스택 추천',intent:'고려',volume:14400,
      reason:'풀스택 AI 개발 관심으로 기술 스택 탐색',
      related:['LangChain','FastAPI','Next.js AI'],
      sparkline:[22,24,26,28,32,36,40,44,46,48,50,52,50,48,46,44,46,48,50,52,54,52,50,48]},
  ]});
}

// ── 롱테일 확장 ───────────────────────────────────────────────
async function expandLongtail(){
  const seeds=document.getElementById('seed-keyword').value.trim();
  if(!seeds){alert('씨앗 키워드를 입력해주세요.');return;}
  const result=document.getElementById('longtail-result');
  result.innerHTML=`<div class="card"><div class="loading-wrap"><div class="spinner"></div><div class="loading-text">네이버 검색광고 API에서 "${seeds}" 연관 키워드 조회 중…</div></div></div>`;
  sessions++; localStorage.setItem('jugle_sessions',sessions);
  
  try {
    // 쉼표로 나눈 첫 번째 키워드를 사용하되 특수문자는 제거 (네이버 검색광고 API 에러 방지)
    const rawKeyword = seeds.split(',')[0].trim();
    const hintKeyword = rawKeyword.replace(/[^a-zA-Z0-9가-힣\s]/g, '');
    const res = await fetch(`/.netlify/functions/naver-keyword?hintKeyword=${encodeURIComponent(hintKeyword)}`);
    
    if (!res.ok) {
      const errInfo = await res.json();
      throw new Error(errInfo.error || 'API 연동 오류');
    }
    
    const data = await res.json();
    if (!data.keywordList || data.keywordList.length === 0) {
      result.innerHTML = `<div class="card"><div class="text-xs">관련 키워드가 없습니다.</div></div>`;
      return;
    }
    
    // 네이버 검색광고 API 결과 가공 (최대 40개)
    const keywords = data.keywordList.slice(0, 40).map(k => {
      // 10 미만 값('< 10' 등 문자열)은 숫자 10으로 취급
      const pc = typeof k.monthlyPcQcCnt === 'number' ? k.monthlyPcQcCnt : 10;
      const mo = typeof k.monthlyMobileQcCnt === 'number' ? k.monthlyMobileQcCnt : 10;
      const vol = pc + mo;
      
      const compMap = {'높음': 80, '중간': 50, '낮음': 20};
      const kd = compMap[k.compIdx] || 50;
      
      // 인텐트 규칙 기반 판단 (AI 추론 대신)
      let intent = '인지';
      const kw = k.relKeyword;
      if (/(가격|비용|신청|다운|할인|구매|가입|예약|판매|견적)/.test(kw)) intent = '전환';
      else if (/(추천|비교|후기|차이|순위|리뷰|장단점|베스트)/.test(kw)) intent = '고려';
      
      return { keyword: kw, intent, volume: vol, kd };
    });
    
    // 검색량 순 정렬
    keywords.sort((a, b) => b.volume - a.volume);
    
    // 데이터랩 API 연동 (12주 트렌드 스파크라인 및 방향)
    try {
      const dlRes = await fetch('/.netlify/functions/naver-datalab', {
        method: 'POST',
        body: JSON.stringify({ keywords: keywords.map(k => k.keyword) })
      });
      if (dlRes.ok) {
        const dlData = await dlRes.json();
        for (let kw of keywords) {
          if (dlData[kw.keyword]) {
            kw.sparkline = dlData[kw.keyword].ratios;
            kw.trend = dlData[kw.keyword].trend;
          }
        }
      }
    } catch(e) {
      console.error('Datalab Error in expandLongtail:', e);
    }
    
    renderLongtailTable({ keywords }, seeds);
  } catch(e) {
    result.innerHTML=`<div class="card"><div class="stream-box">오류: ${e.message}<br><br>※ Netlify 환경변수(NAVER_API_KEY, NAVER_SECRET_KEY, NAVER_CUSTOMER_ID)가 정상적으로 설정되었는지 확인하세요.</div></div>`;
  }
}

function renderLongtailTable(data,seeds){
  const TID='lt-table';
  const result=document.getElementById('longtail-result');
  const kws=data.keywords||[];
  tableIntentFilter[TID]=null;
  const counts={'인지':0,'고려':0,'전환':0};
  kws.forEach(k=>{if(counts[k.intent]!==undefined) counts[k.intent]++;});
  let html=`
    <div class="result-summary">
      <span>🌱 <strong>"${seeds}"</strong> 확장 · 총 <strong>${kws.length}개</strong></span>
      <span>${Object.entries(counts).filter(([,v])=>v>0).map(([k,v])=>`<span class="intent-pill ${INTENTS[k].cls}">${k} ${v}</span>`).join(' ')}</span>
      <span class="text-xs" style="color:var(--green);background:var(--green-lt);padding:2px 7px;border-radius:4px;border:1px solid #BBF7D0;">✅ 실제 검색량</span>
      <div class="result-actions">
        <button class="btn btn-secondary btn-sm" id="sel-compare-btn-${TID}" onclick="compareSelected('${TID}')" disabled style="opacity:0.4">⚖️ 비교 (<span id="sel-count-${TID}">0</span>)</button>
        <button class="btn btn-secondary btn-sm" id="sel-save-btn-${TID}" onclick="saveSelected('${TID}')" disabled style="opacity:0.4">💾 선택 저장</button>
        <button class="btn btn-secondary btn-sm" onclick="saveAllVisible('${TID}')">+ 전체 저장</button>
      </div>
    </div>
    <div class="kw-table-wrap">
    <table class="kw-table" id="${TID}">
      <thead>${makeTableHeader(TID,[
        {label:'키워드',key:'keyword'},
        {label:'의도',key:'intent'},
        {label:'Volume',key:'volume',sortable:true,width:'110px'},
        {label:'추이',key:'trend',sortable:false,width:'120px'},
        {label:'경쟁도',key:'kd',sortable:true,width:'150px'},
      ])}</thead>
      <tbody id="lt-tbody">`;
  kws.forEach((kw,idx)=>{
    const isSaved=savedKeywords.some(k=>k.keyword===kw.keyword);
    const sparkColor={'인지':'#0284C7','고려':'#CA8A04','전환':'#16A34A'}[kw.intent] || '#64748B';
    const trendHtml = kw.sparkline ? `<div style="display:flex;align-items:center;gap:6px">${makeSparkline(kw.sparkline, sparkColor)}</div>` : '-';
    
    html+=`<tr data-volume="${kw.volume}" data-kd="${kw.kd}" data-intent="${kw.intent}">
      <td><input type="checkbox" class="row-checkbox" onchange="toggleRow('${TID}',this)"></td>
      <td class="keyword-cell">${kw.keyword}</td>
      <td>${intentPill(kw.intent,TID,idx)}</td>
      <td class="num-cell">${fmtVol(kw.volume)}</td>
      <td style="padding:6px 12px;">${trendHtml}</td>
      <td>${kdBar(kw.kd)}</td>
      <td>${makeKebab('l'+idx,kw.keyword,kw.intent,'롱테일확장',isSaved)}</td>
    </tr>`;
  });
  html+=`</tbody></table></div>`;
  result.innerHTML=html;
}

function demoLongtail(){
  document.getElementById('seed-keyword').value='AI 코딩 도구';
  renderLongtailTable({keywords:[
    {keyword:'AI 코딩 도구란',intent:'인지',volume:8100,kd:25},
    {keyword:'AI 코딩 도구 추천',intent:'고려',volume:18200,kd:38},
    {keyword:'AI 코딩 도구 비교',intent:'고려',volume:12100,kd:42},
    {keyword:'AI 코딩 도구 무료',intent:'고려',volume:9900,kd:30},
    {keyword:'Cursor vs GitHub Copilot',intent:'고려',volume:14400,kd:45},
    {keyword:'AI 코딩 도구 사용법',intent:'인지',volume:6600,kd:28},
    {keyword:'개발자 AI 도구 추천',intent:'고려',volume:22000,kd:35},
    {keyword:'AI 코딩 도구 단점',intent:'인지',volume:4400,kd:22},
    {keyword:'AI 코딩 생산성 효과',intent:'인지',volume:5500,kd:32},
    {keyword:'Copilot 구독 가격',intent:'전환',volume:16500,kd:18},
    {keyword:'Cursor AI 다운로드',intent:'전환',volume:27100,kd:15},
    {keyword:'AI 코딩 도구 스타트업',intent:'고려',volume:3300,kd:20},
  ]},'AI 코딩 도구');
}

// ── 연관키워드 탐색 ───────────────────────────────────────────
// ── 저장함 ────────────────────────────────────────────────────
function renderSaved(){
  const list=document.getElementById('saved-list');
  const filtered=currentIntentFilter==='all'?savedKeywords:savedKeywords.filter(k=>k.intent===currentIntentFilter);
  if(!filtered.length){ list.innerHTML=`<div class="empty-state"><div class="empty-icon">📭</div><div style="font-size:13px">저장된 키워드가 없어요.</div></div>`; return; }
  list.innerHTML=`<div class="kw-table-wrap"><table class="kw-table">
    <thead><tr><th>키워드</th><th>의도</th><th>출처</th><th>저장일</th><th></th></tr></thead>
    <tbody>${filtered.map(kw=>`<tr>
      <td class="keyword-cell">${kw.keyword}</td>
      <td>${intentPill(kw.intent)}</td>
      <td class="text-xs">${kw.source||'-'}</td>
      <td class="text-xs">${new Date(kw.savedAt).toLocaleDateString('ko-KR')}</td>
      <td><button class="btn btn-ghost" style="color:var(--red);font-size:11px;padding:3px 7px" onclick="removeKeyword('${escStr(kw.keyword)}')">삭제</button></td>
    </tr>`).join('')}
    </tbody></table></div>`;
}
function removeKeyword(kw){ savedKeywords=savedKeywords.filter(k=>k.keyword!==kw); localStorage.setItem('jugle_keywords',JSON.stringify(savedKeywords)); updateSavedBadge();renderSaved(); }
function filterIntent(intent,el){ currentIntentFilter=intent; document.querySelectorAll('#intent-filters .intent-btn').forEach(b=>b.className='intent-btn'); el.className='intent-btn '+(intent==='all'?'f-all':'f-'+intent); renderSaved(); }

// ── 콘텐츠 전략 ───────────────────────────────────────────────
async function generateTopicCluster(){
  const keyword=document.getElementById('topic-keywords').value.trim();
  if(!keyword){alert('핵심 주제어를 입력해주세요.');return;}
  const result=document.getElementById('topic-result');
  result.innerHTML=`<div class="card"><div class="loading-wrap"><div class="spinner"></div><div class="loading-text">토픽 클러스터 맵 생성 중…</div></div></div>`;
  const prompt=`IT/테크 SEO. "${keyword}" 토픽 클러스터 맵.
JSON만: {"main_title":"대표 글 제목","clusters":[{"title":"Cluster 글 제목","keyword":"클러스터 키워드","intent":"인지|고려|전환","volume":숫자,"kd":숫자,"note":"한줄메모"}]}
cluster 9~12개. 인지/고려/전환 각 3~4개씩 균형있게.`;
  const response=await callClaude(prompt); if(!response) return;
  try{ const data=JSON.parse(response.replace(/```json|```/g,'').trim()); renderTopicCluster(data); }
  catch(e){ result.innerHTML=`<div class="card"><div class="stream-box">${response}</div></div>`; }
}

// ── renderGapHtml 함수 (단독 존재 필수) ──────────────────────
function renderGapHtml(items){
  const total = items.length || 1;
  const counts = {'인지':0,'고려':0,'전환':0};
  items.forEach(c=>{ if(counts[c.intent]!==undefined) counts[c.intent]++; });
  const ideal = {'인지':40,'고려':40,'전환':20};
  const actual = Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,Math.round(v/total*100)]));
  const gaps = Object.entries(ideal).filter(([k,v])=>(actual[k]||0)<v-10);
  const intentBg = {'인지':'var(--인지-c)','고려':'var(--고려-c)','전환':'var(--전환-c)'};
  const gapMsg = gaps.length
    ? `<strong>${gaps.map(([k])=>k).join(', ')}</strong> 키워드가 부족해요.`
    : '인지/고려/전환 비율이 균형 잡혀 있어요 👍';
  return `<div class="card">
    <div class="card-title">📊 인텐트 갭 분석</div>
    <div class="banner ${gaps.length?'banner-warning':'banner-success'}" style="margin-bottom:14px">
      <span>${gaps.length?'⚠️':'✅'}</span><span>${gapMsg}</span>
    </div>
    ${Object.entries(counts).map(([k])=>`<div class="gap-row">
      <span class="intent-pill ${INTENTS[k].cls}" style="min-width:40px">${k}</span>
      <div class="gap-bg"><div class="gap-bar" style="width:${actual[k]||0}%;background:${intentBg[k]}"></div></div>
      <span class="text-sm">${actual[k]||0}% <span class="text-xs">(권장 ${ideal[k]}%)</span></span>
    </div>`).join('')}
  </div>`;
}

function renderTopicCluster(data){
  const lanes = {'인지':[],'고려':[],'전환':[]};
  data.clusters.forEach(c=>{ if(lanes[c.intent]) lanes[c.intent].push(c); });
  const calItems = [...lanes['인지'],...lanes['고려'],...lanes['전환']];
  window._clusterData = data;
  // main_title 또는 pillar.title 중 있는 것 사용 (호환성)
  const mainTitle = data.main_title || data.pillar?.title || data.clusters[0]?.keyword || '클러스터 맵';

  document.getElementById('topic-result').innerHTML=`
    <div class="card">
      <div class="card-title">🗺️ 클러스터 맵 <span style="font-size:11px;color:var(--text3);font-weight:400;margin-left:6px">⚠️ AI 추론 기반</span></div>
      <div style="background:var(--accent);color:#fff;border-radius:10px;padding:14px 18px;margin-bottom:20px;font-weight:600;font-size:14px;text-align:center;">
        ${mainTitle}
      </div>
      <div style="display:flex;justify-content:center;gap:4px;margin-bottom:16px">
        ${Object.entries(lanes).map(([k,v])=>`<span class="intent-pill ${INTENTS[k].cls}">${k} ${v.length}편</span>`).join('')}
        <span class="text-xs" style="margin-left:6px">총 ${data.clusters.length}개</span>
      </div>
      <div class="funnel-lanes">
        ${['인지','고려','전환'].map(intent=>`
          <div class="funnel-lane">
            <div class="funnel-lane-header ${intent}">
              <span>${intent==='인지'?'🔵':intent==='고려'?'🟡':'🟢'}</span>
              <span>${intent}</span>
              <span style="margin-left:auto;font-size:10px;opacity:0.7">${lanes[intent].length}편</span>
            </div>
            <div class="funnel-lane-body">
              ${lanes[intent].map(c=>`
                <div class="funnel-item ${c.intent}">
                  <div class="funnel-item-title">${c.title}</div>
                  <div class="funnel-item-meta">
                    <span class="text-xs">🔍 ${fmtVol(c.volume)}</span>
                    <span class="text-xs">KD ${c.kd}</span>
                  </div>
                  <div class="text-xs" style="margin-top:4px;color:var(--text2)">${c.note}</div>
                </div>`).join('')}
            </div>
          </div>`).join('')}
      </div>
    </div>
    ${renderGapHtml(calItems)}
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div class="card-title" style="margin-bottom:0">📅 콘텐츠 캘린더</div>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:11px;color:var(--text3)">월간 발행 빈도</span>
          <div class="cal-freq-wrap" style="display:flex;gap:3px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:3px;">
            <button class="cal-freq-btn" style="padding:4px 10px" onclick="changeCalFreq(4,this)">월 4편</button>
            <button class="cal-freq-btn active" style="padding:4px 10px" onclick="changeCalFreq(8,this)">월 8편</button>
            <button class="cal-freq-btn" style="padding:4px 10px" onclick="changeCalFreq(12,this)">월 12편</button>
          </div>
        </div>
      </div>
      <div id="cal-table-wrap">${buildCalTable(calItems, 8)}</div>
    </div>`;
}

function changeCalFreq(freq, btn){
  btn.closest('.cal-freq-wrap').querySelectorAll('.cal-freq-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  if(!window._clusterData) return;
  const lanes={'인지':[],'고려':[],'전환':[]};
  window._clusterData.clusters.forEach(c=>{ if(lanes[c.intent]) lanes[c.intent].push(c); });
  const calItems=[...lanes['인지'],...lanes['고려'],...lanes['전환']];
  document.getElementById('cal-table-wrap').innerHTML = buildCalTable(calItems, freq);
}

function buildCalTable(clusters, freq){
  // freq = 월 총 편수 (4/8/12)
  const days = freq===4?['월요일']:freq===8?['월요일','목요일']:['월요일','수요일','금요일'];
  const weeksNeeded = Math.ceil(freq / days.length);
  const items = [];
  let ci = 0;
  for(let w=1; w<=weeksNeeded; w++){
    for(const day of days){
      if(ci < clusters.length){
        items.push({week:w, day, ...clusters[ci]});
        ci++;
      }
    }
  }
  return `<div class="kw-table-wrap"><table class="kw-table">
    <thead><tr><th>주차</th><th>요일</th><th>키워드</th><th>제목</th><th>의도</th><th>포맷</th></tr></thead>
    <tbody>${items.map(item=>`<tr>
      <td class="text-xs">${item.week}주차</td><td class="text-xs">${item.day}</td>
      <td style="font-size:12px;color:var(--accent);font-weight:500">${item.keyword}</td>
      <td style="font-size:13px">${item.title}</td>
      <td>${intentPill(item.intent)}</td>
      <td class="text-xs">${item.intent==='인지'?'가이드':item.intent==='고려'?'비교/리뷰':'랜딩/CTA'}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function demoTopicCluster(){
  document.getElementById('topic-keywords').value='AI 코딩 도구';
  renderTopicCluster({
    main_title:'AI 코딩 도구 완벽 가이드 2025',
    clusters:[
      {title:'AI 코딩 도구란?',keyword:'AI 코딩 도구란',intent:'인지',volume:8100,kd:25,note:'입문자 개념 설명'},
      {title:'AI 코딩 도구 작동 원리',keyword:'AI 코딩 도구 원리',intent:'인지',volume:4400,kd:22,note:'LLM 기반 코드 생성 원리'},
      {title:'AI 코딩 생산성 효과',keyword:'AI 코딩 생산성',intent:'인지',volume:5500,kd:30,note:'실제 생산성 향상 데이터'},
      {title:'Cursor vs GitHub Copilot 비교',keyword:'Cursor vs Copilot',intent:'고려',volume:14400,kd:45,note:'핵심 기능·가격 비교'},
      {title:'AI 코딩 도구 TOP 5 추천',keyword:'AI 코딩 도구 추천',intent:'고려',volume:18200,kd:38,note:'상황별 추천 가이드'},
      {title:'무료 AI 코딩 도구 비교',keyword:'AI 코딩 도구 무료',intent:'고려',volume:9900,kd:30,note:'무료 플랜 한계 분석'},
      {title:'스타트업용 AI 코딩 도구',keyword:'AI 코딩 도구 스타트업',intent:'고려',volume:3300,kd:20,note:'비용 대비 최적 선택'},
      {title:'Cursor AI 설치 및 시작하기',keyword:'Cursor AI 다운로드',intent:'전환',volume:27100,kd:15,note:'단계별 설치 가이드'},
      {title:'GitHub Copilot 요금제 신청',keyword:'Copilot 구독 가격',intent:'전환',volume:16500,kd:18,note:'요금제 비교 및 신청'},
      {title:'Claude Code 무료 시작',keyword:'Claude Code 무료',intent:'전환',volume:9900,kd:12,note:'무료 플랜 시작 방법'},
    ]
  });
}

function saveAllVisible(tableId){
  // 트렌드 탐색은 카드 방식
  if(tableId==='trend-table'){
    const cards = document.querySelectorAll('#trend-table-cards [id^="tcard-"]');
    let count=0;
    cards.forEach(card=>{
      const kwEl=card.querySelector('[style*="font-size:15px"]');
      const intent=card.dataset.intent;
      if(kwEl&&intent){
        const kw=kwEl.textContent.trim();
        if(!savedKeywords.some(k=>k.keyword===kw)){
          savedKeywords.push({keyword:kw,intent,source:'트렌드탐색',savedAt:new Date().toISOString()});
          count++;
        }
      }
    });
    localStorage.setItem('jugle_keywords',JSON.stringify(savedKeywords));
    updateSavedBadge();
    showToast(count?`${count}개 저장됨`:'이미 모두 저장됐어요.');
    return;
  }
  // 일반 테이블
  const rows=document.querySelectorAll(`#${tableId} tbody tr:not([style*="none"])`);
  let count=0;
  rows.forEach(row=>{
    const kw=row.querySelector('.keyword-cell')?.textContent.trim();
    const intent=row.dataset.intent;
    if(kw&&intent&&!savedKeywords.some(k=>k.keyword===kw)){
      savedKeywords.push({keyword:kw,intent,source:'전체저장',savedAt:new Date().toISOString()});
      count++;
    }
  });
  localStorage.setItem('jugle_keywords',JSON.stringify(savedKeywords));
  updateSavedBadge();showToast(count?`${count}개 저장됨`:'이미 모두 저장됐어요.');
}

// ── 테이블 정렬 ───────────────────────────────────────────────
function sortTable(tableId,col,th){
  const table=document.getElementById(tableId); if(!table) return;
  const tbody=table.querySelector('tbody');
  const rows=Array.from(tbody.querySelectorAll('tr'));
  const dir=th.classList.contains('sort-asc')?'desc':'asc';
  table.querySelectorAll('th.sortable').forEach(t=>{t.classList.remove('sort-asc','sort-desc');t.querySelector('.sort-icon').textContent='↕';});
  th.classList.add('sort-'+dir); th.querySelector('.sort-icon').textContent=dir==='asc'?'↑':'↓';
  rows.sort((a,b)=>{const av=parseFloat(a.dataset[col]||0),bv=parseFloat(b.dataset[col]||0);return dir==='asc'?av-bv:bv-av;});
  rows.forEach(r=>tbody.appendChild(r));
}

// ── Claude API ────────────────────────────────────────────────
async function callClaude(prompt){
  const apiKey=getApiKey();
  if(!apiKey){alert('먼저 API 키를 설정해주세요.');showPage('settings');return null;}
  try{
    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:'claude-sonnet-4-5',max_tokens:2000,messages:[{role:'user',content:prompt}]})
    });
    if(!res.ok){const e=await res.json();throw new Error(e.error?.message||'API 오류');}
    const data=await res.json();
    return data.content?.[0]?.text||'';
  }catch(e){alert('API 오류: '+e.message);return null;}
}

// ── API 키 / 백업 ────────────────────────────────────────────
function getApiKey(){return localStorage.getItem('jugle_api_key')||'';}
function saveApiKey(){const key=document.getElementById('api-key-input').value.trim();if(!key.startsWith('sk-ant')){showMsg('settings-msg','올바른 API 키 형식이 아니에요.','warning');return;}localStorage.setItem('jugle_api_key',key);updateApiStatus(true);showMsg('settings-msg','✅ API 키가 저장됐어요!','success');}
function clearApiKey(){localStorage.removeItem('jugle_api_key');document.getElementById('api-key-input').value='';updateApiStatus(false);}
function toggleKeyVisibility(){const input=document.getElementById('api-key-input');input.type=input.type==='password'?'text':'password';}
function updateApiStatus(connected){document.getElementById('api-dot').className=connected?'api-dot on':'api-dot';document.getElementById('api-status-text').textContent=connected?'API 연결됨':'API 키 미설정';}
function exportJSON(){const blob=new Blob([JSON.stringify({keywords:savedKeywords,exportedAt:new Date().toISOString(),version:'4.0'},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`jugle-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();}
function importJSON(e){const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=ev=>{try{const data=JSON.parse(ev.target.result);const incoming=data.keywords||[];const merged=[...savedKeywords];incoming.forEach(kw=>{if(!merged.find(k=>k.keyword===kw.keyword))merged.push(kw);});savedKeywords=merged;localStorage.setItem('jugle_keywords',JSON.stringify(savedKeywords));updateSavedBadge();alert(`✅ ${incoming.length}개 키워드를 가져왔어요.`);renderSaved();}catch{alert('올바른 Jugle JSON 파일이 아니에요.');}};reader.readAsText(file);e.target.value='';}

// ── 통계/배지/유틸 ───────────────────────────────────────────
function updateSavedBadge(){const b=document.getElementById('saved-count-badge');b.style.display=savedKeywords.length?'inline':'none';b.textContent=savedKeywords.length;}
function showToast(msg){const t=document.createElement('div');t.style.cssText='position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:9px 18px;border-radius:8px;font-size:13px;z-index:9999;box-shadow:0 4px 14px rgba(0,0,0,0.2)';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2200);}
function showMsg(containerId,msg,type){const el=document.getElementById(containerId);if(!el)return;el.innerHTML=`<div class="banner banner-${type}" style="margin-top:10px">${msg}</div>`;setTimeout(()=>{el.innerHTML='';},3500);}
function escStr(s){return s.replace(/'/g,"\\'").replace(/"/g,'&quot;');}

(function init(){
  const key=getApiKey();
  if(key){document.getElementById('api-key-input').value=key;updateApiStatus(true);}
  updateSavedBadge();})();
