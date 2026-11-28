import { createPrivateKey, sign } from 'node:crypto';

export type PushResult = 'sent' | 'invalid' | 'retry' | 'blocked';
export type PushData = { eventId:string; recipientId:string; installationId:string; route:string; title:string; body:string; kind:'order'|'update'; createdAt:string; audible:string; companyId?:string };
export function validPushToken(token: unknown): token is string {
  return typeof token==='string' && token.length>=20 && token.length<=4096 && /^[A-Za-z0-9_:\-]+$/.test(token);
}
export function pushDelay(attempt: number) { return Math.min(900000, 10000 * 2 ** Math.max(0,Math.min(7,attempt-1))); }

/** Server-only FCM HTTP v1; no provider credential or device token is logged. */
export class FcmSender {
  private cached?: {token:string; until:number};
  private pending?: Promise<string>;
  constructor(private env:NodeJS.ProcessEnv=process.env, private send:typeof fetch=fetch, private now=Date.now) {}
  configured() { return this.env.FCM_ENABLED==='1' && !!this.env.FCM_SERVICE_ACCOUNT_JSON; }
  private async json(response:Response) {
    if(!response.body)throw Error('PUSH_PROVIDER_RESPONSE');
    const reader=response.body.getReader(); const parts:Uint8Array[]=[];let size=0;
    try { for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>32768){await reader.cancel();throw Error('PUSH_PROVIDER_RESPONSE');}parts.push(chunk.value);} }
    finally { reader.releaseLock(); }
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  }
  private account() {
    const account=JSON.parse(this.env.FCM_SERVICE_ACCOUNT_JSON||'{}');
    if(!/^[a-z][a-z0-9-]{4,62}$/.test(account.project_id||'') || !/^[^@\s]+@[^@\s]+\.gserviceaccount\.com$/.test(account.client_email||'') || typeof account.private_key!=='string')throw Error('PUSH_NOT_CONFIGURED');
    return account;
  }
  private async accessToken() {
    if(this.cached && this.cached.until>this.now())return this.cached.token;
    if(this.pending)return this.pending;
    this.pending=(async()=>{
      const account=this.account(), seconds=Math.floor(this.now()/1000);
      const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
      const unsigned=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:account.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:seconds,exp:seconds+3600});
      const assertion=unsigned+'.'+sign('RSA-SHA256',Buffer.from(unsigned),createPrivateKey(account.private_key)).toString('base64url');
      const response=await this.send('https://oauth2.googleapis.com/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
      if(!response.ok)throw Error('PUSH_AUTH_UNAVAILABLE');
      const result=await this.json(response);
      if(typeof result.access_token!=='string'||!Number.isFinite(result.expires_in))throw Error('PUSH_AUTH_UNAVAILABLE');
      this.cached={token:result.access_token,until:this.now()+Math.max(1,Math.min(3600,result.expires_in)-60)*1000};
      return this.cached.token;
    })();
    try{return await this.pending;}finally{this.pending=undefined;}
  }
  async deliver(token:string,data:PushData):Promise<PushResult> {
    if(!this.configured())return 'blocked';
    if(!validPushToken(token))return 'invalid';
    try {
      const account=this.account(), bearer=await this.accessToken();
      const response=await this.send('https://fcm.googleapis.com/v1/projects/'+account.project_id+'/messages:send',{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{authorization:'Bearer '+bearer,'content-type':'application/json'},
        body:JSON.stringify({message:{token,data,android:{priority:'HIGH',ttl:'1800s',...(data.kind==='order'?{}:{collapse_key:data.route})}}}),
      });
      if(response.ok)return 'sent';
      if(response.status===401){this.cached=undefined;return 'retry';}
      if(response.status===429||response.status>=500)return 'retry';
      const result=await this.json(response);
      if(result.error?.details?.some((detail:any)=>detail.errorCode==='UNREGISTERED'))return 'invalid';
      return 'blocked';
    }catch{return 'retry';}
  }
}
