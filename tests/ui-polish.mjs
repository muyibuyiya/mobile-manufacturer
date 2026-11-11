// UI 回归：招聘市场按月刷新 / 设计器侧栏默认折叠且互斥 / 设置内锁定项 / 菜单不自动聚焦输入框
const BASE = 'http://127.0.0.1:9222';
const URL = process.argv[2] || 'http://127.0.0.1:8124/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const tabs = await (await fetch(BASE + '/json/list')).json();
  const page = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) errors.push('eval: ' + (r.result.exceptionDetails.exception?.description || ''));
    return r.result?.result?.value;
  };
  let bad = 0;
  const check = (name, ok, detail = '') => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

  await send('Runtime.enable'); await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  try { await send('Network.setBypassServiceWorker', { bypass: true }); } catch (e) { /* 旧版 chrome */ }
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL + '?t=' + Date.now() }); await sleep(1500);
  await ev(`localStorage.clear()`); await send('Page.reload'); await sleep(1500);
  await ev(`[...document.querySelectorAll('.menu-item')].find(x => x.textContent.includes('沙盒'))?.click()`); await sleep(400);
  await ev(`(() => { const y=document.querySelector('#f-year'); y.value='2020'; y.dispatchEvent(new Event('change')); const c=document.querySelector('#f-cash'); c.value='5000000000'; c.dispatchEvent(new Event('input')); return true; })()`);
  await ev(`document.querySelector('#start')?.click()`); await sleep(1700);

  const poolSig = () => ev(`(() => [...document.querySelectorAll('[data-act="hire"]')].map((b) => { const item = b.closest('.list-item'); return (item?.querySelector('b')?.textContent || '') + '|' + (item?.textContent.match(/期望 ¥([\\d,]+)/) || [])[1]; }).join(',') )()`);

  // ---- 1. 菜单不自动聚焦输入框 ----
  await ev(`document.querySelector('[data-act="open-gamemenu"]')?.click()`); await sleep(500);
  const focus = await ev(`(() => { const el = document.activeElement; return { tag: el?.tagName, id: el?.id || '', inModal: !!el?.closest?.('.modal-mask') }; })()`);
  check('菜单打开后不聚焦输入框', focus.tag !== 'INPUT' && focus.tag !== 'SELECT' && focus.tag !== 'TEXTAREA', JSON.stringify(focus));
  // 设置里有侧栏锁定项（从菜单进入设置面板）
  await ev(`document.querySelector('[data-gm="settings"]')?.click()`); await sleep(500);
  check('设置面板已打开', await ev(`!!document.querySelector('[data-set="lock-left"]')`));
  check('菜单里有「设计器侧栏」设置组', await ev(`(() => { const it = [...document.querySelectorAll('.list-item')].find((x) => x.textContent.includes('设计器侧栏')); return !!it; })()`));
  await ev(`document.querySelector('[data-set="lock-left"]')?.click()`); await sleep(200);
  check('锁定按钮可切换为已锁定', (await ev(`document.querySelector('[data-set="lock-left"]')?.textContent`)) === '已锁定');
  check('锁定写入本地存储', (await ev(`localStorage.getItem('mm_dz_lock_left')`)) === '1');
  check('锁定后菜单仍显示恢复宽度按钮', await ev(`!!document.querySelector('[data-set="reset-left"]')`));
  await ev(`document.querySelector('[data-close]')?.click()`); await sleep(300);
  check('菜单可关闭', await ev(`!document.querySelector('.modal-mask')`));

  // ---- 2. 招聘市场按月刷新 ----
  await ev(`document.querySelector('[data-tab="company"]')?.click()`); await sleep(600);
  check('招聘池说明标注按月刷新', await ev(`document.body.textContent.includes('招聘市场每月自动换一批候选人')`));
  const sig1 = await poolSig();
  check('招聘池有候选人', !!sig1 && sig1.length > 4, `${(sig1 || '').slice(0, 40)}`);
  await ev(`document.querySelector('[data-tab="overview"]')?.click()`); await sleep(300);
  await ev(`document.querySelector('[data-tab="company"]')?.click()`); await sleep(500);
  const sig2 = await poolSig();
  check('同月内候选人保持不变', sig1 === sig2, sig1 === sig2 ? '' : '池子被重复刷新');
  await ev(`document.querySelector('[data-act="refresh-pool"]')?.click()`); await sleep(500);
  const sig3 = await poolSig();
  check('「重抽本池」可立即刷新', sig3 !== sig2, sig3 === sig2 ? '未变化' : '');
  // 推进一个月后应自动换一批
  let sigAfter = sig3;
  for (let i = 0; i < 3; i++) {
    await ev(`document.querySelector('[data-act="advance"]')?.click()`); await sleep(900);
    await ev(`document.querySelector('[data-tab="company"]')?.click()`); await sleep(400);
    sigAfter = await poolSig();
    if (sigAfter !== sig3) break;
  }
  check('推进一个月后候选人换新', sigAfter !== sig3, sig4Text(sig3, sigAfter));

  // ---- 3. 设计器侧栏：默认折叠 + 互斥 + 宽度锁定 ----
  await ev(`localStorage.setItem('mm_dz_lock_left', '1')`);
  await ev(`document.querySelector('[data-tab="product"]')?.click()`); await sleep(400);
  await ev(`document.querySelector('[data-act="design"]')?.click()`); await sleep(1500);
  check('设计器打开', await ev(`!!document.querySelector('.designer')`));
  check('左栏默认折叠', await ev(`document.querySelector('.designer').classList.contains('controls-hidden')`));
  check('评估栏默认折叠', await ev(`document.querySelector('.designer').classList.contains('assess-collapsed')`));
  check('两侧栏默认都收起（把手可见）', await ev(`getComputedStyle(document.querySelector('#dz-assess-tab')).display !== 'none'`));
  check('宽度锁定生效（无分隔条）', await ev(`getComputedStyle(document.querySelector('#dz-resizer')).display === 'none'`));

  await ev(`document.querySelector('#dz-panel-toggle')?.click()`); await sleep(350);
  check('展开左栏', await ev(`!document.querySelector('.designer').classList.contains('controls-hidden')`));
  check('展开左栏后评估仍收起', await ev(`document.querySelector('.designer').classList.contains('assess-collapsed')`));

  await ev(`document.querySelector('#dz-assess-tab')?.click()`); await sleep(400);
  check('展开评估', await ev(`!document.querySelector('.designer').classList.contains('assess-collapsed')`));
  check('展开评估后左栏自动收起（互斥）', await ev(`document.querySelector('.designer').classList.contains('controls-hidden')`));

  await ev(`document.querySelector('#dz-panel-toggle')?.click()`); await sleep(350);
  check('再展开左栏', await ev(`!document.querySelector('.designer').classList.contains('controls-hidden')`));
  check('再展开左栏后评估自动收起（互斥）', await ev(`document.querySelector('.designer').classList.contains('assess-collapsed')`));

  check('无运行时报错', errors.length === 0, errors.slice(0, 2).join(' | '));
  console.log(`\n1 suite, ${bad} failed`);
  ws.close();
  process.exit(bad ? 1 : 0);
}
function sig4Text(a, b) { return `${(a || '').slice(0, 20)} -> ${(b || '').slice(0, 20)}`; }
main().catch((e) => { console.error(e); process.exit(1); });