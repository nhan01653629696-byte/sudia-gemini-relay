// Dedicated private Gemini Worker: deploy this separately, connect with Pages Service Binding.
// workers_dev = false in wrangler.jsonc. Never embed API keys in GitHub.
const reply=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const errorText=body=>typeof body?.error==='string'?body.error:body?.error?.message||`HTTP error`;
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname!=='/generate')return reply({error:'Not found'},404);
  if(request.method!=='POST')return reply({error:'Method not allowed'},405);
  if(!env.GEMINI_API_KEY)return reply({error:'Chưa đặt GEMINI_API_KEY trong Worker riêng'},503);
  const raw=await request.text();if(raw.length>25000)return reply({error:'Dữ liệu yêu cầu quá dài'},413);
  let data;try{data=JSON.parse(raw)}catch{return reply({error:'JSON không hợp lệ'},400)}
  const prompt=data?.prompt,mode=data?.mode||'text',model=data?.model||env.GEMINI_MODEL||'gemini-3.8-flash';
  if(typeof prompt!=='string'||prompt.trim().length<3||prompt.length>14000)return reply({error:'Nội dung yêu cầu không hợp lệ'},400);
  if(!['text','json'].includes(mode))return reply({error:'Chế độ AI không hợp lệ'},400);
  if(typeof model!=='string'||!/^gemini-[a-z0-9][a-z0-9._-]{1,75}$/.test(model))return reply({error:'Tên mô hình không hợp lệ'},400);
  const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),23000);
  try{
   const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
    method:'POST',headers:{'content-type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},
    body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:mode==='json'?0.3:0.55,maxOutputTokens:mode==='json'?1600:650,...(mode==='json'?{responseMimeType:'application/json'}:{})}}),signal:ctrl.signal});
   const body=await response.json().catch(()=>({}));
   if(!response.ok){
    // Preserve the error for a trusted caller; do not log credentials or student data.
    return reply({error:`Gemini ${response.status}: ${errorText(body)}`.slice(0,800)},response.status);
   }
   const text=(body.candidates||[]).flatMap(c=>(c.content?.parts||[]).map(p=>p.text||'')).join('\n').trim();
   if(!text)return reply({error:'Gemini không gửi nội dung'},502);
   return reply({text});
  }catch(e){return reply({error:e?.name==='AbortError'?'Gemini phản hồi quá chậm':'Không thể kết nối Gemini'},503)}
  finally{clearTimeout(timeout)}
 }
};
