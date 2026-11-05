// 新系统界面截图：园区建造 / 员工培训 / 元器件 / 拆解视图
const BASE = 'http://127.0.0.1:9222';
const URL = process.argv[2] || 'http://127.0.0.1:8124/index.html';
const PREFIX = process.argv[3] || '.tmp/nf';
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
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL });
  await sleep(1500);
  errors.length = 0;

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
  errors.length = 0;

  // 沙盒开局 2020
  await ev("document.querySelector('[data-mode=sandbox]').click()"); await sleep(300);
  await ev("(()=>{const y=document.querySelector('#f-year');y.value='2020';y.dispatchEvent(new Event('change'));document.querySelector('#f-name').value='启明科技';return true})()");
  await ev("document.querySelector('#start').click()"); await sleep(900);
  console.log('mounted:', await ev("!!document.querySelector('.game')"));

  // 员工：滚动到名册
  await ev("document.querySelector('[data-tab=company]').click()"); await sleep(400);
  await ev("document.querySelector('#content').scrollTop = 520"); await sleep(300);
  await shot('01-company-roster');

  // 园区：买地 + 建造弹窗
  await ev("document.querySelector('[data-tab=hq]').click()"); await sleep(1200);
  await ev("(()=>{const b=document.querySelector('[data-act=buy-plot]');if(b)b.click();return true})()"); await sleep(500);
  await ev("(()=>{const b=document.querySelector('[data-act=open-build]');if(b)b.click();return true})()"); await sleep(500);
  await shot('02-build-modal');
  await ev("document.querySelector('.modal-mask [data-close]').click()"); await sleep(200);

  // 建一座工厂，推进 5 个月看施工完成
  await ev("(()=>{const b=document.querySelector('[data-act=open-build]');if(b)b.click();return true})()"); await sleep(400);
  await ev("(()=>{const card=[...document.querySelectorAll('.build-card')].find(c=>c.textContent.includes('生产基地'));const b=card&&card.querySelector('[data-act=build]');if(b)b.click();return b?'clicked':'none'})()");
  await sleep(400);
  for (let i = 0; i < 5; i++) { await ev("document.querySelector('[data-act=advance]').click()"); await sleep(80); }
  await sleep(600);
  await shot('03-hq-built');
  console.log('capex:', await ev("[...document.querySelectorAll('.stat-inline')].map(x=>x.textContent).join(' | ')"));

  // 供应链
  await ev("document.querySelector('[data-tab=supply]').click()"); await sleep(400);
  await shot('04-supply');

  // 设计器：3D + 拆解
  await ev("document.querySelector('[data-tab=product]').click()"); await sleep(300);
  await ev("(()=>{const b=document.querySelector('[data-act=design]');if(b)b.click();return !!b})()"); await sleep(900);
  await ev("document.querySelectorAll('[data-vm]')[1].click()"); await sleep(1000);
  await ev("(()=>{const b=document.querySelector('#btn-explode');if(b)b.click();return !!b})()");
  await sleep(2200);
  await shot('05-teardown');
  console.log('explode button:', await ev("document.querySelector('#btn-explode')?.className"));

  console.log('\n--- errors ---');
  errors.slice(0, 8).forEach((e) => console.log(e));
  if (!errors.length) console.log('(none)');
  ws.close();
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
