import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {answerLocalHelp} from './local-assistant';
beforeEach(()=>{vi.stubEnv('MTM_LOCAL_ASSISTANT_ENABLED','1');vi.stubEnv('NODE_ENV','test');vi.stubEnv('PUBLIC_PREVIEW','');});
afterEach(()=>vi.unstubAllEnvs());
describe('local model help isolation',()=>{
  it('answers handover security from reviewed facts without asking the model',async()=>{
    const send=vi.fn();const result=await answerLocalHelp(14,'Where is my pickup handover code?',send);
    expect(send).not.toHaveBeenCalled();expect(result.source).toBe('Verified app help');expect(result.answer).toContain('Staff do not supply the code');
  });
  it('forbids production and public preview before model access',async()=>{
    const send=vi.fn();vi.stubEnv('NODE_ENV','production');await expect(answerLocalHelp(10,'How to order?',send)).rejects.toMatchObject({code:'PRECONDITION_FAILED'});expect(send).not.toHaveBeenCalled();
  });
  it('uses loopback only, no tool or data access, and a fixed app-help prompt',async()=>{
    const send=vi.fn(async()=>new Response(JSON.stringify({message:{content:'Choose your shop, review the quote and select Cash on Pickup.'}})));
    const result=await answerLocalHelp(11,'How to order?',send as typeof fetch);expect(result.answer).toContain('Cash on Pickup');
    expect(send.mock.calls[0][0]).toBe('http://127.0.0.1:11434/api/chat');
    const body=JSON.parse((send.mock.calls[0] as unknown as [string,RequestInit])[1].body as string);expect(body.tools).toBeUndefined();expect(body.messages[0].content).toContain('no database or action tools');
  });
  it('returns a safe unavailable error without raw provider content',async()=>{
    await expect(answerLocalHelp(12,'Help',vi.fn(async()=>new Response('private failure',{status:500})) as typeof fetch)).rejects.toMatchObject({code:'SERVICE_UNAVAILABLE'});
  });
  it('rejects empty and oversized inputs',async()=>{
    for(const question of ['', 'x'.repeat(1201)])await expect(answerLocalHelp(13,question)).rejects.toMatchObject({code:'BAD_REQUEST'});
  });
});
