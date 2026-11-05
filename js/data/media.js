// 媒体渠道：不同年代解锁不同投放渠道，覆盖人群与成本曲线不同
// 每渠道：月投入 → 触达(brand加成) + awareness(市场认知)
export const MEDIA_CHANNELS = [
  {
    id: 'flyer', name: '地推传单', icon: '✉',
    from: 1980, cost: 0.9,      // 效果/万元系数
    reach: 1.0, demo: 'entry',  // demo: 受众定位偏好
    desc: '街头发传单，便宜但只对低端机有效。',
  },
  {
    id: 'magazine', name: '数码杂志', icon: '▤',
    from: 1985, cost: 1.5,
    reach: 1.4, demo: 'flagship',
    desc: '深度评测背书，对高端机型品牌力帮助大。',
  },
  {
    id: 'billboard', name: '户外广告牌', icon: '◼',
    from: 1990, cost: 1.8,
    reach: 1.9, demo: 'main',
    desc: '地标大屏，广覆盖，适合大众定位走量机型。',
  },
  {
    id: 'tv', name: '电视广告', icon: '▶',
    from: 1995, cost: 2.6,
    reach: 2.8, demo: 'main',
    desc: '黄金时段贴片，覆盖面最广，价格也最贵。',
  },
  {
    id: 'web', name: '门户网站', icon: '🌐',
    from: 2005, cost: 2.0,
    reach: 2.4, demo: 'main',
    desc: '线上门户开屏与资讯流，性价比均衡。',
  },
  {
    id: 'social', name: '社交媒体', icon: '◈',
    from: 2012, cost: 1.6,
    reach: 2.2, demo: 'entry',
    desc: '种草与话题营销，年轻与入门人群转化好。',
  },
  {
    id: 'koc', name: '科技自媒体', icon: '⭐',
    from: 2016, cost: 1.9,
    reach: 2.0, demo: 'flagship',
    desc: '博主开箱评测，对旗舰与发烧友影响深。',
  },
];
export const MEDIA_MAP = Object.fromEntries(MEDIA_CHANNELS.map((c) => [c.id, c]));

// 受众定位偏好 ↔ 产品线定位（LINEUPS id）
export const DEMO_LINEUP = {
  entry: ['lite'],
  main: ['main', 'premium'],
  flagship: ['flagship', 'foldable'],
};
