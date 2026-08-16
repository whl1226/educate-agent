
/* ====== 页面切换 ====== */
const crumbMap = {
  overview:'区域学情看板', balance:'城乡资源均衡', dropout:'控辍保学预警',
  mental:'心理/防欺凌预警', teacher:'师资结构预警',   supervise:'督导任务闭环', profile:'教师数据画像', research:'教研活动闭环'
};
function goPage(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
  document.getElementById('page-'+id).classList.add('on');
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active', n.dataset.page===id));
  document.getElementById('crumbNow').textContent = crumbMap[id];
  window.scrollTo({top:0, behavior:'smooth'});
  setTimeout(resizeVisibleCharts, 60);
}
document.querySelectorAll('.nav-item').forEach(n=>n.addEventListener('click', ()=>goPage(n.dataset.page)));

/* ====== Toast ====== */
let toastTimer;
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = '? ' + msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('on'), 2400);
}

/* ====== AI 治理助手收起/展开 ====== */
function closeAiCard(){
  const card = document.getElementById('aiCard');
  const restore = document.getElementById('aiRestore');
  if(!card || card.classList.contains('ai-close')) return;
  card.classList.add('ai-close');
  setTimeout(function(){
    card.style.display = 'none';
    card.classList.remove('ai-close');
    if(restore) restore.style.display = 'block';
  }, 300);
  toast('AI 治理助手已收起，可在下方重新展开');
}
function openAiCard(){
  const card = document.getElementById('aiCard');
  const restore = document.getElementById('aiRestore');
  if(!card) return;
  if(restore) restore.style.display = 'none';
  card.style.display = 'block';
  card.classList.remove('ai-close');
  void card.offsetWidth;
  card.classList.add('ai-open');
  setTimeout(function(){ card.classList.remove('ai-open'); }, 520);
}

/* ====== ECharts ====== */
const chartInstances = [];
const chartQueue = [];
function baseChart(id, opt){
  const el = document.getElementById(id);
  if(!el) return null;
  if(!window.echarts){ chartQueue.push([id, opt]); return null; }
  const c = echarts.init(el);
  c.setOption(opt);
  chartInstances.push({el:el, inst:c});
  return c;
}
function flushCharts(){
  if(!window.echarts) return;
  if(chartQueue.length){
    chartQueue.splice(0).forEach(function(pair){
      try{
        const el = document.getElementById(pair[0]);
        if(!el) return;
        const c = echarts.init(el);
        c.setOption(pair[1]);
        chartInstances.push({el:el, inst:c});
      }catch(e){}
    });
  }
  resizeVisibleCharts();
}
function resizeVisibleCharts(){
  chartInstances.forEach(function(x){
    if(x.el && x.el.offsetParent && x.inst.resize) x.inst.resize();
  });
}
window.addEventListener('echarts-ready', flushCharts);
window.addEventListener('load', function(){ if(!window.echarts) return; if(chartQueue.length || !chartInstances.length) flushCharts(); else resizeVisibleCharts(); });
window.addEventListener('resize', resizeVisibleCharts);

/* 各校掌握度 */
baseChart('schoolBar', {
  grid:{left:90, right:18, top:10, bottom:24},
  tooltip:{trigger:'axis', backgroundColor:'#FFFFFF', borderColor:'#E2E8F0', textStyle:{color:'#334155', fontSize:12}},
  xAxis:{type:'value', max:100, axisLabel:{color:'#64748B', fontSize:10, formatter:'{value}%'}, splitLine:{lineStyle:{color:'#EEF2F7'}}},
  yAxis:{type:'category', inverse:true, data:['双桥村小','梅岭小学','青石镇小','云岭小学','镇二中','镇一中'], axisLabel:{color:'#64748B', fontSize:11}, axisLine:{show:false}, axisTick:{show:false}},
  series:[{type:'bar', data:[{value:62, itemStyle:{color:'#FB7185'}},{value:69, itemStyle:{color:'#FBBF24'}},{value:84, itemStyle:{color:'#38BDF8'}},{value:71, itemStyle:{color:'#FBBF24'}},{value:88, itemStyle:{color:'#2DD4BF'}},{value:91, itemStyle:{color:'#2DD4BF'}}], barWidth:13, itemStyle:{borderRadius:[0,6,6,0]}}]
});

