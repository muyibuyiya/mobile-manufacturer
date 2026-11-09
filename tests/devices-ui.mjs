// 设备形态：平板 / 圆表 / 方表 设计与渲染烟测
const BASE = 'http://127.0.0.1:9222';
const URL = process.argv[2] || 'http://127.0.0.1:8124/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const tabs = await (await fetch(BASE + '/json/list')).json();
  const page = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
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
  await ev(`[...document.querySelectorAll('.menu-item')].find(x => x.textContent.includes('沙盒'))?.click()`); await sleep(300);
  await ev(`(() => { const y = document.querySelector('#f-year'); y.value = '2020'; y.dispatchEvent(new Event('change')); return true; })()`); await sleep(200);
  await ev(`document.querySelector('#start')?.click()`); await sleep(1500);
  await ev(`document.querySelector('[data-tab=product]')?.click()`); await sleep(300);
  await ev(`document.querySelector('[data-act="design"]')?.click()`); await sleep(1200);
  errors.length = 0;

  const pick = async (tpl) => {
    await ev(`(() => { const s = document.querySelector('[data-k="template"]'); if (!s) return false; s.value = '${tpl}'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await sleep(600);
    return ev(`(() => ({ len: document.querySelector('[data-k="body.length"]')?.value, wid: document.querySelector('[data-k="body.width"]')?.value, corner: document.querySelector('[data-k="body.corner"]')?.value }))()`);
  };
  const pickCat = async (cat) => {
    await ev(`document.querySelector('[data-cat="${cat}"]')?.click()`);
    await sleep(700);
    return ev(`(() => ({ cat: document.querySelector('[data-cat].primary')?.dataset.cat, len: document.querySelector('[data-k="body.length"]')?.value, wid: document.querySelector('[data-k="body.width"]')?.value, corner: document.querySelector('[data-k="body.corner"]')?.value, aspect: document.querySelector('[data-k="screen.aspect"]')?.value }))()`);
  };
  check('设计器可打开', await ev(`!!document.querySelector('[data-k="template"]')`));
  await ev('window.confirm = () => true');
  const tablet = await pickCat('tablet');
  check('平板品类可切换', tablet.cat === 'tablet' && tablet.len === '250' && tablet.wid === '188' && tablet.aspect === '4:3', JSON.stringify(tablet));
  check('平板有 3D 画布', await ev(`!!document.querySelector('canvas')`));
  check('平板专属机身选项', await ev(`['tablet.stand','tablet.keyboard','tablet.stylus','tablet.cellular'].every(k => !!document.querySelector('[data-k="'+k+'"]')) && document.body.textContent.includes('平板专属') && !document.body.textContent.includes('折叠形态') && !document.body.textContent.includes('背部智窗') && !document.body.textContent.includes('听筒宽度')`));
  const stand = await ev(`(() => { const c = document.querySelector('[data-k="tablet.stand"]'); c.checked = true; c.dispatchEvent(new Event('input', { bubbles: true })); c.dispatchEvent(new Event('change', { bubbles: true })); return c.checked; })()`);
  await sleep(500);
  check('平板支架可开启渲染', stand === true, String(stand));
  await pickCat('watch');
  const watch = await pick('watch_round');
  check('圆表模板可切换', watch.len === '46' && watch.wid === '46' && watch.corner === '22.5', JSON.stringify(watch));
  const square = await pick('watch_square');
  check('方表模板可切换', square.len === '42' && square.wid === '42' && square.corner === '4', JSON.stringify(square));
  check('手表无摄像头配置', await ev(`!document.querySelector('[data-k="camera.lenses.0.type"]')`));
  check('手表专属机身选项', await ev(`['watch.shape','watch.crown','watch.bezel','watch.button'].every(k => !!document.querySelector('[data-k="'+k+'"]')) && document.body.textContent.includes('手表专属') && ![...document.querySelectorAll('.section-label')].some(x => x.textContent.trim() === '折叠形态')`));
  await ev(`document.querySelector('[data-pick-open="parts.battery"]')?.click()`); await sleep(150);
  check('手表硬件列表过滤', await ev(`(() => { const vals = [...document.querySelectorAll('[data-pick="parts.battery"] .pselect-item')].map(o => Number((o.textContent.match(/(\\d+)mAh/)||[])[1]||0)); return vals.length > 0 && vals.every(v => v > 0 && v <= 800); })()`));
  await ev(`document.querySelector('[data-pick-open="parts.battery"]')?.click()`);
  const shapeBack = await ev(`(() => { const s = document.querySelector('[data-k="watch.shape"]'); s.value = 'round'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; })()`);
  await sleep(700);
  const roundAgain = await ev(`(() => ({ tpl: document.querySelector('[data-k="template"]')?.value, corner: document.querySelector('[data-k="body.corner"]')?.value }))()`);
  check('手表形状可回切圆表并同步机身', shapeBack === 'round' && roundAgain.tpl === 'watch_round' && roundAgain.corner === '22.5', JSON.stringify(roundAgain));
  const phone = await pickCat('phone');
  check('可切回手机品类', phone.cat === 'phone' && Number(phone.len) > 100, JSON.stringify(phone));
  const tabletBack = await pickCat('tablet');
  const limits = await ev(`(() => { const l = document.querySelector('[data-k="body.length"]'), w = document.querySelector('[data-k="body.width"]'); const a = [...document.querySelectorAll('[data-k="screen.aspect"] option')].map(o => o.textContent.trim()); return { lmax: l.max, wmax: w.max, aspects: a.join(',') }; })()`);
  check('平板范围与比例修订', tabletBack.cat === 'tablet' && limits.lmax === '360' && limits.wmax === '260' && limits.aspects === '4:3,3:2,16:9', JSON.stringify(limits));
  await ev(`document.querySelector('[data-pick-open="parts.battery"]')?.click()`); await sleep(150);
  check('平板硬件列表过滤', await ev(`(() => { const vals = [...document.querySelectorAll('[data-pick="parts.battery"] .pselect-item')].map(o => Number((o.textContent.match(/(\\d+)mAh/)||[])[1]||0)); return vals.length > 0 && vals.every(v => v >= 5000); })()`));
  await ev(`document.querySelector('[data-pick-open="parts.battery"]')?.click()`);
  await ev(`(() => { const el = document.querySelector('[data-k="body.length"]'); el.value = '300'; el.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(200);
  await pickCat('phone'); await pickCat('tablet');
  check('品类快照可恢复', await ev(`document.querySelector('[data-k="body.length"]')?.value === '300'`));
  const ratioLink = await ev(`(() => { const s = document.querySelector('[data-k="screen.aspect"]'); s.value = '16:9'; s.dispatchEvent(new Event('input', { bubbles: true })); const w = Number(document.querySelector('[data-k="body.width"]')?.value); return { w, expect: Math.round(300 / (16/9) * 10) / 10 }; })()`);
  check('平板比例联动机身', Math.abs(ratioLink.w - ratioLink.expect) < 1.2, JSON.stringify(ratioLink));
  const preset = await ev(`(() => { document.querySelector('[data-tablet-size="14.6"]').click(); return { inch: document.querySelector('[data-k="screen.inch"]')?.value, len: Number(document.querySelector('[data-k="body.length"]')?.value) }; })()`);
  check('平板尺寸预设', preset.inch === '14.6' && preset.len > 300, JSON.stringify(preset));
  const undoLen = await ev(`(() => { const el = document.querySelector('[data-k="body.length"]'); el.value = '200'; el.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#dz-undo').click(); return document.querySelector('[data-k="body.length"]')?.value; })()`);
  check('设计器撤销可恢复', Number(undoLen) === 300, String(undoLen));
  check('设计器有包装设计', await ev(`!!document.querySelector('[data-k="packaging.material"]') && document.body.textContent.includes('包装评分')`));
  check('评估栏可收起', await ev(`(() => { const b = document.querySelector('#dz-assess-toggle'); if (!b) return false; b.click(); const off = document.querySelector('.designer')?.classList.contains('assess-collapsed'); b.click(); return off && !document.querySelector('.designer')?.classList.contains('assess-collapsed'); })()`));
  check('左栏可拖宽', await ev(`(() => { const l = document.querySelector('#dz-left'); return !!document.querySelector('#dz-resizer') && l.clientWidth >= 220 && l.clientWidth <= 460; })()`));
  const issueFix = await ev(`(() => {
    const r = document.querySelector('#dz-right');
    const probe = document.createElement('div');
    probe.dataset.issueTarget = 'body';
    r.appendChild(probe);
    probe.click();
    probe.remove();
    const sec = document.querySelector('[data-sec="body"]');
    return !!sec && !sec.classList.contains('collapsed') && sec.classList.contains('dz-flash');
  })()`);
  check('装配错误可点击定位', issueFix === true, String(issueFix));
  const pkg = await ev(`(() => { const s = document.querySelector('[data-k="packaging.material"]'); s.value = 'premium'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; })()`);
  await sleep(250);
  check('包装材质可切换', pkg === 'premium' && await ev(`/包装评分 [56]/.test(document.body.textContent)`), pkg);
  check('无运行时报错', errors.length === 0, errors.slice(0, 2).join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  ws.close();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });