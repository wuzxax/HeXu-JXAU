package com.jxau.pocket;

import org.json.*;
import java.net.*;
import java.util.*;
import java.util.regex.*;

/** Account-specific local device list. Saving a device never starts it. */
public final class WaterDeviceRegistry {
    private static final Pattern ID=Pattern.compile("[A-Za-z0-9][A-Za-z0-9_-]{0,79}");
    private static final Pattern KEY=Pattern.compile("(?:^|[?&#;,\\s{])[\"']?(?:did|deviceId|device_id|id)[\"']?\\s*(?:=|:)\\s*[\"']?([A-Za-z0-9_-]+)",Pattern.CASE_INSENSITIVE);
    public static String normalize(String raw)throws Exception {
        String input=raw==null?"":raw.trim();if(input.length()>4096)throw new IllegalArgumentException("设备编号或链接过长");
        try{input=URLDecoder.decode(input,"UTF-8");}catch(IllegalArgumentException ignored){}
        Matcher match=KEY.matcher(input);String candidate=match.find()?match.group(1):input;
        if(candidate.equals(input)&&input.contains("://")){
            candidate="";
            try{
                URI uri=URI.create(input);String path=uri.getPath();String scheme=uri.getScheme();
                if(path!=null&&Arrays.asList("https","http","ilife").contains(scheme)){
                    String[] parts=path.split("/");boolean marker=false;
                    for(int i=parts.length-1;i>=0;i--){String part=parts[i];if(part.matches("[0-9]{8,32}")){candidate=part;break;}}
                    if(candidate.isEmpty())for(String part:parts){if(marker&&part.matches("[A-Za-z0-9_-]{6,80}")&&part.matches(".*[0-9].*"))candidate=part;if(Arrays.asList("device","devices","did","bind","binding","q","qr").contains(part.toLowerCase(Locale.US)))marker=true;}
                }
            }catch(Exception ignored){}
        }
        if(!ID.matcher(candidate).matches())throw new IllegalArgumentException("未识别到有效设备号，请输入机器上的编号或含设备号的二维码链接");
        return candidate;
    }
    /** Scans require device context; manual entry keeps the existing compatibility. */
    public static String scan(String raw)throws Exception {
        String input=raw==null?"":raw.trim();
        if(input.matches("[0-9]{15}"))return input;
        if(input.length()>4096)throw new IllegalArgumentException("二维码内容过长，请扫描设备二维码");
        try{
            URI uri=URI.create(input);String scheme=uri.getScheme(),host=uri.getHost();
            scheme=scheme==null?"":scheme.toLowerCase(Locale.US);host=host==null?"":host.toLowerCase(Locale.US);
            boolean platform=host.equals("hnkzy.com")||host.endsWith(".hnkzy.com")||host.equals("ilife798.com")||host.endsWith(".ilife798.com");
            boolean protocol=scheme.equals("ilife")&&Arrays.asList("device","devices","bind","binding","q","qr").contains(host);
            if((!Arrays.asList("http","https").contains(scheme)||!platform)&&!protocol)throw new IllegalArgumentException();
            if(uri.getUserInfo()!=null)throw new IllegalArgumentException();
            String id=normalize(input);if(!id.matches("[A-Za-z0-9_-]{6,80}")||!id.matches(".*[0-9].*"))throw new IllegalArgumentException();
            return id;
        }catch(Exception e){throw new IllegalArgumentException("这不是可识别的798设备二维码，请扫描机器上的二维码或手动输入编号");}
    }
    public static String account(JSONObject session)throws Exception {
        String id=session.optString("phone").trim();if(id.isEmpty())id=session.optString("uid").trim();
        if(id.isEmpty())throw new Exception("798账号信息不完整，请重新绑定");return id;
    }
    public static JSONObject profile(JSONObject all,String account)throws Exception {
        JSONObject p=all.optJSONObject(account);if(p==null){p=new JSONObject().put("devices",new JSONArray()).put("hidden",new JSONObject());all.put(account,p);}return p;
    }
    public static JSONArray rows(JSONObject p)throws Exception {JSONArray rows=p.optJSONArray("devices");if(rows==null){rows=new JSONArray();p.put("devices",rows);}return rows;}
    public static void save(JSONObject p,String did,String alias)throws Exception {
        String id=normalize(did),name=alias==null?"":alias.trim();if(name.length()>40)throw new IllegalArgumentException("名称最多40个字");
        JSONArray rows=rows(p);JSONObject row=null;for(int i=0;i<rows.length();i++)if(id.equals(rows.getJSONObject(i).optString("id"))){row=rows.getJSONObject(i);break;}
        if(row==null){row=new JSONObject().put("id",id);rows.put(row);}
        row.put("alias",name).put("saved",true);JSONObject hidden=p.optJSONObject("hidden");if(hidden!=null)hidden.remove(id);
    }
    public static void remove(JSONObject p,String id)throws Exception {
        JSONArray out=new JSONArray(),rows=rows(p);for(int i=0;i<rows.length();i++)if(!id.equals(rows.getJSONObject(i).optString("id")))out.put(rows.get(i));p.put("devices",out);
        JSONObject hidden=p.optJSONObject("hidden");if(hidden==null){hidden=new JSONObject();p.put("hidden",hidden);}hidden.put(id,true);
    }
    public static void merge(JSONObject p,JSONArray remote)throws Exception {
        JSONArray rows=rows(p);JSONObject hidden=p.optJSONObject("hidden");
        for(int i=0;i<remote.length();i++){
            JSONObject item=remote.optJSONObject(i);if(item==null)continue;String id=item.optString("id");
            if(!ID.matcher(id).matches()||(hidden!=null&&hidden.optBoolean(id)))continue;
            JSONObject row=null;for(int j=0;j<rows.length();j++)if(id.equals(rows.getJSONObject(j).optString("id"))){row=rows.getJSONObject(j);break;}
            if(row==null){row=new JSONObject().put("id",id);rows.put(row);}row.put("remoteName",item.optString("name")).put("remote",true);
        }
    }
    public static JSONArray display(JSONObject p)throws Exception {
        JSONArray out=new JSONArray(),rows=rows(p);
        for(int i=0;i<rows.length();i++){
            JSONObject row=rows.getJSONObject(i);String alias=row.optString("alias"),name=alias.isEmpty()?row.optString("remoteName"):alias;
            out.put(new JSONObject().put("id",row.getString("id")).put("name",name.isEmpty()?"饮水机":name).put("alias",alias).put("saved",row.optBoolean("saved")).put("remote",row.optBoolean("remote")));
        }return out;
    }
}
