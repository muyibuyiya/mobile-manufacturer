// 第 33 轮核心逻辑单测：收购支付方式 / 敌意收购 / 猎头 / 子品牌 / OS / 竞品库存
import {
  createGame,
} from '../js/core/state.js';
import {
  openNegotiation, negotiateOffer, setPayMode, charmTarget, ensureSubsidiaries,
  subRelease, subsidiaryTechShare, foundSubsidiary,
} from '../js/core/capital.js';
import { poachFromRival, tick } from '../js/core/sim.js';
import { ensureDivisions } from '../js/core/divisions.js';

let bad = 0;
const check = (name, ok, detail = '') => {
  if (!ok) bad += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const sandbox = (cash = 2e10) => {
  const s = createGame({ mode: 'sandbox', year: 2020, companyName: '测试科技', cash, difficulty: 'normal' });
  s.company.cash = cash;
  s.company.brand = 60;
  return s;
};

// 1) 分期收购
{
  const s = sandbox();
  const comp = s.competitors[0];
  const r = openNegotiation(s, comp.id);
  check('谈判初始化（含防御等级）', r.ok && Number.isFinite(s.negotiation.defense));
  const d0 = s.negotiation.defense;
  const m0 = s.negotiation.mood;
  const c = charmTarget(s);
  check('公关游说降低防御/提升情绪', c.ok && s.negotiation.defense < d0 && s.negotiation.mood > m0);
  const pm = setPayMode(s, 'installment');
  check('切换分期付款', pm.ok && s.negotiation.payMode === 'installment');
  const res = negotiateOffer(s, 'accept');
  check('分期收购成交', res.ok && res.status === 'done', res.msg || '');
  const sub = ensureSubsidiaries(s).find((x) => x.id === comp.id);
  check('分期条款落库', !!sub && sub.payMode === 'installment' && sub.payment?.monthsLeft === 12);
  const paid0 = sub?.payment?.paid || 0;
  tick(s);
  check('分期月供扣款', !sub.payment || sub.payment.paid > paid0);
}

// 2) 换股收购
{
  const s = sandbox();
  const comp = s.competitors[0];
  const holders0 = s.capital.holders.length;
  const cash0 = s.company.cash;
  openNegotiation(s, comp.id);
  setPayMode(s, 'equity');
  const res = negotiateOffer(s, 'accept');
  check('换股收购成交', res.ok && res.status === 'done', res.msg || '');
  check('换股稀释股东', s.capital.holders.length === holders0 + 1
    && s.capital.holders.some((h) => h.name.includes('原股东')));
  check('换股不扣现金', Math.abs(s.company.cash - cash0) < 1);
}

// 3) 敌意收购入口
{
  const s = sandbox();
  const r = openNegotiation(s, s.competitors[0].id, { hostile: true });
  check('敌意收购开启（品牌 ≥ 55）', r.ok && s.negotiation.hostile && s.negotiation.ask > 0, r.msg || '');
  const lowBrand = sandbox();
  lowBrand.company.brand = 30;
  const r2 = openNegotiation(lowBrand, lowBrand.competitors[0].id, { hostile: true });
  check('品牌不足时拒绝敌意收购', !r2.ok);
}

// 4) 猎头挖角（随机成功，最多重试 40 次）
{
  const s = sandbox();
  const emp0 = s.employees.length;
  const compId = s.competitors[0].id;
  let got = null;
  for (let i = 0; i < 40 && !got; i++) {
    s.company.cash = 2e10;
    const r = poachFromRival(s, compId);
    if (r.ok) got = r;
  }
  check('猎头挖角成功入职', !!got && s.employees.length === emp0 + 1, got?.msg || '');
}

// 5) 子品牌与技术共享
{
  const s = sandbox();
  const f = foundSubsidiary(s, '星尘', 'Stardust', 'online');
  check('成立子品牌', f.ok, f.msg || '');
  ensureDivisions(s);
  s.divisions.chip.level = 3;
  const sub = ensureSubsidiaries(s).find((x) => x.id === f.id);
  const share = subsidiaryTechShare(s, sub);
  check('技术共享按部门等级计算', share === 0.06, String(share));
  const rel = subRelease(s, f.id);
  check('子品牌手动发新品', rel.ok && sub.lineup.length === 1 && sub.lineup[0].price > 0, rel.msg || '');
}

// 6) OS 授权/商店字段与竞品库存
{
  const s = sandbox();
  ensureDivisions(s);
  check('OS 授权厂商/商店分成字段', Array.isArray(s.osPop.licensees) && Number.isFinite(Number(s.osPop.storeRevenue)));
  tick(s);
  check('竞品产能与库存有效', s.competitors.every((c) => Number.isFinite(c.inventory) && c.inventory >= 0 && c.capacity > 0));
  check('竞品联盟结构为数组', Array.isArray(s.rivalAlliances));
}

console.log(`\n${bad ? `FAILED: ${bad} 项` : 'ALL PASS'}`);
process.exit(bad ? 1 : 0);