/* 掌握度环图 */
baseChart('donut', {
  tooltip:{trigger:'item', backgroundColor:'#FFFFFF', borderColor:'#E2E8F0', textStyle:{color:'#334155', fontSize:12}},
  series:[{
    type:'pie', radius:['52%','76%'], center:['50%','48%'], avoidLabelOverlap:true,
    itemStyle:{borderColor:'#FFFFFF', borderWidth:3, borderRadius:6},
    label:{show:false}, labelLine:{show:false},
    data:[{value:46, name:'扎实', itemStyle:{color:'#34D399'}},{value:31, name:'巩固', itemStyle:{color:'#38BDF8'}},{value:15, name:'薄弱', itemStyle:{color:'#FBBF24'}},{value:8, name:'需补强', itemStyle:{color:'#FB7185'}}]
  }]
});

/* 活跃趋势 */
baseChart('trendArea', {
  grid:{left:38, right:14, top:28, bottom:24},
  tooltip:{trigger:'axis', backgroundColor:'#FFFFFF', borderColor:'#E2E8F0', textStyle:{color:'#334155', fontSize:12}},
  legend:{data:['作答数','活跃学生'], textStyle:{color:'#64748B', fontSize:10}, top:2, right:8, icon:'roundRect', itemWidth:10, itemHeight:6},
  xAxis:{type:'category', boundaryGap:false, data:['W21','W22','W23','W24'], axisLabel:{color:'#64748B', fontSize:10}, axisLine:{lineStyle:{color:'#E2E8F0'}}},
  yAxis:{type:'value', axisLabel:{color:'#64748B', fontSize:10}, splitLine:{lineStyle:{color:'#EEF2F7'}}},
  series:[
    {name:'作答数', type:'line', smooth:true, data:[31200,36800,42100,48296], symbol:'circle', symbolSize:6, lineStyle:{width:2.5, color:'#38BDF8'}, itemStyle:{color:'#38BDF8'}, areaStyle:{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'rgba(56,189,248,.32)'},{offset:1,color:'rgba(56,189,248,0)'}]}}},
    {name:'活跃学生', type:'line', smooth:true, data:[5200,5900,6420,6842], symbol:'circle', symbolSize:6, lineStyle:{width:2.5, color:'#2DD4BF'}, itemStyle:{color:'#2DD4BF'}}
  ]
});

/* 均衡对比 */
baseChart('eqChart', {
  grid:{left:88, right:20, top:10, bottom:24},
  tooltip:{trigger:'axis', axisPointer:{type:'shadow'}, backgroundColor:'#FFFFFF', borderColor:'#E2E8F0', textStyle:{color:'#334155', fontSize:12}},
  legend:{data:['城区','乡村'], textStyle:{color:'#64748B', fontSize:11}, top:0, right:8, icon:'roundRect', itemWidth:10, itemHeight:6},
  xAxis:{type:'value', axisLabel:{color:'#64748B', fontSize:10}, splitLine:{lineStyle:{color:'#EEF2F7'}}},
  yAxis:{type:'category', data:['生均图书','多媒体教室','专任教师比','生均经费','网络带宽'], axisLabel:{color:'#64748B', fontSize:11}, axisLine:{show:false}, axisTick:{show:false}},
  series:[
    {name:'城区', type:'bar', data:[92,88,100,86,95], barWidth:8, itemStyle:{color:'#38BDF8', borderRadius:[0,5,5,0]}},
    {name:'乡村', type:'bar', data:[64,92,58,71,55], barWidth:8, itemStyle:{color:'#FBBF24', borderRadius:[0,5,5,0]}}
  ]
});

/* 辍学信号构成 */
baseChart('dropoutBar', {
  grid:{left:100, right:30, top:10, bottom:24},
  tooltip:{trigger:'axis', axisPointer:{type:'shadow'}, backgroundColor:'#FFFFFF', borderColor:'#E2E8F0', textStyle:{color:'#334155', fontSize:12}},
  xAxis:{type:'value', axisLabel:{color:'#64748B', fontSize:10}, splitLine:{lineStyle:{color:'#EEF2F7'}}},
  yAxis:{type:'category', data:['连续缺勤','无作答行为','家庭经济信号','社交孤立','成绩骤降'], axisLabel:{color:'#64748B', fontSize:11}, axisLine:{show:false}, axisTick:{show:false}},
  series:[{type:'bar', data:[{value:88, itemStyle:{color:'#FB7185'}},{value:76, itemStyle:{color:'#FB7185'}},{value:62, itemStyle:{color:'#FBBF24'}},{value:45, itemStyle:{color:'#38BDF8'}},{value:38, itemStyle:{color:'#38BDF8'}}], barWidth:13, itemStyle:{borderRadius:[0,6,6,0]}}]
});

