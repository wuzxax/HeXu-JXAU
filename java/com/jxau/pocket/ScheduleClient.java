package com.jxau.pocket;

import org.json.JSONArray;
import org.json.JSONObject;
import java.net.URI;
import java.net.URLEncoder;
import java.util.*;
import java.util.regex.*;

/** Teaching-office semester data first; portal supplies term/week and fallback. */
final class ScheduleClient {
    interface Transport {
        String request(String url, String method, String body, Map<String,String> headers) throws Exception;
        String location(String url) throws Exception;
        String ticket(String service) throws Exception;
    }
    private static final String JWGL = "https://jwgl.jxau.edu.cn";
    private static final String SSO = JWGL + "/User/CheckTicketFromSSo";
    private static final long TTL = 300000L;
    private final Transport transport;
    private final Map<Integer,JSONObject> weeks = new HashMap<>();
    private String owner = "", guid = "", term = "";
    private JSONObject anchor;
    private long anchorAt, semesterAt, failUntil;
    private JSONArray semester;
    ScheduleClient(Transport transport) { this.transport = transport; }

    synchronized void reset() {
        owner = ""; guid = ""; term = ""; anchor = null; semester = null;
        anchorAt = semesterAt = failUntil = 0; weeks.clear();
    }
    synchronized String week(int requested, boolean force, String account) throws Exception {
        if (requested < 0 || requested > 60) throw new IllegalArgumentException("周次应在 0 到 60 之间");
        if (account == null || account.isEmpty()) throw new Exception("请先登录");
        if (!owner.equals(account)) { reset(); owner = account; }
        long now = System.currentTimeMillis();
        JSONObject portalCurrent = null;
        // Current week is always re-anchored at least every five minutes. Never silently assume week 1.
        if (force || anchor == null || now - anchorAt >= TTL) {
            try {
                portalCurrent = portal(0);
                String nextTerm = termCode(portalCurrent);
                if (!nextTerm.equals(term)) { weeks.clear(); semester = null; guid = ""; failUntil = 0; }
                term = nextTerm; anchor = portalCurrent; anchorAt = now;
            } catch (Exception e) {
                // A recent known term/week can survive a short portal outage.
                if (anchor == null || now - anchorAt > 14L * 86400000L) {
                    JSONObject saved = weeks.get(requested);
                    if (saved != null) return output(saved, true, true, "连接失败，显示上次课表");
                    throw new Exception("无法确认学校当前学期和周次，请稍后刷新或重新登录");
                }
            }
        }
        int current = anchoredWeek(now);
        int week = requested == 0 ? current : requested;
        JSONObject cached = weeks.get(week);
        if (!force && cached != null && now - cached.optLong("fetchedAt") < TTL) {
            cached.put("currentWeek", current).put("anchorAt", now);
            return output(cached, true, false, "");
        }
        String warning = "";
        if (force || now >= failUntil) {
            try {
                boolean reused = !force && semester != null && now - semesterAt < TTL;
                if (!reused) { semester = fetchSemester(); semesterAt = System.currentTimeMillis(); weeks.clear(); }
                JSONObject data = expand(semester, week, anchor, term);
                data.put("currentWeek", current).put("anchorAt", now).put("fetchedAt", semesterAt);
                data.put("weekEstimated", portalCurrent == null && now - anchorAt >= TTL);
                weeks.put(week, data); failUntil = 0;
                return output(data, reused, false, "");
            } catch (Exception e) {
                failUntil = now + 60000L;
                warning = "教务暂不可用，已使用门户课表；单周调整课程可能缺失";
            }
        } else warning = "教务暂不可用，已使用门户课表；单周调整课程可能缺失";
        try {
            JSONObject data = requested == 0 && portalCurrent != null ? portalCurrent : portal(week);
            data.put("week", week).put("currentWeek", current).put("anchorAt", now).put("fetchedAt", now);
            data.put("warning", warning).put("source", "portal");
            weeks.put(week, data);
            return output(data, false, false, warning);
        } catch (Exception e) {
            if (cached != null) return output(cached, true, true, "联网读取失败，显示上次课表");
            throw new Exception("课表读取失败，请检查网络或重新登录");
        }
    }

