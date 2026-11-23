package com.jxau.pocket;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 图书馆系统（超星 libsp）客户端。
 * 认证：CAS TGT -> ST -> 超星统一认证 -> libsp session。
 */
public class LibraryClient {
    public static final String LIB = "https://findjxau.libsp.cn";
    public static final String AUTH = "https://unified-auth.chaoxing.com";
    public static final String CAS = "https://cas.jxau.edu.cn";
    public static final String UA = CasClient.UA;

    private final String tgt;
    private final String cookie;

    public LibraryClient(String tgt, String cookie) {
        this.tgt = tgt;
        this.cookie = cookie == null ? "" : cookie;
    }

    // ---------------- 基础请求 ----------------
    private String request(String url, String method, byte[] body, String ctype,
                           String referer, StringBuilder setCookies, boolean follow) throws Exception {
        return request(url,method,body,ctype,referer,setCookies,follow,0);
    }
    private String request(String url,String method,byte[] body,String ctype,String referer,StringBuilder setCookies,boolean follow,int depth)throws Exception{
        URL target=new URL(url);
        if(!"https".equals(target.getProtocol())||target.getUserInfo()!=null||!(target.getPort()==-1||target.getPort()==443)||!("cas.jxau.edu.cn".equals(target.getHost())||"findjxau.libsp.cn".equals(target.getHost())||"unified-auth.chaoxing.com".equals(target.getHost())))throw new java.io.IOException("已阻止不受信任的图书馆接口");
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setInstanceFollowRedirects(false);
        conn.setRequestMethod(method);
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(20000);
        conn.setInstanceFollowRedirects(false);
        conn.setRequestProperty("User-Agent", UA);
        conn.setRequestProperty("Accept", "application/json, text/plain, */*");
        if (url.startsWith(LIB + "/")) {
            conn.setRequestProperty("Origin", LIB);
            conn.setRequestProperty("Referer", LIB + "/");
            conn.setRequestProperty("groupCode", "200446");
            conn.setRequestProperty("x-lang", "CHI");
            conn.setRequestProperty("content-language", "zh_CN");
            if (!cookie.isEmpty()) conn.setRequestProperty("Cookie", cookie);
            Matcher token = Pattern.compile("(?:^|;\\s*)jwt=([^;]+)").matcher(cookie);
            if (token.find()) conn.setRequestProperty("jwtOpacAuth", token.group(1));
        }
        if (ctype != null) conn.setRequestProperty("Content-Type", ctype);
        if (referer != null) conn.setRequestProperty("Referer", referer);
        if (body != null) {
            conn.setDoOutput(true);
            OutputStream os = conn.getOutputStream();
            os.write(body);
            os.flush();
        }
        int code = conn.getResponseCode();
        InputStream is = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        if (is != null) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) > 0) {if(bos.size()+n>4*1024*1024)throw new java.io.IOException("响应超过大小限制");bos.write(buf, 0, n);}
            is.close();
        }
        java.util.List<String> sc = conn.getHeaderFields().get("Set-Cookie");
        if (sc != null && setCookies != null) {
            for (String s : sc) {
                String kv = s.split(";", 2)[0].trim();
                if (!kv.isEmpty()) setCookies.append(kv).append("; ");
            }
        }
        String location = conn.getHeaderField("Location");
        conn.disconnect();
        if(code>=300&&code<400&&location!=null){
            URL next=new URL(target,location);
            if(!"https".equals(next.getProtocol())||next.getUserInfo()!=null)throw new java.io.IOException("图书馆接口跳转异常");
            if(follow){
                if(depth>=5||!"GET".equals(method)||!target.getAuthority().equals(next.getAuthority()))throw new java.io.IOException("图书馆接口跳转异常，请稍后重试");
                return request(next.toString(),"GET",null,null,referer,setCookies,true,depth+1);
            }
            return "REDIRECT:"+next.toString();
        }
        return bos.toString("UTF-8");
    }

    private String request(String url, String method, byte[] body, String ctype,
                           String referer, StringBuilder setCookies) throws Exception {
        return request(url, method, body, ctype, referer, setCookies, true);
    }

    /** SSO 结果：cookie 串 + jwt（用于搜索接口的 jwtOpacAuth 头） */
    public static class Session {
        public String cookie = "";
        public String jwt = "";
    }

    /** Obtain the load balancer route cookie once for the authenticated session. */
    public static String initializeRoute(String cookie) throws Exception {
        StringBuilder cookies = new StringBuilder(cookie == null ? "" : cookie);
        if (!cookies.toString().endsWith("; ")) cookies.append("; ");
        new LibraryClient(null, cookie).request(LIB + "/", "GET", null, null, LIB + "/", cookies, false);
        return cookies.toString();
    }

    /** 完成 SSO，返回 libsp 的 cookie 与 jwt */
    public static Session sso(String tgt) throws Exception {
        return sso(tgt, true);
    }

    private static Session sso(String tgt, boolean retryAuth) throws Exception {
        StringBuilder ck = new StringBuilder();
        Session sess = new Session();

        // 1. TGT -> ST
        String service = AUTH + "/login_auth/cas/jxau/index";
        String resp = new LibraryClient(tgt, "").request(
                CAS + "/cas/v1/tickets/" + tgt, "POST",
                ("service=" + URLEncoder.encode(service, "UTF-8")).getBytes(StandardCharsets.UTF_8),
                "application/x-www-form-urlencoded;charset=UTF-8", null, ck);
        String st = resp.trim();
        if (!st.startsWith("ST-")) throw new SessionExpiredException("校园登录已失效，请重新登录后使用图书馆");

        // 2. 超星 index
        String html = new LibraryClient(tgt, ck.toString()).request(
                AUTH + "/login_auth/cas/jxau/index?ticket=" + st, "GET", null, null, null, ck);
        String data = grab(html, "data");
        String time = grab(html, "time");
        String enc = grab(html, "enc");
        if (data.isEmpty() || enc.isEmpty()) {
            // CAS occasionally returns a login redirect instead of the authentication
            // form. Obtain a fresh, single-use service ticket once; never replay a loan action.
            if (retryAuth && html.contains(CAS + "/cas/login")) return sso(tgt, false);
            throw new Exception("图书馆认证暂未完成，请稍后刷新重试");
        }

        // 3. 超星 login
        String q = "data=" + URLEncoder.encode(data, "UTF-8")
                + "&time=" + time
                + "&enc=" + URLEncoder.encode(enc, "UTF-8")
                + "&displayName=&userRole=3&group1=&mobilePhone=&gender=&userid=";
        String login = new LibraryClient(tgt, ck.toString()).request(
                AUTH + "/login_auth/cas/jxau/login?" + q, "GET", null, null, null, ck);
        if (!login.contains("\"status\":true") && !login.contains("\"status\": true")) {
            throw new Exception("图书馆认证暂未完成，请稍后刷新重试");
        }

        // 4. 跳回 libsp，手动跟随并捕获 jwt
        String cur = LIB + "/find/sso/login/jxau/0?pageType=0&navigation=1"
                + "&data=" + URLEncoder.encode(data, "UTF-8")
                + "&time=" + time
                + "&enc=" + URLEncoder.encode(enc, "UTF-8");
        for (int i = 0; i < 6 && cur != null; i++) {
            String r = new LibraryClient(tgt, ck.toString()).request(cur, "GET", null, null, null, ck, false);
            if (r.startsWith("REDIRECT:")) {
                cur = r.substring("REDIRECT:".length());
                Matcher m = Pattern.compile("jwt=([^&#]+)").matcher(cur);
                if (m.find()) sess.jwt = m.group(1);
            } else {
                break;
            }
        }
        sess.cookie = ck.toString();
        // 超星接口还认这两个 cookie，缺了会 401「请登录」
        if (sess.jwt != null && !sess.jwt.isEmpty()) {
            sess.cookie += "; jwt=" + sess.jwt + "; jwtHeader=jwtOpacAuth";
        }
        return sess;
    }

    private static String grab(String html, String name) {
        Matcher m = Pattern.compile("var\\s+" + name + "\\s*=\\s*[\"']([^\"']*)").matcher(html);
        return m.find() ? m.group(1) : "";
    }

    // ---------------- 业务接口 ----------------
    public static String info(String cookie) throws Exception {
        String r = new LibraryClient(null, cookie).request(
                LIB + "/find/userInfo/getUserInfo", "GET", null, null, LIB + "/", null);
        JSONObject d = new JSONObject(r);
        checkResult(d);
        JSONObject user = d.getJSONObject("data").getJSONObject("user");
        int uid = user.optInt("userId", user.optInt("id", 0));
        JSONObject out = new JSONObject();
        out.put("ok", true);
        out.put("userId", uid);
        out.put("name", user.optString("name", user.optString("realName", "")));
        out.put("num", user.optString("num", ""));
        try {
            if(uid<=0)throw new Exception("未返回有效读者ID");
            String mr = new LibraryClient(null, cookie).request(
                    LIB + "/find/account/getTotalMoney?userId=" + uid, "GET", null, null, LIB + "/", null);
            JSONObject amount = new JSONObject(mr);
            checkResult(amount);
            if (!amount.has("data") || amount.isNull("data")) throw new Exception("未返回欠款金额");
            out.put("money", amount.getDouble("data"));
        } catch (Exception e) {
            if(e instanceof SessionExpiredException)throw e;
            out.put("money", JSONObject.NULL);
            out.put("moneyError", "暂时无法读取欠款");
        }
        return out.toString();
    }

    public static String money(int userId) throws Exception {
        String r = new LibraryClient(null, "").request(
                LIB + "/find/account/getTotalMoney?userId=" + userId, "GET", null, null, LIB + "/", null);
        JSONObject d = new JSONObject(r);
        JSONObject out = new JSONObject();
        out.put("ok", true);
        out.put("money", d.optDouble("data", 0));
        return out.toString();
    }

    public static String borrow(String cookie, int page, int rows) throws Exception {
        return loanPage(cookie, "", page, rows, false);
    }

    public static String history(String cookie, String jwt, int page, int rows) throws Exception {
        return loanPage(cookie, jwt, page, rows, true);
    }

    private static String loanPage(String cookie, String jwt, int page, int rows, boolean history) throws Exception {
        JSONObject body = new JSONObject();
        body.put("page", page);
        body.put("rows", rows);
        body.put("searchType", 1);
        body.put("searchContent", "");
        body.put("sortType", 0);
        body.put("startDate", JSONObject.NULL);
        body.put("endDate", JSONObject.NULL);
        String r = postJson(LIB + (history ? "/find/loanInfo/loanHistoryList" : "/find/loanInfo/loanList"), body, cookie, jwt.isEmpty() ? jwtFromCookie(cookie) : jwt);
        JSONObject d = new JSONObject(r);
        checkResult(d);
        JSONObject data = d.getJSONObject("data");
        JSONArray arr = data.optJSONArray("searchResult");
        JSONObject out = new JSONObject();
        out.put("ok", true);
        out.put("total", data.optInt("numFound", 0));   // numFound 才是实际借阅数，loanNum 是上限
        JSONArray list = new JSONArray();
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                JSONObject b = arr.getJSONObject(i);
                JSONObject o = new JSONObject();
                o.put("title", b.optString("title", ""));
                o.put("author", b.optString("author", ""));
                o.put("publisher", b.optString("publisher", ""));
                o.put("loanDate", b.optString("loanDate", ""));
                o.put("dueDate", b.optString("normReturnDate", ""));
                o.put("returnDate", b.optString("returnDate", b.optString("realReturnDate", "")));
                o.put("location", b.optString("locationName", ""));
                o.put("loanId", b.opt("loanId") != null ? b.opt("loanId") : b.opt("id"));
                list.put(o);
            }
        }
        out.put("list", list);
        out.put("page", page);
        out.put("pageSize", rows);
        return out.toString();
    }

    private static String jwtFromCookie(String cookie) {
        Matcher token = Pattern.compile("(?:^|;\\s*)jwt=([^;]+)").matcher(cookie == null ? "" : cookie);
        return token.find() ? token.group(1) : "";
    }

    public static final class SessionExpiredException extends Exception {
        public SessionExpiredException(String message){super(message);}
    }
    /** Validate the upstream session without returning reader identity. */
    public static void validateSession(String cookie)throws Exception{
        String raw=new LibraryClient(null,cookie).request(LIB+"/find/userInfo/getUserInfo","GET",null,null,LIB+"/",null);
        JSONObject result=new JSONObject(raw);checkResult(result);
        if(result.optJSONObject("data")==null||result.getJSONObject("data").optJSONObject("user")==null)throw new Exception("图书馆未返回读者信息，请稍后重试");
    }
    private static void checkResult(JSONObject result) throws Exception {
        String err=result.optString("errCode"),authCode=result.optString("code"),status=result.optString("status");
        if("401".equals(err)||"403".equals(err)||"401".equals(authCode)||"403".equals(authCode)||"401".equals(status)||"403".equals(status))throw new SessionExpiredException("图书馆登录已失效，请重新登录");
        if(result.opt("status") instanceof Number&&result.optInt("status")>=400)throw new Exception("图书馆服务暂不可用，请稍后重试（HTTP "+status+"）");
        // Jiangxi libsp live responses use errCode=200 for success; some endpoints use 0.
        if (result.has("errCode") && result.optInt("errCode", -1) != 0 && result.optInt("errCode", -1) != 200)
            throw new Exception(result.optString("message", result.optString("msg", "图书馆请求失败"))+"（errCode="+result.optString("errCode")+"）");
        if (result.has("success") && !result.optBoolean("success") || result.has("status") && Boolean.FALSE.equals(result.opt("status")))
            throw new Exception(result.optString("message", result.optString("msg", "图书馆请求失败")));
        if (result.has("code")) {
            String code = result.optString("code");
            if (!("0".equals(code) || "200".equals(code) || "true".equals(code)))
                throw new Exception(result.optString("message", result.optString("msg", "图书馆请求失败")));
        }
    }

    public static String readerData(String cookie, String jwt, String kind) throws Exception {
        String path;
        if ("rules".equals(kind)) path = "/find/userInfo/UserLoanRules";
        else if ("chart".equals(kind)) path = "/find/loanInfo/loanChart";
        else throw new IllegalArgumentException("未知借阅查询");
        JSONObject result = new JSONObject(postJson(LIB + path, new JSONObject(), cookie, jwt));
        checkResult(result);
        if (!result.has("data")) throw new Exception("图书馆未返回数据");
        return new JSONObject().put("ok", true).put("data", result.get("data")).toString();
    }

    public static String renew(String cookie, String jwt, JSONArray ids) throws Exception {
        if (ids == null || ids.length() < 1 || ids.length() > 20) throw new IllegalArgumentException("请选择1至20条借阅记录");
        for(int i=0;i<ids.length();i++) if(ids.isNull(i) || ids.optString(i).isEmpty()) throw new IllegalArgumentException("缺少借阅ID");
        JSONObject result = new JSONObject(postJson(LIB + "/find/lendbook/reNew", new JSONObject().put("loanIds", ids), cookie, jwt));
        checkResult(result);
        // Preserve the entire upstream business result: a HTTP 200 may still reject renewal.
        return new JSONObject().put("ok", true).put("data", result.opt("data"))
                .put("msg", result.optString("message", result.optString("msg", "请求已提交，请刷新核对到期日")))
                .put("upstream", result).toString();
    }

    public static String search(String cookie, String jwt, String keyword, int page, int rows) throws Exception {
        return search(cookie, jwt, keyword, page, rows, null);
    }

    public static String search(String cookie, String jwt, String keyword, int page, int rows, String discode) throws Exception {
        JSONObject body = new JSONObject();
        body.put("docCode", new JSONArray().put(JSONObject.NULL));
        body.put("litCode", new JSONArray());
        body.put("searchFieldContent", keyword);
        body.put("searchField", "title");
        body.put("matchMode", "2");
        String[] emptyArr = {"resourceType", "subject", "publisher", "libCode", "locationId",
                "eCollectionIds", "neweCollectionIds", "curLocationId", "campusId", "kindNo", "collectionName",
                "author", "langCode", "countryCode", "coreInclude", "ddType", "verifyStatus", "group",
                "newCoreInclude", "customSub", "customSub0"};
        for (String k : emptyArr) body.put(k, new JSONArray());
        if (discode != null && !discode.isEmpty()) body.put("discode1", new JSONArray().put(discode));
        else body.put("discode1", new JSONArray());
        body.put("publishBegin", JSONObject.NULL);
        body.put("publishEnd", JSONObject.NULL);
        body.put("sortField", "relevance");
        body.put("sortClause", "asc");
        body.put("page", page);
        body.put("rows", rows);
        body.put("onlyOnShelf", JSONObject.NULL);
        body.put("searchItems", JSONObject.NULL);
        body.put("indexSearch", 1);

        HttpURLConnection conn = (HttpURLConnection) new URL(LIB + "/find/unify/search").openConnection();
        conn.setInstanceFollowRedirects(false);
        conn.setRequestMethod("POST");
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(20000);
        conn.setDoOutput(true);
        conn.setRequestProperty("User-Agent", UA);
        conn.setRequestProperty("Content-Type", "application/json;charset=UTF-8");
        conn.setRequestProperty("Accept", "application/json, text/plain, */*");
        conn.setRequestProperty("Origin", LIB);
        conn.setRequestProperty("Referer", LIB + "/");
        conn.setRequestProperty("jwtOpacAuth", jwt == null ? "" : jwt);
        conn.setRequestProperty("groupCode", "200446");
        conn.setRequestProperty("x-lang", "CHI");
        conn.setRequestProperty("content-language", "zh_CN");
        if (cookie != null && !cookie.isEmpty()) conn.setRequestProperty("Cookie", cookie);
        conn.getOutputStream().write(body.toString().getBytes(StandardCharsets.UTF_8));
        int code = conn.getResponseCode();
        InputStream is2 = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
        ByteArrayOutputStream bos2 = new ByteArrayOutputStream();
        if (is2 != null) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = is2.read(buf)) > 0) bos2.write(buf, 0, n);
            is2.close();
        }
        conn.disconnect();
        String r = bos2.toString("UTF-8");
        JSONObject d = new JSONObject(r);
        JSONObject data = d.getJSONObject("data");
        JSONObject out = new JSONObject();
        out.put("ok", true);
        out.put("total", data.optInt("numFound", 0));
        JSONArray arr = data.optJSONArray("searchResult");
        JSONArray list = new JSONArray();
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                JSONObject b = arr.getJSONObject(i);
                JSONObject o = new JSONObject();
                o.put("title", b.optString("title", ""));
                o.put("author", b.optString("author", ""));
                o.put("publisher", b.optString("publisher", ""));
                o.put("year", b.optString("publishYear", ""));
                o.put("recordId", b.optString("recordId", ""));
                o.put("isbn", b.optString("isbn", ""));
                o.put("abstract", b.optString("adstract", ""));
                o.put("count", b.optInt("physicalCount", 0));
                list.put(o);
            }
        }
        out.put("list", list);
        return out.toString();
    }

    /** 馆藏明细：每本书在哪个馆藏地、什么状态 */
    public static String detail(String cookie, String jwt, String recordId) throws Exception {
        JSONObject body = new JSONObject();
        body.put("page", 1);
        body.put("rows", 50);
        body.put("entrance", JSONObject.NULL);
        body.put("recordId", recordId);
        body.put("isUnify", true);
        body.put("sortType", 0);
        body.put("callNo", "");

        HttpURLConnection conn = (HttpURLConnection) new URL(LIB + "/find/physical/groupitems").openConnection();
        conn.setInstanceFollowRedirects(false);
        conn.setRequestMethod("POST");
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(20000);
        conn.setDoOutput(true);
        conn.setRequestProperty("User-Agent", UA);
        conn.setRequestProperty("Content-Type", "application/json;charset=UTF-8");
        conn.setRequestProperty("Accept", "application/json, text/plain, */*");
        conn.setRequestProperty("Origin", LIB);
        conn.setRequestProperty("Referer", LIB + "/");
        conn.setRequestProperty("jwtOpacAuth", jwt == null ? "" : jwt);
        conn.setRequestProperty("groupCode", "200446");
        conn.setRequestProperty("x-lang", "CHI");
        conn.setRequestProperty("content-language", "zh_CN");
        if (cookie != null && !cookie.isEmpty()) conn.setRequestProperty("Cookie", cookie);
        conn.getOutputStream().write(body.toString().getBytes(StandardCharsets.UTF_8));
        int code = conn.getResponseCode();
        InputStream is = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        if (is != null) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) > 0) {if(bos.size()+n>4*1024*1024)throw new java.io.IOException("响应超过大小限制");bos.write(buf, 0, n);}
            is.close();
        }
        conn.disconnect();
        JSONObject d = new JSONObject(bos.toString("UTF-8"));
        JSONObject data = d.optJSONObject("data");
        JSONObject out = new JSONObject();
        out.put("ok", true);
        if (data != null) {
            out.put("total", data.optInt("totalCount", 0));
            try {
                JSONObject det = new JSONObject(postJson(LIB + "/find/searchResultDetail/getDetail?recordId="
                        + URLEncoder.encode(recordId, "UTF-8"), null, cookie, jwt));
                JSONObject dd = det.optJSONObject("data");
                String abs = "";
                JSONArray md = dd == null ? null : dd.optJSONArray("marcDetl");
                if (md != null) {
                    for (int i = 0; i < md.length(); i++) {
                        JSONObject f = md.getJSONObject(i);
                        if ("330".equals(f.optString("field", ""))) {
                            abs = f.optString("fieldMarc", "").replace("__|a", "").trim();
                            break;
                        }
                    }
                }
                out.put("abstract", abs);
            } catch (Exception ignored) {}
            JSONArray arr = data.optJSONArray("list");
            JSONArray list = new JSONArray();
            if (arr != null) {
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject b = arr.getJSONObject(i);
                    JSONObject o = new JSONObject();
                    o.put("location", b.optString("locationName", ""));
                    o.put("status", b.optString("processType", ""));
                    o.put("callNo", b.optString("callNo", ""));
                    list.put(o);
                }
            }
            out.put("list", list);
        }
        return out.toString();
    }


    /** 封面图 URL */
    public static String cover(String cookie, String jwt, String isbn, String title) throws Exception {
        return cover(cookie, jwt, isbn, title, "");
    }

    public static String cover(String cookie, String jwt, String isbn, String title, String recordId) throws Exception {
        JSONObject out = new JSONObject();
        if (isbn == null || isbn.isEmpty()) { out.put("ok", false); out.put("url", ""); return out.toString(); }
        String u = LIB + "/find/book/getDuxiuImageUrl?isbn=" + URLEncoder.encode(isbn, "UTF-8")
                + "&title=";
        if (recordId != null && !recordId.isEmpty()) u += "&recordId=" + URLEncoder.encode(recordId, "UTF-8");
        HttpURLConnection conn = (HttpURLConnection) new URL(u).openConnection();
        conn.setInstanceFollowRedirects(false);
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(10000);
        conn.setReadTimeout(10000);
        conn.setRequestProperty("User-Agent", UA);
        conn.setRequestProperty("Accept", "application/json");
        conn.setRequestProperty("jwtOpacAuth", jwt == null ? "" : jwt);
        conn.setRequestProperty("groupCode", "200446");
        conn.setRequestProperty("x-lang", "CHI");
        conn.setRequestProperty("content-language", "zh_CN");
        conn.setRequestProperty("Origin", LIB);
        conn.setRequestProperty("Referer", LIB + "/");
        if (cookie != null && !cookie.isEmpty()) conn.setRequestProperty("Cookie", cookie);
        int code = conn.getResponseCode();
        InputStream is = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        if (is != null) {
            byte[] buf = new byte[8192]; int n;
            while ((n = is.read(buf)) > 0) {if(bos.size()+n>4*1024*1024)throw new java.io.IOException("响应超过大小限制");bos.write(buf, 0, n);}
            is.close();
        }
        conn.disconnect();
        JSONObject d = new JSONObject(bos.toString("UTF-8"));
        checkResult(d);
        out.put("ok", true);
        out.put("url", d.isNull("data") ? "" : d.optString("data", ""));
        out.put("code", d.optInt("errCode", 0));
        return out.toString();
    }


    /** 热门借阅（推荐） */
    public static String hot(String cookie, String jwt) throws Exception {
        JSONObject body = new JSONObject();
        body.put("page", 1);
        body.put("rows", 12);
        body.put("disCode", JSONObject.NULL);
        body.put("statRange", 30);
        body.put("indexFlag", 1);
        JSONObject out = new JSONObject();
        out.put("ok", true);
        JSONArray list = new JSONArray();
        try {
            String r = postJson(LIB + "/find/index/getHotLoan", body, cookie, jwt);
            JSONObject d = new JSONObject(r);
            checkResult(d);
            JSONObject data = d.optJSONObject("data");
            JSONArray arr = data == null ? null : data.optJSONArray("result");
            if (arr != null) {
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject b = arr.getJSONObject(i);
                    JSONObject o = new JSONObject();
                    o.put("recordId", b.optString("recordId", ""));
                    o.put("title", b.optString("title", ""));
                    o.put("author", b.optString("author", ""));
                    o.put("publisher", b.optString("publish", ""));
                    o.put("isbn", b.optString("isbn", ""));
                    o.put("loanCount", b.optInt("loanCount", 0));
                    list.put(o);
                }
            }
        } catch (Exception e) {
            if(e instanceof SessionExpiredException)throw e;
            out.put("ok", false);
            out.put("msg", String.valueOf(e.getMessage()));
        }
        out.put("list", list);
        return out.toString();
    }

    /** 通用请求（带 jwt 头）：body 为 null 时发 GET，否则发 POST */
    private static String postJson(String url, JSONObject body, String cookie, String jwt) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setInstanceFollowRedirects(false);
        boolean isGet = body == null;
        conn.setRequestMethod(isGet ? "GET" : "POST");
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(20000);
        if (!isGet) conn.setDoOutput(true);
        conn.setRequestProperty("User-Agent", UA);
        if (!isGet) conn.setRequestProperty("Content-Type", "application/json;charset=UTF-8");
        conn.setRequestProperty("Accept", "application/json, text/plain, */*");
        conn.setRequestProperty("Origin", LIB);
        conn.setRequestProperty("Referer", LIB + "/");
        conn.setRequestProperty("jwtOpacAuth", jwt == null ? "" : jwt);
        conn.setRequestProperty("groupCode", "200446");
        conn.setRequestProperty("x-lang", "CHI");
        conn.setRequestProperty("content-language", "zh_CN");
        if (cookie != null && !cookie.isEmpty()) conn.setRequestProperty("Cookie", cookie);
        if (!isGet) conn.getOutputStream().write(body.toString().getBytes(StandardCharsets.UTF_8));
        int code = conn.getResponseCode();
        InputStream is = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        if (is != null) {
            byte[] buf = new byte[8192]; int n;
            while ((n = is.read(buf)) > 0) {if(bos.size()+n>4*1024*1024)throw new java.io.IOException("响应超过大小限制");bos.write(buf, 0, n);}
            is.close();
        }
        conn.disconnect();
        return bos.toString("UTF-8");
    }


    /** 图片代理只允许这些域名（避免变成对任意地址开放的代理） */
    private static final String[] IMG_HOSTS = {
            "findjxau.libsp.cn",
            "cover01.chaoxing.com",
            "unicover.duxiu.com",
            "static12.libsp.cn",
            "libstar-lib-logo.oss-cn-beijing.aliyuncs.com"
    };

    private static boolean imgHostAllowed(String url) {
        try {
            URL parsed = new URL(url);
            if (!"https".equals(parsed.getProtocol())) return false;
            if (parsed.getUserInfo() != null || (parsed.getPort() != -1 && parsed.getPort() != 80 && parsed.getPort() != 443)) return false;
            String host = parsed.getHost();
            if (host == null) return false;
            host = host.toLowerCase();
            for (String h : IMG_HOSTS) {
                if (host.equals(h) || host.endsWith("." + h)) return true;
            }
        } catch (Exception ignored) {}
        return false;
    }

    /** 图片代理：抓取封面等图片字节，绕过防盗链 */
    public static byte[] fetchImage(String url) throws Exception {
        return fetchImageResult(url, 0).bytes;
    }

    public static class ImageResult {
        public byte[] bytes;
        public String contentType;
    }

    public static ImageResult fetchImageResult(String url, int redirects) throws Exception {
        if(url!=null&&url.startsWith("http://"))url="https://"+url.substring(7);
        if (!imgHostAllowed(url)) throw new IllegalArgumentException("图片域名不在允许列表");
        if (redirects > 4) throw new Exception("图片重定向过多");
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setInstanceFollowRedirects(false);
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(10000);
        conn.setReadTimeout(15000);
        conn.setInstanceFollowRedirects(false);
        conn.setRequestProperty("User-Agent", UA);
        conn.setRequestProperty("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8");
        conn.setRequestProperty("Referer", LIB + "/");
        int code = conn.getResponseCode();
        if (code >= 300 && code < 400) {
            String location = conn.getHeaderField("Location");
            conn.disconnect();
            if (location == null) throw new Exception("图片重定向缺少地址");
            return fetchImageResult(new URL(new URL(url), location).toString(), redirects + 1);
        }
        InputStream is = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        if (is != null) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) > 0) {
                if (bos.size() + n > 4 * 1024 * 1024) throw new Exception("封面图片超过4MB");
                bos.write(buf, 0, n);
            }
            is.close();
        }
        String type = conn.getContentType();
        conn.disconnect();
        if (code >= 400) throw new Exception("图片获取失败 " + code);
        if (type == null || !type.split(";",2)[0].toLowerCase(java.util.Locale.ROOT).matches("image/(jpeg|png|gif|webp|avif|bmp|x-icon|vnd.microsoft.icon)")) throw new Exception("上游未返回图片");
        ImageResult result = new ImageResult();
        result.bytes = bos.toByteArray();
        result.contentType = type.split(";", 2)[0];
        return result;
    }


    /**
     * 批量取封面 + 在架册数（一页 20 本只发 1 次请求）。
     * 上游：POST /find/unify/getPItemAndOnShelfCountAndDuxiuImageUrl
     * 注意：items[].recordId 必须是 JSON 数字，传字符串会返回「系统访问中断」。
     */
    public static String covers(String cookie, String jwt, String idsCsv) throws Exception {
        JSONArray items = new JSONArray();
        String[] parts = (idsCsv == null || idsCsv.isEmpty()) ? new String[0] : idsCsv.split(",");
        for (String p : parts) {
            String t = p.trim();
            if (t.isEmpty()) continue;
            JSONObject o = new JSONObject();
            try {
                o.put("recordId", Long.parseLong(t));
            } catch (Exception e) {
                continue;
            }
            items.put(o);
            if (items.length() >= 20) break;
        }

        JSONObject out = new JSONObject();
        if (items.length() == 0) {
            out.put("ok", true);
            out.put("map", new JSONObject());
            return out.toString();
        }

        JSONObject body = new JSONObject();
        body.put("items", items);

        String r = postJson(LIB + "/find/unify/getPItemAndOnShelfCountAndDuxiuImageUrl", body, cookie, jwt);
        JSONObject d = new JSONObject(r);
        JSONObject data = d.optJSONObject("data");

        JSONObject map = new JSONObject();
        if (data != null) {
            java.util.Iterator<String> it = data.keys();
            while (it.hasNext()) {
                String k = it.next();
                JSONObject v = data.optJSONObject(k);
                if (v == null) continue;
                JSONObject e = new JSONObject();
                e.put("url", v.optString("duxiuImageUrl", ""));
                e.put("onShelf", v.optInt("onShelfCount", 0));
                e.put("total", v.optInt("pCount", 0));
                map.put(k, e);
            }
        }
        out.put("ok", true);
        out.put("map", map);
        return out.toString();
    }

}
