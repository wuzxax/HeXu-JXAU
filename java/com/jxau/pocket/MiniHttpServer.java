package com.jxau.pocket;

import android.content.Context;
import android.content.res.AssetManager;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Loopback-only HTTP server, bounded input, route table and same-origin session. */
public class MiniHttpServer {
    public static final int PORT = 18000;
    private final CasClient client;
    private final Context context;
    private final AssetManager assets;
    private final String assetVersion;
    private final SecureStore vault;
    private final WanxiaoClient wanxiao;
    private final CloudLightingClient lighting;
    private final Life798Client life798;
    private final ChaoxingClient chaoxing;
    private final WaterDeviceClient waterDevice;
    private final ExecutorService pool = new ThreadPoolExecutor(8,8,0L,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<Runnable>(32));
    private final Map<String, Route> routes = new HashMap<>();
    private final String token = UUID.randomUUID().toString();
    private ServerSocket server;
    private volatile boolean running;
    String sessionCookie() { return "jxau_session=" + token + "; Path=/; HttpOnly; SameSite=Strict"; }
    private interface Route { Response handle(Request r) throws Exception; }
    private static class Request {
        String path, method, body;
        Map<String,String> query = new HashMap<>(), headers = new HashMap<>();
        String q(String k) { return query.containsKey(k) ? query.get(k) : ""; }
        int number(String k, int d) {
            if (q(k).isEmpty()) return d;
            try { return Integer.parseInt(q(k)); } catch (Exception e) { throw new IllegalArgumentException("参数无效: " + k); }
        }
        JSONObject json() throws Exception { return body.isEmpty() ? new JSONObject() : new JSONObject(body); }
    }
    private static class Response {
        int status = 200;
        boolean versionedAsset;
        String type = "application/json; charset=utf-8";
        byte[] bytes;
        static Response json(String value) throws Exception {
            Response r = new Response(); r.bytes = value.getBytes(StandardCharsets.UTF_8);
            JSONObject o = new JSONObject(value);
            if (o.has("ok") && !o.optBoolean("ok")) r.status = 422;
            return r;
        }
        static Response error(int status, String message) throws Exception {
            Response r = json(new JSONObject().put("ok", false).put("msg", message).toString());
            r.status = status; return r;
        }
    }
    public MiniHttpServer(Context ctx, CasClient client) {
        this(ctx, client, mode -> {});
    }

