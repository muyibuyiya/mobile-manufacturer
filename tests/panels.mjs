// 面板巡检：沙盒开局后逐个标签截图，检查布局
const BASE = 'http://127.0.0.1:9222';
const URL = process.argv[2] || 'http://127.0.0.1:8124/index.html';
const PREFIX = process.argv[3] || '.tmp/pn';
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
  await ev("[...document.querySelectorAll('.menu-item')].find(x=>x.textContent.includes('沙盒模式')).click()"); await sleep(250);
  await ev("document.querySelector('#start').click()"); await sleep(900);

  const pages = ['company', 'overview', 'market', 'supply', 'finance'];
  for (const p of pages) {
    await ev(`document.querySelector('[data-tab=${p}]').click()`); await sleep(650);
    await shot(p);
  }
  // 员工页：招聘一名
  await ev("document.querySelector('[data-tab=company]').click()"); await sleep(400);
  const hire = await ev("(()=>{const b=document.querySelector('[data-act=hire]');if(!b)return 'none';b.click();return 'ok'})()");
  await sleep(500);
  await shot('company-hired');
  console.log('hire:', hire);
  // 员工页：解雇一名（补偿 2 月薪资），验证裁员入口真的能减员
  const fire = await ev(`(()=>{
    const rows = () => document.querySelectorAll('[data-act=fire]').length;
    const before = rows();
    const b = document.querySelector('[data-act=fire]');
    if (!b) return 'none';
    b.click();
    return before + '->' + rows();
  })()`);
  await sleep(500);
  console.log('fire:', fire);
  console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
  ws.close();
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
