package com.jxau.pocket;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.CookieHandler;
import java.net.HttpCookie;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.net.URLEncoder;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/**
 * 学校 CAS + 门户接口客户端。
 */
public class CasClient {
    public static final String CAS = "https://cas.jxau.edu.cn";
    public static final String PORTAL = "https://portal.jxau.edu.cn";
    public static final String SERVICE = PORTAL + "/shiro-cas";
    public static final String CARD_ID = "75ae8ff030444ab78ea571db58a2f7ed";
    public static final String UA =
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

    public volatile String user = "";
    public volatile boolean loggedIn = false;
    private volatile boolean sessionVerified = false;
    public volatile String tgt = "";
    public volatile String libCookie = "";
    public volatile String libJwt = "";
    private boolean routeInitialized;
    private long libraryVerifiedAt;

    private final Context ctx;
    private final SecureStore secure;
    private final ScheduleClient schedule;
    private final CookieManager cm;

    // 说明：早期版本在这里关掉了整个进程的 TLS 校验（trust-all）。
    // 实测 5 个上游域名在 Android 根证书库下全部受信，这段代码没有必要，
    // 而且它会顺带把图片代理、第三方接口的证书校验一起放开，属于安全风险，已移除。

    public CasClient(Context ctx) {
        this.ctx = ctx;
        this.secure = new SecureStore(ctx);
        cm = new CookieManager(null, CookiePolicy.ACCEPT_ORIGINAL_SERVER);
        CookieHandler.setDefault(cm);
        loadCookies();
        schedule = new ScheduleClient(new ScheduleClient.Transport() {
            public String request(String url, String method, String body, Map<String,String> headers) throws Exception {
                return http(url, method, body, headers, true);
            }
            public String location(String url) throws Exception { return httpLocation(url); }
            public String ticket(String service) throws Exception {
                return serviceTicket(service);
            }
        });
    }

