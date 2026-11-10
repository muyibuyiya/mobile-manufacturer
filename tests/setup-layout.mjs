// 开局设置页布局回归：平板横屏（1440×760 / 1440×600）不被裁切，竖屏居中完整
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
    if (r.result?.exceptionDetails) errors.push('eval: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    return r.result?.result?.value;
  };
  let bad = 0;
  const check = (name, ok, detail = '') => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  const openSetup = async (w, h, orientation, mode = '沙盒') => {
    await send('Emulation.setDeviceMetricsOverride', {
      width: w, height: h, deviceScaleFactor: 2, mobile: true,
      screenOrientation: { type: orientation, angle: orientation === 'landscapePrimary' ? 90 : 0 },
    });
    await send('Page.navigate', { url: URL }); await sleep(1400);
    await ev(`localStorage.clear()`); await send('Page.reload'); await sleep(1400);
    await ev(`[...document.querySelectorAll('.menu-item')].find(x => x.textContent.includes('${mode}'))?.click()`); await sleep(350);
  };

  // 1) 平板横屏（浏览器可视高度扣除状态栏/地址栏后的典型值）
  await openSetup(1440, 760, 'landscapePrimary');
  check('设置页已渲染', await ev(`!!document.querySelector('#f-name')`));
  check('设置页可滚动（overflow-y auto）', await ev(`getComputedStyle(document.querySelector('.menu-screen')).overflowY === 'auto'`));
  check('横屏无横向溢出', await ev(`document.documentElement.scrollWidth <= innerWidth + 1`), await ev(`document.documentElement.scrollWidth + '/' + innerWidth`));
  const fit = await ev(`(() => { const s = document.querySelector('#start').getBoundingClientRect(); return { bottom: Math.round(s.bottom), vh: innerHeight, ok: s.bottom <= innerHeight + 1 }; })()`);
  check('1440×760 开始按钮一屏可见', fit.ok, JSON.stringify(fit));
  check('总部描述随选择显示', await ev(`(document.querySelector('#country-desc')?.textContent || '').includes('供应链')`), await ev(`document.querySelector('#country-desc')?.textContent`));
  const hint = await ev(`(() => { const i = document.querySelector('#f-cash'); i.value = '1000000000'; i.dispatchEvent(new Event('input', { bubbles: true })); return document.querySelector('#cash-hint')?.textContent || ''; })()`);
  check('初始资金换算提示联动', hint.includes('10.00'), hint);
  check('总部切换后描述更新', await ev(`(() => { const s = document.querySelector('#f-country'); s.value = 'us'; s.dispatchEvent(new Event('change')); return (document.querySelector('#country-desc')?.textContent || '').includes('高端市场'); })()`));

  // 2) 更矮的横屏窗口：必须能滚动到底
  await openSetup(1440, 600, 'landscapePrimary');
  const scroll = await ev(`(() => { const sc = document.querySelector('.menu-screen'); sc.scrollTop = sc.scrollHeight; const s = document.querySelector('#start').getBoundingClientRect(); return { canScroll: sc.scrollHeight > sc.clientHeight, top: Math.round(sc.scrollTop), visible: s.bottom <= innerHeight + 1 }; })()`);
  check('1440×600 内容可滚动', scroll.canScroll, JSON.stringify(scroll));
  check('1440×600 滚动后开始按钮可见', scroll.visible && scroll.top > 0, JSON.stringify(scroll));

  // 3) 平板竖屏：内容居中、完整
  await openSetup(900, 1440, 'portraitPrimary');
  const portrait = await ev(`(() => { const inner = document.querySelector('.menu-inner').getBoundingClientRect(); const s = document.querySelector('#start').getBoundingClientRect(); return { top: Math.round(inner.top), h: Math.round(inner.height), visible: s.bottom <= innerHeight + 1 }; })()`);
  check('竖屏内容居中且完整', portrait.top > 0 && portrait.visible, JSON.stringify(portrait));

  // 4) 经营模式表单：无沙盒字段时不报错，年代说明正常
  await openSetup(1440, 760, 'landscapePrimary', '经营');
  const career = await ev(`(() => { const s = document.querySelector('#start').getBoundingClientRect(); return { desc: (document.querySelector('#era-desc')?.textContent || '').length, visible: s.bottom <= innerHeight + 1, hasCash: !!document.querySelector('#f-cash') }; })()`);
  check('经营模式表单无沙盒字段且说明正常', career.desc > 10 && !career.hasCash, JSON.stringify(career));
  check('经营模式开始按钮一屏可见', career.visible, JSON.stringify(career));

  check('无运行时报错', errors.length === 0, errors.slice(0, 2).join(' | '));

  console.log(`\n1 suite, ${bad} failed`);
  ws.close();
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });