package com.jxau.pocket;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;

/**
 * 智慧能源管理平台（空调/照明电费）客户端。
 * 仅使用用户在绑定页主动提供的本人账号。
 */
public class ElecClient {
    public static final String BASE = "http://jxnd.czrxdzonline.cn/wechat/wx";

    private static String get(String path) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(BASE + path).openConnection();
        conn.setInstanceFollowRedirects(false);
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(20000);
        conn.setRequestProperty("User-Agent", CasClient.UA);
        int code = conn.getResponseCode();
        if(code>=300&&code<400){conn.disconnect();throw new java.io.IOException("电费接口地址已变化，请稍后重试");}
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        try {
            InputStream is = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
            if (is != null) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
                is.close();
            }
        } catch (Exception ignored) {
        }
        conn.disconnect();
        return bos.toString("UTF-8");
    }

    /** 手机号 -> userId + 绑定房间 */
    public static String bind(String phone) throws Exception {
        JSONObject out = new JSONObject();
        String userJson = get("/getWechatUserByPass?phone=" + enc(phone) + "&password=x");
        if (userJson.trim().isEmpty()) {
            out.put("ok", false);
            out.put("msg", "这个手机号在平台里查不到。确认是不是绑定电费的那个号，或者先在公众号里重新绑定一次。");
            return out.toString();
        }
        JSONObject user = new JSONObject(userJson);
        int userId = user.optInt("id", 0);
        if (userId == 0) {
            out.put("ok", false);
            out.put("msg", "查不到用户 ID");
            return out.toString();
        }
        JSONArray rooms = new JSONArray();
        String roomJson = get("/findUserRoomList?userId=" + userId);
        if (!roomJson.trim().isEmpty()) {
            JSONArray arr = new JSONArray(roomJson);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject r = arr.getJSONObject(i);
                JSONObject o = new JSONObject();
                o.put("roomId", r.optString("roomId", ""));
                o.put("fullName", r.optString("fullName", ""));
                o.put("roomName", r.optString("roomName", ""));
                rooms.put(o);
            }
        }
        if (rooms.length() == 0) {
            out.put("ok", false);
            out.put("msg", "账号找到了，但还没绑定房间。请在公众号里点「用户 → 添加房间」绑定一次，再回来试。");
            return out.toString();
        }
        out.put("ok", true);
        out.put("userId", userId);
        out.put("userName", user.optString("userName", ""));
        out.put("rooms", rooms);
        return out.toString();
    }

    /** 余额 + 本月 + 近 6 个月 */
    public static String summary(String roomId, int userId) throws Exception {
        return summary(roomId, userId, 0);
    }

    public static String summary(String roomId, int userId, int costType) throws Exception {
        check(roomId, userId, costType);
        JSONObject out = new JSONObject();
        JSONObject left = new JSONObject(get(
                "/wechatData/getLeftValue?roomId=" + enc(roomId) + "&userId=" + userId));

        JSONObject m = new JSONObject();
        try {
            JSONObject month = new JSONObject(get(
                    "/wechatData/getMonthValue?roomId=" + enc(roomId) + "&userId=" + userId + "&costType=" + costType));
            JSONArray mo = month.optJSONArray("costObj");
            if (mo != null && mo.length() > 0) {
                JSONObject c = mo.getJSONObject(0);
                m.put("consume", c.optDouble("consumeTotal", 0));
                m.put("cost", c.optDouble("costTotal", 0));
                m.put("month", c.optString("costTime", ""));
            }
        } catch (Exception ignored) {}

        JSONArray six = new JSONArray();
        try {
            JSONObject s = new JSONObject(get(
                    "/wechatData/getSixMonthValue?roomId=" + enc(roomId) + "&userId=" + userId + "&costType=" + costType));
            JSONArray arr = s.optJSONArray("costObj");
            if (arr != null) six = arr;
        } catch (Exception ignored) {}

        out.put("ok", true);
        out.put("roomName", left.optString("roomName", ""));
        if (!left.has("userBalance")) throw new Exception("平台未返回余额，请核对房间或重新绑定");
        out.put("balance", left.getDouble("userBalance"));
        out.put("costType", costType);
        out.put("balanceScope", "房间总余额；计费类型仅影响用量统计，不代表独立照明余额");
        out.put("updatedAt", System.currentTimeMillis());
        out.put("baseBalance", left.optDouble("baseBalance", 0));
        out.put("capacity", left.optDouble("remainEletricCapacity", 0));
        out.put("payEnable", left.optInt("payEnable", 0));
        out.put("month", m);
        out.put("sixMonth", six);
        return out.toString();
    }

    /** 每日用电 */
    public static String daily(String roomId, int userId, String begin, String end) throws Exception {
        return daily(roomId, userId, begin, end, 0);
    }

    public static String daily(String roomId, int userId, String begin, String end, int costType) throws Exception {
        check(roomId, userId, costType);
        String json = get("/wechatData/getRoomUsedData?roomId=" + enc(roomId) + "&userId=" + userId
                + "&costType=" + costType + "&dataType=1&beginTime=" + enc(begin) + "&endTime=" + enc(end));
        JSONObject d = new JSONObject(json);
        JSONObject out = new JSONObject();
        out.put("ok", true);
        JSONArray arr = d.optJSONArray("costObj");
        out.put("list", arr != null ? arr : new JSONArray());
        return out.toString();
    }

    private static void check(String roomId, int userId, int costType) {
        if (roomId == null || roomId.trim().isEmpty() || userId <= 0)
            throw new IllegalArgumentException("请先绑定本人房间");
        if (costType < 0 || costType > 3) throw new IllegalArgumentException("计费类型应为0至3");
    }

    private static String enc(String s) throws Exception {
        return URLEncoder.encode(s, "UTF-8");
    }
}
