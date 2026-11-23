package com.jxau.pocket;

import android.util.Base64;
import org.json.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Public community protocol; all account-specific actions originate from the binding screen. */
public final class WanxiaoClient {
    private static final String BASE="https://app.17wanxiao.com/campus";
    private static final String MODEL="JxauPocket";
    private static final String APP_UA="Dalvik/2.1.0 (Linux; U; Android 12; JxauPocket)";
    private final SecureStore store;
    public WanxiaoClient(SecureStore store){this.store=store;}
    private JSONObject state()throws Exception{JSONObject s=store.get("wanxiao");return s==null?new JSONObject():s;}
    private static String b64(byte[] bytes){return Base64.encodeToString(bytes,Base64.NO_WRAP);}
    private static String encrypt(String value,String key)throws Exception{
        Cipher c=Cipher.getInstance("DESede/CBC/PKCS5Padding");
        c.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(key.getBytes(StandardCharsets.US_ASCII),"DESede"),new IvParameterSpec("66666666".getBytes(StandardCharsets.US_ASCII)));
        return b64(c.doFinal(value.getBytes(StandardCharsets.UTF_8)));
    }
    private static String decrypt(String value,String key)throws Exception{
        Cipher c=Cipher.getInstance("DESede/CBC/PKCS5Padding");
        c.init(Cipher.DECRYPT_MODE,new SecretKeySpec(key.getBytes(StandardCharsets.US_ASCII),"DESede"),new IvParameterSpec("66666666".getBytes(StandardCharsets.US_ASCII)));
        return new String(c.doFinal(Base64.decode(value,Base64.DEFAULT)),StandardCharsets.UTF_8);
    }
    private static String sha(String text)throws Exception{
        StringBuilder result=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)))result.append(String.format(Locale.US,"%02x",b&255));return result.toString();
    }
    private void handshake(JSONObject s)throws Exception{
        KeyPairGenerator generator=KeyPairGenerator.getInstance("RSA");generator.initialize(1024);KeyPair pair=generator.generateKeyPair();
        String publicKey=b64(pair.getPublic().getEncoded());StringBuilder wrapped=new StringBuilder();
        for(int i=0;i<publicKey.length();i+=64)wrapped.append(publicKey.substring(i,Math.min(publicKey.length(),i+64))).append('\n');
        String raw;
        try {
            raw=Http.call(BASE+"/cam_iface46/exchangeSecretkey.action","POST",new JSONObject().put("key",wrapped.toString()).toString(),Http.headers("Content-Type","application/text","User-Agent",APP_UA));
        } catch(Exception e) {
            throw new Exception("完美校园登录握手失败："+e.getMessage()+"；请稍后重试或使用官方渠道");
        }
        Cipher cipher=Cipher.getInstance("RSA/ECB/PKCS1Padding");cipher.init(Cipher.DECRYPT_MODE,pair.getPrivate());
        JSONObject answer=new JSONObject(new String(cipher.doFinal(Base64.decode(raw.trim(),Base64.DEFAULT)),StandardCharsets.UTF_8));
        s.put("session",answer.getString("session")).put("appKey",answer.getString("key").substring(0,24));
        if(!s.has("deviceId"))s.put("deviceId",UUID.randomUUID().toString().replace("-",""));
        store.put("wanxiao",s);
    }
    private static JSONObject base(JSONObject s,String path)throws Exception{
        return new JSONObject().put("appCode","M002").put("deviceId",s.getString("deviceId")).put("netWork","wifi")
            .put("qudao","guanwang").put("requestMethod","cam_iface46/"+path).put("shebeixinghao",MODEL)
            .put("systemType","android").put("telephoneInfo","12").put("telephoneModel",MODEL);
    }
    private JSONObject envelope(JSONObject s,String path,JSONObject args)throws Exception{
        String payload=new JSONObject().put("session",s.getString("session")).put("data",encrypt(args.toString(),s.getString("appKey"))).toString();
        JSONObject result=new JSONObject(Http.call(BASE+"/cam_iface46/"+path,"POST",payload,Http.headers("Content-Type","application/text","User-Agent",APP_UA,"campusSign",sha(payload))));
        if(result.has("data")&&!result.optString("data").isEmpty()){
            try{result.put("plain",new JSONObject(decrypt(result.getString("data"),s.getString("appKey"))));}catch(Exception ignored){}
        }
        return result;
    }
    private JSONObject finish(JSONObject s,JSONObject result)throws Exception{
        if(!("true".equalsIgnoreCase(result.optString("result_"))))return new JSONObject().put("ok",false).put("msg",result.optString("message_","登录失败，请核对账号或使用短信验证"));
        JSONObject plain=result.optJSONObject("plain"),user=plain==null?null:plain.optJSONObject("user");
        if(user==null)throw new Exception("登录响应缺少用户信息，请使用官方App确认账号状态");
        s.put("user",user).put("loggedIn",true).put("updatedAt",System.currentTimeMillis());
        String school=user.optString("customId",user.optString("ecardCustomerid",""));
        if(!school.isEmpty())s.put("schoolcode",school);
        store.put("wanxiao",s);
        return status();
    }
    public synchronized JSONObject login(JSONObject body)throws Exception{
        JSONObject s=state();String phone=body.optString("phone").trim();
        if(!phone.matches("1[0-9]{10}"))throw new IllegalArgumentException("请输入本人完美校园手机号");
        s.put("phone",phone);handshake(s);
        String password=body.optString("password");if(password.isEmpty())throw new IllegalArgumentException("请输入完美校园密码");
        JSONArray parts=new JSONArray();for(int i=0;i<password.length();i++)parts.put(encrypt(password.substring(i,i+1),s.getString("appKey")));
        JSONObject args=base(s,"loginnew.action").put("password",parts).put("type","1").put("userName",phone).put("wanxiaoVersion",10589101);
        return finish(s,envelope(s,"loginnew.action",args));
    }
    public synchronized JSONObject sms(JSONObject body)throws Exception{
        JSONObject s=state();String phone=body.optString("phone").trim();
        if(!phone.matches("1[0-9]{10}"))throw new IllegalArgumentException("请输入本人完美校园手机号");
        if(System.currentTimeMillis()-s.optLong("lastSms")<60000)throw new IllegalArgumentException("请60秒后再获取验证码");
        s.put("phone",phone);handshake(s);
        JSONObject args=base(s,"gainMatrixCaptcha543.action").put("action","registAndLogin").put("confirm",false).put("mobile",phone).put("type","sms");
        JSONObject result=envelope(s,"gainMatrixCaptcha543.action",args);
        s.put("lastSms",System.currentTimeMillis());store.put("wanxiao",s);
        return new JSONObject().put("ok","true".equalsIgnoreCase(result.optString("result_"))).put("msg",result.optString("message_","请检查手机短信"));
    }
    public synchronized JSONObject smsLogin(JSONObject body)throws Exception{
        JSONObject s=state();if(!s.has("lastSms"))throw new IllegalArgumentException("请先获取验证码");
        String code=body.optString("code").trim();if(!code.matches("[0-9]{4,8}"))throw new IllegalArgumentException("请输入短信验证码");
        return finish(s,envelope(s,"registerUsersByTelAndLoginNew.action",base(s,"registerUsersByTelAndLoginNew.action")
            .put("mobile",s.getString("phone")).put("sms",code).put("type","2").put("wanxiaoVersion",10589101)));
    }
    public synchronized JSONObject status()throws Exception{
        JSONObject s=state();return new JSONObject().put("ok",true).put("bound",s.optBoolean("loggedIn"))
            .put("schoolcode",s.optString("schoolcode")).put("updatedAt",s.optLong("updatedAt"))
            .put("lightingReady",false).put("lightingMessage","照明项目6990已定位，账号登录与房间查询仍待实测核验");
    }
    public synchronized void unbind()throws Exception{store.put("wanxiao",null);}
}
