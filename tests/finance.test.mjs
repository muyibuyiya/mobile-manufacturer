// 财务三表与工艺路线 / 自研设备的基础回归
import { createGame } from '../js/core/state.js';
import { financeSnapshot, cashFlowSnapshot, assetRows } from '../js/core/finance.js';
import { setRoute, buyEquipment, equipmentUpgradeCost, routeOf, equipmentLevel } from '../js/core/production.js';

let bad = 0;
const check = (name, ok, detail = '') => {
  if (!ok) bad += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const s = createGame({ mode: 'sandbox', year: 2020, companyName: '财务测试', cash: 1e9 });

// 1. 资产负债表勾稽
const f = financeSnapshot(s);
check('总资产 = 流动 + 非流动', Math.abs(f.totalAssets - (f.currentAssets + f.nonCurrent)) < 1,
  `${f.totalAssets} vs ${f.currentAssets + f.nonCurrent}`);
check('所有者权益 = 资产 − 负债', Math.abs(f.equity - (f.totalAssets - f.debt)) < 1);
check('固定资产含楼宇（A 地块免费，土地可为 0）', f.buildings > 0, `land=${f.land} build=${f.buildings}`);
const rows = assetRows(s);
check('资产明细分组齐全', rows.current.length === 2 && rows.fixed.length === 2 && rows.intangible.length === 1);

// 2. 现金流量表
const c = cashFlowSnapshot(s);
check('现金流期初/期末为数值', Number.isFinite(c.startCash) && Number.isFinite(c.endCash));
check('经营现金流 = 净利润 + 折旧', Math.abs(c.op - (c.netSum + c.depreciation)) < 1);
check('现金净变动可核对', Math.abs(c.delta - (c.endCash - c.startCash)) < 1);

// 3. 工艺路线
const r0 = routeOf(s);
check('默认工艺路线为均衡', r0.id === 'balanced');
const r1 = setRoute(s, 'quality');
check('切换到品质优先', r1.ok === true && routeOf(s).id === 'quality' && routeOf(s).costMul > 1);
const bad1 = setRoute(s, 'nope');
check('未知路线被拒绝', bad1.ok === false);

// 4. 自研设备
const cash0 = s.company.cash;
const cost = equipmentUpgradeCost(s);
const e1 = buyEquipment(s);
check('自研设备可升级', e1.ok === true && equipmentLevel(s) === 1, e1.msg);
check('设备投资扣款正确', Math.abs((cash0 - s.company.cash) - cost) < 1, `${cash0 - s.company.cash} vs ${cost}`);
s.company.cash = 1e9;
buyEquipment(s); buyEquipment(s);
check('设备上限 3 级', equipmentLevel(s) === 3);
const e4 = buyEquipment(s);
check('满级后拒绝继续升级', e4.ok === false);

console.log(bad ? `\nFAILED: ${bad} 项` : '\n财务与工艺规则全部通过');
process.exit(bad ? 1 : 0);