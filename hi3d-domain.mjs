// Independent sample business domain. Intentional defects are confined to baseline.
export class DemoDomain {
  constructor(version='baseline') { this.version=version; this.rows=[]; this.next=1; }
  request(method,path,body={},actor='alice') {
    const roles={alice:'applicant',bob:'applicant',reviewer:'approver'};
    const out=(status,data)=>({status,body:data});
    if(!roles[actor]) return out(401,{code:'UNAUTHENTICATED'});
    if(path==='/requests'&&method==='POST') {
      if(typeof body.title!=='string'||!body.title.trim())return out(422,{code:'TITLE_REQUIRED'});
      const max=this.version==='patched'?1000:10000;
      if(typeof body.amount!=='number'||!Number.isFinite(body.amount)||body.amount<1||body.amount>max)return out(422,{code:'AMOUNT_OUT_OF_RANGE'});
      const item={id:`APP-${this.next++}`,title:body.title.trim(),amount:body.amount,owner:actor,state:'DRAFT',tasks:0};
      this.rows.push(item);return out(201,{...item});
    }
    if(path.startsWith('/requests?')&&method==='GET') {
      const q=new URLSearchParams(path.split('?')[1]);const page=Math.max(1,Number(q.get('page'))||1),size=Math.min(20,Math.max(1,Number(q.get('size'))||10));
      const all=this.rows.filter(r=>actor==='reviewer'||r.owner===actor);
      return out(200,{items:all.slice((page-1)*size,page*size).map(r=>({...r})),total:all.length});
    }
    const m=path.match(/^\/requests\/(APP-\d+)(?:\/(submit|approve))?$/);
    if(!m)return out(404,{code:'NOT_FOUND'});
    const item=this.rows.find(r=>r.id===m[1]);if(!item)return out(404,{code:'NOT_FOUND'});
    if(method==='GET'&&!m[2]) return out(200,{...item});
    if(method==='POST'&&m[2]==='submit'){
      if(this.version==='patched'&&item.owner!==actor)return out(403,{code:'NOT_OWNER'});
      if(item.state!=='DRAFT')return out(409,{code:'STATE_CONFLICT'});
      item.state='PENDING';item.tasks+=1;return out(200,{...item});
    }
    if(method==='POST'&&m[2]==='approve'){
      if(roles[actor]!=='approver')return out(403,{code:'ROLE_DENIED'});
      if(item.state!=='PENDING')return out(409,{code:'STATE_CONFLICT'});
      item.state='APPROVED';return out(200,{...item});
    }
    return out(405,{code:'METHOD_NOT_ALLOWED'});
  }
}

export async function createClient(version,http=false){
  const traces=[];let sid,domain;
  const base=new URL('hi3d-api/',location.href);
  if(http){
    const r=await fetch(new URL('session',base),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version})});
    if(!r.ok)throw new Error('本地 API 服务未就绪，请按运行说明启动 Python 服务');
    sid=(await r.json()).id;
  }else domain=new DemoDomain(version);
  return {traces,async call(method,path,body={},actor='alice'){
    const started=performance.now();let response;
    if(http){
      const url=new URL(`session/${sid}${path}`,base);
      const r=await fetch(url,{method,headers:{'Content-Type':'application/json','X-Demo-Actor':actor},...(method==='GET'?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});
      response={status:r.status,body:await r.json()};
    }else response=domain.request(method,path,body,actor);
    traces.push({method,path,actor,request:body,response:structuredClone(response),duration:Math.round(performance.now()-started),transport:http?'HTTP':'内存契约模拟'});
    return response;
  },async close(){if(http&&sid)await fetch(new URL(`session/${sid}`,base),{method:'DELETE'}).catch(()=>{});}};
}

