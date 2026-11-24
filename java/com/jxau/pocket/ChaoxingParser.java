package com.jxau.pocket;

import org.json.*;
import org.jsoup.Jsoup;
import org.jsoup.nodes.*;
import java.net.URI;
import java.net.URLDecoder;
import java.io.UnsupportedEncodingException;
import java.util.*;
import java.util.regex.*;

/** Parse only semantic homework rows; scripts/styles/other page divs are never tasks. */
public final class ChaoxingParser {
    /** Stable within a course/class even when signed URLs and answer ids change. */
    public static String identity(String url) {
        try {
            URI u=URI.create(url);Map<String,String> q=new HashMap<>();
            if(u.getRawQuery()!=null)for(String part:u.getRawQuery().split("&")){String[] kv=part.split("=",2);q.put(java.net.URLDecoder.decode(kv[0],"UTF-8").toLowerCase(Locale.ROOT),kv.length>1?java.net.URLDecoder.decode(kv[1],"UTF-8"):"");}
            String work=q.getOrDefault("workid",q.getOrDefault("workrelationid","")),course=q.getOrDefault("courseid",""),clazz=q.getOrDefault("classid",q.getOrDefault("clazzid",""));
            if(!work.isEmpty()&&!course.isEmpty()&&!clazz.isEmpty())return "course="+course+";class="+clazz+";work="+work;
        }catch(Exception ignored){}
        return "url:"+url;
    }
    public static boolean trusted(String value) {
        try { URI u=URI.create(value);String h=u.getHost();return "https".equalsIgnoreCase(u.getScheme())&&u.getUserInfo()==null&&(u.getPort()==-1||u.getPort()==443)&&h!=null&&(h.equals("chaoxing.com")||h.endsWith(".chaoxing.com")); }catch(Exception e){return false;}
    }
    static String resolve(String base, String raw) {
        if (raw == null || raw.trim().isEmpty()) return "";
        try {
            String url = URI.create(base).resolve(raw.trim()).toString();
            return trusted(url) ? url : "";
        } catch (IllegalArgumentException e) {
            return "";
        }
    }

    static Map<String,String> query(String url) {
        Map<String,String> values = new HashMap<>();
        String query = URI.create(url).getRawQuery();
        if (query == null) return values;
        try {
            for (String part : query.split("&")) {
                String[] fields = part.split("=", 2);
                String name = URLDecoder.decode(fields[0], "UTF-8").toLowerCase(Locale.ROOT);
                String value = fields.length == 2 ? URLDecoder.decode(fields[1], "UTF-8") : "";
                if (values.putIfAbsent(name, value) != null) throw new IllegalArgumentException("duplicate parameter");
            }
            return values;
        } catch (UnsupportedEncodingException impossible) {
            throw new AssertionError(impossible);
        }
    }

    static boolean sameCourse(Map<String,String> query, JSONObject course, boolean required) {
        return matches(query, "courseid", course.optString("courseId"), required)
                && matches(query, "classid", course.optString("classId"), required && !query.containsKey("clazzid"))
                && matches(query, "clazzid", course.optString("classId"), false)
                && (course.optString("cpi").isEmpty() || matches(query, "cpi", course.optString("cpi"), false));
    }

    private static boolean matches(Map<String,String> query, String field, String expected, boolean required) {
        String value = query.get(field);
        return value == null ? !required : value.equals(expected);
    }

    private static final Set<String> COURSE_ENTRY_PATHS = new HashSet<>(Arrays.asList(
            "/visit/stucoursemiddle", "/mooc-ans/visit/stucoursemiddle", "/mooc2-ans/visit/stucoursemiddle"));
    private static final Set<String> LIST_PATHS = new HashSet<>(Arrays.asList(
            "/mooc2/work/list", "/mooc-ans/mooc2/work/list", "/mooc2-ans/mooc2/work/list"));
    private static final Pattern WORK_PATH = Pattern.compile(
            "(?:/mooc-ans|/mooc2-ans)?(?:/mooc2)?/work/(?:task|view|dowork|prompt)");
    private static final Pattern LEGACY_TOKEN = Pattern.compile("[a-fA-F0-9]{32}");
    private static final Pattern COUNTDOWN = Pattern.compile("(?<!\\d)(\\d{1,7})\\s*(天|小时|分钟|分)");
    private static final String LIST_MARKER = ".bottomList, [aria-label=作业列表], #workList, .work-list";
    static boolean hasWorkList(Document page) { return page.selectFirst(LIST_MARKER) != null; }

