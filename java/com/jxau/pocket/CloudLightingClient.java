package com.jxau.pocket;

import org.json.*;
import java.net.*;
import java.util.*;

/** Own-account read-only lighting integration, verified against the user's HAR. */
public final class CloudLightingClient {
    private static final String BASE="https://h5cloud.17wanxiao.com:18443/CloudPayment/";
    private static final String PROJECT="6990", SCHOOL="284";
    private final SecureStore store;
    private String active="";
    private final Map<Integer,Map<String,String>> choices=new HashMap<>();
    private final Map<Integer,String> parents=new HashMap<>();

    public CloudLightingClient(SecureStore store){this.store=store;}

    private JSONObject state()throws Exception{
        JSONObject s=store.get("lighting-auth");
        if(s==null||s.optString("openid").isEmpty())throw new Exception("请先导入本人照明授权HAR");
        return s;
    }

    public synchronized JSONObject status()throws Exception{
        JSONObject s=store.get("lighting-auth"),room=store.get("lighting-room");
        return new JSONObject().put("ok",true).put("bound",s!=null).put("roomSelected",room!=null)
            .put("roomName",room==null?"":room.optString("name"));
    }

    public synchronized JSONObject importHar(String raw)throws Exception{
        if(raw.length()>8388608)throw new IllegalArgumentException("HAR文件请小于8MB");
        JSONArray entries;
        try{entries=new JSONObject(raw).getJSONObject("log").getJSONArray("entries");}
        catch(Exception e){throw new IllegalArgumentException("HAR格式无效，请选择完整抓包文件");}
        JSONObject candidate=null;String latest="";
        for(int i=0;i<entries.length();i++){
            JSONObject e=entries.optJSONObject(i);if(e==null)continue;
            JSONObject response=e.optJSONObject("response"),req=e.optJSONObject("request");
            if(response==null||response.optInt("status")!=302||req==null||!"GET".equals(req.optString("method")))continue;
            URL u;try{u=new URL(req.optString("url"));}catch(Exception ignored){continue;}
            if(!"https".equals(u.getProtocol())||!LightingTransport.HOST.equals(u.getHost())||u.getPort()!=18443||u.getUserInfo()!=null||!"/CloudPayment/user/pay.do".equals(u.getPath()))continue;
            Map<String,String> q=query(u.getQuery());if(!"CUSTOM_OFFICIAL_ACCOUNTS_WX".equals(q.get("hostType")))continue;
            JSONObject s=new JSONObject();boolean valid=true;
            for(String key:new String[]{"openid","secret","token"}){
                String value=q.get(key);
                if(value==null||value.isEmpty()||value.length()>4096||value.contains("\r")||value.contains("\n")){valid=false;break;}
                s.put(key,value);
            }
            String time=e.optString("startedDateTime");
            if(valid&&(candidate==null||time.compareTo(latest)>=0)){candidate=s;latest=time;}
        }
        if(candidate==null)throw new IllegalArgumentException("未找到本人照明微信授权，请抓取从公众号进入照明页面的完整HAR");
        active="";
        try{ensure(candidate);}
        catch(Exception e){active="";throw new Exception("HAR授权验证失败，请在微信重新打开照明页面后重新导入");}
        // Save only extracted, validated authorization; never persist the HAR itself.
        store.put("lighting-auth",candidate);store.put("lighting-room",null);store.put("lighting-cache",null);
        choices.clear();parents.clear();return status();
    }

    private static Map<String,String> query(String text)throws Exception{
        Map<String,String> q=new HashMap<>();
        if(text!=null)for(String p:text.split("&")){String[] a=p.split("=",2);q.put(URLDecoder.decode(a[0],"UTF-8"),a.length>1?URLDecoder.decode(a[1],"UTF-8"):"");}
        return q;
    }

    private LightingTransport.Reply get(JSONObject s,String path,String referer)throws Exception{
        String cookie=s.optString("cookie");
        if(!cookie.isEmpty()&&!cookie.matches("[A-Za-z0-9._~+/%=-]{1,512}"))throw new Exception("照明会话无效");
        LightingTransport.Reply r=LightingTransport.get(new URL(BASE+path),cookie.isEmpty()?"":"SESSION="+cookie,referer);
        List<String> rows=r.headers.get("set-cookie");
        if(rows!=null)for(String row:rows)for(HttpCookie c:HttpCookie.parse(row))if("SESSION".equals(c.getName()))s.put("cookie",c.getValue());
        return r;
    }

    private String page(JSONObject s,String path)throws Exception{
        LightingTransport.Reply r=get(s,path,BASE+"bill/selectPayProject.do?"+projectQuery());
        if(r.code!=200)throw new Exception("照明响应异常");return r.body;
    }

    private static String projectQuery()throws Exception{
        return "txcode=2&interurl=substituted_pay&payProId="+PROJECT+"&amtflag=0&payamt=1000&payproname="+Http.enc("学生照明用电缴费")+"&subPayProId=&fixamtlist=";
    }

