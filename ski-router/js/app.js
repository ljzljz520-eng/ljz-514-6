/* 界面逻辑：表单、SVG 地图、路线渲染 */
(function () {
  'use strict';

  const DIFF_CLASS = { 1: 'd1', 2: 'd2', 3: 'd3', 4: 'd4' };
  const RISK_CLASS = { '低': 'r-low', '中': 'r-mid', '高': 'r-high', '—': 'r-none' };
  const NODE = RESORT.nodes;
  let GEO = { items: [], byId: {} };

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    document.getElementById('snowInfo').textContent =
      '雪况更新 ' + RESORT.updated + ' · 雪道开放 ' +
      RESORT.slopes.filter(s => s.open).length + '/' + RESORT.slopes.length;
    buildForm();
    drawMap();
    document.getElementById('planBtn').addEventListener('click', onPlan);
  }

  /* ---------------- 表单 ---------------- */
  function buildForm() {
    const liftSel = document.getElementById('liftSelect');
    RESORT.lifts.forEach(l => {
      const o = document.createElement('option');
      o.value = l.id;
      o.textContent = l.name + '（' + NODE[l.from].name + ' → ' + NODE[l.to].name + '）' + (l.open ? '' : ' · 停运');
      o.disabled = !l.open;
      liftSel.appendChild(o);
    });

    const skillBox = document.getElementById('skillRadios');
    RESORT.skills.forEach(s => {
      const label = document.createElement('label');
      label.className = 'skill-item';
      label.innerHTML =
        '<input type="radio" name="skill" value="' + s.level + '"' + (s.level === 2 ? ' checked' : '') + '>' +
        '<span class="skill-dot sd' + s.level + '"></span>' +
        '<span class="skill-name">' + s.name + '</span>' +
        '<span class="skill-desc">' + s.desc + '</span>';
      skillBox.appendChild(label);
    });

    const slopeBox = document.getElementById('slopeChecks');
    RESORT.slopes.slice()
      .sort((a, b) => a.diff - b.diff || a.id.localeCompare(b.id, 'zh-Hans-CN', { numeric: true }))
      .forEach(s => {
        const label = document.createElement('label');
        label.className = 'check-item' + (s.open ? '' : ' disabled');
        label.innerHTML =
          '<input type="checkbox" value="' + s.id + '"' + (s.open ? '' : ' disabled') + '>' +
          '<span class="diff-badge ' + DIFF_CLASS[s.diff] + '">' + DIFF_LABEL[s.diff] + '</span>' +
          '<span class="ci-name">' + s.name + '</span>' +
          '<span class="ci-meta">' + NODE[s.from].name + '→' + NODE[s.to].name + ' · ' + (s.length / 1000).toFixed(1) + 'km</span>' +
          (s.open
            ? '<span class="crowd-tag c' + crowdLevel(s.crowd) + '">客流' + Router.crowdLabel(s.crowd) + '</span>'
            : '<span class="closed-tag">✕ 关闭</span>');
        slopeBox.appendChild(label);
      });

    const restBox = document.getElementById('restChecks');
    RESORT.rests.forEach(r => {
      const label = document.createElement('label');
      label.className = 'check-item';
      label.innerHTML =
        '<input type="checkbox" value="' + r.id + '">' +
        '<span class="rest-icon">' + r.icon + '</span>' +
        '<span class="ci-name">' + r.name + '</span>' +
        '<span class="ci-meta">' + NODE[r.node].name + ' · ' + NODE[r.node].alt + 'm</span>';
      restBox.appendChild(label);
    });
  }

  function crowdLevel(c) { return c >= 0.7 ? 3 : c >= 0.4 ? 2 : 1; }
  function checkedValues(boxId) {
    return Array.from(document.querySelectorAll('#' + boxId + ' input:checked')).map(i => i.value);
  }

  /* ---------------- 规划 ---------------- */
  function onPlan() {
    const opts = {
      liftId: document.getElementById('liftSelect').value,
      skill: Number(document.querySelector('input[name="skill"]:checked').value),
      mode: document.getElementById('modeSelect').value,
      slopeIds: checkedValues('slopeChecks'),
      restIds: checkedValues('restChecks'),
    };
    let plan;
    try {
      plan = Router.planRoute(RESORT, opts);
    } catch (err) {
      renderWarnings([{ name: '规划失败', reason: err.message }]);
      return;
    }
    renderWarnings(plan.skipped);
    renderSummary(plan);
    renderTimeline(plan);
    renderRouteOnMap(plan);
    document.getElementById('resultCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderWarnings(skipped) {
    const box = document.getElementById('warnings');
    if (!skipped.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = 'flex';
    box.innerHTML = skipped.map(s =>
      '<div class="warn-item">⚠️ <b>' + s.name + '</b>：' + s.reason + '</div>').join('');
  }

  function card(b, s) { return '<div class="card"><b>' + b + '</b><span>' + s + '</span></div>'; }

  function renderSummary(plan) {
    const t = plan.totals;
    document.getElementById('routeSub').textContent =
      NODE[plan.lift.from].name + ' 乘「' + plan.lift.name + '」上山 · 终点 ' + NODE[plan.endNode].name;
    document.getElementById('summary').innerHTML =
      card(t.skiKm.toFixed(1) + ' km', '雪道 ' + t.slopeCount + ' 段') +
      card(Math.round(t.skiMin) + ' 分钟', '滑行时间') +
      card(Math.round(t.liftMin + t.waitMin) + ' 分钟', '缆车（含排队 ' + Math.round(t.waitMin) + '′）') +
      card(t.restMin + ' 分钟', '休息 ' + t.restCount + ' 站') +
      '<div class="card total"><b>' + Math.round(t.totalMin) + ' 分钟</b><span>全程预计</span></div>' +
      '<div class="card"><span class="risk-pill ' + RISK_CLASS[t.maxRisk] + '">' +
        (t.maxRisk === '—' ? '—' : t.maxRisk + '风险') + '</span><span>全程最高风险</span></div>';
  }

  function renderTimeline(plan) {
    document.getElementById('placeholder').style.display = 'none';
    const ol = document.getElementById('timeline');
    let n = 0;
    ol.innerHTML = plan.segments.map(seg => {
      if (seg.kind === 'rest') {
        return '<li class="seg rest"><div class="seg-idx">' + (seg.icon || '☕') + '</div>' +
          '<div class="seg-main"><div class="seg-title">在「' + seg.name + '」休息' +
          '<span class="seg-nodes">' + NODE[seg.node].name + '</span></div>' +
          '<div class="seg-meta">建议休息 ' + seg.minutes + ' 分钟 · 补充体力再出发</div></div></li>';
      }
      n++;
      if (seg.kind === 'lift') {
        return '<li class="seg lift"><div class="seg-idx">' + n + '</div>' +
          '<div class="seg-main"><div class="seg-title">🚡 ' + seg.name + (seg.down ? '（下行）' : '') +
          '<span class="seg-nodes">' + NODE[seg.from].name + ' → ' + NODE[seg.to].name + '</span>' +
          (seg.first ? '<span class="req-tag">出发</span>' : '') + '</div>' +
          '<div class="seg-meta">乘坐 ' + seg.rideMin + ' 分钟 · 排队约 ' + seg.waitMin + ' 分钟</div>' +
          riskHtml(seg) + '</div></li>';
      }
      return '<li class="seg slope ' + RISK_CLASS[seg.risk.level] + '"><div class="seg-idx">' + n + '</div>' +
        '<div class="seg-main"><div class="seg-title">' +
        '<span class="diff-badge ' + DIFF_CLASS[seg.diff] + '">' + DIFF_LABEL[seg.diff] + '</span>' + seg.name +
        '<span class="seg-nodes">' + NODE[seg.from].name + ' → ' + NODE[seg.to].name + '</span>' +
        (seg.required ? '<span class="req-tag">想去</span>' : '') + '</div>' +
        '<div class="seg-meta">' + seg.length + ' m · 约 ' + Math.round(seg.minutes) + ' 分钟 · 客流' +
        Router.crowdLabel(seg.crowd) +
        '<span class="crowd-bar"><i style="width:' + Math.round(seg.crowd * 100) + '%"></i></span></div>' +
        riskHtml(seg) + '</div></li>';
    }).join('');
  }

  function riskHtml(seg) {
    const r = seg.risk;
    return '<div class="seg-risk"><span class="risk-pill ' + RISK_CLASS[r.level] + '">' + r.level +
      '风险</span><span class="risk-factors">' + r.factors.join('；') + '</span></div>';
  }

  /* ---------------- 地图 ---------------- */
  function edgePath(x1, y1, x2, y2, off) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const cx = mx + (-dy / len) * off * 2;
    const cy = my + (dx / len) * off * 2;
    return 'M ' + x1 + ' ' + y1 + ' Q ' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ' ' + x2 + ' ' + y2;
  }
  function edgeMid(x1, y1, x2, y2, off) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    return [mx + (-dy / len) * off, my + (dx / len) * off];
  }

  function computeGeometry() {
    const items = [];
    RESORT.lifts.forEach(l => items.push({ kind: 'lift', id: l.id, ref: l, from: l.from, to: l.to }));
    RESORT.slopes.forEach(s => items.push({ kind: 'slope', id: s.id, ref: s, from: s.from, to: s.to }));
    const groups = {};
    items.forEach(it => {
      const key = [it.from, it.to].sort().join('-');
      (groups[key] = groups[key] || []).push(it);
    });
    Object.values(groups).forEach(g => {
      g.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'lift' ? -1 : 1;
        return (a.ref.diff || 0) - (b.ref.diff || 0);
      });
      g.forEach((it, i) => { it.off = (i - (g.length - 1) / 2) * 16; });
    });
    const byId = {};
    items.forEach(it => {
      const a = NODE[it.from], b = NODE[it.to];
      it.x1 = a.x; it.y1 = a.y; it.x2 = b.x; it.y2 = b.y;
      it.d = edgePath(it.x1, it.y1, it.x2, it.y2, it.off);
      it.mid = edgeMid(it.x1, it.y1, it.x2, it.y2, it.off);
      byId[it.id] = it;
    });
    return { items, byId };
  }

  function drawMap() {
    GEO = computeGeometry();
    const svg = document.getElementById('map');
    svg.innerHTML =
      '<defs>' +
        '<marker id="arrow-route" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">' +
          '<path d="M 0 1 L 9 5 L 0 9 z" fill="#ffa502"></path></marker>' +
        '<filter id="glow" x="-40%" y="-40%" width="180%" height="180%">' +
          '<feGaussianBlur stdDeviation="2.5" result="b"></feGaussianBlur>' +
          '<feMerge><feMergeNode in="b"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge>' +
        '</filter>' +
      '</defs>' +
      '<g>' +
        '<circle cx="400" cy="80" r="46" class="deco"></circle>' +
        '<circle cx="400" cy="80" r="92" class="deco"></circle>' +
        '<circle cx="400" cy="80" r="142" class="deco"></circle>' +
        '<circle cx="120" cy="190" r="58" class="deco"></circle>' +
        '<circle cx="660" cy="190" r="58" class="deco"></circle>' +
      '</g>' +
      '<g>' + GEO.items.filter(i => i.kind === 'lift').map(liftSvg).join('') + '</g>' +
      '<g>' + GEO.items.filter(i => i.kind === 'slope').map(slopeSvg).join('') + '</g>' +
      '<g id="layer-route"></g>' +
      '<g>' + Object.values(NODE).map(nodeSvg).join('') + '</g>' +
      '<g>' + RESORT.rests.map(restSvg).join('') + '</g>' +
      '<g id="layer-tags"></g>';

    document.getElementById('legend').innerHTML =
      '<span><i class="lg d1"></i>绿道</span>' +
      '<span><i class="lg d2"></i>蓝道</span>' +
      '<span><i class="lg d3"></i>红道</span>' +
      '<span><i class="lg d4"></i>黑道</span>' +
      '<span><i class="lg lift"></i>缆车</span>' +
      '<span><i class="lg closed"></i>已关闭</span>' +
      '<span><i class="lg route"></i>推荐路线</span>' +
      '<span>🍜 休息站</span>';
  }

  function liftSvg(it) {
    const l = it.ref;
    return '<g><path class="lift-line" d="' + it.d + '"><title>' +
      l.name + '｜' + NODE[l.from].name + ' ⇄ ' + NODE[l.to].name +
      '｜乘坐 ' + l.rideMin + ' 分钟｜排队约 ' + Math.round(l.crowd * 15) + ' 分钟</title></path>' +
      '<text class="lift-icon" x="' + it.mid[0] + '" y="' + it.mid[1] + '">🚡</text></g>';
  }

  function slopeSvg(it) {
    const s = it.ref;
    const cls = 'slope-line ' + DIFF_CLASS[s.diff] + (s.open ? '' : ' closed');
    const title = s.name + '｜' + DIFF_LABEL[s.diff] + '｜' + s.length + ' m｜客流' +
      Router.crowdLabel(s.crowd) + (s.open ? '' : '｜今日关闭');
    return '<g><path class="' + cls + '" d="' + it.d + '"><title>' + title + '</title></path>' +
      (s.open ? '' : '<text class="closed-x" x="' + it.mid[0] + '" y="' + it.mid[1] + '">✕</text>') + '</g>';
  }

  function nodeSvg(n) {
    return '<g class="node" transform="translate(' + n.x + ',' + n.y + ')">' +
      '<circle r="9"></circle>' +
      '<text class="node-name" y="-16">' + n.name + '</text>' +
      '<text class="node-alt" y="24">' + n.alt + 'm</text></g>';
  }

  function restSvg(r) {
    const n = NODE[r.node];
    return '<text class="rest-map-icon" x="' + (n.x + 15) + '" y="' + (n.y - 10) + '">' + r.icon +
      '<title>' + r.name + '（' + n.name + '）</title></text>';
  }

  function segGeometry(seg) {
    if (seg.kind === 'slope') return GEO.byId[seg.id];
    const base = GEO.byId[seg.id.replace('-down', '')];
    if (!seg.down) return base;
    return { d: edgePath(base.x2, base.y2, base.x1, base.y1, base.off), mid: base.mid };
  }

  function renderRouteOnMap(plan) {
    const parts = [], tags = [];
    let n = 0;
    plan.segments.forEach(seg => {
      if (seg.kind === 'rest') return;
      n++;
      const geo = segGeometry(seg);
      parts.push('<path class="route-line" d="' + geo.d + '" marker-end="url(#arrow-route)"></path>');
      tags.push('<g class="seq-badge" transform="translate(' + geo.mid[0] + ',' + geo.mid[1] + ')">' +
        '<circle r="9"></circle><text y="3.5">' + n + '</text></g>');
    });
    const s = NODE[plan.lift.from], e = NODE[plan.endNode];
    tags.push('<g class="endpoint start" transform="translate(' + s.x + ',' + (s.y - 30) + ')">' +
      '<rect x="-22" y="-11" width="44" height="18" rx="9"></rect><text y="3">起点</text></g>');
    tags.push('<g class="endpoint end" transform="translate(' + e.x + ',' + (e.y + 42) + ')">' +
      '<rect x="-22" y="-11" width="44" height="18" rx="9"></rect><text y="3">终点</text></g>');
    document.getElementById('layer-route').innerHTML = parts.join('');
    document.getElementById('layer-tags').innerHTML = tags.join('');
  }
})();
