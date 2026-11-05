// 十年长跑：验证长期结算稳定（无 NaN）、技术推进、里程碑与竞品演化
import { createGame } from '../js/core/state.js';
import { tick, startResearch } from '../js/core/sim.js';
import { newModel } from '../js/core/design.js';
import { TECHS, techState } from '../js/data/tech.js';
import { fmtMoney } from '../js/core/util.js';

const s = createGame({ mode: 'career', year: 2010, companyName: '长跑科技', countryId: 'cn' });
const m = newModel(2010, s.tech.unlocked, 'M1');
m.status = 'production';
m.markets = ['cn', 'in', 'sea'];
m.price = { cn: 1999, in: 1599, sea: 1699 };
m.productionTarget = 20000;
m.quality = 70;
s.models.push(m);

let nan = 0;
for (let i = 0; i < 120; i++) {
  if (!s.tech.researching) {
    const ready = TECHS.filter((t) => techState(t, s.date.year, s.tech.unlocked, null) === 'ready');
    if (ready.length) startResearch(s, ready[0].id);
  }
  const rep = tick(s);
  if (!Number.isFinite(rep.net) || !Number.isFinite(s.company.cash)) {
    nan++;
    console.log('NaN @', rep.date);
    break;
  }
  if (i % 24 === 23) {
    console.log(`${s.date.year}/${s.date.month + 1} 现金 ${fmtMoney(s.company.cash)} 份额 ${(rep.share * 100).toFixed(2)}% 品牌 ${s.company.brand.toFixed(0)} 技术 ${s.tech.completed.length} 员工 ${s.employees.length} 月销 ${rep.units}`);
  }
}
console.log('里程碑达成', Object.keys(s.milestones || {}).join(',') || '无');
console.log('竞品在售机型', s.competitors.map((c) => c.lineup.length).join(','));
console.log('NaN 次数', nan);
if (nan) process.exit(1);
