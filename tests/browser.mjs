// 通过 CDP 驱动无头 Chrome 做端到端检查：加载、开始游戏、切换页面、打开设计器、截图
const BASE = 'http://127.0.0.1:9222';
const url = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const outPrefix = process.argv[3] || 'shot';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const tabs = await (await fetch(BASE + '/json/list')).json();
  let tab = tabs.find((t) => t.type === 'page');
  if (!tab) tab = await (await fetch(BASE + '/json/new?' + encodeURIComponent('about:blank'), { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const logs = [];
  const errors = [];

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.consoleAPICalled') {
      logs.push(`[${msg.params.type}] ` + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      errors.push('[network] ' + msg.params.entry.text + ' ' + (msg.params.entry.url || ''));
    }
  };
  await new Promise((r) => (ws.onopen = r));

  const send = (method, params = {}) => new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await sleep(1600);

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) errors.push('eval: ' + (r.result.exceptionDetails.exception?.description || ''));
    return r.result?.result?.value;
  };

  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    if (r.result?.data) {
      const fs = await import('node:fs');
      fs.writeFileSync(`${outPrefix}-${name}.png`, Buffer.from(r.result.data, 'base64'));
    }
  };

  console.log('title:', await ev('document.title'));
  console.log('menu cards:', await ev("document.querySelectorAll('.mode-card').length"));
  await shot('01-menu');

  // 进入经营模式
  await ev("[...document.querySelectorAll('.menu-item')].find(x=>x.textContent.includes('经营模式')).click()");
  await sleep(300);
  console.log('config form:', await ev("!!document.querySelector('#f-name')"));
  await shot('02-config');

  await ev("document.querySelector('#start').click()");
  await sleep(900);
  console.log('game mounted:', await ev("!!document.querySelector('.game')"));
  console.log('nav items:', await ev("document.querySelectorAll('.nav-item').length"));
  console.log('kpi count:', await ev("document.querySelectorAll('.kpi').length"));
  await shot('03-overview');

  // 推进 12 个月
  for (let i = 0; i < 12; i++) {
    await ev("document.querySelector('[data-act=advance]').click()");
    await sleep(60);
  }
  await sleep(400);
  console.log('after 12m cash:', await ev("document.querySelector('.stat-inline .v')?.textContent"));
  await shot('04-after-12m');

  // 新建机型 -> 设计器
  await ev("document.querySelector('[data-tab=product]').click()");
  await sleep(300);
  await ev("document.querySelector('[data-act=create-model]').click()");
  await sleep(900);
  console.log('designer:', await ev("!!document.querySelector('.designer')"));
  console.log('2d canvas:', await ev("(()=>{const c=document.querySelector('#dz-2d');return c?c.width+'x'+c.height:'none'})()"));
  await shot('05-designer-2d');

  // 3D
  await ev("document.querySelectorAll('[data-vm]')[1].click()");
  await sleep(1200);
  console.log('3d canvas:', await ev("(()=>{const c=document.querySelector('.dz-canvas-wrap canvas:last-child');return c?c.width+'x'+c.height:'none'})()"));
  console.log('webgl ctx:', await ev("(()=>{const c=document.querySelectorAll('.dz-canvas-wrap canvas');const last=c[c.length-1];return last? (last.getContext('webgl2')?'webgl2':(last.getContext('webgl')?'webgl':'none')) : 'none'})()"));
  await shot('06-designer-3d');

  // 改一个参数看是否同步
  await ev("(()=>{const r=document.querySelector('[data-k=\"body.thickness\"]');r.value=9.4;r.dispatchEvent(new Event('input',{bubbles:true}));return r.value})()");
  await sleep(500);
  await shot('07-designer-edit');

  // 返回并保存
  await ev("document.querySelector('#dz-save').click()");
  await sleep(600);
  console.log('back to products:', await ev("!!document.querySelector('.page-head')"));

  // 量产
  await ev("(()=>{const b=[...document.querySelectorAll('[data-act=launch]')][0]; if(b){b.click();return true} return false})()");
  await sleep(600);
  await shot('08-products');

  // 科技页
  await ev("document.querySelector('[data-tab=tech]').click()");
  await sleep(500);
  console.log('tech nodes:', await ev("document.querySelectorAll('.tech-node').length"));
  await shot('09-tech');

  // 供应链
  await ev("document.querySelector('[data-tab=supply]').click()");
  await sleep(400);
  await shot('10-supply');

  // 市场
  await ev("document.querySelector('[data-tab=market]').click()");
  await sleep(400);
  await shot('11-market');

  // 公司
  await ev("document.querySelector('[data-tab=company]').click()");
  await sleep(400);
  await shot('12-company');

  // 园区 3D
  await ev("document.querySelector('[data-tab=hq]').click()");
  await sleep(1400);
  console.log('office canvas:', await ev("document.querySelectorAll('#office-scene canvas').length"));
  await shot('13-hq');

  // 财务
  await ev("document.querySelector('[data-tab=finance]').click()");
  await sleep(400);
  await shot('14-finance');

  // 竞品
  await ev("document.querySelector('[data-tab=rivals]').click()");
  await sleep(400);
  await shot('15-rivals');

  console.log('\n--- console logs ---');
  logs.slice(0, 30).forEach((l) => console.log(l));
  console.log('\n--- errors ---');
  errors.slice(0, 20).forEach((l) => console.log(l));
  if (!errors.length) console.log('(none)');
  ws.close();
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
