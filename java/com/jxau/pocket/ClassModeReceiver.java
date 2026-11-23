package com.jxau.pocket;

import android.app.AlarmManager;
import android.app.AutomaticZenRule;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.service.notification.Condition;
import org.json.JSONObject;

/** Runs timetable automation from system alarms, without a resident service. */
public final class ClassModeReceiver extends BroadcastReceiver {
    private static final String LIVE = "live", QUIET = "quiet", RULE = "rule";
    private static final String QUIET_STUDY = "quietStudy", QUIET_CUSTOM = "quietCustom";
    private static final String QUIET_END = "quietEnd", PREVIEW = "previewUntil";
    private static final String TICK = "com.jxau.pocket.CLASS_BOUNDARY";
    private static final String BACKUP = "com.jxau.pocket.CLASS_QUIET_END";
    static final String STOP_LIVE = "com.jxau.pocket.STOP_COURSE_LIVE";
    static final String STOP_PREVIEW = "com.jxau.pocket.STOP_COURSE_PREVIEW";
    static final long PREVIEW_DURATION = 120_000L;

    @Override public void onReceive(Context context, Intent intent) {
        PendingResult result = goAsync();
        new Thread(() -> {
            try {
                if (intent != null && STOP_LIVE.equals(intent.getAction())) {
                    change(context, new JSONObject().put("feature", LIVE).put("enabled", false));
                } else if (intent != null && STOP_PREVIEW.equals(intent.getAction())) {
                    change(context, new JSONObject().put("feature", "preview").put("enabled", false));
                } else sync(context);
            } catch (Exception error) {
                android.util.Log.w("HexuClassMode", "Unable to update class automation", error);
            } finally { result.finish(); }
        }, "class-boundary").start();
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("course-automation", Context.MODE_PRIVATE);
    }

    static String density(Context c) {
        return prefs(c).getString("density", CourseLabel.COMPACT);
    }

    static int leadMinutes(Context c) {
        return prefs(c).getInt("leadMinutes", 10);
    }

    static int displayMinutes(Context c) {
        int seconds = prefs(c).getInt("displaySeconds", 45);
        return ClassWindow.wholeDisplayMinutes(seconds);
    }

    static String displayMode(Context c) {
        SharedPreferences p = prefs(c);
        return p.getString("displayMode", p.getInt("displaySeconds", VivoCourseCard.supportsDevice() ? 45 : 0) > 0
                ? "custom" : "end");
    }

    static boolean mayShowCard(Context c, String phase, long now) {
        SharedPreferences p = prefs(c);
        return "演示".equals(phase) ? p.getLong(PREVIEW, 0) > now : p.getBoolean(LIVE, false);
    }

    private static NotificationManager notifications(Context c) {
        return c.getSystemService(NotificationManager.class);
    }

    private static boolean exactAllowed(Context c) {
        return Build.VERSION.SDK_INT < 31 || c.getSystemService(AlarmManager.class).canScheduleExactAlarms();
    }

    static synchronized JSONObject status(Context c) throws Exception {
        SharedPreferences p = prefs(c);
        NotificationManager manager = notifications(c);
        boolean access = Build.VERSION.SDK_INT >= 29 && manager.isNotificationPolicyAccessGranted();
        String id = p.getString(RULE, "");
        AutomaticZenRule rule = access && !id.isEmpty() ? manager.getAutomaticZenRule(id) : null;
        boolean enabledRule = rule != null && rule.isEnabled();
        long quietUntil = p.getLong(QUIET_END, 0);
        int filter = manager.getCurrentInterruptionFilter();
        boolean filterActive = access && filter != NotificationManager.INTERRUPTION_FILTER_ALL
                && filter != NotificationManager.INTERRUPTION_FILTER_UNKNOWN;
        boolean quietActive = enabledRule && quietUntil > System.currentTimeMillis() && filterActive;
        if (quietActive && Build.VERSION.SDK_INT >= 36) {
            try { quietActive = manager.getAutomaticZenRuleState(id) == Condition.STATE_TRUE; }
            catch (RuntimeException unavailable) { quietActive = false; }
        }
        return new JSONObject().put("ok", true)
                .put("live", p.getBoolean(LIVE, false)).put("liveSupported", CourseLiveCard.supported())
                .put("vivoCard", VivoCourseCard.supportsDevice())
                .put("xiaomiCard", XiaomiCourseCard.supportsDevice())
                .put("colorOsCard", ColorOsCourseCard.isDevice())
                .put("promotionSupported", Build.VERSION.SDK_INT >= 36)
                .put("vivoScene", VivoCourseCard.sceneStatus(c))
                .put("density", density(c)).put("leadMinutes", leadMinutes(c))
                .put("displayMode", displayMode(c)).put("displayMinutes", displayMinutes(c))
                .put("notifications", CourseLiveCard.allowed(c)).put("promoted", CourseLiveCard.promotionAllowed(c))
                .put("preview", p.getLong(PREVIEW, 0) > System.currentTimeMillis())
                .put("presentation", CourseLiveCard.presentation(c))
                .put("quiet", p.getBoolean(QUIET, false)).put("quietSupported", Build.VERSION.SDK_INT >= 29)
                .put("quietAccess", access).put("quietRuleReady", enabledRule)
                .put("quietStudy", p.getBoolean(QUIET_STUDY, true))
                .put("quietCustom", p.getBoolean(QUIET_CUSTOM, false))
                .put("quietActive", quietActive).put("quietUntil", quietUntil)
                .put("exact", exactAllowed(c));
    }

