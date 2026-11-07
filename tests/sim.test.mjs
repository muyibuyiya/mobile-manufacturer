// 无界面逻辑自测：跑 5 年模拟，检查财务、销量、研发、竞品是否在合理区间
import { createGame } from '../js/core/state.js';
import { tick, startResearch, unitCost, capacityOf } from '../js/core/sim.js';
import { supplyHealth, stockCoverage } from '../js/core/supply.js';
import { newModel, derive, validate } from '../js/core/design.js';
import { fmtMoney } from '../js/core/util.js';

const s = createGame({ mode: 'career', year: 2010, companyName: '测试科技', countryId: 'cn', difficulty: 'normal' });
console.log('初始员工', s.employees.length, '现金', fmtMoney(s.company.cash));

const m = newModel(2010, s.tech.unlocked, 'T1');
const v = validate(m.design, 2010);
console.log('设计校验', v.ok, v.issues.map(i => i.text));
m.status = 'production';
m.released = true;
m.markets = ['cn', 'in', 'sea'];
m.price = { cn: 1999, in: 1599, sea: 1699 };
m.productionTarget = 20000;
m.quality = 72;
s.models.push(m);
console.log('单机成本', unitCost(s, m), '月产能', capacityOf(s));

startResearch(s, 'dualcore');

for (let i = 0; i < 60; i++) {
  const r = tick(s);
  if (i % 12 === 11) {
    console.log(`${r.date.year}/${r.date.month + 1} 收入 ${fmtMoney(r.revenue)} 净利 ${fmtMoney(r.net)} 现金 ${fmtMoney(s.company.cash)} 销量 ${r.units} 份额 ${(r.share * 100).toFixed(2)}% 品牌 ${s.company.brand.toFixed(1)} 员工 ${s.employees.length}`);
  }
}
console.log('已完成科技', s.tech.completed.map(t => t.id));
console.log('竞品机型数', s.competitors.map(c => c.lineup.length).join(','));
console.log('现金', fmtMoney(s.company.cash), '债务', fmtMoney(s.company.debt), '估值', fmtMoney(s.company.valuation));

// 供应链健康度：排产为 0 时需求也是 0，不能拿 1 台当分母把它判成「库存充足」
const idle = { ...m, productionTarget: 0 };
const hIdle = supplyHealth(s, idle);
const hRun = supplyHealth(s, m);
const cover = stockCoverage(s, m);
console.log('未排产健康度', hIdle.label, '| 在产健康度', hRun.label, '| 覆盖', cover.units, '瓶颈', cover.bottleneck);
const checks = [
  ['未排产不误报充足', hIdle.label === '尚未排产'],
  ['在产给出覆盖率', hRun.tone !== '' && Number.isFinite(hRun.ratio)],
  ['覆盖为有限数值', Number.isFinite(cover.units) && cover.units >= 0],
];
let bad = 0;
for (const [name, ok] of checks) {
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}
console.log(bad === 0 ? '断言全部通过' : `断言失败 ${bad} 项`);
if (bad) process.exitCode = 1;