    private void ensure(JSONObject s)throws Exception{
        String identity=s.getString("openid")+":"+s.getString("token");if(identity.equals(active))return;
        String path="user/pay.do?hostType=CUSTOM_OFFICIAL_ACCOUNTS_WX&versioncode=10430100";
        for(String k:new String[]{"openid","secret","token"})path+="&"+k+"="+Http.enc(s.getString(k));
        s.remove("cookie");
        LightingTransport.Reply login=get(s,path,BASE+"bill/type.do");
        URL destination=new URL(new URL(BASE+path),login.header("location"));
        if(login.code!=302||!LightingTransport.HOST.equals(destination.getHost())||!"https".equals(destination.getProtocol())||destination.getPort()!=18443||!"/CloudPayment/bill/type.do".equals(destination.getPath())||destination.getQuery()!=null||s.optString("cookie").isEmpty())throw new Exception("未建立有效照明授权");
        page(s,"bill/type.do");
        JSONObject projects=new JSONObject(page(s,"bill/querySelfPayList.do"));
        JSONArray list=projects.optJSONArray("payprolist");boolean found=false;
        if(list!=null)for(int i=0;i<list.length();i++)if(PROJECT.equals(list.getJSONObject(i).optString("id")))found=true;
        if(!found)throw new Exception("账号未返回照明项目6990");
        page(s,"bill/selectPayProject.do?"+projectQuery());active=identity;
    }

    private JSONObject request(String path,boolean rooms)throws Exception{
        JSONObject s=state();
        for(int attempt=0;attempt<2;attempt++){
            try{
                ensure(s);JSONObject data=new JSONObject(page(s,path));
                if(rooms?data.optJSONArray("roomlist")==null:!"100".equals(data.optString("returncode")))throw new Exception("业务响应无效");
                store.put("lighting-auth",s);return data;
            }catch(Exception e){active="";}
        }
        throw new Exception("照明查询未成功，请稍后刷新；若持续失败，请重新导入本人授权HAR");
    }

    public synchronized JSONObject levels(JSONObject body)throws Exception{
        int n=body.optInt("level",1);if(n<1||n>4)throw new IllegalArgumentException("房间层级无效");
        String[] fields={"areaid","buildid","levelid"};
        for(int i=1;i<n;i++){
            String id=body.optString(fields[i-1]);Map<String,String> known=choices.get(i);
            if(known==null||!known.containsKey(id)||(i<n-1&&!id.equals(parents.get(i))))throw new IllegalArgumentException("请按顺序选择本人宿舍");
        }
        String path="user/getRoom.do?payProId="+PROJECT+"&schoolcode="+SCHOOL+"&businesstype=2&optype="+n;
        for(String field:new String[]{"areaid","buildid","unitid","levelid"}){
            int i=Arrays.asList(fields).indexOf(field);String value=i>=0&&i<n-1?body.optString(field):"0";
            path+="&"+field+"="+Http.enc(value);
        }
        JSONArray list=request(path,true).getJSONArray("roomlist");Map<String,String> values=new HashMap<>();
        for(int i=0;i<list.length();i++){JSONObject row=list.getJSONObject(i);values.put(row.getString("id"),row.optString("name"));}
        for(int i=n;i<=4;i++){choices.remove(i);parents.remove(i);}
        if(n>1)parents.put(n-1,body.optString(fields[n-2]));choices.put(n,values);
        return new JSONObject().put("ok",true).put("list",list).put("level",n);
    }

    public synchronized JSONObject summary(String room)throws Exception{
        JSONObject selected=store.get("lighting-room");
        if(room==null||room.isEmpty()){if(selected==null)throw new IllegalArgumentException("请选择本人宿舍");room=selected.getString("id");}
        Map<String,String> values=choices.get(4);
        if((selected==null||!room.equals(selected.optString("id")))&&(values==null||!values.containsKey(room)))throw new IllegalArgumentException("请先逐级选择本人宿舍");
        JSONObject data=request("user/getRoomState.do?payProId="+PROJECT+"&schoolcode="+SCHOOL+"&businesstype=2&roomverify="+Http.enc(room),false);
        if(!data.has("quantity")||data.isNull("quantity"))throw new Exception("未返回剩余电量");
        double value=data.getDouble("quantity");if(Double.isNaN(value)||Double.isInfinite(value))throw new Exception("剩余电量无效");
        String name=values!=null&&values.containsKey(room)?values.get(room):selected.optString("name");
        JSONObject result=new JSONObject().put("ok",true).put("quantity",value).put("unit",data.optString("quantityunit","度")).put("updatedAt",System.currentTimeMillis()).put("roomName",name);
        store.put("lighting-room",new JSONObject().put("id",room).put("name",name));store.put("lighting-cache",result);return result;
    }

    public synchronized void unbind()throws Exception{
        store.put("lighting-auth",null);store.put("lighting-room",null);store.put("lighting-cache",null);active="";choices.clear();parents.clear();
    }
}
