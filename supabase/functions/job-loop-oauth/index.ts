import { adminClient } from '../_shared/runtime.ts';
import { LoopRepository } from '../_shared/job-loop-repository.ts';
import { completeGmail, returnUrl } from './gmail.ts';
const env=(name:string)=>Deno.env.get(name);
Deno.serve(async req=>{
  if(req.method!=='GET')return new Response(null,{status:405});let destination:string;
  const redirect=(location:string)=>new Response(null,{status:303,headers:{Location:location,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  try{destination=returnUrl(env,'unavailable');const url=new URL(req.url);if(url.searchParams.has('error'))return redirect(destination);
    const code=url.searchParams.get('code'),state=url.searchParams.get('state');if(!code||!state)return redirect(destination);
    const ticket=await completeGmail(new LoopRepository(adminClient()),code,state,env);const target=new URL(returnUrl(env,'pending'));target.hash=`gmail_ticket=${encodeURIComponent(ticket)}`;return redirect(target.href);
  }catch{return new Response('Mailbox connection could not be completed. Return to Jobvance and start a new connection.',{status:400,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});}
});
