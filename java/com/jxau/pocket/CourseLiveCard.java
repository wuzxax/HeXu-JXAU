package com.jxau.pocket;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.StatusBarNotification;
import org.json.JSONObject;

/** Publishes course updates using the notification format supported by the device. */
final class CourseLiveCard {
    private static final String CHANNEL = "course-live-v1";
    private static final String XIAOMI_CHANNEL = "course-hyperos-v1";
    private static final int ID = 7401;
    static final int SERVICE_ID = 7402;
    private static final String SEQUENCE = "hexu.courseCard.sequence";
    private static final String DEADLINE = "hexu.courseCard.deadline";
    private static final String PHASE = "hexu.courseCard.phase";
    private static final String LABELS = "hexu.courseCard.labels";
    private static final String REQUEST_PROMOTION = "android.requestPromotedOngoing";

    private static NotificationManager manager(Context c) {
        return c.getSystemService(NotificationManager.class);
    }

    static String channelId() {
        return XiaomiCourseCard.supportsDevice() ? XIAOMI_CHANNEL : CHANNEL;
    }

    static boolean supported() {
        return Build.VERSION.SDK_INT >= 36 || (Build.VERSION.SDK_INT >= 33
                && (VivoCourseCard.supportsDevice() || XiaomiCourseCard.supportsDevice()));
    }

    static boolean allowed(Context c) {
        if (!supported() || c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) return false;
        ensureChannel(c);
        NotificationChannel channel = manager(c).getNotificationChannel(channelId());
        return manager(c).areNotificationsEnabled()
                && (channel == null || channel.getImportance() != NotificationManager.IMPORTANCE_NONE);
    }

    static boolean promotionAllowed(Context c) {
        return Build.VERSION.SDK_INT >= 36 && manager(c).canPostPromotedNotifications();
    }

    static boolean ready(Context c) {
        return allowed(c) && (!ColorOsCourseCard.supported() || promotionAllowed(c));
    }

    static void requirePermission(Context c) {
        if (!allowed(c)) throw new IllegalArgumentException("请先允许禾序发送通知");
        if (ColorOsCourseCard.supported() && !promotionAllowed(c))
            throw new IllegalArgumentException("请在流体云设置中允许显示实时活动");
    }

    static String presentation(Context c) {
        if (!supported()) return "none";
        StatusBarNotification active = current(c, SERVICE_ID);
        if (active == null) active = current(c, ID);
        if (active == null) return "none";
        // OriginOS marks atomic admission on the delivered record, independently of Android promotion.
        if (VivoCourseCard.supportsDevice()
                && (VivoCourseCard.TAG.equals(active.getTag())
                || "true".equalsIgnoreCase(active.getNotification().extras.getString("SUPERX_VALUE"))))
            return "atomic";
        return (active.getNotification().flags & Notification.FLAG_PROMOTED_ONGOING) != 0
                ? "promoted" : "notification";
    }

    private static StatusBarNotification current(Context c, int id) {
        StatusBarNotification ordinary = null;
        for (StatusBarNotification active : manager(c).getActiveNotifications()) {
            if (active.getId() != id) continue;
            if (VivoCourseCard.TAG.equals(active.getTag())) return active;
            if (active.getTag() == null) ordinary = active;
        }
        return ordinary;
    }

    static long sync(Context c, ClassWindow window, long now, boolean enabled, long preview) {
        if (!supported()) return 0;
        try {
            if ((enabled || preview > now) && ready(c)) {
                if (preview > now) {
                    String density = ClassModeReceiver.density(c);
                    JSONObject sample = new JSONObject().put("name", "高等数学 · 示例")
                            .put("alias", "高数").put("room", "教学楼 E-201");
                    post(c, sample, "教学楼 E-201 · 试发演示",
                            preview - ClassModeReceiver.PREVIEW_DURATION, preview, now, "演示", density);
                    return preview;
                }
                boolean active = window.current != null;
                JSONObject event = active ? window.current : window.upcoming;
                if (event != null) {
                    long start = ClassWindow.start(event), end = ClassWindow.end(event);
                    String room = event.optString("room");
                    String phase = active ? "上课中" : "即将上课";
                    long phaseStart = active ? start : start - ClassModeReceiver.leadMinutes(c) * 60_000L;
                    long phaseEnd = active ? end : start;
                    long deadline = ClassWindow.cardDeadline(start, end, ClassModeReceiver.leadMinutes(c),
                            ClassModeReceiver.displayMode(c), ClassModeReceiver.displayMinutes(c));
                    if (deadline > now) {
                        post(c, event, phase + (room.isEmpty() ? "" : " · " + room),
                                phaseStart, phaseEnd, deadline, now, phase, ClassModeReceiver.density(c));
                        return Math.min(phaseEnd, deadline);
                    }
                }
            }
        } catch (Exception ignored) { }
        finish(c);
        return 0;
    }

    static void finish(Context c) {
        if (!supported()) return;
        stopHosting(c);
        cancel(c, ID);
    }

    private static void stopHosting(Context c) {
        if (VivoCourseCard.supportsDevice() || ColorOsCourseCard.supported())
            c.stopService(new Intent(c, CourseCardService.class));
        cancel(c, SERVICE_ID);
    }

    static void cancel(Context c, int id) {
        NotificationManager manager = manager(c);
        if (VivoCourseCard.supportsDevice()) manager.cancel(VivoCourseCard.TAG, id);
        manager.cancel(id);
    }

    private static void post(Context c, JSONObject event, String text, long start, long end, long now,
                             String phase, String density) {
        post(c,event,text,start,end,end,now,phase,density);
    }

