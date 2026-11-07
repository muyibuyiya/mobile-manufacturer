// 完整玩法回归：2010 开局 → 设计 → 量产 → 排产 → 定价 → 24 个月经营
const BASE = 'http://127.0.0.1:9222';
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const PREFIX = process.argv[3] || '.tmp/pt';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const tabs = await (await fetch(BASE + '/json/list')).json();
  const tab = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const errors = [];
  const logs = [];

  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled') logs.push('[' + m.params.type + '] ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL });
  await sleep(1500);
  logs.length = 0; errors.length = 0; // 丢弃 DevTools 重放的上一次页面日志与异常

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) errors.push('eval: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    return r.result?.result?.value;
  };
  const shot = async (n) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    if (r.result?.data) (await import('node:fs')).writeFileSync(`${PREFIX}-${n}.png`, Buffer.from(r.result.data, 'base64'));
  };

  await ev("localStorage.clear()");
  await send('Page.reload'); await sleep(1400);
  errors.length = 0; logs.length = 0;

  await ev("[...document.querySelectorAll('.menu-item')].find(x=>x.textContent.includes('经营模式')).click()"); await sleep(200);
  await ev("(()=>{const y=document.querySelector('#f-year');y.value='2010';y.dispatchEvent(new Event('change'));document.querySelector('#f-name').value='启明科技';return y.value})()");
  await shot('00-config');
  await ev("document.querySelector('#start').click()"); await sleep(800);
  console.log('mounted:', await ev("!!document.querySelector('.game')"));

  // 进入设计器
  await ev("document.querySelector('[data-tab=product]').click()"); await sleep(200);
  await ev("document.querySelector('[data-act=create-model]').click()"); await sleep(900);
  const initial = await ev("document.querySelector('.ring span')?.textContent");
  console.log('design score:', initial);
  await shot('01-designer-2d');
  await ev("document.querySelectorAll('[data-vm]')[1].click()"); await sleep(1200);
  await shot('02-designer-3d');

  // 调整参数：厚度 8.0，屏幕 6.5，边框 1.6
  await ev("(()=>{const set=(k,v)=>{const e=document.querySelector(`[data-k=\"${k}\"]`);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}))};set('body.thickness',8.0);set('screen.bezel',1.8);return true})()");
  await sleep(500);
  await shot('03-designer-tuned');

  await ev("document.querySelector('#dz-save').click()"); await sleep(600);
  console.log('issues visible:', await ev("document.querySelectorAll('.issue.error').length"));

  // 量产
  const launched = await ev("(()=>{const b=[...document.querySelectorAll('[data-act=launch]')];if(!b.length)return 'no-button';b[0].click();return b[0].disabled?'disabled':'clicked'})()");
  console.log('launch:', launched);
  await sleep(600);
  await shot('04-products');

  // 排产 3 万台
  await ev("document.querySelector('[data-tab=supply]').click()"); await sleep(300);
  const prod = await ev("(()=>{const i=document.querySelector('[data-field=target]');if(!i)return 'none';i.value=30000;i.dispatchEvent(new Event('change',{bubbles:true}));return i.value})()");
  console.log('production target:', prod);
  await shot('05-supply');

  // 定价
  await ev("document.querySelector('[data-tab=market]').click()"); await sleep(300);
  const priceInfo = await ev("(()=>{const i=document.querySelector('[data-field=price]');return i?i.value:'none'})()");
  console.log('price:', priceInfo);
  await ev("document.querySelector('[data-act=open-stage]').click()"); await sleep(1800);
  await shot('06-stage');
  const stageOk = await ev("!!document.querySelector('#stage-scene canvas')");
  console.log('stage canvas:', stageOk);
  // 完成发布会（量产机型必须发布后才能销售）
  await ev("document.querySelector('#stage-start').click()"); await sleep(300);
  await ev("document.querySelector('[data-guess]').click()"); await sleep(250);
  await ev("document.querySelector('[data-pitch]').click()"); await sleep(400);
  await ev("document.querySelector('#stage-done').click()"); await sleep(400);
  await shot('06-market');

  // 推进 24 个月
  for (let i = 0; i < 24; i++) {
    await ev("document.querySelector('[data-act=advance]').click()");
    await sleep(45);
  }
  await sleep(500);
  console.log('date:', await ev("document.querySelector('.stat-inline .v').textContent"));
  console.log('cash:', await ev("[...document.querySelectorAll('.stat-inline')].map(x=>x.textContent).join(' | ')"));
  await shot('07-after-24m');

  await ev("document.querySelector('[data-tab=overview]').click()"); await sleep(400);
  await shot('08-overview-24m');

  await ev("document.querySelector('[data-tab=market]').click()"); await sleep(300);
  await shot('09-market-24m');

  await ev("document.querySelector('[data-tab=finance]').click()"); await sleep(300);
  await shot('10-finance');

  await ev("document.querySelector('[data-tab=rivals]').click()"); await sleep(300);
  await shot('11-rivals');

  await ev("document.querySelector('[data-tab=hq]').click()"); await sleep(1300);
  await shot('12-hq');

  // 园区：买地 → 建研发中心 → 查看施工
  await ev("document.querySelector('[data-tab=hq]').click()"); await sleep(600);
  const buyPlot = await ev("(()=>{const b=document.querySelector('[data-act=buy-plot]');if(!b)return 'none';b.click();return 'clicked'})()");
  console.log('buy plot:', buyPlot); await sleep(400);
  await ev("(()=>{const b=document.querySelector('[data-act=open-build]');if(b)b.click();return true})()"); await sleep(400);
  await shot('15-build-modal');
  const built = await ev("(()=>{const card=[...document.querySelectorAll('.build-card')].find(c=>c.textContent.includes('研发中心'));if(!card)return 'none';const b=card.querySelector('[data-act=build]');if(!b)return 'nobtn';b.click();return b.disabled?'disabled':'clicked'})()");
  console.log('build rnd:', built); await sleep(500);
  await shot('16-hq-building');

  // 员工培训
  await ev("document.querySelector('[data-tab=company]').click()"); await sleep(400);
  await shot('17-company');
  await ev("(()=>{const b=document.querySelector('[data-act=open-train]');if(b)b.click();return true})()"); await sleep(400);
  await shot('18-train-modal');
  const trained = await ev("(()=>{const b=[...document.querySelectorAll('[data-act=train]')][0];if(!b)return 'none';b.click();return b.disabled?'disabled':'clicked'})()");
  console.log('train:', trained); await sleep(400);

  // 采购元器件
  await ev("document.querySelector('[data-tab=supply]').click()"); await sleep(400);
  const ordered = await ev("(()=>{const b=document.querySelector('[data-act=order-comp]');if(!b)return 'none';b.click();return 'clicked'})()");
  console.log('order components:', ordered); await sleep(400);
  await shot('19-supply-components');

  // 科技立项
  await ev("document.querySelector('[data-tab=tech]').click()"); await sleep(300);
  const ready = await ev("[...document.querySelectorAll('.tech-node.ready')].length");
  console.log('researchable nodes:', ready);
  if (ready) { await ev("document.querySelector('.tech-node.ready').click()"); await sleep(300); }
  await shot('13-tech');

  // 设置页
  await ev("document.querySelector('[data-act=open-gamemenu]').click()"); await sleep(300);
  await shot('14-gamemenu');
  await ev("document.querySelector('.modal-mask [data-close]').click()"); await sleep(200);

  await sleep(2300); // 等 queueAutoSave 的 2 秒 debounce 落盘
  const state = await ev("(()=>{const s=JSON.parse(localStorage.getItem('mobile_manufacturer_save_v5_auto')||localStorage.getItem('mm_autosave')||'null'); if(!s)return null; return {cash:Math.round(s.company.cash), brand:+s.company.brand.toFixed(1), models:s.models.map(m=>({name:m.name,status:m.status,released:!!m.released,sold:m.sold,rev:Math.round(m.revenue)})), hist:s.history.slice(-3), histLen:s.history.length, q:s.historyArchive?.length||0}})()");
  console.log('state:', JSON.stringify(state));

  console.log('\n--- logs ---');
  logs.filter((l) => l.includes('NAN')).slice(0, 6).forEach((l) => console.log(l.slice(0, 500)));
  console.log('\n--- errors ---');
  errors.slice(0, 10).forEach((e) => console.log(e));
  if (!errors.length) console.log('(none)');
  ws.close();
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
