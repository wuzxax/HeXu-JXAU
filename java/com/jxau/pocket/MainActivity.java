package com.jxau.pocket;

import android.app.Activity;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.res.Configuration;
import android.view.View;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import java.io.IOException;
import android.net.Uri;
import android.widget.Toast;

public class MainActivity extends Activity {
    private WebView webView;
    private CasClient client;
    private MiniHttpServer server;
    private long lastBack;
    private String pendingScheduleExport;
    private boolean savingScheduleImage;
    private long dockGestureAt, dockHapticAt;
    private android.webkit.ValueCallback<Uri[]> fileCallback;
    private android.webkit.PermissionRequest cameraRequest;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if(savedInstanceState!=null)pendingScheduleExport=savedInstanceState.getString("schedule-export-id");
        retireReminderExperiment();
        new SecureStore(this).removeRetiredWaterSettings();
        updateWindowColors();

        client = new CasClient(this);
        server = new MiniHttpServer(this, client, mode -> runOnUiThread(() -> {
            getPreferences(MODE_PRIVATE).edit().putString("colorMode", mode).apply();
            updateWindowColors();
        }));
        try {
            server.start();
        } catch (Exception e) {
            android.widget.TextView error = new android.widget.TextView(this);
            error.setText("本地服务启动失败，请关闭应用后重新打开。");
            error.setPadding(32,64,32,32); setContentView(error); return;
        }

