import {createApp,ref,reactive,computed,nextTick} from './vendor/vue.esm-browser.prod.js';
import {requirements as originalRequirements,generateCases,patches} from './hi3d-domain.mjs';
import {load,save,initial,serialize,importState} from './hi3d-store.mjs';
import {compileSuite} from './hi3d-runner.mjs';

const icons={grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',doc:'M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6',check:'M4 5h16v16H4zM9 3h6v4H9zM8 13l2 2 5-5',play:'M8 4l13 8-13 8z',bug:'M8 8h8v9a4 4 0 0 1-8 0zM9 8V5h6v3M4 11h4m8 0h4M4 17h4m8 0h4M12 8v12',report:'M5 3h14v18H5zM9 17v-4m3 4V8m3 9v-6',arrow:'M5 12h14m-5-5 5 5-5 5',plus:'M12 5v14M5 12h14',search:'M10 17a7 7 0 1 1 0-14 7 7 0 0 1 0 14zm5-2 6 6',download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',settings:'M4 7h16M4 17h16M8 4v6M16 14v6',shield:'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6',close:'M6 6l12 12M18 6 6 18',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l4 2',folder:'M3 6h7l2 3h9v11H3z'};
const app=createApp({setup(){
 const params=new URLSearchParams(location.search),http=false;
 const nav=[['overview','grid','项目概览'],['requirements','doc','需求与规则'],['cases','check','用例设计'],['execution','play','执行中心'],['defects','bug','缺陷与修复'],['reports','report','测试报告']];
 const page=ref('overview'),query=ref(''),typeFilter=ref('全部类型'),statusFilter=ref('全部状态'),toast=ref(''),drawer=ref(null),form=reactive({}),errors=ref({}),selected=ref([]),busy=ref(false),cancel=ref(false),progress=ref(0),liveResults=ref([]),activeCase=ref(''),frame=ref(null),showSandbox=ref(false),runSelection=ref(''),evidence=ref(null),importInput=ref(null),docInput=ref(null),settings=ref(false),persistError=ref(''),mobileNav=ref(false);
 let init;try{init=load();}catch(e){init=initial();persistError.value='存档无法读取，原数据已保留。当前使用临时示例，未覆盖损坏存档。请先导出或检查原始数据。';}
 const state=reactive(init);
 const latest=computed(()=>state.runs.at(-1)||null);
 const chosenRun=computed(()=>state.runs.find(r=>r.id===runSelection.value)||latest.value);
 const metrics=computed(()=>counts(latest.value?.results||[]));
 const filteredCases=computed(()=>state.cases.filter(c=>(!query.value||`${c.id} ${c.title} ${c.requirement}`.toLowerCase().includes(query.value.toLowerCase()))&&(typeFilter.value==='全部类型'||c.type===typeFilter.value)&&(statusFilter.value==='全部状态'||(statusFilter.value==='已审核')===c.reviewed)));
 const filteredReqs=computed(()=>state.requirements.filter(r=>!query.value||`${r.id} ${r.title} ${r.text}`.toLowerCase().includes(query.value.toLowerCase())));
 const covered=computed(()=>new Set(state.cases.map(c=>c.requirement)).size);
 const approved=computed(()=>state.cases.filter(c=>c.reviewed).length);
 const defects=computed(()=>{
  const found=new Map();for(const run of state.runs)for(const result of run.results){if(result.status!=='FAILED')continue;const c=run.cases.find(c=>c.id===result.id);if(!c)continue;if(!found.has(c.recipe))found.set(c.recipe,{test:c,run,result});}
  return [...found.values()].map(d=>({...d,resolved:state.runs.some(r=>r.version==='patched'&&r.hash===d.run.hash&&r.transport===d.run.transport&&r.results.some(x=>x.id===d.test.id&&x.status==='PASSED')),patch:patches.find(p=>p.caseRecipe===d.test.recipe)}));
 });
 const reportCounts=computed(()=>counts(chosenRun.value?.results||[]));
 function counts(results){const c={passed:0,failed:0,error:0,blocked:0,cancelled:0,total:results.length};for(const r of results){const key=r.status==='PASSED'?'passed':r.status==='FAILED'?'failed':r.status==='ERROR'?'error':r.status==='BLOCKED'?'blocked':'cancelled';c[key]++;}c.rate=c.passed+c.failed?Math.round(c.passed/(c.passed+c.failed)*1000)/10:null;return c;}
 function notify(text){toast.value=text;setTimeout(()=>{if(toast.value===text)toast.value='';},5000);}
 function persist(){try{save(JSON.parse(JSON.stringify(state)));persistError.value='';return true;}catch(e){persistError.value='本地保存失败，当前更改仅在内存中。请立即导出备份。原因：'+e.message;return false;}}
 function audit(message){state.audit.push({at:new Date().toISOString(),message});}
 function go(key){page.value=key;query.value='';mobileNav.value=false;drawer.value=null;history.replaceState(null,'','#'+key);}
 function generate(){if(busy.value)return;const result=generateCases(state.requirements,state.cases);const ids=new Set(state.cases.map(c=>c.id));for(const c of result.cases){if(ids.has(c.id))c.id=`TC-${Date.now()}-${c.recipe}`;state.cases.push(c);ids.add(c.id);}audit(`规则模板生成 ${result.cases.length} 条用例；${result.unsupported.length} 条需求需人工设计。未调用大模型。`);persist();go('cases');notify(result.cases.length?`已生成 ${result.cases.length} 条用例，请审核后执行。`:'没有新增模板匹配；修改过的需求和新需求请人工设计。');}
 function reviewAll(){if(busy.value)return;const targets=selected.value.length?state.cases.filter(c=>selected.value.includes(c.id)):filteredCases.value;for(const c of targets)c.reviewed=true;audit(`用户审核 ${targets.length} 条用例`);persist();notify(`已审核 ${targets.length} 条用例`);}
 function toggleAll(event){selected.value=event.target.checked?filteredCases.value.map(c=>c.id):[];}
 function openRequirement(r=null){errors.value={};Object.keys(form).forEach(k=>delete form[k]);Object.assign(form,r?JSON.parse(JSON.stringify(r)):{id:`REQ-${String(Math.max(8,...state.requirements.map(x=>Number(x.id.split('-')[1])||0))+1).padStart(3,'0')}`,title:'',text:'',module:'申请管理',type:'功能',priority:'P1',example:false});drawer.value={kind:'requirement',editing:!!r};}
 function saveRequirement(){
  errors.value={};if(!form.title?.trim())errors.value.title='请填写需求标题';if(!form.text?.trim())errors.value.text='请填写可验证的业务规则';if(Object.keys(errors.value).length)return;
  const i=state.requirements.findIndex(r=>r.id===form.id);const previous=state.requirements[i];const changed=previous?.text!==form.text;
  const value=JSON.parse(JSON.stringify(form));if(i<0)state.requirements.push(value);else state.requirements.splice(i,1,value);
  if(changed)for(const c of state.cases.filter(c=>c.requirement===form.id)){c.reviewed=false;c.automatic=false;c.revision++;}
  audit(`${i<0?'新增':'修改'}需求 ${form.id}${changed&&i>=0?'；关联用例已撤销审核并转人工，防止执行过期规则':''}`);persist();drawer.value=null;notify('需求已保存');
 }
 function openCase(c,edit=false){errors.value={};Object.keys(form).forEach(k=>delete form[k]);Object.assign(form,JSON.parse(JSON.stringify(c)));drawer.value={kind:edit?'case-edit':'case-detail'};}
 function newCase(){openCase({id:`TC-M-${Date.now().toString().slice(-7)}`,title:'',requirement:state.requirements[0]?.id||'',module:'申请管理',type:'功能',priority:'P1',precondition:'',steps:'',data:'',expected:'',expectedStatus:null,automatic:false,reviewed:false,recipe:'MANUAL',sourceText:'',revision:1,example:false},true);}
 function saveCase(){errors.value={};for(const key of ['title','requirement','precondition','steps','expected'])if(!String(form[key]||'').trim())errors.value[key]='此字段为必填';if(Object.keys(errors.value).length)return;const i=state.cases.findIndex(c=>c.id===form.id);const c=JSON.parse(JSON.stringify(form));c.reviewed=false;c.revision=(i<0?0:state.cases[i].revision)+1;c.sourceText=state.requirements.find(r=>r.id===c.requirement)?.text||'';
  // Editing a known recipe's semantics cannot silently continue executing stale code.
  if(i>=0&&['steps','data','expected','precondition','requirement','expectedStatus'].some(k=>JSON.stringify(c[k])!==JSON.stringify(state.cases[i][k])))c.automatic=false;
  if(i<0)state.cases.push(c);else state.cases.splice(i,1,c);audit(`保存用例 ${c.id} v${c.revision}，需重新审核${!c.automatic?'；执行方式为人工':''}`);persist();drawer.value=null;notify('用例已保存；业务步骤变更后需适配执行器');
 }
 async function ensureFrame(){await nextTick();for(let i=0;i<60;i++){if(frame.value?.contentWindow?.sandbox?.ready)return;await new Promise(r=>setTimeout(r,100));}throw new Error('示例页面加载超时，请重试');}
 async function runSuite(){
  if(busy.value)return;if(!state.cases.length){generate();return;}const cases=state.cases.filter(c=>c.reviewed&&(!selected.value.length||selected.value.includes(c.id))).map(c=>JSON.parse(JSON.stringify(c)));
  if(!cases.length){go('cases');notify('请先审核用例，再运行测试');return;}
  busy.value=true;cancel.value=false;progress.value=0;liveResults.value=[];go('execution');let run;
  try{
   await ensureFrame();const compiled=compileSuite(cases),digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(compiled.source));const hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
   const module=await compiled.load();run={id:`RUN-${Date.now().toString(36).toUpperCase()}`,createdAt:new Date().toISOString(),version:state.version,transport:http?'HTTP 实测':'浏览器沙盒',cases,source:compiled.source,hash,results:[],finished:false};
   state.runs.push(run);run=state.runs.at(-1);persist();const start=performance.now();
   for(let i=0;i<cases.length;i++){
    activeCase.value=cases[i].title;let result;
    if(cancel.value)result={id:cases[i].id,status:'CANCELLED',checks:[],traces:[],reason:'用户取消，未执行',duration:0};
    else result=await module.run(i,{version:run.version,http,frame:frame.value});
    run.results.push(result);liveResults.value=[...run.results];progress.value=Math.round((i+1)/cases.length*100);await new Promise(r=>requestAnimationFrame(r));
   }
   run.duration=Math.round(performance.now()-start);run.finished=true;audit(`${run.id} ${run.transport}：${counts(run.results).passed} 通过 / ${counts(run.results).failed} 失败；版本 ${run.version}`);persist();runSelection.value=run.id;notify(cancel.value?'运行已取消，已执行结果保留':'测试完成，结果与证据已归档');
  }catch(e){if(run){run.error=e.message;run.finished=false;persist();}notify('执行中断：'+e.message);}
  finally{busy.value=false;activeCase.value='';}
 }
 async function reviewRun(){if(!state.cases.length)generate();for(const c of state.cases)c.reviewed=true;selected.value=[];audit('用户选择“审核示例并运行”');persist();await runSuite();}
 function applyPatch(){if(busy.value)return;state.version='patched';audit('用户应用演示预置补丁集：金额上限 1000、申请所有者校验；未修改测试断言。尚需回归。');persist();notify('已切换至修复版本；请运行回归，历史证据保持不变');}
 function setBaseline(){if(busy.value)return;state.version='baseline';audit('切换至包含两个已知缺陷的演示基线；保留历史运行');persist();notify('已切回演示基线');}
 function inspectResult(run,result){evidence.value={run,result,test:run.cases.find(c=>c.id===result.id)};}
 function download(text,name,type='application/json'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);}
 function exportBackup(){download(serialize(JSON.parse(JSON.stringify(state))),'hi3d-tracebench-backup.json');notify('备份已导出');}
 async function importBackup(event){try{const file=event.target.files[0];if(!file)return;if(file.size>4500000)throw new Error('文件不能超过 4.5 MB');const incoming=importState(await file.text());Object.assign(state,incoming);selected.value=[];runSelection.value='';audit('导入经校验的备份；原存档保留在 previous 槽位');persist();notify('备份已恢复；导入运行标记为历史记录');}catch(e){notify('导入失败，原数据未覆盖：'+e.message);}finally{event.target.value='';}}
 async function importDocument(event){try{const file=event.target.files[0];if(!file)return;if(file.size>200000)throw new Error('文本文件不能超过 200 KB');const text=await file.text();openRequirement();form.title=file.name.replace(/\.[^.]+$/,'');form.text=text.slice(0,10000);if(text.length>10000)notify('文本超过 10000 字，未自动保存；请拆分需求后导入。');else notify('文本已读入，请补充规则信息并保存；不会自动编造用例');}catch(e){notify(e.message);}finally{event.target.value='';}}
 function exportCases(){download(JSON.stringify(state.cases,null,2),'hi3d-test-cases.json');}
 function exportScript(run=chosenRun.value){if(!run)return;download(run.source,'hi3d-generated-suite.mjs','text/javascript');}
 function exportReport(run=chosenRun.value){if(!run)return;const n=counts(run.results);const lines=[`# TraceBench 测试报告`, `\n非参赛概念 demo · 示例业务 · 未调用大模型`, `\n运行：${run.id}\n时间：${run.createdAt}\n版本：${run.version}\n方式：${run.transport}\n完成：${run.finished?'是':'否'}\n脚本 SHA-256：${run.hash}`,`\n通过 ${n.passed} / 失败 ${n.failed} / 错误 ${n.error} / 阻塞 ${n.blocked} / 取消 ${n.cancelled}`,`\n判定通过率：${n.rate??'不适用'}%（通过 / 通过与失败之和）\n本报告仅覆盖选定示例，不代表生产安全或 SG-UAP 合规。`,...run.results.map(r=>`\n## ${r.id} ${run.cases.find(c=>c.id===r.id)?.title}\n状态：${r.status}\n${r.checks.map(c=>`- ${c.label}：预期 ${JSON.stringify(c.expected)}；实际 ${JSON.stringify(c.actual)}；${c.passed?'通过':'失败'}`).join('\n')}\n${r.reason||''}\n\n请求响应证据：\n\n\`\`\`json\n${JSON.stringify(r.traces,null,2)}\n\`\`\`${r.snapshot?'\n\nDOM 快照（非截图）：\n\n```html\n'+r.snapshot+'\n```':''}`)];download(lines.join('\n'),'hi3d-test-report.md','text/markdown');}
 const statusLabel=s=>({PASSED:'通过',FAILED:'失败',ERROR:'执行错误',BLOCKED:'阻塞',CANCELLED:'取消'}[s]||'未执行');
 const time=v=>new Date(v).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
 const title=computed(()=>nav.find(n=>n[0]===page.value)?.[2]||'项目概览');
 const route=location.hash.slice(1);if(nav.some(n=>n[0]===route))page.value=route;
 if(document.body.dataset.entry==='detail'||document.body.dataset.entry==='edit'){page.value='cases';const c=state.cases.find(c=>c.id===params.get('id'));if(c)openCase(c,document.body.dataset.entry==='edit');}
 window.addEventListener('beforeunload',e=>{if(busy.value){e.preventDefault();e.returnValue='';}});
 return {icons,http,nav,state,page,query,typeFilter,statusFilter,toast,drawer,form,errors,selected,busy,cancel,progress,liveResults,activeCase,frame,showSandbox,runSelection,evidence,importInput,docInput,settings,persistError,mobileNav,latest,chosenRun,metrics,filteredCases,filteredReqs,covered,approved,defects,patches,reportCounts,title,counts,notify,go,generate,reviewAll,toggleAll,openRequirement,saveRequirement,openCase,newCase,saveCase,runSuite,reviewRun,applyPatch,setBaseline,inspectResult,download,exportBackup,importBackup,importDocument,exportCases,exportScript,exportReport,statusLabel,time};
}});
app.component('icon',{props:['name'],setup(){return {icons};},template:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="icons[name]||icons.doc"/></svg>`});
app.mount('#app');
document.getElementById('boot-error')?.remove();
