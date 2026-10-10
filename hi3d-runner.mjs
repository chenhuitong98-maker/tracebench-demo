import {createClient} from './hi3d-domain.mjs';
export async function executeCase(test,{version='baseline',http=false,frame=null}={}){
 const start=performance.now(),checks=[],notes=[];let client,snapshot='';
 const eq=(label,actual,expected)=>{checks.push({label,actual:actual===undefined?null:actual,expected:expected===undefined?null:expected,passed:JSON.stringify(actual)===JSON.stringify(expected)});};
 try{
  if(!test.automatic)return {id:test.id,status:'BLOCKED',checks:[],traces:[],reason:'此用例为人工用例，未自动执行',duration:0};
  if(test.recipe.startsWith('UI_')){
   if(!frame?.contentWindow?.sandbox?.ready)throw new Error('示例业务页面尚未就绪');
   const sb=frame.contentWindow.sandbox,d=frame.contentDocument;await sb.configure(version,http);
   if(test.recipe==='UI_REQUIRED'){
    d.querySelector('#title').value='';d.querySelector('#create-button').click();await sb.idle();eq('必填提示',d.querySelector('#message').textContent,'请输入申请标题');
   }else if(test.recipe==='UI_ROLE'){
    sb.setActor('alice');eq('申请人审批按钮隐藏',d.querySelector('#approve-button').hidden,true);
    sb.setActor('reviewer');eq('审批人审批按钮可见',d.querySelector('#approve-button').hidden,false);
   }else if(test.recipe==='UI_CREATE'){
    d.querySelector('#title').value='UI 自动化示例';d.querySelector('#amount').value='200';d.querySelector('#create-button').click();await sb.idle();eq('成功提示',d.querySelector('#message').textContent,'创建成功');eq('创建金额',sb.last?.body?.amount,200);
   }else throw new Error('不支持的 UI recipe');
   snapshot=d.querySelector('main').outerHTML;
   const traces=structuredClone(sb.traces);await sb.dispose();
   return {id:test.id,status:checks.every(c=>c.passed)?'PASSED':'FAILED',checks,traces,snapshot,duration:Math.round(performance.now()-start),transport:'真实 iframe DOM 操作'+(http?' + HTTP':' + 内存契约模拟')};
  }
  client=await createClient(version,http);
  const call=(...args)=>client.call(...args);
  const create=async(amount=500,title='隔离测试申请')=>call('POST','/requests',{title,amount});
  let r,id;
  if(test.recipe.startsWith('AMOUNT_')){
   const values={AMOUNT_OK:500,AMOUNT_MIN:1,AMOUNT_MAX:1000,AMOUNT_LOW:0,AMOUNT_HIGH:1001};r=await create(values[test.recipe]);eq('响应状态码',r.status,test.expectedStatus);
   const list=await call('GET','/requests?page=1&size=10');eq('持久化记录数',list.body.total,test.expectedStatus===201?1:0);
   if(test.expectedStatus===201)eq('创建金额',r.body.amount,values[test.recipe]);
  }else if(test.recipe==='REQUIRED'){
   r=await create(500,'   ');eq('响应状态码',r.status,test.expectedStatus);eq('错误码',r.body.code,'TITLE_REQUIRED');
  }else if(test.recipe==='PAGINATION'){
   await create(100);await create(200);await create(300);r=await call('GET','/requests?page=1&size=2');eq('响应状态码',r.status,test.expectedStatus);eq('页内条数',r.body.items.length,2);eq('总数',r.body.total,3);eq('金额一致性',r.body.items[0].amount,100);
  }else{
   const setup=await create();if(setup.status!==201)throw new Error('准备草稿失败');id=setup.body.id;
   if(test.recipe==='OWNER'){
    r=await call('POST',`/requests/${id}/submit`,{},'bob');eq('响应状态码',r.status,test.expectedStatus);const after=await call('GET',`/requests/${id}`);eq('原状态未改变',after.body.state,'DRAFT');eq('未创建审批任务',after.body.tasks,0);
   }else if(test.recipe==='APPROVE_DRAFT'){
    r=await call('POST',`/requests/${id}/approve`,{},'reviewer');eq('响应状态码',r.status,test.expectedStatus);const after=await call('GET',`/requests/${id}`);eq('草稿状态保持',after.body.state,'DRAFT');
   }else{
    r=await call('POST',`/requests/${id}/submit`);
    if(test.recipe==='SUBMIT'){eq('响应状态码',r.status,test.expectedStatus);eq('提交后状态',r.body.state,'PENDING');eq('审批任务数',r.body.tasks,1);}
    else if(test.recipe==='APPROVE'){r=await call('POST',`/requests/${id}/approve`,{},'reviewer');eq('响应状态码',r.status,test.expectedStatus);eq('审批后状态',r.body.state,'APPROVED');}
    else if(test.recipe==='ROLE'){r=await call('POST',`/requests/${id}/approve`,{},'alice');eq('响应状态码',r.status,test.expectedStatus);eq('错误码',r.body.code,'ROLE_DENIED');eq('原状态保持',(await call('GET',`/requests/${id}`)).body.state,'PENDING');}
    else if(test.recipe==='DUPLICATE'){r=await call('POST',`/requests/${id}/submit`);eq('响应状态码',r.status,test.expectedStatus);eq('审批任务不重复',(await call('GET',`/requests/${id}`)).body.tasks,1);}
    else throw new Error('此用例没有匹配的执行 recipe');
   }
  }
  return {id:test.id,status:checks.length&&checks.every(c=>c.passed)?'PASSED':'FAILED',checks,traces:client.traces,snapshot,notes,duration:Math.round(performance.now()-start),transport:http?'真实 HTTP':'内存契约模拟'};
 }catch(e){return {id:test.id,status:'ERROR',checks,traces:client?.traces||[],snapshot,reason:e.message,duration:Math.round(performance.now()-start)};}
 finally{await client?.close();}
}
export function compileSuite(cases){
 const definitions=JSON.stringify(cases,null,2);
 const source=`// Generated from reviewed case definitions. Fixed recipes; not LLM generated.\nimport {executeCase} from './hi3d-runner.mjs';\nexport const definitions = ${definitions};\nexport async function run(index, context) { return executeCase(definitions[index], context); }\n`;
 return {source,async load(){
  const executable=source.replace("'./hi3d-runner.mjs'",JSON.stringify(new URL('./hi3d-runner.mjs',import.meta.url).href));
  const url=URL.createObjectURL(new Blob([executable],{type:'text/javascript'}));
  try{return await import(url);}finally{URL.revokeObjectURL(url);}
 }};
}
