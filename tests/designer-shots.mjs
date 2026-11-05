// 设计器视觉校验：3D 正面 / 背面 / 侧面 / 45° 各拍一张
const BASE = 'http://127.0.0.1:9222';
const URL = process.argv[2] || 'http://127.0.0.1:8124/index.html';
const PREFIX = process.argv[3] || '.tmp/dz';
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
  const shot = async (n) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    if (r.result?.data) (await import('node:fs')).writeFileSync(`${PREFIX}-${n}.png`, Buffer.from(r.result.data, 'base64'));
  };

  await ev("localStorage.clear()");
  await ev("document.querySelector('[data-mode=career]').click()"); await sleep(200);
  await ev("(()=>{const y=document.querySelector('#f-year');y.value='2010';y.dispatchEvent(new Event('change'));return 1})()");
  await ev("document.querySelector('#start').click()"); await sleep(700);
  await ev("document.querySelector('[data-tab=product]').click()"); await sleep(200);
  await ev("document.querySelector('[data-act=create-model]').click()"); await sleep(900);
  await shot('01-2d');
  await ev("document.querySelectorAll('[data-vm]')[1].click()"); await sleep(900);
  for (const cam of ['front', 'back', 'side', 'hero']) {
    await ev(`document.querySelector('[data-cam=${cam}]').click()`); await sleep(700);
    await shot('02-' + cam);
  }
  console.log('errors:', errors.length ? errors.slice(0, 4) : 'none');
  ws.close();
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
