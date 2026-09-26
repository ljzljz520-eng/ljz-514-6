/* ============================================================
 * 滑雪场雪道数据（虚构雪场：云顶滑雪场 / Cloudpeak Resort）
 * nodes: 节点 = 缆车站、山顶、休息站、大本营
 * edges: 边   = 雪道（向下滑行）或缆车（向上运送）
 *
 * level: 1 初级(绿) 2 中级(蓝) 3 高级(红) 4 专家(黑)
 * status: open / closed
 * crowd: 拥挤度 0~3（0 空闲，1 正常，2 较挤，3 很挤）
 * ============================================================ */

export const LEVEL_INFO = {
  1: { name: '初级', color: '#22c55e' },
  2: { name: '中级', color: '#3b82f6' },
  3: { name: '高级', color: '#ef4444' },
  4: { name: '专家', color: '#111827' },
};

export const LIFTS = [
  { id: 'L1', name: '1号缆车（云顶快线）' },
  { id: 'L2', name: '2号缆车（山脊缆车）' },
  { id: 'L3', name: '3号缆车（练习场缆车）' },
];

export const RESTS = [
  { id: 'r1', name: '云海餐厅' },
  { id: 'r2', name: '林间补给屋' },
  { id: 'r3', name: '观景咖啡屋' },
  { id: 'r4', name: '暖阳休息站' },
];

export const NODES = [
  { id: 'base',    name: '大本营',            type: 'base', x: 400, y: 560 },
  { id: 'summit',  name: '云顶（2680m）',     type: 'peak', x: 400, y: 70  },
  { id: 'ridge',   name: '北风脊（2350m）',   type: 'peak', x: 130, y: 160 },
  { id: 'mid',     name: '中转站（2050m）',   type: 'station', x: 300, y: 300 },
  { id: 'park',    name: '地形公园（1800m）', type: 'park', x: 600, y: 380 },
  { id: 'lodge',   name: '练习区（1600m）',   type: 'station', x: 200, y: 430 },
  { id: 'r1',      name: '云海餐厅',          type: 'rest', x: 130, y: 270 },
  { id: 'r2',      name: '林间补给屋',        type: 'rest', x: 560, y: 200 },
  { id: 'r3',      name: '观景咖啡屋',        type: 'rest', x: 100, y: 360 },
  { id: 'r4',      name: '暖阳休息站',        type: 'rest', x: 520, y: 470 },
];

/*
 * type: 'ski' 雪道（需要 level 达标才能进入）
 *       'lift' 缆车（人人可乘，有排队时间 queueMin）
 * flags 地形标签：ice 结冰 / mogul 猫跳 / glade 林间 / park 道具
 */
