package com.jxau.pocket;
import android.util.Base64;
import org.json.*;
import java.net.*;
import java.io.*;
import java.util.*;

/** Read-only wallet/history integration. SMS is sent only by the binding form. */
public final class Life798Client {
    private static final String BASE="https://i.ilife798.com/api/v1";
    // Protocol headers must match the issue #32 MD5 login, not the installed app's versionName.
    private static final String ACCOUNT_VERSION=Life798LoginProtocol.VERSION;
    private final SecureStore store;
    private String captchaSeed="";
    private long lastSms;
    public Life798Client(SecureStore store){this.store=store;}
    private Map<String,String> headers(String token){
        Map<String,String> result=Http.headers("ApplicationType","1,1","VersionCode",ACCOUNT_VERSION,"User-Agent","Android_ilife798_"+ACCOUNT_VERSION,"Content-Type","application/json; charset=UTF-8","Accept-Language","zh-Hans-CN;q=1");
        if(token!=null&&!token.isEmpty())result.put("Authorization",token);return result;
    }
    private JSONObject session()throws Exception{
        JSONObject s=store.get("life798");if(s==null||s.optString("token").isEmpty())throw new Exception("798登录状态已过期，请重新绑定");return s;
    }
    private JSONObject request(String path,JSONObject body,String token)throws Exception{
        JSONObject result=new JSONObject(Http.call(BASE+path,body==null?"GET":"POST",body==null?null:body.toString(),headers(token)));
        int code=result.optInt("code",-1);
        if(code<0){if(code==-99)throw new Exception("798登录状态已过期，请重新绑定");throw new Exception(result.optString("msg","798请求失败"));}
        return result;
    }
    public synchronized JSONObject captcha()throws Exception{
        captchaSeed=String.valueOf(new java.security.SecureRandom().nextDouble());
        URL url=new URL(BASE+"/captcha/?s="+Http.enc(captchaSeed)+"&r="+System.currentTimeMillis());
        HttpURLConnection c=(HttpURLConnection)url.openConnection();c.setConnectTimeout(10000);c.setReadTimeout(15000);
        for(Map.Entry<String,String> h:headers("").entrySet())c.setRequestProperty(h.getKey(),h.getValue());
        try{
            if(c.getResponseCode()!=200||c.getContentType()==null||!c.getContentType().startsWith("image/"))throw new Exception("798验证码加载失败，点击图片重试");
            try(InputStream input=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
                byte[] bytes=new byte[4096];int n;while((n=input.read(bytes))>0){if(out.size()+n>262144)throw new Exception("验证码图片过大");out.write(bytes,0,n);}
                return new JSONObject().put("ok",true).put("s",captchaSeed).put("img","data:"+c.getContentType().split(";")[0]+";base64,"+Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP));
            }
        }finally{c.disconnect();}
    }
    public synchronized JSONObject sms(JSONObject body)throws Exception{
        String phone=body.optString("phone").trim(),code=body.optString("captcha").trim(),seed=body.optString("s");
        if(!phone.matches("1[0-9]{10}"))throw new IllegalArgumentException("请输入本人798手机号");
        if(code.isEmpty()||captchaSeed.isEmpty()||!captchaSeed.equals(seed))throw new IllegalArgumentException("请输入当前图形验证码");
        if(System.currentTimeMillis()-lastSms<60000)throw new IllegalArgumentException("请60秒后再获取验证码");
        lastSms=System.currentTimeMillis();
        JSONObject result=request("/acc/login/code",new JSONObject().put("un",phone).put("authCode",code).put("s",Double.parseDouble(seed)),"");
        return new JSONObject().put("ok",true).put("msg",result.optString("msg","验证码已发送"));
    }
    public synchronized JSONObject login(JSONObject body)throws Exception{
        String phone=body.optString("phone").trim(),code=body.optString("code").trim();
        JSONObject active=store.get("water-device-active"),old=store.get("life798");if(active!=null&&active.length()>0&&(old==null||!phone.equals(old.optString("phone"))))throw new IllegalArgumentException("仍有接水请求未结束，请先结束接水后再切换账号；当前账号可以重新验证登录");
        if(!phone.matches("1[0-9]{10}")||!code.matches("[0-9]{4,8}"))throw new IllegalArgumentException("请输入本人手机号和短信验证码");
        JSONObject result;
        try{
            result=request(Life798LoginProtocol.loginPath(phone,code),new JSONObject().put("un",phone).put("authCode",code),"");
        }catch(Exception error){
            String message=error.getMessage();
            if(message!=null&&(message.contains("升级")||message.contains("最新版")||message.contains("验签")))
                throw new Exception("798登录校验未通过，请更新禾序的798登录适配（平台提示："+message+"）；无需反复获取短信验证码。");
            // Some transport failures include the signed URL. Keep credentials/signatures out of UI errors.
            if(error instanceof IOException||(message!=null&&message.contains("sign=")))
                throw new Exception("798登录网络请求未完成，请检查网络后重试；未更改原有绑定。");
            throw error;
        }
        JSONObject data=result.optJSONObject("data"),al=data==null?null:data.optJSONObject("al");
        if(al==null||al.optString("token").isEmpty())throw new Exception("798未返回有效登录凭证，请重新验证");
        store.put("life798",new JSONObject().put("token",al.getString("token")).put("uid",al.optString("uid")).put("phone",phone).put("updatedAt",System.currentTimeMillis()));
        store.put("life798-wallet-cache",null);store.put("life798-history-cache",null);store.put("life798-spending-cache",null);return status();
    }
    public synchronized JSONObject status()throws Exception{
        JSONObject s=store.get("life798");return new JSONObject().put("ok",true).put("bound",s!=null&&!s.optString("token").isEmpty())
            .put("accountKey",s==null?"":accountKey(s))
            .put("selectedEid",s==null?"":s.optString("selectedEid")).put("selectedName",s==null?"":s.optString("selectedName"))
            .put("updatedAt",s==null?0:s.optLong("updatedAt"));
    }
    private static String accountKey(JSONObject s)throws Exception{
        String identity=s.optString("phone");if(identity.isEmpty())identity=s.optString("uid");
        byte[] bytes=java.security.MessageDigest.getInstance("SHA-256").digest(identity.getBytes("UTF-8"));StringBuilder key=new StringBuilder();for(byte b:bytes)key.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return key.toString();
    }
    public synchronized JSONObject selectWallet(JSONObject body)throws Exception{
        JSONObject s=session();String eid=body.optString("eid");
        JSONObject cached=store.get("life798-wallet-cache");JSONArray wallets=cached==null?null:cached.optJSONArray("wallets");
        if(wallets!=null)for(int i=0;i<wallets.length();i++){
            JSONObject wallet=wallets.optJSONObject(i);
            if(wallet!=null&&!eid.isEmpty()&&eid.equals(wallet.optString("id"))){
                s.put("selectedEid",eid).put("selectedName",wallet.optString("name"));store.put("life798",s);return status();
            }
        }
        throw new IllegalArgumentException("请先加载钱包列表，再选择本人校区钱包");
    }
    public synchronized JSONObject wallet(String eid)throws Exception{
        JSONObject s=session();
        if(eid==null||eid.isEmpty())eid=s.optString("selectedEid");
        try{
            JSONObject response=request("/acc/wallet/owner?eid="+Http.enc(eid)+"&all=true",null,s.getString("token"));
            JSONObject data=response.optJSONObject("data"),aw=data==null?null:data.optJSONObject("aw");
            if(aw==null||!aw.has("total")||aw.isNull("total"))throw new Exception("798未返回钱包余额，请在官方798确认已开通钱包");
            JSONObject ep=aw.optJSONObject("ep");
            if(!eid.isEmpty()&&(ep==null||!eid.equals(ep.optString("id"))))throw new Exception("798未返回所选校区钱包，请刷新或重新选择；未切换到其他钱包");
            JSONObject result=new JSONObject().put("ok",true).put("balance",aw.getDouble("total")).put("total",aw.getDouble("total"))
                .put("eid",ep==null?eid:ep.optString("id",eid)).put("name",ep==null?"当前钱包":ep.optString("name","当前钱包"))
                .put("updatedAt",System.currentTimeMillis()).put("walletUpdatedAt",aw.optString("utime"));
            for(String field:new String[]{"olCash","olGift","ofCash","ofGift"})if(aw.has(field)&&!aw.isNull(field))result.put(field,aw.getDouble(field));
            JSONArray wallets=new JSONArray(),eps=data.optJSONArray("eps");
            if(eps!=null)for(int i=0;i<eps.length();i++){
                JSONObject item=eps.optJSONObject(i);if(item==null)continue;JSONObject merchant=item.optJSONObject("ep");if(merchant==null)merchant=item;
                if(!merchant.optString("id").isEmpty())wallets.put(new JSONObject().put("id",merchant.optString("id")).put("name",merchant.optString("name",merchant.optString("abbr",merchant.optString("id")))));
            }
            if(wallets.length()==0)wallets.put(new JSONObject().put("id",result.optString("eid")).put("name",result.optString("name")));
            result.put("wallets",wallets);store.put("life798-wallet-cache",result);return result;
        }catch(Exception e){return cache("life798-wallet-cache",eid,e);}
    }
    public synchronized JSONObject history(int page)throws Exception{
        if(page<1||page>1000)throw new IllegalArgumentException("页码无效");JSONObject s=session();
        try{
            JSONObject response=request("/bill/lst-owner?page="+(page-1)+"&size=10&status=3&hasCount=true",null,s.getString("token"));
            JSONArray data=response.optJSONArray("data");if(data==null)throw new Exception("798未返回消费列表");
            JSONArray list=new JSONArray();
            for(int i=0;i<data.length();i++){
                JSONObject item=data.optJSONObject(i);if(item==null)continue;
                list.put(WaterSpending.normalize(item));
            }
            JSONObject result=new JSONObject().put("ok",true).put("list",list).put("page",page).put("pageSize",10).put("updatedAt",System.currentTimeMillis());
            if(response.has("size"))result.put("total",response.getInt("size"));
            new WaterLedger(store).merge(accountKey(s),list,System.currentTimeMillis(),false);
            store.put("life798-history-cache",result);return result;
        }catch(Exception e){return cache("life798-history-cache",String.valueOf(page),e);}
    }
    public synchronized JSONObject spending(boolean refresh)throws Exception{
        JSONObject account=session();String owner=accountKey(account);long now=System.currentTimeMillis();long[] starts=WaterSpending.boundaries(now);
        JSONObject cached=store.get("life798-spending-cache");
        boolean matches=cached!=null&&owner.equals(cached.optString("owner"))&&cached.optLong("dayStart")==starts[0]&&cached.optLong("weekStart")==starts[1]&&cached.optLong("monthStart")==starts[2];
        if(!refresh&&matches&&store.get("water-ledger-"+owner)!=null&&now-cached.optLong("updatedAt")<300000)return new JSONObject(cached.toString()).put("fromCache",true);
        JSONArray rows=new JSONArray();Set<String> seen=new HashSet<>();boolean complete=false;String warning="";long began=now;
        try{
            for(int p=0;p<20;p++){
                JSONObject response=request("/bill/lst-owner?page="+p+"&size=50&status=3&hasCount=true",null,account.getString("token"));
                JSONArray data=response.optJSONArray("data");if(data==null)throw new Exception("798未返回完整消费列表");
                int added=0;for(int n=0;n<data.length();n++){
                    JSONObject item=data.optJSONObject(n);if(item==null)continue;JSONObject row=WaterSpending.normalize(item);String id=row.optString("id");
                    if(!id.isEmpty()&&!seen.add(id))continue;rows.put(row);added++;
                }
                if(data.length()==0){complete=true;break;}
                // Do not assume a short page means the server honored the requested size.
                if(added==0){warning="账单分页重复，统计可能不完整";break;}
                if(System.currentTimeMillis()-began>45000){warning="账单读取时间较长，当前显示已读取部分";break;}
            }
        }catch(Exception e){
            if(e.getMessage()!=null&&e.getMessage().contains("重新绑定"))throw e;
            if(rows.length()==0){
                JSONObject local=new WaterLedger(store).summary(owner,now,false);
                if(local.optInt("archiveCount")==0)throw e;
                return local.put("owner",owner).put("cached",true).put("warning","更新失败，按本机已保存账单统计；"+e.getMessage());
            }
            warning="部分账单读取失败，统计可能不完整；"+e.getMessage();
        }
        if(!complete&&warning.isEmpty())warning="账单较多，当前统计基于已读取的最多1000笔记录";
        WaterLedger ledger=new WaterLedger(store);ledger.merge(owner,rows,now,complete);
        JSONObject result=ledger.summary(owner,now,complete).put("owner",owner).put("warning",warning).put("scope","当前798账号的全部钱包；合并本机已保存账单，按实际支付金额统计，不含充值、退款与积分抵扣。未同步的历史可能缺失，卸载或清除数据后本地记录会丢失");
        if(result.optInt("invalidRecords")>0)result.put("warning",warning+" "+result.optInt("invalidRecords")+" 笔金额或时间不完整，未计入统计");
        store.put("life798-spending-cache",result);return result;
    }
    public synchronized JSONObject spendingDetail(String category,String period,String date)throws Exception{
        return new WaterLedger(store).detail(accountKey(session()),category,period,date,System.currentTimeMillis());
    }
    private JSONObject cache(String key,String wanted,Exception cause)throws Exception{
        if(cause.getMessage()!=null&&cause.getMessage().contains("重新绑定"))throw cause;
        JSONObject cached=store.get(key);
        boolean matches=cached!=null&&(key.contains("wallet")?(wanted.isEmpty()||wanted.equals(cached.optString("eid"))):wanted.equals(cached.optString("page")));
        if(!matches)throw cause;return cached.put("cached",true).put("warning","网络暂不可用，显示上次缓存；"+cause.getMessage());
    }
    public synchronized void unbind()throws Exception{
        JSONObject active=store.get("water-device-active");if(active!=null&&active.length()>0)throw new IllegalArgumentException("仍有接水请求未结束，请先结束接水后再解绑");
        store.put("life798",null);store.put("life798-wallet-cache",null);store.put("life798-history-cache",null);store.put("life798-spending-cache",null);captchaSeed="";
    }
}
