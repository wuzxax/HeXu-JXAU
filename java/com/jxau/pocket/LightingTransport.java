package com.jxau.pocket;
import java.net.*;
import java.io.*;
import java.util.*;
import java.util.zip.GZIPInputStream;
import javax.net.ssl.*;

/** Original hostname, SNI and standard TLS validation even when DNS returns loopback. */
final class LightingTransport {
    static final String HOST="h5cloud.17wanxiao.com";
    // Address observed in successful user HAR on 2026-10-25, only for broken DNS.
    static final String FALLBACK="124.71.132.148";
    static final class Reply {
        int code; String body; Map<String,List<String>> headers=new HashMap<>();
        String header(String name){List<String> v=headers.get(name);return v==null||v.isEmpty()?"":v.get(0);}
    }
    static Reply get(URL url,String cookie,String referer)throws Exception{
        if(!"https".equals(url.getProtocol())||!HOST.equals(url.getHost())||url.getPort()!=18443||!url.getPath().startsWith("/CloudPayment/"))throw new IllegalArgumentException("照明请求地址无效");
        InetAddress address;try{address=InetAddress.getByName(HOST);if(nonPublic(address))address=InetAddress.getByName(FALLBACK);}catch(UnknownHostException e){address=InetAddress.getByName(FALLBACK);}
        Socket tcp=new Socket();
        try{
            tcp.connect(new InetSocketAddress(address,18443),10000);tcp.setSoTimeout(15000);
            try(SSLSocket ssl=(SSLSocket)((SSLSocketFactory)SSLSocketFactory.getDefault()).createSocket(tcp,HOST,18443,true)){
                SSLParameters params=ssl.getSSLParameters();params.setEndpointIdentificationAlgorithm("HTTPS");params.setServerNames(Collections.singletonList(new SNIHostName(HOST)));ssl.setSSLParameters(params);ssl.startHandshake();
                String req="GET "+url.getFile()+" HTTP/1.1\r\nHost: "+HOST+":18443\r\nConnection: close\r\nAccept-Encoding: gzip\r\nUser-Agent: Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Mobile Safari/537.36 MicroMessenger/8.0.50\r\nAccept: application/json, text/html, */*\r\nX-Requested-With: XMLHttpRequest\r\nReferer: "+referer+"\r\n"+(cookie.isEmpty()?"":"Cookie: "+cookie+"\r\n")+"\r\n";
                ssl.getOutputStream().write(req.getBytes("UTF-8"));ssl.getOutputStream().flush();InputStream in=ssl.getInputStream();Reply r=new Reply();String first=line(in);r.code=Integer.parseInt(first.split(" ")[1]);int head=first.length();
                for(String row;!(row=line(in)).isEmpty();){head+=row.length();if(head>32768)throw new IOException("照明响应头过大");int c=row.indexOf(':');if(c>0){String key=row.substring(0,c).toLowerCase(Locale.US);if(!r.headers.containsKey(key))r.headers.put(key,new ArrayList<>());r.headers.get(key).add(row.substring(c+1).trim());}}
                ByteArrayOutputStream out=new ByteArrayOutputStream();
                if(r.header("transfer-encoding").toLowerCase(Locale.US).contains("chunked")){while(true){int n=Integer.parseInt(line(in).split(";",2)[0].trim(),16);if(n==0)break;copy(in,out,n);if(!line(in).isEmpty())throw new IOException("照明响应格式无效");}}
                else if(!r.header("content-length").isEmpty())copy(in,out,Integer.parseInt(r.header("content-length")));
                else read(in,out);
                byte[] data=out.toByteArray();if("gzip".equalsIgnoreCase(r.header("content-encoding"))){try(InputStream zip=new GZIPInputStream(new ByteArrayInputStream(data));ByteArrayOutputStream decoded=new ByteArrayOutputStream()){read(zip,decoded);data=decoded.toByteArray();}}
                r.body=new String(data,"UTF-8");return r;
            }
        }finally{tcp.close();}
    }
    private static boolean nonPublic(InetAddress a){
        if(a.isLoopbackAddress()||a.isAnyLocalAddress()||a.isSiteLocalAddress()||a.isLinkLocalAddress()||a.isMulticastAddress())return true;
        byte[] b=a.getAddress();
        if(b.length==4){int x=(b[0]&255)<<24|(b[1]&255)<<16|(b[2]&255)<<8|(b[3]&255);int first=x>>>24;
            if(first==0||first==10||first==127||first>=224)return true;
            if(first==172&&((b[1]&255)>=16&&(b[1]&255)<=31))return true;
            if(first==192&&((b[1]&255)==0||((b[1]&255)==168)))return true;
            if(first==198&&((b[1]&255)==18||(b[1]&255)==19))return true;
            if(first==203&&(b[1]&255)==0)return true;
        }
        return false;
    }
    private static void read(InputStream in,ByteArrayOutputStream out)throws Exception{byte[] b=new byte[4096];for(int n;(n=in.read(b))!=-1;){if(out.size()+n>2097152)throw new IOException("照明响应过大");out.write(b,0,n);}}
    private static String line(InputStream in)throws Exception{ByteArrayOutputStream b=new ByteArrayOutputStream();for(int c;(c=in.read())!=-1;){if(c==10)return b.toString("ISO-8859-1").replace("\r","");if(b.size()>16384)throw new IOException("照明响应行过大");b.write(c);}throw new EOFException("照明响应不完整");}
    private static void copy(InputStream in,ByteArrayOutputStream out,int n)throws Exception{if(n<0||n>2097152-out.size())throw new IOException("照明响应过大");byte[] b=new byte[4096];while(n>0){int k=in.read(b,0,Math.min(b.length,n));if(k<0)throw new EOFException("照明响应不完整");out.write(b,0,k);n-=k;}}
}
