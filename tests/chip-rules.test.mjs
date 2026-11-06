// 第二十一轮验收：芯片核心互斥规则（computeCustomSpec）
import { computeCustomSpec } from '../js/core/divisions.js';

const state = { date: { year: 2025 }, divisions: { chip: { level: 3 } } };
let fails = 0;
const check = (name, form, expectOk, expectWord) => {
  const r = computeCustomSpec(state, 'chip', form);
  const ok = !!r?.ok;
  const pass = ok === expectOk && (!expectWord || (!ok && r.errors.some((e) => e.includes(expectWord))));
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${pass ? '' : ` → ok=${ok} errors=${r?.errors?.join(' | ')}`}`);
  if (!pass) fails++;
  return r;
};

const base = { name: '玄戒', gpuArch: 'mali_g720', gpuCores: 10 };

// ① 正常同代：X4(2023)+A720(2023)+A520(2023)
check('同代 X4+A720+A520 通过', { ...base, primeArch: 'x4', primeN: 1, primeGhz: 3.3, bigArch: 'a720', bigN: 5, bigGhz: 2.8, littleArch: 'a520', littleN: 2, littleGhz: 1.8 }, true);
// ② 跨代混搭：X4(2023)+A78(2020)+A55(2017) 跨 6 年
check('X4+A78+A55 跨代拒绝', { ...base, primeArch: 'x4', primeN: 1, primeGhz: 3.3, bigArch: 'a78', bigN: 5, bigGhz: 2.8, littleArch: 'a55', littleN: 2, littleGhz: 1.8 }, false, '跨代');
// ③ 跨代上限兼容：X1(2020)+A78(2020)+A55(2017) 跨 3 年（骁龙 888 真实构成）
check('X1+A78+A55 跨3年通过(888)', { ...base, primeArch: 'x1', primeN: 1, primeGhz: 2.9, bigArch: 'a78', bigN: 3, bigGhz: 2.5, littleArch: 'a55', littleN: 4, littleGhz: 1.8 }, true);
// ④ 自研与公版混排：Oryon(2024)+A78(2020)
check('Oryon+A78 混排拒绝', { ...base, primeArch: 'oryon', primeN: 1, primeGhz: 3.8, bigArch: 'a78', bigN: 5, bigGhz: 2.8, littleArch: 'a55', littleN: 2, littleGhz: 1.8 }, false, '混排');
// ⑤ 全自研无小核：Oryon(2024)+Taishan(2023)+无小核（骁龙 8 至尊版 2+6）
const r5 = check('Oryon+泰山 无小核通过', { ...base, primeArch: 'oryon', primeN: 2, primeGhz: 3.8, bigArch: 'taishan', bigN: 6, bigGhz: 2.4, littleArch: '', littleN: 0 }, true);
if (r5?.ok && !r5.cores.includes('+') === false) { /* cores 含小核段则异常 */ }
if (r5?.ok && /小/.test(r5.cores)) console.log('FAIL 无小核 cores 串不应含小核:', r5.cores), fails++;
else if (r5?.ok) console.log(`  cores=${r5.cores} · perf=${r5.perf}`);
// ⑥ 2025 全自研新一代：C1-Ultra+C1-Premium+C1-Nano
check('C1 全系同代通过', { ...base, primeArch: 'c1_ultra', primeN: 2, primeGhz: 4.2, bigArch: 'c1_prem', bigN: 4, bigGhz: 3.2, littleArch: 'c1_nano', littleN: 2, littleGhz: 1.9 }, true);
// ⑦ 未发布架构：Oryon 三代(2025) 在 2024 年不可用
const state24 = { date: { year: 2024 }, divisions: { chip: { level: 3 } } };
const r7 = computeCustomSpec(state24, 'chip', { ...base, primeArch: 'oryon3', primeN: 2, primeGhz: 4.0, bigArch: 'taishan', bigN: 4, bigGhz: 2.4, littleArch: '', littleN: 0 });
const p7 = !r7.ok && r7.errors.some((e) => e.includes('尚未发布'));
console.log(`${p7 ? 'PASS' : 'FAIL'} 未发布架构拦截（2024 年选 Oryon 三代）`);
if (!p7) fails++;

console.log(fails ? `\n${fails} 项失败` : '\n芯片互斥规则全部通过');
process.exit(fails ? 1 : 0);
