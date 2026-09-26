/* ============================================================
 * 页面交互：表单 -> recommend -> 地图高亮 + 路段风险时间线
 * ============================================================ */
import { NODES, EDGES, LIFTS, RESTS, LIFT_START, LEVEL_INFO, nodeById, edgeById } from './data.js';
import { recommend, edgeMinutes } from './engine.js';

const state = { start: 'summit', userLevel: 2, targetEdgeId: 'e8', restId: 'r1' };

const $ = (sel) => document.querySelector(sel);

/* 贝塞尔控制点：让雪道在地图上弯曲自然 */
const CURVE = {
  e1: { x: 300, y: 90 },   e2: { x: 380, y: 190 },  e3: { x: 500, y: 120 },
  e4: { x: 260, y: 200 },  e5: { x: 90, y: 240 },   e6: { x: 230, y: 250 },
  e7: { x: 60, y: 320 },   e8: { x: 250, y: 380 },  e9: { x: 200, y: 320 },
  e10: { x: 470, y: 330 }, e11: { x: 640, y: 450 }, e12: { x: 660, y: 460 },
  e13: { x: 250, y: 520 }, e14: { x: 130, y: 420 }, e15: { x: 110, y: 360 },
  e16: { x: 620, y: 270 }, e17: { x: 470, y: 520 },
  e18: { x: 540, y: 180 }, e19: { x: 240, y: 210 },
  c1: { x: 470, y: 300 },  c2: { x: 340, y: 180 },  c3: { x: 260, y: 360 },
  c4: { x: 330, y: 470 },
};

const levelColor = (lv) => LEVEL_INFO[lv].color;

function edgePath(e) {
  const a = nodeById(e.from), b = nodeById(e.to);
  const c = CURVE[e.id];
  if (c) return `M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`;
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
}
function edgeLabelPos(e) {
  const a = nodeById(e.from), b = nodeById(e.to);
  const c = CURVE[e.id];
  if (c) return { x: (a.x + 2 * c.x + b.x) / 4, y: (a.y + 2 * c.y + b.y) / 4 - 4 };
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 4 };
}

/* ---------------- 地图 ---------------- */
function buildMap() {
  const svg = $('#map');
  const defs = `
    <defs>
      <marker id="arrow-ski" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 Z" fill="#7f93ad"/>
      </marker>
      <marker id="arrow-lift" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 Z" fill="#a78bfa"/>
      </marker>
      <marker id="arrow-plan" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto">
        <path d="M0,0 L9,4 L0,8 Z" fill="#facc15"/>
      </marker>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#facc15" flood-opacity="0.9"/>
      </filter>
    </defs>`;

  // 底层：关闭雪道（灰虚线）
  let closed = '';
  for (const e of EDGES.filter((x) => x.type === 'ski' && x.status === 'closed')) {
    closed += `<path d="${edgePath(e)}" fill="none" stroke="#475569" stroke-width="2.5"
      stroke-dasharray="6 6" opacity="0.75"/>`;
    const p = edgeLabelPos(e);
    closed += `<text x="${p.x}" y="${p.y}" text-anchor="middle" font-size="11"
      fill="#94a3b8" style="paint-order:stroke;stroke:#0a1322;stroke-width:3px">🚫 ${e.name}</text>`;
  }

  // 开放雪道
  let skis = '';
  for (const e of EDGES.filter((x) => x.type === 'ski' && x.status === 'open')) {
    skis += `<path class="edge edge-${e.id}" d="${edgePath(e)}" fill="none"
      stroke="${levelColor(e.level)}" stroke-width="2.5" opacity="0.55"
      marker-end="url(#arrow-ski)" data-id="${e.id}"/>`;
    const p = edgeLabelPos(e);
    skis += `<text class="lbl lbl-${e.id}" x="${p.x}" y="${p.y}" text-anchor="middle" font-size="11"
      fill="#c7d4e6" pointer-events="none" style="paint-order:stroke;stroke:#0a1322;stroke-width:3px">${e.name}</text>`;
  }

  // 缆车：紫色虚线
  let lifts = '';
  for (const e of EDGES.filter((x) => x.type === 'lift')) {
    lifts += `<path class="edge edge-${e.id}" d="${edgePath(e)}" fill="none"
      stroke="#a78bfa" stroke-width="2.5" stroke-dasharray="2 6" stroke-linecap="round"
      opacity="0.65" marker-end="url(#arrow-lift)" data-id="${e.id}"/>`;
    const p = edgeLabelPos(e);
    lifts += `<text class="lbl lbl-${e.id}" x="${p.x}" y="${p.y - 10}" text-anchor="middle" font-size="10.5"
      fill="#c4b5fd" pointer-events="none" style="paint-order:stroke;stroke:#0a1322;stroke-width:3px">🚡 ${e.name.replace(/（.*?）/, '')}</text>`;
  }

  // 计划路线高亮层（动态）+ 节点层
  svg.innerHTML = `
    ${defs}
    <g id="layer-closed">${closed}</g>
    <g id="layer-skis">${skis}</g>
    <g id="layer-lifts">${lifts}</g>
    <g id="layer-plan"></g>
    <g id="layer-nodes">${nodeMarkers()}</g>`;
}

