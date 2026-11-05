// 玩家评论库：按评分档位 + 机型特征选词
// score 档位：[min, max)；tags 命中机型特征时优先出专属梗
export const COMMENTS = [
  // ---- 差评（0~35）----
  { min: 0, max: 35, text: '这电池是纸糊的吗？下午三点就跪了。', tag: 'battery' },
  { min: 0, max: 35, text: '拍出来的照片像打了马赛克，这摄像头是装饰品？', tag: 'camera' },
  { min: 0, max: 35, text: '开个微信都卡，这是手机还是暖手宝？', tag: 'perf' },
  { min: 0, max: 35, text: '用了三天，屏幕出现了一条亮线。退货了。' },
  { min: 0, max: 35, text: '充电两小时，通话五分钟，梦回 2010。', tag: 'charge' },
  { min: 0, max: 35, text: '系统动画掉帧严重，幻灯片既视感。', tag: 'os' },
  { min: 0, max: 35, text: '品控堪忧，第二台边框还是歪的。' },
  { min: 0, max: 35, text: '这个价位买它？我推荐再加点钱上别家。' },
  { min: 0, max: 35, text: '信号在家里的卫生间直接归零，用过最差的接收。' },
  { min: 0, max: 35, text: '扬声器放歌像隔着棉被在放，外放基本不能用。' },
  { min: 0, max: 35, text: '买来七天坏了两次，售后还让我等配件。' },
  { min: 0, max: 35, text: '宣传页上的功能一半要等 OTA，期货实锤。' },

  // ---- 偏差评（35~52）----
  { min: 35, max: 52, text: '中规中矩，没什么短板也没什么惊喜。' },
  { min: 35, max: 52, text: '这价格能买到这配置，凑合能用吧。' },
  { min: 35, max: 52, text: '续航勉强一天，重度使用得带充电宝。', tag: 'battery' },
  { min: 35, max: 52, text: '拍照白天还行，晚上全靠算法瞎猜。', tag: 'camera' },
  { min: 35, max: 52, text: '系统广告有点多，关了又弹。', tag: 'os' },
  { min: 35, max: 52, text: '性能日常够用，打游戏就算了。', tag: 'perf' },
  { min: 35, max: 52, text: '做工一般，缝隙能插进一张 A4 纸。' },
  { min: 35, max: 52, text: '首批批次品控一般，建议观望下一代。' },
  { min: 35, max: 52, text: '不是不能买，是同价位有更好的选择。' },
  { min: 35, max: 52, text: '屏幕色准一般， imshow 出门都不好意思调色。' },
  { min: 35, max: 52, text: '指纹解锁偶尔失灵，脸倒挺快。' },

  // ---- 中评（52~68）----
  { min: 52, max: 68, text: '水桶机，没有明显短板，也没有长板。' },
  { min: 52, max: 68, text: '这个价位性能释放挺良心，可以冲。', tag: 'perf' },
  { min: 52, max: 68, text: '续航比上代强多了，一天妥妥的。', tag: 'battery' },
  { min: 52, max: 68, text: '主摄白天很能打，夜景再优化一下就完美。', tag: 'camera' },
  { min: 52, max: 68, text: '充电是真的快，洗漱工夫就满了。', tag: 'charge' },
  { min: 52, max: 68, text: '系统流畅度不错，就是动画逻辑要适应几天。', tag: 'os' },
  { min: 52, max: 68, text: '手感比参数表好看，重量压得不错。' },
  { min: 52, max: 68, text: '给爸妈买的第一台智能机，够用了。' },
  { min: 52, max: 68, text: '这个配色真机比渲染图好看。' },
  { min: 52, max: 68, text: '同价位对比了三台，最后还是选了它，不后悔。' },
  { min: 52, max: 68, text: '小毛病有（偶尔断触），但整体值这个价。' },
  { min: 52, max: 68, text: '扬声器对称双单元，外放终于不糊了。', tag: 'speaker' },

  // ---- 好评（68~85）----
  { min: 68, max: 85, text: '真香机，同价位闭眼冲。' },
  { min: 68, max: 85, text: '这续航配合快充，彻底告别电量焦虑。', tag: 'battery' },
  { min: 68, max: 85, text: '夜景模式出乎意料，直出就能发朋友圈。', tag: 'camera' },
  { min: 68, max: 85, text: '游戏满帧不烫手，这颗芯片调校可以。', tag: 'perf' },
  { min: 68, max: 85, text: '手感、屏幕、续航三样都在线，今年的黑马。' },
  { min: 68, max: 85, text: '系统更新勤快，老机型也在维护，好评。', tag: 'os' },
  { min: 68, max: 85, text: '屏下摄像头终于不凸了，正面完整屏真舒服。', tag: 'udc' },
  { min: 68, max: 85, text: '折叠屏展开追剧，合上揣兜，通勤神器。', tag: 'fold' },
  { min: 68, max: 85, text: '无线充电 50W，随放随充，办公桌党狂喜。', tag: 'wireless' },
  { min: 68, max: 85, text: '这个颜色的工艺真讲究，光线下一层层渐变。' },
  { min: 68, max: 85, text: '从上代换过来，方方面面都是升级，稳。' },
  { min: 68, max: 85, text: '扬声器、马达、NFC 全都有，细节控满意。' },
  { min: 68, max: 85, text: '全家桶用户无脑入，互联体验无缝。', tag: 'os' },
  { min: 68, max: 85, text: '拍照直出的色彩终于不寡淡了，有德味。', tag: 'camera' },

  // ---- 好评+（85~100）----
  { min: 85, max: 101, text: '年度旗舰预定， Find 到目前为止最强的全能选手。' },
  { min: 85, max: 101, text: '水桶旗舰，挑不出毛病，钱包已交出。' },
  { min: 85, max: 101, text: '影像旗舰名不虚传，夜景人像直接封神。', tag: 'camera' },
  { min: 85, max: 101, text: '两天一充的重度续航怪，旗舰里独一份。', tag: 'battery' },
  { min: 85, max: 101, text: '120W 快充 19 分钟充满，实测比官宣还快。', tag: 'charge' },
  { min: 85, max: 101, text: '自研芯片的调度就是顺，能效比肉眼可见地强。', tag: 'owncpu' },
  { min: 85, max: 101, text: '自研系统动画细腻流畅，这钱花在刀刃上了。', tag: 'ownos' },
  { min: 85, max: 101, text: '折叠屏铰链终于无折痕，这才是完成体。', tag: 'fold' },
  { min: 85, max: 101, text: '一次到位的配置单，官网直接顶配走起。' },
  { min: 85, max: 101, text: '手感与质感兼具，第一次觉得国产旗舰不输任何人。' },
  { min: 85, max: 101, text: '首发抢到，用了两周只想说：等等党这次输了。' },
  { min: 85, max: 101, text: '给全家人都换上了，一致好评。' },

  // ---- 价格梗（任何档位可能出现的语气加成）----
  { min: 0, max: 101, text: '等等党表示：等下一代降价再说。', priceTag: 'wait' },
  { min: 0, max: 101, text: '首发加价买的，现在看溢价还能接受。', priceTag: 'high' },
  { min: 0, max: 101, text: '这个定价是真敢标，勇气可嘉。', priceTag: 'high' },
  { min: 0, max: 101, text: '性价比卷王，直接把同行价格打下来了。', priceTag: 'low' },
  { min: 0, max: 101, text: '千元价位卷成这样，厂商疯了吧。', priceTag: 'low' },

  // ---- 第二批：差评补充（0~35）----
  { min: 0, max: 35, text: '拆快递的时候以为是保护壳，原来是整机，轻薄得让人心慌。' },
  { min: 0, max: 35, text: '打游戏十分钟，降频降得像老爷机。', tag: 'perf' },
  { min: 0, max: 35, text: '这屏幕亮度，大太阳底下全靠想象力。', tag: 'screen' },
  { min: 0, max: 35, text: '折叠了两百次铰链就咯吱响，这是手机还是折凳？', tag: 'fold' },
  { min: 0, max: 35, text: '所谓的自研芯片，跑分还没上代中端强。', tag: 'owncpu' },
  { min: 0, max: 35, text: '自研系统bug比功能还多，提交反馈石沉大海。', tag: 'ownos' },
  { min: 0, max: 35, text: '无线充电板还不通用，买了它就得全家桶。', tag: 'wireless' },
  { min: 0, max: 35, text: '拍照按钮位置反人类，每次都按到音量键。' },
  { min: 0, max: 35, text: '机身后盖用俩月就掉漆，这做工对不起价格。' },
  { min: 0, max: 35, text: '客服说重启试试，我说试过了，他说再试试。' },
  { min: 0, max: 35, text: '导航定位飘得像在开飞船，高架上直接迷路。' },
  { min: 0, max: 35, text: '发布会上吹的天花乱坠，到手啥都要等OTA。', tag: 'os' },

  // ---- 偏差评补充（35~52）----
  { min: 35, max: 52, text: '屏幕素质对得起价格，就是边框能跑火车。', tag: 'screen' },
  { min: 35, max: 52, text: '半斤重的机身，练腕力倒是一流。' },
  { min: 35, max: 52, text: '折叠屏是挺酷，但折痕和重量你得接受。', tag: 'fold' },
  { min: 35, max: 52, text: '无线充电速度感人，睡前放上早上满。', tag: 'wireless' },
  { min: 35, max: 52, text: '自研芯片第一代能有这水平不容易，但离旗舰还有距离。', tag: 'owncpu' },
  { min: 35, max: 52, text: '系统是自研的，流畅度尚可，生态还得再养养。', tag: 'ownos' },
  { min: 35, max: 52, text: '长焦自拍比主摄还清楚，这取向我服。', tag: 'camera' },
  { min: 35, max: 52, text: '双扬声器终于有了，但音质马马虎虎。', tag: 'speaker' },
  { min: 35, max: 52, text: '信号比上代好多了，电梯里终于不归零。' },
  { min: 35, max: 52, text: '充电口终于换成通用的了，出门少带一根线。', tag: 'charge' },
  { min: 35, max: 52, text: '这价格买屏幕不错，买影像就别想了。' },
  { min: 35, max: 52, text: '散热背夹一夹是台好手机，不夹是台暖手宝。', tag: 'perf' },

  // ---- 中评补充（52~68）----
  { min: 52, max: 68, text: '屏幕观感细腻，亮度也上来了，户外终于能看清。', tag: 'screen' },
  { min: 52, max: 68, text: '重量控制得不错，长时间刷视频手腕不酸。' },
  { min: 52, max: 68, text: '屏下摄像头日常感觉不到，自拍党可能介意。', tag: 'udc' },
  { min: 52, max: 68, text: '折叠态能当临时支架，展开看剧是真舒服。', tag: 'fold' },
  { min: 52, max: 68, text: '自研芯片调校越来越成熟了，日常完全无感切换。', tag: 'owncpu' },
  { min: 52, max: 68, text: '自研系统更新勤快，这月连推两个大版本。', tag: 'ownos' },
  { min: 52, max: 68, text: '无线反向充电救过我同事一命（耳机党狂喜）。', tag: 'wireless' },
  { min: 52, max: 68, text: '续航实测亮屏八小时，重度用户可以放心。', tag: 'battery' },
  { min: 52, max: 68, text: '影音体验拉满，双扬声器加好屏幕就是追剧机。', tag: 'speaker' },
  { min: 52, max: 68, text: '信号稳，地铁过隧道视频不断流。' },
  { min: 52, max: 68, text: '这个价位的影像能打八十分，长焦微距都有模有样。', tag: 'camera' },
  { min: 52, max: 68, text: '系统功能丰富，就是学习成本高了点。', tag: 'os' },
  { min: 52, max: 68, text: '做工比上代进步明显，接缝紧密盖板服帖。' },
  { min: 52, max: 68, text: '买它纯粹因为手感，回上代的价格真是理智。' },

  // ---- 好评补充（68~85）----
  { min: 68, max: 85, text: '屏下摄像头正面一体性无敌，强迫症治愈了。', tag: 'udc' },
  { min: 68, max: 85, text: '折叠屏终于又轻又薄，展开那刻值回票价。', tag: 'fold' },
  { min: 68, max: 85, text: '自研芯片这代成了，能效直接反超公版，准备长期持有。', tag: 'owncpu' },
  { min: 68, max: 85, text: '自研OS的互联体验，全家桶用户回不去了。', tag: 'ownos' },
  { min: 68, max: 85, text: '50W无线快充实测半小时一半，床头板神器。', tag: 'wireless' },
  { min: 68, max: 85, text: '屏幕这块是真的顶，亮度和色准都是第一梯队。', tag: 'screen' },
  { min: 68, max: 85, text: '拍娃党表示抓拍成功率大增，计算摄影终于不糊弄。', tag: 'camera' },
  { min: 68, max: 85, text: '续航双一流：容量大+充电快，出门彻底告别充电宝。', tag: 'battery' },
  { min: 68, max: 85, text: '外放看球赛跟电视似的，对称式扬声器就是爽。', tag: 'speaker' },
  { min: 68, max: 85, text: '轻薄和续航本该矛盾，它俩居然都做到了。' },
  { min: 68, max: 85, text: '盲猜这是今年的钉子户机型——更新周期管够。', tag: 'os' },
  { min: 68, max: 85, text: '动手感质感这三件套：接缝、按键、阻尼，全是细节。' },

  // ---- 好评 premium（85~101）----
  { min: 85, max: 101, text: '年度机皇预定，找不到不买的理由——除了钱包。' },
  { min: 85, max: 101, text: '用了两周把备用机出了，这就是我的全部答案。' },
  { min: 85, max: 101, text: '这代的产品力，友商发布会都拿来做对比页了。' },
  { min: 85, max: 101, text: '整个体验像流水一样顺，参数党挑不出刺。', tag: 'perf' },
  { min: 85, max: 101, text: '行业该谢谢它把卷的方向从价格带到了体验。' },

  // ---- 价格梗补充 ----
  { min: 0, max: 101, text: '等等党永不为奴，首发买的就是大冤种。', priceTag: 'high' },
  { min: 0, max: 101, text: '这定价是把品牌税算进去了吧？', priceTag: 'high' },
  { min: 0, max: 101, text: '加价两千上顶配，结果用的都是公版方案。', priceTag: 'high' },
  { min: 0, max: 101, text: '这价格我直接下单了，性价比就是最好的演技。', priceTag: 'low' },
  { min: 0, max: 101, text: '同配置便宜三百，还犹豫什么。', priceTag: 'low' },
  { min: 0, max: 101, text: '预算不多想买旗舰？看它，准没错。', priceTag: 'low' },
  { min: 0, max: 101, text: '现在观望是对的，蹲一个双十一好价。', priceTag: 'wait' },
  { min: 0, max: 101, text: '首发冲了，现在跌了三百，含泪当韭菜。', priceTag: 'wait' },
  { min: 0, max: 101, text: '不着急用就再等等，这价位一般半年腰斩。', priceTag: 'wait' },
];

