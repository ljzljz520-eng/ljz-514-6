/* ============================================================
 * 推荐引擎
 *  - closed 的雪道在构建邻接表时直接剔除，不参与任何计算
 *  - ski 边要求雪道难度 <= 用户水平，否则不可通行
 *  - 代价 = 时间(长度/速度 + 拥挤附加 + 缆车乘坐/排队)
 *           + 难度贴顶惩罚 + 地形不适惩罚 + 拥挤惩罚
 *  - 每段输出风险标签与风险等级（高/中/低）
 * ============================================================ */

import { EDGES, NODES, nodeById, edgeById } from './data.js';

const SPEED = { 1: 160, 2: 240, 3: 320, 4: 400 }; // 各水平滑行速度 米/分钟（水平越低越慢）
const CROWD_TIME = [0, 0.5, 1.5, 3];               // 拥挤度带来的额外耗时（分钟）
const LONG_RUN_M = 2000;                            // 长距离雪道阈值

/* ---------- 风险评估（单条雪道） ---------- */
export function assessRisks(edge, userLevel) {
  const risks = [];
  if (edge.type !== 'ski') {
    return { level: 'low', items: risks };
  }

  if (edge.level > userLevel) {
    risks.push({ tone: 'high', text: `难度超出你的水平（${edge.level}级 > ${userLevel}级），禁止进入` });
  } else if (edge.level === userLevel) {
    risks.push({ tone: 'high', text: `难度贴顶：这是你能滑的最高等级（${edge.level}级），注意控制速度` });
  } else if (edge.level === userLevel - 1) {
    risks.push({ tone: 'mid', text: '难度接近上限，建议先热身再进入' });
  }

  if (edge.flags.includes('ice'))   risks.push({ tone: 'high', text: '结冰路段，易打滑，减速并使用刃部刻滑' });
  if (edge.flags.includes('mogul')) risks.push({ tone: 'mid',  text: '猫跳地形，对膝盖和节奏要求高' });
  if (edge.flags.includes('glade')) risks.push({ tone: 'mid',  text: '林间野雪，视线受阻，注意树间间距与盲区' });
  if (edge.flags.includes('park'))  risks.push({ tone: 'mid',  text: '地形公园，道具/跳台区域，按标识绕行或通过' });

  if (edge.crowd >= 3) risks.push({ tone: 'high', text: '当前很拥挤，追尾风险高，保持安全距离' });
  else if (edge.crowd === 2) risks.push({ tone: 'mid', text: '当前较拥挤，注意前方突然减速的滑雪者' });

  if (edge.length >= LONG_RUN_M) risks.push({ tone: 'mid', text: '长距离雪道，注意体力与腿部疲劳' });

  const tone = risks.some((r) => r.tone === 'high') ? 'high'
             : risks.some((r) => r.tone === 'mid') ? 'mid' : 'low';
  if (tone === 'low') risks.push({ tone: 'low', text: '路况良好，无明显风险' });
  return { level: tone, items: risks };
}

/* ---------- 单段时间 ---------- */
export function edgeMinutes(edge, userLevel) {
  if (edge.type === 'lift') return edge.rideMin + edge.queueMin;
  const speed = SPEED[userLevel] || SPEED[1];
  const base = edge.length / speed;
  return +(base + CROWD_TIME[edge.crowd]).toFixed(1);
}

/* ---------- 单段推荐代价（越小越优） ---------- */
function edgeCost(edge, userLevel) {
  const mins = edgeMinutes(edge, userLevel);
  if (edge.type === 'lift') return mins; // 缆车只算时间
  let cost = mins;
  const diff = userLevel - edge.level;
  if (diff === 0) cost *= 3.0;       // 难度贴顶：显著惩罚
  else if (diff === 1) cost *= 1.6;  // 接近上限
  // diff >= 2 不额外惩罚（从容滑行）
  if (edge.crowd === 3) cost += 12;
  else if (edge.crowd === 2) cost += 5;
  if (edge.flags.includes('ice')) cost += 6;
  if (edge.flags.includes('mogul')) cost += 4;
  if (edge.flags.includes('glade')) cost += 3;
  return cost;
}

/* ---------- 构建邻接表：关闭雪道在此剔除 ---------- */
function buildAdj() {
  const adj = new Map(NODES.map((n) => [n.id, []]));
  for (const e of EDGES) {
    // 关闭雪道不能进入计算
    if (e.type === 'ski' && e.status !== 'open') continue;
    adj.get(e.from).push(e);
  }
  return adj;
}