const NODE_EMOJI = { base: '🏠', peak: '🏔️', station: '🚉', rest: '🍜', park: '🏂' };
function nodeMarkers() {
  return NODES.map((n) => `
    <g class="node node-${n.id}">
      <circle cx="${n.x}" cy="${n.y}" r="11" fill="#1b2c47" stroke="#7dd3fc" stroke-width="1.6"/>
      <text x="${n.x}" y="${n.y + 4}" text-anchor="middle" font-size="11">${NODE_EMOJI[n.type] || '📍'}</text>
      <text x="${n.x}" y="${n.y + 26}" text-anchor="middle" font-size="11.5" fill="#dbe7f5"
        style="paint-order:stroke;stroke:#0a1322;stroke-width:3px">${n.name.replace(/（.*?）/, '')}</text>
    </g>`).join('');
}

/* ---------------- 表单 ---------------- */
function initForm() {
  // 水平等级
  $('#levels').innerHTML = [1, 2, 3, 4].map((lv) => `
    <div class="level-btn" data-level="${lv}">
      <span class="dot" style="background:${LEVEL_INFO[lv].color}"></span>${LEVEL_INFO[lv].name}
    </div>`).join('');
  $('#levels').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.level-btn');
    if (!btn) return;
    state.userLevel = +btn.dataset.level;
    refreshLevelBtns();
    fillTargetOptions(); // 难度变化后可选项变化
    run();
  });

  // 缆车（起点）
  $('#lift').innerHTML = LIFTS.map((l) => `<option value="${l.id}">${l.name}</option>`).join('');
  $('#lift').value = 'L1';
  $('#lift').addEventListener('change', (e) => {
    state.start = LIFT_START[e.target.value];
    run();
  });

  // 目标雪道（只列开放雪道，关闭的不能选）
  $('#target').addEventListener('change', (e) => { state.targetEdgeId = e.target.value; run(); });

  // 休息站
  $('#rest').innerHTML = `<option value="">不经过休息站</option>` +
    RESTS.map((r) => `<option value="${r.id}">${r.name}</option>`).join('');
  $('#rest').value = state.restId;
  $('#rest').addEventListener('change', (e) => { state.restId = e.target.value || null; run(); });

  $('#go').addEventListener('click', run);

  refreshLevelBtns();
  fillTargetOptions();
}

function refreshLevelBtns() {
  document.querySelectorAll('.level-btn').forEach((b) => {
    b.classList.toggle('active', +b.dataset.level === state.userLevel);
  });
}

/* 目标雪道下拉：关闭雪道不能选；高于当前水平的标记为"水平不足"但仍可见，
 * 选择后由引擎给出明确拒绝与风险说明 */
function fillTargetOptions() {
  const opts = EDGES.filter((e) => e.type === 'ski').map((e) => {
    if (e.status !== 'open') {
      return `<option value="${e.id}" disabled>🚫 ${e.name}（关闭：${e.note || '未开放'}）</option>`;
    }
    const over = e.level > state.userLevel;
    return `<option value="${e.id}">${'●'.repeat(e.level)} ${e.name}${over ? '（超出当前水平）' : ''}</option>`;
  }).join('');
  $('#target').innerHTML = opts;
  // 保持当前选择仍有效
  if ([...$('#target').options].some((o) => o.value === state.targetEdgeId && !o.disabled)) {
    $('#target').value = state.targetEdgeId;
  } else {
    const firstOpen = EDGES.find((e) => e.type === 'ski' && e.status === 'open' && e.level <= state.userLevel);
    state.targetEdgeId = firstOpen.id;
    $('#target').value = firstOpen.id;
  }
}

