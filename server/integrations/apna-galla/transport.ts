import { createHmac } from 'node:crypto';
import {connectionHeaders} from './link-auth';
import { request } from 'node:https';
import { setTimeout as delay } from 'node:timers/promises';
import { APNA_ROUTES, type IApnaGallaAdapter, type Operation } from './adapter';

export type WireRequest = { url: URL; body: string; headers: Record<string, string>; timeoutMs: number };
type WireResponse = { status: number; body: string };
export class ApnaTransportError extends Error {
  constructor(public readonly code: 'UNAVAILABLE' | 'REJECTED' | 'INVALID_RESPONSE', public readonly ambiguous: boolean) {
    super('Apna Galla request could not be confirmed. Keep its idempotency key for reconciliation.');
  }
}

/** No redirects, TLS 1.3 only, bounded response, no logging of provider bodies/keys. */
export function sendHttps(input: WireRequest): Promise<WireResponse> {
  return new Promise((resolve, reject) => {
    const req = request(input.url, { method: 'POST', headers: input.headers, minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3' }, res => {
      const chunks: Buffer[] = []; let bytes = 0;
      res.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 65536) { res.destroy(); req.destroy(new Error('Response limit')); return; }
        chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => resolve({status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8')}));
    });
    const timer = setTimeout(() => req.destroy(new Error('Deadline exceeded')), input.timeoutMs);
    req.on('close', () => clearTimeout(timer)); req.on('error', reject); req.end(input.body);
  });
}

export class SignedSandboxTransport {
  private readonly base: URL;
  constructor(private readonly config: {
    baseUrl: string; allowedSandboxHosts: readonly string[]; apiKey: string; signingSecret: string;
    // Encoding (hex/base64/prefix) is intentionally supplied by an approved codec.
    encodeSignature: (digest: Buffer) => string;
  }, private readonly send = sendHttps, private readonly sleep = (ms: number) => delay(ms)) {
    this.base = new URL(config.baseUrl);
    if (this.base.protocol !== 'https:' || this.base.username || this.base.password || this.base.search || this.base.hash ||
        !config.allowedSandboxHosts.includes(this.base.hostname) || !config.apiKey || !config.signingSecret)
      throw new Error('An explicitly approved HTTPS sandbox and server credentials are required.');
  }
  async post(operation: Operation, payload: unknown, idempotencyKey: string,
    options: { maxAttempts?: number; timeoutMs?: number } = {}): Promise<unknown> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey))
      throw new Error('Persist a UUIDv4 idempotency key before dispatch.');
    const body = JSON.stringify(payload);
    if (!body || Buffer.byteLength(body) > 65536) throw new Error('Invalid request size.');
    const maxAttempts = options.maxAttempts ?? 5;
    const timeoutMs = options.timeoutMs ?? 4000;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5 ||
        !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 4000)
      throw new Error('Invalid request retry policy.');
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = this.config.encodeSignature(createHmac('sha256', this.config.signingSecret).update(timestamp+'.'+body).digest());
      let response: WireResponse;
      try {
        response = await this.send({url: new URL(APNA_ROUTES[operation], this.base), body, timeoutMs, headers:{
          'Content-Type':'application/json', 'Content-Length':String(Buffer.byteLength(body)),
          'X-Apna-Galla-Key':this.config.apiKey, 'X-Apna-Galla-Signature':signature,
          'X-Apna-Galla-Timestamp':timestamp, 'Idempotency-Key':idempotencyKey,
          ...connectionHeaders('mytown','POST',APNA_ROUTES[operation],Buffer.from(body),idempotencyKey),
        }});
      } catch {
        if (attempt === maxAttempts - 1) throw new ApnaTransportError('UNAVAILABLE', true);
        await this.sleep(Math.min(60000, 2**(attempt+1)*1000+Math.floor(Math.random()*250))); continue;
      }
      if (response.status >= 200 && response.status < 300) {
        try { return JSON.parse(response.body); } catch { throw new ApnaTransportError('INVALID_RESPONSE', true); }
      }
      if (response.status === 429 || response.status >= 500) {
        if (attempt === maxAttempts - 1) throw new ApnaTransportError('UNAVAILABLE', true);
        await this.sleep(Math.min(60000,2**(attempt+1)*1000+Math.floor(Math.random()*250))); continue;
      }
      throw new ApnaTransportError('REJECTED', response.status === 409);
    }
    throw new ApnaTransportError('UNAVAILABLE', true);
  }
}

/** Supply only after Apna Galla approves every encoder/decoder. No guessed JSON. */
export interface ApprovedWireContract {
  revision: string;
  encode(operation: Operation, arguments_: readonly unknown[]): unknown;
  decode<T>(operation: Operation, response: unknown): T;
}
export class HttpApnaGallaAdapter implements IApnaGallaAdapter {
  constructor(private readonly transport: SignedSandboxTransport, private readonly wire: ApprovedWireContract,
    private readonly persistedKeyFor: (operation: Operation, args: readonly unknown[]) => string) {
    if (!wire.revision.trim()) throw new Error('Approved contract revision required.');
  }
  private async call<T>(op: Operation, args: readonly unknown[], key: string): Promise<T> {
    return this.wire.decode<T>(op,await this.transport.post(op,this.wire.encode(op,args),key));
  }
  verifyMerchant(id: string) {return this.call<Awaited<ReturnType<IApnaGallaAdapter['verifyMerchant']>>>('verifyMerchant',[id],this.persistedKeyFor('verifyMerchant',[id]));}
  // Durable outbox callers use dispatch with their persisted key, never a new key on retry.
  dispatch<T>(operation: Operation, args: readonly unknown[], persistedKey: string) {return this.call<T>(operation,args,persistedKey);}
  reserveStock(input: Parameters<IApnaGallaAdapter['reserveStock']>[0]) {return this.call<Awaited<ReturnType<IApnaGallaAdapter['reserveStock']>>>('reserveStock',[input],this.persistedKeyFor('reserveStock',[input]));}
  commitStock(id: string, order: string) {return this.call<{success:boolean}>('commitStock',[id,order],this.persistedKeyFor('commitStock',[id,order]));}
  releaseStock(id: string, reason: string) {return this.call<void>('releaseStock',[id,reason],this.persistedKeyFor('releaseStock',[id,reason]));}
  postSale(order: unknown) {return this.call<Awaited<ReturnType<IApnaGallaAdapter['postSale']>>>('postSale',[order],this.persistedKeyFor('postSale',[order]));}
}
