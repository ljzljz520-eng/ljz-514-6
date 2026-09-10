/* 路线规划核心 · Node 单元测试（无第三方依赖） */
const assert = require('assert');
const { RESORT } = require('../js/data.js');
const Router = require('../js/router.js');

const CLOSED_IDS = RESORT.slopes.filter(s => !s.open).map(s => s.id);
const MODES = ['balanced', 'shortest', 'avoidCrowd', 'easiest'];
const moveSegs = plan => plan.segments.filter(s => s.kind !== 'rest');

let passed = 0;
function t(name, fn) { fn(); passed++; console.log('  ✓ ' + name); }

console.log('\n滑雪场路线规划 · 单元测试\n');

t('数据完整：雪道/缆车/休息站引用的节点都存在', () => {
  RESORT.slopes.forEach(s => { assert(RESORT.nodes[s.from]); assert(RESORT.nodes[s.to]); });
  RESORT.lifts.forEach(l => { assert(RESORT.nodes[l.from]); assert(RESORT.nodes[l.to]); });
  RESORT.rests.forEach(r => assert(RESORT.nodes[r.node]));
});

t('全组合(5缆车×4水平×4偏好)：关闭/超水平雪道永不出现，路线连续且终点正确', () => {
  let checked = 0;
  for (const lift of RESORT.lifts) {
    for (let skill = 1; skill <= 4; skill++) {
      for (const mode of MODES) {
        const plan = Router.planRoute(RESORT, { liftId: lift.id, skill, mode, slopeIds: [], restIds: [] });
        const segs = moveSegs(plan);
        segs.forEach(s => {
          assert(!CLOSED_IDS.includes(s.id), '包含关闭雪道 ' + s.id);
          if (s.kind === 'slope') assert(s.diff <= skill, '包含超水平雪道 ' + s.id);
        });
        assert.strictEqual(segs[0].id, lift.id, '首段必须是所选缆车');
        assert.strictEqual(segs[segs.length - 1].to, RESORT.baseNode, '终点必须是山脚大本营');
        for (let i = 1; i < segs.length; i++) {
          assert.strictEqual(segs[i].from, segs[i - 1].to, '路线不连续 @' + i);
        }
        checked++;
      }
    }
  }
  assert.strictEqual(checked, 80);
});

t('想去的开放雪道会被编入路线', () => {
  const plan = Router.planRoute(RESORT, { liftId: 'L1', skill: 4, mode: 'balanced', slopeIds: ['S9', 'S6'], restIds: [] });
  const ids = plan.segments.filter(s => s.kind === 'slope').map(s => s.id);
  assert(ids.includes('S9') && ids.includes('S6'));
});

t('关闭雪道被剔除并给出原因（不进入计算）', () => {
  const plan = Router.planRoute(RESORT, { liftId: 'L1', skill: 4, mode: 'balanced', slopeIds: ['S3', 'S11'], restIds: [] });
  assert.strictEqual(plan.skipped.length, 2);
  assert(plan.skipped.every(s => s.reason.includes('关闭')));
  const ids = plan.segments.map(s => s.id);
  assert(!ids.includes('S3') && !ids.includes('S11'));
});

t('超出水平的雪道被剔除并给出原因', () => {
  const plan = Router.planRoute(RESORT, { liftId: 'L1', skill: 1, mode: 'balanced', slopeIds: ['S9'], restIds: [] });
  assert.strictEqual(plan.skipped.length, 1);
  assert(plan.skipped[0].reason.includes('超出'));
});

t('休息站会编入路线并停靠', () => {
  const plan = Router.planRoute(RESORT, { liftId: 'L1', skill: 2, mode: 'balanced', slopeIds: [], restIds: ['R2', 'R4'] });
  const rests = plan.segments.filter(s => s.kind === 'rest').map(s => s.id);
  assert(rests.includes('R2') && rests.includes('R4'));
});

t('新手在东山只能乘缆车下山（不会出现红/黑道）', () => {
  const plan = Router.planRoute(RESORT, { liftId: 'L4', skill: 1, mode: 'balanced', slopeIds: [], restIds: [] });
  const segs = moveSegs(plan);
  assert(segs.some(s => s.kind === 'lift' && s.down), '应包含缆车下行段');
  assert(segs.every(s => s.kind !== 'slope' || s.diff === 1), '新手只能滑绿道');
});

t('每一段都有风险评估（等级 + 因素）', () => {
  const plan = Router.planRoute(RESORT, { liftId: 'L1', skill: 3, mode: 'balanced', slopeIds: ['S2'], restIds: ['R1'] });
  plan.segments.forEach(s => {
    if (s.kind === 'rest') return;
    assert(s.risk && ['低', '中', '高'].includes(s.risk.level), '缺少风险等级');
    assert(Array.isArray(s.risk.factors) && s.risk.factors.length > 0, '缺少风险因素');
  });
});

t('汇总数据自洽（总用时 = 滑行 + 缆车 + 排队 + 休息）', () => {
  const plan = Router.planRoute(RESORT, { liftId: 'L2', skill: 2, mode: 'balanced', slopeIds: ['S1'], restIds: ['R2'] });
  const tt = plan.totals;
  assert(tt.skiKm > 0 && tt.totalMin > 0);
  assert(Math.abs(tt.totalMin - (tt.skiMin + tt.liftMin + tt.waitMin + tt.restMin)) < 1e-6);
});

t('大规模途经点（全部开放雪道 + 全部休息站）也能一次规划', () => {
  const open = RESORT.slopes.filter(s => s.open).map(s => s.id);
  const plan = Router.planRoute(RESORT, {
    liftId: 'L1', skill: 4, mode: 'balanced',
    slopeIds: open, restIds: RESORT.rests.map(r => r.id),
  });
  const ids = plan.segments.filter(s => s.kind === 'slope').map(s => s.id);
  open.forEach(id => assert(ids.includes(id), '漏掉了 ' + id));
  assert.strictEqual(plan.segments.filter(s => s.kind === 'rest').length, RESORT.rests.length);
  const segs = moveSegs(plan);
  for (let i = 1; i < segs.length; i++) assert.strictEqual(segs[i].from, segs[i - 1].to);
});

console.log('\n全部通过：' + passed + ' 项测试 ✅\n');
