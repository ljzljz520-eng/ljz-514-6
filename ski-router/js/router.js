/**
 * 路线规划核心（纯逻辑，可在 Node 中单测）
 * 规则：
 *  - 关闭雪道不进入图（不参与任何计算）
 *  - 超过用户水平的雪道不进入图
 *  - 缆车可上下行（下行视为“坐缆车下山”）
 *  - 代价综合 难度 / 长度 / 拥挤度，可按偏好切换
 */
(function (global) {
  'use strict';

  const DIFF_TXT = (typeof DIFF_LABEL !== 'undefined')
    ? DIFF_LABEL
    : require('./data.js').DIFF_LABEL;

  const SPEED = { 1: 5.0, 2: 4.5, 3: 4.0, 4: 3.4 }; // m/s，按雪道难度的基础滑行速度
  const LIFT_EQUIV_METERS = 400;  // “距离最短”模式下缆车折算米数
  const REST_MIN = 15;            // 每个休息站建议停留分钟

  /** 展开为有向边：雪道（下行）+ 缆车（上下行） */
  function buildEdges(resort) {
    const edges = [];
    for (const l of resort.lifts) {
      edges.push({ id: l.id, kind: 'lift', name: l.name, from: l.from, to: l.to,
        rideMin: l.rideMin, crowd: l.crowd, open: l.open, diff: 0, length: 0, down: false });
      edges.push({ id: l.id + '-down', kind: 'lift', name: l.name, from: l.to, to: l.from,
        rideMin: l.rideMin, crowd: l.crowd, open: l.open, diff: 0, length: 0, down: true });
    }
    for (const s of resort.slopes) {
      edges.push({ id: s.id, kind: 'slope', name: s.name, from: s.from, to: s.to,
        diff: s.diff, length: s.length, crowd: s.crowd, open: s.open });
    }
    return edges;
  }

  /** 关闭雪道 & 超水平雪道一律不进图 */
  function edgeAllowed(edge, skill) {
    if (!edge.open) return false;
    if (edge.kind === 'slope' && edge.diff > skill) return false;
    return true;
  }

  function slopeMinutes(edge, skill) {
    let v = SPEED[edge.diff] || 4;
    if (edge.diff === skill) v *= 0.85;        // 接近能力上限，放慢
    else if (edge.diff <= skill - 2) v *= 1.1; // 游刃有余
    return edge.length / v / 60;
  }

  function liftWaitMin(edge) { return edge.crowd * 15; }

  function edgeMinutes(edge, skill) {
    if (edge.kind === 'lift') return edge.rideMin + liftWaitMin(edge);
    return slopeMinutes(edge, skill);
  }

  /** 综合 难度/长度/拥挤度 的代价，可按偏好切换 */
  function edgeWeight(edge, skill, mode) {
    const t = edgeMinutes(edge, skill);
    switch (mode) {
      case 'shortest':   // 距离最短
        return edge.kind === 'slope' ? edge.length : LIFT_EQUIV_METERS;
      case 'avoidCrowd': // 避开拥挤
        return t * (1 + 2.5 * edge.crowd);
      case 'easiest':    // 难度最缓
        return t * (1 + 0.9 * (edge.diff - 1)) * (edge.diff === skill ? 1.6 : 1);
      case 'balanced':   // 综合推荐
      default:
        return t * (1 + 0.6 * edge.crowd) * (1 + 0.12 * (edge.diff - 1));
    }
  }

  function buildAdjacency(resort, edges, skill) {
    const adj = {};
    Object.keys(resort.nodes).forEach(n => { adj[n] = []; });
    for (const e of edges) {
      if (!edgeAllowed(e, skill)) continue;
      adj[e.from].push(e);
    }
    return adj;
  }

  function dijkstra(adj, start, skill, mode) {
    const dist = {}; const prev = {}; const done = new Set();
    dist[start] = 0;
    const pq = [[0, start]];
    while (pq.length) {
      let bi = 0;
      for (let i = 1; i < pq.length; i++) if (pq[i][0] < pq[bi][0]) bi = i;
      const [d, u] = pq.splice(bi, 1)[0];
      if (done.has(u)) continue;
      done.add(u);
      for (const e of (adj[u] || [])) {
        const nd = d + edgeWeight(e, skill, mode);
        if (dist[e.to] === undefined || nd < dist[e.to]) {
          dist[e.to] = nd;
          prev[e.to] = { from: u, edge: e };
          pq.push([nd, e.to]);
        }
      }
    }
    return { dist, prev };
  }

  function reconstruct(dij, start, target) {
    if (start === target) return [];
    const path = [];
    let cur = target;
    let guard = 0;
    while (cur !== start) {
      const p = dij.prev[cur];
      if (!p) return null; // 不可达
      path.unshift(p.edge);
      cur = p.from;
      if (++guard > 1000) return null;
    }
    return path;
  }

  /** 每段风险评估：输出 低/中/高 + 风险因素 */
  function assessRisk(edge, skill) {
    const factors = [];
    let score = 0;
    if (edge.kind === 'lift') {
      if (edge.crowd >= 0.6) { score += 1; factors.push('缆车排队较长'); }
      if (edge.down) factors.push('乘缆车下山');
      if (!factors.length) factors.push('常规乘坐');
      return { score, level: score >= 1 ? '中' : '低', factors };
    }
    if (edge.diff === skill) { score += 2; factors.push('难度接近能力上限'); }
    else if (edge.diff === skill - 1) { score += 1; factors.push('难度接近舒适区边缘'); }
    if (edge.diff === 4) { score += 1; factors.push('黑道陡坡'); }
    if (edge.crowd >= 0.7) { score += 2; factors.push('拥挤度高，注意避让'); }
    else if (edge.crowd >= 0.4) { score += 1; factors.push('中等客流'); }
    if (edge.length >= 2000) { score += 1; factors.push('长距离滑行，注意体力'); }
    if (!factors.length) factors.push('难度与客流都很友好');
    const level = score >= 4 ? '高' : score >= 2 ? '中' : '低';
    return { score, level, factors };
  }

  function crowdLabel(c) { return c >= 0.7 ? '高' : c >= 0.4 ? '中' : '低'; }

  /* ---------------- 途经点排序 ---------------- */
  function legCost(dij, from, to) {
    const d = dij[from].dist[to];
    return d === undefined ? Infinity : d;
  }
  function wpEnter(w) { return w.type === 'slope' ? w.edge.from : w.node; }
  function wpExit(w)  { return w.type === 'slope' ? w.edge.to   : w.node; }
  function wpCost(w, skill, mode) { return w.type === 'slope' ? edgeWeight(w.edge, skill, mode) : 0; }

  function seqCost(order, start, end, dij, skill, mode) {
    let cur = start; let sum = 0;
    for (const w of order) {
      const c = legCost(dij, cur, wpEnter(w));
      if (!isFinite(c)) return Infinity;
      sum += c + wpCost(w, skill, mode);
      cur = wpExit(w);
    }
    const c = legCost(dij, cur, end);
    return isFinite(c) ? sum + c : Infinity;
  }

  function permutations(arr) {
    const res = []; const a = arr.slice();
    (function gen(k) {
      if (k === 1) { res.push(a.slice()); return; }
      gen(k - 1);
      for (let i = 0; i < k - 1; i++) {
        const j = k % 2 ? 0 : i;
        const tmp = a[j]; a[j] = a[k - 1]; a[k - 1] = tmp;
        gen(k - 1);
      }
    })(a.length);
    return res;
  }

  function orderWaypoints(wps, start, end, dij, skill, mode) {
    if (wps.length <= 1) return wps.slice();
    let best = null; let bestCost = Infinity;
    if (wps.length <= 8) {
      for (const p of permutations(wps)) {
        const c = seqCost(p, start, end, dij, skill, mode);
        if (c < bestCost) { bestCost = c; best = p; }
      }
    } else {
      // 最近邻 + 2-opt
      const remaining = wps.slice(); const order = []; let cur = start;
      while (remaining.length) {
        let bi = 0; let bc = Infinity;
        remaining.forEach((w, i) => {
          const c = legCost(dij, cur, wpEnter(w)) + wpCost(w, skill, mode);
          if (c < bc) { bc = c; bi = i; }
        });
        const w = remaining.splice(bi, 1)[0];
        order.push(w); cur = wpExit(w);
      }
      let improved = true;
      while (improved) {
        improved = false;
        for (let i = 0; i < order.length - 1 && !improved; i++) {
          for (let j = i + 1; j < order.length; j++) {
            const cand = order.slice(0, i).concat(order.slice(i, j + 1).reverse(), order.slice(j + 1));
            if (seqCost(cand, start, end, dij, skill, mode) < seqCost(order, start, end, dij, skill, mode) - 1e-9) {
              order.splice.apply(order, [0, order.length].concat(cand));
              improved = true; break;
            }
          }
        }
      }
      best = order; bestCost = seqCost(best, start, end, dij, skill, mode);
    }
    if (!best || !isFinite(bestCost)) throw new Error('无法规划完整路线：部分目的地之间不可达');
    return best;
  }

  function mkSegment(e, skill, extra) {
    const seg = {
      kind: e.kind, id: e.id, name: e.name, from: e.from, to: e.to,
      diff: e.diff || 0, length: e.length || 0, crowd: e.crowd || 0,
      down: !!e.down,
    };
    if (e.kind === 'lift') {
      seg.rideMin = e.rideMin;
      seg.waitMin = Math.round(liftWaitMin(e));
      seg.minutes = seg.rideMin + seg.waitMin;
    } else {
      seg.minutes = slopeMinutes(e, skill);
    }
    seg.risk = assessRisk(e, skill);
    if (extra) Object.assign(seg, extra);
    return seg;
  }

  /**
   * 主入口
   * opts: { liftId, skill(1-4), mode, slopeIds:[], restIds:[] }
   * 返回: { segments, skipped, totals, ... }
   */
  function planRoute(resort, opts) {
    const skill = Number(opts.skill) || 2;
    const mode = opts.mode || 'balanced';
    const END = resort.baseNode || 'A';

    const lift = resort.lifts.find(l => l.id === opts.liftId);
    if (!lift) throw new Error('请选择所在缆车');
    if (!lift.open) throw new Error('「' + lift.name + '」今日暂停开放，请改选其他缆车');

    const edges = buildEdges(resort);
    const adj = buildAdjacency(resort, edges, skill);
    const startNode = lift.to; // 首段固定为乘坐所选缆车

    // ---- 途经点：关闭 / 超水平雪道直接剔除并说明 ----
    const skipped = [];
    const wps = [];
    (opts.slopeIds || []).forEach(sid => {
      const s = resort.slopes.find(x => x.id === sid);
      if (!s) return;
      if (!s.open) { skipped.push({ id: s.id, name: s.name, reason: '今日关闭，未纳入计算' }); return; }
      if (s.diff > skill) { skipped.push({ id: s.id, name: s.name, reason: DIFF_TXT[s.diff] + '超出当前水平，未纳入计算' }); return; }
      wps.push({ type: 'slope', id: s.id, edge: edges.find(e => e.id === s.id) });
    });
    (opts.restIds || []).forEach(rid => {
      const r = resort.rests.find(x => x.id === rid);
      if (!r) return;
      wps.push({ type: 'rest', id: r.id, node: r.node, name: r.name, icon: r.icon });
    });

    // ---- 关键点两两最短路 ----
    const keySet = new Set([startNode, END]);
    wps.forEach(w => { keySet.add(wpEnter(w)); keySet.add(wpExit(w)); });
    const dij = {};
    keySet.forEach(k => { dij[k] = dijkstra(adj, k, skill, mode); });

    // ---- 排序 & 拼接 ----
    const order = orderWaypoints(wps, startNode, END, dij, skill, mode);

    const segments = [];
    const liftEdge = edges.find(e => e.id === lift.id);
    segments.push(mkSegment(liftEdge, skill, { first: true }));

    let cur = startNode;
    const pushPath = (pathEdges) => {
      if (!pathEdges) throw new Error('路线中断：存在不可达区段');
      pathEdges.forEach(e => segments.push(mkSegment(e, skill)));
    };

    for (const w of order) {
      if (w.type === 'slope') {
        pushPath(reconstruct(dij[cur], cur, w.edge.from));
        segments.push(mkSegment(w.edge, skill, { required: true }));
        cur = w.edge.to;
      } else {
        pushPath(reconstruct(dij[cur], cur, w.node));
        segments.push({ kind: 'rest', id: w.id, name: w.name, icon: w.icon, node: w.node, minutes: REST_MIN });
        cur = w.node;
      }
    }
    pushPath(reconstruct(dij[cur], cur, END));

    // ---- 汇总 ----
    const slopeSegs = segments.filter(s => s.kind === 'slope');
    const liftSegs  = segments.filter(s => s.kind === 'lift');
    const restSegs  = segments.filter(s => s.kind === 'rest');
    const sum = (arr, f) => arr.reduce((a, b) => a + f(b), 0);
    const riskRank = { '低': 1, '中': 2, '高': 3 };
    let maxRisk = null;
    slopeSegs.forEach(s => { if (!maxRisk || riskRank[s.risk.level] > riskRank[maxRisk]) maxRisk = s.risk.level; });

    const totals = {
      skiKm: sum(slopeSegs, s => s.length) / 1000,
      skiMin: sum(slopeSegs, s => s.minutes),
      liftMin: sum(liftSegs, s => s.rideMin),
      waitMin: sum(liftSegs, s => s.waitMin),
      restMin: restSegs.length * REST_MIN,
      slopeCount: slopeSegs.length,
      liftCount: liftSegs.length,
      restCount: restSegs.length,
      maxRisk: maxRisk || '—',
    };
    totals.totalMin = totals.skiMin + totals.liftMin + totals.waitMin + totals.restMin;

    return { segments, skipped, totals, order, startNode, endNode: END, lift, skill, mode };
  }

  const api = {
    buildEdges, edgeAllowed, edgeWeight, edgeMinutes, slopeMinutes,
    dijkstra, buildAdjacency, reconstruct, assessRisk, planRoute, crowdLabel,
    REST_MIN,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Router = api;
})(typeof window !== 'undefined' ? window : globalThis);
