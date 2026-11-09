// 月度模拟核心
import { clamp, rand, randInt, pick, chance, fmtMoney, fmtNum, fmtUnit, sum } from './util.js';
import { MARKETS, MARKET_MAP, eraFactor, EVENTS, COUNTRIES, expectedPrice, makeCompetitorPhone, LINEUP_MAP, COMPETITORS } from '../data/world.js';
import { derive, validate, eraBaseline, eraRel } from './design.js';
import { TECHS, TECH_MAP } from '../data/tech.js';
import { addLog, staffPower, deptById, DIFFICULTY, makeCompetitors, generateEmployee } from './state.js';
import { checkMilestones } from './milestones.js';
import { campusBonus, stepConstruction, buildingCount } from './campus.js';
import { stepSupply, consumeComponents, stockCoverage, SPOT_PREMIUM, supplyCostMul, addDisruption } from './supply.js';
import { pickDisruptableSupplier, SUPPLIER_MAP } from '../data/suppliers.js';
import { stepTraining } from './staff.js';
import { stepPolicies, policyMul, policyAdd, ensurePolicies, triggerPolicy } from './policy.js';
import { stepDivisions } from './divisions.js';
import { overseasUpkeep, ensureOverseas } from './overseas.js';
import { stepMarketing, channelTotal, ensureMarketing, stepChannels, channelSalesMul } from './marketing.js';
import { stepStores, storeSalesMul } from './stores.js';
import { stepCampaigns } from './campaigns.js';
import { warrantyCost, warrantyRatingAdd, returnsCutOf, ensureWarranty } from './aftermarket.js';
import { stepSubsidiaries, ensureSubsidiaries } from './capital.js';
import { marketShare as layeredShare, utilityFor, marketPotential, salesScores } from './market.js';
import { stepReviews, wordOfMouth } from './reviews.js';
import { fRnd, fProdCost, fProdQuality, fSupply, fBrand, fReach, fInterest, fMorale, fDesign } from './org.js';
import { stepCapital } from './capital.js';
import {
  processCapMul, processCostMul, processQualityBonus, automationUpkeep, automationLaborCut, ensureProduction,
} from './production.js';
import { compactAll } from './history.js';

export function activeMul(state, key) {
  let mul = 1;
  for (const e of state.events) {
    if (e[key]) mul *= e[key];
  }
  return mul;
}

// 兼容旧入口：不带人群的效用 / 带人群分层的市场份额
export function utility(scores, price, brand, prefs, year, wealth) {
  return utilityFor(scores, price, brand, prefs, year, wealth, null);
}

export function marketShare(state, marketId) {
  return layeredShare(state, marketId, { suggestedPrice });
}


export function suggestedPrice(state, model, marketId = 'cn') {
  const m = MARKET_MAP[marketId];
  const year = state.date.year;
  const d = derive(model.design, year);
  const base = eraBaseline(year);
  // 产品力按「同代倍率」衡量：1.0 = 与这个年代的主流机持平，正好卖市场期望价。
  // 用绝对分（q/100）会在 1980 年把任何手机判成低端、在 2020 年判成高端，价格全线失准。
  const packRel = (eraRel(d.perf, base.perf) + eraRel(d.camera, base.camera)
    + eraRel(d.battery, base.battery) + eraRel(d.designScore, base.designScore)) / 4;
  const exp = expectedPrice(year) * (0.55 + m.wealth * 0.9);
  // 产品线自带的定位系数：旗舰天然贵，青春天然便宜
  const tier = (LINEUP_MAP[model.lineup] || LINEUP_MAP.main).priceTier;
  return Math.round(exp * clamp(Math.pow(packRel, 0.85), 0.6, 1.9) * (0.55 + tier * 0.45) / 10) * 10;
}

// ---------- 研发 ----------
export function startResearch(state, techId) {
  const t = TECH_MAP[techId];
  if (!t) return { ok: false, msg: '技术不存在' };
  if (state.tech.unlocked.includes(techId)) return { ok: false, msg: '已掌握该技术' };
  if (state.date.year < t.year) return { ok: false, msg: `${t.year} 年才会出现这项技术` };
  if (!t.prereq.every((p) => state.tech.unlocked.includes(p))) return { ok: false, msg: '前置技术未完成' };
  if (state.tech.researching) return { ok: false, msg: '已有进行中的研发项目' };
  state.tech.researching = { techId, progress: 0, spent: 0, startYear: state.date.year, startMonth: state.date.month };
  addLog(state, 'tech', `启动研发：${t.name}（预算 ${fmtMoney(researchBudget(state))}/月）`);
  return { ok: true };
}

export function researchBudget(state) {
  const r = state.tech.researching;
  if (!r) return 0;
  const t = TECH_MAP[r.techId];
  return Math.round(t.cost / 24);
}

// ---------- 生产 ----------
export const FOUNDRIES = [
  { id: 'f1', name: '城南电子代工厂', capacity: 30000, fee: 16, quality: 52, minBatch: 1000, desc: '起步阶段的小厂，灵活但良率一般。' },
  { id: 'f2', name: '三角洲精密制造', capacity: 150000, fee: 12, quality: 66, minBatch: 5000, desc: '成熟的中型代工，交期稳定。' },
  { id: 'f3', name: '环宇智造', capacity: 600000, fee: 9.5, quality: 78, minBatch: 20000, desc: '全球一线代工，成本与品质兼顾。' },
];

export function factoryCapacity(state) {
  return Math.round(campusBonus(state, 'capacity'));
}

export function ownFactoryCount(state) {
  return buildingCount(state, 'factory');
}

// 物料成本（不含装配）：供应链人力、专注度、物流中心、事件共同决定
export function bomUnit(state, model) {
  const d = derive(model.design, state.date.year);
  const supplyPower = staffPower(state, 'supply');
  const supplyCut = clamp(supplyPower * 0.012, 0, 0.14);
  const logisticsCut = clamp(campusBonus(state, 'channelCut') * 0.5, 0, 0.06);
  // 供应商选择带来的采购价浮动（便宜的供应商 priceMul < 1）
  const supplierMul = supplyCostMul(state);
  return d.cost * (1 - supplyCut) * activeMul(state, 'costMul') * policyMul(state, 'costMul') * (1 - logisticsCut) * supplierMul / fSupply(state);
}

// 装配/加工费：生产部的专注度在"成本"与"品质"之间做取舍
export function assemblyUnit(state) {
  const costMul = fProdCost(state);
  if (state.production.mode === 'own' && factoryCapacity(state) > 0) {
    const base = (7 + state.production.quality * 0.05) * (1 - clamp(staffPower(state, 'prod') * 0.01, 0, 0.18));
    // 装配工艺越高，单位加工费越低
    return base * costMul * processCostMul(state);
  }
  const f = FOUNDRIES.find((x) => x.id === state.production.foundryId) || FOUNDRIES[0];
  return f.fee * costMul;
}

// 计划成本：排产中能由库存覆盖的部分按标准成本，缺口按现货溢价
export function unitCost(state, model) {
  const base = bomUnit(state, model);
  const asm = assemblyUnit(state);
  const target = Math.max(0, Math.round(model.productionTarget || 0));
  if (target <= 0) return Math.round(base + asm);
  const cover = Math.min(target, stockCoverage(state, model).units);
  const spot = Math.max(0, target - cover);
  const total = base * cover + base * (1 + SPOT_PREMIUM) * spot + asm * target;
  return Math.round(total / target);
}

