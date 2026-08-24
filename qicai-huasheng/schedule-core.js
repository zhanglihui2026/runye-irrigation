// 七彩花生植保节点统一数据源
// 其它页面只引用这里导出的 QICAI_PLAN_NODES / QICAI_SCHEDULE / QICAI_SCHEDULE_DETAILS，避免多处维护导致方案漂移。
(function(){
  var PLAN_NODES = [
  {
    "group": "播种前 · 整地期",
    "dayText": "播种前 · 土壤处理",
    "dayMin": -60,
    "dayMax": -8,
    "op": "底肥 / 撒施",
    "count": "1 种",
    "cats": {
      "消毒": [
        "生石灰 50–80 kg/亩"
      ]
    },
    "mix": "必须独立：与后续底肥间隔 ≥7 天，单独撒施；碱性强，勿与铵态氮 / 菌剂同施。",
    "flags": [
      "独立"
    ]
  },
  {
    "group": "播种前 · 整地期",
    "dayText": "整地期（生石灰后 ≥7 天）",
    "dayMin": -7,
    "dayMax": -1,
    "op": "底肥 / 撒施",
    "count": "3 种",
    "cats": {
      "肥菌": [
        "友擎有机肥 80 kg",
        "高富专 13-17-15 40 kg",
        "地腾（精甲·嘧菌酯）5 kg"
      ]
    },
    "mix": "三者混匀同施；覆土 10–30 cm，严禁触根。",
    "flags": []
  },
  {
    "group": "苗期 · 叶面除草",
    "dayText": "播后苗前（≤3 天）",
    "dayMin": 0,
    "dayMax": 3,
    "op": "叶面喷雾",
    "count": "2 种",
    "cats": {
      "除草": [
        "精异丙甲草胺 50–100 ml",
        "双氯磺草胺 3–4 g"
      ]
    },
    "mix": "封闭除草组合同桶；（独立）不与杀虫 / 杀菌 / 营养混；墒情适中均匀喷。",
    "flags": [
      "独立"
    ]
  },
  {
    "group": "苗期 · 叶面除草",
    "dayText": "苗后",
    "dayMin": 4,
    "dayMax": 14,
    "op": "叶面喷雾",
    "count": "2 种",
    "cats": {
      "除草": [
        "烯草酮 50 ml",
        "双氯磺草胺 2 g"
      ]
    },
    "mix": "苗后除草同桶；（独立）避开高温；阔叶 + 尖叶兼顾。",
    "flags": [
      "独立"
    ]
  },
  {
    "group": "播后 15–40 天 · 促根开花下针",
    "dayText": "播后 15–20 天",
    "dayMin": 15,
    "dayMax": 20,
    "op": "叶面 ＋ 灌根",
    "count": "叶面 8 ＋ 灌根 2",
    "cats": {
      "杀虫": [
        "锐动",
        "铜拳",
        "虫螨腈·虱螨脲"
      ],
      "杀菌": [
        "腾丰",
        "美得乐"
      ],
      "控旺": [
        "小胖子"
      ],
      "营养": [
        "聚合磷助剂",
        "硼钼"
      ],
      "灌根": [
        "根际香土 2 kg",
        "削线 1 kg"
      ]
    },
    "mix": "叶面 8 种同桶一次喷；灌根 2 种同桶。叶面与灌根分两次施。现配现用、二次稀释。",
    "flags": []
  },
  {
    "group": "播后 15–40 天 · 促根开花下针",
    "dayText": "播后 25–30 天（50% 开花）",
    "dayMin": 25,
    "dayMax": 30,
    "op": "叶面 ＋ 灌根",
    "count": "叶面 8 ＋ 灌根 4",
    "cats": {
      "杀虫": [
        "虫螨腈·虱螨脲",
        "铜拳",
        "锐动"
      ],
      "杀菌": [
        "秀艳"
      ],
      "控旺": [
        "适大进"
      ],
      "营养": [
        "磷酸二氢钾",
        "聚合磷助剂",
        "硼钼"
      ],
      "灌根": [
        "根际香土 2 kg",
        "剿灭 500 ml",
        "苗乐乐 250 ml",
        "水溶肥 12-30-8 2 kg"
      ]
    },
    "mix": "叶面 8 同桶；灌根 4 同桶（苗乐乐含杀菌 + 寡糖，与根际香土 / 水溶肥 / 剿灭兼容）。开花期避中午施。",
    "flags": []
  },
  {
    "group": "播后 15–40 天 · 促根开花下针",
    "dayText": "播后 30–35 天",
    "dayMin": 31,
    "dayMax": 35,
    "op": "灌根",
    "count": "2 种",
    "cats": {
      "营养": [
        "水溶肥 12-30-8 2 kg",
        "铠仆（海藻）1 L"
      ]
    },
    "mix": "同桶；促下针、抗逆。",
    "flags": []
  },
  {
    "group": "播后 15–40 天 · 促根开花下针",
    "dayText": "播后 35–40 天",
    "dayMin": 36,
    "dayMax": 40,
    "op": "叶面 ＋ 灌根",
    "count": "叶面 8 ＋ 灌根 2",
    "cats": {
      "杀虫": [
        "铜拳",
        "锐动"
      ],
      "杀菌": [
        "美得乐",
        "秀艳"
      ],
      "控旺": [
        "适大进"
      ],
      "营养": [
        "磷酸二氢钾",
        "聚合磷助剂",
        "硼钼"
      ],
      "灌根": [
        "水溶肥 12-30-8 2 kg",
        "泰稳丰（钙镁）1 L"
      ]
    },
    "mix": "叶面 8 同桶；灌根 2 同桶。",
    "flags": []
  },
  {
    "group": "控旺专篇 · 看苗调整",
    "dayText": "播后 45–50 天（核心控旺）",
    "dayMin": 45,
    "dayMax": 50,
    "op": "叶面控旺 / 看苗调整",
    "count": "可选控旺 1 项",
    "cats": {
      "控旺": [
        "烯效唑（或多效唑仅此次，按标签常规量 2/3–全量）"
      ],
      "营养": [
        "可搭配磷酸二氢钾 / 硼肥；弱苗、受旱、黄苗地块不控"
      ]
    },
    "mix": "控旺专篇并入主操作历：以株高 30–35 cm、大量果针入土为触发；长势弱、受旱、叶色发黄则跳过。多效唑每季最多 1 次，避免与三唑类杀菌剂叠加抑长。",
    "flags": [
      "控旺",
      "可选"
    ]
  },
  {
    "group": "荚果充实期 · 播后 55–80 天",
    "dayText": "播后 55–60 天",
    "dayMin": 55,
    "dayMax": 60,
    "op": "叶面",
    "count": "11 种（偏多）",
    "cats": {
      "杀虫": [
        "虫螨腈·虱螨脲",
        "铜拳",
        "锐动"
      ],
      "杀菌": [
        "秀艳",
        "美得乐",
        "拜亩乐"
      ],
      "控旺": [
        "妥控"
      ],
      "营养": [
        "磷酸二氢钾",
        "聚合磷助剂",
        "硼钼",
        "金收"
      ]
    },
    "mix": "偏多，建议分 2 桶：桶①杀虫3 + 营养（聚合磷 + 硼钼 + 金收）；桶②杀菌3（秀艳 + 美得乐 + 拜亩乐）+ 控旺（妥控）+ 磷酸二氢钾。注意秀艳 + 拜亩乐均含三唑，控旺叠加 → 保留 1 种或减量。",
    "flags": [
      "偏多",
      "三唑"
    ]
  },
  {
    "group": "控旺专篇 · 看苗调整",
    "dayText": "播后 68–74 天（控旺复查）",
    "dayMin": 68,
    "dayMax": 74,
    "op": "叶面控旺 / 复查",
    "count": "可选轻控 1 项",
    "cats": {
      "控旺": [
        "调环酸钙（常规量 1/3–1/2，看苗轻控）"
      ],
      "营养": [
        "磷酸二氢钾 / 聚合磷助剂 / 硼钼，防早衰、促饱果"
      ]
    },
    "mix": "第 4 遍后复查株高：若已稳定在 40 cm 左右可跳过，若继续旺长则轻控；避免后期过度控旺导致早衰。可与营养同桶，小样杯混后使用。",
    "flags": [
      "控旺",
      "可选"
    ]
  },
  {
    "group": "荚果充实期 · 播后 55–80 天",
    "dayText": "播后 75–80 天",
    "dayMin": 75,
    "dayMax": 80,
    "op": "叶面",
    "count": "10 种（偏多）",
    "cats": {
      "杀虫": [
        "锐动",
        "虫螨腈·虱螨脲",
        "铜拳"
      ],
      "杀菌": [
        "美得乐",
        "拜亩乐"
      ],
      "控旺": [
        "适大进"
      ],
      "营养": [
        "金收",
        "磷酸二氢钾",
        "聚合磷助剂",
        "硼钼"
      ]
    },
    "mix": "偏多，建议分 2 桶：桶①杀虫3 + 营养；桶②杀菌2（美得乐 + 拜亩乐）+ 控旺（适大进）+ 磷酸二氢钾。仅 1 个三唑（拜亩乐），控旺风险可控。",
    "flags": [
      "偏多"
    ]
  },
  {
    "group": "荚果期 · 灌根为主",
    "dayText": "荚果期（80% 封垄、鸡头状）",
    "dayMin": 81,
    "dayMax": 89,
    "op": "灌根",
    "count": "4 种",
    "cats": {
      "肥菌": [
        "水溶肥 10-5-35 2 kg",
        "泰稳丰 1 L",
        "苗乐乐 350 ml",
        "削线 1 kg"
      ]
    },
    "mix": "同桶；根果同护（营养 ＋ 防线虫 ＋ 防根腐 / 白绢）。",
    "flags": []
  },
  {
    "group": "荚果期 · 灌根为主",
    "dayText": "间隔 7–10 天 ×2（巩固）",
    "dayMin": 90,
    "dayMax": 99,
    "op": "灌根",
    "count": "3 / 2 种",
    "cats": {
      "肥菌": [
        "轮① 水溶肥 10-5-35 3 kg + 根际香土 2 kg + 泰稳丰 1 L",
        "轮② 水溶肥 10-5-35 3 kg + 泰稳丰 1 L"
      ]
    },
    "mix": "同桶；巩固荚果饱满度。两轮间隔 7–10 天。",
    "flags": []
  },
  {
    "group": "收获前",
    "dayText": "播后 100 天（收获前）",
    "dayMin": 100,
    "dayMax": 9999,
    "op": "叶面",
    "count": "9 种（偏多）",
    "cats": {
      "杀虫": [
        "虫螨腈·虱螨脲",
        "铜拳",
        "锐动"
      ],
      "杀菌": [
        "美得乐",
        "拜亩乐"
      ],
      "营养": [
        "金收",
        "磷酸二氢钾",
        "聚合磷助剂",
        "硼钼"
      ]
    },
    "mix": "偏多，建议分 2 桶；收获前严格按各药标签安全间隔期停喷。美得乐 + 拜亩乐可同桶。",
    "flags": [
      "偏多"
    ]
  }
];
  var CAT_ORDER = ['消毒','土壤消毒','肥菌','底肥菌剂','除草','杂草防除','杀虫','虫害防治','杀菌','病害防治','控旺','生长调控','营养','叶面营养','灌根','灌根调理'];
  var CAT_COLOR = {
    '消毒':'#2b7bb0','土壤消毒':'#2b7bb0','肥菌':'#2b7bb0','底肥菌剂':'#2b7bb0','营养':'#2b7bb0','叶面营养':'#2b7bb0','灌根':'#2b7bb0','灌根调理':'#2b7bb0',
    '除草':'#c0392b','杂草防除':'#c0392b','杀虫':'#c0392b','虫害防治':'#c0392b',
    '杀菌':'#e67e22','病害防治':'#e67e22',
    '控旺':'#8e44ad','生长调控':'#8e44ad'
  };
  var CAT_LABEL = {
    '土壤消毒':'消毒','底肥菌剂':'肥/菌','杂草防除':'除草','虫害防治':'杀虫','病害防治':'杀菌','生长调控':'控旺','叶面营养':'营养','灌根调理':'灌根','肥菌':'肥/菌'
  };
  // 各节点农资的每亩/每块用量：在搭配清单中自动追加，已含用量的条目不再重复。
  var ITEM_DOSE = {
    '播种前 · 土壤处理': {'消毒':{'生石灰':'50–80 kg/亩'}},
    '整地期（生石灰后 ≥7 天）': {'肥菌':{'友擎有机肥':'80 kg','高富专 13-17-15':'40 kg','地腾（精甲·嘧菌酯）':'5 kg'}},
    '播后苗前（≤3 天）': {'除草':{'精异丙甲草胺':'50–100 ml','双氯磺草胺':'3–4 g'}},
    '苗后': {'除草':{'烯草酮':'50 ml','双氯磺草胺':'2 g'}},
    '播后 15–20 天': {'杀虫':{'锐动':'30 g/亩','铜拳':'30 g/亩','虫螨腈·虱螨脲':'30 g/亩'}, '杀菌':{'腾丰':'30 g/亩','美得乐':'30 g/亩'}, '控旺':{'小胖子':'50 g/亩'}, '营养':{'聚合磷助剂':'100 g/亩','硼钼':'100 g/亩'}, '灌根':{'根际香土':'2 kg','削线':'1 kg'}},
    '播后 25–30 天（50% 开花）': {'杀虫':{'虫螨腈·虱螨脲':'50 g/亩','铜拳':'30 g/亩','锐动':'30 g/亩'}, '杀菌':{'秀艳':'30 g/亩'}, '控旺':{'适大进':'20 g/亩'}, '营养':{'磷酸二氢钾':'100 g/亩','聚合磷助剂':'100 g/亩','硼钼':'100 g/亩'}, '灌根':{'根际香土':'2 kg','剿灭':'500 ml','苗乐乐':'250 ml','水溶肥 12-30-8':'2 kg'}},
    '播后 30–35 天': {'营养':{'水溶肥 12-30-8':'2 kg','铠仆（海藻）':'1 L'}},
    '播后 35–40 天': {'杀虫':{'铜拳':'30 g/亩','锐动':'30 g/亩'}, '杀菌':{'美得乐':'30 g/亩','秀艳':'30 g/亩'}, '控旺':{'适大进':'30 g/亩'}, '营养':{'磷酸二氢钾':'100 g/亩','聚合磷助剂':'100 g/亩','硼钼':'100 g/亩'}, '灌根':{'水溶肥 12-30-8':'2 kg','泰稳丰（钙镁）':'1 L'}},
    '播后 55–60 天': {'杀虫':{'虫螨腈·虱螨脲':'50 g/亩','铜拳':'30 g/亩','锐动':'30 g/亩'}, '杀菌':{'秀艳':'30 g/亩','美得乐':'50 g/亩','拜亩乐':'30 g/亩'}, '控旺':{'妥控':'30 g/亩'}, '营养':{'磷酸二氢钾':'100 g/亩','聚合磷助剂':'100 g/亩','硼钼':'100 g/亩','金收':'50 g/亩'}},
    '播后 75–80 天': {'杀虫':{'锐动':'30 g/亩','虫螨腈·虱螨脲':'50 g/亩','铜拳':'30 g/亩'}, '杀菌':{'美得乐':'50 g/亩','拜亩乐':'30 g/亩'}, '控旺':{'适大进':'30 g/亩'}, '营养':{'金收':'50 g/亩','磷酸二氢钾':'100 g/亩','聚合磷助剂':'100 g/亩','硼钼':'100 g/亩'}},
    '荚果期（80% 封垄、鸡头状）': {'肥菌':{'水溶肥 10-5-35':'2 kg','泰稳丰':'1 L','苗乐乐':'350 ml','削线':'1 kg'}},
    '播后 100 天（收获前）': {'杀虫':{'虫螨腈·虱螨脲':'50 g/亩','铜拳':'30 g/亩','锐动':'30 g/亩'}, '杀菌':{'美得乐':'50 g/亩','拜亩乐':'30 g/亩'}, '营养':{'金收':'50 g/亩','磷酸二氢钾':'100 g/亩','聚合磷助剂':'100 g/亩','硼钼':'100 g/亩'}}
  };
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function stripHtml(s){ return String(s == null ? '' : s).replace(/<br\s*\/?\s*>/gi,'；').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"'); }
  function catKeys(cats){
    var keys = Object.keys(cats || {});
    keys.sort(function(a,b){
      var ia = CAT_ORDER.indexOf(a); if(ia < 0) ia = 999;
      var ib = CAT_ORDER.indexOf(b); if(ib < 0) ib = 999;
      return ia - ib || a.localeCompare(b, 'zh-CN');
    });
    return keys;
  }
  function catLabel(cat){ return CAT_LABEL[cat] || cat; }
  function catHtml(cat){
    var color = CAT_COLOR[cat] || '#2b7bb0';
    return '<span style="color:'+color+';font-weight:700">'+esc(catLabel(cat))+'</span>';
  }
  function itemWithDose(node, cat, item){
    var byCat = (ITEM_DOSE[node.dayText] || {})[cat];
    if(!byCat) return item;
    for(var base in byCat){
      if(item.indexOf(base) === 0){
        var dose = byCat[base];
        if(item.indexOf(dose) === -1) return item + ' ' + dose;
      }
    }
    return item;
  }
  function itemsText(items, node, cat){ return (items || []).map(function(item){ return itemWithDose(node, cat, String(item)); }).join(' ＋ '); }
  function listHtml(node){
    var parts = [];
    catKeys(node.cats).forEach(function(cat){
      var chunk = catHtml(cat)+'：'+esc(itemsText(node.cats[cat], node, cat));
      if((cat === '灌根' || cat === '灌根调理') && parts.length){ chunk = '<br>'+chunk; }
      parts.push(chunk);
    });
    return parts.join(' ｜ ');
  }
  function listPlain(node){ return stripHtml(listHtml(node)); }
  function stageTitle(group){ return '▶ '+String(group || '').replace(/·/g, '·'); }
  function buildSchedule(nodes){
    var out = [];
    var lastGroup = null;
    nodes.forEach(function(node, idx){
      if(node.group !== lastGroup){
        out.push({type:'stage', title:stageTitle(node.group)});
        lastGroup = node.group;
      }
      out.push({
        type:'row',
        nd:String(idx + 1),
        dayText:node.dayText,
        stage:node.dayText,
        op:String(node.op || '').replace(/\s*\/\s*/g,' '),
        count:node.count,
        list:listHtml(node),
        mix:node.mix
      });
    });
    return out;
  }
  function buildDetails(nodes){
    var out = {};
    nodes.forEach(function(node){
      out[node.dayText] = { listHtml:listHtml(node), mixHtml:node.mix };
    });
    return out;
  }
  function enrich(nodes){
    return nodes.map(function(node, idx){
      var copy = {};
      Object.keys(node).forEach(function(k){ copy[k] = node[k]; });
      copy.nd = idx + 1;
      copy.dayFrom = node.dayMin;
      copy.stage = node.dayText;
      copy.listHtml = listHtml(node);
      copy.list = listPlain(node);
      return copy;
    });
  }
  function findPlanNode(days){
    var active = null, prev = null, next = null;
    for(var i=0;i<window.QICAI_NODES.length;i++){
      var node = window.QICAI_NODES[i];
      if(days >= node.dayMin && days <= node.dayMax && !active){ active = node; }
      if(node.dayMax < days){ prev = node; }
      if(node.dayMin > days && !next){ next = node; }
    }
    return { active:active, prev:prev, next:next, display:active || next || prev, gap:!active };
  }
  window.QICAI_PLAN_NODES = enrich(PLAN_NODES);
  window.QICAI_NODES = window.QICAI_PLAN_NODES;
  window.QICAI_SCHEDULE = buildSchedule(window.QICAI_PLAN_NODES);
  window.QICAI_SCHEDULE_DETAILS = buildDetails(window.QICAI_PLAN_NODES);
  window.QICAI_findPlanNode = findPlanNode;
})();