export const requirements=[
  {id:'REQ-001',title:'申请金额边界',text:'费用申请金额必须在 1 至 1000 元之间（含边界）；超出范围返回 422，不得创建记录。',module:'申请管理',type:'边界值',priority:'P0',recipe:'amount',example:true},
  {id:'REQ-002',title:'申请所有者权限',text:'仅申请所有者可以提交自己的草稿。其他申请人提交应返回 403，原记录保持 DRAFT，审批任务数仍为 0。',module:'权限控制',type:'权限',priority:'P0',recipe:'owner',example:true},
  {id:'REQ-003',title:'提交状态流转',text:'申请人提交自己的 DRAFT 草稿，状态应变为 PENDING，产生且仅产生 1 个审批任务。',module:'审批流程',type:'流程',priority:'P0',recipe:'submit',example:true},
  {id:'REQ-004',title:'审批角色与状态',text:'仅审批人可以审批 PENDING 申请；成功后为 APPROVED。普通申请人审批返回 403；审批草稿返回 409。',module:'审批流程',type:'权限',priority:'P0',recipe:'approve',example:true},
  {id:'REQ-005',title:'顺序重复提交',text:'已提交申请再次提交返回 409，不产生重复审批任务；任务数保持 1。此规则不覆盖并发提交。',module:'审批流程',type:'异常',priority:'P1',recipe:'duplicate',example:true},
  {id:'REQ-006',title:'申请标题不能为空',text:'标题为空或全部空格时返回 422，错误码 TITLE_REQUIRED；页面必须显示必填提示。',module:'申请管理',type:'功能',priority:'P1',recipe:'required',example:true},
  {id:'REQ-007',title:'列表分页与一致性',text:'创建 3 条申请，第一页每页 2 条应返回 2 条，total 为 3；列表金额与创建时一致。',module:'查询列表',type:'数据一致性',priority:'P1',recipe:'pagination',example:true},
  {id:'REQ-008',title:'角色菜单与表单交互',text:'申请人不显示审批按钮，审批人显示审批按钮；合法表单提交后页面出现创建成功提示。',module:'前端交互',type:'前端 UI',priority:'P1',recipe:'ui',example:true},
];
const specs=[
 ['AMOUNT_OK','REQ-001','合法金额可创建申请','接口','P0',201,'合法金额 500 元，创建成功'],
 ['AMOUNT_MIN','REQ-001','金额下界 1 元有效','边界值','P0',201,'金额为 1，创建成功'],
 ['AMOUNT_MAX','REQ-001','金额上界 1000 元有效','边界值','P0',201,'金额为 1000，创建成功'],
 ['AMOUNT_LOW','REQ-001','金额 0 元应被拒绝','边界值','P0',422,'金额为 0，不创建记录'],
 ['AMOUNT_HIGH','REQ-001','金额 1001 元应被拒绝','边界值','P0',422,'金额超出上限，拒绝且不创建记录'],
 ['OWNER','REQ-002','其他申请人不能提交他人申请','权限','P0',403,'Bob 提交 Alice 草稿应拒绝，状态与任务数不变'],
 ['SUBMIT','REQ-003','草稿提交并产生一个审批任务','流程','P0',200,'状态 PENDING，tasks=1'],
 ['APPROVE','REQ-004','审批人可以完成审批','流程','P0',200,'状态 APPROVED'],
 ['ROLE','REQ-004','申请人不能调用审批接口','权限','P0',403,'错误码 ROLE_DENIED，状态 PENDING'],
 ['APPROVE_DRAFT','REQ-004','草稿不能直接审批','异常','P1',409,'状态仍为 DRAFT'],
 ['DUPLICATE','REQ-005','顺序重复提交不产生重复任务','异常','P1',409,'第二次提交拒绝，tasks 保持 1'],
 ['REQUIRED','REQ-006','空白标题被接口拒绝','功能','P1',422,'错误码 TITLE_REQUIRED'],
 ['PAGINATION','REQ-007','分页计数与金额一致','数据一致性','P1',200,'items=2，total=3，首条 amount=100'],
 ['UI_REQUIRED','REQ-006','表单展示必填提示','前端 UI','P1',null,'页面出现“请输入申请标题”'],
 ['UI_ROLE','REQ-008','审批按钮按角色显示','前端 UI','P1',null,'申请人不可见；审批人可见'],
 ['UI_CREATE','REQ-008','页面表单创建成功','前端 UI','P1',null,'页面显示“创建成功”，记录金额 200'],
];
export function generateCases(reqs,existing=[]){
  const matched=reqs.filter(r=>requirements.some(seed=>seed.id===r.id&&seed.text===r.text));
  const allowed=new Set(matched.map(r=>r.id));
  const generated=specs.filter(s=>allowed.has(s[1])&&!existing.some(c=>c.recipe===s[0])).map((s,i)=>({
    id:`TC-${String(specs.indexOf(s)+1).padStart(3,'0')}`,recipe:s[0],requirement:s[1],title:s[2],type:s[3],priority:s[4],expectedStatus:s[5],expected:s[6],
    module:reqs.find(r=>r.id===s[1]).module,precondition:'独立演示会话；已载入所选业务版本；Alice/Bob/Reviewer 为模拟身份',
    steps:s[0].startsWith('UI_')?'打开示例页面 → 执行 DOM 操作 → 检查可见结果':'准备独立数据 → 调用目标接口 → 校验状态码、业务状态及副作用',
    data:s[0]==='AMOUNT_HIGH'?'amount=1001':s[0]==='OWNER'?'owner=alice; actor=bob':'由固定 recipe 生成隔离测试数据',
    automatic:true,reviewed:false,sourceText:reqs.find(r=>r.id===s[1]).text,revision:1,example:true,
  }));
  return {cases:generated,unsupported:reqs.filter(r=>!allowed.has(r.id)).map(r=>r.id)};
}

export const patches=[
 {id:'FIX-001',title:'修复金额上限校验',caseRecipe:'AMOUNT_HIGH',file:'hi3d-policy-before.py → hi3d-policy-after.py',reason:'演示基线错误地允许金额至 10000 元，与已确认规则 1000 元冲突。',before:'MAX_AMOUNT = 10000',after:'MAX_AMOUNT = 1000'},
 {id:'FIX-002',title:'补充资源所有者校验',caseRecipe:'OWNER',file:'hi3d-policy-before.py → hi3d-policy-after.py',reason:'演示基线在提交时未验证申请所有者，Bob 可以提交 Alice 的申请。',before:'def can_submit(owner, actor):\n    return True',after:'def can_submit(owner, actor):\n    return owner == actor'}
];