    static synchronized JSONObject change(Context c, JSONObject body) throws Exception {
        SharedPreferences p = prefs(c);
        String feature = body.optString("feature");
        if ("display".equals(feature)) {
            String mode = body.optString("mode");
            if (!"start".equals(mode) && !"end".equals(mode) && !"custom".equals(mode))
                throw new IllegalArgumentException("上岛时长选项无效");
            SharedPreferences.Editor settings = p.edit().putString("displayMode", mode);
            if ("custom".equals(mode)) {
                int minutes = body.optInt("minutes", -1);
                Object value = body.opt("minutes");
                if (!(value instanceof Number) || ((Number)value).doubleValue() != minutes
                        || minutes < 1 || minutes > ClassWindow.MAX_DISPLAY_MINUTES)
                    throw new IllegalArgumentException("请输入 1–120 分钟");
                settings.putInt("displaySeconds", minutes * 60);
            }
            if (!settings.commit()) throw new IllegalStateException("保存失败，请重试");
            sync(c);
            return status(c);
        }
        if ("density".equals(feature) || "lead".equals(feature)) {
            if ("density".equals(feature)) {
                String value = body.optString("value");
                if (!CourseLabel.validDensity(value)) throw new IllegalArgumentException("密度设置无效");
                if (!p.edit().putString("density", value).commit()) throw new IllegalStateException("保存失败，请重试");
            } else {
                Object value = body.opt("value");
                int amount = body.optInt("value", -1);
                if (!(value instanceof Number) || amount < 0 || amount > 60
                        || ((Number)value).doubleValue() != amount)
                    throw new IllegalArgumentException("请输入 0–60 分钟");
                if (!p.edit().putInt("leadMinutes", amount).commit())
                    throw new IllegalStateException("保存失败，请重试");
            }
            sync(c);
            return status(c);
        }
        if (!(body.opt("enabled") instanceof Boolean)) throw new IllegalArgumentException("设置值无效");
        boolean enabled = body.getBoolean("enabled");
        SharedPreferences.Editor edit = p.edit();
        switch (feature) {
            case LIVE:
                if (enabled) CourseLiveCard.requirePermission(c);
                edit.putBoolean(LIVE, enabled);
                if (!enabled) edit.remove(PREVIEW);
                break;
            case QUIET:
                if (enabled) {
                    if (Build.VERSION.SDK_INT < 29 || !notifications(c).isNotificationPolicyAccessGranted()) {
                        throw new IllegalArgumentException("请先授权免打扰访问");
                    }
                    if (!exactAllowed(c)) throw new IllegalArgumentException("请先允许闹钟与提醒，以便准时退出免打扰");
                    prepareRule(c);
                }
                edit.putBoolean(QUIET, enabled);
                break;
            case QUIET_STUDY:
                edit.putBoolean(QUIET_STUDY, enabled);
                break;
            case QUIET_CUSTOM:
                edit.putBoolean(QUIET_CUSTOM, enabled);
                break;
            case "preview":
                if (enabled) CourseLiveCard.requirePermission(c);
                edit.putLong(PREVIEW, enabled ? System.currentTimeMillis() + PREVIEW_DURATION : 0);
                break;
            default: throw new IllegalArgumentException("未知的课表设置");
        }
        if (!edit.commit()) throw new IllegalStateException("未保存设置，请重试");
        sync(c);
        return status(c);
    }

    static synchronized void sync(Context c) {
        SharedPreferences p = prefs(c);
        if (!p.getBoolean(LIVE, false) && !p.getBoolean(QUIET, false)
                && p.getLong(PREVIEW, 0) == 0 && p.getLong(QUIET_END, 0) == 0) {
            // This branch is also reached immediately after the last switch is turned off.
            CourseLiveCard.finish(c);
            schedule(c, TICK, 0, false);
            schedule(c, BACKUP, 0, false);
            return;
        }
        JSONObject data;
        try { data = AgendaWidgetProvider.data(c); }
        catch (Exception e) { data = new JSONObject(); }
        sync(c, data);
    }

