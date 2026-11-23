package com.jxau.pocket;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.SizeF;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import org.json.*;

/** Local device selection and direct desktop controls. */
public final class WaterWidgetProvider extends AppWidgetProvider {
    private static final String PINNED="com.jxau.pocket.WATER_WIDGET_PINNED";
    private static final String REFRESH="com.jxau.pocket.WATER_WIDGET_REFRESH";
    private static final long FEEDBACK_DURATION = 4_500;
    private static final long RESIZE_SETTLE = 280;
    private static final Handler updates = new Handler(Looper.getMainLooper());
    private static final Map<Integer,Runnable> pendingUpdates = new HashMap<>();
    private static final Map<Integer,Long> lastResize = new HashMap<>();
    private static final Map<Integer,WidgetPresentation> presentations = new HashMap<>();
    private static Runnable feedbackExpiry;
    private static final int[] CARD_BACKGROUNDS = {
        R.drawable.widget_background, R.drawable.widget_background_blue, R.drawable.widget_background_slate
    };

    private static final class WidgetSize {
        final int width, height;
        WidgetSize(int width, int height) {
            this.width = width;
            this.height = height;
        }
    }
    private static final class WidgetPresentation {
        final String signature;
        final boolean stacked;
        final WidgetSize size;
        final int stackLayout;
        WidgetPresentation(String signature, boolean stacked, WidgetSize size, int stackLayout) {
            this.signature = signature;
            this.stacked = stacked;
            this.size = size;
            this.stackLayout = stackLayout;
        }
    }

