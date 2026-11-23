package com.jxau.pocket;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Bundle;
import java.util.Locale;
import org.json.JSONException;
import org.json.JSONObject;

/** Optional Focus notification metadata. Unrecognized metadata leaves the ordinary notification intact. */
final class XiaomiCourseCard {
    static boolean supportsDevice() {
        return Build.VERSION.SDK_INT >= 33 && (isBrand(Build.MANUFACTURER) || isBrand(Build.BRAND));
    }

    private static boolean isBrand(String value) {
        if (value == null) return false;
        switch (value.toLowerCase(Locale.ROOT)) {
            case "xiaomi": case "redmi": case "poco": case "blackshark": return true;
            default: return false;
        }
    }

    static Bundle payload(Context context, String title, String details, String left, String right,
                          boolean firstFloat) {
        Bundle extras = new Bundle();
        try {
            JSONObject icon = new JSONObject().put("type", 1).put("pic", "course");
            JSONObject capsule = new JSONObject()
                    .put("imageTextInfoLeft", new JSONObject().put("type", 1).put("picInfo", icon))
                    .put("imageTextInfoRight", new JSONObject().put("type", 3)
                            .put("textInfo", new JSONObject().put("title", left).put("content", right)));
            JSONObject focus = new JSONObject().put("ticker", left).put("tickerPic", "course")
                    .put("showSmallIcon", false).put("updatable", true).put("enableFloat", true)
                    .put("islandFirstFloat", firstFloat)
                    .put("baseInfo", new JSONObject().put("type", 2).put("title", title).put("content", details))
                    .put("iconTextInfo", new JSONObject().put("title", title).put("content", details)
                            .put("animIconInfo", new JSONObject().put("type", 0).put("src", "course")))
                    .put("picInfo", icon)
                    .put("param_island", new JSONObject().put("islandProperty", 2).put("bigIslandArea", capsule)
                            .put("smallIslandArea", new JSONObject().put("picInfo", icon)));
            Bundle pictures = new Bundle();
            Drawable drawable = context.getDrawable(R.drawable.ic_class_live);
            int size = Math.max(1, drawable.getIntrinsicWidth());
            Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            drawable.setBounds(0, 0, size, size);
            drawable.draw(new Canvas(bitmap));
            pictures.putParcelable("course", Icon.createWithBitmap(bitmap));
            extras.putString("miui.focus.param", new JSONObject().put("param_v2", focus).toString());
            extras.putBundle("miui.focus.pics", pictures);
        } catch (JSONException ignored) { }
        return extras;
    }
}
