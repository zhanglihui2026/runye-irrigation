// 按天操作历（播种后天数）—— 与植保方案《七彩花生全程植保技术方案》操作历同源
// 供「当前生育期决策」模块以 CAD 视口窗口形式展示，并由 NODES.active.dayText 高亮当前阶段。
// 每个数据行的 dayText 必须与 peanut-tool.html 中 NODES[].dayText 完全一致，才能正确高亮。
window.QICAI_SCHEDULE = [
  { type:'stage', title:'▶ 播种前 — 整地期（底肥模块）' },
  { type:'row', dayText:'播种前·土壤处理', nd:'1', stage:'播种前 · 土壤处理', op:'底肥<br>撒施', count:'1 种',
    list:'<span style="color:#2b7bb0;font-weight:700">消毒</span>：生石灰 50–80 kg/亩',
    mix:'必须独立：与后续底肥间隔 ≥7 天，单独撒施；碱性强，勿与铵态氮/菌剂同施。' },
  { type:'row', dayText:'整地期（生石灰后 ≥7 天）', nd:'2', stage:'整地期（生石灰后 ≥7 天）', op:'底肥<br>撒施', count:'3 种',
    list:'<span style="color:#2b7bb0;font-weight:700">肥/菌</span>：友擎有机肥 80kg ＋ 高富专13-17-15 40kg ＋ 地腾（精甲·嘧菌酯）5kg',
    mix:'三者混匀同施；覆土 10–30 cm，严禁触根。' },

  { type:'stage', title:'▶ 苗期（叶面除草模块）' },
  { type:'row', dayText:'播后苗前（≤3 天）', nd:'3', stage:'播后苗前（≤3 天）', op:'叶面<br>喷雾', count:'2 种',
    list:'<span style="color:#c0392b;font-weight:700">除草</span>：精异丙甲草胺 50–100ml ＋ 双氯磺草胺 3–4g',
    mix:'封闭除草组合同桶；（独立）不与杀虫/杀菌/营养混；墒情适中均匀喷。' },
  { type:'row', dayText:'苗后', nd:'4', stage:'苗后', op:'叶面<br>喷雾', count:'2 种',
    list:'<span style="color:#c0392b;font-weight:700">除草</span>：烯草酮 50ml ＋ 双氯磺草胺 2g',
    mix:'苗后除草同桶；（独立）避开高温；阔叶+尖叶兼顾。' },

  { type:'stage', title:'▶ 播后 15–40 天（促根 · 开花下针）' },
  { type:'row', dayText:'播后 15–20 天', nd:'5', stage:'播后 15–20 天', op:'叶面<br>＋灌根', count:'叶面 8<br>＋ 灌根 2',
    list:'【叶面 8】<span style="color:#c0392b;font-weight:700">杀虫</span>：锐动+铜拳+虫螨腈·虱螨脲 ｜ <span style="color:#e67e22;font-weight:700">杀菌</span>：腾丰+美得乐 ｜ <span style="color:#8e44ad;font-weight:700">控旺</span>：小胖子 ｜ <span style="color:#2b7bb0;font-weight:700">营养</span>：聚合磷助剂+硼钼<br>【灌根 2】根际香土 2kg ＋ 削线 1kg',
    mix:'叶面 8 种同桶一次喷；灌根 2 种同桶。叶面与灌根分两次施。现配现用、二次稀释。' },
  { type:'row', dayText:'播后 25–30 天（50% 开花）', nd:'6', stage:'播后 25–30 天（50% 开花）', op:'叶面<br>＋灌根', count:'叶面 8<br>＋ 灌根 4',
    list:'【叶面 8】<span style="color:#c0392b;font-weight:700">杀虫</span>：虫螨腈·虱螨脲+铜拳+锐动 ｜ <span style="color:#e67e22;font-weight:700">杀菌</span>：秀艳 ｜ <span style="color:#8e44ad;font-weight:700">控旺</span>：适大进 ｜ <span style="color:#2b7bb0;font-weight:700">营养</span>：磷酸二氢钾+聚合磷助剂+硼钼<br>【灌根 4】根际香土 2kg ＋ 剿灭 500ml ＋ 苗乐乐 250ml ＋ 水溶肥12-30-8 2kg',
    mix:'叶面 8 同桶；灌根 4 同桶（苗乐乐含杀菌+寡糖，与根际香土/水溶肥/剿灭兼容）。开花期避中午施。' },
  { type:'row', dayText:'播后 30–35 天', nd:'7', stage:'播后 30–35 天', op:'灌根<br>根施', count:'2 种',
    list:'<span style="color:#2b7bb0;font-weight:700">肥/刺激素</span>：水溶肥12-30-8 2kg ＋ 铠仆（海藻）1L',
    mix:'同桶；促下针、抗逆。' },
  { type:'row', dayText:'播后 35–40 天', nd:'8', stage:'播后 35–40 天', op:'叶面<br>＋灌根', count:'叶面 8<br>＋ 灌根 2',
    list:'【叶面 8】<span style="color:#c0392b;font-weight:700">杀虫</span>：铜拳+锐动 ｜ <span style="color:#e67e22;font-weight:700">杀菌</span>：美得乐+秀艳 ｜ <span style="color:#8e44ad;font-weight:700">控旺</span>：适大进 ｜ <span style="color:#2b7bb0;font-weight:700">营养</span>：磷酸二氢钾+聚合磷助剂+硼钼<br>【灌根 2】水溶肥12-30-8 2kg ＋ 泰稳丰（钙镁）1L',
    mix:'叶面 8 同桶；灌根 2 同桶。' },

  { type:'stage', title:'▶ 荚果充实期（播后 55–80 天，叶面为主）' },
  { type:'row', dayText:'播后 55–60 天', nd:'9', stage:'播后 55–60 天', op:'叶面<br>喷施', count:'11 种<br>（偏多）',
    list:'<span style="color:#c0392b;font-weight:700">杀虫</span>：虫螨腈·虱螨脲+铜拳+锐动 ｜ <span style="color:#e67e22;font-weight:700">杀菌</span>：秀艳+美得乐+拜亩乐 ｜ <span style="color:#8e44ad;font-weight:700">控旺</span>：妥控 ｜ <span style="color:#2b7bb0;font-weight:700">营养</span>：磷酸二氢钾+聚合磷助剂+硼钼+金收',
    mix:'偏多，建议分 2 桶：桶①杀虫3+营养（聚合磷+硼钼+金收）；桶②杀菌3（秀艳+美得乐+拜亩乐）+控旺（妥控）+磷酸二氢钾。注意秀艳+拜亩乐均含三唑，控旺叠加 → 保留 1 种或减量。' },
  { type:'row', dayText:'播后 75–80 天', nd:'10', stage:'播后 75–80 天', op:'叶面<br>喷施', count:'10 种<br>（偏多）',
    list:'<span style="color:#c0392b;font-weight:700">杀虫</span>：锐动+虫螨腈·虱螨脲+铜拳 ｜ <span style="color:#e67e22;font-weight:700">杀菌</span>：美得乐+拜亩乐 ｜ <span style="color:#8e44ad;font-weight:700">控旺</span>：适大进 ｜ <span style="color:#2b7bb0;font-weight:700">营养</span>：金收+磷酸二氢钾+聚合磷助剂+硼钼',
    mix:'偏多，建议分 2 桶：桶①杀虫3+营养（聚合磷+硼钼+金收）；桶②杀菌2（美得乐+拜亩乐）+控旺（适大进）+磷酸二氢钾。仅 1 个三唑（拜亩乐），控旺风险可控。' },

  { type:'stage', title:'▶ 荚果期（灌根为主）' },
  { type:'row', dayText:'荚果期（80% 封垄、鸡头状）', nd:'11', stage:'荚果期（80% 封垄、鸡头状）', op:'灌根<br>根施', count:'4 种',
    list:'<span style="color:#2b7bb0;font-weight:700">肥/菌</span>：水溶肥10-5-35 2kg ＋ 泰稳丰 1L ＋ 苗乐乐 350ml ＋ 削线 1kg',
    mix:'同桶；根果同护（营养 ＋ 防线虫 ＋ 防根腐/白绢）。' },
  { type:'row', dayText:'间隔 7–10 天 ×2（巩固）', nd:'12', stage:'间隔 7–10 天 ×2（巩固）', op:'灌根<br>根施', count:'3 / 2<br>种',
    list:'轮①：水溶肥10-5-35 3kg ＋ 根际香土 2kg ＋ 泰稳丰 1L（3 种）<br>轮②：水溶肥10-5-35 3kg ＋ 泰稳丰 1L（2 种）',
    mix:'同桶；巩固荚果饱满度。两轮间隔 7–10 天。' },

  { type:'stage', title:'▶ 收获前' },
  { type:'row', dayText:'播后 100 天（收获前）', nd:'13', stage:'播后 100 天（收获前）', op:'叶面<br>喷施', count:'9 种<br>（偏多）',
    list:'<span style="color:#c0392b;font-weight:700">杀虫</span>：虫螨腈·虱螨脲+铜拳+锐动 ｜ <span style="color:#e67e22;font-weight:700">杀菌</span>：美得乐+拜亩乐 ｜ <span style="color:#2b7bb0;font-weight:700">营养</span>：金收+磷酸二氢钾+聚合磷助剂+硼钼',
    mix:'偏多，建议分 2 桶；收获前严格按各药标签安全间隔期停喷。美得乐+拜亩乐可同桶。' }
];
