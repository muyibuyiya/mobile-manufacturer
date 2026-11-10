// 科技树结构回归：无环 / 无悬空前置 / 年代单调 / 树形度 / 孤立节点
// 这是防止科技树退化成「一堆能点的卡片」的守门测试
import { TECHS, TECH_CATS } from '../js/data/tech.js';
import * as PARTS from '../js/data/parts.js';
import * as HW from '../js/data/hardware.js';
import { DIVISION_TECH_GATES } from '../js/core/divisions.js';

let bad = 0;
const check = (name, ok, detail = '') => {
  if (!ok) bad += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const byId = new Map(TECHS.map((t) => [t.id, t]));
const catOf = (id) => (byId.get(id) || {}).cat;

// 1. 前置必须存在、不能指向自己
const dangling = TECHS.filter((t) => (t.prereq || []).some((p) => !byId.has(p) || p === t.id));
check('前置引用全部有效', dangling.length === 0, dangling.map((t) => t.id).join(','));

// 2. 不能有环
const state = new Map();
let cycle = null;
const walk = (id, stack) => {
  if (state.get(id) === 2) return;
  if (state.get(id) === 1) { cycle = stack.slice(stack.indexOf(id)).concat(id); return; }
  state.set(id, 1);
  for (const p of (byId.get(id) || {}).prereq || []) walk(p, stack.concat(id));
  state.set(id, 2);
};
for (const t of TECHS) if (!cycle) walk(t.id, []);
check('依赖图无环', !cycle, cycle ? cycle.join(' → ') : '');

// 3. 年代单调：前置不能比自己更晚出现（否则永远不可达）
const yearBad = TECHS.filter((t) => (t.prereq || []).some((p) => (byId.get(p) || {}).year > t.year));
check('前置年份不晚于节点', yearBad.length === 0,
  yearBad.map((t) => `${t.id}(${t.year})←${(t.prereq || []).filter((p) => (byId.get(p) || {}).year > t.year).join('+')}`).join(' '));

// 4. 树形度：多前置节点数量（纯单链每类都只有 1 个前置）
const multi = TECHS.filter((t) => (t.prereq || []).length > 1);
check('多前置汇聚节点 ≥ 15', multi.length >= 15, `n=${multi.length}`);

// 5. 连接与定位域：节点数量 + 跨域依赖
const connect = TECHS.filter((t) => t.cat === 'connect');
check('连接与定位域 ≥ 8 个节点', connect.length >= 8, `n=${connect.length}`);
const crossDomain = connect.filter((t) => (t.prereq || []).some((p) => catOf(p) !== 'connect'));
check('连接域存在跨域前置', crossDomain.length >= 3, crossDomain.map((t) => t.id).join(','));

// 6. 每个附加功能零件的 tech 必须真实存在
const badExtra = PARTS.EXTRAS.filter((x) => !byId.has(x.tech));
check('附加功能的 tech 均存在', badExtra.length === 0, badExtra.map((x) => `${x.id}→${x.tech}`).join(','));

// 7. 叶子节点必须被消费，不能挂在那里不产生作用
const consumed = new Set();
const addTech = (arr) => { for (const p of arr || []) if (p.tech) consumed.add(p.tech); };
for (const k of ['CPUS', 'RAMS', 'STORAGES', 'SCREENS', 'CAMERAS', 'BATTERIES', 'SYSTEMS', 'EXTRAS']) addTech(PARTS[k]);
for (const k of Object.keys(PARTS.CHARGERS)) addTech(PARTS.CHARGERS[k]);
addTech(HW.IMAGE_SENSORS);
addTech(HW.PANEL_VENDORS);
// 自研部门门槛也是消费点：建部/规格要求的节点必须有实际作用
for (const gate of Object.values(DIVISION_TECH_GATES)) {
  for (const id of [...(gate.build || []), ...Object.values(gate.spec || {})]) consumed.add(id);
}
// 折叠盖板：design.validate 按 foldGlass 选型校验这两个节点
consumed.add('fold_cpi');
consumed.add('fold_utg');
const hasChild = new Set();
for (const t of TECHS) for (const p of t.prereq || []) hasChild.add(p);
// 终局型节点（2080 前的收官科技）允许没有下游零件
const TERMINAL = new Set(['quantum_comm', 'quantum_cpu']);
const orphans = TECHS.filter((t) => !hasChild.has(t.id) && !consumed.has(t.id) && !TERMINAL.has(t.id));
check('无孤立叶子节点', orphans.length === 0, orphans.map((t) => t.id).join(','));

// 8. 分类完整：每个节点都属于已知分类
const badCat = TECHS.filter((t) => !TECH_CATS.some((c) => c.id === t.cat));
check('节点分类合法', badCat.length === 0, badCat.map((t) => t.id).join(','));

console.log(`\n科技图检查：${TECHS.length} 节点 / ${multi.length} 个多前置 / 连接域 ${connect.length} 个`);
if (bad) { console.log(`FAILED: ${bad} 项`); process.exit(1); }
console.log('全部通过');