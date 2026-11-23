package com.jxau.pocket;
import android.app.*;
import android.appwidget.*;
import android.content.*;
import android.os.*;
import android.view.View;
import android.widget.*;
import org.json.*;
import java.util.*;
/** Offline schedule only: no network and no notification permission. */
public class AgendaWidgetProvider extends AppWidgetProvider {
 static final String KEY="agenda-widget-snapshot",ACTION="com.jxau.pocket.AGENDA_BOUNDARY",OPEN="com.jxau.pocket.OPEN_SCHEDULE";
 private static final Object LOCK=new Object();
 static Class<?>[] providers(){return new Class<?>[]{AgendaWidgetProvider.class,NextAgendaWidgetProvider.class};}
 static JSONObject data(Context c)throws Exception{JSONObject d=new SecureStore(c).get(KEY);return d==null?new JSONObject().put("known",false).put("events",new JSONArray()):d;}
 public static JSONObject save(Context c,JSONObject body)throws Exception{synchronized(LOCK){JSONObject d=AgendaSnapshot.validate(body);new SecureStore(c).put(KEY,d);refresh(c);ClassModeReceiver.sync(c,d);return new JSONObject().put("ok",true);}}
 public static void clear(Context c){synchronized(LOCK){try{new SecureStore(c).put(KEY,null);refresh(c);ClassModeReceiver.sync(c,new JSONObject());}catch(Exception ignored){}}}
 private static PendingIntent boundary(Context c){return PendingIntent.getBroadcast(c,7381,new Intent(c,AgendaWidgetProvider.class).setAction(ACTION),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
 static void refresh(Context c){synchronized(LOCK){try{JSONObject d=data(c);AppWidgetManager manager=AppWidgetManager.getInstance(c);boolean any=false;for(Class<?> provider:providers()){int[] ids=manager.getAppWidgetIds(new ComponentName(c,provider));for(int id:ids){any=true;update(c,manager,id,provider==NextAgendaWidgetProvider.class,d);}}AlarmManager am=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);am.cancel(boundary(c));if(any)am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,AgendaSnapshot.nextBoundary(d,System.currentTimeMillis()),boundary(c));}catch(Exception ignored){}}}
 @Override public void onReceive(Context context,Intent intent){PendingResult pending=goAsync();Context app=context.getApplicationContext();new Thread(()->{try{if(AppWidgetManager.ACTION_APPWIDGET_DELETED.equals(intent.getAction()))superReceive(context,intent);refresh(app);}finally{pending.finish();}},"agenda-widget").start();}
 private void superReceive(Context c,Intent i){super.onReceive(c,i);}
 static void update(Context c,AppWidgetManager manager,int id,boolean next,JSONObject d)throws Exception{
  Bundle options=manager.getAppWidgetOptions(id);int width=options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,150),height=options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,150);boolean compact=width<210||height<150;
  RemoteViews v=new RemoteViews(c.getPackageName(),next?(compact?R.layout.agenda_widget_compact:R.layout.agenda_widget):(compact?R.layout.agenda_today_compact:R.layout.agenda_today));
  long now=System.currentTimeMillis();String day=AgendaSnapshot.date(now);v.setTextViewText(R.id.agenda_date,day.substring(5).replace('-','/'));
  if(next){
   JSONObject focus=AgendaSnapshot.focus(d,now);boolean current=focus!=null&&AgendaSnapshot.epoch(day,focus.getInt("start"))<=now;
   v.setTextViewText(R.id.agenda_title,current?"正在进行":"下一项安排");
   v.setTextViewText(R.id.agenda_name,focus==null?(AgendaSnapshot.known(d,day)?(AgendaSnapshot.today(d,now).isEmpty()?"今天没有安排":"今日安排已结束"):"打开禾序同步课表"):focus.getString("name"));
   v.setTextViewText(R.id.agenda_room,focus==null?"轻点查看课表":focus.optString("room","").isEmpty()?"地点待定":focus.getString("room"));
   v.setTextViewText(R.id.agenda_time,focus==null?"":AgendaSnapshot.hm(focus.getInt("start"))+"–"+AgendaSnapshot.hm(focus.getInt("end")));
   v.setViewVisibility(R.id.agenda_clock,focus==null?View.GONE:View.VISIBLE);
   if(focus!=null){long at=AgendaSnapshot.epoch(day,focus.getInt(current?"end":"start"));v.setChronometer(R.id.agenda_clock,SystemClock.elapsedRealtime()+Math.max(0,at-now),(current?"剩余 %s":"还有 %s"),true);v.setChronometerCountDown(R.id.agenda_clock,true);}
   if(!compact)v.setViewVisibility(R.id.agenda_more,View.GONE);
  }else{
   List<JSONObject> remaining=AgendaSnapshot.remaining(d,now);v.setTextViewText(R.id.agenda_summary,AgendaSnapshot.overview(d,now));
   int[] names={R.id.agenda_row0,R.id.agenda_row1,R.id.agenda_row2},details={R.id.agenda_meta0,R.id.agenda_meta1,R.id.agenda_meta2};int limit=compact?(height<112?1:2):3;v.setViewVisibility(R.id.agenda_summary,height<125?View.GONE:View.VISIBLE);v.setViewVisibility(R.id.agenda_footer,height<145?View.GONE:View.VISIBLE);
   for(int i=0;i<(compact?2:3);i++){boolean show=i<limit&&i<remaining.size();v.setViewVisibility(names[i],show?View.VISIBLE:View.GONE);v.setViewVisibility(details[i],show?View.VISIBLE:View.GONE);if(show){JSONObject e=remaining.get(i);boolean current=AgendaSnapshot.epoch(day,e.getInt("start"))<=now;v.setTextViewText(names[i],AgendaSnapshot.hm(e.getInt("start"))+"  "+e.getString("name"));v.setTextViewText(details[i],(current?"进行中 · ":"")+e.optString("room","地点待定"));}}
   v.setTextViewText(R.id.agenda_footer,remaining.size()>limit?"还有 "+(remaining.size()-limit)+" 项 · 轻点查看":remaining.isEmpty()?"轻点查看课表":"今日清单 · 轻点查看全部");
  }
  Intent open=new Intent(c,MainActivity.class).setAction(OPEN).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);v.setOnClickPendingIntent(R.id.agenda_surface,PendingIntent.getActivity(c,id,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
  manager.updateAppWidget(id,v);
 }
 static void pin(Activity activity,boolean next){AppWidgetManager manager=AppWidgetManager.getInstance(activity);Class<?> clazz=next?NextAgendaWidgetProvider.class:AgendaWidgetProvider.class;if(Build.VERSION.SDK_INT>=26&&manager.isRequestPinAppWidgetSupported()&&!WaterWidgetProvider.vivoLauncher(activity))try{if(manager.requestPinAppWidget(new ComponentName(activity,clazz),null,null)){Toast.makeText(activity,"请在系统桌面确认添加，未出现时可长按桌面手动添加",Toast.LENGTH_LONG).show();return;}}catch(RuntimeException ignored){}Toast.makeText(activity,"长按桌面空白处 → 小组件 → 禾序 → "+(next?"下一项安排":"今日安排"),Toast.LENGTH_LONG).show();}
}
