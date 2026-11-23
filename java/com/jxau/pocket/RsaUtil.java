package com.jxau.pocket;

import java.math.BigInteger;

/**
 * CAS 登录密码加密：RSA-1024，无填充，明文按小端整数处理。
 * 与学校前端 app.js 的实现一致。
 */
public class RsaUtil {
    private static final String MOD =
        "00b5eeb166e069920e80bebd1fea4829d3d1f3216f2aabe79b6c47a3c18dcee5fd22c2e7ac" +
        "519cab59198ece036dcf289ea8201e2a0b9ded307f8fb704136eaeb670286f5ad44e691005ba9e" +
        "a5af04ada5367cd724b5a26fdb5120cc95b6431604bd219c6b7d83a6f8f24b43918ea988a76f93" +
        "c333aa5a20991493d4eb1117e7b1";
    private static final BigInteger N = new BigInteger(MOD, 16);
    private static final BigInteger E = BigInteger.valueOf(65537);

    public static String encrypt(String plain) {
        byte[] bytes = plain.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        byte[] be = new byte[bytes.length];
        for (int i = 0; i < bytes.length; i++) {
            be[i] = bytes[bytes.length - 1 - i];
        }
        BigInteger m = new BigInteger(1, be);
        String hex = m.modPow(E, N).toString(16);
        StringBuilder sb = new StringBuilder(256);
        for (int i = hex.length(); i < 256; i++) sb.append('0');
        sb.append(hex);
        return sb.toString();
    }
}
