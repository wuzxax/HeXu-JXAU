package com.jxau.pocket;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.net.Uri;
import android.widget.Toast;

final class PaymentLauncher {
    static void handle(final Activity activity,String action,String key){
        String web=PaymentTargets.web(key);
        if(web==null&&!"aircon".equals(key))return;
        if("copy".equals(action)){
            if(web==null)return;
            try {
                ClipboardManager clipboard=activity.getSystemService(ClipboardManager.class);
                if(clipboard==null)throw new IllegalStateException();
                clipboard.setPrimaryClip(ClipData.newPlainText("lighting".equals(key)?"完美校园照明缴费链接":"慧生活798支付宝分享链接",web));
                message(activity,"链接已复制");
            }catch(RuntimeException e){message(activity,"复制失败，请稍后重试");}
            return;
        }
        if(!"open".equals(action)&&!"share".equals(action))return;
        PaymentTargets.open(key,"share".equals(action),new PaymentTargets.Dispatcher(){
            public boolean home(String app){
                try{Intent intent=activity.getPackageManager().getLaunchIntentForPackage(app);
                    if(intent==null)return false;activity.startActivity(intent);return true;
                }catch(RuntimeException e){return false;}
            }
            public boolean uri(String url,String app){
                Intent intent=new Intent(Intent.ACTION_VIEW,Uri.parse(url));
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                if(app!=null)intent.setPackage(app);
                try{activity.startActivity(intent);return true;}
                catch(android.content.ActivityNotFoundException|SecurityException|IllegalArgumentException e){return false;}
            }
            public void message(String text){PaymentLauncher.message(activity,text);}
        });
    }
    private static void message(Activity activity,String text){Toast.makeText(activity,text,Toast.LENGTH_LONG).show();}
}
