package com.jxau.pocket;

import org.json.JSONArray;
import org.json.JSONObject;

final class AppUpdate {
    private static final String REPOSITORY = "wuzxax/HeXu-JXAU";
    private static final String LATEST = "https://api.github.com/repos/" + REPOSITORY + "/releases/latest";

    private AppUpdate() {}

    static JSONObject fetch() throws Exception {
        String body = Http.call(LATEST, "GET", null, Http.headers(
                "Accept", "application/vnd.github+json", "User-Agent", "Hexu-Android-Update"), 5000, 7000);
        return readRelease(new JSONObject(body));
    }

    static JSONObject readRelease(JSONObject release) throws Exception {
        String tag = release.optString("tag_name");
        if (release.optBoolean("draft") || release.optBoolean("prerelease")
                || !tag.matches("v(?:0|[1-9][0-9]{0,5})(?:[.](?:0|[1-9][0-9]{0,5})){2}")) {
            throw new IllegalArgumentException("GitHub 正式版标签无效");
        }

        String version = tag.substring(1);
        String apk = "Hexu-" + tag + ".apk";
        String releaseUrl = "https://github.com/" + REPOSITORY + "/releases/";
        String download = releaseUrl + "download/" + tag + "/" + apk;
        JSONArray assets = release.optJSONArray("assets");
        boolean hasApk = false;
        for (int i = 0; assets != null && i < assets.length(); i++) {
            JSONObject asset = assets.optJSONObject(i);
            if (asset != null && apk.equals(asset.optString("name"))
                    && "uploaded".equals(asset.optString("state")) && asset.optLong("size") > 0
                    && download.equals(asset.optString("browser_download_url"))) {
                hasApk = true;
                break;
            }
        }

        String notes = release.isNull("body") ? "" : release.optString("body").trim();
        if (notes.length() > 6000) notes = notes.substring(0, 6000) + "…";
        return new JSONObject().put("ok", true).put("version", version)
                .put("releaseUrl", releaseUrl + "tag/" + tag)
                .put("downloadUrl", hasApk ? download : "")
                .put("notes", notes);
    }
}
