// 第 34 轮核心单测：历史降采样 / 自动存档防抖 / 竞品招牌 / 收购整合期 / 发布状态
import { createGame } from '../js/core/state.js';
import { newModel } from '../js/core/design.js';
import { tick, avgShare } from '../js/core/sim.js';
import { compactAll, historyRows, historyTotals, compHistoryRows, modelHistoryRows } from '../js/core/history.js';
import { queueAutoSave, flushAutoSave } from '../js/core/state.js';
import { RIVAL_SIGNATURES, RIVAL_SIGNATURE_MAP, COMPETITORS, signatureOf } from '../js/data/world.js';
import { openNegotiation, negotiateOffer, ensureSubsidiaries } from '../js/core/capital.js';

let bad = 0;
const check = (name, ok, detail = '') => {
  if (!ok) bad += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const sandbox = (cash = 2e10) => {
  const s = createGame({ mode: 'sandbox', year: 2020, companyName: '历史测试', cash });
  s.company.cash = cash;
  s.company.brand = 60;
  return s;
};

// 1. 历史降采样：30 个月后明细 12、季度归档存在、展开仍 24 个月
{
  const s = sandbox();
  const m = newModel(2020, s.tech.unlocked, 'Hist 1');
  m.status = 'production';
  m.released = true;
  m.markets = ['cn'];
  m.price.cn = 2000;
  m.productionTarget = 20000;
  s.models.push(m);
  for (let i = 0; i < 30; i++) tick(s);
  check('经营历史明细压缩到 12 月', s.history.length === 12, `len=${s.history.length}`);
  check('经营历史生成季度归档', (s.historyArchive || []).length > 0, `q=${s.historyArchive?.length || 0}`);
  check('历史可展开 24 个月', historyRows(s, 24).length === 24);
  check('归档营收计入累计', historyTotals(s).revenue >= s.history.reduce((a, h) => a + h.revenue, 0));
  check('竞品历史压缩到 12 月', s.compHistory.length === 12, `len=${s.compHistory.length}`);
  check('竞品历史可展开 12 月', compHistoryRows(s, 12).length === 12);
  check('机型历史压缩到 12 月', m.history.length === 12, `len=${m.history.length}`);
  check('机型历史可展开 12 月', modelHistoryRows(m, 12).length === 12);
}

// 2. 40 年存档体积阈值（旧版约 648KB）
{
  const s = sandbox(3e8);
  const m = newModel(1980, s.tech.unlocked, 'Long 1');
  m.status = 'production';
  m.markets = ['cn'];
  m.price.cn = 2000;
  m.productionTarget = 20000;
  s.models.push(m);
  // 用 1980 开局更接近真实长跑
  const s2 = createGame({ mode: 'career', year: 1980, companyName: '长跑', cash: 3e8 });
  const m2 = newModel(1980, s2.tech.unlocked, 'Long 2');
  m2.status = 'production';
  m2.markets = ['cn'];
  m2.price.cn = 2000;
  m2.productionTarget = 20000;
  s2.models.push(m2);
  for (let i = 0; i < 480; i++) tick(s2);
  const kb = JSON.stringify(s2).length / 1024;
  check('40 年存档 < 500KB', kb < 500, `${kb.toFixed(0)}KB`);
  check('40 年明细仍为 12 月', s2.history.length === 12);
  check('40 年归档不超过 160 季度', (s2.historyArchive || []).length <= 160, `${s2.historyArchive?.length || 0}`);
}

// 3. 自动存档 debounce + flush
{
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const s = sandbox();
  queueAutoSave(s);
  check('debounce 未立即写盘', !store.mobile_manufacturer_save_v5_auto);
  const flushed = flushAutoSave();
  check('flush 写入自动槽', flushed && !!store.mobile_manufacturer_save_v5_auto);
  delete globalThis.localStorage;
}

// 4. 竞品招牌能力覆盖 16 家
{
  const missingMap = COMPETITORS.filter((c) => !RIVAL_SIGNATURE_MAP[c.id]);
  check('16 家竞品都有招牌映射', missingMap.length === 0, missingMap.map((c) => c.id).join(','));
  const badDef = COMPETITORS.filter((c) => {
    const sig = signatureOf(c);
    return !sig || !sig.name || !Number.isFinite(sig.reach) || !Number.isFinite(sig.priceCut);
  });
  check('招牌定义字段完整', badDef.length === 0, badDef.map((c) => c.id).join(','));
  const unique = new Set(COMPETITORS.map((c) => RIVAL_SIGNATURE_MAP[c.id]));
  check('招牌类型全部在定义表内', [...unique].every((id) => RIVAL_SIGNATURES[id]));
}

// 5. 收购整合期
{
  const s = sandbox();
  const comp = s.competitors[0];
  openNegotiation(s, comp.id);
  const res = negotiateOffer(s, 'accept');
  const sub = ensureSubsidiaries(s).find((x) => x.id === comp.id);
  check('收购后进入整合期', res.ok && !!sub.integration && sub.integration.months === 6, `months=${sub?.integration?.months}`);
  const m0 = sub.integration.months;
  tick(s);
  check('整合期按月递减', !sub.integration || sub.integration.months < m0, `now=${sub.integration?.months ?? 0}`);
}

// 6. 发布状态：沙盒现成机型未发布；老档已上市机型视为已发布
{
  const s = sandbox();
  check('沙盒机型默认未发布', s.models[0].released === false);
  const m = s.models[0];
  m.productionTarget = 20000;
  m.inventory = 30000;
  m.price.cn = 2000;
  m.markets = ['cn'];
  tick(s);
  check('未发布不产生销量', (m.sold || 0) === 0, `sold=${m.sold}`);
  m.released = true;
  tick(s);
  check('发布后开始销售', (m.sold || 0) > 0, `sold=${Math.round(m.sold || 0)}`);
  const legacy = sandbox();
  legacy.models[0].launched = { year: 2020, month: 1 };
  legacy.models[0].released = undefined;
  const { sanitizeState } = await import('../js/core/state.js');
  sanitizeState(legacy);
  check('老档已上市机型迁移为已发布', legacy.models[0].released === true);
}

console.log(`\n${bad ? `FAILED: ${bad} 项` : 'ALL PASS'}`);
process.exit(bad ? 1 : 0);