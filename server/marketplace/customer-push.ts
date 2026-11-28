import type { Request } from 'express';
import { sql } from 'drizzle-orm';
import { getDb } from '../db';
import { mobileSessionHash } from '../auth/mobile-auth';
import { isReviewDemo } from '../auth/review-demo-context';
import { FcmSender, pushDelay, validPushToken } from './fcm';
import { startOrderWorker } from './work-scheduler';
import { TRPCError } from '@trpc/server';

export async function registerCustomerPush(req:Request,userId:number,body:{installationId:string;token:string;sound:boolean}) {
  if(isReviewDemo())return {enabled:false,reason:'demo'};
  const session=mobileSessionHash(req);
  if(!session||!validPushToken(body.token))throw new TRPCError({code:'BAD_REQUEST',message:'Verify your mobile before enabling notifications.'});
  const db=await getDb();if(!db)throw new TRPCError({code:'SERVICE_UNAVAILABLE'});
  await db.transaction(async tx=>{
    const active=await tx.execute(sql`SELECT token_hash FROM customer_mobile_sessions WHERE token_hash=${session} AND user_id=${userId} AND revoked_at IS NULL AND expires_at>(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') FOR UPDATE`);
    if(!active.rows.length)throw new TRPCError({code:'UNAUTHORIZED'});
    const count=await tx.execute(sql`SELECT d.installation_id FROM customer_push_devices d JOIN customer_mobile_sessions s ON s.token_hash=d.session_hash WHERE s.revoked_at IS NULL AND s.expires_at>(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AND d.user_id=${userId} AND d.enabled AND d.installation_id<>${body.installationId}`);
    if(count.rows.length>=10)throw new TRPCError({code:'BAD_REQUEST',message:'Remove an old notification device first.'});
    await tx.execute(sql`INSERT INTO customer_push_devices(installation_id,user_id,session_hash,token,sound) VALUES(${body.installationId},${userId},${session},${body.token},${body.sound})
      ON CONFLICT(installation_id) DO UPDATE SET user_id=EXCLUDED.user_id,session_hash=EXCLUDED.session_hash,token=EXCLUDED.token,sound=EXCLUDED.sound,enabled=true,
      registered_at=CASE WHEN customer_push_devices.user_id<>EXCLUDED.user_id OR NOT customer_push_devices.enabled THEN (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') ELSE customer_push_devices.registered_at END`);
  });
  return {enabled:true,configured:new FcmSender().configured()};
}
export async function removeCustomerPush(userId:number,installationId:string) {
  const db=await getDb();if(!db)throw new TRPCError({code:'SERVICE_UNAVAILABLE'});
  await db.execute(sql`UPDATE customer_push_devices SET enabled=false WHERE user_id=${userId} AND installation_id=${installationId}`);
  return {enabled:false};
}
export async function startCustomerPushWorker() {
  const sender=new FcmSender();
  if(!sender.configured())return ()=>{};
  // Capture the application database outside request-local fictional reviewer scopes.
  const db=await getDb();if(!db)return ()=>{};
  return startOrderWorker(async()=>{
    await db.execute(sql`INSERT INTO customer_push_deliveries(event_id,installation_id)
      SELECT e.id,d.installation_id FROM customer_push_events e JOIN customer_push_devices d ON d.user_id=e.user_id AND d.enabled AND d.registered_at<=e.created_at
      WHERE e.created_at>(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')-interval '30 minutes' ON CONFLICT DO NOTHING`);
    let count=0;
    for(let index=0;index<8;index++){
      const claimed=await db.execute(sql`WITH candidate AS (
        SELECT event_id,installation_id FROM customer_push_deliveries WHERE NOT done AND attempts<8 AND next_at<=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
          AND (lease_until IS NULL OR lease_until<(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')) ORDER BY next_at LIMIT 1 FOR UPDATE SKIP LOCKED
      ), claimed AS (
        UPDATE customer_push_deliveries p SET attempts=p.attempts+1,lease_until=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')+interval '90 seconds'
        FROM candidate c WHERE p.event_id=c.event_id AND p.installation_id=c.installation_id RETURNING p.*
      ) SELECT p.*,e.order_id,e.created_at AT TIME ZONE 'UTC' AS event_time,d.user_id,d.token,d.sound,
        (d.enabled AND e.created_at>(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')-interval '30 minutes' AND s.revoked_at IS NULL
          AND e.user_id=d.user_id AND s.user_id=d.user_id AND d.registered_at<=e.created_at AND s.expires_at>(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AND s.last_seen_at>(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')-interval '7 day' AND u.role='user') AS eligible
        FROM claimed p JOIN customer_push_events e ON e.id=p.event_id JOIN customer_push_devices d ON d.installation_id=p.installation_id
        JOIN customer_mobile_sessions s ON s.token_hash=d.session_hash JOIN users u ON u.id=d.user_id`);
      const row:any=claimed.rows[0];if(!row)break;count++;
      const result=row.eligible?await sender.deliver(row.token,{eventId:'mart-'+row.event_id,recipientId:String(row.user_id),installationId:row.installation_id,route:'/orders/'+row.order_id,title:'Apna Mart order update',body:'Open Apna Mart to check the latest status of your order.',kind:'update',createdAt:new Date(row.event_time).toISOString(),audible:String(row.sound)}):'invalid';
      if(result==='invalid'&&row.eligible)await db.execute(sql`UPDATE customer_push_devices SET enabled=false WHERE installation_id=${row.installation_id}`);
      if(result==='retry')await db.execute(sql`UPDATE customer_push_deliveries SET lease_until=NULL,next_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')+(${pushDelay(row.attempts)} * interval '1 millisecond'),last_error='PROVIDER_RETRY' WHERE event_id=${row.event_id} AND installation_id=${row.installation_id}`);
      else await db.execute(sql`UPDATE customer_push_deliveries SET lease_until=NULL,done=true,last_error=${result==='sent'?null:result==='blocked'?'PROVIDER_CONFIGURATION':'NOT_ELIGIBLE'} WHERE event_id=${row.event_id} AND installation_id=${row.installation_id}`);
    }
    const due=await db.execute(sql`SELECT min(next_at) AT TIME ZONE 'UTC' AS at FROM customer_push_deliveries WHERE NOT done AND attempts<8 AND next_at>(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')`);
    const at:any=due.rows[0]?.at;
    return {count,nextAt:at?new Date(at).getTime():undefined};
  });
}
