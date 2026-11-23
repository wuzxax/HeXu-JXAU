package com.jxau.pocket;

import android.app.Notification;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

/** Hosts active course cards on systems that use a foreground notification. */
public final class CourseCardService extends Service {
    private static final String DEADLINE = "deadline";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable expire = () -> stopSelf();
    private long activeUntil, activeStart, activeEnd;
    private String activeTitle, activeText, activePhase, activeLeft, activeRight;

    static boolean request(Context context, String title, String text, String left, String right,
                           long startAt, long endAt, long deadline, String phase) {
        Intent start = new Intent(context, CourseCardService.class)
                .putExtra(DEADLINE, deadline).putExtra("start", startAt).putExtra("end", endAt)
                .putExtra("title", title).putExtra("text", text).putExtra("phase", phase)
                .putExtra("left", left).putExtra("right", right);
        try {
            context.startForegroundService(start);
            return true;
        } catch (RuntimeException unavailable) {
            return false;
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int id) {
        long deadline = intent == null ? 0 : intent.getLongExtra(DEADLINE, 0);
        long now = System.currentTimeMillis();
        long start = intent == null ? now : intent.getLongExtra("start", now);
        long end = intent == null ? deadline : intent.getLongExtra("end", deadline);
        String title = intent == null ? null : intent.getStringExtra("title");
        String text = intent == null ? null : intent.getStringExtra("text");
        String phase = intent == null ? null : intent.getStringExtra("phase");
        String left = intent == null ? null : intent.getStringExtra("left");
        String right = intent == null ? null : intent.getStringExtra("right");
        if (deadline <= now || deadline - now > 86_400_000L || title == null || text == null
                || phase == null || left == null || right == null || !CourseLiveCard.ready(this)
                || !ClassModeReceiver.mayShowCard(this, phase, now)) {
            stopSelf(id);
            return START_NOT_STICKY;
        }
        if (deadline == activeUntil && start == activeStart && end == activeEnd
                && title.equals(activeTitle) && text.equals(activeText)
                && phase.equals(activePhase) && left.equals(activeLeft) && right.equals(activeRight)) return START_NOT_STICKY;
        Notification card = CourseLiveCard.build(this, title, text, left, right,
                start, end, deadline, now, phase, CourseLiveCard.SERVICE_ID);
        if (card == null) {
            stopSelf(id);
            return START_NOT_STICKY;
        }
        try {
            startForeground(CourseLiveCard.SERVICE_ID, card);
            activeUntil = deadline;
            activeStart = start;
            activeEnd = end;
            activeTitle = title;
            activeText = text;
            activePhase = phase;
            activeLeft = left;
            activeRight = right;
            handler.removeCallbacks(expire);
            handler.postDelayed(expire, deadline - now);
        } catch (RuntimeException unavailable) {
            stopSelf(id);
        }
        return START_NOT_STICKY;
    }

    @Override public void onDestroy() {
        handler.removeCallbacks(expire);
        if (activeUntil != 0) {
            stopForeground(STOP_FOREGROUND_REMOVE);
            CourseLiveCard.cancel(this, CourseLiveCard.SERVICE_ID);
        }
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
