package com.jxau.pocket;

/** Release switches. Keep the lighting implementation and saved data for future work. */
final class FeatureFlags {
    static final boolean LIGHTING_ENABLED = false;
    static boolean lightingPath(String path) {
        return path.startsWith("/api/lighting/") || path.startsWith("/api/wanxiao/");
    }
}
