/* 规划引擎测试：node test/planner.test.js */
const assert = require('assert');
const RESORT = require('../js/data.js');
const P = require('../js/graph.js');

function plan(opts) {
  return P.planRoute(RESORT, Object.assign({ trailIds: [], restIds: [] }, opts));
}
function segIds(res) {
  return res.legs.reduce((a, l) => a.concat(l.segments.map(s => s.id)), []);
}

// 1) 关闭的雪道 T5、关闭的缆车 L5 永远不进入规划
{
  const res = plan({ startLiftId: 'L4', skill: 3, trailIds: ['T6'] });
  const ids = segIds(res);
  assert(!ids.includes('T5'), 'FAIL: 关闭雪道 T5 不应出现');
  assert(!ids.includes('L5'), 'FAIL: 关闭缆车 L5 不应出现');
  console.log('✔ 关闭设施不参与计算');
}

// 2) 选择关闭缆车作为起点 -> error
{
  const res = plan({ startLiftId: 'L5', skill: 1 });
  assert(res.error && /关闭/.test(res.error), 'FAIL: 关闭缆车应报错');
  console.log('✔ 起点缆车关闭时给出错误');
}

// 3) T9 峡谷道仅能经关闭的 L5 到达 -> 不可达告警，且路线中不含 T9
{
  const res = plan({ startLiftId: 'L1', skill: 3, trailIds: ['T9'] });
  assert(res.unreachable.some(u => u.name.includes('峡谷道')), 'FAIL: 峡谷道应报告不可达');
  assert(!segIds(res).includes('T9'), 'FAIL: 不可达雪道不应进入路线');
  console.log('✔ 依赖关闭缆车的目标被标记为不可达');
}

// 4) 路线第一段必须是用户选择的所在缆车
{
  const res = plan({ startLiftId: 'L4', skill: 0 });
  assert.strictEqual(res.legs[0].segments[0].id, 'L4');
  console.log('✔ 首段为所选缆车');
}

// 5) 初级玩家被强制经黑道 T8 到达目标时，该段评级必须为高风险
{
  const res = plan({ startLiftId: 'L1', skill: 0, trailIds: ['T8'] });
  const seg = segIds(res).includes('T8');
  assert(seg, 'FAIL: 指定目标 T8 应被纳入');
  const t8 = res.legs.flatMap(l => l.segments).find(s => s.id === 'T8');
  assert.strictEqual(P.segmentRisk(t8, 0).level, 2);
  console.log('✔ 难度超出水平的雪道段标记为高风险并给出原因');
}

// 6) 选休息站 R3（峰顶）应真实到达 N5
{
  const res = plan({ startLiftId: 'L1', skill: 1, restIds: ['R3'] });
  const toNodes = res.legs.flatMap(l => l.segments.map(s => s.to));
  assert(toNodes.includes('N5'), 'FAIL: 应到达峰顶 N5');
  console.log('✔ 休息站目标可达');
}

// 7) 规划结束自动返程到山脚 N0（T3 终点是半山平台，需返程）
{
  const res = plan({ startLiftId: 'L1', skill: 1, trailIds: ['T3'] });
  const last = res.legs[res.legs.length - 1];
  assert.strictEqual(last.goal.type, 'return');
  assert.strictEqual(last.segments[last.segments.length - 1].to, 'N0');
  console.log('✔ 自动返程回山脚大厅');
}

// 7b) 目标雪道恰好滑到山脚时，不追加多余返程段
{
  const res = plan({ startLiftId: 'L2', skill: 1, trailIds: ['T2'] });
  const last = res.legs[res.legs.length - 1];
  assert.strictEqual(last.goal.type, 'trail');
  assert.strictEqual(last.segments[last.segments.length - 1].to, 'N0');
  console.log('✔ 已在山脚时不追加多余返程');
}

// 8) 中级玩家未选黑道时，规划结果应回避黑道（难度惩罚生效）
{
  const res = plan({ startLiftId: 'L1', skill: 1, restIds: ['R3'] });
  assert(!segIds(res).includes('T8'), 'FAIL: 中级玩家不应被引导走黑道 T8');
  console.log('✔ 高难度雪道在无必要时被回避');
}

// 9) 汇总信息完整
{
  const res = plan({ startLiftId: 'L1', skill: 1, trailIds: ['T3'], restIds: ['R2'] });
  const t = res.totals;
  assert(t.trailLen > 0 && t.timeMin > 0 && t.liftCount >= 1);
  assert(t.totalGoals === 2 && t.doneGoals === 2);
  console.log('✔ 汇总指标（长度/用时/缆车数/目标达成）正确');
}

console.log('\n全部 9 项测试通过 ✅');
