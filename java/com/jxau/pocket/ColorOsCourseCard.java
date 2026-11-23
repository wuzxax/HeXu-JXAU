package com.jxau.pocket;

import android.os.Build;
import java.util.Locale;

/** ColorOS-family live alerts use the Android 16 promoted ongoing notification format. */
final class ColorOsCourseCard {
    static boolean isDevice() {
        return isBrand(Build.MANUFACTURER) || isBrand(Build.BRAND);
    }

    static boolean supported() {
        return Build.VERSION.SDK_INT >= 36 && isDevice();
    }

    private static boolean isBrand(String value) {
        switch (value.toLowerCase(Locale.ROOT)) {
            case "oppo":
            case "oneplus":
            case "realme":
            case "oplus":
                return true;
            default:
                return false;
        }
    }
}