export function capacityOf(state) {
  ensureProduction(state);
  if (state.production.mode === 'own') {
    const base = factoryCapacity(state) * (0.6 + clamp(staffPower(state, 'prod') * 0.03, 0, 0.55));
    return Math.round(base * processCapMul(state));
  }
  const f = FOUNDRIES.find((x) => x.id === state.production.foundryId) || FOUNDRIES[0];
  return f.capacity;
}

// ---------- 主循环 ----------
export function tick(state) {
  const report = {
    date: { ...state.date }, revenue: 0, cogs: 0, salaries: 0, rent: 0, marketing: 0,
    rnd: 0, interest: 0, tax: 0, net: 0, units: 0, training: 0, spotUnits: 0, spotCost: 0,
    channel: 0, warranty: 0, refunds: 0, returns: 0, avgUserScore: null, byModel: [], byMarket: [], share: 0,
    upkeep: 0, autoSave: 0, brand: state.company.brand, notes: [],
  };
  const year = state.date.year;
  const country = COUNTRIES.find((c) => c.id === state.company.country) || COUNTRIES[0];
  const diff = DIFFICULTY[state.company.difficulty] || DIFFICULTY.normal;

  // 0. 元器件到货
  stepSupply(state, report);

  // 1. 研发
  stepResearch(state, report);

  // 2. 生产
  stepProduction(state, report);

  // 3. 销售
  stepSales(state, report);

  // 3.2 产品评价：故障率 / 退货率 / 用户与媒体评分
  stepReviews(state, report);

  // 3.5 培训扣费（必须在财务汇总前完成）
  stepTraining(state, report);

  // 4. 财务固定项
  const automationSave = sum(state.employees.filter((e) => e.deptId === 'prod'), (e) => e.salary)
    * diff.salary * automationLaborCut(state);
  const salaries = (sum(state.employees, (e) => e.salary) * diff.salary - automationSave) * policyMul(state, 'salaryMul');
  const overseasCost = overseasUpkeep(state);
  const upkeep = automationUpkeep(state);
  // 自研部门：维护费 + 对外供货收入（供货直接进现金流）
  const divRes = stepDivisions(state);
  const divUpkeep = divRes.upkeep;
  const divSupply = divRes.supply;
  const rent = state.offices.reduce((s, o) => s + o.rent, 0) + headcount(state) * 260 * country.labor * (0.5 + year / 2600);
  // 营销费 = 各媒体渠道投放之和（渠道细分版）
  const marketing = channelTotal(state);
  // 门店维护费与区域营销活动（v1.9.0）
  stepStores(state, report);
  const campRes = stepCampaigns(state, report);
  // 子公司利润上缴
  stepChannels(state, report);
  const subIncome = stepSubsidiaries(state, report);
  const rnd = report.rnd;
  // 财务部专注度与 CFO 席位影响融资成本
  const interest = state.company.debt * 0.075 * fInterest(state) / 12;
  // 渠道分成、售后与物流：真实手机生意的隐性成本
  const channelCut = clamp(campusBonus(state, 'channelCut'), 0, 0.12);
  const channel = report.revenue * clamp(0.17 - channelCut + (100 - clamp(staffPower(state, 'sales') * 6, 0, 20)) / 900, 0.06, 0.4);
  // 保修政策决定售后费率：政策越慷慨费率越高
  const warranty = warrantyCost(state, report);
  const training = report.training || 0;
  const refunds = report.refunds || 0;
  report.salaries = Math.round(salaries);
  report.overseas = Math.round(overseasCost);
  report.rent = Math.round(rent);
  report.marketing = Math.round(marketing + (report.campaignSpend || 0));
  report.interest = Math.round(interest);
  report.channel = Math.round(channel);
  report.warranty = Math.round(warranty);
  report.training = Math.round(training);
  report.refunds = Math.round(refunds);
  report.upkeep = Math.round(upkeep + divUpkeep);
  report.divSupply = divSupply;
  report.autoSave = Math.round(automationSave);
  report.cogs = Math.round(report.cogs);

  const ebit = report.revenue + divSupply + subIncome - report.cogs - report.salaries - report.rent - report.marketing
    - report.rnd - report.interest - report.channel - report.warranty - report.training - refunds - report.upkeep - report.overseas - report.stores;
  report.tax = ebit > 0 ? Math.round(ebit * clamp(country.tax + policyAdd(state, 'taxAdd'), 0, 0.45)) : 0;
  report.ebit = Math.round(ebit);
  report.net = Math.round(ebit - report.tax);
  // 生产成本已在投产时扣除，现金流不再重复扣 COGS
  const cashNet = report.revenue + divSupply + subIncome - report.salaries - report.rent - report.marketing
    - report.rnd - report.interest - report.channel - report.warranty - report.tax - report.training - refunds
    - report.upkeep - report.overseas - report.stores;
  state.company.cash += cashNet;
  report.cashNet = Math.round(cashNet);
  report.subIncome = subIncome;
  report.cogs = Math.round(report.cogs);
  state.company.valuation = Math.round(state.company.cash - state.company.debt + state.company.brand * 2e6);

  // 5. 品牌 / 口碑（媒体渠道细分投放）
  const mktRes = stepMarketing(state, report);
  stepBrand(state, report, mktRes.brandGain + (campRes.brandGain || 0));
  if (mktRes.awareGain > 0 || campRes.awareGain > 0) {
    for (const m of state.markets) m.awareness = clamp(m.awareness + (mktRes.awareGain * 0.12) + (campRes.awareGain * 0.08), 0, 100);
  }

  // 6. 员工
  stepEmployees(state, report);

  // 6.2 园区施工
  stepConstruction(state, report);

  // 6.5 里程碑
  for (const ms of checkMilestones(state, state.date)) {
    report.notes.push(`达成里程碑：${ms.name}`);
    addLog(state, 'good', `达成里程碑「${ms.name}」——${ms.desc}`);
  }

  // 7. 竞品 AI
  stepCompetitors(state, report);

  // 8. 随机事件推进
  stepEvents(state, report);
  // 8.5 政策推进（宏观数月级环境）
  stepPolicies(state, report);
  // 8.2 资本市场：上市后的股价波动
  stepCapital(state, report);
  if (state.hype && state.hype.months > 0) {
    state.hype.months -= 1;
    if (state.hype.months === 0) state.hype = null;
  }

  // 9. 破产检查
  if (state.company.cash < -state.company.debt * 0.5 - 5e6) {
    report.bankrupt = true;
    addLog(state, 'bad', '现金流断裂，公司进入破产程序。');
  } else if (state.company.cash < 0) {
    // 自动短期贷款
    const need = Math.abs(state.company.cash) * 1.2;
    state.company.debt += need;
    state.company.cash += need;
    report.notes.push(`现金不足，自动借款 ${fmtMoney(need)}，请注意偿还。`);
    addLog(state, 'warn', `现金为负，银行自动放款 ${fmtMoney(need)}。`);
  }

  // 10. 历史
  const total = state.markets.reduce((s, m) => s + 1, 0);
  const share = avgShare(state);
  report.share = share;
  state.history.push({
    y: state.date.year, m: state.date.month, revenue: report.revenue, net: report.net,
    cash: Math.round(state.company.cash), units: report.units, share, brand: Math.round(state.company.brand),
  });
  if (state.history.length > 480) state.history.shift();

  // 竞品月度快照（竞争对手页图表与排名用）
  state.compHistory = state.compHistory || [];
  state.compHistory.push({
    y: state.date.year, m: state.date.month,
    rows: state.competitors.map((c) => ({
      id: c.id, name: c.name, nameEn: c.nameEn || '', color: c.color,
      units: Math.round(c.lastSold || 0), rev: Math.round(c.revenueEst || 0),
      brand: Math.round(c.brand), cash: Math.round(c.cash || 0),
    })),
  });
  if (state.compHistory.length > 480) state.compHistory.shift();
  // 近 12 月明细 + 更早季度归档（v1.6.0）
  compactAll(state);

  // 11. 时间推进
  const m = state.date.month + 1;
  state.date = { year: state.date.year + Math.floor(m / 12), month: m % 12 };
  state.lastReport = report;

  // 自动存档由 UI 层 queueAutoSave 按 2 秒合并写入，模拟核心不再每回合同步序列化
  return report;
}

