import {createHmac,randomUUID} from 'node:crypto';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {DisabledApnaGallaAdapter,getApnaGallaAdapter,mayPubliclyList} from './adapter';
import {HttpApnaGallaAdapter,SignedSandboxTransport,type WireRequest} from './transport';
const config={baseUrl:'https://sandbox.example.invalid',allowedSandboxHosts:['sandbox.example.invalid'],apiKey:'synthetic-unit-key',signingSecret:'synthetic-unit-secret',encodeSignature:(b:Buffer)=>b.toString('hex')};
afterEach(()=>vi.unstubAllEnvs());
describe('Apna Galla release and eligibility boundary',()=>{
  it('environment flags alone cannot enable an unapproved connector',async()=>{
    vi.stubEnv('APNA_GALLA_API_KEY','fake-key');expect(getApnaGallaAdapter()).toBeInstanceOf(DisabledApnaGallaAdapter);
    await expect(getApnaGallaAdapter().verifyMerchant('merchant')).rejects.toThrow('approved wire contract');
  });
  const valid={source:'verified' as const,isValid:true,marketplaceEnabled:true,tier:'approved-tier',expiresAt:new Date('2030-01-01')};
  it('requires all explicit verification signals',()=>{
    expect(mayPubliclyList(valid,new Date('2026-11-05'))).toBe(true);
    for(const snapshot of [undefined,{...valid,source:'local-mock' as const},{...valid,isValid:false},{...valid,marketplaceEnabled:undefined},{...valid,expiresAt:new Date('invalid')},{...valid,expiresAt:new Date('2020-01-01')},{...valid,tier:''}])expect(mayPubliclyList(snapshot)).toBe(false);
  });
});
describe('signed sandbox transport',()=>{
  it('rejects HTTP, unknown hosts and embedded credentials before transmission',()=>{
    for(const baseUrl of ['http://sandbox.example.invalid','https://api.apnagalla.in','https://user:secret@sandbox.example.invalid'])expect(()=>new SignedSandboxTransport({...config,baseUrl})).toThrow('approved HTTPS sandbox');
  });
  it('retains the same key/body on transient retries and signs exact bytes',async()=>{
    const calls:WireRequest[]=[];const send=vi.fn(async(input:WireRequest)=>{calls.push(input);return calls.length===1?{status:503,body:'private upstream body'}:{status:200,body:'{"ok":true}'};});
    const sleep=vi.fn(async()=>{}),key=randomUUID();
    const transport=new SignedSandboxTransport(config,send,sleep);
    await expect(transport.post('reserveStock',{synthetic:'wire-fixture'},key)).resolves.toEqual({ok:true});
    expect(calls).toHaveLength(2);expect(sleep).toHaveBeenCalledOnce();
    for(const request of calls){expect(request.headers['Idempotency-Key']).toBe(key);expect(request.body).toBe(calls[0].body);expect(request.headers['X-Apna-Galla-Signature']).toBe(createHmac('sha256',config.signingSecret).update(request.headers['X-Apna-Galla-Timestamp']+'.'+request.body).digest('hex'));}
  });
  it('never retries authentication failure or follows a redirect',async()=>{
    for(const status of [401,403,302,409]){const send=vi.fn(async()=>({status,body:'secret not for users'}));await expect(new SignedSandboxTransport(config,send).post('commitStock',{},randomUUID())).rejects.toMatchObject({code:'REJECTED'});expect(send).toHaveBeenCalledOnce();}
  });
  it('bounds unavailable calls and reports ambiguity without leaking bodies',async()=>{
    const send=vi.fn(async()=>{throw new Error('private upstream URL/key');});
    await expect(new SignedSandboxTransport(config,send,async()=>{}).post('releaseStock',{},randomUUID())).rejects.toMatchObject({code:'UNAVAILABLE',ambiguous:true});expect(send).toHaveBeenCalledTimes(5);
  });
  it('rejects malformed response and invalid keys',async()=>{
    const send=vi.fn(async()=>({status:200,body:'not-json'}));
    const transport=new SignedSandboxTransport(config,send);
    await expect(transport.post('verifyMerchant',{},randomUUID())).rejects.toMatchObject({code:'INVALID_RESPONSE'});
    await expect(transport.post('postSale',{},'duplicate')).rejects.toThrow('UUIDv4');expect(send).toHaveBeenCalledOnce();
  });
  it('uses only an explicitly supplied wire codec, never guesses response fields',async()=>{
    const send=vi.fn(async()=>({status:200,body:'{"synthetic_valid":false}'}));
    const codec={revision:'synthetic-test-only',encode:vi.fn(()=>({fixture:'not-real-schema'})),decode:vi.fn(()=>({isValid:false,tier:'',expiresAt:new Date(0)}))};
    const adapter=new HttpApnaGallaAdapter(new SignedSandboxTransport(config,send),codec,()=>randomUUID());
    expect((await adapter.verifyMerchant('synthetic-merchant')).isValid).toBe(false);expect(codec.encode).toHaveBeenCalledWith('verifyMerchant',['synthetic-merchant']);
  });
});
