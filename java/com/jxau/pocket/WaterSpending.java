package com.jxau.pocket;
import org.json.*;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.SimpleDateFormat;
import java.util.*;

/** Calendar spending in campus time. Unknown categories are never assigned by amount. */
public final class WaterSpending {
 static final TimeZone ZONE=TimeZone.getTimeZone("Asia/Shanghai");
 static String label(JSONObject item){JSONObject dev=item.optJSONObject("dev");return item.optString("msg","")+" "+(dev==null?"":dev.optString("name","")+" "+dev.optString("typeName",""));}
 public static String category(JSONObject item){
  String text=label(item);boolean bath=text.matches("(?s).*(洗澡|洗浴|淋浴|浴室|澡堂|沐浴).*"),drink=text.matches("(?s).*(饮水|直饮|开水|纯净水|饮用水).*" );
  if(bath&&!drink)return "bath";if(drink&&!bath)return "drink";return "other";
 }
 public static boolean expense(JSONObject i){
  if(i.optInt("status",-1)!=3||i.optInt("cata",-1)==1)return false;
  String text=label(i);if(text.matches("(?s).*(充值|退款|退费|返还|转入|兑换|提现).*"))return false;
  return i.optInt("type",-1)==91 || (text.contains("消费")&&!category(i).equals("other"));
 }
 public static long timestamp(Object value){
  if(value==null||value==JSONObject.NULL)return 0;String s=String.valueOf(value).trim();
  try{if(s.matches("\\d{10,13}")){long n=Long.parseLong(s);return n<10000000000L?n*1000:n;}}catch(Exception ignored){}
  for(String pattern:new String[]{"yyyy-MM-dd'T'HH:mm:ss.SSSXXX","yyyy-MM-dd'T'HH:mm:ssXXX","yyyy-MM-dd HH:mm:ss","yyyy-MM-dd HH:mm","yyyy/MM/dd HH:mm:ss"})try{
   SimpleDateFormat f=new SimpleDateFormat(pattern,Locale.ROOT);f.setTimeZone(ZONE);f.setLenient(false);java.text.ParsePosition p=new java.text.ParsePosition(0);Date d=f.parse(s,p);if(d!=null&&p.getIndex()==s.length())return d.getTime();
  }catch(Exception ignored){}return 0;
 }
 public static long[] boundaries(long now){
  Calendar c=Calendar.getInstance(ZONE);c.setTimeInMillis(now);c.set(Calendar.HOUR_OF_DAY,0);c.set(Calendar.MINUTE,0);c.set(Calendar.SECOND,0);c.set(Calendar.MILLISECOND,0);long day=c.getTimeInMillis();
  c.add(Calendar.DAY_OF_MONTH,-((c.get(Calendar.DAY_OF_WEEK)+5)%7));long week=c.getTimeInMillis();
  c.setTimeInMillis(day);c.set(Calendar.DAY_OF_MONTH,1);return new long[]{day,week,c.getTimeInMillis()};
 }
 public static JSONObject normalize(JSONObject item)throws Exception{
  JSONObject row=new JSONObject().put("id",item.optString("id")).put("title",item.optString("msg","消费记录")).put("time",item.optString("ctime",item.optString("utime")))
   .put("status",item.opt("status")).put("direction",item.opt("dir")).put("category",category(item)).put("expense",expense(item));
  long at=timestamp(item.opt("ctime"));if(at==0)at=timestamp(item.opt("utime"));row.put("timestamp",at);
  row.put("amount",item.has("payment")&&!item.isNull("payment")?item.get("payment"):JSONObject.NULL);return row;
 }
 public static JSONObject summarize(JSONArray rows,long now,boolean complete)throws Exception{
  long[] start=boundaries(now);BigDecimal[][] sums=new BigDecimal[3][3];int[][] count=new int[3][3];for(BigDecimal[] a:sums)Arrays.fill(a,BigDecimal.ZERO);
  int invalid=0,unknown=0;Set<String> seen=new HashSet<>();
  for(int n=0;n<rows.length();n++){
   JSONObject r=rows.optJSONObject(n);if(r==null)continue;String id=r.optString("id");if(!id.isEmpty()&&!seen.add(id))continue;
   if(!r.optBoolean("expense"))continue;long at=r.optLong("timestamp");if(at==0){invalid++;continue;}if(at>now||at<Math.min(start[1],start[2]))continue;
   BigDecimal amount;try{amount=new BigDecimal(r.get("amount").toString());if(amount.signum()<0)throw new Exception();}catch(Exception e){invalid++;continue;}
   int k="drink".equals(r.optString("category"))?0:"bath".equals(r.optString("category"))?1:2;if(k==2)unknown++;
   for(int p=0;p<3;p++)if(at>=start[p]){sums[k][p]=sums[k][p].add(amount);count[k][p]++;}
  }
  JSONObject result=new JSONObject().put("ok",true).put("updatedAt",now).put("complete",complete&&invalid==0).put("invalidRecords",invalid).put("unclassifiedRecords",unknown).put("recordCount",rows.length());
  String[] categories={"drink","bath","other"},periods={"day","week","month"};
  for(int k=0;k<3;k++){JSONObject group=new JSONObject();for(int p=0;p<3;p++)group.put(periods[p],new JSONObject().put("amount",sums[k][p].setScale(2,RoundingMode.HALF_UP).toPlainString()).put("count",count[k][p]));result.put(categories[k],group);}
  return result.put("dayStart",start[0]).put("weekStart",start[1]).put("monthStart",start[2]).put("timezone","Asia/Shanghai");
 }
}
