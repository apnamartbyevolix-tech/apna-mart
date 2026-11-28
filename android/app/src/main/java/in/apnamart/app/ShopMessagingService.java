package in.apnamart.app;

import android.app.PendingIntent;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

public class ShopMessagingService extends FirebaseMessagingService {
    @Override public void onMessageReceived(RemoteMessage message){
        Map<String,String> data=message.getData();SharedPreferences prefs=NativePushPlugin.prefs(this);
        String event=data.get("eventId"),recipient=data.get("recipientId"),installation=data.get("installationId"),route=data.get("route");
        if(event==null||!event.matches("[A-Za-z0-9-]{1,100}")||recipient==null||!recipient.equals(prefs.getString("recipient",""))||
            installation==null||!installation.equals(prefs.getString("installation",""))||!NativePushPlugin.allowedRoute(route))return;
        try{
            java.text.SimpleDateFormat date=new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",java.util.Locale.US);date.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));date.setLenient(false);
            long created=date.parse(data.get("createdAt")).getTime(),age=System.currentTimeMillis()-created;
            if(age>1800000||age< -120000)return;
        }catch(Exception ignored){return;}
        synchronized(ShopMessagingService.class){
            org.json.JSONObject seen;
            try{seen=new org.json.JSONObject(prefs.getString("delivered_v2","{}"));}catch(Exception ignored){seen=new org.json.JSONObject();}
            if(seen.has(event))return;
            long now=System.currentTimeMillis();
            java.util.ArrayList<String> expired=new java.util.ArrayList<>();java.util.Iterator<String> keys=seen.keys();
            while(keys.hasNext()){String key=keys.next();if(now-seen.optLong(key,0)>1800000)expired.add(key);}
            for(String key:expired)seen.remove(key);
            // Refuse an excessive burst rather than erase deduplication history.
            if(seen.length()>=500)return;
            try{seen.put(event,now);}catch(Exception ignored){return;}
            if(!prefs.edit().putString("delivered_v2",seen.toString()).commit())return;
        }
        NativePushPlugin.channels(this);
        boolean order="order".equals(data.get("kind")),sound=prefs.getBoolean("sound",true)&&!"false".equals(data.get("audible"));
        String channel=(order?"shop_orders_v1":"shop_updates_v1")+(sound?"":"_silent");
        Intent intent=new Intent(this,StartupActivity.class).putExtra("shopPushRoute",route).putExtra("shopPushRecipient",recipient).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap=PendingIntent.getActivity(this,event.hashCode(),intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder notification=new NotificationCompat.Builder(this,channel).setSmallIcon(R.drawable.ic_stat_shop).setContentTitle("Apna Mart")
            .setContentText(order?"A new shop order is ready to review.":"Your order has an update. Open the app to check.")
            .setContentIntent(tap).setAutoCancel(true).setOnlyAlertOnce(true).setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPriority(order?NotificationCompat.PRIORITY_HIGH:NotificationCompat.PRIORITY_DEFAULT).setCategory(NotificationCompat.CATEGORY_MESSAGE);
        if(Build.VERSION.SDK_INT<26&&sound)notification.setSound(Uri.parse("android.resource://"+getPackageName()+"/"+(order?R.raw.shop_order:R.raw.shop_update)));
        try{NotificationManagerCompat.from(this).notify(event.hashCode(),notification.build());}catch(SecurityException ignored){}
        NativePushPlugin.received();
    }
    @Override public void onNewToken(String token){NativePushPlugin.received();}
}