    @SuppressWarnings("deprecation")
    private static WidgetSize readSize(Context context, Bundle options) {
        int minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH);
        int minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT);
        ArrayList<SizeF> sizes = null;
        if (Build.VERSION.SDK_INT >= 33) {
            sizes = options.getParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES, SizeF.class);
        } else if (Build.VERSION.SDK_INT >= 31) {
            sizes = options.getParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES);
        }
        if (sizes != null && !sizes.isEmpty()) {
            float[][] candidates = new float[sizes.size()][];
            for (int i = 0; i < sizes.size(); i++) {
                Object entry = ((ArrayList<?>) sizes).get(i);
                if (entry instanceof SizeF) {
                    SizeF size = (SizeF) entry;
                    candidates[i] = new float[]{size.getWidth(), size.getHeight()};
                } else {
                    candidates[i] = new float[]{0, 0};
                }
            }
            boolean landscape = context.getResources().getConfiguration().orientation
                    == android.content.res.Configuration.ORIENTATION_LANDSCAPE;
            float[] selected = WaterWidgetLayout.closestSize(candidates, minWidth, minHeight, landscape);
            if (selected != null) return new WidgetSize(Math.round(selected[0]), Math.round(selected[1]));
        }
        return new WidgetSize(
                WaterWidgetLayout.fallback(minWidth, options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH)),
                WaterWidgetLayout.fallback(minHeight, options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT)));
    }

    @Override public void onReceive(Context ctx,Intent intent){
        if(Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())){refresh(ctx);return;}
        if(REFRESH.equals(intent.getAction())){
            AppWidgetManager manager=AppWidgetManager.getInstance(ctx);
            int[] ids=manager.getAppWidgetIds(new ComponentName(ctx,WaterWidgetProvider.class));
            for(int id:ids)scheduleUpdate(ctx,manager,id,120);
            scheduleFeedbackExpiry(ctx);
            return;
        }
        super.onReceive(ctx,intent);
        if(PAGE_ACTION.equals(intent.getAction())){pageAction(ctx,intent);return;}
        if(PINNED.equals(intent.getAction())){refresh(ctx);android.widget.Toast.makeText(ctx,"接水小组件已添加",android.widget.Toast.LENGTH_SHORT).show();}
    }
    public static void refresh(Context ctx){
        ctx.sendBroadcast(new Intent(ctx,WaterWidgetProvider.class).setAction(REFRESH));
    }
    static JSONArray devices(Context ctx)throws Exception{
        SecureStore store=new SecureStore(ctx);JSONObject session=store.get("life798");
        if(session==null||session.optString("token").isEmpty())return new JSONArray();
        JSONObject registry=store.get("water-device-registry");if(registry==null)return new JSONArray();
        return WaterDeviceRegistry.display(WaterDeviceRegistry.profile(registry,WaterDeviceRegistry.account(session)));
    }
    static String owner(Context ctx)throws Exception{
        JSONObject session=new SecureStore(ctx).get("life798");
        return session==null||session.optString("token").isEmpty()?"":WaterDeviceRegistry.account(session);
    }
    static JSONObject selected(Context ctx,int widget)throws Exception{
        String owner=owner(ctx);if(owner.isEmpty())return null;
        android.content.SharedPreferences prefs=ctx.getSharedPreferences("water-widgets",0);
        String did=owner.equals(prefs.getString("owner-"+widget,""))?prefs.getString("device-"+widget,""):"";
        JSONArray rows=devices(ctx);for(int i=0;i<rows.length();i++)if(did.equals(rows.getJSONObject(i).optString("id")))return rows.getJSONObject(i);
        return rows.length()>0?rows.getJSONObject(0):null;
    }
    static boolean exists(Context ctx,int widget){
        for(int id:AppWidgetManager.getInstance(ctx).getAppWidgetIds(new ComponentName(ctx,WaterWidgetProvider.class)))if(id==widget)return true;return false;
    }
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) update(context, manager, id, readSize(context, manager.getAppWidgetOptions(id)), true);
    }

    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        lastResize.put(id,SystemClock.uptimeMillis());
        scheduleUpdate(context,manager,id,RESIZE_SETTLE);
    }

    private static void scheduleUpdate(Context context, AppWidgetManager manager, int id, long delay){
        cancelUpdate(id);
        Long resize = lastResize.get(id);
        if (resize != null) delay = Math.max(delay, resize + RESIZE_SETTLE - SystemClock.uptimeMillis());
        Context app = context.getApplicationContext();
        Runnable task = () -> {
            pendingUpdates.remove(id);
            if (!exists(app, id)) return;
            WidgetSize latest = readSize(app, manager.getAppWidgetOptions(id));
            update(app, manager, id, latest, false);
        };
        pendingUpdates.put(id, task);
        updates.postDelayed(task, delay);
    }

    private static void cancelUpdate(int id) {
        Runnable task = pendingUpdates.remove(id);
        if (task != null) updates.removeCallbacks(task);
    }

    private static void update(Context context, AppWidgetManager manager, int widget, WidgetSize size, boolean fullUpdate) {
        cancelUpdate(widget);
        try {
            JSONArray rows = devices(context);
            String account = owner(context);
            boolean stacked = rows.length() > 1;
            SharedPreferences prefs = context.getSharedPreferences("water-widgets", 0);
            boolean jump = prefs.getBoolean("jump-" + widget, false);
            PageState state = readPageState(context);
            String signature = size.width + "x" + size.height + "|" + account + "|" + rows + "|" + state.signature();
            WidgetPresentation previous = presentations.get(widget);
            boolean v = vivoLauncher(context);
            boolean resizeEvent = lastResize.remove(widget) != null;
            boolean rebuildStack = stacked && v && (resizeEvent || previous != null && previous.stacked
                    && (previous.size.width != size.width || previous.size.height != size.height));
            int stackLayout = previous != null && previous.stacked ? previous.stackLayout : R.layout.water_widget;
            if (previous != null && !fullUpdate && !jump) {
                if (signature.equals(previous.signature) && !rebuildStack) return;
                if (stacked && previous.stacked && Build.VERSION.SDK_INT < 31) {
                    manager.notifyAppWidgetViewDataChanged(widget, R.id.widget_devices);
                    presentations.put(widget, new WidgetPresentation(signature, true, size, stackLayout));
                    return;
                }
            }
            if (rebuildStack) {
                // OriginOS can leave existing StackFrames empty after a size change.
                // Inflate a fresh stack only for the final size, after resize events settle.
                stackLayout = stackLayout == R.layout.water_widget
                        ? R.layout.water_widget_resized : R.layout.water_widget;
            }
            RemoteViews views = new RemoteViews(context.getPackageName(),
                    stacked ? stackLayout : R.layout.water_widget_single);
            if (stacked) {
                bindStack(context, views, widget, rows, account, size, state, v);
            } else {
                WaterWidgetLayout layout = WaterWidgetLayout.measure(size.width, size.height, false);
                bindPage(context, views, widget, rows, account, 0, layout, state, false, v);
            }
            // Re-select only when the user chooses a device, preserving the current swipe page on refresh.
            if (stacked && jump) {
                String selected = prefs.getString("device-" + widget, "");
                if (account.equals(prefs.getString("owner-" + widget, ""))) {
                    for (int i = 0; i < rows.length(); i++) {
                        if (selected.equals(rows.getJSONObject(i).optString("id"))) {
                            views.setDisplayedChild(R.id.widget_devices, i);
                            break;
                        }
                    }
                }
            } else if (rebuildStack) {
                // A rebuilt host must show the first card even if the launcher retains a
                // previous display index for the same widget ID.
                views.setDisplayedChild(R.id.widget_devices, 0);
            }
            manager.updateAppWidget(widget, views);
            if (stacked && Build.VERSION.SDK_INT < 31) {
                manager.notifyAppWidgetViewDataChanged(widget, R.id.widget_devices);
            }
            if (jump) prefs.edit().remove("jump-" + widget).apply();
            presentations.put(widget, new WidgetPresentation(signature, stacked, size, stackLayout));
            if (resizeEvent && v) {
                // The launcher sometimes publishes the final size after the first resize broadcast.
                // Check once more after its resize transition has committed.
                scheduleUpdate(context, manager, widget, 650);
            }
        } catch (Exception error) {
            // Retain the previous usable view if the device cache cannot be rendered.
            android.util.Log.w("WaterWidget", "Unable to refresh widget " + widget, error);
        }
    }

    private static void bindStack(Context context, RemoteViews views, int widget, JSONArray rows,
                                  String owner, WidgetSize size, PageState state, boolean vivo) throws Exception {
        if (Build.VERSION.SDK_INT >= 31) {
            // Supply every page with the update. A serviced adapter invalidates its visible
            // page cache before fetching replacements, leaving empty StackFrames on some hosts.
            WaterWidgetLayout layout = WaterWidgetLayout.measure(size.width, size.height, true);
            RemoteViews.RemoteCollectionItems.Builder items =
                    new RemoteViews.RemoteCollectionItems.Builder().setHasStableIds(true).setViewTypeCount(1);
            for (int index = 0; index < rows.length(); index++) {
                String device = rows.getJSONObject(index).getString("id");
                items.addItem(itemId(owner, device), page(context, widget, rows, owner, index, layout, state, vivo));
            }
            views.setRemoteAdapter(R.id.widget_devices, items.build());
        } else {
            Intent adapter = new Intent(context, WaterWidgetCollectionService.class)
                    .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widget);
            adapter.setData(android.net.Uri.parse("hexu-widget://devices/" + widget));
            views.setRemoteAdapter(R.id.widget_devices, adapter);
        }
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
        Intent tap = new Intent(context, WaterWidgetProvider.class)
                .setAction(PAGE_ACTION).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widget);
        views.setPendingIntentTemplate(R.id.widget_devices, PendingIntent.getBroadcast(context, widget, tap, flags));
    }

    static long itemId(String owner,String did){
        long value=0xcbf29ce484222325L;
        String key=owner+"\u0000"+did;
        for(int i=0;i<key.length();i++){value^=key.charAt(i);value*=0x100000001b3L;}
        return value;
    }
    static WaterWidgetLayout stackLayout(Context context, int widget) {
        WidgetSize size = readSize(context, AppWidgetManager.getInstance(context).getAppWidgetOptions(widget));
        return WaterWidgetLayout.measure(size.width, size.height, true);
    }

    static RemoteViews page(Context context, int widget, JSONArray rows, String owner, int index,
                            WaterWidgetLayout layout, PageState state, boolean vivo) throws Exception {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.water_widget_page);
        bindPage(context, views, widget, rows, owner, index, layout, state, true, vivo);
        return views;
    }

    private static void bindPage(Context ctx, RemoteViews views, int widget, JSONArray rows, String owner,
                                 int index, WaterWidgetLayout layout, PageState state, boolean stacked, boolean vivo) throws Exception {
        float density = ctx.getResources().getDisplayMetrics().density;
        int padding = Math.round(layout.padding * density);
        // Request the full StackFrame slot. The host clips measurement to the available bounds.
        views.setInt(R.id.widget_slot, "setMinimumWidth", Math.round(layout.minimumSlotWidth(stacked, vivo) * density));
        views.setInt(R.id.widget_slot, "setMinimumHeight", Math.round((layout.height + (stacked ? 12 : 0)) * density));
        views.setViewPadding(R.id.widget_card, padding, padding, padding, padding);
        views.setImageViewResource(R.id.widget_card_background, CARD_BACKGROUNDS[index % CARD_BACKGROUNDS.length]);
        views.setViewVisibility(R.id.widget_brand, layout.showBrand ? View.VISIBLE : View.GONE);
        views.setInt(R.id.widget_config, "setHeight", Math.round(layout.headerHeight * density));
        views.setInt(R.id.widget_title, "setHeight", Math.round(layout.titleHeight * density));
        views.setInt(R.id.widget_device_number, "setHeight", Math.round(layout.detailHeight * density));
        views.setInt(R.id.widget_start, "setHeight", Math.round(layout.buttonHeight * density));
        views.setInt(R.id.widget_pages, "setHeight", Math.round(layout.pageHeight * density));
        views.setTextViewTextSize(R.id.widget_title, TypedValue.COMPLEX_UNIT_DIP, layout.titleTextSize);
        views.setTextViewTextSize(R.id.widget_brand, TypedValue.COMPLEX_UNIT_DIP, 10);
        views.setTextViewTextSize(R.id.widget_state, TypedValue.COMPLEX_UNIT_DIP, 10);
        views.setTextViewTextSize(R.id.widget_config, TypedValue.COMPLEX_UNIT_DIP, 12);
        views.setTextViewTextSize(R.id.widget_device_number, TypedValue.COMPLEX_UNIT_DIP, 9);
        views.setTextViewTextSize(R.id.widget_start, TypedValue.COMPLEX_UNIT_DIP, layout.buttonHeight > 32 ? 15 : 13);
        views.setTextViewTextSize(R.id.widget_pages, TypedValue.COMPLEX_UNIT_DIP, 9);
        JSONObject device = index < rows.length() ? rows.getJSONObject(index) : null;
        String did = device == null ? "" : device.optString("id");
        String activeId = state.activeId;
        boolean running = !activeId.isEmpty(), ownRunning = running && activeId.equals(did);
        boolean busy = state.busy;
        boolean unknown = "unknown".equals(state.activeStatus);
        boolean manual = "manual-required".equals(state.activeStatus);
        String feedback = state.feedbackDevice.isEmpty() || state.feedbackDevice.equals(did) ? state.feedback : "";
        views.setTextViewText(R.id.widget_title, device == null ? "桌面接水" : device.optString("name", "饮水机"));
        String status = busy ? "处理中"
                : ownRunning ? (manual ? "需现场结算" : unknown ? "结果待确认" : "出水待确认")
                : running ? "有待确认请求" : device == null ? "未配置" : "已就绪";
        views.setTextViewText(R.id.widget_state, feedback.isEmpty() ? status : feedback);
        String detail = device == null ? "先在禾序保存饮水机"
                : ownRunning && !unknown && !manual ? "请在水机上按接水" : "设备号 " + did;
        views.setTextViewText(R.id.widget_device_number, detail);
        views.setViewVisibility(R.id.widget_device_number, layout.showDetail ? View.VISIBLE : View.GONE);
        views.setContentDescription(R.id.widget_title, device == null ? detail : device.optString("name", "饮水机"));
        boolean blockedByOtherDevice = running && device != null && !ownRunning;
        views.setTextViewText(R.id.widget_start, busy ? "正在处理…" : blockedByOtherDevice ? "其他设备待确认"
                : manual ? "处理结算" : running ? "尝试结束" : device == null ? "配置设备" : "开始接水");
        views.setInt(R.id.widget_start, "setBackgroundResource", blockedByOtherDevice ? R.drawable.widget_action_wait
                : running ? R.drawable.widget_action_stop : R.drawable.widget_action_start);
        boolean canAct = !busy && !blockedByOtherDevice;
        views.setBoolean(R.id.widget_start, "setEnabled", canAct);
        bindAction(ctx, views, R.id.widget_config, widget, "configure", did, owner, stacked);
        String operation = !canAct ? "none" : manual ? "recover" : running ? "end"
                : device == null ? "configure" : "start";
        bindAction(ctx, views, R.id.widget_start, widget, operation, running ? activeId : did, owner, stacked);
        views.setViewVisibility(R.id.widget_pages, stacked ? View.VISIBLE : View.GONE);
        if (stacked) {
            int count = rows.length();
            StringBuilder dots = new StringBuilder();
            if (count <= 7) {
                for (int i = 0; i < count; i++) {
                    if (i > 0) dots.append("  ");
                    dots.append(i == index ? "●" : "·");
                }
            } else dots.append(index + 1).append(" / ").append(count);
            views.setTextViewText(R.id.widget_pages, dots.toString());
            views.setContentDescription(R.id.widget_pages, "第 " + (index + 1) + " 页，共 " + count + " 个设备；上下滑动切换");
        }
    }

    private static void bindAction(Context context, RemoteViews views, int viewId, int widget,
                                   String operation, String device, String owner, boolean stacked) {
        Intent action = fill(operation, device, owner);
        if (stacked) {
            views.setOnClickFillInIntent(viewId, action);
        } else {
            action.setClass(context, WaterWidgetProvider.class).setAction(PAGE_ACTION)
                    .setData(android.net.Uri.parse("hexu-widget://control/" + widget + "/" + viewId))
                    .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widget);
            views.setOnClickPendingIntent(viewId, PendingIntent.getBroadcast(context, 0, action,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        }
    }

    static final class PageState {
        final String activeId, activeStatus, feedbackDevice, feedback;
        final boolean busy;
        PageState(String activeId, String activeStatus, String feedbackDevice, String feedback, boolean busy) {
            this.activeId = activeId;
            this.activeStatus = activeStatus;
            this.feedbackDevice = feedbackDevice;
            this.feedback = feedback;
            this.busy = busy;
        }
        String signature() {
            return activeId + "|" + activeStatus + "|" + feedbackDevice + "|" + busy + "|" + feedback;
        }
    }
    static PageState readPageState(Context context) throws Exception {
        JSONObject active = new SecureStore(context).get("water-device-active");
        String id = active != null && active.length() > 0 ? active.keys().next() : "";
        SharedPreferences prefs = context.getSharedPreferences("water-widgets", 0);
        boolean recent = remainingFeedback(prefs) > 0;
        return new PageState(id, id.isEmpty() ? "" : active.optString(id),
                recent ? prefs.getString("message-device", "") : "",
                recent ? prefs.getString("message-short", "") : "", WaterWidgetService.BUSY.get());
    }

    private static final String PAGE_ACTION="com.jxau.pocket.WATER_WIDGET_PAGE";
    private static Intent fill(String action,String did,String owner){return new Intent().putExtra("operation",action).putExtra("did",did).putExtra("owner",owner);}
    private static void pageAction(Context ctx,Intent intent){
        int widget=intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,-1);if(!exists(ctx,widget))return;
        String action=intent.getStringExtra("operation"),did=intent.getStringExtra("did");
        if("none".equals(action))return;
        try{
            String owner=owner(ctx);if("configure".equals(action)&&(owner.isEmpty()||owner.equals(intent.getStringExtra("owner")))){
                ctx.startActivity(new Intent(ctx,WaterWidgetActionActivity.class).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,widget).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));return;
            }
            if(owner.isEmpty()||!owner.equals(intent.getStringExtra("owner"))){feedback(ctx,"798账号已变化，请打开禾序确认");return;}
            JSONArray rows=devices(ctx);int at=-1;for(int i=0;i<rows.length();i++)if(rows.getJSONObject(i).optString("id").equals(did))at=i;
            if("start".equals(action)||"end".equals(action)){
                if("start".equals(action)&&at<0){feedback(ctx,"设备已移除，请刷新组件");return;}
                if(at>=0)ctx.getSharedPreferences("water-widgets",0).edit().putString("device-"+widget,did).putString("owner-"+widget,owner).apply();
                Intent service=new Intent(ctx,WaterWidgetService.class).setAction(action).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,widget).putExtra("did",did).putExtra("owner",owner);
                if(android.os.Build.VERSION.SDK_INT>=26)ctx.startForegroundService(service);else ctx.startService(service);return;
            }
            if("recover".equals(action)){ctx.startActivity(new Intent(ctx,MainActivity.class).setAction("com.jxau.pocket.OPEN_WATER").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP));return;}
        }catch(Exception e){feedback(ctx,"设备列表已变化，请重新选择");}
    }
    static void feedback(Context ctx,String message){feedback(ctx,message,null);}
    static void feedback(Context ctx,String message,String device){
        feedback(ctx,message,device,"请核对状态");
    }
    static void feedback(Context ctx,String message,String device,String brief){
        ctx.getSharedPreferences("water-widgets",0).edit().putString("message-short",brief)
                .putString("message-device",device==null?"":device)
                .putLong("messageAt",System.currentTimeMillis()).apply();
        if (!message.isEmpty() && !brief.equals(message)) {
            android.widget.Toast.makeText(ctx,message,android.widget.Toast.LENGTH_LONG).show();
        }
        refresh(ctx);
    }
    private static long remainingFeedback(SharedPreferences prefs){
        long age = System.currentTimeMillis() - prefs.getLong("messageAt",0);
        return age >= 0 && age < FEEDBACK_DURATION ? FEEDBACK_DURATION-age : 0;
    }
    private static void scheduleFeedbackExpiry(Context context){
        if(feedbackExpiry!=null)updates.removeCallbacks(feedbackExpiry);
        long remaining=remainingFeedback(context.getSharedPreferences("water-widgets",0));
        if(remaining==0){feedbackExpiry=null;return;}
        feedbackExpiry=()->refresh(context.getApplicationContext());
        updates.postDelayed(feedbackExpiry,remaining);
    }
    static boolean vivoLauncher(Context context){
        String maker=Build.MANUFACTURER;
        return ("vivo".equalsIgnoreCase(maker)||"iQOO".equalsIgnoreCase(maker))
                && "com.bbk.launcher2".equals(homePackage(context));
    }
    private static String homePackage(Context context){
        Intent home=new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        android.content.pm.ResolveInfo launcher=context.getPackageManager()
                .resolveActivity(home,android.content.pm.PackageManager.MATCH_DEFAULT_ONLY);
        return launcher!=null&&launcher.activityInfo!=null?launcher.activityInfo.packageName:"";
    }
    @Override public void onDeleted(Context ctx,int[] ids){
        android.content.SharedPreferences.Editor editor=ctx.getSharedPreferences("water-widgets",0).edit();
        for(int id:ids){
            cancelUpdate(id);
            lastResize.remove(id);
            presentations.remove(id);
            editor.remove("device-"+id).remove("owner-"+id).remove("jump-"+id);
        }
        editor.apply();
    }
    static void pin(android.app.Activity activity,android.webkit.WebView view){
        boolean vivo="com.bbk.launcher2".equals(homePackage(activity));
        // OriginOS 17 reports support but silently rejects providers outside its
        // launcher whitelist. Manual widget placement remains supported.
        if(!vivo&&android.os.Build.VERSION.SDK_INT>=26){
            try{
                AppWidgetManager manager=AppWidgetManager.getInstance(activity);
                if(manager.isRequestPinAppWidgetSupported()){
                    Intent done=new Intent(activity,WaterWidgetProvider.class).setAction(PINNED);
                    PendingIntent callback=PendingIntent.getBroadcast(activity,0,done,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
                    if(manager.requestPinAppWidget(new ComponentName(activity,WaterWidgetProvider.class),null,callback)){
                        help(view,false,true);return;
                    }
                }
            }catch(RuntimeException ignored){}
        }
        help(view,vivo,false);
    }
    private static void help(android.webkit.WebView view,boolean vivo,boolean requested){
        // Only fixed boolean data crosses into the trusted local document.
        view.evaluateJavascript("window.dispatchEvent(new CustomEvent('jxau:widget-help',{detail:{vivo:"+vivo+",requested:"+requested+"}}))",null);
    }
}
