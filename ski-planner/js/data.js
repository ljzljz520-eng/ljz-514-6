/* ============================================================
 * 雪场数据模型
 * nodes  : 站点 / 山顶 / 平台（含示意图坐标）
 * lifts  : 缆车（上坡，有开放状态、乘坐时间、拥挤度）
 * trails : 雪道（下坡，有难度、长度、拥挤度、开放状态）
 * rests  : 休息站（位于某节点）
 * ============================================================ */
const RESORT = {
  nodes: [
    { id: 'N0', name: '山脚大厅', x: 400, y: 520 },
    { id: 'N1', name: '西坡口',   x: 130, y: 500 },
    { id: 'N2', name: '松谷站',   x: 620, y: 420 },
    { id: 'N3', name: '云顶站',   x: 360, y: 300 },
    { id: 'N4', name: '西坡顶',   x: 140, y: 280 },
    { id: 'N5', name: '峰顶',     x: 430, y: 100 },
    { id: 'N6', name: '峡谷顶',   x: 700, y: 240 },
    { id: 'N7', name: '半山平台', x: 290, y: 420 },
  ],

  lifts: [
    { id: 'L1', name: '云顶快线', from: 'N0', to: 'N3', rideMinutes: 8, crowding: 'high',   open: true },
    { id: 'L2', name: '松谷缆车', from: 'N0', to: 'N2', rideMinutes: 6, crowding: 'low',    open: true },
    { id: 'L3', name: '峰顶吊厢', from: 'N3', to: 'N5', rideMinutes: 7, crowding: 'medium', open: true },
    { id: 'L4', name: '西坡缆车', from: 'N1', to: 'N4', rideMinutes: 9, crowding: 'low',    open: true },
    { id: 'L5', name: '峡谷缆车', from: 'N2', to: 'N6', rideMinutes: 7, crowding: 'medium', open: false, note: '设备维护' },
  ],

  trails: [
    { id: 'T1',   name: '晨光道',     from: 'N3', to: 'N0', difficulty: 0, length: 1800, crowding: 'low',    open: true },
    { id: 'T2',   name: '松林道',     from: 'N2', to: 'N0', difficulty: 0, length: 1200, crowding: 'medium', open: true },
    { id: 'T3',   name: '云谷道',     from: 'N3', to: 'N7', difficulty: 1, length: 1500, crowding: 'medium', open: true },
    { id: 'T4',   name: '半山道',     from: 'N7', to: 'N0', difficulty: 1, length: 1000, crowding: 'high',   open: true },
    { id: 'T5',   name: '西风道',     from: 'N4', to: 'N1', difficulty: 1, length: 1400, crowding: 'medium', open: false, note: '雪量不足' },
    { id: 'T6',   name: '西坡绿道',   from: 'N4', to: 'N1', difficulty: 0, length: 1600, crowding: 'low',    open: true },
    { id: 'T7',   name: '峰顶道',     from: 'N5', to: 'N3', difficulty: 2, length: 900,  crowding: 'medium', open: true },
    { id: 'T8',   name: '黑钻道',     from: 'N5', to: 'N7', difficulty: 3, length: 1100, crowding: 'low',    open: true },
    { id: 'T9',   name: '峡谷道',     from: 'N6', to: 'N2', difficulty: 2, length: 1300, crowding: 'low',    open: true },
    { id: 'T10',  name: '回村道',     from: 'N1', to: 'N0', difficulty: 0, length: 800,  crowding: 'medium', open: true },
    { id: 'T11',  name: '云西连接道', from: 'N3', to: 'N4', difficulty: 1, length: 600,  crowding: 'low',    open: true },
    { id: 'T11b', name: '云西连接道', from: 'N4', to: 'N3', difficulty: 1, length: 600,  crowding: 'low',    open: true },
    { id: 'T12',  name: '松云道',     from: 'N7', to: 'N2', difficulty: 1, length: 900,  crowding: 'medium', open: true },
  ],

  rests: [
    { id: 'R0', name: '山麓餐厅',   node: 'N0' },
    { id: 'R1', name: '松谷咖啡屋', node: 'N2' },
    { id: 'R2', name: '云顶餐厅',   node: 'N3' },
    { id: 'R3', name: '峰顶观景台', node: 'N5' },
  ],
};

if (typeof module !== 'undefined' && module.exports) module.exports = RESORT;
