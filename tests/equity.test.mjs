// 股权投资回归：买入上限、溢价、折扣阶梯、收购折价、分红、锁定期
import { createGame } from '../js/core/state.js';
import { buyStake, sellStake, stakePct, stakeDiscount, stakePremium, acquisitionStakeDiscount, stakeDividends, holdingsSummary, ensureEquity } from '../js/core/equity.js';
import { SUPPLIER_MAP } from '../js/data/suppliers.js';
import { supplyCostMul } from '../js/core/supply.js';

let bad = 0;
const check = (name, ok, detail = '') => {
  if (!ok) bad += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const s = createGame({ mode: 'sandbox', year: 2020, companyName: '持股测试', cash: 5e9 });

// 1. 折扣阶梯
check('折扣阶梯 5/15/30', stakeDiscount(4) === 0 && stakeDiscount(5) === 0.02 && stakeDiscount(15) === 0.05 && stakeDiscount(30) === 0.08);
check('买入溢价随持股上升', stakePremium(10) === 0 && Math.abs(stakePremium(15) - 0.05) < 1e-9 && Math.abs(stakePremium(25) - 0.15) < 1e-9);

// 2. 供应商入股 → 采购折扣
const sup = Object.values(SUPPLIER_MAP).find((x) => x.cat === 'chip');
const m0 = supplyCostMul(s);
const r1 = buyStake(s, sup.id, 'supplier', 15);
check('供应商可入股 15%', r1.ok === true && stakePct(s, sup.id) === 15, r1.msg);
check('入股后采购系数下降', supplyCostMul(s) < m0, `${m0.toFixed(4)} -> ${supplyCostMul(s).toFixed(4)}`);

// 3. 上限
const up = buyStake(s, sup.id, 'supplier', 80);
check('供应商持股上限 49%', stakePct(s, sup.id) <= 49, `${stakePct(s, sup.id)}%`);

// 4. 竞品入股 → 收购折价
const comp = s.competitors[0];
check('初始收购无折价', acquisitionStakeDiscount(s, comp.id) === 1);
buyStake(s, comp.id, 'rival', 30);
check('30% 持股 → 收购 -15%', acquisitionStakeDiscount(s, comp.id) === 0.85);
check('竞品持股上限 30%', stakePct(s, comp.id) === 30);

// 5. 锁定期
const sell1 = sellStake(s, comp.id, 25);
check('12 个月内不能卖出', sell1.ok === false);
s.date.year += 2;
const sell2 = sellStake(s, comp.id, 25);
check('满 12 个月可卖出', sell2.ok === true && stakePct(s, comp.id) === 25, sell2.msg);

// 6. 分红与汇总
const div = stakeDividends(s);
check('季度分红为数值', Number.isFinite(div) && div >= 0, `${div}`);
const list = holdingsSummary(s);
check('持股汇总含名称与估值', list.length > 0 && list.every((h) => h.name && h.value >= 0));

// 7. 存档字段兜底
const bare = { date: { year: 2020, month: 0 } };
const e = ensureEquity(bare);
check('空状态自动补 equity 结构', Array.isArray(e.holdings) && e.issued && e.issued.pct === 0);

console.log(bad ? `\nFAILED: ${bad} 项` : '\n股权投资规则全部通过');
process.exit(bad ? 1 : 0);