    private static final Set<String> TODO = new HashSet<>(Arrays.asList(
            "未交","未提交","未开始","待互评","待提交","待完成","未完成","未作答"));
    private static final Set<String> DONE = new HashSet<>(Arrays.asList(
            "已完成","已提交","已交","待批阅","已批阅","已互评","待评阅","已作答"));

    static boolean workList(String url) {
        return trusted(url) && LIST_PATHS.contains(URI.create(url).getPath());
    }

    static String assignmentList(Document page, String landed, JSONObject course, long now) throws Exception {
        Map<String,String> pageQuery = query(landed);
        if (!sameCourse(pageQuery, course, false)) throw new Exception("课程页与所选课程不一致");
        String legacyList = "";
        for (Element entry : page.select("a[data-url], a[href], iframe[src]")) {
            for (String attr : Arrays.asList("data-url","href","src")) {
                String url = resolve(landed, entry.attr(attr));
                if (!workList(url)) continue;
                try {
                    Map<String,String> fields = query(url);
                    if (sameCourse(fields,course,true)) return url;
                    if (fields.isEmpty() && legacyList.isEmpty()) legacyList = url;
                } catch (IllegalArgumentException ignored) {
                    // Malformed and ambiguous URLs are not candidate entries.
                }
            }
        }
        String stu = pageQuery.getOrDefault("enc", "");
        if (!LEGACY_TOKEN.matcher(stu).matches()) stu = field(page, "enc");
        String work = field(page, "workEnc");
        String cpi = course.optString("cpi");
        if (cpi.isEmpty()) cpi = pageQuery.getOrDefault("cpi", "");
        if (!cpi.matches("[0-9]*")) return "";
        if (!LEGACY_TOKEN.matcher(stu).matches() || !LEGACY_TOKEN.matcher(work).matches()) return "";
        if (legacyList.isEmpty()) legacyList = "https://mooc1.chaoxing.com/mooc2/work/list";
        return legacyList + "?courseId=" + course.getString("courseId") + "&classId=" + course.getString("classId")
                + "&cpi=" + cpi + "&ut=s&t=" + now + "&stuenc=" + stu + "&enc=" + work;
    }

    static Map<String,String> catalogEntries(Document page, String landed) {
        Map<String,String> entries = new HashMap<>();
        for (Element row : page.select("li.course[courseid][clazzid]")) {
            String courseId = row.attr("courseid"), classId = row.attr("clazzid");
            for (Element link : row.select("a[href]")) {
                String url = resolve(landed, link.attr("href"));
                if (url.isEmpty() || !COURSE_ENTRY_PATHS.contains(URI.create(url).getPath())) continue;
                try {
                    Map<String,String> fields = query(url);
                    if (courseId.equals(fields.get("courseid"))
                            && (classId.equals(fields.get("clazzid")) || classId.equals(fields.get("classid")))) {
                        entries.putIfAbsent(courseId + ":" + classId, url);
                        break;
                    }
                } catch (IllegalArgumentException ignored) {
                    // Ignore malformed entries while retaining other courses in the catalog.
                }
            }
        }
        return entries;
    }

    private static String field(Document page, String name) {
        Element input = page.selectFirst("input#" + name + ",input[name=" + name + "]");
        return input == null ? "" : input.val().trim();
    }

    static final class WorkList {
        final JSONArray items;
        final boolean complete;
        WorkList(JSONArray items, boolean complete) { this.items = items; this.complete = complete; }
    }

