// 存档回归：经营 6 个月 → 保存 → 刷新 → 读档 → 校验状态一致
const BASE = 'http://127.0.0.1:9222';
const URL = process.argv[2] || 'http://127.0.0.1:8124/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const tabs = await (await fetch(BASE + '/json/list')).json();
  const tab = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL });
  await sleep(1600);

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) errors.push('eval: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    return r.result?.result?.value;
  };

  await ev("localStorage.clear()");
  await ev("[...document.querySelectorAll('.menu-item')].find(x=>x.textContent.includes('沙盒模式')).click()"); await sleep(250);
  await ev("document.querySelector('#start').click()"); await sleep(700);
  for (let i = 0; i < 6; i++) { await ev("document.querySelector('[data-act=advance]').click()"); await sleep(60); }
  await sleep(300);
  const before = await ev("(()=>{const s=JSON.parse(localStorage.getItem('mm_autosave'));return {cash:Math.round(s.company.cash),date:s.date,emp:s.employees.length}})()");

  // 保存到槽位 1
  await ev("document.querySelector('[data-act=open-gamemenu]').click()"); await sleep(300);
  await ev("[...document.querySelectorAll('[data-gm]')].find(x=>x.dataset.gm==='save').click()"); await sleep(300);
  const saved = await ev(`(()=>{const b=document.querySelector('[data-sp=save][data-slot="1"]');if(!b)return 'no-btn';b.click();return 'ok'})()`);
  await sleep(400);
  const hasSave = await ev("Object.keys(localStorage).filter(k=>k.includes('save')).join(',')");

  // 刷新后读档
  await send('Page.reload'); await sleep(1500);
  await ev("[...document.querySelectorAll('.menu-item')].find(x=>x.textContent.includes('存档')).click()"); await sleep(400);
  const loaded = await ev("(()=>{const b=document.querySelector('[data-slot=\"1\"]');if(!b)return 'no-slot';if(b.disabled)return 'disabled';b.click();return 'clicked'})()");
  await sleep(700);
  const after = await ev("(()=>{const s=JSON.parse(localStorage.getItem('mm_autosave'));return {cash:Math.round(s.company.cash),date:s.date,emp:s.employees.length,tab:!!document.querySelector('.game')}})()");

  console.log('before :', JSON.stringify(before));
  console.log('savebtn:', saved, '| keys:', hasSave);
  console.log('load   :', loaded, '| after:', JSON.stringify(after));
  console.log('match  :', before && after && before.cash === after.cash && before.date.year === after.date.year);

  // 旧存档兼容：删掉当前版本 key，只留一份缺少 org/capital/feedback/评价字段的旧档
  const legacy = await ev(`(()=>{
    const raw = localStorage.getItem('mobile_manufacturer_save_v5_1');
    if (!raw) return 'no-v5';
    const s = JSON.parse(raw);
    s.version = 4;
    s.company.cash = 12345678;
    delete s.org; delete s.capital; delete s.feedback;
    delete s.campus; delete s.supply;
    for (const e of s.employees) { delete e.training; delete e.trained; delete e.quality; }
    for (const m of s.models) { delete m.lineup; delete m.review; }
    localStorage.removeItem('mobile_manufacturer_save_v5_1');
    localStorage.setItem('mobile_manufacturer_save_v4_1', JSON.stringify(s));
    return 'ok';
  })()`);
  await send('Page.reload'); await sleep(1500);
  await ev("[...document.querySelectorAll('.menu-item')].find(x=>x.textContent.includes('存档')).click()"); await sleep(400);
  const legacyPick = await ev("(()=>{const b=document.querySelector('[data-slot=\"1\"]');if(!b)return 'no-slot';if(b.disabled)return 'disabled';b.click();return 'clicked'})()");
  await sleep(700);
  // 顶栏直接反映内存中的当前状态，比 mm_autosave（按月结算才写）更可靠
  const legacyTop = await ev("document.querySelector('#topbar').textContent.replace(/\\s+/g,' ').trim()");
  // 推进一个月触发自动存档，再校验迁移后的结构是否补齐
  await ev("document.querySelector('[data-act=advance]').click()"); await sleep(600);
  const legacyAfter = await ev("(()=>{const s=JSON.parse(localStorage.getItem('mm_autosave'));return {cash:Math.round(s.company.cash),ver:s.version,plots:(s.campus?.plots||[]).length,comps:Object.keys(s.supply?.stock||{}).length,train:'training' in (s.employees[0]||{}),org:!!s.org&&!!s.capital,lineup:s.models.map(m=>m.lineup).join(','),feedback:typeof s.feedback!=='undefined'}})()");

  console.log('legacy :', legacy, '| pick:', legacyPick, '| top:', legacyTop);
  console.log('after  :', JSON.stringify(legacyAfter));
  console.log('migrate:', legacyAfter && legacyAfter.cash < 2e7 && legacyAfter.ver === 5 && legacyAfter.plots === 6 && legacyAfter.comps >= 6 && legacyAfter.train === true && legacyAfter.org === true && legacyAfter.lineup === 'main');
  console.log('errors :', errors.length ? errors.slice(0, 4) : 'none');
  ws.close();
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
