// 全年代回归：1980 / 1990 / 2000 / 2010 / 2020 / 2035 各跑 5 年
// 重点不是数值好看，而是任何年代都不出 NaN、不抛异常、公司还能正常结算
import { createGame } from '../js/core/state.js';
import { tick, capacityOf, suggestedPrice } from '../js/core/sim.js';
import { newModel, validate } from '../js/core/design.js';
import { fmtMoney } from '../js/core/util.js';

const ERAS = [1980, 1990, 2000, 2010, 2020, 2035];
const bad = [];

for (const year of ERAS) {
  const s = createGame({ mode: 'career', year, companyName: `测试${year}`, countryId: 'cn', difficulty: 'normal' });
  const m = newModel(year, s.tech.unlocked, `${year} 主力机`);
  const v = validate(m.design, year);
  if (!v.ok) { bad.push(`${year} 默认设计不合法：${v.issues.map((i) => i.text).join('/')}`); continue; }
  m.status = 'production';
  m.released = true;
  m.markets = ['cn', 'sea'];
  m.price = { cn: suggestedPrice(s, m, 'cn'), sea: Math.round(suggestedPrice(s, m, 'sea') * 0.92) };
  m.productionTarget = Math.min(20000, Math.max(500, capacityOf(s)));
  m.quality = 70;
  s.models.push(m);

  const researchable = s.tech.unlocked.length;
  let last = null;
  for (let i = 0; i < 60; i++) {
    try { last = tick(s); } catch (e) { bad.push(`${year} 第 ${i + 1} 月抛异常：${e.message}`); break; }
    const nums = [s.company.cash, s.company.brand, s.company.reputation, last.revenue, last.net, last.units, last.share];
    if (nums.some((n) => !Number.isFinite(n))) { bad.push(`${year} 第 ${i + 1} 月出现 NaN/Infinity`); break; }
    if (s.company.cash < -1e12) { bad.push(`${year} 第 ${i + 1} 月现金失控`); break; }
  }
  const h = s.history[s.history.length - 1] || {};
  console.log(
    `${year} 开局 | 解锁科技 ${researchable} | 5 年后 现金 ${fmtMoney(s.company.cash)}`,
    `品牌 ${s.company.brand.toFixed(1)} | 份额 ${((h.share || 0) * 100).toFixed(2)}% | 员工 ${s.employees.length}`,
  );
  // 结算链路是否都产生过真实数据
  if (!s.history.length) bad.push(`${year} 五年没有产生任何月度历史`);
  if (!s.models[0].review) bad.push(`${year} 在售机型没有生成评价`);
}

console.log(bad.length ? `FAIL\n${bad.join('\n')}` : '全年代 PASS');
if (bad.length) process.exitCode = 1;
