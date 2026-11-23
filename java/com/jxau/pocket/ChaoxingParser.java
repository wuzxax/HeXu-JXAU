package com.jxau.pocket;

import org.json.*;
import org.jsoup.Jsoup;
import org.jsoup.nodes.*;
import java.net.URI;
import java.util.*;
import java.util.regex.*;

/** Parse only semantic homework rows; scripts/styles/other page divs are never tasks. */
public final class ChaoxingParser {
    /** Stable within a course/class even when signed URLs and answer ids change. */
    public static String identity(String url) {
        try {
            URI u=URI.create(url);Map<String,String> q=new HashMap<>();
            if(u.getRawQuery()!=null)for(String part:u.getRawQuery().split("&")){String[] kv=part.split("=",2);q.put(java.net.URLDecoder.decode(kv[0],"UTF-8").toLowerCase(Locale.ROOT),kv.length>1?java.net.URLDecoder.decode(kv[1],"UTF-8"):"");}
            String work=q.getOrDefault("workid",q.getOrDefault("workrelationid","")),course=q.getOrDefault("courseid",""),clazz=q.getOrDefault("classid",q.getOrDefault("clazzid",""));
            if(!work.isEmpty()&&!course.isEmpty()&&!clazz.isEmpty())return "course="+course+";class="+clazz+";work="+work;
        }catch(Exception ignored){}
        return "url:"+url;
    }
    public static boolean trusted(String value) {
        try { URI u=URI.create(value);String h=u.getHost();return "https".equalsIgnoreCase(u.getScheme())&&u.getUserInfo()==null&&(u.getPort()==-1||u.getPort()==443)&&h!=null&&(h.equals("chaoxing.com")||h.endsWith(".chaoxing.com")); }catch(Exception e){return false;}
    }
    public static JSONArray works(String html,String base,String course,long now)throws Exception {
        Document doc=Jsoup.parse(html,base);doc.select("script,style,noscript").remove();
        if(doc.select("ul").isEmpty())throw new Exception("作业列表未返回预期结构，请稍后重试");
        JSONArray rows=new JSONArray();Set<String> seen=new HashSet<>();
        for(Element el:doc.select("ul li[aria-label]")){
            String label=el.attr("aria-label").trim();int sep=Math.max(label.lastIndexOf(';'),label.lastIndexOf('；'));
            String title=(sep<0?label:label.substring(0,sep)).trim(),status=sep<0?"状态未知":label.substring(sep+1).trim();if(title.isEmpty())continue;
            String raw=el.attr("data").trim();if(raw.isEmpty()){Element a=el.selectFirst("a[href]");if(a!=null)raw=a.attr("href");}
            String url="";try{url=URI.create(base).resolve(raw).toString();if(raw.isEmpty()||!trusted(url))url="";}catch(Exception ignored){}
            String key=title+"|"+url;if(!seen.add(key))continue;
            String state=Arrays.asList("未交","未开始","待互评").contains(status)?"todo":Arrays.asList("已完成","已提交","已交","待批阅","已批阅","已互评").contains(status)?"done":"other";
            Element time=el.selectFirst(".time");String left=time==null?"":time.text().trim();long minutes=0;boolean countdown=false;
            if(left.contains("剩余")||left.contains("还剩")){Matcher m=Pattern.compile("(\\d+)\\s*(天|小时|分钟|分)").matcher(left);while(m.find()){countdown=true;minutes+=Long.parseLong(m.group(1))*(m.group(2).equals("天")?1440:m.group(2).equals("小时")?60:1);}}
            rows.put(new JSONObject().put("kind","work").put("course",course).put("title",title).put("status",status).put("state",state).put("left",left).put("endAt",countdown?now+minutes*60000:JSONObject.NULL).put("url",url));
        }
        if(rows.length()==0&&!doc.select("li").isEmpty())throw new Exception("作业条目格式变化，未把页面说明当作作业");
        return rows;
    }
}