export const EDGES = [
  // ---------- 云顶 summit 出发 ----------
  { id: 'e1',  from: 'summit', to: 'ridge', type: 'ski', name: '云顶黑道',   level: 4, length: 1800, crowd: 2, flags: ['ice'],   status: 'open' },
  { id: 'e2',  from: 'summit', to: 'mid',   type: 'ski', name: '云顶红道',   level: 3, length: 2100, crowd: 1, flags: [],        status: 'open' },
  { id: 'e3',  from: 'summit', to: 'r2',    type: 'ski', name: '林间野雪',   level: 3, length: 1500, crowd: 0, flags: ['glade'], status: 'open' },
  { id: 'e4',  from: 'summit', to: 'lodge', type: 'ski', name: '环山雪道',   level: 2, length: 3200, crowd: 2, flags: [],        status: 'open' },

  // ---------- 北风脊 ridge 出发 ----------
  { id: 'e5',  from: 'ridge', to: 'r3',    type: 'ski', name: '北风脊蓝道', level: 2, length: 1600, crowd: 1, flags: [],        status: 'open' },
  { id: 'e6',  from: 'ridge', to: 'lodge', type: 'ski', name: '猫跳峡谷',   level: 3, length: 1200, crowd: 1, flags: ['mogul'], status: 'open' },
  { id: 'e7',  from: 'ridge', to: 'base',  type: 'ski', name: '山脊速降',   level: 4, length: 2600, crowd: 3, flags: ['ice'],   status: 'open' },

  // ---------- 中转站 mid 出发 ----------
  { id: 'e8',  from: 'mid', to: 'lodge', type: 'ski', name: '中级练习道', level: 2, length: 1100, crowd: 1, flags: [],      status: 'open' },
  { id: 'e9',  from: 'mid', to: 'r1',    type: 'ski', name: '云海支线',   level: 2, length: 700,  crowd: 1, flags: [],      status: 'open' },
  { id: 'e10', from: 'mid', to: 'park',  type: 'ski', name: '公园连接线', level: 2, length: 900,  crowd: 2, flags: ['park'],status: 'open' },

  // ---------- 地形公园 park 出发 ----------
  { id: 'e11', from: 'park', to: 'r4',   type: 'ski', name: '公园初级道', level: 1, length: 800,  crowd: 2, flags: ['park'], status: 'open' },
  { id: 'e12', from: 'park', to: 'base', type: 'ski', name: '追风红道',   level: 3, length: 1400, crowd: 1, flags: [],       status: 'open' },

  // ---------- 练习区 lodge 出发 ----------
  { id: 'e13', from: 'lodge', to: 'base', type: 'ski', name: '初学者练习道', level: 1, length: 600, crowd: 3, flags: [],      status: 'open' },
  { id: 'e14', from: 'lodge', to: 'r3',   type: 'ski', name: '缓坡绿道',     level: 1, length: 500, crowd: 0, flags: [],      status: 'open' },

  // ---------- 休息站之间 / 收尾 ----------
  { id: 'e15', from: 'r1', to: 'lodge', type: 'ski', name: '餐厅回场道', level: 1, length: 400, crowd: 1, flags: [],       status: 'open' },
  { id: 'e16', from: 'r2', to: 'park',  type: 'ski', name: '林缘雪道',   level: 2, length: 1100, crowd: 0, flags: ['glade'],status: 'open' },
  { id: 'e17', from: 'r4', to: 'base',  type: 'ski', name: '暖阳回山底', level: 1, length: 700, crowd: 1, flags: [],       status: 'open' },

  // ---------- 关闭雪道：不开放、不能进入推荐计算 ----------
  { id: 'e18', from: 'summit', to: 'park', type: 'ski', name: '凯旋大道',   level: 2, length: 2400, crowd: 0, flags: [],      status: 'closed', note: '压雪作业，全天关闭' },
  { id: 'e19', from: 'ridge',  to: 'mid',  type: 'ski', name: '北风脊连接线', level: 3, length: 1300, crowd: 0, flags: ['ice'],status: 'closed', note: '雪崩风险排查，暂停开放' },

  // ---------- 缆车（上行） ----------
  { id: 'c1', from: 'base',   to: 'summit', type: 'lift', name: '1号缆车（云顶快线）', liftId: 'L1', rideMin: 12, queueMin: 8 },
  { id: 'c2', from: 'mid',    to: 'summit', type: 'lift', name: '2号缆车（山脊缆车）', liftId: 'L2', rideMin: 7,  queueMin: 5 },
  { id: 'c3', from: 'lodge',  to: 'mid',    type: 'lift', name: '3号缆车（练习场缆车）', liftId: 'L3', rideMin: 6,  queueMin: 3 },
  { id: 'c4', from: 'base',   to: 'lodge',  type: 'lift', name: '练习区魔毯',           liftId: 'L3', rideMin: 4,  queueMin: 2 },
];

/* 用户选择"所在缆车"时，默认把该缆车上站作为起点 */
export const LIFT_START = { L1: 'summit', L2: 'summit', L3: 'mid' };

export const nodeById = (id) => NODES.find((n) => n.id === id);
export const edgeById = (id) => EDGES.find((e) => e.id === id);
export const openSkiEdges = () => EDGES.filter((e) => e.type === 'ski' && e.status === 'open');
