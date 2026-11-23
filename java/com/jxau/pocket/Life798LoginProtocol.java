package com.jxau.pocket;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** App-channel SMS login, per life-798 issue #32. Not the 3.1.10 dynamic protocol. */
final class Life798LoginProtocol {
    static final String VERSION="3.1.9";
    // Public protocol parameter documented by issue #32; not an account credential.
    private static final String SALT="AbCdEfGhIjKlMnOpQrStUvWxYz12345";
    private Life798LoginProtocol(){}

    static String sign(String phone,String smsCode)throws Exception{
        if(phone==null||smsCode==null||!phone.matches("1[0-9]{10}")||!smsCode.matches("[0-9]{4,8}"))
            throw new IllegalArgumentException("请输入本人手机号和短信验证码");
        String content="authCode="+smsCode+"&un="+phone+SALT;
        byte[] digest=MessageDigest.getInstance("MD5").digest(content.getBytes(StandardCharsets.UTF_8));
        char[] hex="0123456789abcdef".toCharArray(),out=new char[digest.length*2];
        for(int i=0;i<digest.length;i++){out[i*2]=hex[(digest[i]&255)>>>4];out[i*2+1]=hex[digest[i]&15];}
        return new String(out);
    }

    static String loginPath(String phone,String smsCode)throws Exception{
        return "/acc/login?sign="+sign(phone,smsCode);
    }
}
