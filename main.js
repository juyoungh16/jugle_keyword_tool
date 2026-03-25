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
  if(countEl) countEl.textContent = checked.length;
  // STEP 1→2 버튼
  const step2Btn = document.getElementById('sel-step2-btn-'+tableId);
  if(step2Btn){ step2Btn.disabled=checked.length===0; step2Btn.style.opacity=checked.length>0?'1':'0.4'; }
  // STEP 2→3 버튼
  const step3Btn = document.getElementById('sel-step3-btn-'+tableId);
  if(step3Btn){ step3Btn.disabled=checked.length===0; step3Btn.style.opacity=checked.length>0?'1':'0.4'; }
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
function makeKebab(id, keyword) {
  return `<div class="kebab-wrap">
    <button class="kebab-btn" onclick="toggleKebab('${id}',event)">⋮</button>
    <div class="kebab-menu" id="kebab-${id}">
      <div class="kebab-item" onclick="kebabLongtail('${escStr(keyword)}')">🌿 STEP 2 확장</div>
    </div>
  </div>`;
}

// ── STEP 간 연결 ────────────────────────────────────────────────

// STEP 1 → STEP 2: 선택 키워드(또는 전체)를 씨앗으로 넘김
function sendDiscToLongtail(selectAll) {
  let keywords = [];
  if (selectAll) {
    keywords = _lastDiscKeywords.map(k => k.keyword);
    // 전체 선택 시 checkbox도 모두 체크
    const TID = 'disc-result-table';
    const master = document.getElementById('master-cb-' + TID);
    if (master) { master.checked = true; toggleAllRows(TID, master); }
  } else {
    const checked = document.querySelectorAll('#disc-result-table tbody input.row-checkbox:checked');
    if (!checked.length) { showToast('키워드를 선택하거나 "전체 → STEP 2" 버튼을 눌러주세요.'); return; }
    checked.forEach(cb => {
      const kw = cb.closest('tr').querySelector('.keyword-cell')?.textContent.trim();
      if (kw) keywords.push(kw);
    });
  }
  if (!keywords.length) { showToast('발굴된 키워드가 없어요.'); return; }
  document.getElementById('seed-keyword').value = keywords.slice(0, 5).join(', ');
  showPage('longtail');
  setTimeout(() => expandLongtail(), 100);
}

// STEP 2 → STEP 3: 선택 키워드(또는 전체)를 토픽으로 넘김
function sendLongtailToStrategy(selectAll) {
  let keywords = [];
  if (selectAll) {
    document.querySelectorAll('#lt-table tbody tr').forEach(row => {
      const kw = row.querySelector('.keyword-cell')?.textContent.trim();
      if (kw) keywords.push(kw);
    });
  } else {
    const checked = document.querySelectorAll('#lt-table tbody input.row-checkbox:checked');
    if (!checked.length) { showToast('키워드를 선택하거나 "전체 → STEP 3" 버튼을 눌러주세요.'); return; }
    checked.forEach(cb => {
      const kw = cb.closest('tr').querySelector('.keyword-cell')?.textContent.trim();
      if (kw) keywords.push(kw);
    });
  }
  if (!keywords.length) { showToast('확장된 키워드가 없어요.'); return; }
  document.getElementById('topic-keywords').value = keywords.slice(0, 5).join(', ');
  showPage('strategy');
  setTimeout(() => generateTopicCluster(), 100);
}