function headcount(state) { return state.employees.length; }

function stepResearch(state, report) {
  const r = state.tech.researching;
  if (!r) return;
  const t = TECH_MAP[r.techId];
  const country = COUNTRIES.find((c) => c.id === state.company.country) || COUNTRIES[0];
  const diff = DIFFICULTY[state.company.difficulty] || DIFFICULTY.normal;
  const budget = researchBudget(state);
  if (state.company.cash < budget * 0.5) {
    report.notes.push('现金不足，研发停滞。');
    return;
  }
  const power = staffPower(state, 'rnd') * fRnd(state);
  const budgetFactor = clamp(budget / (t.cost / 24), 0.25, 1.4);
  const campusSpeed = 1 + clamp(campusBonus(state, 'rndSpeed'), 0, 1.5);
  const progress = (Math.pow(Math.max(power, 0.15), 0.9) * 9600 * budgetFactor
    * country.tech * diff.rnd * campusSpeed * activeMul(state, 'rndMul') * policyMul(state, 'rndMul')) / t.cost * 100;
  r.progress = clamp(r.progress + progress, 0, 100);
  r.spent += budget;
  state.company.cash -= budget;
  report.rnd += budget;
  if (r.progress >= 100) {
    state.tech.unlocked.push(t.id);
    state.tech.completed.push({ id: t.id, date: { ...state.date } });
    state.tech.researching = null;
    state.company.brand += 1.2;
    addLog(state, 'tech', `研发完成：${t.name}，${t.desc}`);
    report.notes.push(`研发完成：${t.name}`);
  }
}

function stepProduction(state, report) {
  const cap = capacityOf(state);
  const models = state.models.filter((p) => p.status === 'production' && (p.productionTarget || 0) > 0);
  if (!models.length) return;
  let left = cap;
  // 生产部的管理方式决定实际良品水平：专注度越高，品质越稳，但装配费也越高
  const qTarget = clamp(state.production.quality + fProdQuality(state) + processQualityBonus(state), 5, 100);
  for (const model of models) {
    model.quality = clamp((model.quality ?? 65) + (qTarget - (model.quality ?? 65)) * 0.35, 5, 100);
  }
  for (const model of models) {
    const target = Math.min(model.productionTarget || 0, left);
    if (target <= 0) continue;
    const base = bomUnit(state, model);
    const asm = assemblyUnit(state);
    const planned = unitCost(state, model);
    const affordable = Math.floor(Math.max(0, state.company.cash * 0.55) / Math.max(planned, 1));
    const qty = Math.min(target, affordable);
    if (qty <= 0) { report.notes.push(`${model.name} 因现金不足停产。`); continue; }
    // 元器件：库存覆盖部分按标准成本，缺口走现货市场溢价
    const { covered, spot } = consumeComponents(state, model, qty);
    const cost = covered * (base + asm) + spot * (base * (1 + SPOT_PREMIUM) + asm);
    model.inventory += qty;
    state.company.cash -= cost;
    report.cogs += cost;
    model.producedTotal = (model.producedTotal || 0) + qty;
    left -= qty;
    model.lastUnitCost = cost / qty;
    report.spotUnits = (report.spotUnits || 0) + spot;
    report.spotCost = (report.spotCost || 0) + spot * base * SPOT_PREMIUM;
    if (spot > 0) {
      report.notes.push(`${model.name} 有 ${fmtNum(spot)} 台缺料急采，物料成本上浮 ${Math.round(SPOT_PREMIUM * 100)}%。`);
    }
  }
}