    // ---------------- 基础请求 ----------------
    private String http(String url, String method, String body,
                        Map<String, String> extra, boolean follow) throws Exception {
        return http(url,method,body,extra,follow,0);
    }
    private String http(String url,String method,String body,Map<String,String> extra,boolean follow,int depth)throws Exception{
        URL target=new URL(url);
        if(!"https".equals(target.getProtocol())||target.getUserInfo()!=null||!(target.getPort()==-1||target.getPort()==443)||!("cas.jxau.edu.cn".equals(target.getHost())||"portal.jxau.edu.cn".equals(target.getHost())||"jwgl.jxau.edu.cn".equals(target.getHost())))throw new java.io.IOException("已阻止不受信任的校园接口");
        HttpURLConnection conn = (HttpURLConnection) target.openConnection();
        conn.setRequestMethod(method);
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(20000);
        conn.setInstanceFollowRedirects(false);
        conn.setRequestProperty("User-Agent", UA);
        conn.setRequestProperty("Accept", "application/json, text/plain, */*");
        conn.setRequestProperty("X-Requested-With", "XMLHttpRequest");
        if (extra != null) {
            for (Map.Entry<String, String> e : extra.entrySet()) {
                conn.setRequestProperty(e.getKey(), e.getValue());
            }
        }
        if (body != null) {
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8");
            conn.getOutputStream().write(body.getBytes("UTF-8"));
        }
        int code = conn.getResponseCode();
        if(follow&&code>=300&&code<400){
            String location=conn.getHeaderField("Location");conn.disconnect();
            URL next=location==null?null:new URL(target,location);
            if(depth>=5||!"GET".equals(method)||next==null||!target.getProtocol().equals(next.getProtocol())||!target.getAuthority().equals(next.getAuthority()))throw new java.io.IOException("校园接口跳转异常，请稍后重试");
            return http(next.toString(),"GET",null,extra,true,depth+1);
        }
        if (url.startsWith(CAS + "/cas/v1/tickets/") && code >= 400) {
            conn.disconnect();
            if (code == 400 || code == 401 || code == 403 || code == 404 || code == 410)
                throw new Exception("校园登录已失效，请重新登录");
            throw new Exception("校园认证服务暂不可用，请稍后重试");
        }
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        try {
            InputStream is = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
            if (is != null) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = is.read(buf)) > 0) {if(bos.size()+n>4*1024*1024)throw new java.io.IOException("响应超过大小限制");bos.write(buf, 0, n);}
                is.close();
            }
        } catch (Exception readError) {
            if (url.startsWith(CAS + "/cas/v1/tickets/")) {
                conn.disconnect();
                throw readError;
            }
            // 302 等无 body 的响应，读不到内容属于正常
        }
        conn.disconnect();
        return bos.toString("UTF-8");
    }

    private static Map<String, String> mapOf(String... kv) {
        Map<String, String> m = new HashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) m.put(kv[i], kv[i + 1]);
        return m;
    }

    // ---------------- 验证码 ----------------
    public String captcha() throws Exception {
        String ref = CAS + "/cas/login?service=" + URLEncoder.encode(SERVICE, "UTF-8");
        String body = http(CAS + "/cas/kaptcha?uid=", "GET", null,
                Collections.singletonMap("Referer", ref), true);
        JSONObject d = new JSONObject(body);
        JSONObject out = new JSONObject();
        out.put("ok", true);
        out.put("uid", d.optString("uid", ""));
        out.put("img", d.optString("content", ""));
        return out.toString();
    }

    // ---------------- 登录 ----------------
    public String login(String username, String password, String uid, String code) throws Exception {
        String ref = CAS + "/cas/login?service=" + URLEncoder.encode(SERVICE, "UTF-8");
        String body = "username=" + URLEncoder.encode(username, "UTF-8")
                + "&password=" + RsaUtil.encrypt(password)
                + "&service=" + URLEncoder.encode(SERVICE, "UTF-8")
                + "&loginType=&id=" + URLEncoder.encode(uid, "UTF-8")
                + "&code=" + URLEncoder.encode(code, "UTF-8");
        String resp = http(CAS + "/cas/v1/tickets", "POST", body,
                mapOf("Origin", CAS, "Referer", ref, "loginToken", "loginToken"), true);
        JSONObject d = new JSONObject(resp);
        String tgt = d.optString("tgt", "");
        String ticket = d.optString("ticket", "");
        JSONObject out = new JSONObject();
        if (tgt.isEmpty() || ticket.isEmpty()) {
            JSONObject dd = d.optJSONObject("data");
            String c = dd != null ? dd.optString("code", "") : "";
            out.put("ok", false);
            if ("PASSERROR".equals(c)) {
                out.put("msg", "学号或密码错误（错误次数会累计，注意别锁号）");
            } else {
                out.put("msg", "登录失败" + (c.isEmpty() ? "" : "：" + c));
            }
            return out.toString();
        }
        schedule.reset();
        libCookie = "";
        libJwt = "";
        routeInitialized = false;
        libraryVerifiedAt=0;
        // 用票据换门户会话
        http(PORTAL + "/shiro-cas?ticket=" + URLEncoder.encode(ticket, "UTF-8"),
                "GET", null, null, false);
        user = username;
        loggedIn = true;
        sessionVerified = true;
        this.tgt = tgt;
        saveCookies();
        out.put("ok", true);
        out.put("user", username);
        return out.toString();
    }

    // ---------------- 课表 ----------------
    public String week(int n) throws Exception { return week(n, false); }
    private String serviceTicket(String service) throws Exception {
        if (tgt.isEmpty()) { loggedIn=false; sessionVerified=false; throw new Exception("缺少校园登录会话，请重新登录"); }
        String value;
        try { value = http(CAS + "/cas/v1/tickets/" + URLEncoder.encode(tgt, "UTF-8"), "POST",
                "service=" + URLEncoder.encode(service, "UTF-8"), null, true).trim(); }
        catch(Exception e) { if(String.valueOf(e.getMessage()).contains("请重新登录")){loggedIn=false;sessionVerified=false;} throw e; }
        if (!value.startsWith("ST-")) { loggedIn=false;sessionVerified=false;throw new Exception("校园登录已失效，请重新登录"); }
        sessionVerified=true;
        return value;
    }
    public String week(int n, boolean force) throws Exception {
        String account = user;
        if (!loggedIn || account.isEmpty()) throw new Exception("请重新登录");
        if (force) {
            // A persisted username is not proof of a live session. Validate the CAS
            // session and renew the portal cookie before a user-initiated refresh.
            String ticket = serviceTicket(SERVICE);
            if (!loggedIn || !account.equals(user)) throw new Exception("账号已变更，请重新登录");
            http(PORTAL + "/shiro-cas?ticket=" + URLEncoder.encode(ticket, "UTF-8"), "GET", null, null, false);
        }
        String result = schedule.week(n, force, account);
        if (!loggedIn || !account.equals(user)) throw new Exception("账号已变更，请重新登录");
        return result;
    }
    public String scores() throws Exception {
        String account = user;
        if (!loggedIn || account.isEmpty()) throw new Exception("请重新登录");
        String result = schedule.scores(account);
        if (!loggedIn || !account.equals(user)) throw new Exception("账号已变更，请重新登录");
        return result;
    }

    /** 教务 SSO 仅接受学校 HTTPS 跳转，不跟随任意外站。 */
    private String httpLocation(String url) throws Exception {
        URL target=new URL(url);
        if(!"https".equals(target.getProtocol())||target.getUserInfo()!=null||!(target.getPort()==-1||target.getPort()==443)||!("cas.jxau.edu.cn".equals(target.getHost())||"portal.jxau.edu.cn".equals(target.getHost())||"jwgl.jxau.edu.cn".equals(target.getHost())))throw new java.io.IOException("已阻止不受信任的校园接口");
        HttpURLConnection conn = (HttpURLConnection) target.openConnection();
        try {
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.setRequestProperty("User-Agent", UA);
            int code = conn.getResponseCode();
            String location = conn.getHeaderField("Location");
            if (code < 300 || code >= 400 || location == null) throw new Exception("教务单点登录未返回有效跳转");
            return location;
        } finally { conn.disconnect(); }
    }

    public String status() {
        try {
            JSONObject o = new JSONObject();
            o.put("logged_in", loggedIn);
            o.put("session_verified", sessionVerified);
            o.put("user", user);
            return o.toString();
        } catch (Exception e) {
            return "{\"logged_in\":false,\"user\":\"\"}";
        }
    }

    /** A refresh must validate persisted credentials rather than trusting a username. */
    public synchronized String refreshStatus() throws Exception {
        if(loggedIn) {
            try { serviceTicket(SERVICE); }
            catch(Exception e) { if(loggedIn)throw e; }
        }
        return status();
    }

    public void logout() {
        loggedIn = false;
        sessionVerified = false;
        user = "";
        schedule.reset();
        cm.getCookieStore().removeAll();
        tgt = "";
        libCookie = "";
        libJwt = "";
        routeInitialized = false;
        try { secure.put("session", null); secure.put("cred", null); } catch (Exception ignored) {}
        ctx.getSharedPreferences("jxau", Context.MODE_PRIVATE).edit().clear().apply();
    }

    // ---------------- Cookie 持久化 ----------------
    private synchronized void saveCookies() {
        try {
            JSONArray arr = new JSONArray();
            List<HttpCookie> list = cm.getCookieStore().getCookies();
            for (HttpCookie c : list) {
                JSONObject o = new JSONObject();
                o.put("n", c.getName());
                o.put("v", c.getValue());
                o.put("d", c.getDomain() == null ? "" : c.getDomain());
                o.put("p", c.getPath() == null ? "/" : c.getPath());
                arr.put(o);
            }
            secure.put("session", new JSONObject().put("cookies", arr.toString())
                    .put("user", user).put("tgt", tgt).put("libCookie", libCookie).put("libJwt", libJwt));
            ctx.getSharedPreferences("jxau", Context.MODE_PRIVATE).edit().clear().apply();
        } catch (Exception ignored) {}
    }

    private void loadCookies() {
        try {
            JSONObject sp = secure.get("session");
            if (sp == null) {
                SharedPreferences legacy = ctx.getSharedPreferences("jxau", Context.MODE_PRIVATE);
                if (!legacy.contains("cookies")) return;
                sp = new JSONObject();
                for (String k : new String[]{"cookies", "user", "tgt", "libCookie", "libJwt"})
                    sp.put(k, legacy.getString(k, ""));
                secure.put("session", sp);
                legacy.edit().clear().apply();
            }
            String s = sp.optString("cookies", "");
            if (s.isEmpty()) return;
            JSONArray arr = new JSONArray(s);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                HttpCookie c = new HttpCookie(o.optString("n"), o.optString("v"));
                String d = o.optString("d");
                String host = d.isEmpty() ? "portal.jxau.edu.cn" : d;
                if (host.startsWith(".")) host = host.substring(1);
                c.setDomain(host);
                c.setPath(o.optString("p", "/"));
                try {
                    cm.getCookieStore().add(URI.create("https://" + host + "/"), c);
                } catch (Exception ignored) {}
            }
            user = sp.optString("user", "");
            tgt = sp.optString("tgt", "");
            libCookie = sp.optString("libCookie", "");
            libJwt = sp.optString("libJwt", "");
            // A stored cookie is only a candidate session; week() checks actual validity.
            loggedIn = !user.isEmpty() && !tgt.isEmpty();
        } catch (Exception ignored) {}
    }

    /** 清掉图书馆登录态，下次 ensureLibrary 会重新 SSO */
    public synchronized void resetLibrary() {
        libCookie = "";
        libJwt = "";
        routeInitialized = false;
        libraryVerifiedAt=0;
        saveCookies();
    }

    /** 确保拿到图书馆 session（必要时重新 SSO） */
    public synchronized String ensureLibrary() throws Exception {
        // 旧缓存里没有 jwt cookie，需要重新 SSO
        if (libCookie != null && libCookie.contains("jwt=")) {
            if (!routeInitialized) {
                libCookie = LibraryClient.initializeRoute(libCookie);
                routeInitialized = true;
                saveCookies();
            }
            if(System.currentTimeMillis()-libraryVerifiedAt<60000)return libCookie;
            try{LibraryClient.validateSession(libCookie);libraryVerifiedAt=System.currentTimeMillis();return libCookie;}
            catch(LibraryClient.SessionExpiredException expired){resetLibrary();}
        }
        if (tgt == null || tgt.isEmpty()) throw new Exception("缺少登录票据，请先重新登录");
        LibraryClient.Session s;
        try{s=LibraryClient.sso(tgt);}catch(LibraryClient.SessionExpiredException expired){loggedIn=false;sessionVerified=false;resetLibrary();throw expired;}
        libCookie = s.cookie;
        libJwt = s.jwt;
        libCookie = LibraryClient.initializeRoute(libCookie);
        routeInitialized = true;
        LibraryClient.validateSession(libCookie);
        libraryVerifiedAt=System.currentTimeMillis();
        saveCookies();
        return libCookie;
    }
    /** Safe reads can recreate an expired library session once; renewals are never replayed. */
    public interface LibraryRead {String run(String cookie,String jwt)throws Exception;}
    public synchronized String readLibrary(LibraryRead read)throws Exception{
        String cookie=ensureLibrary();try{return read.run(cookie,libJwt);}catch(LibraryClient.SessionExpiredException expired){resetLibrary();return read.run(ensureLibrary(),libJwt);}
    }
}
