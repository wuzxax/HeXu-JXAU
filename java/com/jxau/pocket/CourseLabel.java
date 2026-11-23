package com.jxau.pocket;

import java.text.BreakIterator;
import java.util.Locale;
import org.json.JSONObject;

/** Fits two independently readable labels inside the status-bar chip. */
final class CourseLabel {
    static final String COMPACT = "compact";
    static final String STANDARD = "standard";
    static final String EXPANDED = "expanded";

    static String clean(String text, int max) {
        String value = text.replaceAll("[\\p{Cc}\\s\\u3000]+", " ").trim();
        BreakIterator breaks = BreakIterator.getCharacterInstance(Locale.ROOT);
        breaks.setText(value);
        int end = 0;
        for (int i = 0; i < max; i++) {
            int next = breaks.next();
            if (next == BreakIterator.DONE) return value;
            end = next;
        }
        return value.substring(0, end);
    }

    static boolean validDensity(String value) {
        return COMPACT.equals(value) || STANDARD.equals(value) || EXPANDED.equals(value);
    }

    static String alias(JSONObject event, String density) {
        String name = event.optString("name");
        String alias = clean(event.optString("alias"), 12);
        if (alias.isEmpty()) {
            if (name.startsWith("高等数学")) alias = "高数";
            else if (name.startsWith("大学英语")) alias = "大英";
            else if (name.startsWith("大学物理")) alias = "大物";
            else if (name.startsWith("大学体育")) alias = "体育";
            else if (name.startsWith("程序设计")) alias = "程序设计";
            else if (name.startsWith("形势与政策")) alias = "形策";
            else alias = name;
        }
        return shortText(alias, COMPACT.equals(density) ? 4 : EXPANDED.equals(density) ? 8 : 6);
    }

    static String room(String original, String density) {
        String room = clean(original, 40);
        if (room.isEmpty()) return "地点待定";
        if (!EXPANDED.equals(density)) {
            // Preserve the room code when the source includes a building name or a remark.
            room = room.replaceFirst("[，,；;\\n].*$", "").replaceFirst("教室$", "").trim();
            java.util.regex.Matcher code = java.util.regex.Pattern.compile(
                    "(?i)(?<![a-z0-9])([a-z]{1,3}[-－ ]?[0-9]{2,5}[a-z]?)(?![a-z0-9])").matcher(room);
            if (code.find()) room = code.group(1);
        }
        return shortText(room, COMPACT.equals(density) ? 5 : EXPANDED.equals(density) ? 10 : 7);
    }

    static String shortText(String value, int max) {
        String label = clean(value, max);
        return label.length() == clean(value, max + 1).length() ? label : clean(label, max - 1) + "…";
    }
}
