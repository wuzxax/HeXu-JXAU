package com.jxau.pocket;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;
import android.widget.Toast;

/** Android adapter: fixed intents, official packages, no account data read or stored. */
final class ParcelLauncher {
    static void open(final Activity activity, String key) {
        ParcelTargets.open(key,new ParcelTargets.Dispatcher(){
            public boolean uri(String url,String app){
                Intent intent=new Intent(Intent.ACTION_VIEW,Uri.parse(url));
                if(app!=null)intent.setPackage(app);
                return launch(activity,intent);
            }
            public boolean home(String app){
                try { Intent intent=activity.getPackageManager().getLaunchIntentForPackage(app);
                    return intent!=null&&launch(activity,intent);
                } catch(RuntimeException e){return false;}
            }
            public void message(String text){Toast.makeText(activity,text,Toast.LENGTH_LONG).show();}
        });
    }
    private static boolean launch(Activity activity,Intent intent){
        try { activity.startActivity(intent);return true; }
        catch(android.content.ActivityNotFoundException|SecurityException|IllegalArgumentException e){return false;}
    }
    static void pin(Activity activity,String key){
        ParcelTargets target=ParcelTargets.get(key);
        if(target==null)return;
        if(Build.VERSION.SDK_INT<26){message(activity,"Android 8.0 及以上支持添加桌面快捷方式");return;}
        try {
            ShortcutManager manager=activity.getSystemService(ShortcutManager.class);
            if(manager==null||!manager.isRequestPinShortcutSupported()){
                message(activity,"当前桌面不支持添加快捷方式");return;
            }
            Intent intent=new Intent(activity,ParcelShortcutActivity.class)
                    .setAction("com.jxau.pocket.PARCEL").putExtra("destination",key);
            ShortcutInfo shortcut=new ShortcutInfo.Builder(activity,"parcel_"+key)
                    .setShortLabel(target.title).setLongLabel("打开"+target.title)
                    .setIcon(Icon.createWithResource(activity,com.jxau.pocket.R.mipmap.ic_launcher))
                    .setIntent(intent).build();
            boolean accepted=manager.requestPinShortcut(shortcut,null);
            message(activity,accepted?"已提交桌面添加请求，请查看系统提示":"桌面未接受添加请求，请稍后重试");
        } catch(RuntimeException e){message(activity,"暂时无法添加，请检查桌面的快捷方式设置");}
    }
    private static void message(Activity a,String s){Toast.makeText(a,s,Toast.LENGTH_LONG).show();}
}
