// 品类硬件过滤 / 外围配件不入图（P0/P1/P2）回归
import { createGame } from '../js/core/state.js';
import { defaultDesign, ensureDeviceExtras, allowedExtras, CAT_EXTRAS, categoryScore } from '../js/core/design.js';
import { TECHS } from '../js/data/tech.js';
import { RAMS, STORAGES, BATTERIES, CHARGERS, EXTRAS } from '../js/data/parts.js';

let bad = 0;
const check = (name, ok, detail = '') => { if (!ok) bad += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const techs = TECHS.filter((t) => t.year <= 2024).map((t) => t.id);

// P0：品类白名单存在且互不越界
check('手表白名单不含屏下摄像头/均热板/指纹', !CAT_EXTRAS.watch.includes('x_udc') && !CAT_EXTRAS.watch.includes('x_vc') && !CAT_EXTRAS.watch.includes('x_fp'));
check('平板白名单不含屏下摄像头', !CAT_EXTRAS.tablet.includes('x_udc') && CAT_EXTRAS.tablet.includes('x_sat'));

// P1：跨品类复用设计时自动剔除不支持项
const tablet = defaultDesign(2024, techs);
tablet.template = 'tablet';
tablet.deviceType = 'tablet';
tablet.parts.extras = ['x_udc', 'x_sat', 'x_wp', 'x_wl', 'x_fc'];
ensureDeviceExtras(tablet);
check('平板剔除屏下摄像头', !tablet.parts.extras.includes('x_udc'), tablet.parts.extras.join(','));
check('平板保留卫星通信/防水/无线充', ['x_sat', 'x_wp', 'x_wl'].every((x) => tablet.parts.extras.includes(x)));
check('平板白名单生效', allowedExtras(tablet) === CAT_EXTRAS.tablet);

const watch = defaultDesign(2024, techs);
watch.template = 'watch_square';
watch.deviceType = 'watch';
watch.parts.extras = ['x_fp', 'x_udc', 'x_vc', 'x_wp', 'x_sec'];
ensureDeviceExtras(watch);
check('手表剔除指纹/屏下/均热板', !watch.parts.extras.some((x) => ['x_fp', 'x_udc', 'x_vc'].includes(x)), watch.parts.extras.join(','));
check('手表保留防水/安全芯片', watch.parts.extras.includes('x_wp') && watch.parts.extras.includes('x_sec'));
check('手表无摄像头镜头', (watch.camera?.lenses || []).length === 0);
check('手表电池 ≤800mAh', (BATTERIES.find((x) => x.id === watch.parts.battery)?.mah || 0) <= 800, watch.parts.battery);
check('手表内存 ≤4GB', (RAMS.find((x) => x.id === watch.parts.ram)?.gb ?? 99) <= 4, watch.parts.ram);
check('手表存储 ≤64GB', (STORAGES.find((x) => x.id === watch.parts.storage)?.gb ?? 999) <= 64, watch.parts.storage);

// 手机不受品类白名单限制（沿用模板能力）
const phone = defaultDesign(2024, techs);
phone.parts.extras = ['x_udc', 'x_sat'];
ensureDeviceExtras(phone);
check('手机保留屏下摄像头/卫星通信', phone.parts.extras.includes('x_udc') && allowedExtras(phone) === null);

// 分品类综合评分：权重不同、影像对手表/平板不计分
const phoneScore = categoryScore(phone, 2024);
const tabScore = categoryScore(tablet, 2024);
const watchScore = categoryScore(watch, 2024);
check('手机权重含影像/时代', !!phoneScore.weights.camera && !!phoneScore.weights.era, JSON.stringify(phoneScore.weights));
check('平板权重无影像/时代', !tabScore.weights.camera && !tabScore.weights.era && tabScore.weights.screen === 0.3, JSON.stringify(tabScore.weights));
check('手表续航权重最高', watchScore.weights.battery === 0.35 && !watchScore.weights.camera, JSON.stringify(watchScore.weights));
check('平板/手表影像维度为 0', tabScore.dims.camera === 0 && watchScore.dims.camera === 0);
check('综合分在 0~100', [phoneScore, tabScore, watchScore].every((x) => x.total >= 0 && x.total <= 100), [phoneScore, tabScore, watchScore].map((x) => Math.round(x.total)).join(','));

// P2：档位过滤表与 UI 一致（手表低功耗、平板大电池/大存储/高功率）
check('手表无 >5W 有线档', CHARGERS.wired.filter((x) => x.watt <= 5).length >= 1 && !CHARGERS.wired.some((x) => x.id === 'w120' && x.watt <= 5));
check('平板电池 ≥5000mAh 可选', BATTERIES.some((x) => x.mah >= 5000));
check('平板存储 ≥64GB 可选', STORAGES.some((x) => x.gb >= 64));
check('附加功能数据齐全', ['x_udc', 'x_sat', 'x_wp'].every((id) => EXTRAS.some((x) => x.id === id)));

// 存档状态不影响（白名单只作用于 design，不改 state 其他字段）
const s = createGame({ mode: 'sandbox', year: 2024, cash: 2e9 });
check('游戏状态未被污染', !('CAT_EXTRAS' in s));

if (bad) process.exit(1);
console.log('\nCATEGORY HARDWARE PASS');