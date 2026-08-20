// 按天操作历（播种后天数）详情数据
// 来源：qicai-huasheng/index.html #schedule 表格
// 用途：被 peanut-tool.html 当前生育期决策模块点击弹窗直接引用
window.QICAI_SCHEDULE_DETAILS = {
  "播种前·土壤处理": {
    listHtml: "<span style='color:#2b7bb0;font-weight:700'>消毒</span>：生石灰 50–80 kg/亩",
    mixHtml: "必须独立：与后续底肥间隔 ≥7 天，单独撒施；碱性强，勿与铵态氮 / 菌剂同施。"
  },
  "整地期（生石灰后 ≥7 天）": {
    listHtml: "<span style='color:#2b7bb0;font-weight:700'>肥/菌</span>：友擎有机肥 80kg ＋ 高富专 13-17-15 40kg ＋ 地腾（精甲·嘧菌酯）5kg",
    mixHtml: "三者混匀同施；覆土 10–30 cm，严禁触根。"
  },
  "播后苗前（≤3 天）": {
    listHtml: "<span style='color:#c0392b;font-weight:700'>除草</span>：精异丙甲草胺 50–100ml ＋ 双氯磺草胺 3–4g",
    mixHtml: "封闭除草组合同桶；（独立）不与杀虫 / 杀菌 / 营养混；墒情适中均匀喷。"
  },
  "苗后": {
    listHtml: "<span style='color:#c0392b;font-weight:700'>除草</span>：烯草酮 50ml ＋ 双氯磺草胺 2g",
    mixHtml: "苗后除草同桶；（独立）避开高温；阔叶 + 尖叶兼顾。"
  },
  "播后 15–20 天": {
    listHtml: "【叶面 8】<span style='color:#c0392b;font-weight:700'>杀虫</span>：锐动 + 铜拳 + 虫螨腈·虱螨脲 ｜ <span style='color:#e67e22;font-weight:700'>杀菌</span>：腾丰 + 美得乐 ｜ <span style='color:#8e44ad;font-weight:700'>控旺</span>：小胖子 ｜ <span style='color:#2b7bb0;font-weight:700'>营养</span>：聚合磷助剂 + 硼钼<br>【灌根 2】根际香土 2kg ＋ 削线 1kg",
    mixHtml: "叶面 8 种同桶一次喷；灌根 2 种同桶。叶面与灌根分两次施。现配现用、二次稀释。"
  },
  "播后 25–30 天（50% 开花）": {
    listHtml: "【叶面 8】<span style='color:#c0392b;font-weight:700'>杀虫</span>：虫螨腈·虱螨脲 + 铜拳 + 锐动 ｜ <span style='color:#e67e22;font-weight:700'>杀菌</span>：秀艳 ｜ <span style='color:#8e44ad;font-weight:700'>控旺</span>：适大进 ｜ <span style='color:#2b7bb0;font-weight:700'>营养</span>：磷酸二氢钾 + 聚合磷助剂 + 硼钼<br>【灌根 4】根际香土 2kg ＋ 剿灭 500ml ＋ 苗乐乐 250ml ＋ 水溶肥 12-30-8 2kg",
    mixHtml: "叶面 8 同桶；灌根 4 同桶（苗乐乐含杀菌 + 寡糖，与根际香土 / 水溶肥 / 剿灭兼容）。开花期避中午施。"
  },
  "播后 30–35 天": {
    listHtml: "<span style='color:#2b7bb0;font-weight:700'>肥/刺激素</span>：水溶肥 12-30-8 2kg ＋ 铠仆（海藻）1L",
    mixHtml: "同桶；促下针、抗逆。"
  },
  "播后 35–40 天": {
    listHtml: "【叶面 8】<span style='color:#c0392b;font-weight:700'>杀虫</span>：铜拳 + 锐动 ｜ <span style='color:#e67e22;font-weight:700'>杀菌</span>：美得乐 + 秀艳 ｜ <span style='color:#8e44ad;font-weight:700'>控旺</span>：适大进 ｜ <span style='color:#2b7bb0;font-weight:700'>营养</span>：磷酸二氢钾 + 聚合磷助剂 + 硼钼<br>【灌根 2】水溶肥 12-30-8 2kg ＋ 泰稳丰（钙镁）1L",
    mixHtml: "叶面 8 同桶；灌根 2 同桶。"
  },
  "播后 55–60 天": {
    listHtml: "<span style='color:#c0392b;font-weight:700'>杀虫</span>：虫螨腈·虱螨脲 + 铜拳 + 锐动 ｜ <span style='color:#e67e22;font-weight:700'>杀菌</span>：秀艳 + 美得乐 + 拜亩乐 ｜ <span style='color:#8e44ad;font-weight:700'>控旺</span>：妥控 ｜ <span style='color:#2b7bb0;font-weight:700'>营养</span>：磷酸二氢钾 + 聚合磷助剂 + 硼钼 + 金收",
    mixHtml: "偏多，建议分 2 桶：桶① 杀虫 3 + 营养（聚合磷 + 硼钼 + 金收）；桶② 杀菌 3（秀艳 + 美得乐 + 拜亩乐）+ 控旺（妥控）+ 磷酸二氢钾。注意秀艳 + 拜亩乐均含三唑，控旺叠加 → 保留 1 种或减量。"
  },
  "播后 75–80 天": {
    listHtml: "<span style='color:#c0392b;font-weight:700'>杀虫</span>：锐动 + 虫螨腈·虱螨脲 + 铜拳 ｜ <span style='color:#e67e22;font-weight:700'>杀菌</span>：美得乐 + 拜亩乐 ｜ <span style='color:#8e44ad;font-weight:700'>控旺</span>：适大进 ｜ <span style='color:#2b7bb0;font-weight:700'>营养</span>：金收 + 磷酸二氢钾 + 聚合磷助剂 + 硼钼",
    mixHtml: "偏多，建议分 2 桶：桶① 杀虫 3 + 营养（聚合磷 + 硼钼 + 金收）；桶② 杀菌 2（美得乐 + 拜亩乐）+ 控旺（适大进）+ 磷酸二氢钾。仅 1 个三唑（拜亩乐），控旺风险可控。"
  },
  "荚果期（80% 封垄、鸡头状）": {
    listHtml: "<span style='color:#2b7bb0;font-weight:700'>肥/菌</span>：水溶肥 10-5-35 2kg ＋ 泰稳丰 1L ＋ 苗乐乐 350ml ＋ 削线 1kg",
    mixHtml: "同桶；根果同护（营养 ＋ 防线虫 ＋ 防根腐/白绢）。"
  },
  "间隔 7–10 天 ×2（巩固）": {
    listHtml: "轮①：水溶肥 10-5-35 3kg ＋ 根际香土 2kg ＋ 泰稳丰 1L（3 种）<br>轮②：水溶肥 10-5-35 3kg ＋ 泰稳丰 1L（2 种）",
    mixHtml: "同桶；巩固荚果饱满度。两轮间隔 7–10 天。"
  },
  "播后 100 天（收获前）": {
    listHtml: "<span style='color:#c0392b;font-weight:700'>杀虫</span>：虫螨腈·虱螨脲 + 铜拳 + 锐动 ｜ <span style='color:#e67e22;font-weight:700'>杀菌</span>：美得乐 + 拜亩乐 ｜ <span style='color:#2b7bb0;font-weight:700'>营养</span>：金收 + 磷酸二氢钾 + 聚合磷助剂 + 硼钼",
    mixHtml: "偏多，建议分 2 桶；收获前严格按各药标签安全间隔期停喷。美得乐 + 拜亩乐可同桶。"
  }
};
