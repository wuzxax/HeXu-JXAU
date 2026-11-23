package com.jxau.pocket;

import android.util.Base64;
import org.json.*;
import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.*;

/** Learning-platform session and ordinary homework transport. All writes require explicit local user actions. */
public class ChaoxingClient {
    private static final String LOGIN="https://passport2.chaoxing.com";
    private static final String MOOC="https://mooc1.chaoxing.com";
    private static final String API="https://mooc1-api.chaoxing.com";
    private final SecureStore store;
    private final CookieManager cookies=new CookieManager(null,CookiePolicy.ACCEPT_ORIGINAL_SERVER);
    protected String lastUrl="";
    public ChaoxingClient(SecureStore s){store=s;}
    private JSONObject session() throws Exception { JSONObject s=store.get("chaoxing"); if(s==null||s.optString("user").isEmpty()) throw new Exception("还没有绑定学习通账号"); return s; }
    private static String enc(String s)throws Exception{return URLEncoder.encode(s==null?"":s,"UTF-8");}
    protected String req(String url,String method,String body,String referer,boolean follow)throws Exception{
        for(int hop=0;hop<9;hop++){
            if(!ChaoxingParser.trusted(url))throw new Exception("学习通返回了不支持的跳转地址");
            HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();
            try{
                c.setRequestMethod(method);c.setInstanceFollowRedirects(false);c.setConnectTimeout(12000);c.setReadTimeout(20000);
                c.setRequestProperty("User-Agent",CasClient.UA);c.setRequestProperty("Accept","application/json, text/html, */*");
                if(referer!=null&&!referer.isEmpty())c.setRequestProperty("Referer",referer);
                URI u=URI.create(url);StringBuilder h=new StringBuilder();
                for(HttpCookie x:cookies.getCookieStore().get(u)){if(x.hasExpired())continue;if(h.length()>0)h.append("; ");h.append(x.getName()).append('=').append(x.getValue());}
                if(h.length()>0)c.setRequestProperty("Cookie",h.toString());
                if(body!=null){byte[] payload=body.getBytes(StandardCharsets.UTF_8);c.setDoOutput(true);c.setFixedLengthStreamingMode(payload.length);c.setRequestProperty("Content-Type","application/x-www-form-urlencoded;charset=UTF-8");try(OutputStream o=c.getOutputStream()){o.write(payload);}}
                int code=c.getResponseCode();lastUrl=url;
                for(Map.Entry<String,List<String>> en:c.getHeaderFields().entrySet())if("set-cookie".equalsIgnoreCase(en.getKey()))for(String v:en.getValue())for(HttpCookie ck:HttpCookie.parse(v)){if(ck.getDomain()==null)ck.setDomain(u.getHost());if(CookiePolicy.ACCEPT_ORIGINAL_SERVER.shouldAccept(u,ck))cookies.getCookieStore().add(u,ck);}
                if(code>=300&&code<400&&follow){String loc=c.getHeaderField("Location");if(loc==null)throw new Exception("学习通跳转未返回目标");URI next=u.resolve(loc);if(body!=null&&(code==307||code==308)&&!u.getAuthority().equals(next.getAuthority()))throw new Exception("已阻止学习通提交数据跨站跳转");url=next.toString();if(code==303||code==301||code==302){method="GET";body=null;}continue;}
                if(code==401)throw new Exception("学习通登录已失效，请重新绑定");
                if(code==202||code==429)throw new Exception("学习通暂时限制访问，请过几分钟再检查");
                if(code!=200)throw new Exception("学习通返回 HTTP "+code+"，请稍后重试");
                try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
                    byte[] bytes=new byte[8192];int n;while((n=in.read(bytes))>0){if(out.size()+n>4*1024*1024)throw new IOException("学习通响应过大");out.write(bytes,0,n);}
                    return out.toString("UTF-8");
                }
            }finally{c.disconnect();}
        }
        throw new Exception("学习通跳转次数过多，请重新绑定");
    }
    private static String aes(String p)throws Exception{byte[] k="u2oh6Vu^HWe4_AES".getBytes(StandardCharsets.UTF_8);Cipher c=Cipher.getInstance("AES/CBC/PKCS5Padding");c.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(k,"AES"),new IvParameterSpec(k));return Base64.encodeToString(c.doFinal(p.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);}
    public synchronized JSONObject status()throws Exception{JSONObject s=store.get("chaoxing");return new JSONObject().put("ok",true).put("bound",s!=null&&!s.optString("user").isEmpty()).put("user",s==null?"":s.optString("user")).put("updatedAt",s==null?0:s.optLong("updatedAt"));}
    public synchronized JSONObject login(String user,String pass)throws Exception{
        if(user==null||user.trim().isEmpty()||pass==null||pass.isEmpty())throw new IllegalArgumentException("请输入学习通账号和密码");
        if(scanning)throw new Exception("作业正在检查，请稍候再重新绑定");
        cookies.getCookieStore().removeAll();String page=LOGIN+"/login?fid=&refer=";req(page,"GET",null,"",true);
        String body="fid=-1&uname="+enc(user.trim())+"&password="+enc(aes(pass))+"&refer="+enc("http%3A%2F%2Fi.mooc.chaoxing.com")+"&t=true&forbidotherlogin=0&validate=&_blank=1&retainlogin=2&pcxxtpage=0&needVcode=";
        String text=req(LOGIN+"/fanyalogin","POST",body,page,true);JSONObject j;try{j=new JSONObject(text);}catch(Exception e){throw new Exception("学习通登录返回异常，请稍后重试");}
        if(!j.optBoolean("status")&&!"true".equalsIgnoreCase(j.optString("status"))){String m=j.optString("mes","");throw new Exception(m.contains("验证码")?"学习通要求验证码，请先在官方页面完成一次登录":(m.isEmpty()?"学习通账号或密码不正确":m));}
        store.put("chaoxing",new JSONObject().put("user",user.trim()).put("updatedAt",System.currentTimeMillis()));saveCookies();latest=null;progress=null;workSession=null;store.put("chaoxing-todo",null);store.put("chaoxing-work-states",null);store.put("chaoxing-write-pending",null);return status();
    }
    public synchronized void logout()throws Exception{if(scanning)throw new Exception("作业正在检查，请稍候再断开");store.put("chaoxing",null);store.put("chaoxing-cookies",null);store.put("chaoxing-todo",null);store.put("chaoxing-work-states",null);latest=null;progress=null;workSession=null;store.put("chaoxing-write-pending",null);cookies.getCookieStore().removeAll();}
    private JSONArray courses()throws Exception{String t=req(API+"/mycourse/backclazzdata?view=json&rss=1","GET",null,"https://mooc2-ans.chaoxing.com/mooc2-ans/visit/interaction",true);JSONObject j;try{j=new JSONObject(t);}catch(Exception e){throw new Exception("课程列表读取失败，登录状态可能已失效");}JSONArray out=new JSONArray(),chs=j.optJSONArray("channelList");if(chs==null)throw new Exception("课程列表接口返回格式变化");for(int i=0;i<chs.length();i++){JSONObject ch=chs.optJSONObject(i),ct=ch==null?null:ch.optJSONObject("content"),co=ct==null?null:ct.optJSONObject("course");JSONArray rows=co==null?null:co.optJSONArray("data");JSONObject d=rows==null||rows.length()==0?null:rows.optJSONObject(0);if(d==null)continue;out.put(new JSONObject().put("courseId",d.optString("id")).put("classId",ct.optString("id")).put("cpi",ch.optString("cpi",ct.optString("cpi"))).put("title",d.optString("name",ct.optString("name"))).put("schoolId",d.optString("belongSchoolId")));}return out;}
    private JSONObject meta(JSONObject c)throws Exception{
        String u=MOOC+"/visit/stucoursemiddle?courseid="+c.optString("courseId")+"&clazzid="+c.optString("classId")+"&cpi="+c.optString("cpi")+"&ismooc2=1&v=2";
        String html=req(u,"GET",null,"",true);
        if(lastUrl.startsWith(LOGIN))throw new Exception("学习通登录已失效，请重新绑定");
        org.jsoup.nodes.Element field=org.jsoup.Jsoup.parse(html).getElementById("workEnc");
        String work=field==null?"":field.attr("value");Matcher sm=Pattern.compile("[?&]enc=([0-9a-fA-F]{32})").matcher(lastUrl);
        return new JSONObject().put("stuenc",sm.find()?sm.group(1):"").put("workEnc",work.matches("[0-9a-fA-F]{32}")?work:"").put("referer",lastUrl);
    }
    private volatile boolean scanning;
    private volatile JSONObject progress;
    private volatile JSONObject latest;
    private void ensureSession() throws Exception {
        session();
        if(cookies.getCookieStore().getCookies().isEmpty()){
            JSONObject saved=store.get("chaoxing-cookies");JSONArray arr=saved==null?null:saved.optJSONArray("cookies");
            if(arr!=null)for(int i=0;i<arr.length();i++){JSONObject row=arr.getJSONObject(i);HttpCookie ck=new HttpCookie(row.getString("name"),row.getString("value"));ck.setDomain(row.getString("domain"));ck.setPath(row.optString("path","/"));cookies.getCookieStore().add(URI.create("https://"+row.getString("domain").replaceFirst("^\\.","")+"/"),ck);}
        }
        if(cookies.getCookieStore().getCookies().isEmpty())throw new Exception("学习通登录已失效，请重新绑定");
    }
    private void saveCookies()throws Exception{
        JSONArray arr=new JSONArray();for(HttpCookie ck:cookies.getCookieStore().getCookies())if(!ck.hasExpired())arr.put(new JSONObject().put("name",ck.getName()).put("value",ck.getValue()).put("domain",ck.getDomain()).put("path",ck.getPath()==null?"/":ck.getPath()));
        store.put("chaoxing-cookies",new JSONObject().put("cookies",arr));
    }
    public synchronized JSONObject scan()throws Exception{
        if(scanning)return snapshot();ensureSession();scanning=true;
        JSONObject previous=latest==null?store.get("chaoxing-todo"):latest;
        progress=previous==null?new JSONObject():new JSONObject(previous.toString());progress.put("ok",true).put("scanning",true).put("completed",0).put("courses",0).put("course","");
        Thread t=new Thread(()->{try{publish(readAll());saveCookies();}catch(Exception e){try{progress=new JSONObject().put("ok",false).put("msg",e.getMessage()==null?"学习通读取失败":e.getMessage());}catch(Exception ignored){}}finally{scanning=false;}},"jxau-chaoxing-scan");t.setDaemon(true);t.start();return snapshot();
    }
    private synchronized void publish(JSONObject list)throws Exception{
        reconcile(list);latest=list;store.put("chaoxing-todo",list);
    }
    private void reconcile(JSONObject list)throws Exception{
        JSONObject saved=store.get("chaoxing-work-states");
        if(saved==null||!session().optString("user").equals(saved.optString("owner")))return;
        JSONObject states=saved.optJSONObject("states");JSONArray rows=list.optJSONArray("items");if(states==null||rows==null)return;
        for(int i=0;i<rows.length();i++){
            JSONObject row=rows.getJSONObject(i),state=states.optJSONObject(ChaoxingParser.identity(row.optString("url")));
            if(state!=null&&state.optBoolean("submitted")){
                // A detail result is stronger evidence than a stale aria-label in the list.
                if(!"done".equals(row.optString("state")))row.put("status","已提交").put("state","done");
                row.put("verifiedAt",state.optLong("at"));
            }
        }
    }
    public JSONObject snapshot()throws Exception{
        JSONObject p=progress;
        if(scanning){JSONObject result=p==null?new JSONObject().put("ok",true).put("scanning",true):new JSONObject(p.toString());reconcile(result);return result;}
        if(p!=null&&!p.optBoolean("ok",true))return p;
        JSONObject data=latest;if(data==null)data=store.get("chaoxing-todo");
        if(data==null)return new JSONObject().put("ok",true).put("items",new JSONArray()).put("checkedAt",0).put("courses",0);
        JSONObject result=new JSONObject(data.toString());reconcile(result);return result.put("scanning",false);
    }
    private synchronized JSONArray readCourse(JSONObject c)throws Exception{
        String title=c.optString("title");JSONObject mm=meta(c);
        if(mm.optString("stuenc").isEmpty()||mm.optString("workEnc").isEmpty())throw new Exception("未取得作业入口");
        String url=MOOC+"/mooc2/work/list?courseId="+c.optString("courseId")+"&classId="+c.optString("classId")+"&cpi="+c.optString("cpi")+"&ut=s&t="+System.currentTimeMillis()+"&stuenc="+mm.optString("stuenc")+"&enc="+mm.optString("workEnc");
        String html=req(url,"GET",null,mm.optString("referer"),true);
        if(html.contains("无权限的操作")||html.contains("无效的用户"))throw new Exception("学习通拒绝读取，请重新绑定后再检查");
        if(lastUrl.startsWith(LOGIN)||html.contains("passport2.chaoxing.com/login"))throw new Exception("学习通登录已失效，请重新绑定");
        JSONArray rows=ChaoxingParser.works(html,lastUrl,title,System.currentTimeMillis());
        for(int n=0;n<rows.length();n++)rows.getJSONObject(n).put("courseKey",c.optString("courseId")+":"+c.optString("classId"));return rows;
    }
    private synchronized void publishProgress(JSONArray fresh,JSONArray previous,JSONArray catalog,Set<String> read,Set<String> readTitles,JSONArray failed,int completed,String title)throws Exception{
        JSONArray merged=new JSONArray(fresh.toString());
        for(int n=0;n<previous.length();n++){
            JSONObject row=previous.getJSONObject(n);String key=row.optString("courseKey");
            if(key.isEmpty()?!readTitles.contains(row.optString("course")):!read.contains(key))merged.put(new JSONObject(row.toString()).put("cached",true));
        }
        JSONObject list=new JSONObject().put("ok",true).put("scanning",true).put("completed",completed).put("courses",catalog.length()).put("course",title).put("courseCatalog",new JSONArray(catalog.toString())).put("items",merged).put("failed",new JSONArray(failed.toString())).put("checkedAt",0);
        reconcile(list);latest=new JSONObject(list.toString());progress=list;
    }
    private JSONObject readAll()throws Exception{
        JSONArray cs=courses(),items=new JSONArray(),failed=new JSONArray(),catalog=new JSONArray();Set<String> read=new HashSet<>(),readTitles=new HashSet<>();
        JSONObject old=latest==null?store.get("chaoxing-todo"):latest;JSONArray previous=old==null?null:old.optJSONArray("items");if(previous==null)previous=new JSONArray();
        for(int i=0;i<cs.length();i++){JSONObject c=cs.getJSONObject(i);catalog.put(new JSONObject().put("key",c.optString("courseId")+":"+c.optString("classId")).put("title",c.optString("title")).put("state","pending"));}
        publishProgress(items,previous,catalog,read,readTitles,failed,0,"");
        for(int i=0;i<cs.length();i++){
            JSONObject c=cs.getJSONObject(i);String title=c.optString("title"),key=c.optString("courseId")+":"+c.optString("classId");
            publishProgress(items,previous,catalog,read,readTitles,failed,i,title);Exception fatal=null;
            try{JSONArray rows=readCourse(c);for(int n=0;n<rows.length();n++)items.put(rows.get(n));read.add(key);readTitles.add(title);catalog.getJSONObject(i).put("state","done");}
            catch(Exception e){catalog.getJSONObject(i).put("state","failed");failed.put(new JSONObject().put("course",title).put("message",e.getMessage()));if(e.getMessage()!=null&&(e.getMessage().contains("限制访问")||e.getMessage().contains("登录已失效")))fatal=e;}
            publishProgress(items,previous,catalog,read,readTitles,failed,i+1,title);
            if(fatal!=null)throw fatal;
            if(i+1<cs.length())Thread.sleep(900);
        }
        JSONObject result=new JSONObject(progress.toString());return result.put("scanning",false).put("checkedAt",System.currentTimeMillis()).put("warning",failed.length()>0?failed.length()+" 门课程未能完整读取，保留这些课程上次的记录":"");
    }

    static final class WorkSession {
        String id,url,key;JSONObject summary;ChaoxingWorkDocument doc;long openedAt;boolean locked;
    }
    private WorkSession workSession;
    private String workKey(JSONObject row)throws Exception{
        URI u=URI.create(row.optString("url"));StringBuilder key=new StringBuilder();
        Map<String,String> qs=new HashMap<>();if(u.getRawQuery()!=null)for(String part:u.getRawQuery().split("&")){String[] kv=part.split("=",2);qs.put(URLDecoder.decode(kv[0],"UTF-8"),kv.length>1?URLDecoder.decode(kv[1],"UTF-8"):"");}
        for(String k:new String[]{"courseId","classId","workId","answerId","cpi"})key.append(k).append('=').append(qs.getOrDefault(k,"")).append(';');
        return key.toString();
    }
    public synchronized JSONObject openWork(int index,String expectedUrl)throws Exception{
        ensureSession();
        JSONObject list=latest==null?store.get("chaoxing-todo"):latest;JSONArray rows=list==null?null:list.optJSONArray("items");
        JSONObject row=null;if(rows!=null)for(int i=0;i<rows.length();i++)if(rows.getJSONObject(i).optString("url").equals(expectedUrl)){row=rows.getJSONObject(i);break;}
        if(row==null)throw new Exception("作业列表已更新，请重新选择");String url=row.optString("url");
        if(!url.equals(expectedUrl)||!ChaoxingParser.trusted(url))throw new Exception("作业列表已更新，请重新选择");
        String html=req(url,"GET",null,MOOC+"/",true);ChaoxingWorkDocument doc=ChaoxingWorkDocument.parse(html,lastUrl);
        WorkSession ws=new WorkSession();ws.id=UUID.randomUUID().toString();ws.url=url;ws.key=workKey(row);ws.summary=new JSONObject(row.toString());ws.doc=doc;ws.openedAt=System.currentTimeMillis();
        JSONObject pending=store.get("chaoxing-write-pending");ws.locked=pending!=null;
        if(ws.locked&&pending.optString("key").equals(ws.key)&&doc.submitted){store.put("chaoxing-write-pending",null);ws.locked=false;}
        workSession=ws;if(doc.submitted)updateWorkStatus(ws,"已提交");else if(doc.writable)clearConfirmedStatus(ws);
        saveCookies();return workPayload(ws);
    }
    private JSONObject workPayload(WorkSession ws)throws Exception{
        return new JSONObject().put("ok",true).put("sessionId",ws.id).put("workIdentity",ChaoxingParser.identity(ws.url)).put("sourceUrl",ws.url).put("title",ws.summary.optString("title")).put("course",ws.summary.optString("course")).put("status",ws.doc.submitted?"已提交":ws.summary.optString("status"))
            .put("questions",ws.doc.questions).put("canWrite",ws.doc.writable&&!ws.locked).put("submitted",ws.doc.submitted).put("uncertain",ws.locked)
            .put("notice",ws.locked?"上次写入结果尚未确认，请先核对状态；不会自动重试提交。":ws.doc.reason).put("updatedAt",System.currentTimeMillis());
    }
    private WorkSession selected(String id)throws Exception{
        ensureSession();if(workSession==null||!workSession.id.equals(id))throw new Exception("作业会话已变更，请重新打开");return workSession;
    }
    private static String form(Map<String,String> fields)throws Exception{
        StringBuilder b=new StringBuilder();for(Map.Entry<String,String> e:fields.entrySet()){if(b.length()>0)b.append('&');b.append(enc(e.getKey())).append('=').append(enc(e.getValue()));}return b.toString();
    }
    public synchronized JSONObject audio(String sessionId,String objectId)throws Exception{
        WorkSession ws=selected(sessionId);if(!ws.doc.audioIds.contains(objectId))throw new Exception("音频不属于当前作业");
        String json=req(MOOC+"/ananas/status/"+objectId,"GET",null,ws.doc.base,true);JSONObject result=new JSONObject(json);
        String media=result.optString("http");if(media.startsWith("http://"))media="https://"+media.substring(7);
        if(!"success".equals(result.optString("status"))||!ChaoxingWorkDocument.media(media))throw new Exception("音频地址暂不可用，请稍后重试");
        return new JSONObject().put("ok",true).put("url",media).put("duration",result.optInt("duration"));
    }
    public synchronized JSONObject checkWork(String sessionId)throws Exception{
        WorkSession ws=selected(sessionId);
        String html=req(ws.url,"GET",null,MOOC+"/",true);ChaoxingWorkDocument fresh=ChaoxingWorkDocument.parse(html,lastUrl);
        // Only read-only evidence of an already submitted page clears an uncertain write.
        if(fresh.submitted){ws.doc=fresh;JSONObject pending=store.get("chaoxing-write-pending");
            if(pending==null||pending.optString("key").equals(ws.key)){ws.locked=false;store.put("chaoxing-write-pending",null);}updateWorkStatus(ws,"已提交");}
        saveCookies();return workPayload(ws).put("checked",true);
    }
    public synchronized JSONObject writeWork(JSONObject input)throws Exception{
        WorkSession ws=selected(input.optString("sessionId"));String action=input.optString("action");
        boolean submit="submit".equals(action);if(!submit&&!"save".equals(action))throw new Exception("不支持的作业操作");
        if(submit&&!input.optBoolean("confirmed"))throw new Exception("请先确认提交这份作业");
        if(scanning)throw new Exception("正在检查作业列表，请稍候");
        if(ws.locked)throw new Exception("上次写入结果尚未确认，请核对状态，不要重复提交");
        if(System.currentTimeMillis()-ws.openedAt>25*60*1000)throw new Exception("作业会话已过期，请先复制未保存答案，再重新打开作业");
        LinkedHashMap<String,String> values=ws.doc.encode(input.optJSONObject("answers"),submit);
        if(submit){
            String origin=URI.create(ws.doc.base).resolve("/").toString();
            String validation=req(origin+"mooc-ans/work/validate?courseId="+enc(values.get("courseId"))+"&classId="+enc(values.get("classId"))+"&cpi="+enc(values.get("cpi")),"GET",null,ws.doc.base,true);
            JSONObject result=new JSONObject(validation);
            // Status 3 is the normal path observed in the supplied successful submission.
            if(result.optInt("status",-1)!=3)throw new Exception("学习通要求额外验证，请在学习通完成本次提交");
        }
        String target=ws.doc.action+"&ua=pc&formType=post&saveStatus=1&version=1"+(submit?"":"&pyFlag=1");
        // Persist BEFORE sending. On any ambiguous response, never retry a write automatically.
        store.put("chaoxing-write-pending",new JSONObject().put("key",ws.key).put("action",action).put("at",System.currentTimeMillis()));ws.locked=true;
        JSONObject result;
        try{
            String response=req(target,"POST",form(values),ws.doc.base,false);
            result=new JSONObject(response);
        }catch(Exception e){return new JSONObject().put("ok",true).put("uncertain",true).put("msg","请求已发出，但结果未能确认。答案仍保留在本页，请核对状态；不会自动重试。");}
        saveCookies();
        if(!result.has("status")||!(result.get("status") instanceof Boolean))return new JSONObject().put("ok",true).put("uncertain",true).put("msg","学习通返回了未识别的结果，请核对状态，不要重复提交。");
        if(!result.getBoolean("status")){
            ws.locked=false;store.put("chaoxing-write-pending",null);
            return new JSONObject().put("ok",false).put("msg",result.optString("msg","学习通未接受本次操作"));
        }
        if(submit){
            int state=result.optInt("stuStatus",-1);
            if(state!=4)return new JSONObject().put("ok",true).put("uncertain",true).put("msg","学习通已响应，但提交状态需要进一步确认，请核对状态。");
            ws.doc.submitted=true;ws.doc.writable=false;ws.doc.reason="已提交成功，当前答案已锁定";
            updateWorkStatus(ws,"已提交");
        }
        ws.locked=false;store.put("chaoxing-write-pending",null);
        return new JSONObject().put("ok",true).put("saved",!submit).put("submitted",submit).put("msg",submit?"作业提交成功":"草稿已保存到学习通");
    }
    private void updateWorkStatus(WorkSession ws,String status)throws Exception{
        String owner=session().optString("user"),identity=ChaoxingParser.identity(ws.url);long now=System.currentTimeMillis();
        JSONObject saved=store.get("chaoxing-work-states");if(saved==null||!owner.equals(saved.optString("owner")))saved=new JSONObject().put("owner",owner).put("states",new JSONObject());
        saved.getJSONObject("states").put(identity,new JSONObject().put("submitted",true).put("at",now));store.put("chaoxing-work-states",saved);
        ws.summary.put("status",status).put("state","done");
        JSONObject list=latest==null?store.get("chaoxing-todo"):latest;JSONArray rows=list==null?null:list.optJSONArray("items");
        if(rows!=null){for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);if(ChaoxingParser.identity(row.optString("url")).equals(identity)){row.put("status",status).put("state","done").put("verifiedAt",now);}}
            latest=list;store.put("chaoxing-todo",list);}
    }
    private void clearConfirmedStatus(WorkSession ws)throws Exception{
        JSONObject saved=store.get("chaoxing-work-states");if(saved!=null&&session().optString("user").equals(saved.optString("owner"))){JSONObject states=saved.optJSONObject("states");if(states!=null){states.remove(ChaoxingParser.identity(ws.url));store.put("chaoxing-work-states",saved);}}
        ws.summary.put("status","未交").put("state","todo");
        JSONObject list=latest==null?store.get("chaoxing-todo"):latest;JSONArray rows=list==null?null:list.optJSONArray("items");
        if(rows!=null){for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);if(ChaoxingParser.identity(row.optString("url")).equals(ChaoxingParser.identity(ws.url))){row.put("status","未交").put("state","todo");row.remove("verifiedAt");}}latest=list;store.put("chaoxing-todo",list);}
    }

}