    MiniHttpServer(Context ctx, CasClient client, java.util.function.Consumer<String> colorMode) {
        this.context=ctx.getApplicationContext();this.client = client; assets = ctx.getAssets(); assetVersion=readAssetVersion(); vault = new SecureStore(ctx); wanxiao=new WanxiaoClient(vault); lighting=new CloudLightingClient(vault);life798=new Life798Client(vault);chaoxing=new ChaoxingClient(vault);waterDevice=new WaterDeviceClient(vault);
        add("GET", "/api/app/update", r -> {
            try {
                return Response.json(AppUpdate.fetch().toString());
            } catch (Exception e) {
                return Response.error(503, "暂时无法连接 GitHub 检查更新，请稍后重试，也可加群获取最新版本。");
            }
        });
        ScheduleExport exporter=new ScheduleExport(ctx);
        add("POST","/api/schedule/export",r->Response.json(exporter.stage(r.json()).toString()));
        add("POST","/api/schedule/snapshot",r->{JSONObject b=r.json();if(!client.user.equals(b.optString("owner")))return Response.error(409,"校园账号已变化，请重新打开课表");return Response.json(AgendaWidgetProvider.save(ctx,b).toString());});
        add("GET","/api/schedule/class-mode",r->Response.json(ClassModeReceiver.status(context).toString()));
        add("POST","/api/schedule/class-mode",r->Response.json(ClassModeReceiver.change(context,r.json()).toString()));
        add("POST","/api/schedule/alias-previews",r->{
            JSONArray names=r.json().getJSONArray("names"),labels=new JSONArray();
            String density=ClassModeReceiver.density(context);
            for(int i=0;i<names.length();i++)labels.put(CourseLabel.alias(new JSONObject().put("name",names.getString(i)),density));
            return Response.json(new JSONObject().put("ok",true).put("labels",labels).toString());
        });
        add("POST","/api/appearance/color-mode",r->{
            String mode=r.json().optString("mode");
            if (!"system".equals(mode) && !"light".equals(mode) && !"dark".equals(mode))
                return Response.error(400,"夜间模式设置无效");
            colorMode.accept(mode);
            return Response.json("{\"ok\":true}");
        });
        register();
    }
    private synchronized String login(JSONObject b)throws Exception{
        String username=b.optString("username").trim(),password=b.optString("password");
        if(b.optBoolean("useSaved")&&password.isEmpty()){
            JSONObject saved=vault.get("cred");
            if(saved==null||!username.equals(saved.optString("u"))||saved.optString("p").isEmpty())throw new IllegalArgumentException("没有该账号的已保存密码，请手动输入");
            password=saved.getString("p");
        }
        if(username.isEmpty()||password.isEmpty())throw new IllegalArgumentException("请输入账号和密码");
        String raw=client.login(username,password,b.optString("uid"),b.optString("code"));JSONObject result=new JSONObject(raw);
        if(result.optBoolean("ok")){
            JSONObject oldCredential=vault.get("cred");if(oldCredential!=null&&!username.equals(oldCredential.optString("u")))AgendaWidgetProvider.clear(context);
            try{vault.put("cred",new JSONObject().put("u",username).put("p",password));result.put("passwordSaved",true);}
            catch(Exception e){result.put("passwordSaved",false).put("storageWarning","登录成功，但未能加密保存密码，请稍后重试");}
        }
        return result.toString();
    }
    private void add(String method, String path, Route route) { routes.put(method + " " + path, route); }
    private void register() {
        add("GET", "/api/status", r -> Response.json("1".equals(r.q("refresh")) ? client.refreshStatus() : client.status()));
        add("GET", "/api/captcha", r -> Response.json(client.captcha()));
        add("POST", "/api/login", r -> { JSONObject b=r.json(); return Response.json(login(b)); });
        add("GET", "/api/week", r -> client.loggedIn ? Response.json(client.week(r.number("n",0), "1".equals(r.q("refresh")))) : Response.error(401,"请重新登录"));
        add("GET", "/api/grades", r -> client.loggedIn ? Response.json(client.scores()) : Response.error(401,"请重新登录"));
        add("POST", "/api/logout", r -> {client.logout();AgendaWidgetProvider.clear(context); return Response.json("{\"ok\":true}");});
        add("GET", "/api/vault", r -> {
            JSONObject result=new JSONObject().put("ok",true);
            JSONObject cred=vault.get("cred");result.put("cred",cred==null?JSONObject.NULL:new JSONObject().put("u",cred.optString("u")).put("saved",!cred.optString("p").isEmpty()));
            JSONObject elec=vault.get("elec");result.put("elec",elec==null?JSONObject.NULL:elec);
            return Response.json(result.toString());
        });
        add("POST", "/api/vault", r -> {
            JSONObject b=r.json(); String key=b.getString("key");
            if(!("cred".equals(key)||"elec".equals(key))) throw new IllegalArgumentException("不支持的绑定类型");
            if("cred".equals(key)&&b.optJSONObject("value")!=null)throw new IllegalArgumentException("密码只能在本人登录成功后保存");
            vault.put(key,b.optJSONObject("value")); return Response.json("{\"ok\":true}");
        });
        add("GET", "/api/elec/bind", r -> Response.json(ElecClient.bind(r.q("phone"))));
        add("GET", "/api/elec/summary", r -> Response.json(ElecClient.summary(r.q("roomId"),r.number("userId",0),r.number("costType",0))));
        add("GET", "/api/elec/daily", r -> Response.json(ElecClient.daily(r.q("roomId"),r.number("userId",0),r.q("begin"),r.q("end"),r.number("costType",0))));
        add("GET", "/api/lib/info", r -> Response.json(client.readLibrary((cookie,jwt)->LibraryClient.info(cookie))));
        add("GET", "/api/wanxiao/status", r -> Response.json(wanxiao.status().toString()));
        add("GET", "/api/life798/status", r -> Response.json(life798.status().toString()));
        add("GET", "/api/life798/captcha", r -> Response.json(life798.captcha().toString()));
        add("POST", "/api/life798/sms", r -> Response.json(life798.sms(r.json()).toString()));
        add("POST", "/api/life798/login", r -> Response.json(life798.login(r.json()).toString()));
        add("GET", "/api/life798/wallet", r -> Response.json(life798.wallet(r.q("eid")).toString()));
        add("POST", "/api/life798/select-wallet", r -> Response.json(life798.selectWallet(r.json()).toString()));
        add("GET", "/api/life798/history", r -> Response.json(life798.history(page(r)).toString()));
        add("GET", "/api/life798/spending/detail", r -> Response.json(life798.spendingDetail(r.q("category"),r.q("period"),r.q("date")).toString()));
        add("GET", "/api/life798/spending", r -> Response.json(life798.spending("1".equals(r.q("refresh"))).toString()));
        add("POST", "/api/life798/unbind", r -> {life798.unbind();return Response.json("{\"ok\":true}");});
        add("GET", "/api/chaoxing/status", r -> Response.json(chaoxing.status().toString()));
        add("POST", "/api/chaoxing/login", r -> { JSONObject b=r.json(); return Response.json(chaoxing.login(b.optString("user"),b.optString("password")).toString()); });
        add("POST", "/api/chaoxing/scan", r -> Response.json(chaoxing.scan().toString()));
        add("GET", "/api/chaoxing/todo", r -> Response.json(chaoxing.snapshot().toString()));
        add("GET", "/api/chaoxing/work", r -> Response.json(chaoxing.openWork(r.number("index",-1),r.q("expectedUrl")).toString()));
        add("POST", "/api/chaoxing/work/write", r -> Response.json(chaoxing.writeWork(r.json()).toString()));
        add("POST", "/api/chaoxing/work/check", r -> Response.json(chaoxing.checkWork(r.json().optString("sessionId")).toString()));
        add("GET", "/api/chaoxing/work/audio", r -> Response.json(chaoxing.audio(r.q("sessionId"),r.q("objectId")).toString()));
        add("POST", "/api/chaoxing/logout", r -> {chaoxing.logout();return Response.json("{\"ok\":true}");});
        add("GET", "/api/water-device/devices", r -> Response.json(waterDevice.devices().toString()));
        add("POST", "/api/water-device/parse", r -> Response.json(new JSONObject().put("ok",true).put("did",("scan".equals(r.json().optString("source"))?WaterDeviceRegistry.scan(r.json().optString("did")):WaterDeviceRegistry.normalize(r.json().optString("did")))).toString()));
        add("POST", "/api/water-device/save", r -> Response.json(waterDevice.save(r.json()).toString()));
        add("POST", "/api/water-device/remove", r -> Response.json(waterDevice.remove(r.json().optString("did")).toString()));
        add("POST", "/api/water-device/start", r -> Response.json(waterDevice.start(r.json().optString("did")).toString()));
        add("POST", "/api/water-device/end", r -> Response.json(waterDevice.end(r.json().optString("did")).toString()));
        add("POST", "/api/water-device/acknowledge-stopped", r -> {JSONObject b=r.json();return Response.json(waterDevice.acknowledgeStopped(b.optString("did"),b.optBoolean("confirmed")).toString());});
        add("POST", "/api/wanxiao/login", r -> Response.json(wanxiao.login(r.json()).toString()));
        add("POST", "/api/wanxiao/sms", r -> Response.json(wanxiao.sms(r.json()).toString()));
        add("POST", "/api/wanxiao/sms-login", r -> Response.json(wanxiao.smsLogin(r.json()).toString()));
        add("POST", "/api/wanxiao/unbind", r -> {wanxiao.unbind();return Response.json("{\"ok\":true}");});
        add("POST", "/api/lighting/rooms", r -> Response.json(lighting.levels(r.json()).toString()));
        add("GET", "/api/lighting/summary", r -> Response.json(lighting.summary(r.q("roomverify")).toString()));
        add("GET", "/api/lighting/status", r -> Response.json(lighting.status().toString()));
        add("POST", "/api/lighting/import-har", r -> Response.json(lighting.importHar(r.body).toString()));
        add("POST", "/api/lighting/unbind", r -> { lighting.unbind(); return Response.json("{\"ok\":true}"); });
        add("GET", "/api/lib/borrow", r -> Response.json(client.readLibrary((cookie,jwt)->LibraryClient.borrow(cookie,page(r),20))));
        add("GET", "/api/lib/history", r -> Response.json(client.readLibrary((cookie,jwt)->LibraryClient.history(cookie,jwt,page(r),20))));
        add("POST", "/api/lib/renew", r -> {client.ensureLibrary();return Response.json(LibraryClient.renew(client.libCookie,client.libJwt,r.json().optJSONArray("loanIds")));});
        add("GET", "/api/lib/rules", r -> Response.json(client.readLibrary((cookie,jwt)->LibraryClient.readerData(cookie,jwt,"rules"))));
        add("GET", "/api/lib/chart", r -> Response.json(client.readLibrary((cookie,jwt)->LibraryClient.readerData(cookie,jwt,"chart"))));
        add("GET", "/api/lib/search", r -> Response.json(client.readLibrary((cookie,jwt)->LibraryClient.search(cookie,jwt,r.q("q"),page(r),20,r.q("discode")))));
        add("GET", "/api/lib/detail", r -> Response.json(client.readLibrary((cookie,jwt)->LibraryClient.detail(cookie,jwt,r.q("recordId")))));
        add("GET", "/api/lib/hot", r -> Response.json(client.readLibrary((cookie,jwt)->LibraryClient.hot(cookie,jwt))));
        add("GET", "/api/lib/covers", r -> {client.ensureLibrary();return Response.json(LibraryClient.covers(client.libCookie,client.libJwt,r.q("ids")));});
        add("GET", "/api/lib/cover", r -> {client.ensureLibrary();return Response.json(LibraryClient.cover(client.libCookie,client.libJwt,r.q("isbn"),r.q("title"),r.q("recordId")));});
        add("GET", "/api/lib/img", r -> {
            LibraryClient.ImageResult image=LibraryClient.fetchImageResult(r.q("u"),0);
            Response result=new Response();result.bytes=image.bytes;result.type=image.contentType;return result;
        });
    }
    private static int page(Request r) {
        int p=r.number("page",1); if(p<1||p>1000)throw new IllegalArgumentException("页码无效"); return p;
    }
    public void start() throws IOException {
        server=new ServerSocket(PORT,50,InetAddress.getByName("127.0.0.1"));running=true;
        Thread thread=new Thread(()->{while(running){try{Socket s=server.accept();s.setSoTimeout(15000);try{pool.submit(()->handle(s));}catch(RejectedExecutionException busy){s.close();}}catch(Exception e){if(!running)break;}}},"jxau-http");
        thread.setDaemon(true);thread.start();
    }
    public void stop(){running=false;try{if(server!=null)server.close();}catch(IOException ignored){}pool.shutdownNow();}
    private void handle(Socket socket) {
        try {
            Request r=read(socket.getInputStream());Response out;
            try {
                String origin=r.headers.get("origin"), host=r.headers.get("host"), cookie=r.headers.get("cookie");
                boolean auth=cookie!=null&&Arrays.asList(cookie.split(";\\s*")).contains("jxau_session="+token);
                if(!("127.0.0.1:"+PORT).equals(host))out=Response.error(403,"本地服务地址无效");
                else if(origin!=null&&!("http://127.0.0.1:"+PORT).equals(origin))out=Response.error(403,"请求来源不允许");
                else if("cross-site".equals(r.headers.get("sec-fetch-site")))out=Response.error(403,"请求来源不允许");
                else if(!auth)out=Response.error(403,"请从应用首页重新打开");
                else if("POST".equals(r.method)&&!r.headers.getOrDefault("content-type","").toLowerCase(Locale.ROOT).startsWith("application/json"))out=Response.error(415,"请使用应用内请求");
                else if(!FeatureFlags.LIGHTING_ENABLED&&FeatureFlags.lightingPath(r.path))out=Response.error(423,"照明电费已暂停开放");
                else {
                    Route route=routes.get(r.method+" "+r.path);
                    if(route!=null)out=route.handle(r);
                    else if(r.path.startsWith("/api/")){
                        boolean exists=false;for(String k:routes.keySet())if(k.endsWith(" "+r.path))exists=true;
                        out=Response.error(exists?405:404,exists?"请求方式不支持":"接口不存在");
                    }else out="GET".equals(r.method)?asset(r):Response.error(405,"请求方式不支持");
                }
            }catch(IllegalArgumentException e){out=Response.error(400,safeError(e.getMessage()));}
            catch(Exception e){String msg=safeError(e.getMessage());
                out=msg.contains("请重新绑定")||msg.contains("请先绑定")||msg.contains("请重新登录")||msg.contains("票据")?Response.error(401,msg):
                    Response.error(502,msg.length()>180?"上游服务暂不可用，请稍后重试":msg);
            }
            String headers="HTTP/1.1 "+out.status+(out.status==200?" OK":" Error")+"\r\nContent-Type: "+out.type+
                "\r\nContent-Length: "+out.bytes.length+"\r\nCache-Control: "+
                (out.versionedAsset?"private, max-age=31536000, immutable":"no-store")+
                "\r\nX-Content-Type-Options: nosniff"+
                "\r\nReferrer-Policy: no-referrer\r\nX-Frame-Options: DENY\r\nPermissions-Policy: camera=(self), microphone=(), geolocation=()"+
                "\r\nContent-Security-Policy: "+contentPolicy(r.path)+"\r\nConnection: close\r\n\r\n";
            OutputStream stream=socket.getOutputStream();stream.write(headers.getBytes(StandardCharsets.UTF_8));stream.write(out.bytes);stream.flush();
        }catch(Exception ignored){}finally{try{socket.close();}catch(IOException ignored){}}
    }
    private static String safeError(String message){
        if(message==null||message.length()>180||message.matches("(?s).*(https?://|(?i:password|authorization|bearer|cookie|token|ticket|tgt|sign)[^A-Za-z0-9]*[=:]).*"))return "服务请求失败，请稍后重试";
        return message;
    }
    private static Request read(InputStream input)throws Exception {
        ByteArrayOutputStream head=new ByteArrayOutputStream();int state=0;
        while(true){int b=input.read();if(b<0)throw new IOException("请求头不完整");head.write(b);if(head.size()>32768)throw new IOException("请求头过大");
            if(state==0&&b==13)state=1;else if(state==1&&b==10)state=2;else if(state==2&&b==13)state=3;else if(state==3&&b==10)break;else state=0;}
        String[] lines=head.toString("UTF-8").split("\r\n"), first=lines[0].split(" ");
        if(first.length<2)throw new IOException("请求无效");Request r=new Request();r.method=first[0];
        String[] target=first[1].split("\\?",2);r.path=target[0];
        if(target.length>1)for(String part:target[1].split("&")){String[] pair=part.split("=",2);r.query.put(URLDecoder.decode(pair[0],"UTF-8"),pair.length==2?URLDecoder.decode(pair[1],"UTF-8"):"");}
        for(int i=1;i<lines.length;i++){String line=lines[i];int c=line.indexOf(':');if(c>0){String key=line.substring(0,c).trim().toLowerCase(Locale.US);if(r.headers.containsKey(key))throw new IOException("重复请求头");r.headers.put(key,line.substring(c+1).trim());}}
        if(r.headers.containsKey("transfer-encoding"))throw new IOException("不支持分块请求");
        int length=Integer.parseInt(r.headers.containsKey("content-length")?r.headers.get("content-length"):"0");
        int limit="POST".equals(r.method)&&("/api/lighting/import-har".equals(r.path)||"/api/schedule/export".equals(r.path))?8388608:"POST".equals(r.method)&&"/api/schedule/snapshot".equals(r.path)?2097152:262144;
        if(length<0||length>limit)throw new IOException("请求体过大");byte[] body=new byte[length];int p=0;
        while(p<length){int n=input.read(body,p,length-p);if(n<0)throw new IOException("请求体不完整");p+=n;}
        r.body=new String(body,StandardCharsets.UTF_8);return r;
    }
    private String csp;
    private String contentPolicy(String path)throws Exception{
        String policy=contentPolicy();return "/js/water-qr-worker.js".equals(path)?policy.replace("script-src ","script-src 'wasm-unsafe-eval' "):policy;
    }
    private synchronized String contentPolicy()throws Exception{
        if(csp!=null)return csp;
        StringBuilder scripts=new StringBuilder("'self'");
        try(InputStream in=assets.open("index.html");ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] bytes=new byte[8192];int n;while((n=in.read(bytes))>0)out.write(bytes,0,n);
            java.util.regex.Matcher m=java.util.regex.Pattern.compile("<script(?:\\s[^>]*)?>([\\s\\S]*?)</script>").matcher(out.toString("UTF-8"));
            while(m.find())scripts.append(" 'sha256-").append(android.util.Base64.encodeToString(java.security.MessageDigest.getInstance("SHA-256").digest(m.group(1).getBytes(StandardCharsets.UTF_8)),android.util.Base64.NO_WRAP)).append("'");
        }
        csp="default-src 'none'; script-src "+scripts+"; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; media-src 'self' https: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";return csp;
    }
    private String readAssetVersion() {
        try (InputStream in = assets.open("asset-version.txt");
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[64];
            int n;
            while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
            return out.toString("US-ASCII").trim();
        } catch (IOException unavailable) {
            return "";
        }
    }
    private Response asset(Request request)throws Exception {
        String path=request.path;
        String name="/".equals(path)?"index.html":path.substring(1);
        if(name.contains("..")||name.contains("\\")||name.contains("%"))return Response.error(404,"资源不存在");
        Response r=new Response();
        if(name.endsWith(".html"))r.type="text/html; charset=utf-8";else if(name.endsWith(".js"))r.type="application/javascript; charset=utf-8";
        else if(name.endsWith(".css"))r.type="text/css; charset=utf-8";
        else if(name.endsWith(".wasm"))r.type="application/wasm";
        else if(name.endsWith(".png"))r.type="image/png";
        else if(name.endsWith(".jpg")||name.endsWith(".jpeg"))r.type="image/jpeg";
        else if(name.endsWith(".webp"))r.type="image/webp";
        else return Response.error(404,"资源不存在");
        try(InputStream in=assets.open(name);ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] b=new byte[8192];int n;while((n=in.read(b))>0)out.write(b,0,n);r.bytes=out.toByteArray();
            r.versionedAsset=!assetVersion.isEmpty()&&assetVersion.equals(request.q("v"))
                    &&!name.endsWith(".html")&&(name.startsWith("css/")||name.startsWith("js/")||name.startsWith("img/"));
            return r;
        }catch(IOException e){return Response.error(404,"资源不存在");}
    }
}
