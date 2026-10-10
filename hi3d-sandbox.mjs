import {createClient} from './hi3d-domain.mjs';
let client,actor='alice',pending=Promise.resolve(),last=null;
const $=s=>document.querySelector(s);
window.sandbox={ready:true,async configure(version,http){if(client)await client.close();client=await createClient(version,http);this.setActor('alice');$('#title').value='';$('#amount').value='200';$('#message').textContent='';$('#record').hidden=true;last=null;},setActor(value){actor=value;$('#actor-label').textContent=value==='reviewer'?'Reviewer / 审批人':`${value} / 申请人`;$('#approve-button').hidden=value!=='reviewer';},get traces(){return client?.traces||[];},get last(){return last;},async idle(){await pending;},async dispose(){await client?.close();}};
$('#request-form').addEventListener('submit',event=>{
 event.preventDefault();pending=(async()=>{
  const title=$('#title').value.trim(),amount=Number($('#amount').value);$('#message').className='';
  if(!title){$('#message').textContent='请输入申请标题';return;}
  if(!client)await window.sandbox.configure('baseline',false);
  try{last=await client.call('POST','/requests',{title,amount},actor);$('#message').textContent=last.status===201?'创建成功':`创建失败：${last.body.code}`;$('#message').className=last.status===201?'success':'';$('#record').hidden=false;$('#record').textContent=JSON.stringify(last.body,null,2);}catch(e){$('#message').textContent=e.message;}
 })();
});
$('#approve-button').onclick=()=>{$('#message').textContent='审批操作由工作台 API 测试驱动；此处只验证按钮可见性。';};
$('#my-requests').onclick=()=>{$('#message').textContent='当前为独立表单测试页面，完整列表由工作台分页测试验证。';};
