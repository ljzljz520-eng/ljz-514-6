/**
 * 云岭国际滑雪场 · 雪场数据（演示用模拟雪况）
 * 节点：A 山脚大本营 / B 半山平台 / C 云顶 / D 西岭 / E 东山 / F 溪谷
 */
const RESORT = {
  name: '云岭国际滑雪场',
  updated: '2026-09-10 08:30',
  baseNode: 'A', // 路线终点：山脚大本营
  nodes: {
    A: { id: 'A', name: '山脚大本营', alt: 1200, x: 400, y: 500 },
    B: { id: 'B', name: '半山平台',   alt: 1800, x: 400, y: 300 },
    C: { id: 'C', name: '云顶',       alt: 2400, x: 400, y: 80  },
    D: { id: 'D', name: '西岭',       alt: 2000, x: 120, y: 190 },
    E: { id: 'E', name: '东山',       alt: 2100, x: 660, y: 190 },
    F: { id: 'F', name: '溪谷',       alt: 1500, x: 150, y: 400 },
  },
  // 缆车：可上下行（下行 = 坐缆车下山）
  lifts: [
    { id: 'L1', name: '山脚快线', from: 'A', to: 'B', rideMin: 8,  crowd: 0.5, open: true },
    { id: 'L2', name: '云顶缆车', from: 'B', to: 'C', rideMin: 10, crowd: 0.3, open: true },
    { id: 'L3', name: '西岭缆车', from: 'A', to: 'D', rideMin: 9,  crowd: 0.2, open: true },
    { id: 'L4', name: '东山缆车', from: 'B', to: 'E', rideMin: 7,  crowd: 0.6, open: true },
    { id: 'L5', name: '溪谷缆车', from: 'F', to: 'B', rideMin: 6,  crowd: 0.4, open: true },
  ],
  // 雪道：diff 1绿/2蓝/3红/4黑，length 米，crowd 0~1，open 开放状态
  slopes: [
    { id: 'S1',  name: '云顶大道',   from: 'C', to: 'B', diff: 2, length: 1800, crowd: 0.3, open: true  },
    { id: 'S2',  name: '飞鹰道',     from: 'C', to: 'B', diff: 3, length: 1500, crowd: 0.5, open: true  },
    { id: 'S3',  name: '野雪黑钻',   from: 'C', to: 'F', diff: 4, length: 2200, crowd: 0.2, open: false },
    { id: 'S4',  name: '新手长廊',   from: 'B', to: 'A', diff: 1, length: 2500, crowd: 0.7, open: true  },
    { id: 'S5',  name: '溪谷巡航',   from: 'B', to: 'F', diff: 2, length: 1200, crowd: 0.4, open: true  },
    { id: 'S6',  name: '西岭滑行道', from: 'D', to: 'B', diff: 2, length: 1600, crowd: 0.3, open: true  },
    { id: 'S7',  name: '西风红道',   from: 'D', to: 'A', diff: 3, length: 2000, crowd: 0.4, open: true  },
    { id: 'S8',  name: '东山速降',   from: 'E', to: 'B', diff: 3, length: 1400, crowd: 0.6, open: true  },
    { id: 'S9',  name: '黑松露',     from: 'E', to: 'F', diff: 4, length: 1800, crowd: 0.2, open: true  },
    { id: 'S10', name: '溪谷绿道',   from: 'F', to: 'A', diff: 1, length: 1000, crowd: 0.5, open: true  },
    { id: 'S11', name: '山脊连接道', from: 'C', to: 'E', diff: 3, length: 900,  crowd: 0.3, open: false },
    { id: 'S12', name: '落日红道',   from: 'B', to: 'A', diff: 3, length: 1600, crowd: 0.8, open: true  },
    { id: 'S13', name: '云顶观景道', from: 'C', to: 'B', diff: 1, length: 2800, crowd: 0.6, open: true  },
  ],
  rests: [
    { id: 'R1', name: '云间小屋', node: 'B', icon: '☕' },
    { id: 'R2', name: '山顶餐厅', node: 'C', icon: '🍜' },
    { id: 'R3', name: '松涛茶屋', node: 'E', icon: '🍵' },
    { id: 'R4', name: '溪谷茶屋', node: 'F', icon: '🍰' },
  ],
  skills: [
    { level: 1, name: '新手', desc: '仅绿道' },
    { level: 2, name: '初级', desc: '绿道 · 蓝道' },
    { level: 3, name: '中级', desc: '可下红道' },
    { level: 4, name: '高级', desc: '全雪道畅通' },
  ],
};

const DIFF_LABEL = { 1: '绿道', 2: '蓝道', 3: '红道', 4: '黑道' };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RESORT, DIFF_LABEL };
}