// 机型特征标签：由设计推导，命中时优先出对应梗
export function modelCommentTags(model, design) {
  const tags = [];
  const p = (design && design.parts) || {};
  const b = (design && design.body) || {};
  const extras = p.extras || [];
  if (p.ownCpu) tags.push('owncpu');
  if (p.ownOs || (design && design.parts.system && String(design.parts.system).startsWith('sys_own'))) tags.push('ownos');
  if (extras.includes('x_udc')) tags.push('udc');
  if (b.fold && b.fold !== 'none') tags.push('fold');
  if (extras.includes('x_wless') || (design && design.charge && design.charge.wireless && design.charge.wireless !== 'wl0')) tags.push('wireless');
  if (design && design.camera && Array.isArray(design.camera.lenses)) tags.push('camera');
  if (design && design.body && design.body.ports && design.body.ports.dualSpeaker) tags.push('speaker');
  if (design && design.screen) tags.push('screen');
  if (design && design.charge) tags.push('charge');
  tags.push('battery', 'perf', 'os', 'camera', 'screen');
  return tags;
}

// 选 n 条评论：主档位 + 少量越档噪声，特征梗优先
export function pickComments(score, priceFair, tags, n = 3) {
  const band = COMMENTS.filter((c) => score >= c.min && score < c.max && !c.priceTag);
  const priceBand = COMMENTS.filter((c) => c.priceTag === 'wait' || (priceFair > 1.2 && c.priceTag === 'high') || (priceFair < 0.85 && c.priceTag === 'low'));
  const tagPool = COMMENTS.filter((c) => c.tag && tags.includes(c.tag) && score >= c.min - 6 && score < c.max + 6);
  const out = [];
  const used = new Set();
  const take = (pool) => {
    for (let i = 0; i < pool.length * 3 && out.length < n; i++) {
      const c = pool[Math.floor(Math.random() * pool.length)];
      if (!c || used.has(c.text)) continue;
      used.add(c.text);
      out.push(c.text);
      return;
    }
  };
  if (tagPool.length) take(tagPool);
  take(band);
  if (priceBand.length && out.length < n) take(priceBand);
  while (out.length < n && band.length) take(band);
  return out.slice(0, n);
}
