import { describe,it,expect,vi } from 'vitest';
import { generateKeyPairSync,verify } from 'node:crypto';
import { FcmSender,pushDelay,validPushToken,type PushData } from './fcm';
const pair=generateKeyPairSync('rsa',{modulusLength:2048});
const env={FCM_ENABLED:'1',FCM_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:'fixture-project',client_email:'sender@fixture-project.iam.gserviceaccount.com',private_key:pair.privateKey.export({format:'pem',type:'pkcs8'})})};
const token='test-device-token-0123456789';
const data:PushData={eventId:'event-1',recipientId:'fixture-owner',installationId:'daebeb18-9a94-4af9-8f41-206b61b83c56',route:'/orders/1',title:'Order update',body:'Open the app',kind:'update',createdAt:'2026-11-28T00:00:00.000Z',audible:'true'};
describe('bounded server-only FCM sender',()=>{
  it('does not contact a provider when disabled or the token is invalid',async()=>{
    const send=vi.fn();
    expect(await new FcmSender({},send).deliver(token,data)).toBe('blocked');
    expect(await new FcmSender(env,send).deliver('invalid!',data)).toBe('invalid');
    expect(send).not.toHaveBeenCalled();
  });
  it('uses a signed, messaging-only OAuth scope and data-only notifications',async()=>{
    const send=vi.fn(async(url:any,options:any)=>{
      if(String(url).includes('oauth2')){
        const assertion=options.body.get('assertion'),[head,body,signature]=assertion.split('.');
        expect(JSON.parse(Buffer.from(body,'base64url').toString()).scope).toBe('https://www.googleapis.com/auth/firebase.messaging');
        expect(verify('RSA-SHA256',Buffer.from(head+'.'+body),pair.publicKey,Buffer.from(signature,'base64url'))).toBe(true);
        return Response.json({access_token:'fixture-access-token',expires_in:3600});
      }
      const request=JSON.parse(options.body);
      expect(request.message.data).toEqual(data);expect(request.message.notification).toBeUndefined();
      expect(options.redirect).toBe('error');expect(options.headers.authorization).toBe('Bearer fixture-access-token');
      return Response.json({name:'fixture-message'});
    });
    const sender=new FcmSender(env,send);
    expect(await sender.deliver(token,data)).toBe('sent');expect(await sender.deliver(token,data)).toBe('sent');
    expect(send.mock.calls.filter(call=>String(call[0]).includes('oauth2'))).toHaveLength(1);
  });
  it.each([[429,'retry'],[503,'retry'],[401,'retry'],[403,'blocked'],[400,'blocked']] as const)('classifies provider status %s without throwing credentials',async(status,expected)=>{
    const send=vi.fn(async(url:any)=>String(url).includes('oauth2')?Response.json({access_token:'fixture',expires_in:3600}):Response.json({error:{status:'ERROR'}},{status}));
    expect(await new FcmSender(env,send).deliver(token,data)).toBe(expected);
  });
  it('only retires a provider-confirmed unregistered device',async()=>{
    const send=vi.fn(async(url:any)=>String(url).includes('oauth2')?Response.json({access_token:'fixture',expires_in:3600}):Response.json({error:{details:[{errorCode:'UNREGISTERED'}]}},{status:404}));
    expect(await new FcmSender(env,send).deliver(token,data)).toBe('invalid');
  });
  it('keeps each incoming order independent instead of collapsing queued alerts',async()=>{
    const send=vi.fn(async(url:any,options:any)=>{
      if(String(url).includes('oauth2'))return Response.json({access_token:'fixture',expires_in:3600});
      expect(JSON.parse(options.body).message.android.collapse_key).toBeUndefined();
      return Response.json({name:'fixture-order'});
    });
    expect(await new FcmSender(env,send).deliver(token,{...data,kind:'order'})).toBe('sent');
  });
  it('bounds provider response bodies and network failures',async()=>{
    expect(await new FcmSender(env,vi.fn(async()=>new Response('x'.repeat(33000)))).deliver(token,data)).toBe('retry');
    expect(await new FcmSender(env,vi.fn(async()=>{throw Error('NETWORK');})).deliver(token,data)).toBe('retry');
    expect(pushDelay(1)).toBe(10000);expect(pushDelay(99)).toBe(900000);
    expect(validPushToken('x'.repeat(4097))).toBe(false);
  });
});
