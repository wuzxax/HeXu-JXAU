package com.jxau.pocket;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
final class Http {
    static String call(String url, String method, String body, Map<String,String> headers) throws Exception {
        return call(url, method, body, headers, 12000, 20000);
    }

    static String call(String url, String method, String body, Map<String,String> headers,
                       int connectTimeout, int readTimeout) throws Exception {
        URL target=new URL(url);
        if(!"https".equals(target.getProtocol())||target.getUserInfo()!=null)throw new IOException("已阻止不安全的接口连接");
        HttpURLConnection c=(HttpURLConnection)target.openConnection();
        c.setInstanceFollowRedirects(false);
        c.setRequestMethod(method);c.setConnectTimeout(connectTimeout);c.setReadTimeout(readTimeout);
        c.setRequestProperty("User-Agent",CasClient.UA);
        if(headers!=null)for(Map.Entry<String,String> e:headers.entrySet())c.setRequestProperty(e.getKey(),e.getValue());
        try {
            if(body!=null){c.setDoOutput(true);try(OutputStream out=c.getOutputStream()){out.write(body.getBytes(StandardCharsets.UTF_8));}}
            int code=c.getResponseCode();
            if(code>=300&&code<400)throw new IOException("平台接口地址已变化，请更新应用后重试");
            try(InputStream in=code>=400?c.getErrorStream():c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
                if(in!=null){byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))>0){if(out.size()+n>4*1024*1024)throw new IOException("响应超过大小限制");out.write(buffer,0,n);}}
                if(code>=400)throw new IOException("平台返回HTTP "+code+"，请稍后重试");
                return out.toString("UTF-8");
            }
        }finally{c.disconnect();}
    }
    static Map<String,String> headers(String...pairs){Map<String,String> result=new HashMap<>();for(int i=0;i+1<pairs.length;i+=2)result.put(pairs[i],pairs[i+1]);return result;}
    static String enc(String s)throws Exception{return URLEncoder.encode(s==null?"":s,"UTF-8");}
}
