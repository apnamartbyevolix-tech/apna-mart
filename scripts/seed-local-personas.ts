import 'dotenv/config';
import {and,eq,isNull} from 'drizzle-orm';
import {getDb} from '../server/db';
import {parseLocalDatabaseConfig} from '../server/marketplace/database-config';
import {SERVER_TEST_PERSONAS} from '../server/routers';
import {riderProfiles,towns,users,vendorProfiles} from '../drizzle/schema';

async function seed(){
 if(process.env.NODE_ENV!=='development'||process.env.MTM_ENABLE_DEV_AUTH!=='1'||process.env.ALLOW_DEV_ADMIN_LOGIN!=='1'||process.env.PUBLIC_PREVIEW)
  throw new Error('Only an explicitly enabled isolated local demo permits persona fixtures.');
 const connection=parseLocalDatabaseConfig(process.env.DATABASE_URL,'development');
 if(!connection.database.endsWith('_test'))throw new Error('Disposable _test database required.');
 const db=await getDb();if(!db)throw new Error('Local database unavailable');
 try{
 for(const profile of Object.values(SERVER_TEST_PERSONAS)){
  await db.insert(users).values({...profile,loginMethod:'standalone-dev-test'}).onDuplicateKeyUpdate({set:{openId:profile.openId}});
 }
 const [vendor]=await db.select().from(users).where(eq(users.openId,SERVER_TEST_PERSONAS.vendor.openId)).limit(1);
 await db.update(vendorProfiles).set({userId:vendor.id}).where(and(eq(vendorProfiles.slug,'demo-sunrise-kirana'),eq(vendorProfiles.isDemo,true),isNull(vendorProfiles.userId)));
 const [rider]=await db.select().from(users).where(eq(users.openId,SERVER_TEST_PERSONAS.rider.openId)).limit(1);
 const [town]=await db.select().from(towns).where(eq(towns.slug,'neemgaon-demo')).limit(1);
 await db.insert(riderProfiles).values({userId:rider.id,townId:town.id,phone:'0000000000',vehicleType:'Fictional demo bicycle',status:'approved',available:true}).onDuplicateKeyUpdate({set:{userId:rider.id}});
 console.log('Four local personas ready; fictional seeded shop assigned to the local merchant. Existing profiles preserved.');
 }finally{await db.$client.end();}
}
seed().catch(()=>{console.error('Local persona fixture setup failed.');process.exitCode=1;});