/* 年龄结构 */
baseChart('ageChart', {
  grid:{left:38, right:14, top:26, bottom:24},
  tooltip:{trigger:'axis', backgroundColor:'#FFFFFF', borderColor:'#E2E8F0', textStyle:{color:'#334155', fontSize:12}},
  legend:{data:['男教师','女教师'], textStyle:{color:'#64748B', fontSize:10}, top:0, right:8, icon:'roundRect', itemWidth:10, itemHeight:6},
  xAxis:{type:'category', data:['25 以下','25-30','31-35','36-40','41-45','46-50','50+'], axisLabel:{color:'#64748B', fontSize:10}, axisLine:{lineStyle:{color:'#E2E8F0'}}},
  yAxis:{type:'value', axisLabel:{color:'#64748B', fontSize:10}, splitLine:{lineStyle:{color:'#EEF2F7'}}},
  series:[
    {name:'男教师', type:'bar', data:[8,18,22,26,24,19,14], barWidth:12, itemStyle:{color:'#38BDF8', borderRadius:[4,4,0,0]}},
    {name:'女教师', type:'bar', data:[12,30,38,34,22,14,8], barWidth:12, itemStyle:{color:'#2DD4BF', borderRadius:[4,4,0,0]}}
  ]
});

/* 画像雷达 */
baseChart('radar', {
  tooltip:{backgroundColor:'#FFFFFF', borderColor:'#E2E8F0', textStyle:{color:'#334155', fontSize:12}},
  radar:{
    indicator:[
      {name:'教学质量', max:100},{name:'教研参与', max:100},{name:'AI 融合', max:100},
      {name:'带教担当', max:100},{name:'家校口碑', max:100},{name:'专业发展', max:100}
    ],
    radius:'64%', center:['50%','52%'],
    axisName:{color:'#64748B', fontSize:11},
    splitArea:{areaStyle:{color:['rgba(56,189,248,.03)','rgba(56,189,248,.07)']}},
    splitLine:{lineStyle:{color:'#E2E8F0'}},
    axisLine:{lineStyle:{color:'#E2E8F0'}}
  },
  series:[{
    type:'radar',
    data:[{
      value:[92, 78, 95, 88, 90, 74],
      name:'王秀兰',
      areaStyle:{color:'rgba(56,189,248,.25)'},
      lineStyle:{color:'#38BDF8', width:2},
      itemStyle:{color:'#7DD3FC'}
    }]
  }]
});