/* ---------------- 结果渲染 ---------------- */
const toneName = { high: '高风险', mid: '中风险', low: '低风险' };

function renderPlan(result) {
  // 重置全部节点描边与边透明度（切换路线时清理上一次状态）
  document.querySelectorAll('#layer-nodes circle').forEach((c) => c.setAttribute('stroke', '#7dd3fc'));
  // 地图高亮
  const planLayer = $('#layer-plan');
  const planIds = new Set(result.segments.map((s) => s.edge.id));
  let planSvg = '';
  result.segments.forEach((seg, i) => {
    const e = seg.edge;
    planSvg += `<path d="${edgePath(e)}" fill="none" stroke="#facc15" stroke-width="5"
      opacity="0.9" stroke-linecap="round" marker-end="url(#arrow-plan)" filter="url(#glow)"/>`;
  });
  // 段序号 & 风险点
  result.segments.forEach((seg, i) => {
    const e = seg.edge;
    const b = nodeById(e.to);
    const color = seg.risk.level === 'high' ? '#f87171' : seg.risk.level === 'mid' ? '#fbbf24' : '#34d399';
    if (e.type === 'ski') {
      const p = edgeLabelPos(e);
      planSvg += `<circle cx="${p.x + 26}" cy="${p.y - 2}" r="7" fill="${color}" stroke="#0a1322" stroke-width="1.5"/>`;
    }
    planSvg += `<g><circle cx="${b.x}" cy="${b.y}" r="9" fill="#facc15" opacity="0.25"/>
      <text x="${b.x}" y="${b.y - 16}" text-anchor="middle" font-size="11" font-weight="700"
      fill="#fde68a" style="paint-order:stroke;stroke:#0a1322;stroke-width:3px">${i + 1}</text></g>`;
  });
  planLayer.innerHTML = planSvg;

  // 其它边淡化（保留关闭灰色）
  document.querySelectorAll('#layer-skis path, #layer-lifts path').forEach((p) => {
    const id = p.dataset.id;
    const on = planIds.has(id);
    p.setAttribute('opacity', on ? '0' : p.classList.contains('edge-' + id) && id.startsWith('c') ? '0.35' : '0.22');
    p.style.transition = 'opacity .25s';
  });
  document.querySelectorAll('.lbl').forEach((t) => {
    const cls = [...t.classList].find((c) => c.startsWith('lbl-'));
    const id = cls && cls.slice(4);
    t.setAttribute('opacity', planIds.has(id) ? '0.25' : '0.55');
  });
  // 起终点强调
  const startNode = state.start;
  document.querySelector(`.node-${startNode} circle`).setAttribute('stroke', '#34d399');
  document.querySelector('.node-base circle').setAttribute('stroke', '#34d399');

  // 汇总
  const skiSegs = result.segments.filter((s) => s.edge.type === 'ski');
  const liftSegs = result.segments.filter((s) => s.edge.type === 'lift');
  const totalMin = result.segments.reduce((s, x) => s + x.mins, 0);
  const totalLen = skiSegs.reduce((s, x) => s + x.edge.length, 0);
  const liftWait = liftSegs.reduce((s, x) => s + x.edge.queueMin + x.edge.rideMin, 0);
  const overall = result.segments.some((s) => s.risk.level === 'high') ? 'high'
    : result.segments.some((s) => s.risk.level === 'mid') ? 'mid' : 'low';

  $('#summary').innerHTML = `
    <div class="stat"><div class="k">预计总用时</div><div class="v">${Math.round(totalMin)}<small> 分钟</small></div></div>
    <div class="stat"><div class="k">滑行总距离</div><div class="v">${(totalLen / 1000).toFixed(1)}<small> 公里</small></div></div>
    <div class="stat"><div class="k">雪道 / 缆车</div><div class="v">${skiSegs.length}<small> 段 · 🚡${liftSegs.length} 程约${Math.round(liftWait)}分</small></div></div>
    <div class="stat"><div class="k">全程最高风险</div><div class="v"><span class="badge ${overall}">${toneName[overall]}</span></div></div>`;

  $('#orderNote').innerHTML = result.order === 'rest-before'
    ? '路线顺序：<b>先到休息站补给</b>，再前往目标雪道，最后返回大本营（系统比较了两种顺序后取更优方案）。'
    : result.order === 'rest-after'
      ? '路线顺序：先滑<b>目标雪道</b>，再到休息站休整，最后返回大本营（系统比较了两种顺序后取更优方案）。'
      : '路线顺序：前往<b>目标雪道</b>，随后直接返回大本营。';
  if (result.problems.length) {
    $('#orderNote').innerHTML += `<br><span style="color:#fca5a5">注意：${result.problems.join('；')}</span>`;
  }

  // 路段时间线
  $('#timeline').innerHTML = result.segments.map((seg, i) => {
    const e = seg.edge;
    const a = nodeById(e.from), b = nodeById(e.to);
    const isTarget = e.id === state.targetEdgeId;
    let head;
    if (e.type === 'lift') {
      head = `
        <div class="seg-head">
          <span class="seg-name">🚡 ${e.name}</span>
          <span class="tag">乘坐 ${e.rideMin} 分 · 排队 ${e.queueMin} 分</span>
          <span class="seg-meta">约 ${seg.mins} 分钟</span>
        </div>`;
    } else {
      head = `
        <div class="seg-head">
          <span class="seg-name">⛷️ ${e.name}</span>
          <span class="tag" style="color:${levelColor(e.level)};border-color:${levelColor(e.level)}55">
            ${'●'.repeat(e.level)} ${LEVEL_INFO[e.level].name}</span>
          <span class="tag">${(e.length / 1000).toFixed(1)} km</span>
          <span class="tag">${['🟢 空闲', '🟡 正常', '🟠 较挤', '🔴 很挤'][e.crowd]}</span>
          ${isTarget ? '<span class="tag target">★ 你选择的目标雪道</span>' : ''}
          <span class="badge ${seg.risk.level}">${toneName[seg.risk.level]}</span>
          <span class="seg-meta">约 ${seg.mins} 分钟</span>
        </div>`;
    }
    const risks = e.type === 'ski'
      ? `<ul class="risk-list">${seg.risk.items.map((r) => `<li class="${r.tone}">${r.text}</li>`).join('')}</ul>`
      : `<ul class="risk-list"><li class="low">缆车上行，注意上下车安全与雪板固定</li></ul>`;
    return `
      <div class="seg ${e.type === 'lift' ? 'lift' : ''}" data-idx="${i + 1}" data-edge="${e.id}">
        <div class="seg-card risk-${e.type === 'ski' ? seg.risk.level : 'low'}">
          ${head}
          <div class="seg-route"><b>${a.name}</b> → <b>${b.name}</b></div>
          ${risks}
        </div>
      </div>`;
  }).join('');

  // 悬停联动
  document.querySelectorAll('.seg').forEach((el) => {
    el.addEventListener('mouseenter', () => {
      const path = document.querySelector(`.edge-${el.dataset.edge}`);
      if (path) { path.setAttribute('opacity', '1'); path.style.strokeWidth = '4'; }
    });
    el.addEventListener('mouseleave', () => {
      const path = document.querySelector(`.edge-${el.dataset.edge}`);
      if (path) { path.setAttribute('opacity', '0'); path.style.strokeWidth = ''; }
    });
  });
}

function renderErrors(result) {
  $('#summary').innerHTML = '';
  $('#orderNote').innerHTML = '';
  $('#timeline').innerHTML = `
    <div class="alert">
      <div class="t">无法生成推荐路线</div>
      ${result.problems.map((p) => `· ${p}`).join('<br>')}
    </div>`;
  // 地图恢复默认显示
  document.querySelectorAll('#layer-nodes circle').forEach((c) => c.setAttribute('stroke', '#7dd3fc'));
  document.querySelectorAll('#layer-skis path').forEach((p) => p.setAttribute('opacity', '0.55'));
  document.querySelectorAll('#layer-lifts path').forEach((p) => p.setAttribute('opacity', '0.65'));
  document.querySelectorAll('.lbl').forEach((t) => t.setAttribute('opacity', '1'));
  $('#layer-plan').innerHTML = '';
}

function run() {
  const result = recommend(state);
  if (result.ok) renderPlan(result);
  else renderErrors(result);
}

/* ---------------- 启动 ---------------- */
buildMap();
initForm();
run();