function stepSales(state, report) {
  const year = state.date.year;
  // ---- 产品生命周期：热度（上市 100 → 逐月衰减；营销与系列粉丝减缓；竞品发布会重击）----
  const mktSpend = channelTotal(state);
  for (const p of state.models) {
    if (p.status !== 'production' || p.released === false) continue;
    if (p.heat === undefined) p.heat = 100;
    let decay = 3;
    if (mktSpend > 500000) decay -= 1;
    if (mktSpend > 2000000) decay -= 1;
    const series = p.series || String(p.name || '').trim().split(/\s+/)[0];
    const seriesSales = state.models.reduce((s2, m2) => s2 + (((m2.series || String(m2.name || '').trim().split(/\s+/)[0]) === series && m2.status === 'production') ? (m2.sold || 0) : 0), 0);
    if (seriesSales > 100000) decay -= 0.5;
    if (seriesSales > 500000) decay -= 0.5;
    p.heat = clamp(p.heat - decay, 0, 120);
    if (p.heat < 20 && !p._staleWarned) {
      p._staleWarned = true;
      report.notes.push(`${p.name} 产品热度已低于 20，建议降价清仓或推出新版本。`);
    }
    if (p.heat >= 30) p._staleWarned = false;
  }
  for (const c of state.competitors) { c.lastSold = 0; c.revenueEst = 0; delete c._launchedNoted; }
  for (const p of state.models) p.lastSold = 0; // 上月销量按月度重置，不能累计
  const hypeMul = state.hype && state.hype.months > 0 ? state.hype.mul : 1;
  const demandMul = activeMul(state, 'demandMul') * policyMul(state, 'demandMul') * hypeMul * channelSalesMul(state);
  for (const market of state.markets) {
    const shareInfo = marketShare(state, market.id);
    const potential = marketPotential(state, market, demandMul);
    const storeMul = storeSalesMul(state, market.id);
    let mUnits = 0, mRev = 0;
    // 竞品月销量：市场容量 × 份额，但受产能/库存约束（v1.5.0——缺货不再无脑成交）
    for (const rv of shareInfo.comp || []) {
      const c = rv.competitor;
      const demand = potential * (rv.ratio || 0);
      const stock = Number.isFinite(Number(c.inventory)) ? Number(c.inventory) : Infinity;
      const units = Math.min(demand, stock);
      if (Number.isFinite(stock)) c.inventory = Math.max(0, stock - units);
      c.lastSold = (c.lastSold || 0) + units;
      c.revenueEst = (c.revenueEst || 0) + units * (rv.phone.price || 0);
      if (demand > units * 1.15 + 1 && !c._shortNoted) {
        c._shortNoted = true;
        report.notes.push(`${c.name} 产能不足，${rv.phone.name} 出现缺货，部分需求外溢。`);
      }
      // 竞品旗舰发布会：推送新闻 + 同价位自家产品热度 -8（每家每月至多一次）
      if (rv.phone.price > expectedPrice(year) * 1.1 && !rv.competitor._launchedNoted) {
        rv.competitor._launchedNoted = true;
        state.news = state.news || [];
        state.news.unshift({
          time: `${year}/${state.date.month + 1}`, type: 'competitor',
          title: `${rv.competitor.name} 发布 ${rv.phone.name}`,
          text: `定价 ¥${fmtNum(rv.phone.price)}，主打高端市场，同价位产品热度受冲击。`, read: false,
        });
        if (state.news.length > 100) state.news.length = 100;
        for (const p of state.models) {
          if (p.status !== 'production') continue;
          const myPrice = p.price[market.id] || p.price.cn || 0;
          if (myPrice > rv.phone.price * 0.8 && myPrice < rv.phone.price * 1.2) {
            p.heat = clamp((p.heat === undefined ? 100 : p.heat) - 8, 0, 100);
          }
        }
      }
    }
    for (const op of shareInfo.own) {
      const model = op.model;
      const ratio = op.ratio || 0;
      let demand = potential * ratio * storeMul;
      // 热度影响有效需求（heat 100 = 全额需求，heat 0 = 30% 基础需求）
      const heatMul = 0.3 + ((model.heat === undefined ? 100 : model.heat) / 100) * 0.7;
      demand *= heatMul;
      const price = op.price || model.price[market.id] || 0;
      const take = Math.min(demand, model.inventory);
      model.inventory -= take;
      model.sold += take;
      // 多配置变体：库存共用，各版本按**自己的价格**结算；
      // 销量分配 = 价格越低卖得越多的弹性权重（相对机型基准价）
      const variants = (model.design?.variants || []).filter((v) => v && v.ram && v.stg);
      let rev = take * price;
      if (variants.length) {
        const base = price || 1;
        const vp = variants.map((v) => (v.price && v.price[market.id]) || (v.price && v.price.cn) || base);
        // 相对基准价的弹性：低于基准价卖得更多
        const raw = vp.map((pp) => Math.pow(base / Math.max(1, pp), 1.5));
        const wSum = raw.reduce((a, b) => a + b, 0) || 1;
        rev = 0;
        variants.forEach((v, vi) => {
          const vTake = take * (raw[vi] / wSum);
          const vRev = vTake * vp[vi];
          v.sold = (v.sold || 0) + vTake;
          v.revenue = (v.revenue || 0) + vRev;
          rev += vRev;
        });
      }
      model.revenue += rev;
      model.lastSold = (model.lastSold || 0) + take;
      mUnits += take;
      mRev += rev;
      report.revenue += rev;
      report.units += take;
      model.history = model.history || [];
      const h = model.history[model.history.length - 1];
      if (h && h.y === year && h.m === state.date.month) { h.units += take; h.rev += rev; }
      else model.history.push({ y: year, m: state.date.month, units: take, rev });
      if (model.history.length > 240) model.history.shift();
      if (demand > take + 1) report.notes.push(`${market.name}：${model.name} 库存不足，损失约 ${fmtUnit(demand - take)}销量。`);
      let entry = report.byModel.find((x) => x.id === model.id);
      if (!entry) { entry = { id: model.id, name: model.name, units: 0, revenue: 0 }; report.byModel.push(entry); }
      entry.units += take; entry.revenue += rev;
    }
    if (mUnits > 0) report.byMarket.push({ id: market.id, name: market.name, units: mUnits, revenue: mRev });
    market.awareness = clamp(market.awareness + (shareInfo.ownShare > 0.001 ? 1 : -0.4), 0, 100);
  }
}

function stepBrand(state, report, extraBrand = 0) {
  const launched = state.models.filter((p) => p.status === 'production' && p.released !== false);
  let avgReview = 50;
  if (launched.length) {
    let tot = 0, w = 0;
    for (const p of launched) {
      const r = p.rating || 55;
      const weight = Math.max(1, p.lastSold || 0);
      tot += r * weight; w += weight;
    }
    avgReview = w > 0 ? tot / w : 50;
  }
  const mktPower = staffPower(state, 'mkt');
  const marketingEffect = (Math.log10(1 + channelTotal(state) / 20000) * 2.4 + mktPower * 0.12 + extraBrand) * fBrand(state);
  const share = avgShare(state);
  const wom = wordOfMouth(state);
  const target = clamp(20 + (avgReview - 50) * 0.9 + share * 300 + marketingEffect + state.company.reputation * 0.18, 0, 100);
  // 老机型退市会让品牌自然衰减，但不该硬落到 0：存量用户与口碑还有底
  const brandFloor = clamp(state.company.reputation * 0.25 + share * 60, 0, 18);
  state.company.brand += (Math.max(target, brandFloor) - state.company.brand) * 0.16 * wom * policyMul(state, 'brandCut');
  state.company.brand = clamp(state.company.brand, 0, 100);
  state.company.reputation += (avgReview - state.company.reputation) * 0.05;
  // 设计奖月度评审：量产机型按设计分概率获奖（品牌 +2.5）
  const awYear = state.date.year;
  for (const p of state.models) {
    if (p.status !== 'production') continue;
    p.awards = p.awards || [];
    if (p.awards.length >= 3) continue;
    const dScore = derive(p.design, awYear).designScore;
    const winP = clamp((dScore - 78) / 380, 0, 0.055);
    if (chance(winP)) {
      const pool = ['IF 设计金奖', '红点最佳设计奖', '年度创新设计奖'];
      const name = pool[Math.floor(Math.random() * pool.length)];
      if (!p.awards.some((a) => a.name === name)) {
        p.awards.push({ name, year: awYear });
        state.company.brand = clamp(state.company.brand + 2.5, 0, 100);
        report.notes.push(`${p.name} 获得${name}，设计实力获行业认可。`);
        addLog(state, 'product', `${p.name} 获得${name}。`);
        state.news = state.news || [];
        state.news.unshift({ time: `${awYear}/${state.date.month + 1}`, type: 'award', title: `${p.name} 获得${name}`, text: '设计实力获行业认可，品牌 +2.5。', read: false });
        if (state.news.length > 100) state.news.length = 100;
      }
    }
  }
  report.rating = Math.round(avgReview);
  report.brand = Math.round(state.company.brand);
}

const LIFE_EVENTS = [
  { text: '{n} 过生日，团队一起庆祝，满意度 +4。', fx: (e) => { e.satisfaction = clamp(e.satisfaction + 4, 0, 100); } },
  { text: '{n} 休完婚假归来，满意度 +6，薪资期望 +5%。', fx: (e) => { e.satisfaction = clamp(e.satisfaction + 6, 0, 100); e.expectSalary = Math.round(e.expectSalary * 1.05 / 100) * 100; } },
  { text: '{n} 因健康问题请假两周，压力有所缓解。', fx: (e) => { e.stress = clamp(e.stress - 6, 0, 100); e.satisfaction = clamp(e.satisfaction - 2, 0, 100); } },
  { text: '{n} 最近家庭事务缠身，压力 +8。', fx: (e) => { e.stress = clamp(e.stress + 8, 0, 100); } },
  { text: '{n} 与同事发生争执，效率暂降 1 点。', fx: (e) => { e.eff = clamp(e.eff - 1, 10, 100); } },
  { text: '{n} 自费参加了行业研讨会，能力 +0.4。', fx: (e) => { e.skill = clamp(e.skill + 0.4, 1, 99); } },
  // v1.5.0：更多个人事件，让名册更有"人味"
  { text: '{n} 拿到了行业认证，能力小幅提升。', fx: (e) => { e.skill = +clamp(e.skill + 0.8, 1, 99).toFixed(2); e.grew = (e.grew || 0) + 0.8; } },
  { text: '{n} 的家人突发疾病，请了两周事假，压力略降。', fx: (e) => { e.stress = clamp(e.stress - 4, 0, 100); e.satisfaction = clamp(e.satisfaction - 3, 0, 100); } },
  { text: '{n} 主动带新人，团队协作氛围变好。', fx: (e) => { e.comm = clamp(e.comm + 2, 5, 100); e.satisfaction = clamp(e.satisfaction + 2, 0, 100); } },
];

