// P2 回归：OS 主题商店（屏幕设计 → OS 主题 → 流行度/收入）
const BASE = 'http://127.0.0.1:9222';
const URL = process.argv[2] || 'http://127.0.0.1:8124/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const tabs = await (await fetch(BASE + '/json/list')).json();
  const tab = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const errors = [];
  let pass = 0, fail = 0;
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL }); await sleep(1400);
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) errors.push('eval: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    return r.result?.result?.value;
  };
  const check = (name, ok, detail = '') => {
    if (ok) pass++; else fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  };
  await ev('localStorage.clear()'); await send('Page.reload'); await sleep(1400);
  await ev(`[...document.querySelectorAll('.menu-item')].find(x => x.textContent.includes('沙盒'))?.click()`); await sleep(400);
  await ev(`document.querySelector('#start')?.click()`); await sleep(1500);
  errors.length = 0;

  // 做一套屏幕设计并保存
  await ev(`document.querySelector('[data-tab=product]')?.click()`); await sleep(250);
  await ev(`document.querySelector('[data-act=open-screendesign]')?.click()`); await sleep(500);
  const made = await ev(`(() => { const b = document.querySelector('[data-sd=save]'); if (!b) return false; b.click(); return true; })()`);
  await sleep(250);
  await ev(`document.querySelector('[data-sd=done]')?.click()`); await sleep(300);
  check('屏幕设计方案已保存', made === true);

  // 自研部门页的主题商店
  await ev(`document.querySelector('[data-tab=selfrnd]')?.click()`); await sleep(400);
  const hasCard = await ev(`document.body.textContent.includes('OS 主题商店')`);
  const themeCount = await ev(`document.querySelectorAll('[data-act="theme-select"]').length`);
  check('OS 主题商店显示方案', hasCard === true && themeCount > 0, String(themeCount));
  const scoreText = await ev(`document.querySelector('[data-act="theme-select"]')?.closest('.org-exec')?.textContent || ''`);
  check('主题有评分', /\d+ 分/.test(scoreText), scoreText.slice(0, 40));
  await ev(`document.querySelector('[data-act="theme-select"]')?.click()`); await sleep(350);
  check('主题可设为当前 OS 主题', await ev(`document.body.textContent.includes('使用中')`));
  await ev(`document.querySelector('[data-act="theme-preview"]')?.click()`); await sleep(350);
  check('主题预览弹窗', await ev(`!!document.querySelector('#theme-preview-cv')`));
  await ev(`document.querySelector('[data-preview-mode="lock"]')?.click()`); await sleep(250);
  check('主题预览可切锁屏', await ev(`document.querySelector('[data-preview-mode="lock"]')?.classList.contains('primary')`));
  await ev(`document.querySelector('.modal-mask [data-close]')?.click()`); await sleep(200);
  check('无运行时报错', errors.length === 0, errors.slice(0, 2).join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  ws.close();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });