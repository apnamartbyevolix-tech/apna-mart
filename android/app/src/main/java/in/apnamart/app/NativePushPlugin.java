package in.apnamart.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import java.lang.ref.WeakReference;

@CapacitorPlugin(name="ShopPush",permissions={@Permission(alias="notifications",strings={"android.permission.POST_NOTIFICATIONS"})})
public class NativePushPlugin extends Plugin {
    static WeakReference<NativePushPlugin> active=new WeakReference<>(null);
    private MediaPlayer preview;
    static SharedPreferences prefs(Context context){return context.getSharedPreferences("shop_push",Context.MODE_PRIVATE);}
    static boolean allowedRoute(String route){return route!=null && route.matches("/orders/[1-9][0-9]{0,15}");}
    @Override public void load(){active=new WeakReference<>(this);channels(getContext());}
    static void channels(Context context){
        if(Build.VERSION.SDK_INT<26)return;
        NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        AudioAttributes attributes=new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build();
        for(String kind:new String[]{"order","update"}){
            String id=kind.equals("order")?"shop_orders_v1":"shop_updates_v1";
            NotificationChannel channel=new NotificationChannel(id,kind.equals("order")?"New shop orders":"Order and shop updates",kind.equals("order")?NotificationManager.IMPORTANCE_HIGH:NotificationManager.IMPORTANCE_DEFAULT);
            int resource=kind.equals("order")?R.raw.shop_order:R.raw.shop_update;
            channel.setSound(Uri.parse("android.resource://"+context.getPackageName()+"/"+resource),attributes);
            channel.setDescription(kind.equals("order")?"A three-second alert for each new shop order":"Short updates from your app");
            manager.createNotificationChannel(channel);
            NotificationChannel silent=new NotificationChannel(id+"_silent","Silent "+channel.getName(),NotificationManager.IMPORTANCE_LOW);
            silent.setSound(null,null);manager.createNotificationChannel(silent);
        }
    }
    private boolean configured(){try{return FirebaseApp.initializeApp(getContext())!=null;}catch(Exception ignored){return false;}}
    @PluginMethod public void status(PluginCall call){
        JSObject result=new JSObject();result.put("configured",configured());
        result.put("permission",NotificationManagerCompat.from(getContext()).areNotificationsEnabled() && (Build.VERSION.SDK_INT<33||getPermissionState("notifications")==PermissionState.GRANTED)?"granted":Build.VERSION.SDK_INT>=33&&getPermissionState("notifications")!=PermissionState.GRANTED?getPermissionState("notifications").toString():"denied");
        result.put("bound",prefs(getContext()).contains("recipient"));call.resolve(result);
    }
    @PluginMethod public void request(PluginCall call){
        if(Build.VERSION.SDK_INT<33||getPermissionState("notifications")==PermissionState.GRANTED){status(call);return;}
        requestPermissionForAlias("notifications",call,"permissionResult");
    }
    @PermissionCallback private void permissionResult(PluginCall call){status(call);}
    @PluginMethod public void register(PluginCall call){
        String recipient=call.getString("recipientId",""),installation=call.getString("installationId","");
        if(!recipient.matches("[A-Za-z0-9-]{1,80}")||!installation.matches("[a-fA-F0-9-]{36}")){call.reject("Invalid notification identity.");return;}
        if(!NotificationManagerCompat.from(getContext()).areNotificationsEnabled()||Build.VERSION.SDK_INT>=33&&getPermissionState("notifications")!=PermissionState.GRANTED){call.reject("Allow notifications in Android Settings first.","PERMISSION_REQUIRED");return;}
        if(!configured()){call.reject("Notifications are not configured for this build.","NOT_CONFIGURED");return;}
        SharedPreferences prefs=prefs(getContext());int generation=prefs.getInt("generation",0)+1;prefs.edit().putInt("generation",generation).apply();
        FirebaseMessaging messaging=FirebaseMessaging.getInstance();messaging.setAutoInitEnabled(true);
        messaging.getToken().addOnCompleteListener(task->{
            if(!task.isSuccessful()||prefs.getInt("generation",0)!=generation){call.reject("Could not register notifications. Please retry.","PUSH_UNAVAILABLE");return;}
            prefs.edit().putString("recipient",recipient).putString("installation",installation).putBoolean("sound",call.getBoolean("sound",true)).apply();
            JSObject result=new JSObject();result.put("token",task.getResult());call.resolve(result);
        });
    }
    static void clearBinding(Context context){
        SharedPreferences prefs=prefs(context);int generation=prefs.getInt("generation",0)+1;
        prefs.edit().remove("recipient").remove("installation").remove("route").remove("routeRecipient").putInt("generation",generation).apply();
        NotificationManagerCompat.from(context).cancelAll();
    }
    @PluginMethod public void clear(PluginCall call){clearBinding(getContext());call.resolve();}
    @PluginMethod public void preview(PluginCall call){
        getActivity().runOnUiThread(()->{
            if(preview!=null)preview.release();
            preview=MediaPlayer.create(getContext(),"order".equals(call.getString("kind"))?R.raw.shop_order:R.raw.shop_update);
            if(preview!=null){preview.setOnCompletionListener(player->{player.release();if(preview==player)preview=null;});preview.start();}
            call.resolve();
        });
    }
    @PluginMethod public void settings(PluginCall call){
        getActivity().startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,getContext().getPackageName()));call.resolve();
    }
    @PluginMethod public void consumeTap(PluginCall call){
        capture(getActivity().getIntent());
        SharedPreferences prefs=prefs(getContext());String route=prefs.getString("route",null),recipient=prefs.getString("routeRecipient",null);
        JSObject result=new JSObject();
        if(allowedRoute(route)&&recipient!=null&&recipient.equals(prefs.getString("recipient",""))){result.put("route",route);result.put("recipientId",recipient);}
        prefs.edit().remove("route").remove("routeRecipient").apply();call.resolve(result);
    }
    private void capture(Intent intent){
        if(intent==null)return;String route=intent.getStringExtra("shopPushRoute"),recipient=intent.getStringExtra("shopPushRecipient");
        if(allowedRoute(route)&&recipient!=null)prefs(getContext()).edit().putString("route",route).putString("routeRecipient",recipient).apply();
        intent.removeExtra("shopPushRoute");intent.removeExtra("shopPushRecipient");
    }
    @Override protected void handleOnNewIntent(Intent intent){capture(intent);notifyListeners("opened",new JSObject());}
    static void received(){NativePushPlugin plugin=active.get();if(plugin!=null)plugin.notifyListeners("received",new JSObject());}
    @Override protected void handleOnDestroy(){if(preview!=null){preview.release();preview=null;}active.clear();}
}
