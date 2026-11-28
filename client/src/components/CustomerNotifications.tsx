import { useEffect,useRef,useState } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { nativePushSupported,shopPush,pushPreferences,setPushPreferences,pushInstallationId,previewPushTone } from '@/lib/nativePush';
import { Dialog,DialogContent,DialogTitle,DialogDescription } from './ui/dialog';
import { Button } from './ui/button';

export function MartPushBridge({user,loading}:{user:{id:number;loginMethod:string|null}|null;loading:boolean}) {
  const utils=trpc.useUtils(),[,navigate]=useLocation(),[open,setOpen]=useState(false),[message,setMessage]=useState('');
  const navigation=useRef(navigate);navigation.current=navigate;
  useEffect(()=>{
    if(!nativePushSupported()||loading)return;
    let alive=true,busy=false,again=false;
    const tap=async()=>{
      const value=await shopPush.consumeTap();if(!alive||!value.route||!/^\/orders\/[1-9][0-9]{0,15}$/.test(value.route))return;
      if(user&&value.recipientId===String(user.id))navigation.current(value.route);
      else if(!user)navigation.current('/login?returnTo='+encodeURIComponent(value.route));
    };
    if(!user){void tap().finally(()=>{if(alive)void shopPush.clear();});return()=>{alive=false;};}
    async function register() {
      if(!alive)return;if(busy){again=true;return;}busy=true;
      try{
        const preferences=pushPreferences(String(user!.id)),installationId=pushInstallationId();
        if(!preferences.enabled){
          try{await utils.client.marketplace.removePush.mutate({installationId});}finally{await shopPush.clear();}
          return;
        }
        const status=await shopPush.status();if(!alive)return;
        if(status.permission!=='granted'){
          let reminded=false;try{reminded=localStorage.getItem('mart-push-reminded:'+user!.id)==='1';}catch{}
          if(!reminded&&user!.loginMethod==='phone-otp'){setOpen(true);try{localStorage.setItem('mart-push-reminded:'+user!.id,'1');}catch{}}
          return;
        }
        if(!status.configured){setMessage('Order notifications are not configured for this build.');return;}
        const device=await shopPush.register({recipientId:String(user!.id),installationId,sound:preferences.sound});if(!alive)return;
        const result=await utils.client.marketplace.registerPush.mutate({installationId,token:device.token,sound:preferences.sound});
        if(alive)setMessage(result.enabled&&result.configured?'Order notifications are connected.':result.reason==='demo'?'Demo access does not send real notifications.':'The notification service is awaiting configuration.');
      }catch{if(alive)setMessage('Notifications could not connect. You can retry from Account.');}
      finally{busy=false;if(again&&alive){again=false;void register();}}
    }
    const change=()=>void register(),received=()=>{void utils.marketplace.myOrders.invalidate();void utils.marketplace.orderDetail.invalidate();void register();};
    const listeners=[shopPush.addListener('received',received),shopPush.addListener('opened',()=>void tap())];
    window.addEventListener('shop-push-settings',change);const visible=()=>{if(!document.hidden)void register();};document.addEventListener('visibilitychange',visible);
    void tap();void register();
    return()=>{alive=false;void shopPush.clear();window.removeEventListener('shop-push-settings',change);document.removeEventListener('visibilitychange',visible);listeners.forEach(p=>void p.then(handle=>handle.remove()));};
  },[user?.id,loading]);
  if(!nativePushSupported()||!user)return null;
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>Keep up with your order</DialogTitle><DialogDescription>Allow Android notifications for order acceptance, preparation and delivery updates. Shopping also works without them.</DialogDescription><Button onClick={async()=>{try{await shopPush.request();window.dispatchEvent(new Event('shop-push-settings'));setOpen(false);}catch{setMessage('Open Android notification settings to allow alerts.');}}}>Enable order updates</Button><Button variant="outline" onClick={()=>setOpen(false)}>Later</Button>{message&&<p role="status">{message}</p>}</DialogContent></Dialog>;
}
export function CustomerPushSettings({userId}:{userId:number}) {
  const [revision,setRevision]=useState(0),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  if(!nativePushSupported())return null;const preferences=pushPreferences(String(userId));
  return <section className="workspace-panel"><h2>Order notifications</h2><p>Get a short chime when your order has an update.</p>
    <label className="field-label"><span><input type="checkbox" checked={preferences.enabled} disabled={busy} onChange={async event=>{const enabled=event.target.checked;setBusy(true);try{if(enabled)await shopPush.request();setPushPreferences(String(userId),{...preferences,enabled});setRevision(revision+1);}catch{setMessage('Allow notifications in Android Settings.');}finally{setBusy(false);}}}/>Enable order updates</span></label>
    <label className="field-label"><span><input type="checkbox" checked={preferences.sound} onChange={event=>{setPushPreferences(String(userId),{...preferences,sound:event.target.checked});setRevision(revision+1);}}/>Notification sound</span></label>
    <Button variant="outline" onClick={()=>void previewPushTone('update').catch(()=>setMessage('Sound preview is unavailable.'))}>Preview order-update chime</Button>
    <Button variant="outline" onClick={()=>void shopPush.settings()}>Android notification settings</Button>
    <Button variant="outline" onClick={()=>{window.dispatchEvent(new Event('shop-push-settings'));setMessage('Retry requested.');}}>Retry connection</Button>
    {message&&<p role="status">{message}</p>}
  </section>;
}