/* ---------- Dijkstra：返回 { path:[edges], cost } ---------- */
function dijkstra(adj, start, goal, userLevel) {
  if (start === goal) return { path: [], cost: 0 };
  const dist = new Map([[start, 0]]);
  const prev = new Map();
  const visited = new Set();
  const queue = new Set(NODES.map((n) => n.id));

  while (queue.size) {
    let u = null;
    let best = Infinity;
    for (const id of queue) {
      const d = dist.has(id) ? dist.get(id) : Infinity;
      if (d < best) { best = d; u = id; }
    }
    if (u === null || best === Infinity) break;
    if (u === goal) break;
    queue.delete(u);
    visited.add(u);

    for (const e of adj.get(u) || []) {
      // 雪道难度超过用户水平：不可通行
      if (e.type === 'ski' && e.level > userLevel) continue;
      if (visited.has(e.to)) continue;
      const nd = best + edgeCost(e, userLevel);
      if (nd < (dist.has(e.to) ? dist.get(e.to) : Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, e);
      }
    }
  }
  if (!dist.has(goal)) return null;
  const path = [];
  let cur = goal;
  while (cur !== start) {
    const e = prev.get(cur);
    if (!e) return null;
    path.unshift(e);
    cur = e.from;
  }
  return { path, cost: dist.get(goal) };
}

/* 拼接两段路径：分段之间只在节点处相接，不会共享边；
 * 同一条缆车在环线中可能被乘坐两次，因此绝不能按边 id 去重 */
const stitch = (a, b) => a.concat(b);

/* ---------- 主推荐 ----------
 * input: { start, userLevel, targetEdgeId, restId }
 * 规则：
 *  1) 必须经过目标雪道
 *  2) 若选了休息站，枚举"休息站在目标雪道之前 / 之后"两种顺序取最优
 *  3) 最终回到大本营 base
 */
export function recommend({ start, userLevel, targetEdgeId, restId }) {
  const target = edgeById(targetEdgeId);
  const problems = [];
  if (!target || target.type !== 'ski') return { ok: false, problems: ['请选择想去的雪道'] };
  if (target.status !== 'open') return { ok: false, problems: [`「${target.name}」当前关闭（${target.note || '未开放'}），请改选其他雪道`] };
  if (target.level > userLevel) {
    problems.push(`「${target.name}」为 ${target.level} 级雪道，高于你的 ${userLevel} 级水平，无法安全进入`);
  }

  const adj = buildAdj();
  const run = (a, b) => dijkstra(adj, a, b, userLevel);

  const tFrom = target.from;
  const tTo = target.to;
  const R = restId || null;

  const candidates = [];
  const targetLeg = { path: [target], cost: edgeCost(target, userLevel) };
  const tryBuild = (order) => {
    // 目标雪道作为"强制边"直接插入，避免最短路把它绕过去；
    // 其余相邻途经点之间用最短路连接
    let parts;
    if (R && order === 'rest-before') {
      parts = [run(start, R), run(R, tFrom), targetLeg, run(tTo, 'base')];
    } else if (R && order === 'rest-after') {
      parts = [run(start, tFrom), targetLeg, run(tTo, R), run(R, 'base')];
    } else {
      parts = [run(start, tFrom), targetLeg, run(tTo, 'base')];
    }
    if (parts.some((p) => p === null)) return null;
    let path = [];
    for (const p of parts) path = stitch(path, p.path);
    const cost = parts.reduce((s, p) => s + p.cost, 0);
    return { path, cost, order };
  };

  if (R) {
    const a = tryBuild('rest-before');
    const b = tryBuild('rest-after');
    if (a) candidates.push(a);
    if (b) candidates.push(b);
  } else {
    const c = tryBuild('none');
    if (c) candidates.push(c);
  }

  if (!candidates.length) {
    return {
      ok: false,
      problems: [
        ...problems,
        problems.length ? '' : '在当前水平与雪道开放状态下，找不到一条能经过目标雪道并返回大本营的连通路线（可尝试提高水平或更换目标/休息站）',
      ].filter(Boolean),
    };
  }

  candidates.sort((x, y) => x.cost - y.cost);
  const best = candidates[0];
  return {
    ok: true,
    problems,
    order: best.order,
    alternatives: candidates.length,
    segments: best.path.map((e) => ({
      edge: e,
      mins: edgeMinutes(e, userLevel),
      risk: assessRisks(e, userLevel),
    })),
  };
}

export { nodeById };