    synchronized String scores(String account) throws Exception {
        if (account == null || account.isEmpty()) throw new Exception("请重新登录");
        if (!owner.equals(account)) { reset(); owner = account; }
        // The official endpoint returns all terms in one empty-body POST.
        for (int attempt = 0; attempt < 2; attempt++) {
            String g = session();
            Map<String,String> headers = new HashMap<>();
            headers.put("Referer", JWGL + "/SystemManage/PersonalScoreLookFor/PersonalScoreLookFor/" + g);
            headers.put("Origin", JWGL); headers.put("X-Requested-With", "XMLHttpRequest");
            String raw = transport.request(JWGL + "/SystemManage/CJManage/GetXsCjByXh/" + g, "POST", "", headers);
            try {
                JSONObject d = new JSONObject(raw);
                if (!d.optBoolean("Result") || !(d.opt("Data") instanceof JSONArray))
                    throw new Exception("Invalid score response");
                JSONArray data = d.getJSONArray("Data"), safe = new JSONArray();
                if (d.optInt("totalCount", data.length()) > data.length())
                    throw new Exception("Incomplete score response");
                String[] keys = {"Kcdm","Kcmc","Pscj","Kscj","Zpcj","Bkcj","Cxcj","Jgbj","Xs","Kclb","Kslb","Xq","Bz","Point"};
                for (int i = 0; i < data.length(); i++) {
                    JSONObject row = data.getJSONObject(i), clean = new JSONObject();
                    if (row.optString("Kcmc").trim().isEmpty()) throw new Exception("Missing course name");
                    for (String key : keys) {
                        Object value = row.opt(key);
                        if (value == null || value == JSONObject.NULL) continue;
                        if (!(value instanceof String || value instanceof Number || value instanceof Boolean))
                            throw new Exception("Invalid score field");
                        clean.put(key, value);
                    }
                    safe.put(clean);
                }
                return new JSONObject().put("ok",true).put("data",safe)
                        .put("totalCount",safe.length()).toString();
            } catch (Exception invalid) {
                if (raw.contains("评教") || raw.contains("PersonalEval") || raw.contains("PingJiao"))
                    throw new Exception("教务系统要求先完成评教，请在学校教务系统处理后重试");
                guid = ""; // Expired sessions may return HTML; refresh SSO exactly once.
                if (attempt == 1) throw new Exception("成绩读取失败，教务会话或返回数据无效，请稍后重试或重新登录");
            }
        }
        throw new Exception("成绩读取失败，请稍后重试");
    }

