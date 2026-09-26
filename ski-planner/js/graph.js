/* ============================================================
 * 路径规划引擎
 *  - buildEdges  : 只把“开放”的缆车/雪道放入图（关闭设施不参与计算）
 *  - dijkstra    : 单源最短路径
 *  - edgeCost    : 综合成本 = 长度(滑行时间) × 难度超水平惩罚 × 拥挤惩罚
 *  - planRoute   : 所在缆车出发 → 贪心串联全部目标 → 返程回山脚
 *  - segmentRisk : 单段（缆车/雪道）风险评级
 * ============================================================ */
(function (global) {
  'use strict';

  var DIFF_NAMES   = ['绿道', '蓝道', '红道', '黑道'];
  var DIFF_COLORS  = ['#27ae60', '#2980d9', '#e74c3c', '#2c3e50'];
  var SKILL_NAMES  = ['初级', '中级', '高级', '专家'];
  var CROWD_NAMES  = { low: '低', medium: '中', high: '高' };
  var RISK_NAMES   = ['低风险', '中风险', '高风险'];

  var CROWD_WAIT       = { low: 0, medium: 4, high: 10 };  // 缆车排队(分钟)
  var CROWD_MULT       = { low: 1, medium: 1.2, high: 1.5 }; // 雪道拥挤对成本的放大
  var OVER_SKILL_MULT  = [3, 8, 30];                        // 难度超出水平 1/2/3 级
  var BASE_NODE        = 'N0';

  /* 雪道滑行时间（分钟），水平越高速度越快 */
  function trailMinutes(edge, skill) {
    var speed = 12 + skill * 4; // 12 / 16 / 20 / 24 km/h
    return (edge.length / 1000) / speed * 60;
  }

  /* 缆车用时 = 乘坐时间 + 排队时间 */
  function liftMinutes(edge) {
    return edge.rideMinutes + (CROWD_WAIT[edge.crowding] || 0);
  }

  /* 单条边的综合成本 */
  function edgeCost(edge, skill) {
    if (edge.kind === 'lift') return liftMinutes(edge);
    var cost = trailMinutes(edge, skill);
    var over = edge.difficulty - skill;
    if (over > 0) cost *= OVER_SKILL_MULT[Math.min(over - 1, OVER_SKILL_MULT.length - 1)];
    cost *= CROWD_MULT[edge.crowding] || 1;
    return cost;
  }

  /* 构图：关闭的缆车/雪道一律排除 */
  function buildEdges(resort) {
    var edges = [];
    resort.lifts.forEach(function (l) { if (l.open) edges.push(Object.assign({ kind: 'lift' }, l)); });
    resort.trails.forEach(function (t) { if (t.open) edges.push(Object.assign({ kind: 'trail' }, t)); });
    return edges;
  }

  /* Dijkstra */
  function dijkstra(edges, start, skill) {
    var adj = new Map();
    var nodes = new Set([start]);
    edges.forEach(function (e) {
      nodes.add(e.from); nodes.add(e.to);
      if (!adj.has(e.from)) adj.set(e.from, []);
      adj.get(e.from).push(e);
    });
    var dist = {}, prevEdge = {}, prevNode = {}, done = new Set();
    nodes.forEach(function (n) { dist[n] = Infinity; });
    dist[start] = 0;

    for (;;) {
      var u = null, best = Infinity;
      nodes.forEach(function (n) {
        if (!done.has(n) && dist[n] < best) { best = dist[n]; u = n; }
      });
      if (u === null) break;
      done.add(u);
      (adj.get(u) || []).forEach(function (e) {
        var w = edgeCost(e, skill);
        if (dist[u] + w < dist[e.to]) {
          dist[e.to] = dist[u] + w;
          prevEdge[e.to] = e.id;
          prevNode[e.to] = u;
        }
      });
    }
    return { dist: dist, prevEdge: prevEdge, prevNode: prevNode };
  }

  /* 根据前驱表还原 from → to 的边序列 */
  function collectPath(edgeById, prevEdge, prevNode, from, to) {
    var out = [], n = to, guard = 0;
    while (n !== from && guard++ < 1000) {
      var id = prevEdge[n];
      if (!id) break;
      out.unshift(edgeById[id]);
      n = prevNode[n];
    }
    return out;
  }

  /* 单段风险评估：难度 vs 水平、拥挤度、长度 */
  function segmentRisk(edge, skill) {
    var reasons = [];
    var level = 0;

    if (edge.kind === 'lift') {
      if (edge.crowding === 'high') {
        level = 1;
        reasons.push('缆车拥挤度高，预计排队约 +' + CROWD_WAIT.high + ' 分钟');
      } else if (edge.crowding === 'medium') {
        reasons.push('客流适中，预计排队约 +' + CROWD_WAIT.medium + ' 分钟');
      } else {
        reasons.push('客流较少，基本无需排队');
      }
    } else {
      var over = edge.difficulty - skill;
      if (over > 0) {
        level = 2;
        reasons.push(DIFF_NAMES[edge.difficulty] + '超出「' + SKILL_NAMES[skill] + '」水平，请谨慎评估');
      } else if (edge.difficulty === skill && edge.difficulty >= 2) {
        level = Math.max(level, 1);
        reasons.push('难度处于能力上限，保持专注');
      }
      if (edge.crowding === 'high') {
        level = Math.max(level, 1);
        reasons.push('拥挤度高，注意避让与控速');
      }
      if (edge.length >= 1800) {
        level = Math.max(level, 1);
        reasons.push('距离较长，注意体力分配');
      }
      if (!reasons.length) reasons.push('难度与客流均在舒适范围内');
    }
    return { level: level, label: RISK_NAMES[level], reasons: reasons };
  }

  /*
   * 主规划：
   * 1) 首段强制乘坐用户所在缆车（关闭则报错）
   * 2) 贪心选取“剩余目标中到达成本最低”的目标，直到全部访问
   * 3) 不可达目标（如依赖关闭缆车）进入 unreachable
   * 4) 自动规划返程回山脚大厅
   */
  function planRoute(resort, opts) {
    var skill = opts.skill;
    var result = { legs: [], unreachable: [], totals: null, error: null };

    var lift = resort.lifts.find(function (l) { return l.id === opts.startLiftId; });
    if (!lift) { result.error = '请选择所在缆车。'; return result; }
    if (!lift.open) {
      result.error = '「' + lift.name + '」今日关闭（' + (lift.note || '暂停运营') + '），请选择其他缆车。';
      return result;
    }

    var edges = buildEdges(resort);
    var edgeById = {};
    edges.forEach(function (e) { edgeById[e.id] = e; });

    /* 第 1 段：乘坐所在缆车上山 */
    result.legs.push({
      goal: { type: 'start', name: '乘坐 ' + lift.name + ' 上山' },
      segments: [Object.assign({ kind: 'lift' }, lift)],
    });
    var current = lift.to;

    /* 收集目标：雪道(必须经过该边) / 休息站(到达该节点) */
    var wps = [];
    (opts.trailIds || []).forEach(function (id) {
      var t = resort.trails.find(function (x) { return x.id === id; });
      if (!t) return;
      if (!t.open) {
        result.unreachable.push({ name: '雪道·' + t.name, reason: '雪道关闭（' + (t.note || '暂停开放') + '），未纳入计算' });
        return;
      }
      wps.push({ type: 'trail', ref: t, name: '雪道·' + t.name });
    });
    (opts.restIds || []).forEach(function (id) {
      var r = resort.rests.find(function (x) { return x.id === id; });
      if (r) wps.push({ type: 'rest', ref: r, name: '休息站·' + r.name });
    });

    /* 贪心串联目标 */
    while (wps.length) {
      var r0 = dijkstra(edges, current, skill);
      var best = null;
      wps.forEach(function (wp) {
        var cost;
        if (wp.type === 'rest') {
          cost = r0.dist[wp.ref.node];
        } else {
          cost = r0.dist[wp.ref.from] + edgeCost(Object.assign({ kind: 'trail' }, wp.ref), skill);
        }
        if (cost < (best ? best.cost : Infinity)) best = { wp: wp, cost: cost };
      });

      if (!best || !isFinite(best.cost)) {
        wps.forEach(function (wp) {
          result.unreachable.push({ name: wp.name, reason: '在当前开放的缆车/雪道下不可达，已跳过' });
        });
        break;
      }

      var wp = best.wp, segments;
      if (wp.type === 'rest') {
        segments = collectPath(edgeById, r0.prevEdge, r0.prevNode, current, wp.ref.node);
        current = wp.ref.node;
      } else {
        segments = collectPath(edgeById, r0.prevEdge, r0.prevNode, current, wp.ref.from);
        segments.push(Object.assign({ kind: 'trail' }, wp.ref));
        current = wp.ref.to;
      }
      result.legs.push({ goal: { type: wp.type, name: wp.name }, segments: segments });
      wps.splice(wps.indexOf(wp), 1);
    }

    /* 返程：回山脚大厅 */
    if (current !== BASE_NODE) {
      var rb = dijkstra(edges, current, skill);
      if (isFinite(rb.dist[BASE_NODE])) {
        var ret = collectPath(edgeById, rb.prevEdge, rb.prevNode, current, BASE_NODE);
        if (ret.length) result.legs.push({ goal: { type: 'return', name: '返程 · 返回山脚大厅' }, segments: ret });
      } else {
        result.unreachable.push({ name: '返程', reason: '无法回到山脚大厅，请现场咨询工作人员' });
      }
    }

    /* 汇总 */
    var allSegs = result.legs.reduce(function (a, l) { return a.concat(l.segments); }, []);
    var trailLen = allSegs.filter(function (s) { return s.kind === 'trail'; })
                          .reduce(function (a, s) { return a + s.length; }, 0);
    var timeMin = allSegs.reduce(function (a, s) {
      return a + (s.kind === 'lift' ? liftMinutes(s) : trailMinutes(s, skill));
    }, 0);
    var liftCount = allSegs.filter(function (s) { return s.kind === 'lift'; }).length;
    var maxRisk = 0;
    allSegs.forEach(function (s) { maxRisk = Math.max(maxRisk, segmentRisk(s, skill).level); });
    var totalGoals = (opts.trailIds || []).length + (opts.restIds || []).length;
    var failedGoals = result.unreachable.filter(function (u) { return u.name !== '返程'; }).length;

    result.totals = {
      trailLen: trailLen,
      timeMin: Math.round(timeMin),
      liftCount: liftCount,
      maxRisk: maxRisk,
      segCount: allSegs.length,
      totalGoals: totalGoals,
      doneGoals: totalGoals - failedGoals,
    };
    return result;
  }

  var api = {
    DIFF_NAMES: DIFF_NAMES, DIFF_COLORS: DIFF_COLORS, SKILL_NAMES: SKILL_NAMES,
    CROWD_NAMES: CROWD_NAMES, RISK_NAMES: RISK_NAMES,
    trailMinutes: trailMinutes, liftMinutes: liftMinutes, edgeCost: edgeCost,
    buildEdges: buildEdges, dijkstra: dijkstra, segmentRisk: segmentRisk, planRoute: planRoute,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.Planner = api;
})(typeof window !== 'undefined' ? window : globalThis);