        webView = new WebView(this) {
            @Override public boolean onTouchEvent(MotionEvent event) {
                int action = event.getActionMasked();
                if ((action == MotionEvent.ACTION_DOWN || action == MotionEvent.ACTION_MOVE)
                        && event.getPointerCount() == 1
                        && event.getY() >= getHeight() - 120 * getResources().getDisplayMetrics().density) {
                    dockGestureAt = SystemClock.uptimeMillis();
                } else if (action != MotionEvent.ACTION_UP) {
                    dockGestureAt = 0;
                }
                return super.onTouchEvent(event);
            }
        };
        webView.addJavascriptInterface(new DockFeedback(), "HexuDockFeedback");
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setCacheMode(WebSettings.LOAD_DEFAULT);
        ws.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        ws.setAllowFileAccess(false);
        ws.setAllowFileAccessFromFileURLs(false);
        ws.setAllowUniversalAccessFromFileURLs(false);
        ws.setGeolocationEnabled(false);
        if(android.os.Build.VERSION.SDK_INT>=26)ws.setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView,false);
        // Needed to read the content URI explicitly selected in the system HAR picker.
        ws.setAllowContentAccess(true);
        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                if (url != null && localPage(Uri.parse(url))) dispatchSystemColor();
            }

            @Override public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                Uri uri=request.getUrl();
                if(!request.isForMainFrame())return true;
                if("jxau-pocket".equals(uri.getScheme())){
                    String page=view.getUrl();
                    if(!request.isForMainFrame()||!request.hasGesture()||page==null
                            ||!page.startsWith("http://127.0.0.1:"+MiniHttpServer.PORT+"/"))return true;
                    java.util.List<String> segments=uri.getPathSegments();
                    if("schedule".equals(uri.getHost())&&uri.getQuery()==null&&uri.getFragment()==null){
                        if(segments.size()==2&&"export".equals(segments.get(0)))try{pendingScheduleExport=segments.get(1);startActivityForResult(new ScheduleExport(MainActivity.this).create(pendingScheduleExport),704);}catch(Exception e){pendingScheduleExport=null;Toast.makeText(MainActivity.this,"导出文件已失效，请重新生成",Toast.LENGTH_LONG).show();}
                        if(segments.size()==2&&"save-image".equals(segments.get(0)))saveScheduleImage(segments.get(1));
                        if(segments.size()==1&&"widget".equals(segments.get(0)))AgendaWidgetProvider.pin(MainActivity.this,false);
                        if(segments.size()==1&&"next-widget".equals(segments.get(0)))AgendaWidgetProvider.pin(MainActivity.this,true);
                        if(segments.size()==2&&"class-permission".equals(segments.get(0)))openClassPermission(segments.get(1));
                    }

                    if("parcel".equals(uri.getHost())&&segments.size()==2&&uri.getQuery()==null&&uri.getFragment()==null){
                        String action=segments.get(0),key=segments.get(1);
                        if(ParcelTargets.get(key)!=null){
                            if("open".equals(action))ParcelLauncher.open(MainActivity.this,key);
                            else if("pin".equals(action))ParcelLauncher.pin(MainActivity.this,key);
                        }
                    }
                    if("payment".equals(uri.getHost())&&segments.size()==2&&uri.getQuery()==null&&uri.getFragment()==null){
                        PaymentLauncher.handle(MainActivity.this,segments.get(0),segments.get(1));
                    }
                    if("water".equals(uri.getHost())&&segments.size()==1&&"widget".equals(segments.get(0))&&uri.getQuery()==null&&uri.getFragment()==null)WaterWidgetProvider.pin(MainActivity.this,view);
                    if("water".equals(uri.getHost())&&segments.size()==1&&"home".equals(segments.get(0))&&uri.getQuery()==null&&uri.getFragment()==null){
                        try{startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME));}catch(RuntimeException e){Toast.makeText(MainActivity.this,"请返回桌面后长按空白处添加",Toast.LENGTH_LONG).show();}
                    }
                    return true;
                }
                if(localPage(uri))return false;
                if(request.hasGesture()&&localPage(Uri.parse(view.getUrl()==null?"":view.getUrl())))openExternal(uri);
                return true;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // API 24+ uses the request overload, which also checks the user gesture.
                return !localPage(Uri.parse(url));
            }
        });
        webView.setWebChromeClient(new WebChromeClient(){
            @Override public void onPermissionRequest(android.webkit.PermissionRequest request){
                runOnUiThread(()->{if(webView==null||isDestroyed()){request.deny();return;}String expected="http://127.0.0.1:"+MiniHttpServer.PORT;boolean video=false;for(String resource:request.getResources())if(android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource))video=true;
                    if(!(expected.equals(request.getOrigin().toString())||(expected+"/").equals(request.getOrigin().toString()))||!video){request.deny();return;}
                    if(checkSelfPermission(android.Manifest.permission.CAMERA)==android.content.pm.PackageManager.PERMISSION_GRANTED){request.grant(new String[]{android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE});return;}
                    if(cameraRequest!=null){request.deny();return;}cameraRequest=request;requestPermissions(new String[]{android.Manifest.permission.CAMERA},702);
                });
            }
            @Override public void onPermissionRequestCanceled(android.webkit.PermissionRequest request){if(cameraRequest==request)cameraRequest=null;}
            @Override public boolean onShowFileChooser(WebView view,android.webkit.ValueCallback<Uri[]> callback,FileChooserParams params){
                String page=view.getUrl();
                if(page==null||!page.startsWith("http://127.0.0.1:"+MiniHttpServer.PORT+"/")){callback.onReceiveValue(null);return true;}
                if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;
                Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);
                String[] types=params.getAcceptTypes();
                boolean images=types!=null&&types.length==1&&"image/*".equals(types[0]);
                intent.setType(images?"image/*":"*/*");intent.addCategory(Intent.CATEGORY_OPENABLE);
                try{startActivityForResult(intent,701);}catch(Exception e){fileCallback.onReceiveValue(null);fileCallback=null;}return true;
            }
        });
        updateWindowColors();

        setContentView(webView, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        String local = "http://127.0.0.1:" + MiniHttpServer.PORT + "/";
        CookieManager.getInstance().setCookie(local, server.sessionCookie());
        CookieManager.getInstance().flush();
        webView.loadUrl(local+(AgendaWidgetProvider.OPEN.equals(getIntent().getAction())?"?open=schedule":"com.jxau.pocket.OPEN_WATER".equals(getIntent().getAction())?"?open=water#/waterDevice":""));
    }

    private boolean systemDark() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
    }

    /** One system selection tick, limited to recent physical touches on the local page. */
    private final class DockFeedback {
        @JavascriptInterface public void selection() {
            runOnUiThread(() -> {
                long now = SystemClock.uptimeMillis();
                if (webView == null || !hasWindowFocus() || dockGestureAt == 0
                        || now - dockGestureAt > 180 || now - dockHapticAt < 65) return;
                String current = webView.getUrl();
                if (current == null || !localPage(Uri.parse(current))) return;
                dockHapticAt = now;
                webView.performHapticFeedback(Build.VERSION.SDK_INT >= 34
                        ? HapticFeedbackConstants.SEGMENT_TICK
                        : HapticFeedbackConstants.CLOCK_TICK);
            });
        }
    }

    private void updateWindowColors() {
        String mode = getPreferences(MODE_PRIVATE).getString("colorMode", "system");
        boolean dark = "dark".equals(mode) || ("system".equals(mode) && systemDark());
        int color = dark ? 0xFF101417 : 0xFFF5F6F8;
        getWindow().setStatusBarColor(color);
        getWindow().setNavigationBarColor(color);
        int flags = getWindow().getDecorView().getSystemUiVisibility();
        int lightBars = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        getWindow().getDecorView().setSystemUiVisibility(dark ? flags & ~lightBars : flags | lightBars);
        if (webView != null) webView.setBackgroundColor(color);
    }

    private void dispatchSystemColor() {
        if (webView != null) webView.evaluateJavascript(
                "dispatchEvent(new CustomEvent('jxau:system-color',{detail:" + systemDark() + "}))", null);
    }

    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        updateWindowColors();
        dispatchSystemColor();
    }
    private void openClassPermission(String type) {
        Intent screen;
        Uri app = Uri.fromParts("package", getPackageName(), null);
        switch (type) {
            case "notifications":
                if (Build.VERSION.SDK_INT >= 33
                        && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                        != android.content.pm.PackageManager.PERMISSION_GRANTED
                        && !getPreferences(MODE_PRIVATE).getBoolean("class-notification-requested", false)) {
                    getPreferences(MODE_PRIVATE).edit().putBoolean("class-notification-requested", true).apply();
                    requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 705);
                    return;
                }
                screen = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                screen.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                break;
            case "promotion":
                screen = new Intent(Settings.ACTION_APP_NOTIFICATION_PROMOTION_SETTINGS);
                screen.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                break;
            case "xiaomi-notifications":
                if (!XiaomiCourseCard.supportsDevice()) return;
                CourseLiveCard.ensureChannel(this);
                screen = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())
                        .putExtra(Settings.EXTRA_CHANNEL_ID, CourseLiveCard.channelId());
                break;
            case "quiet":
                screen = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS);
                break;
            case "alarms":
                if (Build.VERSION.SDK_INT < 31) return;
                screen = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, app);
                break;
            case "rules":
                screen = new Intent("android.settings.ZEN_MODE_AUTOMATION_SETTINGS");
                break;
            default: return;
        }
        try { startActivity(screen); }
        catch (RuntimeException e) {
            Intent fallback = "xiaomi-notifications".equals(type) || "promotion".equals(type)
                    ? new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())
                    : "rules".equals(type)
                    ? new Intent("android.settings.ZEN_MODE_SETTINGS")
                    : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, app);
            try { startActivity(fallback); }
            catch (RuntimeException ignored) { }
        }
    }

    private void saveScheduleImage(String id) {
        if (Build.VERSION.SDK_INT < 29 || savingScheduleImage) return;
        savingScheduleImage = true;
        new Thread(() -> {
            ContentResolver resolver = getContentResolver();
            Uri image = null;
            String feedback;
            try {
                ScheduleExport export = new ScheduleExport(this);
                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, export.imageName(id));
                values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/禾序");
                values.put(MediaStore.Images.Media.IS_PENDING, 1);
                image = resolver.insert(MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values);
                if (image == null) throw new IOException("无法创建图片");
                export.write(id, image, this);
                ContentValues ready = new ContentValues();
                ready.put(MediaStore.Images.Media.IS_PENDING, 0);
                if (resolver.update(image, ready, null, null) != 1) throw new IOException("无法发布图片");
                feedback = "课表图片已保存到相册";
            } catch (Exception e) {
                if (image != null) {
                    try { resolver.delete(image, null, null); } catch (RuntimeException ignored) {}
                }
                feedback = "未能保存到相册，请重试或选择保存位置";
            }
            String message = feedback;
            runOnUiThread(() -> {
                savingScheduleImage = false;
                if (!isFinishing()) Toast.makeText(this, message, Toast.LENGTH_LONG).show();
            });
        }, "save-schedule-image").start();
    }

    /** Remove only alarms and notifications left by the archived 3.4.71 experiment. */
    private void retireReminderExperiment(){new Thread(()->{try{
        Intent old=new Intent().setClassName(getPackageName(),"com.jxau.pocket.ReminderReceiver").setAction("com.jxau.pocket.REMINDER_FIRE");
        android.app.PendingIntent pending=android.app.PendingIntent.getBroadcast(this,7141,old,android.app.PendingIntent.FLAG_NO_CREATE|android.app.PendingIntent.FLAG_IMMUTABLE);
        if(pending!=null){((android.app.AlarmManager)getSystemService(ALARM_SERVICE)).cancel(pending);pending.cancel();}
        SecureStore vault=new SecureStore(this);org.json.JSONObject plan=vault.get("schedule-reminders");
        if(plan!=null){org.json.JSONArray rows=plan.optJSONArray("events");android.app.NotificationManager nm=(android.app.NotificationManager)getSystemService(NOTIFICATION_SERVICE);if(rows!=null)for(int i=0;i<rows.length();i++)nm.cancel("schedule:"+rows.getJSONObject(i).optString("id"),1);vault.put("schedule-reminders",null);}
        getSharedPreferences("schedule-reminder-delivered",0).edit().clear().apply();
        if(android.os.Build.VERSION.SDK_INT>=26)((android.app.NotificationManager)getSystemService(NOTIFICATION_SERVICE)).deleteNotificationChannel("schedule-reminders-v1");
    }catch(Exception ignored){}},"retire-reminder-experiment").start();}
    private static boolean localPage(Uri uri){return "http".equals(uri.getScheme())&&"127.0.0.1".equals(uri.getHost())&&uri.getPort()==MiniHttpServer.PORT&&uri.getUserInfo()==null;}
    private void openExternal(Uri uri){
        if(!("https".equals(uri.getScheme())||"http".equals(uri.getScheme()))||uri.getHost()==null||uri.getUserInfo()!=null)return;
        try{startActivity(new Intent(Intent.ACTION_VIEW,uri).addCategory(Intent.CATEGORY_BROWSABLE));}catch(Exception ignored){}
    }
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] grants){super.onRequestPermissionsResult(code,permissions,grants);if(code==705&&webView!=null)webView.evaluateJavascript("dispatchEvent(new Event('jxau:foreground'))",null);if(code==702&&cameraRequest!=null){if(grants.length>0&&grants[0]==android.content.pm.PackageManager.PERMISSION_GRANTED)cameraRequest.grant(new String[]{android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE});else cameraRequest.deny();cameraRequest=null;}}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);if(webView!=null&&AgendaWidgetProvider.OPEN.equals(intent.getAction()))webView.evaluateJavascript("window.Jxau&&window.Jxau.showRoute(\'schedule\')",null);if(webView!=null&&"com.jxau.pocket.OPEN_WATER".equals(intent.getAction()))webView.evaluateJavascript("window.Jxau&&window.Jxau.showRoute('waterDevice')",null);}
    @Override protected void onResume(){super.onResume();new Thread(()->ClassModeReceiver.sync(this),"class-resume").start();if(webView!=null)webView.evaluateJavascript("dispatchEvent(new Event('jxau:foreground'));if(document.body.dataset.page==='waterDevice'&&window.Jxau)window.Jxau.water.refresh()",null);}

    @Override
    protected void onActivityResult(int requestCode,int resultCode,Intent data){
        super.onActivityResult(requestCode,resultCode,data);
        if(requestCode==704){String id=pendingScheduleExport;pendingScheduleExport=null;if(resultCode==RESULT_OK&&data!=null&&data.getData()!=null&&id!=null){Uri target=data.getData();new Thread(()->{try{new ScheduleExport(this).write(id,target,this);runOnUiThread(()->Toast.makeText(this,"课表已保存",Toast.LENGTH_LONG).show());}catch(Exception e){runOnUiThread(()->Toast.makeText(this,"保存未完成，请重新导出",Toast.LENGTH_LONG).show());}},"schedule-export").start();}}
        if(requestCode==701&&fileCallback!=null){fileCallback.onReceiveValue(resultCode==RESULT_OK&&data!=null&&data.getData()!=null?new Uri[]{data.getData()}:null);fileCallback=null;}
    }

    @Override
    public void onBackPressed() {
        if(webView == null) {super.onBackPressed(); return;}
        webView.evaluateJavascript("(function(){return typeof window.appBack==='function'?window.appBack():false;})()", result -> {
            if(webView==null||isFinishing()||isDestroyed()||"true".equals(result)) return;
            long now = System.currentTimeMillis();
            if(now-lastBack<1800) finish();
            else {lastBack=now;Toast.makeText(this,"再按一次返回退出",Toast.LENGTH_SHORT).show();}
        });
    }

    @Override protected void onSaveInstanceState(Bundle out){super.onSaveInstanceState(out);if(pendingScheduleExport!=null)out.putString("schedule-export-id",pendingScheduleExport);}

    @Override
    protected void onDestroy() {
        WebView view = webView;
        webView = null;
        if (cameraRequest != null) {
            android.webkit.PermissionRequest request = cameraRequest;
            cameraRequest = null;
            request.deny();
        }
        if (fileCallback != null) {
            android.webkit.ValueCallback<Uri[]> callback = fileCallback;
            fileCallback = null;
            callback.onReceiveValue(null);
        }
        if (view != null) {
            view.stopLoading();
            view.removeJavascriptInterface("HexuDockFeedback");
            view.setWebChromeClient(null);
            view.setWebViewClient(null);
            ViewParent parent = view.getParent();
            if (parent instanceof ViewGroup) ((ViewGroup) parent).removeView(view);
            view.destroy();
        }
        if (server != null) {
            server.stop();
            server = null;
        }
        super.onDestroy();
    }
}
