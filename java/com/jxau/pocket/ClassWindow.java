package com.jxau.pocket;

import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Class intervals from the same resolved timetable as the home screen. */
final class ClassWindow {
    static final long LEAD = 600_000L;
    static final int MAX_DISPLAY_MINUTES = 120;
    JSONObject current, upcoming;
    long quietUntil, next;

    static ClassWindow at(JSONObject snapshot, long now, boolean live) throws Exception {
        return at(snapshot, now, live, LEAD);
    }

    static ClassWindow at(JSONObject snapshot, long now, boolean live, long lead) throws Exception {
        return at(snapshot, now, live, lead, false);
    }

    static ClassWindow at(JSONObject snapshot, long now, boolean live, long lead, boolean quietStudy) throws Exception {
        return at(snapshot, now, live, lead, true, quietStudy, false);
    }

    static ClassWindow at(JSONObject snapshot, long now, boolean live, long lead,
                          boolean quiet, boolean quietStudy, boolean quietCustom) throws Exception {
        String day = AgendaSnapshot.date(now);
        ClassWindow window = new ClassWindow();
        window.next = AgendaSnapshot.epoch(day, 1440);
        boolean cached = AgendaSnapshot.known(snapshot, day);
        List<long[]> periods = new ArrayList<>();
        for (JSONObject event : AgendaSnapshot.today(snapshot, now)) {
            boolean custom = event.optBoolean("custom");
            boolean school = !custom && cached;
            boolean customCourse = custom && event.optBoolean("liveCourse");
            boolean eveningStudy = custom && event.optBoolean("eveningStudy",
                    !customCourse && "晚自习".equals(event.optString("name")));
            boolean liveEvent = live && (school || customCourse);
            boolean quietEvent = quiet && (school || (quietStudy && eveningStudy)
                    || (quietCustom && customCourse && !eveningStudy));
            if (!liveEvent && !quietEvent) continue;
            long start = start(event), end = end(event);
            if (end <= now) continue;
            if (quietEvent) periods.add(new long[]{start, end});
            if (liveEvent && start <= now && window.current == null) window.current = event;
            if (liveEvent && start > now && start - now <= lead && window.upcoming == null) window.upcoming = event;
            if (start > now) window.next = Math.min(window.next, start);
            window.next = Math.min(window.next, end);
            if (liveEvent && start - lead > now) window.next = Math.min(window.next, start - lead);
        }
        periods.sort(Comparator.comparingLong(period -> period[0]));
        for (long[] period : periods) {
            if (period[0] <= Math.max(now, window.quietUntil))
                window.quietUntil = Math.max(window.quietUntil, period[1]);
        }
        return window;
    }

    static long start(JSONObject event) throws Exception {
        return AgendaSnapshot.epoch(event.getString("day"), event.getInt("start"));
    }

    static long end(JSONObject event) throws Exception {
        return AgendaSnapshot.epoch(event.getString("day"), event.getInt("end"));
    }

    static int wholeDisplayMinutes(int seconds) {
        return (Math.max(1, Math.min(seconds, MAX_DISPLAY_MINUTES * 60)) + 59) / 60;
    }

    static long cardDeadline(long courseStart, long courseEnd, int leadMinutes, String mode, int displayMinutes) throws Exception {
        if ("start".equals(mode)) return courseStart;
        if ("custom".equals(mode)) {
            long firstDisplay = Math.max(AgendaSnapshot.epoch(AgendaSnapshot.date(courseStart), 0),
                    courseStart - leadMinutes * 60_000L);
            return Math.min(courseEnd, firstDisplay + displayMinutes * 60_000L);
        }
        return courseEnd;
    }
}