function stepEmployees(state, report) {
  const diff = DIFFICULTY[state.company.difficulty] || DIFFICULTY.normal;
  const country = COUNTRIES.find((c) => c.id === state.company.country) || COUNTRIES[0];
  const avgSalary = state.employees.length ? sum(state.employees, (e) => e.salary) / state.employees.length : 0;
  const marketSalary = avgSalary * (0.85 + Math.random() * 0.3);
  const leaving = [];
  for (const e of state.employees) {
    const payRatio = e.salary / Math.max(e.expectSalary, 1);
    const stressDelta = (e.stress > 70 ? 0.8 : -0.3);
    e.stress = clamp(e.stress + stressDelta + rand(-1.5, 1.5), 0, 100);
    const targetSat = clamp(58 + (payRatio - 1) * 120 - e.stress * 0.25 + state.company.brand * 0.08 + fMorale(state) + policyAdd(state, 'morale'), 0, 100);
    e.satisfaction += (targetSat - e.satisfaction) * 0.12;
    e.satisfaction = clamp(e.satisfaction, 0, 100);
    if (e.skill < 92 && chance(0.35)) {
      const grow = 0.12 * (1 + e.potential / 200) * (e.satisfaction / 70);
      e.skill = +clamp(e.skill + grow, 1, 99).toFixed(2);
      e.grew += grow;
    }
    const leaveChance = clamp((38 - e.satisfaction) / 1400 + (payRatio < 0.85 ? 0.008 : 0), 0, 0.03);
    // 流失风险（月度 %）：名册与详情页展示，低满意/低薪会明显升高
    e.leaveRisk = +clamp(leaveChance * 100 + (e.star && payRatio < 1.15 ? 1.2 : 0), 0, 9).toFixed(1);
    if (chance(leaveChance)) leaving.push(e);
    // 加薪诉求
    if (payRatio < 0.88 && chance(0.04)) {
      e.expectSalary = Math.round(e.salary * 1.12 / 100) * 100;
      report.notes.push(`${e.name} 提出加薪，期望 ${fmtMoney(e.expectSalary)}/月。`);
    }
    // ---- 明星员工：高能力+高满意度员工成名（品牌影响力+部门产出+，但被挖风险大）----
    if (!e.star && e.skill >= 85 && e.satisfaction > 62 && chance(0.05)) {
      e.star = true;
      report.notes.push(`${e.name} 已成为行业明星${e.role}，品牌影响力上升，但被挖角风险加大。`);
      addLog(state, 'hr', `${e.name} 成为行业明星。`);
      state.news = state.news || [];
      state.news.unshift({ time: `${state.date.year}/${state.date.month + 1}`, type: 'star', title: `${e.name} 成为行业明星`, text: `${e.role} · 能力 ${Math.round(e.skill)}。部门产出 +12%，品牌 +，注意加薪留人。`, read: false });
      if (state.news.length > 100) state.news.length = 100;
    }
    if (e.star) {
      state.company.brand = clamp(state.company.brand + 0.06, 0, 100);
      // 明星被挖：薪酬没给够时风险显著
      if (payRatio < 1.15 && chance(0.012)) {
        leaving.push(e);
        report.notes.push(`明星员工 ${e.name} 被对手高薪挖走！`);
        addLog(state, 'hr', `明星员工 ${e.name} 离职。`);
      }
    }
    // ---- 员工个人小事件：让名册有"人味" ----
    if (chance(0.02) && !leaving.includes(e)) {
      const ev = LIFE_EVENTS[Math.floor(Math.random() * LIFE_EVENTS.length)];
      ev.fx(e);
      report.notes.push(ev.text.replace('{n}', e.name));
    }
  }
  for (const e of leaving) {
    state.employees = state.employees.filter((x) => x.id !== e.id);
    addLog(state, 'hr', `${e.name} 离职（满意度 ${Math.round(e.satisfaction)}）。`);
  }
  if (leaving.length) report.notes.push(`${leaving.length} 名员工离职。`);

  // 招聘市场刷新（不存库，按需生成）
  state.company.marketSalary = Math.round(marketSalary);
}

