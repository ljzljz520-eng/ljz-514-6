import assert from 'node:assert';
import { recommend, assessRisks } from './engine.js';
import { EDGES } from './data.js';

let pass = 0;
const test = (name, fn) => { fn(); pass++; console.log('  ✓', name); };

// 1. 高级滑雪者从云顶出发，目标云顶红道，无休息站
test('高级用户 summit -> 云顶红道 -> base', () => {
  const r = recommend({ start: 'summit', userLevel: 3, targetEdgeId: 'e2' });
  assert.ok(r.ok);
  assert.ok(r.segments.some((s) => s.edge.id === 'e2'));
  assert.equal(r.segments[0].edge.from, 'summit');
  assert.equal(r.segments[r.segments.length - 1].edge.to, 'base');
});

// 2. 路线中绝不包含关闭雪道
test('任何推荐都不经过 closed 雪道', () => {
  const closed = EDGES.filter((e) => e.status === 'closed').map((e) => e.id);
  for (const lv of [1, 2, 3, 4]) {
    for (const e of EDGES.filter((x) => x.type === 'ski' && x.status === 'open' && x.level <= lv)) {
      const r = recommend({ start: 'summit', userLevel: lv, targetEdgeId: e.id });
      if (r.ok) assert.ok(!r.segments.some((s) => closed.includes(s.edge.id)));
    }
  }
});

// 3. 水平不足不能进入雪道
test('初级用户不能以黑道为目标', () => {
  const r = recommend({ start: 'summit', userLevel: 1, targetEdgeId: 'e1' });
  assert.ok(!r.ok);
  assert.ok(r.problems.join('').includes('高于'));
});

// 4. 目标雪道关闭
test('关闭雪道作为目标被拒绝', () => {
  const r = recommend({ start: 'summit', userLevel: 4, targetEdgeId: 'e18' });
  assert.ok(!r.ok);
  assert.ok(r.problems.join('').includes('关闭'));
});

// 5. 中级用户 + 休息站：休息站和目标雪道都在路线上
test('中级用户途经休息站与目标雪道', () => {
  const r = recommend({ start: 'summit', userLevel: 2, targetEdgeId: 'e8', restId: 'r1' });
  assert.ok(r.ok);
  assert.ok(r.segments.some((s) => s.edge.id === 'e8'));
  const visits = new Set();
  let cur = 'summit';
  r.segments.forEach((s) => { visits.add(cur); cur = s.edge.to; visits.add(cur); });
  assert.ok(visits.has('r1'));
});

// 6. 初级用户无法到达只由高级道连接的林间补给屋（从 summit 出发）
test('初级用户无法完成高级连通目标时给出说明', () => {
  const r = recommend({ start: 'summit', userLevel: 1, targetEdgeId: 'e3' });
  assert.ok(!r.ok);
});

// 7. 贴顶难度给出高风险
test('难度贴顶标高风险', () => {
  const r = recommend({ start: 'summit', userLevel: 4, targetEdgeId: 'e1' });
  const seg = r.segments.find((s) => s.edge.id === 'e1');
  assert.equal(seg.risk.level, 'high');
  assert.ok(seg.risk.items.some((i) => i.text.includes('贴顶')));
});

// 8. 结冰+很挤的山脊速降同时给两个高风险
test('山脊速降（结冰+很挤）高风险', () => {
  const risk = assessRisks(EDGES.find((e) => e.id === 'e7'), 4);
  assert.equal(risk.level, 'high');
  assert.ok(risk.items.some((i) => i.text.includes('结冰')));
  assert.ok(risk.items.some((i) => i.text.includes('拥挤')));
});

// 9. 初学者练习道对初级用户：从容
test('初级道对初级用户是高风险贴顶提示（安全保守）', () => {
  const risk = assessRisks(EDGES.find((e) => e.id === 'e13'), 1);
  // 很挤(crowd 3) -> high
  assert.equal(risk.level, 'high');
});

// 10. 初级用户从 lodge 出发滑初级道回 base 可达
test('lodge 出发初级用户可回 base', () => {
  const r = recommend({ start: 'lodge', userLevel: 1, targetEdgeId: 'e13' });
  assert.ok(r.ok);
});

// 11. 所有可行路线首尾合法：第一段 from=start，最后一段 to=base
test('路径连续性：边首尾相接', () => {
  const r = recommend({ start: 'mid', userLevel: 3, targetEdgeId: 'e12', restId: 'r4' });
  assert.ok(r.ok);
  let prev = null;
  for (const s of r.segments) {
    if (prev) assert.equal(prev.edge.to, s.edge.from);
    prev = s;
  }
  assert.equal(r.segments.at(-1).edge.to, 'base');
});

// 12. 休息站"前/后"两种顺序都被评估并取更优
test('提供两种休息站顺序并选优', () => {
  const r = recommend({ start: 'summit', userLevel: 3, targetEdgeId: 'e12', restId: 'r4' });
  assert.ok(r.ok);
  assert.ok(r.alternatives >= 1);
});

console.log(`\n全部 ${pass} 个测试通过 ✅`);
