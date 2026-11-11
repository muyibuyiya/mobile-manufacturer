// 专业分部门 / 一键分配 / 自研设计槽位 的回归
import { createGame } from '../js/core/state.js';
import { buildDivision, designProduct, designSlots, DIVISION_DEFS } from '../js/core/divisions.js';
import { startUpgrade } from '../js/core/divisions.js';
import { ensureOrg, autoAssignByField, deptPrefsOf, roleForDept, FIELD_DEPT_PREFS } from '../js/core/org.js';
import { FIELDS } from '../js/data/world.js';

let bad = 0;
const check = (name, ok, detail = '') => {
  if (!ok) bad += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

// 1. 专业 → 部门映射覆盖全部专业
{
  const missing = FIELDS.filter((f) => !FIELD_DEPT_PREFS[f]);
  check('每个专业都有归属部门', missing.length === 0, missing.join('、'));
  check('微电子 → 研发部', deptPrefsOf({ field: '微电子' })[0] === 'rnd');
  check('工业设计 → 设计部', deptPrefsOf({ field: '工业设计' })[0] === 'design');
  check('软件工程 → 软件部', deptPrefsOf({ field: '软件工程' })[0] === 'sw');
  check('材料 → 生产部', deptPrefsOf({ field: '材料科学' })[0] === 'prod');
  check('质量 → 质量部', deptPrefsOf({ field: '质量管理' })[0] === 'qa');
  check('供应链 → 供应链部', deptPrefsOf({ field: '供应链管理' })[0] === 'supply');
  check('市场/财务为双候选', deptPrefsOf({ field: '市场营销' }).length === 2 && deptPrefsOf({ field: '财务管理' }).length === 2);
  check('未知专业兜底研发部', deptPrefsOf({ field: '玄学' })[0] === 'rnd' && deptPrefsOf({})[0] === 'rnd');
}

// 2. 岗位按部门与资历分档
{
  check('低能力 → 初档', roleForDept('rnd', 50) === '工程师');
  check('中能力 → 二档', roleForDept('rnd', 70) === '高级工程师');
  check('高能力 → 三档', roleForDept('rnd', 90) === '技术专家');
  check('软件部岗位命名独立', roleForDept('sw', 90) === '系统架构师');
}

// 3. 一键按专业分配
{
  const s = createGame({ mode: 'sandbox', year: 2020, companyName: '分配', cash: 5e9 });
  ensureOrg(s);
  s.employees = [
    { id: 'e1', name: '甲', field: '微电子', deptId: 'mkt', role: '市场专员', skill: 72 },
    { id: 'e2', name: '乙', field: '工业设计', deptId: null, role: '待分配', skill: 88 },
    { id: 'e3', name: '丙', field: '软件工程', deptId: 'sales', role: '销售代表', skill: 61 },
    { id: 'e4', name: '丁', field: '微电子', deptId: 'exec', role: 'CEO', skill: 80 },
    { id: 'e5', name: '戊', field: '质量管理', deptId: 'rnd', role: '工程师', skill: 55 },
    { id: 'e6', name: '己', field: '通信工程', deptId: 'rnd', role: '技术专家', skill: 84 },
  ];
  s.org.heads = { mkt: 'e1', qa: 'e5' };
  const r = autoAssignByField(s);
  check('分配结果统计', r.ok && r.moved >= 4, JSON.stringify(r));
  check('微电子归研发部', s.employees.find((e) => e.id === 'e1').deptId === 'rnd');
  check('工业设计归设计部', s.employees.find((e) => e.id === 'e2').deptId === 'design');
  check('软件工程归软件部', s.employees.find((e) => e.id === 'e3').deptId === 'sw');
  check('高管不动', s.employees.find((e) => e.id === 'e4').deptId === 'exec');
  check('质量工程师归质量部', s.employees.find((e) => e.id === 'e5').deptId === 'qa');
  check('岗位随部门重写', s.employees.find((e) => e.id === 'e1').role.startsWith('高级'));
  check('被调离的主管卸任', !s.org.heads.mkt && r.released === 1, JSON.stringify(s.org.heads));
  check('仍在原部门的主管保留', s.org.heads.qa === 'e5', JSON.stringify(s.org.heads));
  const again = autoAssignByField(s);
  check('二次执行无变动（幂等）', again.moved === 0, JSON.stringify(again));
}

// 4. 市场营销 / 财务按人数均衡分流
{
  const s = createGame({ mode: 'sandbox', year: 2020, companyName: '均衡', cash: 5e9 });
  ensureOrg(s);
  s.employees = Array.from({ length: 6 }, (_, i) => ({ id: 'm' + i, name: 'M' + i, field: '市场营销', deptId: null, role: '待分配', skill: 60 }));
  autoAssignByField(s);
  const mkt = s.employees.filter((e) => e.deptId === 'mkt').length;
  const sales = s.employees.filter((e) => e.deptId === 'sales').length;
  check('市场营销分流到市场部与销售部', mkt > 0 && sales > 0 && mkt + sales === 6, `mkt=${mkt} sales=${sales}`);
  const s2 = createGame({ mode: 'sandbox', year: 2020, companyName: '均衡2', cash: 5e9 });
  ensureOrg(s2);
  s2.employees = Array.from({ length: 4 }, (_, i) => ({ id: 'f' + i, name: 'F' + i, field: '财务管理', deptId: null, role: '待分配', skill: 60 }));
  autoAssignByField(s2);
  check('财务分流到财务部与人事部', s2.employees.some((e) => e.deptId === 'fin') && s2.employees.some((e) => e.deptId === 'hr'));
}

// 5. 自研设计槽位：升级中也能设计，槽位随等级增长
{
  const s = createGame({ mode: 'sandbox', year: 2020, companyName: '自研槽位', cash: 5e9 });
  buildDivision(s, 'chip');
  const div = s.divisions.chip;
  check('Lv1 设计槽位 = 1', designSlots(div) === 1);
  startUpgrade(s, 'chip', null);
  check('部门已进入升级中', !!div.proj);
  const form = { name: 'A', bigArch: 'a78', bigN: 2, littleN: 0, bigGhz: 2.4, gpuArch: 'mali_g78', gpuCores: 8 };
  const r1 = designProduct(s, 'chip', form);
  check('升级进行中仍可单独设计新产品', r1.ok === true, r1.msg);
  check('产品进入设计池', (div.products || []).some((p) => p.status === 'designing'));
  const r2 = designProduct(s, 'chip', { ...form, name: 'B' });
  check('Lv1 槽位满时拒绝第二款', r2.ok === false && r2.msg.includes('槽位'), r2.msg);
  div.level = 3;
  check('Lv3 设计槽位 = 3', designSlots(div) === 3);
  const r3 = designProduct(s, 'chip', { ...form, name: 'C' });
  check('升级后槽位放开', r3.ok === true, r3.msg);
}

console.log(`\n${bad ? `FAILED: ${bad} 项` : 'ALL PASS'}`);
process.exit(bad ? 1 : 0);