package com.jxau.pocket;

import android.app.*;
import android.appwidget.AppWidgetManager;
import android.content.*;
import android.os.IBinder;
import org.json.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** A widget tap owns exactly one request. No activity launch, automatic retry or restart. */
public final class WaterWidgetService extends Service {
    static final AtomicBoolean BUSY=new AtomicBoolean();
    private static final String CHANNEL="water-widget-control";
    private static final int NOTIFICATION=798;
    @Override public IBinder onBind(Intent intent){return null;}
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        if(intent==null){stopSelf(startId);return START_NOT_STICKY;}
        if(!BUSY.compareAndSet(false,true))return START_NOT_STICKY;
        try{
            NotificationManager nm=getSystemService(NotificationManager.class);
            if(android.os.Build.VERSION.SDK_INT>=26)nm.createNotificationChannel(new NotificationChannel(CHANNEL,"桌面接水操作",NotificationManager.IMPORTANCE_LOW));
            Notification.Builder builder=android.os.Build.VERSION.SDK_INT>=26?new Notification.Builder(this,CHANNEL):new Notification.Builder(this);
            startForeground(NOTIFICATION,builder.setSmallIcon(R.drawable.ic_water_notification).setContentTitle("正在处理接水请求").setContentText("请稍候，结果会显示在桌面组件").setOngoing(true).build());
        }
        catch(RuntimeException e){BUSY.set(false);WaterWidgetProvider.feedback(this,"无法执行，请检查系统后台限制");stopSelf();return START_NOT_STICKY;}
        final int widget=intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,-1);
        final String action=intent.getAction(),requestedId=intent.getStringExtra("did"),requestedOwner=intent.getStringExtra("owner");
        WaterWidgetProvider.refresh(this);
        new Thread(()->{
            String message;
            String brief="请核对状态";
            try{
                boolean valid=false;for(int id:AppWidgetManager.getInstance(this).getAppWidgetIds(new ComponentName(this,WaterWidgetProvider.class)))if(id==widget)valid=true;
                if(!valid)throw new Exception("组件已移除，请重新添加");
                SecureStore store=new SecureStore(this);WaterDeviceClient client=new WaterDeviceClient(store);
                JSONObject result;
                if(requestedOwner!=null&&!requestedOwner.equals(WaterWidgetProvider.owner(this)))throw new Exception("798账号已变化，请重新选择设备");
                if("end".equals(action)){
                    JSONObject active=store.get("water-device-active");
                    if(active==null||active.length()==0)throw new Exception("当前没有需要结束的接水请求");
                    String activeId=active.keys().next();
                    if(requestedId!=null&&!requestedId.equals(activeId))throw new Exception("接水状态已变化，请重新点击结束");
                    result=client.end(activeId);
                }else if("start".equals(action)){
                    JSONObject device=null;
                    if(requestedId!=null){JSONArray rows=WaterWidgetProvider.devices(this);for(int i=0;i<rows.length();i++)if(requestedId.equals(rows.getJSONObject(i).optString("id")))device=rows.getJSONObject(i);}
                    else device=WaterWidgetProvider.selected(this,widget);
                    if(device==null)throw new Exception("请点右上角选择设备或重新绑定798");
                    result=client.start(device.getString("id"));
                }else throw new Exception("操作无效，请刷新组件");
                if(result.optBoolean("ok")){
                    boolean stopping="end".equals(action);
                    brief=stopping?"已请求停止":"请求已发送";
                    message=stopping?brief:"请求已发送 · 请及时在水机上按接水";
                }else message=result.optString("msg","请求未完成，请核对设备");
            }catch(Exception e){message=e.getMessage()==null?"请求未完成，请核对设备":e.getMessage();}
            final String feedback=message, summary=brief;
            new android.os.Handler(getMainLooper()).post(()->{
                BUSY.set(false);WaterWidgetProvider.feedback(this,feedback,requestedId,summary);
                stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();
            });
        },"water-widget-request").start();
        return START_NOT_STICKY;
    }
}