/* ====== 教研活动创建向导 ====== */
const RES_TOPICS = [
  {k:'t1', t:'示范课磨课 · 《分数的再认识》', d:'五年级 · 全区进度第 4 单元', ico:'ph:presentation-chart'},
  {k:'t2', t:'单元集体备课 · 《用字母表示数》', d:'主备共享 · 已有 6 校需求', ico:'ph:users-three'},
  {k:'t3', t:'教学常规视导 · 作业设计与批改', d:'聚焦分层作业落实质量', ico:'ph:clipboard'},
  {k:'t4', t:'专题微讲座 · 双师课堂组织', d:'村小设备使用与课堂协同', ico:'ph:video-camera'}
];
const resState = {topic:'', range:'', when:'', step:0};
function openResWiz(){
  resState.topic = ''; resState.range = ''; resState.when = ''; resState.step = 0;
  document.getElementById('resTopicList').innerHTML = RES_TOPICS.map(function(t){
    return '<div class="self-item" data-k="'+t.k+'" onclick="selResTopic(this)"><div class="si-ico"><span class="iconify" data-icon="'+t.ico+'"></span></div><div style="flex:1"><div class="si-name">'+t.t+'</div><div class="si-desc">'+t.d+'</div></div><span class="iconify" data-icon="ph:caret-right" style="color:#94A3B8"></span></div>';
  }).join('');
  resGo(0);
  document.getElementById('resWiz').classList.add('on');
}
function closeResWiz(){ document.getElementById('resWiz').classList.remove('on'); }
function selResTopic(el){
  resState.topic = el.dataset.k;
  el.parentElement.querySelectorAll('.self-item').forEach(function(x){ x.classList.remove('sel'); });
  el.classList.add('sel');
}
function selResOpt(k, el){
  resState[k] = el.dataset.v;
  el.parentElement.querySelectorAll('.opt-card').forEach(function(c){ c.classList.remove('sel'); });
  el.classList.add('sel');
}
function resGo(step){
  resState.step = step;
  document.querySelectorAll('#resWiz .wiz-step').forEach(function(s){ s.classList.remove('on'); });
  document.getElementById('resStep' + step).classList.add('on');
  document.querySelectorAll('#resWiz .wiz-steps i').forEach(function(d,i){ d.classList.toggle('on', i <= step); });
  document.getElementById('resWizSub').textContent = ['第 1 步 · 选择活动主题','第 2 步 · 范围与时间','第 3 步 · 生成活动方案'][step];
  document.getElementById('resPrevBtn').style.visibility = step === 0 ? 'hidden' : 'visible';
  document.getElementById('resNextBtn').innerHTML = step === 2 ? '<span class="iconify" data-icon="ph:check"></span>创建活动' : '下一步';
}
function resPrev(){ if(resState.step > 0) resGo(resState.step - 1); }
function resNext(){
  if(resState.step === 0){
    if(!resState.topic){ toast('请先选择活动主题'); return; }
    resGo(1);
  }else if(resState.step === 1){
    if(!resState.range || !resState.when){ toast('请选择参与范围和时间'); return; }
    resGo(2);
  }else{
    resDone();
  }
}
function resDone(){
  const topic = RES_TOPICS.find(function(t){ return t.k === resState.topic; });
  const rangeName = {all:'全区 26 校', town:'青石镇 8 校', pair:'跨校结对'}[resState.range];
  const whenName = {fri:'8 月 21 日 本周五', nextw:'8 月 26 日 下周三', nextf:'8 月 28 日 下周五'}[resState.when];
  document.getElementById('resNextBtn').disabled = true;
  document.getElementById('resPrevBtn').disabled = true;
  const bar = document.getElementById('resGenBar');
  let w = 0;
  const timer = setInterval(function(){
    w += Math.random() * 20 + 8;
    if(w >= 100){ w = 100; clearInterval(timer); resCreate(topic, rangeName, whenName); }
    bar.style.width = w + '%';
  }, 130);
}
function resCreate(topic, rangeName, whenName){
  document.getElementById('resGenT').textContent = '活动已创建！';
  document.getElementById('resGenS').textContent = '通知已推送 · 议程与分工已生成';
  setTimeout(function(){
    const grid = document.getElementById('resGrid');
    const card = document.createElement('div');
    card.className = 'card card-hover';
    card.innerHTML = '<div class="card-head"><div class="card-title">' + topic.t + '</div><div class="card-extra"><span class="chip chip-amber">待开始</span></div></div><div style="padding:16px 20px"><div style="font-size:12px;color:var(--muted);line-height:1.7;margin-bottom:12px">' + rangeName + '参与 · ' + whenName + ' · 议程与分工已自动生成并推送</div><div style="display:flex;align-items:center;gap:10px"><div class="avatar-stack"><span class="a" style="background:#0052CC">局</span><span class="a" style="background:#0D9488">研</span><span class="a more">+邀</span></div><span style="font-size:11.5px;color:#94A3B8">创建人 · 教研股</span><button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="toast(\'活动通知已发送\')">发通知</button></div></div>';
    grid.insertBefore(card, grid.firstChild);
    closeResWiz();
    document.getElementById('resNextBtn').disabled = false;
    document.getElementById('resPrevBtn').disabled = false;
    document.getElementById('resGenBar').style.width = '0';
    toast('教研活动已创建，通知已推送');
  }, 900);
}


/* ===== 由构建脚本注入：onclick 行为迁移（CSP 兼容层） ===== */
(function () {
  function bindExpr(el) {
    if (el.__boundOnclick) return;
    var expr = el.getAttribute('onclick');
    if (!expr) return;
    el.__boundOnclick = true;
    el.removeAttribute('onclick');
    var m = expr.match(/^\s*([A-Za-z_$][\w$]*)\s*\((.*)\)\s*;?\s*$/);
    if (!m) return;
    var fn = window[m[1]];
    if (typeof fn !== 'function') return;
    var rawArgs = m[2] ? m[2].split(',') : [];
    var args = rawArgs.map(function (s) {
      s = s.trim();
      if (/^['"][\s\S]*['"]$/.test(s)) return { type: 'str', v: s.slice(1, -1) };
      if (s === 'this') return { type: 'this' };
      return { type: 'ident', v: s };
    });
    el.addEventListener('click', function (ev) {
      var real = args.map(function (a) {
        if (a.type === 'str') return a.v;
        if (a.type === 'this') return el;
        return window[a.v] !== undefined ? window[a.v] : a.v;
      });
      try { fn.apply(null, real); } catch (e) { /* 业务异常由统一层处理 */ }
    });
  }
  document.querySelectorAll('[onclick]').forEach(bindExpr);
  var mo = new MutationObserver(function (muts) {
    muts.forEach(function (mut) {
      mut.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        if (node.hasAttribute && node.hasAttribute('onclick')) bindExpr(node);
        node.querySelectorAll && node.querySelectorAll('[onclick]').forEach(bindExpr);
      });
    });
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