function stepCompetitors(state, report) {
  const yr = state.date.year;
  const pushNews = (title, text) => {
    state.news = state.news || [];
    state.news.unshift({ time: `${yr}/${state.date.month + 1}`, type: 'attack', title, text, read: false });
    if (state.news.length > 100) state.news.length = 100;
  };
  // 新竞品入场
  const activeIds = new Set(state.competitors.map((c) => c.id));
  for (const def of COMPETITORS) {
    if (!activeIds.has(def.id) && (def.foundedYear || 1980) <= yr) {
      const nc = makeCompetitors(def.foundedYear).find((x) => x.id === def.id);
      if (nc) {
        state.competitors.push(nc);
        report.notes.push(nc.name + ' 正式进入手机市场！');
        addLog(state, 'market', nc.name + ' 宣布进军手机行业。');
      }
    }
  }
  // 竞品退出
  state.competitors = state.competitors.filter((c) => {
    if (c.exitYear && yr >= c.exitYear) {
      report.notes.push(c.name + ' 正式退出手机市场。');
      addLog(state, 'market', c.name + ' 宣布退出手机业务。');
      return false;
    }
    return true;
  });
  // 衰退
  for (const c of state.competitors) {
    if (c.declineYear && yr >= c.declineYear) {
      c.brand = clamp(c.brand - 0.5, 5, 100);
      c.techLevel = clamp(c.techLevel - 0.001, 0.3, 2);
      if (!c._declineNoted) { report.notes.push(c.name + ' 市场表现持续下滑。'); c._declineNoted = true; }
    } else { c._declineNoted = false; }
  }
  const year = state.date.year;
  // 宏观环境对竞品同样生效：政策需求/成本、行业事件
  const demandMul = activeMul(state, 'demandMul') * policyMul(state, 'demandMul');
  const costMul = activeMul(state, 'costMul') * policyMul(state, 'costMul');
  // 供应链断供潮对竞品也有小概率误伤（它们同样依赖元器件）
  const disrupted = chance(0.03);
  // 玩家份额轨迹（12 个月窗口），AI 用它判断"这个人最近抢了谁的市场"
  state._shareTrail = Array.isArray(state._shareTrail) ? state._shareTrail : [];
  state._shareTrail.push(avgShare(state));
  if (state._shareTrail.length > 12) state._shareTrail.shift();
  const shareGrowth = state._shareTrail.length >= 6
    ? state._shareTrail[state._shareTrail.length - 1] - state._shareTrail[0]
    : 0;
  // 玩家在售机型的中位价：AI 发布定价对标用
  const myPrices = state.models.filter((p) => p.status === 'production' && p.released !== false)
    .map((p) => p.price?.cn || 0).filter((v) => v > 0).sort((a, b) => a - b);
  const playerMedian = myPrices.length ? myPrices[Math.floor(myPrices.length / 2)] : 0;

  for (const c of state.competitors) {
    if (c.sub) continue; // 子公司由 stepSubsidiaries 经营
    // 技术演进：研发型对手（重研发 style）更快；受断供拖慢
    const rndBias = c.style === 'ecosystem' ? 1.5 : c.style === 'hardware' ? 1.0 : 0.7;
    c.techLevel = clamp(c.techLevel + 0.0009 * rndBias * (disrupted ? 0.4 : 1), 0.4, 1.3);
    c.brand += rand(-0.15, 0.18) * demandMul;
    c.brand = clamp(c.brand, 10, 99);
    c.lastRelease = (c.lastRelease || 0) + 1;
    const cycle = c.signature === 'ecosystem' ? 12
      : c.signature === 'value' ? 9
        : c.signature === 'perf' ? 8
          : c.signature === 'camera' ? 10
            : randInt(6, 14);
    if (c.lastRelease >= cycle || c.lineup.length === 0) {
      c.lastRelease = 0;
      const phone = makeCompetitorPhone(c, year);
      // AI 定价对标：不再闭眼随机——参考玩家中位价，性价比厂压价、旗舰厂溢价
      if (playerMedian > 0) {
        if (c.style === 'value') phone.price = Math.round(playerMedian * rand(0.72, 0.9));
        else if (c.style === 'ecosystem' || c.style === 'tech') phone.price = Math.round(playerMedian * rand(1.05, 1.35));
        else phone.price = Math.round(((phone.price + playerMedian) / 2) * rand(0.92, 1.08));
        phone.price = Math.max(Math.round(phone.price / 10) * 10, 1);
      }
      c.lineup.push(phone);
      if (c.lineup.length > 3) c.lineup.shift();
      if (c.brand > 45) addLog(state, 'rival', `${c.name} 发布新机 ${phone.name}，定价 ${fmtMoney(phone.price)}。`);
      // 爆款机型：强势品牌偶发爆款，下月抢走额外份额（品牌跳涨模拟舆论热度）
      if (c.brand > 58 && chance(0.14)) {
        c.brand = clamp(c.brand + rand(3, 7), 10, 99);
        addLog(state, 'rival', `${c.name} 的 ${phone.name} 成为爆款，市场热度飙升。`);
        report.notes.push(`${c.name} 发布爆款 ${phone.name}，注意竞争压力。`);
      }
    }
    for (const p of c.lineup) p.age = (p.age || 0) + 1;
    c.lineup = c.lineup.filter((p) => p.age < 30);
    // ---- AI 行为层：让对手像在"经营"而不是按模板刷新 ----
    // 1) 清库存：老机型没人买就主动降价，换现金与曝光
    for (const p of c.lineup) {
      if (p.age >= 7 && !p.clearance && chance(0.32)) {
        p.price = Math.round(p.price * rand(0.76, 0.88));
        p.clearance = true;
        if (c.brand > 40) addLog(state, 'rival', `${c.name} 对上市半年的 ${p.name} 降价促销，现售 ${fmtMoney(p.price)}。`);
      }
    }
    // 2) 反击玩家：玩家份额半年涨 0.8% 以上，强势对手按人设做出反应
    if (shareGrowth > 0.008 && c.brand > 45 && chance(0.45)) {
      if (c.style === 'value') {
        // 性价比厂打价格战：全线砍价，伤敌一千自损八百
        for (const p of c.lineup) p.price = Math.round(p.price * rand(0.8, 0.88));
        addLog(state, 'rival', `${c.name} 发起价格战：全系机型直降，正面刚 ${state.company.name}。`);
        report.notes.push(`${c.name} 发起价格战，同价位机型竞争加剧。`);
        pushNews(`${c.name} 发起价格战`, '对方全系直降，同价位机型竞争加剧，考虑跟进降价或强调差异点。');
        c.brand = clamp(c.brand + 1.5, 10, 99);
      } else if (c.style === 'ecosystem' || c.style === 'tech') {
        // 技术流提前亮旗舰：研发周期清零直接发新机
        c.lastRelease = cycle;
        addLog(state, 'rival', `${c.name} 宣布提前举行发布会，被解读为针对 ${state.company.name} 的势头。`);
        report.notes.push(`${c.name} 将提前发布新机，小心正面撞档期。`);
        pushNews(`${c.name} 提前举行发布会`, '新旗舰将正面撞你的档期，同价位产品热度将受冲击。');
      } else {
        // 营销流砸钱抢声量
        c.brand = clamp(c.brand + rand(2, 4), 10, 99);
        addLog(state, 'rival', `${c.name} 加大广告投放，品牌声量明显上升。`);
        report.notes.push(`${c.name} 营销攻势凶猛，你的品牌曝光被分走。`);
        pushNews(`${c.name} 发起营销攻势`, '对方大规模投放广告，你的品牌曝光被分走，可加大营销预算应对。');
        for (const m of state.markets) if (m.launched) m.awareness = clamp((m.awareness || 0) - 1.5, 0, 100);
      }
    }
    // 3) 常规营销月：中等品牌偶尔做一波品牌活动
    if (c.brand > 35 && c.brand < 75 && chance(0.06)) {
      c.brand = clamp(c.brand + rand(1, 3), 10, 99);
      addLog(state, 'rival', `${c.name} 赞助体育赛事 / 综艺，品牌热度上升。`);
    }
    // 4) 潮流跟随：蹭行业事件的东风（爆款事件已经抬过品牌，这里补机型卖点）
    if (state.events.some((e) => e.id === 'trend-fold') && !c.lineup.some((p) => p.foldable) && c.brand > 50 && chance(0.25)) {
      const p = c.lineup[0];
      if (p) { p.foldable = true; p.price = Math.round(p.price * 1.25); addLog(state, 'rival', `${c.name} 跟进折叠屏形态，${p.name} 折叠版曝光。`); }
    }
    // 5) 策略性挖人：强势对手挖角你的高技能员工（HR 人力 / 满意度 / 忠诚度是防御）
    if (c.brand > 50 && chance(clamp(0.045 + Math.min(0.05, Math.max(0, shareGrowth) * 2), 0, 0.09))) {
      const tgt = [...state.employees].filter((e) => e.skill >= 70).sort((a, b) => b.skill - a.skill)[0];
      if (tgt) {
        const hrDef = staffPower(state, 'hr') * 6 + (tgt.loyalty - 50) * 0.4 + (tgt.satisfaction - 50) * 0.3 + (tgt.star ? -18 : 0);
        if (chance(clamp(0.75 - hrDef / 100, 0.08, 0.75))) {
          state.employees = state.employees.filter((x) => x.id !== tgt.id);
          const title = `${c.name} 挖走了 ${tgt.name}`;
          report.notes.push(`${c.name} 高薪挖走你的${tgt.role} ${tgt.name}！提高薪酬/满意度/HR 人力可降低被挖风险。`);
          addLog(state, 'hr', `${title}（${tgt.role}，能力 ${tgt.skill}）。`);
          pushNews(title, `${tgt.role} · 能力 ${tgt.skill}。高技能与明星员工是主要被挖目标。`);
        } else {
          report.notes.push(`${tgt.name} 拒绝了 ${c.name} 的挖角，选择留下。`);
        }
      }
    }
    // 资产演化：需求与成本宏观联动（政策/事件也影响它们），断供月成本恶化
    const drain = 2.2e6 * (1 + c.lineup.length) * costMul;
    // 产能与库存（v1.5.0）：月末补货，上月缺货不会永远延续
    c.capacity = Math.round(180000 * (0.7 + c.brand / 80) * (0.6 + c.techLevel));
    c.inventory = clamp((c.inventory || 0) + c.capacity * 0.9, 0, c.capacity * 1.5);
    c._shortNoted = false;
    c.cash = clamp((c.cash || 2e8) + (c.revenueEst || 0) * 0.16 * demandMul / Math.max(costMul, 0.5) - drain, -5e7, 2e10);
    // 经营恶化 → 破产退出市场：现金见底且无在售机型
    if (c.cash <= 0 && (c.lineup.length === 0 || c.brand < 22)) {
      addLog(state, 'rival', `${c.name} 资金链断裂，宣布退出手机市场。`);
      report.notes.push(`${c.name} 破产退出市场。`);
      state.competitors = state.competitors.filter((x) => x.id !== c.id);
      continue;
    }
    c.share = c.lastSold || 0;
  }
  // 对手之间也会互相吞并与结盟（v1.5.0），让 16 家品牌更像活体市场
  stepRivalRelations(state, report);
}