    private int anchoredWeek(long now) {
        Calendar a = Calendar.getInstance(TimeZone.getTimeZone("Asia/Shanghai"));
        a.setTimeInMillis(anchorAt); monday(a);
        Calendar b = Calendar.getInstance(TimeZone.getTimeZone("Asia/Shanghai"));
        b.setTimeInMillis(now); monday(b);
        return Math.max(1, anchor.optInt("week") + (int)Math.round((b.getTimeInMillis() - a.getTimeInMillis()) / 604800000.0));
    }
    private static void monday(Calendar c) {
        c.add(Calendar.DAY_OF_MONTH, -((c.get(Calendar.DAY_OF_WEEK) + 5) % 7));
        c.set(Calendar.HOUR_OF_DAY, 0); c.set(Calendar.MINUTE, 0); c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0);
    }
    private JSONObject portal(int week) throws Exception {
        String url = CasClient.PORTAL + "/api/uppcard/kbsz/queryAWeekSchedule?cardId=" + CasClient.CARD_ID
                + "&results=" + (week == 0 ? "" : week) + "&years=";
        JSONObject value = new JSONObject(transport.request(url, "GET", null,
                Collections.singletonMap("Referer", CasClient.PORTAL + "/")));
        JSONObject meta = value.optJSONObject("meta"), d = value.optJSONObject("data");
        if (meta == null || !meta.optBoolean("success") || d == null || d.optJSONArray("resultsJsonArr") == null)
            throw new Exception("门户未返回有效课表");
        int number = d.optInt("zs", 0);
        if (number < 1 || number > 60 || (week > 0 && number != week)) throw new Exception("门户周次与请求不符");
        JSONObject data = new JSONObject().put("week", number).put("weekcount", d.optInt("weekcount", 20))
                .put("xn", d.optString("xn")).put("xq", d.optString("xq"))
                .put("rows", d.getJSONArray("resultsJsonArr")).put("source", "portal");
        termCode(data);
        return data;
    }
    private static String termCode(JSONObject d) throws Exception {
        String year = d.optString("xn"), xq = d.optString("xq");
        if (!year.matches("\\d{4}(-\\d{4})?") || !xq.matches("[12]")) throw new Exception("学校学期信息无效");
        return year.substring(0, 4) + xq;
    }
    private String session() throws Exception {
        if (!guid.isEmpty()) return guid;
        String location = transport.location(SSO + "?ticket=" + URLEncoder.encode(transport.ticket(SSO), "UTF-8"));
        URI u = URI.create(SSO).resolve(location);
        if (!"https".equalsIgnoreCase(u.getScheme()) || !"jwgl.jxau.edu.cn".equalsIgnoreCase(u.getHost())
                || (u.getPort() != -1 && u.getPort() != 443)) throw new Exception("教务跳转地址无效");
        Matcher m = Pattern.compile("^/Main/Index/([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})/?$").matcher(u.getPath());
        if (!m.matches()) throw new Exception("教务会话标识无效");
        guid = m.group(1); return guid;
    }
    private JSONArray fetchSemester() throws Exception {
        // HTML 'login lost' and failed JSON trigger exactly one fresh SSO attempt.
        for (int attempt = 0; attempt < 2; attempt++) {
            String g = session();
            Map<String,String> headers = new HashMap<>();
            headers.put("Referer", JWGL + "/Main/Index/" + g); headers.put("Origin", JWGL);
            headers.put("X-Requested-With", "XMLHttpRequest");
            String raw = transport.request(JWGL + "/PaikeManage/KebiaoInfo/GetStudentKebiaoByXq/" + g,
                    "POST", "xq=" + term, headers);
            try {
                JSONObject d = new JSONObject(raw);
                if (!d.optBoolean("Result") || !(d.opt("Data") instanceof JSONArray)) throw new Exception("教务数据无效");
                JSONArray result = d.getJSONArray("Data");
                for (int i = 0; i < result.length(); i++) {
                    JSONObject row = result.getJSONObject(i);
                    if (!row.optString("XueQi", term).equals(term)) throw new Exception("教务返回其他学期");
                }
                return result; // An explicitly successful empty array is a valid no-class term.
            } catch (Exception e) {
                guid = "";
                if (attempt == 1) throw new Exception("教务会话或数据无效");
            }
        }
        throw new Exception("教务课表读取失败");
    }
    private static String output(JSONObject data, boolean cached, boolean stale, String warning) throws Exception {
        JSONObject copy = new JSONObject(data.toString());
        copy.put("cached", cached).put("stale", stale);
        if (!warning.isEmpty()) copy.put("warning", warning);
        return new JSONObject().put("ok", true).put("data", copy).toString();
    }

    static boolean weekMatch(String text, int week) {
        return weekSet(text).contains(week);
    }
    private static Set<Integer> weekSet(String text) {
        Set<Integer> out = new TreeSet<>();
        if (text == null || text.trim().isEmpty()) return out; // Unknown never means every week.
        for (String part : text.replace('，', ',').replace('、', ',').split(",")) {
            Matcher m = Pattern.compile("\\s*(?:第)?(\\d+)(?:\\s*[-~～—至]\\s*(\\d+))?\\s*(?:周)?\\s*(?:[（(]?([单双])(?:周)?[）)]?)?\\s*").matcher(part);
            if (!m.matches()) continue;
            int start, end;
            try { start = Integer.parseInt(m.group(1)); end = m.group(2) == null ? start : Integer.parseInt(m.group(2)); }
            catch (NumberFormatException e) { continue; }
            if (start < 1 || end > 60 || start > end) continue;
            for (int i = start; i <= end; i++) if (m.group(3) == null || ((i % 2 == 1) == "单".equals(m.group(3)))) out.add(i);
        }
        return out;
    }
    private static int day(JSONObject it) {
        String x = it.optString("XingQi");
        Matcher m = Pattern.compile("(?:星期|周)([一二三四五六日天])").matcher(x);
        if (m.find()) { int d = "一二三四五六日".indexOf(m.group(1)); return d < 0 ? 6 : d; }
        m = Pattern.compile("^([1-7])(?:\\D.*)?$").matcher(x);
        return m.matches() ? Integer.parseInt(m.group(1)) - 1 : -1;
    }
    private static int[] slots(JSONObject it) {
        Matcher m = Pattern.compile("(\\d{1,2})\\s*[-~～至]\\s*(\\d{1,2})\\s*节").matcher(it.optString("SjdText"));
        if (m.find()) {
            int a = Integer.parseInt(m.group(1)), b = Integer.parseInt(m.group(2));
            return a >= 1 && b <= 12 && a <= b ? new int[]{a - 1, b - 1} : null;
        }
        int s;
        try { s = Integer.parseInt(it.optString("Sjd", "0").trim()); }
        catch (NumberFormatException e) { return null; }
        return s >= 1 && s <= 6 ? new int[]{(s - 1) * 2, s * 2 - 1} : null;
    }
    private static String field(String text) { return text.replace(',', '，').replace('\n', ' '); }
    static JSONObject expand(JSONArray items, int week, JSONObject anchor, String term) throws Exception {
        JSONArray rows = new JSONArray();
        for (int day = 0; day < 7; day++) { JSONArray row = new JSONArray(); for (int s = 0; s < 12; s++) row.put(""); rows.put(row); }
        int records = 0, skipped = 0, max = anchor.optInt("weekcount", 20), conflicts = 0;
        for (int i = 0; i < items.length(); i++) {
            JSONObject it = items.getJSONObject(i);
            Set<Integer> weeks = weekSet(it.optString("SkZhou"));
            int day = day(it); int[] slots = slots(it);
            if (weeks.isEmpty() || day < 0 || slots == null || it.optString("KcMc").trim().isEmpty()) { skipped++; continue; }
            max = Math.max(max, Collections.max(weeks));
            if (!weeks.contains(week)) continue;
            String cell = field(it.optString("KcMc")) + "," + field(it.optString("Skdd")) + "," + field(it.optString("Jxb")) + "," + field(it.optString("Rkls"));
            JSONArray row = rows.getJSONArray(day);
            for (int s = slots[0]; s <= slots[1]; s++) {
                String old = row.optString(s);
                if (!old.isEmpty() && !old.equals(cell)) {
                    // Keep both courses in a collision instead of silently overwriting one.
                    String[] a = old.split(",", -1), b = cell.split(",", -1);
                    StringBuilder joined = new StringBuilder();
                    for (int j = 0; j < 4; j++) { if (j > 0) joined.append(','); joined.append(a[j].equals(b[j]) ? a[j] : a[j] + " / " + b[j]); }
                    row.put(s, joined.toString()); conflicts++;
                } else row.put(s, cell);
            }
            records++;
        }
        if (items.length() > 0 && skipped == items.length()) throw new Exception("教务课表字段格式无法识别");
        JSONObject data = new JSONObject().put("week", week).put("weekcount", max).put("xn", term.substring(0, 4))
                .put("xq", term.substring(4)).put("rows", rows).put("source", "jwgl").put("records", records)
                .put("skippedRecords", skipped).put("conflicts", conflicts);
        if (skipped > 0) data.put("warning", "部分教务课程格式无法识别，请与学校课表核对");
        return data;
    }
}
