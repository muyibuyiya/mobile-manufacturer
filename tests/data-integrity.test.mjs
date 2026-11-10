// 数据完整性 + 年代硬锁单测（第 33 轮）
// 1) 所有零件表的 tech 必须在科技树中存在、year 必须有效、id 在表内唯一
// 2) 镜头焦段都能找到至少一款适用传感器
// 3) eraAvailability / validate 能拦截「未来零件」与「未解锁科技」
import { TECHS, TECH_MAP } from '../js/data/tech.js';
import {
  CPUS, RAMS, STORAGES, SCREENS, CAMERAS, BATTERIES, SYSTEMS, EXTRAS, CHARGERS,
} from '../js/data/parts.js';
import {
  IMAGE_SENSORS, LENS_TYPES, CPU_CORES, GPU_ARCHS, OS_BASES, PANEL_VENDORS, RES_TIERS,
} from '../js/data/hardware.js';
import { CPU_DB } from '../js/data/cpu-db.js';
import { COMPETITORS, RIVAL_SIGNATURES, RIVAL_SIGNATURE_MAP } from '../js/data/world.js';
import { defaultDesign, eraAvailability, validate } from '../js/core/design.js';

let bad = 0;
const check = (name, ok, detail = '') => {
  if (!ok) bad += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const idsUnique = (list) => new Set(list.map((x) => x.id)).size === list.length;

const TABLES = [
  ['CPUS', CPUS],
  ['RAMS', RAMS],
  ['STORAGES', STORAGES],
  ['SCREENS', SCREENS],
  ['CAMERAS', CAMERAS],
  ['BATTERIES', BATTERIES],
  ['SYSTEMS', SYSTEMS],
  ['EXTRAS', EXTRAS],
  ['CHARGERS.wired', CHARGERS.wired],
  ['CHARGERS.wireless', CHARGERS.wireless],
  ['CHARGERS.proto', CHARGERS.proto],
  ['IMAGE_SENSORS', IMAGE_SENSORS],
  ['LENS_TYPES', LENS_TYPES],
  ['CPU_CORES', CPU_CORES],
  ['GPU_ARCHS', GPU_ARCHS],
  ['OS_BASES', OS_BASES],
  ['PANEL_VENDORS', PANEL_VENDORS],
  ['RES_TIERS', RES_TIERS],
];

for (const [name, list] of TABLES) {
  check(`${name} 非空`, Array.isArray(list) && list.length > 0, `${list.length} 条`);
  check(`${name} id 唯一`, idsUnique(list));
  const missingTech = list.filter((x) => x.tech && !TECH_MAP[x.tech]);
  check(`${name} tech 均存在于科技树`, missingTech.length === 0, missingTech.map((x) => `${x.id}→${x.tech}`).join(','));
  const badYear = list.filter((x) => !Number.isFinite(Number(x.year)));
  check(`${name} year 均为有效数字`, badYear.length === 0, badYear.map((x) => x.id).join(','));
}

// 面板发光材料世代
for (const pv of PANEL_VENDORS) {
  const gens = pv.gens || [];
  check(`${pv.id} 世代 id 唯一`, new Set(gens.map((g) => g.id)).size === gens.length);
  check(`${pv.id} 世代 year 有效`, gens.every((g) => Number.isFinite(Number(g.year))));
}

// CPU 数据库与零件表同源（只做了名称映射，数量与 id 必须一一对应）
check('CPUS 与 CPU_DB 数量一致', CPUS.length === CPU_DB.length, `${CPUS.length} / ${CPU_DB.length}`);
check('CPUS 与 CPU_DB id 集合一致',
  CPUS.every((c, i) => c.id === CPU_DB[i].id));

// 每个镜头焦段至少有一款传感器（roles 覆盖；潜望在传感器库里的标签是「潜望」）
for (const lt of LENS_TYPES) {
  const role = lt.id === 'periscope' ? '潜望' : lt.name;
  const n = IMAGE_SENSORS.filter((s) => (s.roles || []).includes(role)).length;
  check(`镜头「${lt.name}」有可用传感器`, n > 0, `${n} 款`);
}

// 竞品招牌能力覆盖
{
  const missing = COMPETITORS.filter((c) => !RIVAL_SIGNATURE_MAP[c.id]);
  check('16 家竞品均有招牌能力', missing.length === 0, missing.map((c) => c.id).join(','));
  const badSig = COMPETITORS.filter((c) => !RIVAL_SIGNATURES[RIVAL_SIGNATURE_MAP[c.id]]);
  check('招牌能力定义存在', badSig.length === 0, badSig.map((c) => c.id).join(','));
}

// ---------- 年代硬锁 ----------
const unlocked2020 = TECHS.filter((t) => t.year <= 2020).map((t) => t.id);
const d2020 = defaultDesign(2020, unlocked2020);
const okIssues = eraAvailability(d2020, 2020, unlocked2020);
check('2020 年默认设计无可用性问题', okIssues.length === 0, okIssues.map((i) => i.text).join(' / '));

// 超出 3 年窗口：仍然硬拦截
const farCpu = CPUS.find((c) => Number(c.year) > 2023);
check('存在超前 3 年以上的处理器用于测试', !!farCpu, farCpu ? `${farCpu.year}` : '');
const farDesign = JSON.parse(JSON.stringify(d2020));
farDesign.parts.cpu = farCpu.id;
const farIssues = eraAvailability(farDesign, 2020, unlocked2020);
check('超出窗口的未来处理器被硬锁拦截', farIssues.some((i) => i.level === 'error' && i.text.includes('处理器')),
  farIssues.map((i) => i.text).join(' / '));
const vFar = validate(farDesign, 2020, { unlocked: unlocked2020 });
check('超出窗口 validate 为 error 且不可量产', !vFar.ok && vFar.issues.some((i) => i.level === 'error'));

// 提前 1~3 年：按工程样品放行，但要求 warn 且可量产
const nearCpu = CPUS.find((c) => Number(c.year) > 2020 && Number(c.year) <= 2023);
check('存在 1~3 年窗口的处理器用于测试', !!nearCpu, nearCpu ? `${nearCpu.year}` : '');
const nearDesign = JSON.parse(JSON.stringify(d2020));
nearDesign.parts.cpu = nearCpu.id;
const nearIssues = eraAvailability(nearDesign, 2020, unlocked2020);
check('工程样品按 warn 放行', nearIssues.some((i) => i.level === 'warn' && i.text.includes('工程样品')) && !nearIssues.some((i) => i.level === 'error'),
  nearIssues.map((i) => i.text).join(' / '));
const vNear = validate(nearDesign, 2020, { unlocked: unlocked2020 });
check('工程样品仍可量产', vNear.ok === true, vNear.issues.filter((i) => i.level === 'error').map((i) => i.text).join(' / '));

const unlocked2010 = TECHS.filter((t) => t.year <= 2010).map((t) => t.id);
const techIssues = eraAvailability(d2020, 2020, unlocked2010);
check('硬锁拦截未解锁科技', techIssues.length > 0, techIssues.slice(0, 2).map((i) => i.text).join(' / '));

const sandboxIssues = validate(futureDesign, 2020, { ignoreEra: true, unlocked: TECHS.map((t) => t.id) });
check('ignoreEra 沙盒跳过年代硬锁', sandboxIssues.issues.every((i) => !i.text.includes('年才可用')));

console.log(`\n${bad ? `FAILED: ${bad} 项` : 'ALL PASS'}`);
process.exit(bad ? 1 : 0);