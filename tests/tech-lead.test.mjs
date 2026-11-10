// 超前研发 / 部门软门槛 / 工程样品 / 收购技术 四套规则的回归
import { createGame } from '../js/core/state.js';
import { startResearch, researchBudget, payResearchTrial, tick } from '../js/core/sim.js';
import { techLeadPenalty, techTrialCost, TECH_MAP } from '../js/data/tech.js';
import { buildDivision, designProduct, computeCustomSpec, DIVISION_DEFS } from '../js/core/divisions.js';
import { eraAvailability, validate, defaultDesign, leadPartCount } from '../js/core/design.js';
import { TECHS } from '../js/data/tech.js';
import { CPUS } from '../js/data/parts.js';
import { openNegotiation, negotiateOffer, ensureSubsidiaries, compTechAssets, techAssetValue } from '../js/core/capital.js';
import { COMPETITORS } from '../js/data/world.js';

let bad = 0;
const check = (name, ok, detail = '') => {
  if (!ok) bad += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

// 1. 阻力曲线分级
{
  const p0 = techLeadPenalty(0), p2 = techLeadPenalty(2), p5 = techLeadPenalty(5), p8 = techLeadPenalty(8), p15 = techLeadPenalty(15);
  check('不提前=原价原速', p0.costMul === 1 && p0.speedMul === 1 && p0.trialMul === 0);
  check('提前 1-3 年：×1.8 / ×0.7', p2.costMul === 1.8 && p2.speedMul === 0.7);
  check('提前 4-6 年：×3 / ×0.4', p5.costMul === 3 && p5.speedMul === 0.4);
  check('提前 7-10 年：×5 / ×0.25', p8.costMul === 5 && p8.speedMul === 0.25);
  check('提前 10 年以上：×9 / ×0.15', p15.costMul === 9 && p15.speedMul === 0.15);
  check('试制费随提前量上升', techTrialCost(TECH_MAP['2g'], 1) < techTrialCost(TECH_MAP['2g'], 8));
}

// 2. 超前研发：去掉年代拦截，但前置仍要齐
{
  const s = createGame({ mode: 'sandbox', year: 1990, companyName: '超前', cash: 5e9 });
  s.tech.unlocked.push('1g');
  const r = startResearch(s, '2g'); // 1991，提前 1 年
  check('1990 年可以立项 1991 的技术', r.ok === true && r.lead === 1, JSON.stringify(r));
  check('预算按成本倍率上浮', researchBudget(s) > Math.round(TECH_MAP['2g'].cost / 24), `${researchBudget(s)}`);
  const s2 = createGame({ mode: 'sandbox', year: 1990, companyName: '超前2', cash: 5e9 });
  const r2 = startResearch(s2, '5g');
  check('前置不齐仍然拦住（5G 需要 4G 链）', r2.ok === false);
}

// 3. 研发完成 → 试制费 → 真正掌握
{
  const s = createGame({ mode: 'sandbox', year: 1990, companyName: '试制', cash: 5e9 });
  s.tech.unlocked.push('1g');
  startResearch(s, '2g');
  s.tech.researching.progress = 99.9;
  tick(s);
  check('超前项目完成后停在试制阶段', s.tech.researching && s.tech.researching.awaitingTrial === true);
  check('未付试制费不算掌握', !s.tech.unlocked.includes('2g'));
  const pay = payResearchTrial(s);
  check('支付试制费后掌握', pay.ok === true && s.tech.unlocked.includes('2g'), pay.msg);
}

// 4. 部门软门槛：1990 也能建半导体部，但更贵
{
  const s = createGame({ mode: 'sandbox', year: 1990, companyName: '建部', cash: 5e9 });
  const cash0 = s.company.cash;
  const r = buildDivision(s, 'chip');
  const spent = cash0 - s.company.cash;
  check('1990 年可建半导体部（无技术积累 +50%）', r.ok === true && r.msg.includes('+50%'), r.msg);
  check('建部成本按 1.5 倍扣除', spent === Math.round(DIVISION_DEFS.chip.buildCost * 1.5), `${spent} / ${DIVISION_DEFS.chip.buildCost}`);
}

// 5. 早期架构可用：1990 年能自研单核 ARM1
{
  const s = createGame({ mode: 'sandbox', year: 1990, companyName: '自研', cash: 5e9 });
  buildDivision(s, 'chip');
  const d = designProduct(s, 'chip', { name: 'M1', bigArch: 'arm1', gpuArch: 'gpu_none', primeN: 0, bigN: 1, littleN: 0, bigGhz: 0.008, gpuCores: 0 });
  check('1990 年自研单核芯片可立项', d.ok === true, d.msg);
  const spec = computeCustomSpec(s, 'chip', { name: 'M1', bigArch: 'arm1', gpuArch: 'gpu_none', primeN: 0, bigN: 1, littleN: 0, bigGhz: 0.008, gpuCores: 0 });
  check('早期架构性能低但不为 0', spec.ok && spec.perf >= 8, `perf=${spec.perf}`);
}

// 6. 工程样品：1-3 年放行、3 年以上硬拦、BOM 与良率付代价
{
  const unlocked2020 = TECHS.filter((t) => t.year <= 2020).map((t) => t.id);
  const base = defaultDesign(2020, unlocked2020);
  const nearCpu = CPUS.find((c) => Number(c.year) > 2020 && Number(c.year) <= 2023);
  const farCpu = CPUS.find((c) => Number(c.year) > 2023);
  const near = JSON.parse(JSON.stringify(base)); near.parts.cpu = nearCpu.id;
  const far = JSON.parse(JSON.stringify(base)); far.parts.cpu = farCpu.id;
  const nearIss = eraAvailability(near, 2020, unlocked2020);
  const farIss = eraAvailability(far, 2020, unlocked2020);
  check('提前 1-3 年按工程样品 warn', nearIss.some((i) => i.level === 'warn') && !nearIss.some((i) => i.level === 'error'));
  check('提前 3 年以上仍 error', farIss.some((i) => i.level === 'error'));
  check('工程样品可量产', validate(near, 2020, { unlocked: unlocked2020 }).ok === true);
  check('leadPartCount 能识别工程样品', leadPartCount(near, 2020) >= 1, `${leadPartCount(near, 2020)}`);
}

// 7. 收购并入技术：整合期满、只转移当年已出现的节点
{
  const apple = COMPETITORS.find((c) => c.id === 'apple');
  const s = createGame({ mode: 'sandbox', year: 2020, companyName: '并购', cash: 2e10 });
  s.tech.unlocked = s.tech.unlocked.filter((id) => !['faceid', 'chip_own', 'ai_imaging'].includes(id));
  check('财报可列技术资产', compTechAssets(apple, 2020).length >= 4, `${compTechAssets(apple, 2020).length} 项`);
  check('技术资产计入收购估值', techAssetValue(apple) > 0, `${techAssetValue(apple)}`);
  openNegotiation(s, 'apple');
  const res = negotiateOffer(s, 'accept');
  const sub = ensureSubsidiaries(s).find((x) => x.id === 'apple');
  check('成交后子公司记录技术资产', !!res && res.ok === true && (sub.techAssets || []).length > 0);
  for (let i = 0; i < 7; i++) tick(s);
  check('整合期满并入已出现的技术', s.tech.unlocked.includes('faceid') && s.tech.unlocked.includes('chip_own'));
  check('尚未出现的未来技术不转移', !s.tech.unlocked.includes('ai_imaging'));
}

console.log(bad ? `\nFAILED: ${bad} 项` : '\n超前研发与并购技术规则全部通过');
process.exit(bad ? 1 : 0);