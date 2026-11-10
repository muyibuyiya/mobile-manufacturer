// 屏幕设计页冒烟测试
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
  let pass = 0, fail = 0;
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params }));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL });
  await sleep(1600);
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) errors.push('eval: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    return r.result?.result?.value;
  };
  const check = (name, ok, detail = '') => {
    if (ok) pass++; else fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  };
  const shot = async (n) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    if (r.result?.data) (await import('node:fs')).writeFileSync(`.tmp/sd-${n}.png`, Buffer.from(r.result.data, 'base64'));
  };

  await ev('localStorage.clear()');
  await send('Page.reload');
  await sleep(1500);
  errors.length = 0;

  // 沙盒开局
  await ev(`[...document.querySelectorAll('.menu-item')].find(x => x.textContent.includes('沙盒'))?.click()`);
  await sleep(500);
  await ev(`document.querySelector('#start')?.click()`);
  await sleep(1600);
  errors.length = 0;

  // 找入口：产品页屏幕设计按钮
  await ev(`[...document.querySelectorAll('[data-act=speed]')].find(b => b.dataset.v === '2')?.click()`);
  await sleep(150);
  await ev(`document.querySelector('[data-tab=product]')?.click()`);
  await sleep(300);
  const entry = await ev(`(() => {
    const b = document.querySelector('[data-act=open-screendesign]');
    if (!b) return '';
    b.click();
    return (b.textContent || '').trim();
  })()`);
  await sleep(500);
  check('打开屏幕设计页', !!entry, entry);
  await ev('window.confirm = () => true');

  const ui = await ev(`(() => {
    const ov = document.querySelector('[data-pause-game]');
    if (!ov) return { ok: false };
    const btns = [...ov.querySelectorAll('[data-sd="save"],[data-sd="done"],[data-sd="discard"]')].map(b => b.textContent.trim());
    const cv = ov.querySelector('[data-sd=cv]');
    return { ok: true, btns, w: cv?.width, h: cv?.height, status: ov.querySelector('[data-sd=status]')?.textContent };
  })()`);
  check('三个退出/保存按钮', ui.ok && ui.btns.join(',') === '不保存退出,保存,完成', JSON.stringify(ui.btns));
  check('画布已渲染', ui.ok && ui.w > 0 && ui.h > 0, `${ui.w}x${ui.h}`);
  check('打开时暂停时间', await ev(`!document.querySelector('[data-act=speed][data-v="2"]')?.classList.contains('on')`));

  // 切到三大键 + 反向
  await ev(`document.querySelector('[data-sd=nav][data-v=buttons]').click()`);
  await sleep(150);
  await ev(`document.querySelector('[data-sd=navdir][data-v=rtl]').click()`);
  await sleep(150);
  const navState = await ev(`(() => {
    const sel = document.querySelector('[data-sd=navdir][data-v=rtl]');
    return { primary: sel?.classList.contains('primary'), hasGesture: !!document.querySelector('[data-sd=gestureW]') };
  })()`);
  check('三大键方向可切换', navState.primary === true, JSON.stringify(navState));
  check('三大键时隐藏横条滑杆', navState.hasGesture === false);

  // 手势模式：滑杆存在，拖动可改数据
  await ev(`document.querySelector('[data-sd=nav][data-v=gesture]').click()`);
  await sleep(150);
  await ev(`(() => {
    const el = document.querySelector('[data-sd=gestureW]');
    el.value = 40;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const eh = document.querySelector('[data-sd=gestureH]');
    eh.value = 4.2;
    eh.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(150);
  const gesture = await ev(`(() => ({
    w: document.querySelector('[data-sd=gestureW-v]')?.textContent,
    h: document.querySelector('[data-sd=gestureH-v]')?.textContent,
    bat: !!document.querySelector('[data-sd=batteryDY]'),
  }))()`);
  check('横条长度/粗细可调', gesture.w === '40%' && gesture.h === '4.2u', JSON.stringify(gesture));
  check('电池位置滑杆存在', gesture.bat === true);
  const undoUI = await ev(`(() => {
    const el = document.querySelector('[data-sd=batteryDY]');
    const before = el.value;
    el.value = '3'; el.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-sd="undo"]').click();
    return { before, after: document.querySelector('[data-sd=batteryDY]')?.value };
  })()`);
  check('屏幕设计撤销可恢复', undoUI.after === undoUI.before, JSON.stringify(undoUI));

  // 锁屏预览
  await ev(`document.querySelector('[data-sd=preview][data-v=lock]').click()`);
  await sleep(250);
  const lock = await ev(`(() => ({
    active: document.querySelector('[data-sd=preview][data-v=lock]')?.classList.contains('primary'),
    hasLockFile: !!document.querySelector('[data-sd=lock-file]'),
    hasLockColor: !!document.querySelector('[data-sd=lock-wall-color]'),
    hasNotif: !!document.querySelector('[data-sd=lockShowNotif]'),
  }))()`);
  check('锁屏预览可切换', lock.active === true, JSON.stringify(lock));
  check('锁屏壁纸/通知选项', lock.hasLockFile && lock.hasLockColor && lock.hasNotif);

  // 导入壁纸：应自动切到对应画面，且缩略图出现
  const uploadLock = await ev(`(async () => {
    document.querySelector('[data-sd=preview][data-v=home]').click();
    const c = document.createElement('canvas'); c.width = 80; c.height = 160;
    const x = c.getContext('2d'); x.fillStyle = '#00ff00'; x.fillRect(0, 0, 80, 160);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'lock.png', { type: 'image/png' }));
    const input = document.querySelector('[data-sd=lock-file]');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 700));
    return {
      lock: document.querySelector('[data-sd=preview][data-v=lock]')?.classList.contains('primary'),
      thumb: (document.querySelector('[data-sd=wp-thumb]')?.src || '').startsWith('data:image'),
    };
  })()`);
  check('导入锁屏壁纸自动切到锁屏', uploadLock.lock === true && uploadLock.thumb === true, JSON.stringify(uploadLock));

  const uploadHome = await ev(`(async () => {
    document.querySelector('[data-sd=preview][data-v=lock]').click();
    const c = document.createElement('canvas'); c.width = 80; c.height = 160;
    const x = c.getContext('2d'); x.fillStyle = '#ff00ff'; x.fillRect(0, 0, 80, 160);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'home.png', { type: 'image/png' }));
    const input = document.querySelector('[data-sd=file]');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 700));
    return {
      home: document.querySelector('[data-sd=preview][data-v=home]')?.classList.contains('primary'),
      thumb: (document.querySelector('[data-sd=wp-thumb]')?.src || '').startsWith('data:image'),
    };
  })()`);
  check('导入桌面壁纸自动切到桌面', uploadHome.home === true && uploadHome.thumb === true, JSON.stringify(uploadHome));
  await shot('upload');

  // 设备类型独立 UI：手表 / 平板
  await ev(`document.querySelector('[data-sd=type][data-v=watch]').click()`); await sleep(400);
  const watchUI = await ev(`(() => {
    const cv = document.querySelector('[data-sd=cv]');
    const opts = ['watch-shape','watch-layout','watchShowDate','watchShowComplications','watchBattery','watchSteps'];
    return { w: cv?.width, h: cv?.height, opts: opts.every(k => !!document.querySelector('[data-sd="'+k+'"]')), phoneDock: !!document.querySelector('[data-sd=dock]') };
  })()`);
  check('手表独立 UI 选项', watchUI.opts === true && watchUI.phoneDock === false, JSON.stringify(watchUI));
  check('手表画布 1:1', watchUI.w === 400 && watchUI.h === 400, `${watchUI.w}x${watchUI.h}`);
  const watchHome = await ev(`(() => {
    document.querySelector('[data-sd=preview][data-v=home]').click();
    const cv = document.querySelector('[data-sd=cv]');
    return cv.toDataURL().slice(-120);
  })()`);
  await sleep(250);
  const watchHome2 = await ev(`document.querySelector('[data-sd=cv]').toDataURL().slice(-120)`);
  check('手表桌面可渲染', !!watchHome && !!watchHome2 && watchHome2.length > 40);

  await ev(`document.querySelector('[data-sd=type][data-v=tablet]').click()`); await sleep(400);
  const tabletUI = await ev(`(() => {
    const cv = document.querySelector('[data-sd=cv]');
    return { w: cv?.width, h: cv?.height, split: !!document.querySelector('[data-sd=tabletSplit]'), dock: !!document.querySelector('[data-sd=tabletDock]'), watchOpts: !!document.querySelector('[data-sd=watch-shape]') };
  })()`);
  check('平板独立 UI 选项', tabletUI.split && tabletUI.dock && !tabletUI.watchOpts, JSON.stringify(tabletUI));
  check('平板画布 16:10', tabletUI.w === 2560 && tabletUI.h === 1600, `${tabletUI.w}x${tabletUI.h}`);
  await ev(`document.querySelector('[data-sd=preview][data-v=home]').click()`); await sleep(200);
  const splitA = await ev(`document.querySelector('[data-sd=cv]').toDataURL()`);
  await ev(`(() => { const cb = document.querySelector('[data-sd=tabletSplit]'); cb.checked = true; cb.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(250);
  const splitB = await ev(`document.querySelector('[data-sd=cv]').toDataURL()`);
  check('平板分屏可切换渲染', !!splitA && !!splitB && splitA !== splitB, `${splitA?.length}/${splitB?.length}`);

  // 左栏分 Tab / 顶部预览 / 缩放 / 画布外框 / 画布点选
  check('左栏三个 Tab', await ev(`document.querySelectorAll('[data-sd="tab"]').length === 3`));
  const lookTab = await ev(`(() => {
    document.querySelector('[data-sd="tab"][data-v="look"]').click();
    const on = document.querySelector('[data-sdt="look"]')?.classList.contains('on');
    const off = !document.querySelector('[data-sdt="canvas"]')?.classList.contains('on');
    return on && off;
  })()`);
  check('外观 Tab 可切换', lookTab === true);
  await ev(`document.querySelector('[data-sd="tab"][data-v="controls"]').click()`);
  const zoom50 = await ev(`(() => { const before = document.querySelector('[data-sd=cv]').style.width; document.querySelector('[data-sd="zoom"][data-v="50"]').click(); return { before, after: document.querySelector('[data-sd=cv]').style.width }; })()`);
  check('画布缩放可切换', !!zoom50.after && zoom50.before !== zoom50.after, JSON.stringify(zoom50));
  check('画布有设备外框', await ev(`/solid/.test(document.querySelector('[data-sd=cv]').style.border)`));
  const clickSec = await ev(`(() => {
    const cv = document.querySelector('[data-sd=cv]');
    const r = cv.getBoundingClientRect();
    cv.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + 4 }));
    return document.querySelector('[data-sdsec="status"]')?.classList.contains('on');
  })()`);
  check('画布点选跳转控件', clickSec === true, String(clickSec));
  const iconDiff = await ev(`(() => {
    const cv = document.querySelector('[data-sd=cv]');
    const a = cv.toDataURL();
    const el = document.querySelector('[data-sd=iconScale]'); el.value = '1.2'; el.dispatchEvent(new Event('input', { bubbles: true }));
    return a !== cv.toDataURL();
  })()`);
  check('图标大小可调整渲染', iconDiff === true);
  await ev(`document.querySelector('[data-sd="preview"][data-v="lock"]').click()`); await sleep(200);
  const notifDiff = await ev(`(() => {
    const cv = document.querySelector('[data-sd=cv]');
    const a = cv.toDataURL();
    const el = document.querySelector('[data-sd=lockNotifCount]'); el?.click();
    const el3 = document.querySelector('[data-sd=lockNotifCount][data-v="3"]'); el3?.click();
    return { diff: a !== cv.toDataURL(), has: !!document.querySelector('[data-sd=lockNotifCount][data-v="3"]') };
  })()`);
  check('锁屏通知条数可调', notifDiff.has === true, JSON.stringify(notifDiff));
  await ev(`document.querySelector('[data-sd="preview"][data-v="home"]').click()`);
  await ev(`document.querySelector('[data-sd="tab"][data-v="controls"]').click()`);

  // 不保存退出：草稿不应写回；重新进入仍是默认手势 28%
  await ev(`document.querySelector('[data-sd=discard]').click()`);
  await sleep(300);
  const closed = await ev(`!document.querySelector('[data-pause-game]')`);
  check('不保存退出可关闭', closed === true);
  check('退出后恢复时间速度', await ev(`document.querySelector('[data-act=speed][data-v="2"]')?.classList.contains('on')`));
  await ev(`(() => { const b = [...document.querySelectorAll('button,[data-act]')].find(x => /屏幕设计/.test(x.textContent || '') || x.dataset.act === 'open-screendesign'); b?.click(); })()`);
  await sleep(400);
  const discardCheck = await ev(`(() => ({
    gesture: document.querySelector('[data-sd=nav][data-v=gesture]')?.classList.contains('primary'),
    w: document.querySelector('[data-sd=gestureW]')?.value,
  }))()`);
  check('不保存退出不写回数据', discardCheck.gesture === true && discardCheck.w === '28', JSON.stringify(discardCheck));
  await ev(`document.querySelector('[data-sd=discard]').click()`);
  await sleep(200);

  // 重新进入，保存后关闭
  await ev(`(() => { const b = [...document.querySelectorAll('button,[data-act]')].find(x => /屏幕设计/.test(x.textContent || '') || x.dataset.act === 'open-screendesign'); b?.click(); })()`);
  await sleep(400);
  await ev(`document.querySelector('[data-sd=nav][data-v=buttons]').click()`);
  await sleep(100);
  await ev(`document.querySelector('[data-sd=navdir][data-v=rtl]').click()`);
  await sleep(100);
  await ev(`document.querySelector('[data-sd=save]').click()`);
  await sleep(200);
  const savedFlag = await ev(`document.querySelector('[data-sd=status]')?.textContent`);
  check('保存后状态为已保存', savedFlag === '已保存', savedFlag);
  await shot('home');
  await ev(`document.querySelector('[data-sd=done]').click()`);
  await sleep(250);
  check('完成可关闭', await ev(`!document.querySelector('[data-pause-game]')`));

  // 保存的数据含新字段
  const data = await ev(`(() => { try { return JSON.parse(localStorage.getItem('mobile_manufacturer_save_v5_auto') || '{}').uiDesigns || []; } catch(e) { return []; } })()`);
  check('存档写入锁屏/导航新字段', data.length > 0 && data[0].navDir === 'rtl' && data[0].lockShowNotif !== undefined, `count=${data.length}`);

  // 屏幕设计接入产品设计器：选择 UI 方案应改变 2D 屏幕内容
  await ev(`document.querySelector('[data-tab=product]')?.click()`); await sleep(300);
  await ev(`document.querySelector('[data-act=design]')?.click()`); await sleep(1400);
  const uiSel = await ev(`(() => { const s = document.querySelector('[data-k="uiDesign"]'); return { exists: !!s, opts: s ? s.options.length : 0, second: s?.options[1]?.value || '' }; })()`);
  check('设计器有 UI 方案选择', uiSel.exists && uiSel.opts > 1, JSON.stringify(uiSel));
  const beforeShot = await ev(`document.querySelector('#dz-2d')?.toDataURL() || ''`);
  await ev(`(() => { const s = document.querySelector('[data-k="uiDesign"]'); s.value = s.options[1].value; s.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(500);
  const afterShot = await ev(`document.querySelector('#dz-2d')?.toDataURL() || ''`);
  check('选择 UI 方案后屏幕变化', !!beforeShot && !!afterShot && beforeShot !== afterShot, `${beforeShot.length}/${afterShot.length}`);
  const lockShot = await ev(`(() => { const s = document.querySelector('[data-k="screenMode"]'); s.value = 'lock'; s.dispatchEvent(new Event('input', { bubbles: true })); return document.querySelector('#dz-2d')?.toDataURL() || ''; })()`);
  check('产品屏幕可切锁屏', !!lockShot && lockShot !== afterShot);
  await ev(`document.querySelector('[data-vm="3d"]')?.click()`); await sleep(900);
  check('UI 方案可用于 3D', await ev(`!!document.querySelector('#dz-stage-body canvas')`));

  // 共享合成管线：桌面/锁屏应产生不同画面
  const compose = await ev(`(async () => {
    const m = await import(location.origin + '/js/ui/screendesign.js');
    const d = { wallpaper: '', wallColor: '#0a1020', carrier: '5G', showTime: true, showBattery: true, showSignal: true,
      navStyle: 'buttons', navDir: 'rtl', gestureW: 28, gestureH: 2.4, batteryDY: 0.9, dockCount: 4, cols: 4, rows: 5,
      canvasW: 1080, canvasH: 2340, lockAspect: true, lockWallpaper: '', lockWallColor: '#141c33',
      lockShowTime: true, lockShowDate: true, lockShowNotif: true };
    const mk = (mode) => { const c = document.createElement('canvas'); c.width = 108; c.height = 234;
      const ok = m.composeScreenUI(c.getContext('2d'), 108, 234, d, mode);
      return { ok, data: c.getContext('2d').getImageData(0, 0, 108, 234).data };
    };
    const a = mk('home'), b = mk('lock');
    let diff = 0;
    for (let i = 0; i < a.data.length; i += 4) if (a.data[i] !== b.data[i] || a.data[i+1] !== b.data[i+1]) diff++;
    return { home: a.ok, lock: b.ok, diff };
  })()`);
  check('composeScreenUI 支持锁屏模式', compose.home === true && compose.lock === true && compose.diff > 50, JSON.stringify(compose));
  await shot('after');

  check('无运行时报错', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`);
  ws.close();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });