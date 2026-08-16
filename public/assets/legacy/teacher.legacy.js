
/* ========== 页面切换 ========== */
const pages = document.querySelectorAll('.page');
const navs = document.querySelectorAll('.nav-item');
const crumbMap = {
  dashboard:'班级学情看板', lesson:'一键备课', paper:'一键组卷 / 分层作业',
  micro:'微课脚本', researcher:'AI 教研员', collab:'集体备课', skills:'基本功补强',
  library:'教学资源库', ocr:'拍照转教案', parentmeet:'家长会材料', backtoschool:'开学材料包',
  leftbehind:'留守儿童沟通', title:'职称材料整理'
};
const inits = {};
function showPage(id){
  pages.forEach(p=>p.classList.remove('on'));
  document.getElementById('page-'+id).classList.add('on');
  navs.forEach(n=>n.classList.toggle('active', n.dataset.page===id));
  document.getElementById('crumbNow').textContent = crumbMap[id]||'';
  window.scrollTo({top:0,behavior:'smooth'});
  if(inits[id]){ clearTimeout(inits[id].t); inits[id].t = setTimeout(inits[id].fn, 120); }
  setTimeout(function(){ if(window._chartInsts){ window._chartInsts.forEach(c=>{ if(c && c.resize) c.resize(); }); } }, 130);
}
navs.forEach(n=>n.addEventListener('click',()=>showPage(n.dataset.page)));

/* ========== Toast ========== */
let toastTimer;
function toast(msg){
  const t = document.getElementById('toast');
  document.getElementById('toastText').textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('on'), 2200);
}

/* ========== pill / pick ========== */
function makePill(el){ el.parentElement.querySelectorAll('span').forEach(s=>s.classList.remove('on')); el.classList.add('on'); }
function togglePick(el){
  const ico = el.querySelector('[data-ico]');
  if(ico.dataset.icon==='ph:circle'){ ico.dataset.icon='ph:check-circle'; ico.style.color='var(--primary)'; el.style.borderColor='var(--primary)'; }
  else{ ico.dataset.icon='ph:circle'; ico.style.color='#c3c7d4'; el.style.borderColor='var(--border)'; }
}
document.addEventListener('click',e=>{ if(e.target.closest('.iconify')){ if(window.iconify) iconify().refresh(); } });

/* ========== 生成模拟 ========== */
function startGenerate(which){
  const btn = event.target.closest('.btn');
  btn.innerHTML = '<span class="iconify" data-icon="ph:spinner" class="spin"></span> 生成中…';
  btn.disabled = true;
  btn.style.opacity = .75;
  setTimeout(()=>{
    btn.disabled = false; btn.style.opacity = 1;
    btn.innerHTML = btn.dataset.orig || btn.innerHTML;
    switch(which){
      case 'lesson':
        document.getElementById('lesson-gen').style.display='block';
        document.getElementById('lesson-empty').style.display='none';
        document.getElementById('lesson-result').style.display='block';
        document.querySelector('#lesson-result').scrollIntoView({behavior:'smooth',block:'start'});
        toast('教案已生成，用时 2.3s');
        break;
      case 'paper':
        toast('试卷已重新生成');
        break;
      case 'micro':
        document.getElementById('micro-empty').style.display='none';
        document.getElementById('micro-result').style.display='block';
        document.querySelector('#micro-result').scrollIntoView({behavior:'smooth',block:'start'});
        break;
      case 'res0':
        document.getElementById('res0-empty').style.display='none';
        document.getElementById('res0-result').style.display='block';
        toast('教案点评完成');
        break;
      case 'res1':
        document.getElementById('res1-empty').style.display='none';
        document.getElementById('res1-result').style.display='block';
        toast('讲题话术已生成');
        break;
      case 'ocr':
        document.getElementById('ocr-empty').style.display='none';
        document.getElementById('ocr-result').style.display='block';
        document.querySelector('#ocr-result').scrollIntoView({behavior:'smooth',block:'start'});
        break;
      case 'pm':
        document.getElementById('pm-empty').style.display='none';
        document.getElementById('pm-result').style.display='block';
        toast('发言稿已生成，附 3 张图表');
        break;
      case 'title':
        document.getElementById('title-empty').style.display='none';
        document.getElementById('title-result').style.display='block';
        toast('14 份材料已分类归档');
        break;
    }
  }, 1400);
}
document.querySelectorAll('.btn').forEach(b=>{ if(!b.dataset.orig) b.dataset.orig = b.innerHTML; });

/* ========== 教研员 Tab ========== */
function switchResTab(i){
  document.querySelectorAll('#researcherTabs button').forEach((b,j)=>b.classList.toggle('on',j===i));
  document.querySelectorAll('.res-tab').forEach((t,j)=>t.style.display = j===i?'':'none');
}

/* ========== ECharts ========== */
function initCharts(){
  if(!window.echarts) return;
  const ring = echarts.init(document.getElementById('ringMastery'));
ring.setOption({
    tooltip:{formatter:'{b}: {c}%'},
    series:[{
      type:'pie', radius:['58%','80%'], center:['36%','50%'],
      avoidLabelOverlap:false,
      label:{show:true, position:'center', formatter:'{a|78.6%}\n{b|班级平均掌握度}', rich:{a:{fontSize:25, fontWeight:900, color:'#191b22', fontFamily:'Outfit', lineHeight:29}, b:{fontSize:11, color:'#9aa1ad', lineHeight:16}}},
      labelLine:{show:false},
      itemStyle:{borderRadius:8, borderColor:'#fff', borderWidth:4},
      data:[
        {value:38, name:'扎实', itemStyle:{color:'#10B981'}},
        {value:22, name:'良好', itemStyle:{color:'#0EA5E9'}},
        {value:20, name:'待提升', itemStyle:{color:'#4F46E5'}, emphasis:{label:{show:false}}},
        {value:12, name:'薄弱', itemStyle:{color:'#F59E0B'}, emphasis:{label:{show:false}}},
        {value:8, name:'需补强', itemStyle:{color:'#F43F5E'}, emphasis:{label:{show:false}}}
      ]
    }],
    legend:{orient:'vertical', right:4, top:'center', itemWidth:10, itemHeight:10, icon:'circle', textStyle:{color:'#6b7280', fontSize:11}}
  });
  /* 近 7 日学习活跃度 */
  const mini = echarts.init(document.getElementById('activeMini'));
  mini.setOption({
    grid:{left:2,right:10,top:8,bottom:2,containLabel:true},
    tooltip:{trigger:'axis', axisPointer:{type:'shadow'}},
    xAxis:{type:'category', data:['周一','周二','周三','周四','周五','周六','周日'], axisLine:{lineStyle:{color:'#e7e9ef'}}, axisLabel:{color:'#9aa1ad', fontSize:10}},
    yAxis:{type:'value', splitLine:{lineStyle:{color:'#f1f2f6'}}, axisLabel:{color:'#9aa1ad', fontSize:10}},
    series:[{
      type:'bar', barWidth:'56%',
      data:[132,158,149,186,201,168,292],
      itemStyle:{borderRadius:[6,6,0,0], color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'#6366F1'},{offset:1,color:'#A5B4FC'}]}}
    }]
  });
  /* 作答趋势 */
  const trend = echarts.init(document.getElementById('trendChart'));
  trend.setOption({
    grid:{left:6,right:10,top:18,bottom:4,containLabel:true},
    tooltip:{trigger:'axis'},
    xAxis:{type:'category', data:['周一','周二','周三','周四','周五','周六','周日'], axisLine:{lineStyle:{color:'#e7e9ef'}}, axisLabel:{color:'#9aa1ad', fontSize:11}},
    yAxis:{type:'value', splitLine:{lineStyle:{color:'#f1f2f6'}}, axisLabel:{color:'#9aa1ad', fontSize:11}},
    series:[{
      type:'line', smooth:true, symbol:'circle', symbolSize:6,
      data:[132,158,149,186,201,168,292],
      lineStyle:{width:3, color:'#4F46E5'},
      itemStyle:{color:'#fff', borderColor:'#4F46E5', borderWidth:2},
      areaStyle:{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'rgba(79,70,229,.22)'},{offset:1,color:'rgba(79,70,229,0)'}]}}
    }]
  });
  /* 基本功雷达 */
  const radar = echarts.init(document.getElementById('skillRadar'));
  radar.setOption({
    radar:{
      indicator:[{name:'教学设计',max:100},{name:'课堂管理',max:100},{name:'粉笔字',max:100},{name:'普通话',max:100},{name:'信息化',max:100},{name:'学情分析',max:100},{name:'作业设计',max:100},{name:'家校沟通',max:100}],
      radius:'68%', center:['50%','54%'],
      axisName:{color:'#6b7280', fontSize:12},
      splitLine:{lineStyle:{color:'#eef0f5'}},
      splitArea:{areaStyle:{color:['rgba(79,70,229,.02)','rgba(79,70,229,.05)']}},
      axisLine:{lineStyle:{color:'#e7e9ef'}}
    },
    series:[{type:'radar', data:[{value:[82,74,68,86,63,78,70,75], name:'当前水平',
      areaStyle:{color:'rgba(79,70,229,.18)'},
      lineStyle:{color:'#4F46E5', width:2},
      itemStyle:{color:'#4F46E5'}}]}],
    tooltip:{formatter:'{b}: {c}'}
  });
  window.addEventListener('resize',()=>{ if(ring.resize) ring.resize(); if(trend.resize) trend.resize(); if(radar.resize) radar.resize(); if(mini.resize) mini.resize(); });
  window._chartInsts = [ring, trend, radar, mini];
}
window.addEventListener('echarts-ready', function boot(){
  if(window.__chartsBooted) return;
  window.__chartsBooted = true;
  initCharts();
  if(!window.echarts){ setTimeout(function(){ initCharts(); }, 400); }
});
if(window.echarts && !window.__chartsBooted){ window.__chartsBooted = true; initCharts(); }
window.addEventListener('load', function(){ if(!window.__chartsBooted && window.echarts) initCharts(); });

/* ====== 基本功诊断向导 ====== */
const SKILL_LIST = [
  {k:'教学设计', ico:'ph:compass', d:'目标设计 · 环节衔接'},
  {k:'课堂管理', ico:'ph:users-three', d:'纪律组织 · 节奏把控'},
  {k:'粉笔字', ico:'ph:chalkboard-teacher', d:'板书书写 · 字迹规范'},
  {k:'普通话', ico:'ph:microphone', d:'发音标准 · 课堂表达'},
  {k:'信息化', ico:'ph:devices', d:'多媒体运用 · 课件制作'},
  {k:'学情分析', ico:'ph:magnifying-glass', d:'诊断学情 · 分层设计'},
  {k:'作业设计', ico:'ph:note-pencil', d:'分层作业 · 减负提质'},
  {k:'家校沟通', ico:'ph:hand-heart', d:'家长协同 · 留守儿童关怀'}
];
const SKILL_SCENES = [
  { k:'s1', q:'上课 5 分钟，后排 3 名学生开始交头接耳，你会？',
    opts:[['a','眼神示意 + 靠近站位，继续教学',0],['b','当场点名批评，强调纪律',2],['c','停下讲道理 3 分钟',2]] },
  { k:'s2', q:'新接一个"一人多科"班级，数学基础普遍薄弱，备课你会？',
    opts:[['a','按课标原进度推进，确保完成教学计划',2],['b','先做学情摸底，放缓进度，补充基础训练',0],['c','只讲重点章节，其余自学',1]] },
  { k:'s3', q:'家长会上，一位祖辈监护人反复说"我们也不懂，全靠老师"，你如何回应？',
    opts:[['a','让家长不用管学习，孩子交给学校',2],['b','给出 3 条可操作的小任务（收作业/作息/鼓励），强调"您放心"',0],['c','现场演示如何辅导孩子作业',1]] },
];
const SKILL_BASE = {教学设计:82, 课堂管理:74, 粉笔字:68, 普通话:86, 信息化:63, 学情分析:78, 作业设计:70, 家校沟通:75};
const SKILL_TRAIN = {
  '教学设计': ['ph:compass','大单元教学设计 · 工作坊','60 分钟 · 含 3 个案例拆解'],
  '课堂管理': ['ph:users-three','课堂管理 · 提问与节奏微课','教研规则库精选 · 12 分钟'],
  '粉笔字': ['ph:chalkboard-teacher','粉笔字 · 楷书结构（今日）','15 分钟 · 含 3 个示范视频'],
  '普通话': ['ph:microphone','普通话 · 平翘舌专项（第 3 天）','AI 评测跟读 · 每日 10 分钟'],
  '信息化': ['ph:devices','多媒体课件制作 · 直播课','周五 20:00 · 双桥村小同步'],
  '学情分析': ['ph:magnifying-glass','学情分析与分层作业设计','30 分钟 · 5 个真实班级案例'],
  '作业设计': ['ph:note-pencil','分层作业设计工作坊','40 分钟 · 3 个真实案例'],
  '家校沟通': ['ph:hand-heart','家校沟通情境模拟','30 分钟 · 含留守儿童话术演练']
};
const skillState = {self:{}, q1:'', q2:'', step:0};
const sceneState = {};
function openSkillWiz(){
  skillState.self = {}; skillState.q1 = ''; skillState.q2 = ''; skillState.step = 0;
  Object.keys(sceneState).forEach(function(k){ delete sceneState[k]; });
  document.getElementById('skillGenBar').style.width = '0';
  document.getElementById('skillGenT').textContent = '正在分析你的作答…';
  document.getElementById('skillGenS').textContent = '结合自评与课堂场景偏好，计算 8 项基本功得分';
  document.getElementById('skillNextBtn').disabled = false;
  document.getElementById('skillPrevBtn').disabled = false;
  const box = document.getElementById('skillSelfList');
  box.innerHTML = SKILL_LIST.map(function(s){
    const opts = [['2','熟练'],['1','一般'],['0','待提升']].map(function(o){
      return '<span class="si-opt" data-k="'+s.k+'" data-v="'+o[0]+'" onclick="selSelf(\''+s.k+'\',this)">'+o[1]+'</span>';
    }).join('');
    return '<div class="self-item" data-k="'+s.k+'"><div class="si-ico"><span class="iconify" data-icon="'+s.ico+'"></span></div><div style="flex:1"><div class="si-name">'+s.k+'</div><div class="si-desc">'+s.d+'</div></div><div class="si-opts">'+opts+'</div></div>';
  }).join('');
  skillGo(0);
  document.getElementById('skillWiz').classList.add('on');
}
function closeSkillWiz(){
  document.getElementById('skillWiz').classList.remove('on');
}
function selSelf(k, el){
  skillState.self[k] = el.dataset.v;
  const opts = el.parentElement.querySelectorAll('.si-opt');
  opts.forEach(function(o){ o.classList.remove('on'); });
  el.classList.add('on');
  const row = el.closest('.self-item');
  if(row) row.classList.add('sel');
}
function selQ(q, el){
  skillState[q] = el.dataset.v;
  el.parentElement.querySelectorAll('.opt-card').forEach(function(c){ c.classList.remove('sel'); });
  el.classList.add('sel');
}
function skillGo(step){
  skillState.step = step;
  document.querySelectorAll('#skillWiz .wiz-step').forEach(function(s){ s.classList.remove('on'); });
  document.getElementById('skillStep' + Math.min(step, 2)).classList.add('on');
  document.querySelectorAll('#skillWiz .wiz-steps i').forEach(function(d,i){ d.classList.toggle('on', i <= step); });
  const subs = ['第 1 步 · 自评 8 项基本功','第 2 步 · 课堂场景 2 问','第 3 步 · 教学情境 3 题','第 4 步 · 生成专属方案'];
  document.getElementById('skillWizSub').textContent = subs[step];
  document.getElementById('skillPrevBtn').style.visibility = step === 0 ? 'hidden' : 'visible';
  const gen = document.getElementById('skillGen');
  if(step === 2){
    renderSkillScenes();
    if(gen) gen.style.display = 'none';
    document.getElementById('skillNextBtn').innerHTML = '下一步';
  }else if(step === 3){
    if(gen) gen.style.display = '';
    document.getElementById('skillNextBtn').innerHTML = '<span class="iconify" data-icon="ph:magic-wand"></span>生成我的方案';
  }else{
    if(gen) gen.style.display = 'none';
    document.getElementById('skillNextBtn').innerHTML = '下一步';
  }
}
function renderSkillScenes(){
  const box = document.getElementById('skillScenes');
  if(!box) return;
  box.innerHTML = SKILL_SCENES.map(function(sc){
    return '<div class="wiz-q" style="margin-top:14px">Q' + sc.k.slice(1) + ' · ' + sc.q + '</div>' +
      '<div class="opt-cols">' +
      sc.opts.map(function(o){
        var sel = (sceneState[sc.k] === String(o[2])) ? ' sel' : '';
        return '<div class="opt-card' + sel + '" data-k="' + sc.k + '" data-v="' + o[2] + '" onclick="selScene(this)"><div class="oc-t">' + o[1] + '</div></div>';
      }).join('') +
      '</div>';
  }).join('');
}
function selScene(el){
  const k = el.dataset.k;
  sceneState[k] = el.dataset.v;
  el.parentElement.querySelectorAll('.opt-card').forEach(function(c){ c.classList.remove('sel'); });
  el.classList.add('sel');
}
function skillPrev(){ if(skillState.step > 0) skillGo(skillState.step - 1); }
function skillNext(){
  if(skillState.step === 0){
    if(Object.keys(skillState.self).length < 8){ toast('请先完成 8 项自评'); return; }
    skillGo(1);
  }else if(skillState.step === 1){
    if(!skillState.q1 || !skillState.q2){ toast('请先回答两个问题'); return; }
    skillGo(2);
  }else if(skillState.step === 2){
    if(!sceneState['s1'] || !sceneState['s2'] || !sceneState['s3']){ toast('请先完成 3 道情境题'); return; }
    skillGo(3);
  }else{
    document.getElementById('skillNextBtn').disabled = true;
    document.getElementById('skillPrevBtn').disabled = true;
    const bar = document.getElementById('skillGenBar');
    let w = 0;
    const timer = setInterval(function(){
      w += Math.random() * 20 + 8;
      if(w >= 100){ w = 100; clearInterval(timer); finishSkill(); }
      bar.style.width = w + '%';
    }, 140);
  }
}
function finishSkill(){
  const vals = SKILL_LIST.map(function(s){
    let v = SKILL_BASE[s.k];
    const sel = skillState.self[s.k];
    if(sel === '2') v += 6; else if(sel === '0') v -= 8;
    if(skillState.q1 === 'board' && s.k === '粉笔字') v += 6;
    if(skillState.q1 === 'media' && s.k === '信息化') v += 6;
    if(skillState.q1 === 'group'){ if(s.k === '课堂管理') v += 5; if(s.k === '学情分析') v += 3; }
    if(skillState.q2 === 'often' && s.k === '信息化') v += 6;
    if(skillState.q2 === 'some' && s.k === '教学设计') v += 4;
    if(skillState.q2 === 'rare'){ if(s.k === '粉笔字') v += 6; if(s.k === '信息化') v -= 6; }
    const sceneBonus = { s1: { 0: 4, 2: -3 }, s2: { 0: 4, 1: 1, 2: -3 }, s3: { 0: 4, 1: 1, 2: -3 } };
    // 情境 1 → 课堂管理；情境 2 → 教学设计；情境 3 → 家校沟通
    const sceneMap = { s1: '课堂管理', s2: '教学设计', s3: '家校沟通' };
    Object.entries(sceneState).forEach(([sk, sv]) => {
      const dim = sceneMap[sk];
      const bonus = sceneBonus[sk] ? sceneBonus[sk][sv] : 0;
      if (dim === s.k) v += bonus;
    });
    return Math.max(42, Math.min(96, Math.round(v)));
  });
  const radar = window._chartInsts && window._chartInsts[2];
  if(radar){
    radar.setOption({series:[{data:[{value:vals, name:'当前水平', areaStyle:{color:'rgba(79,70,229,.18)'}, lineStyle:{color:'#4F46E5', width:2}, itemStyle:{color:'#4F46E5'}}]}]});
  }
  renderSkillPlan(vals);
  const chip = document.getElementById('skillChip');
  if(chip) chip.innerHTML = '<span class="iconify" data-icon="ph:check-circle"></span>已完成诊断 · 方案已更新';
  document.getElementById('skillGenT').textContent = '诊断完成！专属方案已生成';
  document.getElementById('skillGenS').textContent = '雷达已更新 · 训练计划已按薄弱项重排';
  setTimeout(function(){
    closeSkillWiz();
    document.getElementById('skillNextBtn').disabled = false;
    document.getElementById('skillPrevBtn').disabled = false;
    toast('基本功诊断完成，训练方案已更新');
  }, 1300);
}
function renderSkillPlan(vals){
  const order = vals.map(function(v,i){ return {v:v, k:SKILL_LIST[i].k}; }).sort(function(a,b){ return a.v - b.v; });
  const weak = order.slice(0,2);
  const plan = document.getElementById('skillPlan');
  if(!plan) return;
  const rows = weak.map(function(w){
    const t = SKILL_TRAIN[w.k];
    return '<div class="list-row" onclick="toast(\'打开'+t[1]+'\')"><div class="row-icon" style="background:var(--rose-soft);color:var(--rose)"><span class="iconify" data-icon="'+t[0]+'"></span></div><div style="flex:1"><div class="t-cell-main">'+t[1]+' · 待补强</div><div class="t-cell-sub">'+t[2]+'</div></div><span class="chip chip-rose">今日推荐</span></div>';
  }).join('');
  plan.innerHTML = rows + '<div class="list-row" onclick="toast(\'打开课堂语言微课\')"><div class="row-icon" style="background:var(--amber-soft);color:var(--amber)"><span class="iconify" data-icon="ph:microphone-stage"></span></div><div style="flex:1"><div class="t-cell-main">课堂语言 · 提问技巧微课</div><div class="t-cell-sub">教研规则库精选 · 12 分钟</div></div><span class="chip chip-amber">明天</span></div><div class="list-row"><div class="row-icon" style="background:var(--violet-soft);color:var(--violet)"><span class="iconify" data-icon="ph:presentation"></span></div><div style="flex:1"><div class="t-cell-main">集体教研 · 示范课观摩</div><div class="t-cell-sub">下周三 · 全区线上同步</div></div><span class="chip chip-gray">下周三</span></div>';
}

/* ====== 集体备课发起向导 ====== */
const PREP_TOPICS = [
  {k:'t1', t:'《分数除法》 · 五年级数学', d:'本学期第 4 单元 · 全区统一进度', ico:'ph:books'},
  {k:'t2', t:'《平行四边形的面积》 · 五年级数学', d:'图形与几何 · 需学具演示', ico:'ph:calculator'},
  {k:'t3', t:'《拼音复习》 · 一年级语文', d:'期末复习 · 关注书写规范', ico:'ph:book-open'},
  {k:'t4', t:'《电路的秘密》 · 四年级科学', d:'双师课堂 · 村小实验条件受限', ico:'ph:flask'}
];
const PREP_TEACHERS = [
  {k:'p1', n:'李红梅', r:'青石镇小 · 数学', c:'#4F46E5'},
  {k:'p2', n:'陈建军', r:'双桥村小 · 数学', c:'#10B981'},
  {k:'p3', n:'王秀兰', r:'青石镇小 · 数学', c:'#F59E0B'},
  {k:'p4', n:'张伟', r:'团结村小 · 数学', c:'#EC4899'},
  {k:'p5', n:'刘洋', r:'青石镇小 · 科学', c:'#06B6D4'},
  {k:'p6', n:'赵敏', r:'新河村小 · 语文', c:'#8B5CF6'}
];
const prepState = {topic:'', teachers:[], mode:'', step:0};
function openPrepWiz(){
  prepState.topic = ''; prepState.teachers = []; prepState.mode = ''; prepState.step = 0;
  document.getElementById('prepTopicList').innerHTML = PREP_TOPICS.map(function(t){
    return '<div class="self-item" data-k="'+t.k+'" onclick="selPrepTopic(this)"><div class="si-ico"><span class="iconify" data-icon="'+t.ico+'"></span></div><div style="flex:1"><div class="si-name">'+t.t+'</div><div class="si-desc">'+t.d+'</div></div><span class="iconify" data-icon="ph:caret-right" style="color:var(--faint)"></span></div>';
  }).join('');
  document.getElementById('prepTeacherList').innerHTML = PREP_TEACHERS.map(function(t){
    return '<div class="self-item" data-k="'+t.k+'" onclick="selPrepTeacher(this)"><div class="si-ico" style="background:'+t.c+';color:#fff;box-shadow:none;font-size:13px;font-weight:800">'+t.n.charAt(0)+'</div><div style="flex:1"><div class="si-name">'+t.n+'</div><div class="si-desc">'+t.r+'</div></div><span class="iconify" data-icon="ph:check" style="color:var(--green);font-size:16px;visibility:hidden"></span></div>';
  }).join('');
  prepGo(0);
  document.getElementById('prepWiz').classList.add('on');
}
function closePrepWiz(){ document.getElementById('prepWiz').classList.remove('on'); }
function selPrepTopic(el){
  prepState.topic = el.dataset.k;
  el.parentElement.querySelectorAll('.self-item').forEach(function(x){ x.classList.remove('sel'); });
  el.classList.add('sel');
}
function selPrepTeacher(el){
  const k = el.dataset.k;
  const i = prepState.teachers.indexOf(k);
  const mark = el.querySelector('.iconify');
  if(i > -1){ prepState.teachers.splice(i, 1); el.classList.remove('sel'); if(mark) mark.style.visibility = 'hidden'; }
  else { prepState.teachers.push(k); el.classList.add('sel'); if(mark) mark.style.visibility = 'visible'; }
}
function selPrepMode(el){
  prepState.mode = el.dataset.v;
  el.parentElement.querySelectorAll('.opt-card').forEach(function(c){ c.classList.remove('sel'); });
  el.classList.add('sel');
  const names = prepState.teachers.map(function(k){ return PREP_TEACHERS.find(function(t){ return t.k === k; }).n; });
  const plan = document.getElementById('prepPlan');
  if(prepState.mode === 'same'){
    plan.innerHTML = '<div style="font-size:12.5px;font-weight:800;color:#0f172a;margin-bottom:8px">分工预览 · 同课异构</div><div style="font-size:12px;color:var(--muted);line-height:2">主备 A 稿：' + names[0] + ' ／ 主备 B 稿：' + (names[1] || names[0]) + ' ／ 审阅对比：' + names.slice(2).join('、') + ' ／ 学情数据：系统自动提供</div>';
  }else if(prepState.mode === 'main'){
    plan.innerHTML = '<div style="font-size:12.5px;font-weight:800;color:#0f172a;margin-bottom:8px">分工预览 · 主备共享</div><div style="font-size:12px;color:var(--muted);line-height:2">主备人：' + names[0] + ' ／ 学情支持：' + (names[1] || names[0]) + ' ／ 审阅人：' + names.slice(2).join('、') + ' ／ 共享教案库自动归档</div>';
  }else if(prepState.mode === 'topic'){
    plan.innerHTML = '<div style="font-size:12.5px;font-weight:800;color:#0f172a;margin-bottom:8px">分工预览 · 专题研讨</div><div style="font-size:12px;color:var(--muted);line-height:2">议题整理：' + names[0] + ' ／ 案例提供：' + names.slice(1,3).join('、') + ' ／ 纪要沉淀：AI 教研员自动生成</div>';
  }
}
function prepGo(step){
  prepState.step = step;
  document.querySelectorAll('#prepWiz .wiz-step').forEach(function(s){ s.classList.remove('on'); });
  document.getElementById('prepStep' + step).classList.add('on');
  document.querySelectorAll('#prepWiz .wiz-steps i').forEach(function(d,i){ d.classList.toggle('on', i <= step); });
  document.getElementById('prepWizSub').textContent = ['第 1 步 · 选择课题','第 2 步 · 选择参与教师','第 3 步 · 选择模式并预览分工'][step];
  document.getElementById('prepPrevBtn').style.visibility = step === 0 ? 'hidden' : 'visible';
  document.getElementById('prepNextBtn').innerHTML = step === 2 ? '<span class="iconify" data-icon="ph:check"></span>创建备课组' : '下一步';
}
function prepPrev(){ if(prepState.step > 0) prepGo(prepState.step - 1); }
function prepNext(){
  if(prepState.step === 0){
    if(!prepState.topic){ toast('请先选择一个课题'); return; }
    prepGo(1);
  }else if(prepState.step === 1){
    if(prepState.teachers.length === 0){ toast('请至少选择 1 位参与教师'); return; }
    prepGo(2);
  }else{
    if(!prepState.mode){ toast('请选择备课模式'); return; }
    prepDone();
  }
}
function prepDone(){
  const topic = PREP_TOPICS.find(function(t){ return t.k === prepState.topic; });
  const teachers = prepState.teachers.map(function(k){ return PREP_TEACHERS.find(function(t){ return t.k === k; }); });
  const modeName = {same:'同课异构', main:'主备共享', topic:'专题研讨'}[prepState.mode];
  const grid = document.getElementById('collabGrid');
  const avatars = teachers.map(function(t){ return '<span class="a" style="background:' + t.c + '">' + t.n.charAt(0) + '</span>'; }).join('') + '<span class="a more">+' + Math.max(0, 2 - teachers.length) + '</span>';
  const card = document.createElement('div');
  card.className = 'card card-hover';
  card.innerHTML = '<div class="card-head"><div class="card-title">新备课组 · ' + modeName + '</div><div class="card-extra"><span class="chip chip-amber">待开始</span></div></div><div style="padding:16px 20px"><div style="font-size:13px;font-weight:700;margin-bottom:8px">' + topic.t + '</div><div style="font-size:12px;color:var(--muted);line-height:1.7;margin-bottom:12px">已邀请 ' + teachers.length + ' 位教师 · 分工已按模式自动生成 · 系统将同步学情数据</div><div style="display:flex;align-items:center;gap:10px"><div class="avatar-stack">' + avatars + '</div><span style="font-size:11.5px;color:var(--faint)">' + teachers.length + ' 人已加入</span><button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="toast(\'备课组已创建，开始第一轮研讨\')">开始研讨</button></div></div>';
  grid.insertBefore(card, grid.firstChild);
  const tl = document.getElementById('collabTimeline');
  const item = document.createElement('div');
  item.className = 'tl-item b-amber';
  item.innerHTML = '<div class="tl-title">系统提示 · 备课组已创建</div><div class="tl-sub">「' + topic.t + '」备课组已成立，' + modeName + '模式 · 分工已自动分配</div><div class="tl-time">刚刚 · 系统消息</div>';
  tl.insertBefore(item, tl.firstChild);
  closePrepWiz();
  toast('集体备课已创建，邀请已发送');
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
