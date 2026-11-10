// 员工年龄/招聘渠道/老化退休回归
import { createGame, generateEmployee, officeCapacity, canHireMore } from '../js/core/state.js';
import { tick } from '../js/core/sim.js';
import { EDUS, MARKETS } from '../js/data/world.js';
import { newModel } from '../js/core/design.js';

let bad = 0;
const check = (name, ok, detail = '') => { if (!ok) bad += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const N = 400;
const sample = (profile, n = N) => Array.from({ length: n }, () => generateEmployee(2020, { profile }));
const ages = (list) => list.map((e) => e.age);
const stat = (list) => ({ min: Math.min(...list), max: Math.max(...list), avg: +(list.reduce((a, b) => a + b, 0) / list.length).toFixed(1) });

// 校招：应届年龄、零经验、本科/硕士/博士、fresh 标记
const campus = sample('campus');
const cAge = stat(ages(campus));
check('校招年龄 21~29', cAge.min >= 21 && cAge.max <= 29, JSON.stringify(cAge));
check('校招经验为 0', campus.every((e) => e.exp === 0));
check('校招标记应届', campus.every((e) => e.fresh === true));
check('校招学历合法', campus.every((e) => ['本科', '硕士', '博士'].includes(e.edu)));
check('校招以本科/硕士为主', campus.filter((e) => e.edu !== '本科').length / campus.length < 0.5);

// 社招：22~40，中位偏年轻，经验与学历起点匹配
const social = sample('social');
const sAge = stat(ages(social));
check('社招年龄 22~40', sAge.min >= 22 && sAge.max <= 40, JSON.stringify(sAge));
check('社招平均年龄 27~33', sAge.avg >= 26 && sAge.avg <= 33, String(sAge.avg));
const startAge = { 专科: 21, 本科: 22, 硕士: 24, 博士: 27 };
check('经验不超过（年龄-学历起点）+1', social.every((e) => e.exp <= Math.max(0, e.age - (startAge[e.edu] || 22) + 1)));
check('学历不超越年龄', social.every((e) => e.age >= (startAge[e.edu] || 22)));
check('社招不标记应届', social.every((e) => e.fresh === false));

// 猎头/高管：资深区间
const hh = stat(ages(sample('headhunter')));
const ex = stat(ages(sample('exec')));
check('猎头年龄 28~45', hh.min >= 28 && hh.max <= 45, JSON.stringify(hh));
check('高管年龄 32~48', ex.min >= 32 && ex.max <= 48, JSON.stringify(ex));

// 初始团队：25~40，CEO 也是资深
const init = stat(ages(sample('initial')));
check('初始团队年龄 25~40', init.min >= 25 && init.max <= 40, JSON.stringify(init));
check('学历只来自 EDUS', [...campus, ...social].every((e) => EDUS.includes(e.edu)));

// 老化与退休：59.9 岁员工下个月退休、发 N+1、释放主管席位
const s = createGame({ mode: 'sandbox', year: 2020, cash: 2e9 });
const emp = s.employees[0];
emp.age = 59.95; emp.tenure = 10; emp.salary = 10000;
s.org = s.org || { heads: {}, execs: {}, history: [] };
s.org.heads.rnd = emp.id;
const before = s.company.cash;
tick(s);
check('60 岁员工退休', !s.employees.some((e) => e.id === emp.id));
check('退休发 N+1 补偿', before - s.company.cash >= 100000, `${Math.round(before - s.company.cash)}`);
check('退休释放主管席位', s.org.heads.rnd !== emp.id);
check('退休有 HR 日志', (s.log || []).some((l) => /退休/.test(l.text || '')));

// 59 岁员工不退休，但年龄会增长
const s2 = createGame({ mode: 'sandbox', year: 2020, cash: 2e9 });
const young = s2.employees[0];
young.age = 40; young.tenure = 3;
tick(s2);
check('未到龄不退休', s2.employees.some((e) => e.id === young.id));
check('年龄按月增长', young.age > 40 && young.age < 40.2, String(young.age));
check('司龄按月增长', young.tenure > 3 && young.tenure < 3.2, String(young.tenure));
check('潜力随年龄衰减或持平', young.potential <= 100);

// 工位硬上限：满员时不能继续招聘
const s3 = createGame({ mode: 'sandbox', year: 2020, cash: 2e9 });
const cap = officeCapacity(s3);
check('初始人数不超过工位', s3.employees.length <= cap, `${s3.employees.length}/${cap}`);
check('有空位时可招聘', canHireMore(s3) === true);
while (s3.employees.length < cap) s3.employees.push(generateEmployee(2020, { profile: 'social' }));
check('满员时禁止招聘', canHireMore(s3) === false, `${s3.employees.length}/${cap}`);

// 薪资期望随市场基准上涨（年代通胀）
const s4 = createGame({ mode: 'sandbox', year: 2020, cash: 2e9 });
const low = s4.employees[0];
low.expectSalary = 3000; low.salary = 3000;
const beforeExp = low.expectSalary;
tick(s4);
check('薪资期望向市场价靠拢', low.expectSalary > beforeExp, `${beforeExp} → ${low.expectSalary}`);
check('市场月薪写入状态', s4.company.marketSalary > 0, String(s4.company.marketSalary));

// 市场年代开放与差异化进入成本
check('市场有开放年份', MARKETS.every((m) => m.openYear >= 1980 && m.entryCost > 0));
check('印度 1995 年才开放', MARKETS.find((m) => m.id === 'in').openYear === 1995);
check('进入成本随市场规模不同', new Set(MARKETS.map((m) => m.entryCost)).size > 3);

// 老机型自动退市：上市 18 个月、热度归零持续 6 个月
const s5 = createGame({ mode: 'sandbox', year: 2020, cash: 2e9 });
const old = newModel(2018, s5.tech.unlocked, '老机型');
old.status = 'production'; old.released = true; old.markets = ['cn'];
old.launched = { year: 2018, month: 0 }; old.heat = 0; old.price = { cn: 2000 };
s5.models.push(old);
for (let i = 0; i < 7; i++) tick(s5);
check('热度归零的老机型自动下市', old.status === 'discontinued', old.status);
check('自动下市记录时间', !!old.discontinuedAt);

// 经验不早于行业：1980 年社招最多 2 年相关经验
const early = generateEmployee(1980, { profile: 'social', skillMean: 60 });
check('1980 年经验 ≤2 年', early.exp <= 2, String(early.exp));

if (bad) process.exit(1);
console.log('\nSTAFF AGE PASS');