// ── 스파크라인 SVG ────────────────────────────────────────────
function makeSparkline(values, color){
  if(!values||!values.length) return '';
  const w=80, h=28, pad=2;
  const max=Math.max(...values,1), min=Math.min(...values);
  const range=max-min||1;
  const pts=values.map((v,i)=>{
    const x=pad+(i/(values.length-1))*(w-pad*2);
    const y=h-pad-((v-min)/range)*(h-pad*2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const areaStart=`${pad.toFixed(1)},${(h-pad).toFixed(1)}`;
  const areaEnd=`${(w-pad).toFixed(1)},${(h-pad).toFixed(1)}`;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="flex-shrink:0">
    <polyline points="${areaStart} ${pts} ${areaEnd}" fill="${color}22" stroke="none"/>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${values.map((_,i)=>(pad+(i/(values.length-1))*(w-pad*2)).toFixed(1)).at(-1)}" cy="${(h-pad-((values.at(-1)-min)/range)*(h-pad*2)).toFixed(1)}" r="2.5" fill="${color}"/>
  </svg>`;
}

// ── 롱테일 확장 ───────────────────────────────────────────────
async function expandLongtail(){
  const seeds=document.getElementById('seed-keyword').value.trim();
  if(!seeds){alert('씨앗 키워드를 입력해주세요.');return;}
  const result=document.getElementById('longtail-result');
  result.innerHTML=`<div class="card"><div class="loading-wrap"><div class="spinner"></div><div class="loading-text" id="lt-prog">네이버 검색광고 API에서 "${seeds}" 연관 키워드 조회 중…</div></div></div>`;
  const setLtProg = msg => { const el=document.getElementById('lt-prog'); if(el) el.textContent=msg; };

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
    // kdSource: 'naver' = 네이버 compIdx 기반 추정, 'google' = DataForSEO 실데이터
    const compMap = {'높음': 80, '중간': 50, '낮음': 20};
    const keywords = data.keywordList.slice(0, 40).map(k => {
      const pc = typeof k.monthlyPcQcCnt === 'number' ? k.monthlyPcQcCnt : 10;
      const mo = typeof k.monthlyMobileQcCnt === 'number' ? k.monthlyMobileQcCnt : 10;
      const vol = pc + mo;
      const kdNaver = compMap[k.compIdx] || 50;

      // 인텐트 규칙 기반 판단 (AI 추론 대신)
      let intent = '인지';
      const kw = k.relKeyword;
      if (/(가격|비용|신청|다운|할인|구매|가입|예약|판매|견적)/.test(kw)) intent = '전환';
      else if (/(추천|비교|후기|차이|순위|리뷰|장단점|베스트)/.test(kw)) intent = '고려';

      return { keyword: kw, intent, volume: vol, kd: kdNaver, kdSource: 'naver', volumeG: 0 };
    });

    // 검색량 순 정렬
    keywords.sort((a, b) => b.volume - a.volume);

    // ── 1단계: 네이버 데이터랩 스파크라인 ──────────────────────
    setLtProg('네이버 트렌드 데이터 조회 중…');
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

    // ── 2단계: DataForSEO 구글 KD + 검색량 (실데이터 교체) ─────
    setLtProg('DataForSEO Google KD 조회 중…');
    try {
      const dfsRes = await fetch('/.netlify/functions/dataforseo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: keywords.map(k => k.keyword) })
      });
      if (dfsRes.ok) {
        const dfsData = await dfsRes.json();
        for (const kw of keywords) {
          const d = dfsData[kw.keyword];
          if (d) {
            if (d.kd > 0) { kw.kd = d.kd; kw.kdSource = 'google'; }
            if (d.volume_g > 0) kw.volumeG = d.volume_g;
          }
        }
      }
    } catch(e) {
      console.error('DataForSEO KD Error in expandLongtail:', e);
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

  // 인텐트 집계
  const counts={'인지':0,'고려':0,'전환':0};
  kws.forEach(k=>{if(counts[k.intent]!==undefined) counts[k.intent]++;});

  // KD 실데이터 vs 추정 집계
  const realKdCount = kws.filter(k => k.kdSource === 'google').length;
  const kdBadge = realKdCount > 0
    ? `<span class="text-xs" style="color:var(--green);background:var(--green-lt);padding:2px 7px;border-radius:4px;border:1px solid #BBF7D0;">✅ KD 실데이터 ${realKdCount}/${kws.length}</span>`
    : `<span class="text-xs" style="color:var(--amber);background:var(--amber-lt);padding:2px 7px;border-radius:4px;border:1px solid #FDE68A;">⚠️ KD 추정값 (DataForSEO 미설정)</span>`;

  let html=`
    <div class="result-summary">
      <span>🌱 <strong>"${seeds}"</strong> 확장 · 총 <strong>${kws.length}개</strong></span>
      <span>${Object.entries(counts).filter(([,v])=>v>0).map(([k,v])=>`<span class="intent-pill ${INTENTS[k].cls}">${k} ${v}</span>`).join(' ')}</span>
      <span class="text-xs" style="color:var(--green);background:var(--green-lt);padding:2px 7px;border-radius:4px;border:1px solid #BBF7D0;">✅ 실제 검색량(N)</span>
      ${kdBadge}
      <div class="result-actions">
        <button class="btn btn-secondary btn-sm" id="sel-step3-btn-${TID}" onclick="sendLongtailToStrategy(false)" disabled style="opacity:0.4">→ STEP 3 클러스터 (<span id="sel-count-${TID}">0</span>)</button>
        <button class="btn btn-primary btn-sm" onclick="sendLongtailToStrategy(true)">전체 → STEP 3</button>
      </div>
    </div>
    <div class="kw-table-wrap">
    <table class="kw-table" id="${TID}">
      <thead>${makeTableHeader(TID,[
        {label:'키워드',key:'keyword'},
        {label:'의도',key:'intent'},
        {label:'검색량(N)',key:'volume',sortable:true,width:'100px'},
        {label:'검색량(G)',key:'volumeG',sortable:true,width:'100px'},
        {label:'추이',key:'trend',sortable:false,width:'100px'},
        {label:'KD (Google)',key:'kd',sortable:true,width:'140px'},
      ])}</thead>
      <tbody id="lt-tbody">`;

  kws.forEach((kw,idx)=>{
    const sparkColor={'인지':'#0284C7','고려':'#CA8A04','전환':'#16A34A'}[kw.intent] || '#64748B';
    const trendHtml = kw.sparkline ? `<div style="display:flex;align-items:center;gap:6px">${makeSparkline(kw.sparkline, sparkColor)}</div>` : '-';
    const volGHtml = kw.volumeG > 0 ? fmtVol(kw.volumeG) : '-';
    const kdHtml = kw.kdSource === 'google'
      ? kdBar(kw.kd)
      : `${kdBar(kw.kd)}<span title="네이버 경쟁도 기반 추정" style="font-size:9px;color:var(--text3);margin-left:3px">추정</span>`;

    html+=`<tr data-volume="${kw.volume}" data-volume-g="${kw.volumeG||0}" data-kd="${kw.kd}" data-intent="${kw.intent}">
      <td><input type="checkbox" class="row-checkbox" onchange="toggleRow('${TID}',this)"></td>
      <td class="keyword-cell">${kw.keyword}</td>
      <td>${intentPill(kw.intent,TID,idx)}</td>
      <td class="num-cell">${fmtVol(kw.volume)}</td>
      <td class="num-cell">${volGHtml}</td>
      <td style="padding:6px 12px;">${trendHtml}</td>
      <td>${kdHtml}</td>
      <td>${makeKebab('l'+idx,kw.keyword)}</td>
    </tr>`;
  });
  html+=`</tbody></table></div>`;
  result.innerHTML=html;
}

function demoLongtail(){
  document.getElementById('seed-keyword').value='AI 코딩 도구';
  renderLongtailTable({keywords:[
    {keyword:'AI 코딩 도구란',intent:'인지',volume:8100,volumeG:5400,kd:25,kdSource:'google'},
    {keyword:'AI 코딩 도구 추천',intent:'고려',volume:18200,volumeG:12300,kd:38,kdSource:'google'},
    {keyword:'AI 코딩 도구 비교',intent:'고려',volume:12100,volumeG:8800,kd:42,kdSource:'google'},
    {keyword:'AI 코딩 도구 무료',intent:'고려',volume:9900,volumeG:6600,kd:30,kdSource:'google'},
    {keyword:'Cursor vs GitHub Copilot',intent:'고려',volume:14400,volumeG:9900,kd:45,kdSource:'google'},
    {keyword:'AI 코딩 도구 사용법',intent:'인지',volume:6600,volumeG:0,kd:28,kdSource:'naver'},
    {keyword:'개발자 AI 도구 추천',intent:'고려',volume:22000,volumeG:14800,kd:35,kdSource:'google'},
    {keyword:'AI 코딩 도구 단점',intent:'인지',volume:4400,volumeG:0,kd:22,kdSource:'naver'},
    {keyword:'AI 코딩 생산성 효과',intent:'인지',volume:5500,volumeG:3300,kd:32,kdSource:'google'},
    {keyword:'Copilot 구독 가격',intent:'전환',volume:16500,volumeG:11000,kd:18,kdSource:'google'},
    {keyword:'Cursor AI 다운로드',intent:'전환',volume:27100,volumeG:18200,kd:15,kdSource:'google'},
    {keyword:'AI 코딩 도구 스타트업',intent:'고려',volume:3300,volumeG:0,kd:20,kdSource:'naver'},
  ]},'AI 코딩 도구');
}

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
// DataForSEO 키 (로컬 저장 — Netlify 환경변수 설정 안내용)
function saveDfsKeys(){
  const id=document.getElementById('dfs-id-input').value.trim();
  const secret=document.getElementById('dfs-secret-input').value.trim();
  if(!id||!secret){showMsg('settings-msg','ID와 Secret을 모두 입력해주세요.','warning');return;}
  localStorage.setItem('jugle_dfs_id',id);
  localStorage.setItem('jugle_dfs_secret',secret);
  showMsg('settings-msg','✅ DataForSEO 키 저장 완료! Netlify 환경변수에도 동일하게 설정해주세요.','success');
}
function clearDfsKeys(){
  localStorage.removeItem('jugle_dfs_id');localStorage.removeItem('jugle_dfs_secret');
  document.getElementById('dfs-id-input').value='';document.getElementById('dfs-secret-input').value='';
}
function toggleDfsVisibility(which){
  const input=document.getElementById(which==='id'?'dfs-id-input':'dfs-secret-input');
  input.type=input.type==='password'?'text':'password';
}
function getApiKey(){return localStorage.getItem('jugle_api_key')||'';}
function saveApiKey(){const key=document.getElementById('api-key-input').value.trim();if(!key.startsWith('sk-ant')){showMsg('settings-msg','올바른 API 키 형식이 아니에요.','warning');return;}localStorage.setItem('jugle_api_key',key);updateApiStatus(true);showMsg('settings-msg','✅ API 키가 저장됐어요!','success');}
function clearApiKey(){localStorage.removeItem('jugle_api_key');document.getElementById('api-key-input').value='';updateApiStatus(false);}
function toggleKeyVisibility(){const input=document.getElementById('api-key-input');input.type=input.type==='password'?'text':'password';}
function updateApiStatus(connected){document.getElementById('api-dot').className=connected?'api-dot on':'api-dot';document.getElementById('api-status-text').textContent=connected?'API 연결됨':'API 키 미설정';}
// ── 유틸 ────────────────────────────────────────────────────
function showToast(msg){const t=document.createElement('div');t.style.cssText='position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:9px 18px;border-radius:8px;font-size:13px;z-index:9999;box-shadow:0 4px 14px rgba(0,0,0,0.2)';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2200);}
function showMsg(containerId,msg,type){const el=document.getElementById(containerId);if(!el)return;el.innerHTML=`<div class="banner banner-${type}" style="margin-top:10px">${msg}</div>`;setTimeout(()=>{el.innerHTML='';},3500);}
function escStr(s){return s.replace(/'/g,"\\'").replace(/"/g,'&quot;');}

(function init(){
  const key=getApiKey();
  if(key){document.getElementById('api-key-input').value=key;updateApiStatus(true);}
  const dfsId=localStorage.getItem('jugle_dfs_id');
  const dfsSecret=localStorage.getItem('jugle_dfs_secret');
  if(dfsId) document.getElementById('dfs-id-input').value=dfsId;
  if(dfsSecret) document.getElementById('dfs-secret-input').value=dfsSecret;
  _initDiscoverPrevButton();
})();

// ══════════════════════════════════════════════════════════════
// 섹션 16: 키워드 발굴 (Discover)
// ══════════════════════════════════════════════════════════════

// ── 탭 선택 ──
function selectDiscTab(el) {
  document.querySelectorAll('.disc-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.disc-tab-panel').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  const tab = el.dataset.tab;
  const panel = document.getElementById('disc-panel-' + tab);
  if (panel) panel.classList.add('active');
}

// ── 파일 드롭/선택 ──
let _discFiles = []; // [{file, name, size}]

function handleDiscDrop(event) {
  event.preventDefault();
  document.getElementById('disc-dropzone').classList.remove('drag-over');
  const files = Array.from(event.dataTransfer.files);
  _addDiscFiles(files);
}

function handleDiscFileSelect(event) {
  const files = Array.from(event.target.files);
  _addDiscFiles(files);
  event.target.value = '';
}

function _addDiscFiles(files) {
  const allowed = ['pdf','docx','pptx','xlsx','jpg','jpeg','png'];
  for (const f of files) {
    const ext = f.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) { showToast(`${f.name}: 지원하지 않는 형식입니다.`); continue; }
    if (_discFiles.find(d => d.name === f.name)) continue;
    _discFiles.push({ file: f, name: f.name, size: f.size });
  }
  _renderDiscFileList();
}

function _removeDiscFile(name) {
  _discFiles = _discFiles.filter(f => f.name !== name);
  _renderDiscFileList();
}

function _renderDiscFileList() {
  const el = document.getElementById('disc-file-list');
  if (!el) return;
  if (!_discFiles.length) { el.innerHTML = ''; return; }
  el.innerHTML = _discFiles.map(f => `<div class="disc-file-item">
    <span class="disc-file-name">📎 ${f.name}</span>
    <span class="disc-file-size">${(f.size/1024).toFixed(0)}KB</span>
    <button class="disc-file-remove" onclick="_removeDiscFile('${escStr(f.name)}')" title="제거">✕</button>
  </div>`).join('');
}

// ── 가중치 상태 (α=기회, β=진입, γ=신호) ──
let _wAlpha = 50, _wBeta = 30, _wGamma = 20; // raw 0-100 합산 정규화

function onWeightChange(which, val) {
  const v = parseInt(val);
  if (which === 'alpha') _wAlpha = v;
  else if (which === 'beta') _wBeta = v;
  else if (which === 'gamma') _wGamma = v;
  const el = { alpha: 'disc-w-alpha', beta: 'disc-w-beta', gamma: 'disc-w-gamma' };
  ['alpha','beta','gamma'].forEach(k => {
    const node = document.getElementById(el[k]);
    if (node) node.textContent = (k==='alpha'?_wAlpha:k==='beta'?_wBeta:_wGamma) + '%';
  });
  _recomputeScores();
}

// ── 추천도 계산 ──
// 신호점수 소스별 고정값: 경쟁사 50, 뉴스 25, 자사 15, AI 10, 구글SERP 5
function computeSignalScore(kw) {
  const sm = { '경': 50, '뉴': 25, '자': 15, 'AI': 10, '구': 5 };
  return Math.min(100, (kw.sources || []).reduce((sum, s) => sum + (sm[s] || 0), 0));
}

// 추천도 = 기회점수×α + 진입점수×β + 신호점수×γ
function computeDiscScore(kw, maxVolN, maxVolG) {
  const total = (_wAlpha + _wBeta + _wGamma) || 100;
  const alpha = _wAlpha / total, beta = _wBeta / total, gamma = _wGamma / total;
  const volN = maxVolN > 0 ? (kw.volumeN || 0) / maxVolN * 100 : 0;
  const volG = maxVolG > 0 ? (kw.volumeG || 0) / maxVolG * 100 : 0;
  const 기회 = Math.max(volN, volG);
  const 진입 = (kw.kd !== null && kw.kd !== undefined) ? (100 - kw.kd) : 50;
  const 신호 = computeSignalScore(kw);
  return Math.round(기회 * alpha + 진입 * beta + 신호 * gamma);
}

function _scoreHtml(score) {
  const color = score >= 70 ? '#059669' : score >= 40 ? '#D97706' : '#94A3B8';
  return `<span class="disc-score-badge" style="color:${color}">${score}</span>`;
}

let _lastDiscKeywords = []; // 마지막 결과 캐싱

function _recomputeScores() {
  if (!_lastDiscKeywords.length) return;
  const maxVolN = Math.max(..._lastDiscKeywords.map(k => k.volumeN || 0), 1);
  const maxVolG = Math.max(..._lastDiscKeywords.map(k => k.volumeG || 0), 1);
  document.querySelectorAll('#disc-result-table tbody tr').forEach(row => {
    const kw = _lastDiscKeywords.find(k => k.keyword === row.dataset.keyword);
    if (!kw) return;
    kw.score = computeDiscScore(kw, maxVolN, maxVolG);
    row.dataset.score = kw.score;
    const scoreCell = row.querySelector('.disc-score-cell');
    if (scoreCell) scoreCell.innerHTML = _scoreHtml(kw.score);
  });
}

// ── 메인 파이프라인 (통합 버전) ──
async function discoverKeywords() {
  const result = document.getElementById('discover-result');
  result.innerHTML = `<div class="card"><div class="loading-wrap"><div class="spinner"></div><div class="loading-text" id="disc-prog">소스 확인 중…</div></div></div>`;

  // 각 소스별 키워드 추출 결과를 담을 배열
  // [{keyword, intent, reason, sources:[], urlSources:[], articles:[], serpItems:[]}]
  let allExtracted = []; // 소스별로 수집된 원시 키워드 결과 (소스별 배열)
  let anySource = false;

  try {
    // ─── 1. 소스별 키워드 추출 (병렬) ───────────────────────────────
    const tasks = [];

    // [제품/서비스 자료]
    const productText = document.getElementById('disc-product-text').value.trim();
    if (_discFiles.length || productText) {
      anySource = true;
      tasks.push(_extractFromProduct());
    }

    // [경쟁사 URL]
    const compUrls = (document.getElementById('disc-competitor-urls').value || '').trim();
    if (compUrls) {
      anySource = true;
      tasks.push(_extractFromUrls(compUrls, '경'));
    }

    // [자사 URL]
    const ownedUrls = (document.getElementById('disc-owned-urls').value || '').trim();
    if (ownedUrls) {
      anySource = true;
      tasks.push(_extractFromUrls(ownedUrls, '자'));
    }

    // [뉴스 트렌드]
    const newsTopic = document.getElementById('disc-news-topic').value.trim();
    if (newsTopic) {
      anySource = true;
      tasks.push(_extractFromNews(newsTopic));
    }

    if (!anySource) {
      result.innerHTML = `<div class="card"><div class="stream-box">입력된 소스가 없습니다. 최소 하나의 탭에 내용을 입력해주세요.</div></div>`;
      return;
    }

    _setDiscProg(`총 ${tasks.length}개 소스에서 키워드 추출 중…`);

    // 병렬로 소스별 키워드 추출
    const sourceResults = await Promise.all(tasks);
    sourceResults.forEach(r => { if (r) allExtracted.push(...r); });

    if (!allExtracted.length) {
      result.innerHTML = `<div class="card"><div class="stream-box">키워드를 추출하지 못했습니다. 입력 내용을 확인해주세요.</div></div>`;
      return;
    }

    // ─── 2. 동일 키워드 통합 (소스 배지 누적) ───────────────────────
    _setDiscProg('중복 키워드 통합 중…');
    const merged = _mergeKeywords(allExtracted);

    // ─── 3. 네이버 검색량 조회 ──────────────────────────────────────
    _setDiscProg(`네이버 검색량 조회 중… (총 ${merged.length}개)`);
    const kwChunks = [];
    for (let i = 0; i < merged.length; i += 5) kwChunks.push(merged.slice(i, i + 5));
    for (const chunk of kwChunks) {
      const hints = chunk.map(k => k.keyword.replace(/[^a-zA-Z0-9가-힣\s]/g, '')).filter(Boolean).join(',');
      if (!hints) continue;
      try {
        const r = await fetch(`/.netlify/functions/naver-keyword?hintKeyword=${encodeURIComponent(hints)}`);
        if (r.ok) {
          const d = await r.json();
          for (const kw of chunk) {
            const match = (d.keywordList || []).find(k => k.relKeyword.replace(/ /g,'') === kw.keyword.replace(/ /g,''));
            if (match) {
              kw.volumeN = (typeof match.monthlyPcQcCnt === 'number' ? match.monthlyPcQcCnt : 10)
                         + (typeof match.monthlyMobileQcCnt === 'number' ? match.monthlyMobileQcCnt : 10);
            }
          }
        }
      } catch(e) {}
      await new Promise(r => setTimeout(r, 150));
    }

    // ─── 4. DataForSEO 구글 검색량 + KD ────────────────────────────
    _setDiscProg('Google 데이터 조회 중…');
    try {
      const dfsRes = await fetch('/.netlify/functions/dataforseo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: merged.map(k => k.keyword) })
      });
      if (dfsRes.ok) {
        const dfsData = await dfsRes.json();
        for (const kw of merged) {
          const d = dfsData[kw.keyword];
          if (d) { kw.volumeG = d.volume_g || 0; kw.kd = d.kd || null; }
        }
      }
    } catch(e) {}

    // ─── 5. DataForSEO SERP (검색량 상위 10개) ────────────────────
    _setDiscProg('Google SERP 조회 중…');
    try {
      const topKws = [...merged].sort((a,b) => b.volumeN - a.volumeN).slice(0, 10).map(k => k.keyword);
      const serpRes = await fetch('/.netlify/functions/dataforseo-serp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: topKws })
      });
      if (serpRes.ok) {
        const serpData = await serpRes.json();
        for (const kw of merged) {
          if (serpData[kw.keyword]) {
            kw.serpItems = serpData[kw.keyword];
            if (!kw.sources.includes('구')) kw.sources.push('구');
          }
        }
      }
    } catch(e) {}

    // ─── 6. 추천도 계산 후 정렬 ────────────────────────────────────
    const maxVolN = Math.max(...merged.map(k => k.volumeN || 0), 1);
    const maxVolG = Math.max(...merged.map(k => k.volumeG || 0), 1);
    merged.forEach(kw => { kw.score = computeDiscScore(kw, maxVolN, maxVolG); });
    merged.sort((a, b) => b.volumeN - a.volumeN);

    _lastDiscKeywords = merged;
    _cacheDiscoverResult(merged);
    renderDiscoverTable(merged);

  } catch(e) {
    result.innerHTML = `<div class="card"><div class="stream-box">오류: ${e.message}</div></div>`;
  }
}

// ── 소스별 추출 헬퍼 ──────────────────────────────────────────────────

async function _extractFromProduct() {
  let fileTexts = '';
  const textArea = document.getElementById('disc-product-text').value.trim();
  for (const df of _discFiles) {
    const ext = df.name.split('.').pop().toLowerCase();
    if (['jpg','jpeg','png'].includes(ext)) {
      const b64 = await _fileToBase64(df.file);
      fileTexts += `\n[이미지: ${df.name}]\n` + await _extractImageText(b64, df.name);
    } else {
      const fd = new FormData();
      fd.append('file', df.file, df.name);
      try {
        const r = await fetch('/.netlify/functions/extract-file', { method: 'POST', body: fd });
        if (r.ok) { const d = await r.json(); fileTexts += d.text || ''; }
      } catch(e) {}
    }
  }
  const combinedText = fileTexts + (textArea ? '\n' + textArea : '');
  if (!combinedText.trim()) return [];
  return await _aiExtractKeywords(combinedText, 'AI', [], []);
}

async function _extractFromUrls(rawInput, sourceLabel) {
  const urls = rawInput.split('\n').map(u => u.trim()).filter(u => u.startsWith('http'));
  if (!urls.length) return [];
  let extractedText = '';
  const urlSources = [];
  for (const url of urls.slice(0, 5)) {
    try {
      const r = await fetch('/.netlify/functions/crawl-url', {
        method: 'POST', body: JSON.stringify({ url }),
        headers: { 'Content-Type': 'application/json' }
      });
      if (r.ok) {
        const d = await r.json();
        if (d.text) { extractedText += d.text + '\n---\n'; urlSources.push({ url, label: sourceLabel === '경' ? '[경쟁사]' : '[자사]' }); }
      }
    } catch(e) {}
  }
  if (!extractedText) return [];
  return await _aiExtractKeywords(extractedText, sourceLabel, urlSources, []);
}

async function _extractFromNews(topic) {
  let articles = [];
  try {
    const r = await fetch('/.netlify/functions/news-rss', {
      method: 'POST', body: JSON.stringify({ topic }),
      headers: { 'Content-Type': 'application/json' }
    });
    if (r.ok) { const d = await r.json(); articles = d.articles || []; }
  } catch(e) {}
  if (!articles.length) return [];
  const text = articles.map(a => `[${a.title}]\n${a.summary}`).join('\n\n');
  return await _aiExtractKeywords(text, '뉴', [], articles.slice(0, 5));
}

async function _aiExtractKeywords(text, sourceLabel, urlSources, articles) {
  const prompt = `당신은 IT/테크 SEO 전문가입니다. 아래 텍스트에서 콘텐츠 마케팅에 활용할 수 있는 핵심 키워드를 20개 추출해주세요.

텍스트:
${text.slice(0, 3500)}

반드시 JSON만 출력하세요 (설명 없이):
{"keywords":[{"keyword":"키워드","intent":"인지|고려|전환","reason":"선정 이유 15자 이내"}]}
- intent: (가격|신청|구매|다운|설치) → 전환, (추천|비교|후기|차이|리뷰) → 고려, 나머지 → 인지`;

  const aiResp = await callClaude(prompt);
  if (!aiResp) return [];
  try {
    const parsed = JSON.parse(aiResp.replace(/```json|```/g, '').trim());
    return (parsed.keywords || []).map(k => ({
      keyword: k.keyword,
      intent: k.intent || '인지',
      reason: k.reason || '',
      sources: [sourceLabel],
      volumeN: 0, volumeG: 0, kd: null,
      urlSources,
      articles
    }));
  } catch(e) { return []; }
}

// ── 동일 키워드 통합 ──────────────────────────────────────────────────
function _mergeKeywords(rawList) {
  const map = new Map();
  for (const kw of rawList) {
    const key = kw.keyword.toLowerCase().replace(/\s+/g, '');
    if (map.has(key)) {
      const existing = map.get(key);
      // 소스 배지 누적 (중복 제거)
      for (const s of kw.sources) {
        if (!existing.sources.includes(s)) existing.sources.push(s);
      }
      // urlSources, articles 누적
      existing.urlSources.push(...(kw.urlSources || []));
      existing.articles.push(...(kw.articles || []));
    } else {
      map.set(key, { ...kw,
        urlSources: [...(kw.urlSources || [])],
        articles: [...(kw.articles || [])]
      });
    }
  }
  return Array.from(map.values());
}


function _setDiscProg(msg) {
  const el = document.getElementById('disc-prog');
  if (el) el.textContent = msg;
}

// ── 이미지 텍스트 추출 (Claude Vision) ──
async function _fileToBase64(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result.split(',')[1]);
    reader.readAsDataURL(file);
  });
}

async function _extractImageText(base64, name) {
  const apiKey = getApiKey();
  if (!apiKey) return '';
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
          { type: 'text', text: '이 이미지에서 텍스트나 중요한 정보를 모두 추출해주세요. 키워드 발굴에 활용할 예정입니다.' }
        ]}]
      })
    });
    if (res.ok) { const d = await res.json(); return d.content?.[0]?.text || ''; }
    return '';
  } catch(e) { return ''; }
}

// ── 결과 테이블 렌더링 ──
function renderDiscoverTable(keywords) {
  const result = document.getElementById('discover-result');
  if (!keywords || !keywords.length) {
    result.innerHTML = `<div class="card"><div class="stream-box">발굴된 키워드가 없습니다.</div></div>`;
    return;
  }

  const TID = 'disc-result-table';

  // 가중치 슬라이더 HTML (α=기회, β=진입, γ=신호)
  const sliderHtml = `<div class="weight-bar">
    <span class="info-tip" data-tip="추천도 = 기회점수×α + 진입점수×β + 신호점수×γ&#10;기회: max(검색량N, 검색량G) 정규화 0~100&#10;진입: (100-KD) 0~100&#10;신호: 경쟁사+50, 뉴스+25, 자사+15, AI+10 (최대 100)&#10;슬라이더 조절 시 추천도 실시간 재계산">ⓘ</span>
    <span class="weight-label">α 기회</span>
    <input type="range" class="weight-slider" min="0" max="100" step="5" value="${_wAlpha}" oninput="onWeightChange('alpha',this.value)">
    <span class="weight-pct" id="disc-w-alpha">${_wAlpha}%</span>
    <span class="weight-label" style="margin-left:8px">β 진입</span>
    <input type="range" class="weight-slider" min="0" max="100" step="5" value="${_wBeta}" oninput="onWeightChange('beta',this.value)">
    <span class="weight-pct" id="disc-w-beta">${_wBeta}%</span>
    <span class="weight-label" style="margin-left:8px">γ 신호</span>
    <input type="range" class="weight-slider" min="0" max="100" step="5" value="${_wGamma}" oninput="onWeightChange('gamma',this.value)">
    <span class="weight-pct" id="disc-w-gamma">${_wGamma}%</span>
  </div>`;

  // 테이블 헤더
  const thead = `<thead><tr>
    <th style="width:36px"><input type="checkbox" class="th-checkbox" id="master-cb-${TID}" onchange="toggleAllRows('${TID}',this)"></th>
    <th>키워드</th>
    <th style="width:70px">의도</th>
    <th class="sortable" style="width:110px" onclick="sortDiscTable('volumeN',this)"><span class="info-tip" data-tip="네이버 검색광고 API 기반 월간 PC+모바일 합산 검색량.\n실제 검색 로그 기반 절댓값.">ⓘ</span>검색량(N) <span class="sort-icon">↕</span></th>
    <th class="sortable" style="width:110px" onclick="sortDiscTable('volumeG',this)"><span class="info-tip" data-tip="DataForSEO를 통해 가져온 구글 월간 검색량 절댓값.">ⓘ</span>검색량(G) <span class="sort-icon">↕</span></th>
    <th class="sortable" style="width:100px" onclick="sortDiscTable('kd',this)"><span class="info-tip" data-tip="DataForSEO가 구글 1페이지 상위 10개 결과의\n백링크·도메인 권위도·SERP 특성을 실제 크롤링해서 산출한 경쟁도.\n🟢 0~30 진입 가능 / 🟡 31~60 중간 경쟁 / 🔴 61~100 진입 어려움">ⓘ</span>KD <span class="sort-icon">↕</span></th>
    <th style="width:100px">소스</th>
    <th class="sortable" style="width:90px" onclick="sortDiscTable('score',this)"><span class="info-tip" data-tip="추천도 = 기회점수×α + 진입점수×β + 신호점수×γ&#10;기회: max(검색량N,G) 정규화 0~100&#10;진입: (100-KD) 0~100&#10;신호: 경쟁사+50, 뉴스+25, 자사+15, AI+10">ⓘ</span>추천도 <span class="sort-icon">↕</span></th>
    <th style="width:36px"></th>
  </tr></thead>`;

  // 행 렌더링
  const maxVolN = Math.max(...keywords.map(k => k.volumeN || 0), 1);

  const rows = keywords.map(kw => {
    const kdClass = kw.kd === null ? '' : kw.kd <= 30 ? 'kd-low' : kw.kd <= 60 ? 'kd-mid' : 'kd-high';
    const kdHtml = kw.kd !== null ? `<span class="kd-dot ${kdClass}"></span>${kw.kd}` : '-';
    const volNHtml = kw.volumeN > 0 ? fmtVol(kw.volumeN) : '-';
    const volGHtml = kw.volumeG > 0 ? fmtVol(kw.volumeG) : '-';

    // 소스 배지
    const srcMap = { '경': '경쟁사', '자': '자사', '뉴': '뉴스', '구': 'Google', 'AI': 'AI 자료' };
    const srcBadges = (kw.sources || []).map(s => {
      let tipContent = '';
      if (s === '경' || s === '자') {
        const items = (kw.urlSources || []).slice(0, 5).map(u => `<a href="${u.url}" target="_blank">${u.label}: ${u.url.slice(0,40)}</a>`).join('');
        tipContent = items || srcMap[s];
      } else if (s === '뉴') {
        const items = (kw.articles || []).slice(0, 5).map(a => `<a href="${a.url||'#'}" target="_blank">${a.title}</a>`).join('');
        tipContent = items || '뉴스 기사';
      } else if (s === '구') {
        const items = (kw.serpItems || []).slice(0, 5).map(i => `<a href="${i.url}" target="_blank">${i.title.slice(0,40)}</a>`).join('');
        tipContent = items || 'Google SERP';
      } else if (s === 'AI') {
        tipContent = '제품/서비스 자료 기반 AI 추출';
      }
      return `<span class="src-badge src-${s}">${s}<span class="src-badge-tip">${tipContent}</span></span>`;
    }).join('');

    return `<tr data-keyword="${escStr(kw.keyword)}" data-volume="${kw.volumeN}" data-score="${kw.score||0}" data-kd="${kw.kd||0}" data-volumeG="${kw.volumeG}" data-intent="${kw.intent}">
      <td><input type="checkbox" class="row-checkbox" onchange="toggleRow('${TID}',this)"></td>
      <td class="keyword-cell">${kw.keyword}</td>
      <td>${intentPill(kw.intent)}</td>
      <td class="num-cell">${volNHtml}</td>
      <td class="num-cell">${volGHtml}</td>
      <td style="white-space:nowrap">${kdHtml}</td>
      <td><div class="src-badges">${srcBadges}</div></td>
      <td class="disc-score-cell">${_scoreHtml(kw.score||0)}</td>
      <td>${makeKebab('d'+keywords.indexOf(kw), kw.keyword)}</td>
    </tr>`;
  }).join('');

  result.innerHTML = `
    ${sliderHtml}
    <div class="result-summary">
      <span>총 <strong>${keywords.length}개</strong> 키워드 발굴</span>
      <div class="result-actions">
        <button class="btn btn-secondary btn-sm" id="sel-step2-btn-${TID}" onclick="sendDiscToLongtail(false)" disabled style="opacity:0.4">→ STEP 2 확장 (<span id="sel-count-${TID}">0</span>)</button>
        <button class="btn btn-primary btn-sm" onclick="sendDiscToLongtail(true)">전체 → STEP 2</button>
      </div>
    </div>
    <div class="kw-table-wrap">
      <table class="kw-table" id="${TID}">
        ${thead}
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ── 테이블 정렬 ──
let _discSortCol = 'volumeN', _discSortDir = 'desc';

function sortDiscTable(col, th) {
  const table = document.getElementById('disc-result-table');
  if (!table) return;
  const tbody = table.querySelector('tbody');
  const dir = _discSortCol === col && _discSortDir === 'desc' ? 'asc' : 'desc';
  _discSortCol = col; _discSortDir = dir;

  // 헤더 아이콘 업데이트
  table.querySelectorAll('th.sortable').forEach(t => {
    t.classList.remove('sort-asc', 'sort-desc');
    t.querySelector('.sort-icon').textContent = '↕';
  });
  if (th) {
    th.classList.add('sort-' + dir);
    th.querySelector('.sort-icon').textContent = dir === 'asc' ? '↑' : '↓';
  }

  const rows = Array.from(tbody.querySelectorAll('tr'));
  rows.sort((a, b) => {
    const colMap = { volumeN: 'volume', volumeG: 'volumeG', kd: 'kd', score: 'score' };
    const attr = colMap[col] || col;
    const av = parseFloat(a.dataset[attr] || 0);
    const bv = parseFloat(b.dataset[attr] || 0);
    return dir === 'asc' ? av - bv : bv - av;
  });
  rows.forEach(r => tbody.appendChild(r));
}

// ── 결과 캐싱 ──
function _cacheDiscoverResult(keywords) {
  const payload = { keywords, savedAt: Date.now() };
  try {
    sessionStorage.setItem('jugle_discover_session', JSON.stringify(payload));
    localStorage.setItem('jugle_discover_cache', JSON.stringify(payload));
  } catch(e) {}
}

function _initDiscoverPrevButton() {
  const btn = document.getElementById('disc-load-prev');
  if (!btn) return;
  try {
    const cached = localStorage.getItem('jugle_discover_cache');
    if (!cached) return;
    const { keywords, savedAt } = JSON.parse(cached);
    const daysDiff = Math.round((Date.now() - savedAt) / 86400000);
    if (daysDiff > 7) { localStorage.removeItem('jugle_discover_cache'); return; }
    btn.style.display = 'inline-flex';
    btn.textContent = `🕐 지난 결과 불러오기 (${daysDiff === 0 ? '오늘' : daysDiff + '일 전'})`;
  } catch(e) {}
}

function loadPrevDiscoverResult() {
  try {
    const cached = localStorage.getItem('jugle_discover_cache');
    if (!cached) return;
    const { keywords } = JSON.parse(cached);
    // 캐시 로드 시 추천도 재계산 (가중치 변경 반영)
    const maxVolN = Math.max(...keywords.map(k => k.volumeN || 0), 1);
    const maxVolG = Math.max(...keywords.map(k => k.volumeG || 0), 1);
    keywords.forEach(k => { k.score = computeDiscScore(k, maxVolN, maxVolG); });
    _lastDiscKeywords = keywords;
    renderDiscoverTable(keywords);
    showToast('이전 발굴 결과를 불러왔어요.');
  } catch(e) {}
}

// ── 데모 ──
function demoDiscover() {
  const demoKws = [
    { keyword: 'AI 코딩 도구', intent: '고려', volumeN: 49500, volumeG: 33100, kd: 42, sources: ['AI', '뉴'], reason: '급성장 시장 트렌드', urlSources: [], articles: [{title: 'AI 코딩 도구 시장 분석', url: 'https://example.com/1', summary: ''}], score: 0 },
    { keyword: 'Cursor AI', intent: '인지', volumeN: 27100, volumeG: 18200, kd: 28, sources: ['경', 'AI'], reason: '경쟁사 주요 키워드', urlSources: [{url: 'https://competitor.com/cursor-ai', label: '[경쟁사]'}], articles: [], serpItems: [{title: 'Cursor AI 완벽 가이드', url: 'https://google.com/1'}], score: 0 },
    { keyword: 'GitHub Copilot 비교', intent: '고려', volumeN: 22000, volumeG: 14400, kd: 35, sources: ['경', '뉴'], reason: '비교 검색 다수', urlSources: [], articles: [{title: 'Copilot vs Cursor 비교', url: 'https://news.com/1', summary: ''}], score: 0 },
    { keyword: 'AI 코딩 가격', intent: '전환', volumeN: 18200, volumeG: 12100, kd: 18, sources: ['자', 'AI'], reason: '전환 의도 명확', urlSources: [{url: 'https://mysite.com/pricing', label: '[자사]'}], articles: [], score: 0 },
    { keyword: '프롬프트 엔지니어링', intent: '인지', volumeN: 14400, volumeG: 9900, kd: 55, sources: ['뉴'], reason: '업계 급상승 키워드', urlSources: [], articles: [{title: '프롬프트 엔지니어링 입문', url: 'https://news.com/2', summary: ''}], score: 0 },
    { keyword: 'Claude API 사용법', intent: '인지', volumeN: 12100, volumeG: 8100, kd: 32, sources: ['AI', '뉴'], reason: '공식 자료 핵심어', urlSources: [], articles: [], score: 0 },
    { keyword: 'LLM 비교', intent: '고려', volumeN: 9900, volumeG: 6600, kd: 48, sources: ['경'], reason: '경쟁사 랜딩 키워드', urlSources: [{url: 'https://competitor.com/llm', label: '[경쟁사]'}], articles: [], score: 0 },
    { keyword: 'AI 개발 스택', intent: '인지', volumeN: 8100, volumeG: 5500, kd: 40, sources: ['자'], reason: '자사 블로그 키워드', urlSources: [{url: 'https://mysite.com/stack', label: '[자사]'}], articles: [], score: 0 },
    { keyword: 'RAG 구현', intent: '인지', volumeN: 6600, volumeG: 4400, kd: 62, sources: ['뉴', '구'], reason: '기술 트렌드', urlSources: [], articles: [], serpItems: [{title: 'RAG 구현 완벽 가이드', url: 'https://google.com/rag'}], score: 0 },
    { keyword: 'LangChain 튜토리얼', intent: '인지', volumeN: 5500, volumeG: 3300, kd: 38, sources: ['경', '뉴'], reason: '프레임워크 학습 수요', urlSources: [], articles: [{title: 'LangChain 입문', url: 'https://news.com/3', summary: ''}], score: 0 },
  ];
  const maxVolN = Math.max(...demoKws.map(k => k.volumeN), 1);
  const maxVolG = Math.max(...demoKws.map(k => k.volumeG), 1);
  demoKws.forEach(k => { k.score = computeDiscScore(k, maxVolN, maxVolG); });
  _lastDiscKeywords = demoKws;
  renderDiscoverTable(demoKws);
  showToast('데모 데이터를 불러왔어요.');
}

