package com.jxau.pocket;

/** Layout dimensions in dp, independent of the launcher and the active device. */
final class WaterWidgetLayout {
    final int width, height, padding, buttonHeight;
    final int headerHeight, titleHeight, titleTextSize, detailHeight, pageHeight;
    final boolean showDetail, showBrand;

    private WaterWidgetLayout(int hostWidth, int hostHeight, boolean stacked) {
        // StackView adds extra perspective spacing when children are smaller than its slot.
        // Android also pads its own StackFrame by 4dp on each side.
        width = stacked ? Math.max(1, Math.round(hostWidth * .9f) - 8) : hostWidth;
        height = stacked ? Math.max(1, Math.round(hostHeight * .9f) - 8) : hostHeight;
        boolean tight = height < 98;
        boolean compact = height < 123 || width < 118;
        padding = tight ? 4 : compact ? 7 : height < 180 ? 8 : 13;
        headerHeight = tight ? 16 : compact ? 18 : 22;
        titleHeight = tight ? 18 : compact ? 21 : height < 180 ? 27 : 34;
        titleTextSize = tight ? 14 : compact ? 16 : height < 180 ? 21 : 25;
        buttonHeight = tight ? 27 : compact ? 29 : height < 180 ? 32 : 42;
        detailHeight = compact ? 13 : 14;
        pageHeight = stacked ? (tight ? 10 : compact ? 12 : 14) : 0;
        showDetail = height >= 2 * padding + headerHeight + titleHeight + buttonHeight + detailHeight + pageHeight;
        showBrand = width >= 103;
    }

    static WaterWidgetLayout measure(int width, int height, boolean stacked) {
        return new WaterWidgetLayout(fallback(width, 0), fallback(height, 0), stacked);
    }

    int minimumSlotWidth(boolean stacked, boolean vivo) {
        // OriginOS reports the widget's inset width. Its native stack can measure
        // more space than this value, so ask it to fill the available span.
        if (!stacked) return width;
        return vivo ? Math.round(width / .9f) + 48 : width + 12;
    }

    static float[] closestSize(float[][] candidates, int hintWidth, int hintHeight, boolean landscape) {
        float[] best = null;
        double bestScore = Double.POSITIVE_INFINITY;
        boolean hasHint = hintWidth > 0 && hintHeight > 0;
        for (float[] candidate : candidates) {
            float w = candidate[0], h = candidate[1];
            if (!(w > 0 && h > 0) || !Float.isFinite(w) || !Float.isFinite(h)) continue;
            double score = hasHint ? Math.abs((double) w - hintWidth) + Math.abs((double) h - hintHeight)
                    : ((w > h) == landscape ? 0 : 1);
            if (best == null || score < bestScore || (score == bestScore && w * h < best[0] * best[1])) {
                best = candidate;
                bestScore = score;
            }
        }
        return best;
    }

    static int fallback(int min, int max) {
        return min > 0 ? min : max > 0 ? max : 140;
    }
}