    static synchronized void sync(Context c, JSONObject data) {
        SharedPreferences p = prefs(c);
        boolean live = p.getBoolean(LIVE, false), quiet = p.getBoolean(QUIET, false);
        long preview = p.getLong(PREVIEW, 0);
        long now = System.currentTimeMillis();
        ClassWindow window = new ClassWindow();
        if (live || quiet) {
            try {
                window = ClassWindow.at(data, now, live, leadMinutes(c) * 60_000L,
                        quiet, p.getBoolean(QUIET_STUDY, true), p.getBoolean(QUIET_CUSTOM, false));
            } catch (Exception ignored) { }
        }
        boolean exact = exactAllowed(c);
        long end = quiet && exact ? window.quietUntil : 0;
        // Arrange both end alarms before entering DND, including a backup if exact access is revoked.
        if (end > now) schedule(c, BACKUP, end, false);
        long tick = CourseLiveCard.sync(c, window, now, live, preview);
        if (preview != 0 && preview <= now) p.edit().remove(PREVIEW).apply();
        if (window.next > 0) tick = tick == 0 ? window.next : Math.min(tick, window.next);
        boolean preciseTick = schedule(c, TICK, tick, exact);
        boolean mayBeActive = syncQuiet(c, preciseTick ? end : 0);
        if (!mayBeActive) schedule(c, BACKUP, 0, false);
        else if (end == 0 || !preciseTick) schedule(c, BACKUP, now + 300_000L, false);
    }

    private static boolean schedule(Context c, String action, long when, boolean exact) {
        AlarmManager alarms = c.getSystemService(AlarmManager.class);
        PendingIntent pending = PendingIntent.getBroadcast(c, 0,
                new Intent(c, ClassModeReceiver.class).setAction(action), PendingIntent.FLAG_IMMUTABLE);
        if (when <= 0) { alarms.cancel(pending); return false; }
        if (exact) {
            try {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pending);
                return true;
            } catch (SecurityException ignored) { }
        }
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pending);
        return false;
    }

    private static void prepareRule(Context c) {
        NotificationManager manager = notifications(c);
        SharedPreferences p = prefs(c);
        String id = p.getString(RULE, "");
        AutomaticZenRule existing = id.isEmpty() ? null : manager.getAutomaticZenRule(id);
        if (existing != null) {
            if (!existing.isEnabled()) throw new IllegalArgumentException("请在系统免打扰设置中启用「禾序 · 上课免打扰」");
            return;
        }
        Uri condition = Condition.newId(c).appendPath("in-class").build();
        ComponentName screen = new ComponentName(c, MainActivity.class);
        AutomaticZenRule rule;
        if (Build.VERSION.SDK_INT >= 35) {
            rule = new AutomaticZenRule.Builder("禾序 · 上课免打扰", condition)
                    .setConfigurationActivity(screen).setType(AutomaticZenRule.TYPE_SCHEDULE_CALENDAR)
                    .setTriggerDescription("根据禾序课表和免打扰设置自动启用")
                    .setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_PRIORITY)
                    .setEnabled(true).build();
        } else {
            rule = new AutomaticZenRule("禾序 · 上课免打扰", null, screen, condition,
                    null, NotificationManager.INTERRUPTION_FILTER_PRIORITY, true);
        }
        String newId = manager.addAutomaticZenRule(rule);
        if (newId == null) throw new IllegalStateException("系统未能创建免打扰规则");
        p.edit().putString(RULE, newId).remove(QUIET_END).commit();
    }

    private static boolean syncQuiet(Context c, long until) {
        SharedPreferences p = prefs(c);
        long previous = p.getLong(QUIET_END, 0);
        if (Build.VERSION.SDK_INT < 29 || (previous == 0 && until == 0)) return false;
        NotificationManager manager = notifications(c);
        if (!manager.isNotificationPolicyAccessGranted()) return false;
        String id = p.getString(RULE, "");
        try {
            AutomaticZenRule rule = id.isEmpty() ? null : manager.getAutomaticZenRule(id);
            if (rule == null || !rule.isEnabled()) {
                p.edit().remove(QUIET_END).commit();
                return false;
            }
            if ((previous != 0) != (until != 0) || (until > 0 && System.currentTimeMillis() >= previous)) {
                // Persist the end before activation so recovery can clear an interrupted write.
                if (until > 0 && !p.edit().putLong(QUIET_END, until).commit()) return false;
                manager.setAutomaticZenRuleState(id, new Condition(rule.getConditionId(), "禾序课程",
                        until > 0 ? Condition.STATE_TRUE : Condition.STATE_FALSE));
            }
            if (previous != until) p.edit().putLong(QUIET_END, until).commit();
            return until > 0;
        } catch (RuntimeException e) {
            return p.getLong(QUIET_END, 0) != 0;
        }
    }
}