    static final class UnrecognizedList extends Exception {
        UnrecognizedList(String message) { super(message); }
    }

    static WorkList works(Document doc, String base, JSONObject course, long now, boolean dedicated)
            throws Exception {
        if (!sameCourse(query(base), course, false)) throw new Exception("作业列表与所选课程不一致");
        Element list = doc.selectFirst(LIST_MARKER);
        if (list == null && dedicated && workList(base)) {
            list = doc.selectFirst("ul:has(> li[aria-label][data]), ul:has(> li[aria-label] a[href])");
        }
        if (list == null) throw new UnrecognizedList("作业列表结构未识别，已保留旧记录");
        JSONArray rows = new JSONArray();
        Set<String> seen = new HashSet<>();
        boolean incomplete = false;
        for (Element row : list.select("li")) {
            Element link = row.selectFirst("a[href]");
            String raw = row.attr("data");
            if (raw.isEmpty() && link != null) raw = link.attr("href");
            if (raw.isEmpty()) {
                if (row.hasAttr("aria-label") || row.selectFirst(".overHidden2,.work-title,.status") != null)
                    incomplete = true;
                continue;
            }
            String url = resolve(base, raw);
            try {
                if (url.isEmpty() || !WORK_PATH.matcher(URI.create(url).getPath()).matches()) {
                    incomplete = true;
                    continue;
                }
                Map<String,String> fields = query(url);
                if (!sameCourse(fields, course, true)
                        || fields.getOrDefault("workid", fields.getOrDefault("workrelationid", "")).isEmpty()) {
                    incomplete = true;
                    continue;
                }
            } catch (IllegalArgumentException e) {
                incomplete = true;
                continue;
            }
            String label = row.attr("aria-label").trim();
            int separator = Math.max(label.lastIndexOf(';'), label.lastIndexOf('；'));
            String title = text(row, "p.overHidden2,.work-title");
            if (title.isEmpty()) title = separator < 0 ? label : label.substring(0, separator).trim();
            if (title.isEmpty()) { incomplete = true; continue; }
            String status = text(row, ".status,.work-status");
            if (status.isEmpty()) status = separator < 0 ? "状态未知" : label.substring(separator + 1).trim();
            if (!seen.add(identity(url))) continue;
            String left = text(row, ".time");
            long minutes = 0;
            boolean countdown = false;
            if (left.contains("剩余") || left.contains("还剩")) {
                Matcher time = COUNTDOWN.matcher(left);
                while (time.find()) {
                    countdown = true;
                    minutes += Long.parseLong(time.group(1))
                            * ("天".equals(time.group(2)) ? 1440 : "小时".equals(time.group(2)) ? 60 : 1);
                }
            }
            rows.put(new JSONObject().put("kind","work").put("course",course.optString("title"))
                    .put("title",title).put("status",status)
                    .put("state",TODO.contains(status)?"todo":DONE.contains(status)?"done":"other")
                    .put("left",left).put("endAt",countdown?now+minutes*60000:JSONObject.NULL).put("url",url));
        }
        String listText = list.text().trim();
        boolean empty = listText.matches("(?:暂无|暂未有|还没有|没有|无)(?:任何)?作业[。！!]?")
                || (listText.isEmpty() && list.selectFirst("ul") != null)
                || doc.selectFirst("input[name=totalCount][value=0], input#totalCount[value=0]") != null;
        boolean paged = doc.selectFirst("a[rel=next], .pagination a[href], [data-has-more=true], input[name=hasMore][value=true]") != null;
        if (rows.length() == 0 && (!dedicated || incomplete || paged || !empty))
            throw new UnrecognizedList("未确认作业列表是否为空，已保留旧记录");
        // An embedded list may be only a preview of the full list.
        return new WorkList(rows, dedicated && !incomplete && !paged);
    }

    private static String text(Element row, String selector) {
        Element element = row.selectFirst(selector);
        return element == null ? "" : element.text().trim();
    }
}