    private static void post(Context c, JSONObject event, String text, long start, long end, long deadline,
                             long now, String phase, String density) {
        String title = event.optString("name"), left = CourseLabel.alias(event, density);
        String right = CourseLabel.room(event.optString("room"), density);
        boolean hosted = (VivoCourseCard.supportsDevice() && Build.VERSION.SDK_INT >= 34)
                || ColorOsCourseCard.supported();
        if (hosted && CourseCardService.request(c, title, text, left, right, start, end, deadline, phase)) {
            if (current(c, ID) != null) cancel(c, ID);
            return;
        }
        if (hosted) stopHosting(c);
        Notification notification = build(c, title, text, left, right, start, end, deadline, now, phase, ID);
        if (notification != null) manager(c).notify(ID, notification);
    }

    static Notification build(Context c, String title, String text, String left, String right, long start, long end,
                              long deadline, long now,
                              String phase, int notificationId) {
        ensureChannel(c);
        Intent open = new Intent(c, MainActivity.class).setAction(AgendaWidgetProvider.OPEN)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(c, ID, open, PendingIntent.FLAG_IMMUTABLE);
        boolean preview = "演示".equals(phase);
        PendingIntent close = PendingIntent.getBroadcast(c, ID, new Intent(c, ClassModeReceiver.class)
                .setAction(preview ? ClassModeReceiver.STOP_PREVIEW : ClassModeReceiver.STOP_LIVE),
                PendingIntent.FLAG_IMMUTABLE);
        int progress = (int) Math.min(100, Math.max(0, (now - start) * 100 / Math.max(1, end - start)));
        boolean vivo = VivoCourseCard.supportsDevice();
        boolean xiaomi = XiaomiCourseCard.supportsDevice();
        boolean colorOs = ColorOsCourseCard.supported();
        StatusBarNotification existing = current(c, notificationId);
        Bundle old = existing == null ? Bundle.EMPTY : existing.getNotification().extras;
        boolean update = old.containsKey(SEQUENCE) && now < old.getLong(DEADLINE)
                && phase.equals(old.getString(PHASE));
        int sequence = update ? old.getInt(SEQUENCE) + 1 : 0;
        long minutes = Math.max(1, (end - now + 59_999L) / 60_000L);
        String details = text + " · 还剩 " + minutes + " 分钟";
        String labels = left + "\n" + right;
        Bundle extras = vivo ? VivoCourseCard.payload(c, tap, update ? 1 : 0,
                title, details, left, right, progress, sequence)
                : xiaomi ? XiaomiCourseCard.payload(c, title, details, left, right, existing == null)
                : new Bundle();
        extras.putInt(SEQUENCE, sequence);
        extras.putLong(DEADLINE, deadline);
        extras.putString(PHASE, phase);
        extras.putString(LABELS, labels);
        if (xiaomi || (Build.VERSION.SDK_INT >= 36 && !vivo))
            extras.putBoolean(REQUEST_PROMOTION, true);
        // Resuming the app also reconciles alarms. Don't promote an unchanged card again.
        if (notificationId == ID && update && old.getLong(DEADLINE) == deadline
                && (colorOs || existing.getNotification().when == end)
                && labels.equals(old.getString(LABELS))
                && title.contentEquals(old.getCharSequence(Notification.EXTRA_TITLE, ""))
                && text.contentEquals(old.getCharSequence(Notification.EXTRA_TEXT, ""))) return null;
        Notification.Builder builder = new Notification.Builder(c, channelId())
                .setSmallIcon(R.drawable.ic_class_live).setContentTitle(title).setContentText(text)
                .setContentIntent(tap).setDeleteIntent(close)
                .addAction(new Notification.Action.Builder(
                        android.graphics.drawable.Icon.createWithResource(c, R.drawable.ic_class_live),
                        preview ? "结束演示" : "关闭课程上岛", close).build())
                .setCategory(Notification.CATEGORY_PROGRESS)
                .setOnlyAlertOnce(true).setOngoing(!vivo && !xiaomi).setColor(0xff205c42)
                .setVisibility(Notification.VISIBILITY_PRIVATE).setExtras(extras)
                .setTimeoutAfter(Math.max(1, deadline - now));
        if (colorOs) {
            builder.setStyle(new Notification.BigTextStyle().bigText(text)).setShowWhen(false)
                    .setShortCriticalText(CourseLabel.shortText(left + " " + right, 12));
        } else {
            builder.setWhen(end).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true);
        }
        if (Build.VERSION.SDK_INT >= 36 && !vivo && !colorOs) {
            builder.setShortCriticalText(CourseLabel.shortText(left + " " + right, 7)).setStyle(new Notification.ProgressStyle()
                    .addProgressSegment(new Notification.ProgressStyle.Segment(100)).setProgress(progress));
        } else if (!colorOs) {
            builder.setProgress(100, progress, false);
        }
        if (vivo || colorOs) builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        return builder.build();
    }

    static void ensureChannel(Context c) {
        NotificationManager notifications = manager(c);
        String id = channelId();
        if (notifications.getNotificationChannel(id) != null) return;
        boolean xiaomi = XIAOMI_CHANNEL.equals(id);
        int importance = xiaomi ? NotificationManager.IMPORTANCE_HIGH : NotificationManager.IMPORTANCE_DEFAULT;
        if (xiaomi) {
            NotificationChannel previous = notifications.getNotificationChannel(CHANNEL);
            if (previous != null && previous.hasUserSetImportance()) importance = previous.getImportance();
        }
        NotificationChannel channel = new NotificationChannel(id, "课程实时卡片", importance);
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.setShowBadge(false);
        notifications.createNotificationChannel(channel);
    }
}
