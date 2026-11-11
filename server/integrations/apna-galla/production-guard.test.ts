import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertSandbox, protocolRevision } from './sandbox';
const own=generateKeyPairSync('ed25519'), peer=generateKeyPairSync('ed25519');
function configure(){
  const env={NODE_ENV:'production',MTM_APNA_CONNECTOR_MODE:'production',MTM_APNA_SANDBOX_ENABLED:'0',DATABASE_URL:'postgresql://owner:fictional@db.example.invalid/apna_mart',APNA_SANDBOX_URL:'https://api.apnagalla.in/',APNA_SANDBOX_KEY:'k'.repeat(64),APNA_SANDBOX_SECRET:'s'.repeat(64),MYTOWN_LINK_AUTH:'ed25519-v1',MYTOWN_LINK_SELF:'mytown',MYTOWN_LINK_KEY_ID:'mytown-test-key',MYTOWN_LINK_PRIVATE_KEY_B64:own.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),MYTOWN_LINK_PEER_KEYS_JSON:JSON.stringify([{id:'apna-test-key',peer:'apna',publicKey:peer.publicKey.export({format:'der',type:'spki'}).toString('base64')}])};
  for(const [k,v] of Object.entries(env))vi.stubEnv(k,v);
}
afterEach(()=>vi.unstubAllEnvs());
describe('production connector boundary',()=>{
  it('requires the approved HTTPS peer and pinned identities',()=>{configure();expect(()=>assertSandbox()).not.toThrow();expect(protocolRevision()).toBe('1.2');});
  it.each([
    ['NODE_ENV','test'],['MTM_APNA_SANDBOX_ENABLED','1'],['APNA_SANDBOX_URL','https://localhost/'],['APNA_SANDBOX_URL','http://api.apnagalla.in/'],['APNA_SANDBOX_URL','https://api.apnagalla.in/other'],['APNA_SANDBOX_URL','https://api.apnagalla.in/?redirect=1'],['DATABASE_URL','postgresql://localhost/production'],['MYTOWN_LINK_AUTH',''],['MYTOWN_LINK_SELF','apna'],['MYTOWN_LINK_PEER_KEYS_JSON','[]'],['APNA_SANDBOX_KEY','short'],['APNA_SANDBOX_SECRET','short'],
  ])('rejects unsafe production setting %s', (key,value)=>{configure();vi.stubEnv(key,value);expect(()=>assertSandbox()).toThrow();});
});