// 竞品关系演化：强弱并购 + 联盟
function stepRivalRelations(state, report) {
  const list = state.competitors.filter((c) => !c.sub && (c.lineup || []).length > 0);
  const newsPush = (title, text) => {
    state.news = state.news || [];
    state.news.unshift({ time: `${state.date.year}/${state.date.month + 1}`, type: 'competitor', title, text, read: false });
    if (state.news.length > 100) state.news.length = 100;
  };
  state.rivalAlliances = Array.isArray(state.rivalAlliances) ? state.rivalAlliances : [];
  // 联盟到期/成员消失
  for (const a of state.rivalAlliances) a.months = (a.months || 0) - 1;
  state.rivalAlliances = state.rivalAlliances.filter((a) => a.months > 0
    && list.some((c) => c.id === a.a) && list.some((c) => c.id === a.b));

  // 并购：强势大厂吞并濒临边缘的小厂
  if (list.length >= 5 && chance(0.007)) {
    const buyer = [...list].sort((a, b) => b.brand - a.brand)[0];
    const target = [...list].filter((c) => c.id !== buyer.id).sort((a, b) => a.brand - b.brand)[0];
    if (buyer && target && buyer.brand > 55 && target.brand < 42 && (buyer.cash || 0) > 8e8) {
      buyer.lineup = [...buyer.lineup, ...target.lineup].slice(-4);
      buyer.brand = clamp(buyer.brand + clamp(target.brand * 0.12, 1, 6), 10, 99);
      buyer.cash -= 2e8;
      state.competitors = state.competitors.filter((c) => c.id !== target.id);
      state.rivalAlliances = state.rivalAlliances.filter((a) => a.a !== target.id && a.b !== target.id);
      const title = `${buyer.name} 收购 ${target.name}`;
      report.notes.push(`${title}，行业集中度上升。`);
      addLog(state, 'rival', `${title}，${target.name} 退出独立经营。`);
      newsPush(title, `${buyer.name} 宣布收购 ${target.name}，后者产品线并入前者。`);
    }
  }

  // 结盟：两家强势厂商共享渠道（份额计算 +6%）
  if (list.length >= 4 && state.rivalAlliances.length < 2 && chance(0.01)) {
    const top = [...list].sort((a, b) => b.brand - a.brand).slice(0, 4);
    const a = top[0];
    const b = top[1 + Math.floor(Math.random() * 3)];
    const allied = state.rivalAlliances.some((x) => (x.a === a?.id && x.b === b?.id) || (x.a === b?.id && x.b === a?.id));
    if (a && b && a.id !== b.id && !allied) {
      const months = randInt(12, 30);
      state.rivalAlliances.push({ a: a.id, b: b.id, months, name: `${a.name} × ${b.name}` });
      a.brand = clamp(a.brand + 0.5, 10, 99);
      b.brand = clamp(b.brand + 0.5, 10, 99);
      const title = `${a.name} 与 ${b.name} 达成战略联盟`;
      report.notes.push(`${title}（${months} 个月），渠道与曝光共享。`);
      addLog(state, 'rival', title);
      newsPush(title, '双方将在渠道、供应链与专利上合作，联盟成员的市场曝光提升。');
    }
  }
}

function stepEvents(state, report) {
  const demandMul = 1;
  // 到期
  state.events = state.events.filter((e) => {
    e.months -= 1;
    return e.months > 0;
  });
  const pr = 0.14;
  if (chance(pr)) {
    // 按年代过滤事件池（minYear/maxYear），避免 1995 年出"5G 换机潮"
    const year = state.date.year;
    const pool = EVENTS.filter((e) => (e.minYear == null || year >= e.minYear) && (e.maxYear == null || year <= e.maxYear));
    const weights = pool.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * weights;
    let ev = pool[0];
    for (const e of pool) { r -= e.weight; if (r <= 0) { ev = e; break; } }
    const inst = { ...ev, months: ev.months || 1, uid: Math.random().toString(36).slice(2, 7) };
    // 关税事件改走政策系统（出口管制），否则 tariffAdd 是个没人读的死字段
    if (ev.id === 'tariff') {
      triggerPolicy(state, 'export_control');
      addLog(state, 'bad', `${ev.title}：${inst.text}`);
      report.notes.push(`${ev.title}：${inst.text}`);
    } else {
      if (ev.recall) {
        const sold = sum(state.models, (p) => p.lastSold || 0);
        const loss = Math.round(sold * rand(40, 120) + 200000);
        state.company.cash -= loss;
        state.company.brand -= 4;
        inst.text += ` 召回支出 ${fmtMoney(loss)}。`;
      }
      if (ev.brandBoost) state.company.brand = clamp(state.company.brand + ev.brandBoost, 0, 100);
      if (ev.rndBoost && state.tech.researching) {
        state.tech.researching.progress = clamp(state.tech.researching.progress + ev.rndBoost * 100, 0, 99);
      }
      // 认知度事件：直播带货 / 博会拉认知，山寨冲击压认知
      if (ev.awarenessBoost) {
        for (const m of state.markets) if (m.launched) m.awareness = clamp((m.awareness || 0) + ev.awarenessBoost, 0, 100);
      }
      if (ev.awarenessCut) {
        for (const m of state.markets) if (m.launched) m.awareness = clamp((m.awareness || 0) - ev.awarenessCut, 0, 100);
      }
      // 专利流氓：按近 12 月营收讹一笔
      if (ev.lawsuit) {
        const rev12 = state.history.slice(-12).reduce((a, h) => a + (h.revenue || 0), 0);
        const loss = Math.max(1e6, Math.round(rev12 * 0.02));
        state.company.cash -= loss;
        inst.text += ` 赔付 ${fmtMoney(loss)}。`;
      }
      // 全行业价格战：竞品集体跟跌（效用模型直接吃 phone.price）
      if (ev.priceWar) {
        let n = 0;
        for (const c of state.competitors) {
          if (c.sub) continue;
          for (const p of c.lineup) { p.price = Math.round(p.price * 0.92); n++; }
        }
        if (n > 0) inst.text += ' 竞品机型全线跟跌约 8%。';
      }
      if (ev.poach && state.employees.length > 3) {
        const sorted = [...state.employees].sort((a, b) => b.skill - a.skill);
        const victims = sorted.slice(0, Math.min(2, Math.floor(sorted.length / 6) + 1));
        for (const v of victims) {
          state.employees = state.employees.filter((x) => x.id !== v.id);
          inst.text += ` ${v.name} 被挖走。`;
        }
      }
      state.events.push(inst);
      addLog(state, ev.kind === 'good' ? 'good' : 'bad', `${ev.title}：${inst.text}`);
      report.notes.push(`${ev.title}：${inst.text}`);
    }
  }
  // 供应商断供：独立于普通事件的月度掷骰，可靠性越低越容易出事
  const risky = pickDisruptableSupplier(state);
  if (risky && chance(0.055 * (1 - risky.reliability))) {
    const months = randInt(2, 4);
    addDisruption(state, risky.id, months, pick(['产能事故', '原材料短缺', '产线检修', '物流受阻']));
    const text = `${risky.name} 出现断供，交期顺延一个月，预计 ${months} 个月恢复。`;
    addLog(state, 'bad', text);
    report.notes.push(text);
  }
  // 声誉严重下滑触发危机
  if (state.company.brand < 8 && state.mode === 'career') {
    report.notes.push('品牌跌至谷底，渠道开始下架产品。');
  }
}

