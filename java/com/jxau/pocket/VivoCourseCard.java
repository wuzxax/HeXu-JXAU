package com.jxau.pocket;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Bundle;
import java.util.ArrayList;
import java.util.Locale;

/** Local atomic notification format documented by vivo (developer document 896). */
final class VivoCourseCard {
    static final String TAG = "VIVO_SUPERX_TAG";
    private static final String ROOT = "notification.superx.";
    private static final String ISLAND = "island.superx.";
    private static final String BASE = ROOT + "baseInfos.";
    private static final String CAPSULE = ROOT + "capsule.";
    private static final String SHORT = ROOT + "shortInfos.";
    private static final String PROGRESS = ROOT + "infos.";
    private static final int BASIC_CARD = 4;
    private static final String SCENE = "METTING";

    static boolean supportsDevice() {
        String vendor = Build.MANUFACTURER.toLowerCase(Locale.ROOT);
        return "vivo".equals(vendor) || "iqoo".equals(vendor);
    }

    /** Doc 896's read-only check. An unavailable bridge is distinct from a closed scene. */
    static String sceneStatus(Context context) {
        if (!supportsDevice()) return "unsupported";
        try {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            Object enabled = NotificationManager.class
                    .getMethod("getSceneStatus", String.class, String.class)
                    .invoke(manager, context.getPackageName(), SCENE);
            if (Boolean.TRUE.equals(enabled)) return "enabled";
            if (Boolean.FALSE.equals(enabled)) return "disabled";
        } catch (ReflectiveOperationException | RuntimeException ignored) { }
        return "unknown";
    }

    static Bundle payload(Context context, PendingIntent open, int operation, String title,
                          String details, String leftLabel, String rightLabel, int progress, int sequence) {
        Icon icon = Icon.createWithResource(context, R.drawable.ic_class_live);
        Bundle body = new Bundle();
        body.putInt(ROOT + "operation", operation);
        // The published scene identifier for a scheduled meeting is spelled METTING.
        body.putString(ROOT + "scene", SCENE);
        body.putInt(ROOT + "changedRecord", sequence);
        body.putBoolean(ROOT + "showNotify", true);
        if (operation == 2) return body;

        body.putInt(ROOT + "template", 2); // Progress card in the notification center.
        body.putInt(ROOT + "displays", 0x10111); // AOD, status bar, lock screen, notification center.
        body.putBoolean(ROOT + "islandNotify", true);
        body.putBoolean(ROOT + "sound", false);
        body.putParcelable(ROOT + "clickResp", open);

        Bundle facts = new Bundle();
        facts.putParcelable(BASE + "icon", icon);
        facts.putCharSequence(BASE + "title", title);
        facts.putCharSequence(BASE + "content", details);
        facts.putInt(BASE + "subInfo", 5);
        facts.putInt(BASE + "subProgress", progress);
        facts.putInt(BASE + "progressState", 0);
        facts.putInt(BASE + "subProgressColor", 0xff8fcaab);
        Bundle summary = new Bundle(facts);
        summary.remove(BASE + "subInfo");
        summary.remove(BASE + "subProgress");
        summary.remove(BASE + "subProgressColor");
        body.putBundle(ROOT + "baseInfos", summary);

        ArrayList<Icon> nodes = new ArrayList<>();
        nodes.add(icon);
        nodes.add(Icon.createWithResource(context, android.R.drawable.checkbox_on_background));
        Bundle track = new Bundle();
        track.putParcelableArrayList(PROGRESS + "nodeIcon", nodes);
        track.putInt(PROGRESS + "progress", progress);
        body.putBundle(ROOT + "infos", track);

        Bundle mini = new Bundle();
        mini.putString(SHORT + "describeShort", rightLabel);
        mini.putString(SHORT + "coreInfoShort", title);
        mini.putParcelable(SHORT + "image", icon);
        mini.putParcelable(SHORT + "imageClickResp", open);
        body.putBundle(ROOT + "shortInfos", mini);

        Bundle capsule = new Bundle();
        capsule.putInt(CAPSULE + "state", 1);
        capsule.putParcelable(CAPSULE + "icon", icon);
        capsule.putString(CAPSULE + "content", leftLabel + " · " + rightLabel);
        capsule.putParcelable(CAPSULE + "clickResp", open);
        body.putBundle(ROOT + "capsule", capsule);

        Bundle island = new Bundle();
        island.putInt(ISLAND + "leftTemplate", 1);
        island.putInt(ISLAND + "rightTemplate", 4); // Text at the right edge instead of the progress animation.
        island.putInt(ISLAND + "islandClick", 0);
        island.putInt(ISLAND + "template", BASIC_CARD);
        island.putParcelable(ISLAND + "clickResp", open);
        island.putBundle(ISLAND + "baseInfos", new Bundle(facts));
        Bundle left = new Bundle();
        left.putParcelable(ISLAND + "leftInfo.icon", icon);
        left.putCharSequence(ISLAND + "leftInfo.content", leftLabel);
        island.putBundle(ISLAND + "leftInfo", left);
        Bundle right = new Bundle();
        right.putCharSequence(ISLAND + "rightInfo.content", rightLabel);
        island.putBundle(ISLAND + "rightInfo", right);
        body.putBundle(ROOT + "island", island);
        return body;
    }
}
