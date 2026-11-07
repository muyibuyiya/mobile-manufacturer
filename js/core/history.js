// 历史数据降采样（v1.6.0）
// 近 12 个月保留明细；更早的月份按自然季度聚合到 *Archive，避免 40 年存档膨胀。
// 所有图表通过 historyRows / compHistoryRows / modelHistoryRows 读"展开后的月度序列"。
export const DETAIL_MONTHS = 12;
const MAX_QUARTERS = 400; // 100 年

const qOf = (m) => Math.floor((Number(m) || 0) / 3);
const keyOf = (y, q) => `${y}-${q}`;

function groupByQuarter(rows) {
  const map = new Map();
  for (const r of rows || []) {
    if (!r) continue;
    const k = keyOf(r.y, qOf(r.m));
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return [...map.values()];
}

function compactInto(holder, arrKey, archKey, addBucket, limit = DETAIL_MONTHS) {
  if (!Array.isArray(holder[arrKey])) holder[arrKey] = [];
  if (!Array.isArray(holder[archKey])) holder[archKey] = [];
  const arr = holder[arrKey];
  if (arr.length <= limit) return;
  const overflow = arr.splice(0, arr.length - limit);
  for (const group of groupByQuarter(overflow)) addBucket(holder[archKey], group);
  if (holder[archKey].length > MAX_QUARTERS) holder[archKey].splice(0, holder[archKey].length - MAX_QUARTERS);
}

function addHistoryBucket(archive, rows) {
  if (!rows.length) return;
  const y = rows[0].y;
  const q = qOf(rows[0].m);
  const last = archive[archive.length - 1];
  const sum = (k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const tail = rows[rows.length - 1];
  if (last && last.y === y && last.q === q) {
    last.months += rows.length;
    last.revenue += sum('revenue');
    last.net += sum('net');
    last.units += sum('units');
    last.cash = tail.cash || 0;
    last.share = tail.share || 0;
    last.brand = tail.brand || 0;
    return;
  }
  archive.push({
    y, q, months: rows.length,
    revenue: sum('revenue'), net: sum('net'), units: sum('units'),
    cash: tail.cash || 0, share: tail.share || 0, brand: tail.brand || 0,
  });
}

function mergeCompRows(baseRows, rows) {
  const map = new Map((baseRows || []).map((r) => [r.id, { ...r }]));
  for (const row of rows || []) {
    for (const r of row.rows || []) {
      const cur = map.get(r.id);
      if (cur) {
        cur.units = (cur.units || 0) + (r.units || 0);
        cur.rev = (cur.rev || 0) + (r.rev || 0);
        cur.brand = r.brand ?? cur.brand;
        cur.cash = r.cash ?? cur.cash;
        cur.name = r.name || cur.name;
        cur.nameEn = r.nameEn || cur.nameEn;
        cur.color = r.color || cur.color;
      } else {
        map.set(r.id, { ...r, units: r.units || 0, rev: r.rev || 0 });
      }
    }
  }
  return [...map.values()];
}

function addCompBucket(archive, rows) {
  if (!rows.length) return;
  const y = rows[0].y;
  const q = qOf(rows[0].m);
  const last = archive[archive.length - 1];
  if (last && last.y === y && last.q === q) {
    last.months += rows.length;
    last.rows = mergeCompRows(last.rows, rows);
    return;
  }
  archive.push({ y, q, months: rows.length, rows: mergeCompRows([], rows) });
}

function addModelBucket(archive, rows) {
  if (!rows.length) return;
  const y = rows[0].y;
  const q = qOf(rows[0].m);
  const last = archive[archive.length - 1];
  const units = rows.reduce((a, r) => a + (Number(r.units) || 0), 0);
  const rev = rows.reduce((a, r) => a + (Number(r.rev) || 0), 0);
  if (last && last.y === y && last.q === q) {
    last.months += rows.length;
    last.units += units;
    last.rev += rev;
    return;
  }
  archive.push({ y, q, months: rows.length, units, rev });
}

export function compactModelHistory(model) {
  if (!model) return;
  compactInto(model, 'history', 'historyArchive', addModelBucket);
}

export function compactAll(state) {
  if (!state) return;
  compactInto(state, 'history', 'historyArchive', addHistoryBucket);
  compactInto(state, 'compHistory', 'compHistoryArchive', addCompBucket);
  for (const m of state.models || []) compactModelHistory(m);
}

// 展开为月度序列（季度归档按 months 均分，图表与统计可直接复用）
export function historyRows(state, months = 48) {
  const out = [];
  for (const b of state?.historyArchive || []) {
    const n = Math.max(1, Number(b.months) || 3);
    for (let i = 0; i < n; i++) {
      out.push({
        y: b.y, m: (Number(b.q) || 0) * 3 + i,
        revenue: (Number(b.revenue) || 0) / n,
        net: (Number(b.net) || 0) / n,
        units: (Number(b.units) || 0) / n,
        cash: b.cash || 0, share: b.share || 0, brand: b.brand || 0,
        aggregated: true,
      });
    }
  }
  out.push(...(state?.history || []));
  return out.slice(-months);
}

export function historyTotals(state, months = Infinity) {
  const rows = months === Infinity ? [...(state?.historyArchive || []).map((b) => ({
    revenue: b.revenue || 0, net: b.net || 0, units: b.units || 0,
  })), ...(state?.history || [])] : historyRows(state, months);
  const sum = (k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  return { revenue: sum('revenue'), net: sum('net'), units: sum('units'), months: rows.length };
}

export function historyMaxUnits(state) {
  let max = 0;
  for (const b of state?.historyArchive || []) {
    const n = Math.max(1, Number(b.months) || 3);
    max = Math.max(max, (Number(b.units) || 0) / n);
  }
  for (const h of state?.history || []) max = Math.max(max, Number(h.units) || 0);
  return max;
}

export function compHistoryRows(state, months = 12) {
  const out = [];
  for (const b of state?.compHistoryArchive || []) {
    const n = Math.max(1, Number(b.months) || 3);
    for (let i = 0; i < n; i++) {
      out.push({
        y: b.y, m: (Number(b.q) || 0) * 3 + i,
        rows: (b.rows || []).map((r) => ({
          ...r,
          units: (Number(r.units) || 0) / n,
          rev: (Number(r.rev) || 0) / n,
        })),
      });
    }
  }
  out.push(...(state?.compHistory || []));
  return out.slice(-months);
}

export function modelHistoryRows(model, months = 12) {
  const out = [];
  for (const b of model?.historyArchive || []) {
    const n = Math.max(1, Number(b.months) || 3);
    for (let i = 0; i < n; i++) {
      out.push({
        y: b.y, m: (Number(b.q) || 0) * 3 + i,
        units: (Number(b.units) || 0) / n,
        rev: (Number(b.rev) || 0) / n,
      });
    }
  }
  out.push(...(model?.history || []));
  return out.slice(-months);
}