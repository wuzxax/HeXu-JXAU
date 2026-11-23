package com.jxau.pocket;

import android.app.Activity;
import android.app.Dialog;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.*;
import android.widget.*;
import org.json.*;

/** Device selection only. Selecting a page never sends a water command. */
public final class WaterWidgetActionActivity extends Activity {
    private int widget;private SecureStore store;private Dialog sheet;private boolean leaving;
    private static final int GREEN=0xff205a40,INK=0xff233e30,MUTED=0xff738478;
    @Override public void onCreate(Bundle state){super.onCreate(state);
        widget=getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,-1);store=new SecureStore(this);
        if(state!=null){finish();return;}
        try{configure();}catch(Exception e){message("接水暂不可用","请返回接水页面核对账号和设备后重试。");}
    }
    private int dp(float v){return Math.round(v*getResources().getDisplayMetrics().density);}
    private GradientDrawable shape(int color,int radius){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));return d;}
    private TextView text(String value,int size,int color,boolean bold){TextView t=new TextView(this);t.setText(value);t.setTextSize(size);t.setTextColor(color);if(bold)t.setTypeface(Typeface.DEFAULT,Typeface.BOLD);return t;}
    private LinearLayout column(){LinearLayout l=new LinearLayout(this);l.setOrientation(LinearLayout.VERTICAL);return l;}
    private void closeSheet(Runnable after){
        if(leaving)return;leaving=true;
        View card=sheet.findViewById(android.R.id.content);
        Runnable done=()->{sheet.dismiss();if(after!=null)after.run();finish();};
        if(card==null||!ValueAnimatorEnabled()){done.run();return;}
        card.animate().alpha(0).translationY(dp(18)).setDuration(260).withEndAction(done).start();
    }
    private boolean ValueAnimatorEnabled(){return android.os.Build.VERSION.SDK_INT<26||android.animation.ValueAnimator.areAnimatorsEnabled();}
    private void showSheet(String title,String hint,View content){
        if(sheet!=null)sheet.dismiss();leaving=false;
        LinearLayout card=column();card.setPadding(dp(20),dp(18),dp(20),dp(12));card.setBackground(shape(0xfff9fbf7,24));
        TextView heading=text(title,19,INK,true);card.addView(heading);
        TextView subtitle=text(hint,12,MUTED,false);subtitle.setPadding(0,dp(7),0,dp(14));subtitle.setLineSpacing(dp(3),1);card.addView(subtitle);
        card.addView(content);
        TextView cancel=text("取消",14,GREEN,true);cancel.setGravity(Gravity.CENTER);cancel.setMinHeight(dp(46));cancel.setBackground(shape(0xffeaf1e6,14));
        LinearLayout.LayoutParams cp=new LinearLayout.LayoutParams(-1,dp(46));cp.topMargin=dp(12);card.addView(cancel,cp);cancel.setOnClickListener(v->closeSheet(null));
        sheet=new Dialog(this);sheet.requestWindowFeature(Window.FEATURE_NO_TITLE);sheet.setContentView(card);sheet.setCanceledOnTouchOutside(true);sheet.setOnCancelListener(d->finish());
        sheet.setOnKeyListener((d,key,event)->{if(key==KeyEvent.KEYCODE_BACK){if(event.getAction()==KeyEvent.ACTION_UP)closeSheet(null);return true;}return false;});
        Window win=sheet.getWindow();win.setBackgroundDrawableResource(android.R.color.transparent);win.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);win.setDimAmount(.32f);win.setGravity(Gravity.BOTTOM|Gravity.CENTER_HORIZONTAL);
        sheet.show();WindowManager.LayoutParams params=win.getAttributes();params.width=getResources().getDisplayMetrics().widthPixels-dp(28);params.height=-2;params.y=dp(24);win.setAttributes(params);
        if(ValueAnimatorEnabled()){card.setAlpha(0);card.setTranslationY(dp(20));card.animate().alpha(1).translationY(0).setDuration(400).setInterpolator(new android.view.animation.PathInterpolator(.3f,0,.2f,1)).start();}
    }
    private void configure()throws Exception{
        JSONObject session=store.get("life798"),registry=store.get("water-device-registry");
        if(session==null||session.optString("token").isEmpty()){message("请先绑定798","在禾序的接水页面连接本人798账号，再保存设备。");return;}
        String owner=WaterDeviceRegistry.account(session);JSONArray rows=registry==null?new JSONArray():WaterDeviceRegistry.display(WaterDeviceRegistry.profile(registry,owner));
        if(rows.length()==0){message("还没有设备","请先在接水页面扫码或手动添加设备，再配置小组件。");return;}
        LinearLayout list=column();
        for(int i=0;i<rows.length();i++){
            JSONObject row=rows.getJSONObject(i);String did=row.getString("id");
            LinearLayout item=column();item.setPadding(dp(14),dp(12),dp(14),dp(12));item.setBackground(new android.graphics.drawable.RippleDrawable(android.content.res.ColorStateList.valueOf(0x18205a40),shape(0xffedf3e9,14),shape(0xffffffff,14)));
            TextView name=text(row.optString("name","饮水机"),14,INK,true);item.addView(name);
            TextView number=text("设备号 "+did,11,MUTED,false);number.setPadding(0,dp(5),0,0);item.addView(number);
            item.setFocusable(true);item.setClickable(true);item.setContentDescription(row.optString("name")+"，设备号"+did+"，切换到此设备");
            LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.bottomMargin=dp(8);list.addView(item,lp);
            item.setOnClickListener(v->{try{
                if(!owner.equals(WaterDeviceRegistry.account(store.get("life798"))))throw new Exception();
                if(!getSharedPreferences("water-widgets",0).edit().putString("device-"+widget,did).putString("owner-"+widget,owner).putBoolean("jump-"+widget,true).commit())throw new Exception();
                WaterWidgetProvider.refresh(this);closeSheet(null);
            }catch(Exception e){message("选择未完成","账号或设备信息已变化，请返回禾序核对后重试。");}});
        }
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(false);scroll.addView(list);list.measure(View.MeasureSpec.makeMeasureSpec(Math.max(dp(120),getResources().getDisplayMetrics().widthPixels-dp(68)),View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(0,View.MeasureSpec.UNSPECIFIED));scroll.setLayoutParams(new LinearLayout.LayoutParams(-1,Math.min(list.getMeasuredHeight(),getResources().getDisplayMetrics().heightPixels/2)));
        showSheet("选择接水设备","切换桌面卡片显示的设备，不会启动接水。",scroll);
    }
    private void message(String title,String note){
        TextView open=text("打开接水页 ›",14,GREEN,true);open.setPadding(0,dp(10),0,dp(10));open.setOnClickListener(v->closeSheet(this::openApp));showSheet(title,note,open);
    }
    private void openApp(){startActivity(new Intent(this,MainActivity.class).setAction("com.jxau.pocket.OPEN_WATER").addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP));}
}