// 全球份额：按市场规模加权，避免"只在少数市场销售"被平均值稀释
export function avgShare(state) {
  let w = 0, s = 0;
  for (const m of state.markets) {
    s += marketShare(state, m.id).ownShare * m.base;
    w += m.base;
  }
  return w > 0 ? s / w : 0;
}

export function evaluateModel(state, model) {
  // 沙盒全解锁：跳过年代合理性门槛（如 2020 前的折叠结构）
  const all = state.mode === 'sandbox' && state.tech.all;
  const v = validate(model.design, state.date.year,
    all ? { ignoreEra: true, unlocked: state.tech.unlocked } : { unlocked: state.tech.unlocked });
  const d = v.derived;
  return { ...v, derived: d };
}

export { derive };

// 猎头挖角：从竞争对手处挖一名核心工程师（v1.5.0）
// 成功率随对方品牌下降、随我方品牌上升；失败也会照付猎头费并让对方加强留人
export function poachFromRival(state, compId) {
  const c = state.competitors.find((x) => x.id === compId);
  if (!c) return { ok: false, msg: '该公司已不在市场中' };
  const emp = generateEmployee(state.date.year, {
    skillMean: clamp(60 + (c.brand || 40) * 0.28, 55, 92),
    deptId: 'rnd',
    role: '高级工程师',
    field: '手机研发',
  });
  const fee = Math.round(emp.salary * 3 / 100) * 100;
  if (state.company.cash < fee) return { ok: false, msg: `挖角费用不足（需 ${fmtMoney(fee)}）` };
  const successRate = clamp(0.82 - (c.brand || 40) / 180 + state.company.brand / 320, 0.18, 0.92);
  state.company.cash -= fee;
  if (Math.random() > successRate) {
    c.brand = clamp(c.brand + 0.8, 10, 99);
    addLog(state, 'hr', `猎头接触 ${c.name} 的工程师失败，对方提高了留人待遇。`);
    return { ok: false, msg: `对方拒绝了邀约（成功率 ${Math.round(successRate * 100)}%），猎头费已支付` };
  }
  emp.salary = Math.round(emp.salary * 1.12 / 100) * 100;
  emp.expectSalary = Math.max(emp.expectSalary, emp.salary);
  state.employees.push(emp);
  c.brand = clamp(c.brand - 0.6, 10, 99);
  addLog(state, 'hr', `从 ${c.name} 挖来工程师 ${emp.name}（能力 ${emp.skill}），猎头费 ${fmtMoney(fee)}。`);
  state.news = state.news || [];
  state.news.unshift({
    time: `${state.date.year}/${state.date.month + 1}`, type: 'star',
    title: `${emp.name} 从 ${c.name} 跳槽加入`,
    text: `核心工程师 · 能力 ${emp.skill}。猎头费 ${fmtMoney(fee)}。`, read: false,
  });
  if (state.news.length > 100) state.news.length = 100;
  return { ok: true, msg: `${emp.name}（能力 ${emp.skill}）已入职`, emp, fee };
}

// ---------- 智能排产：按上月销量 × 热度 × 增长缓冲，扣除一半库存 ----------
export function suggestTargets(state) {
  const prodPower = staffPower(state, 'prod');
  return {
    prodPower,
    qualityRisk: prodPower < 0.6, // 生产部人力不足时急调排产会有品质波动
    targets: state.models.filter((p) => p.status === 'production').map((p) => {
      const heat = p.heat === undefined ? 100 : p.heat;
      const heatMul = heat > 70 ? 1.18 : heat > 40 ? 1.0 : 0.72;
      const want = Math.round((p.lastSold || 0) * 1.12 * heatMul);
      return { id: p.id, name: p.name, from: p.productionTarget || 0, to: Math.max(0, want - Math.floor((p.inventory || 0) * 0.5)) };
    }),
  };
}

// ---------- 技术引进：直接购买竞品成熟技术（贵但即时），子公司转让另有折扣 ----------
export function techOffers(state) {
  const year = state.date.year;
  const seed = year * 12 + state.date.month;
  const pool = TECHS.filter((t) => t.year <= year && !state.tech.unlocked.includes(t.id) && t.prereq.every((p) => state.tech.unlocked.includes(p)));
  const picks = [];
  const used = new Set();
  for (let i = 0; i < pool.length && picks.length < 3; i++) {
    const idx = (seed * 7 + i * 13) % pool.length;
    if (used.has(idx)) continue;
    used.add(idx);
    picks.push(pool[idx]);
  }
  const seller = [...state.competitors].sort((a, b) => b.techLevel - a.techLevel)[0];
  return picks.map((t) => ({
    techId: t.id, name: t.name, year: t.year, desc: t.desc,
    seller: seller ? seller.name : '国际技术供应商',
    price: Math.round(t.cost * 2.4),
  }));
}

export function buyTech(state, techId) {
  const t = TECH_MAP[techId];
  if (!t) return { ok: false, msg: '未知技术' };
  if (state.tech.unlocked.includes(techId)) return { ok: false, msg: '已掌握该技术' };
  if (t.prereq.some((p) => !state.tech.unlocked.includes(p))) return { ok: false, msg: '前置技术未满足，对方拒绝转让' };
  const offer = techOffers(state).find((o) => o.techId === techId);
  const price = offer ? offer.price : Math.round(t.cost * 2.4);
  if (state.company.cash < price) return { ok: false, msg: '资金不足' };
  state.company.cash -= price;
  state.tech.unlocked.push(techId);
  addLog(state, 'tech', `从 ${offer ? offer.seller : '外部供应商'} 引进技术「${t.name}」，支出 ${fmtMoney(price)}。`);
  return { ok: true, msg: `技术「${t.name}」引进完成，立即生效` };
}
