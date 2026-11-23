package com.jxau.pocket;
import org.json.*;
import java.math.*;
import java.text.*;
import java.util.*;

/** Account-scoped encrypted archive. Missing upstream history is never inferred. */
public final class WaterLedger {
 private final SecureStore store;
 public WaterLedger(SecureStore s){store=s;}
 private JSONObject read(String owner)throws Exception{
  JSONObject d=store.get("water-ledger-"+owner);return d==null?new JSONObject().put("rows",new JSONArray()).put("savedSince",System.currentTimeMillis()):d;
 }
 private static String key(JSONObject r){String id=r.optString("id");return id.isEmpty()?"fallback:"+r.optLong("timestamp")+":"+r.optString("title")+":"+r.optString("amount"):"id:"+id;}
 public JSONObject merge(String owner,JSONArray incoming,long now,boolean complete)throws Exception{
  JSONObject d=read(owner);LinkedHashMap<String,JSONObject> all=new LinkedHashMap<>();
  JSONArray old=d.getJSONArray("rows");for(int i=0;i<old.length();i++){JSONObject r=old.optJSONObject(i);if(r!=null)all.put(key(r),r);}
  for(int i=0;i<incoming.length();i++){JSONObject r=incoming.optJSONObject(i);if(r!=null)all.put(key(r),r);}
  JSONArray rows=new JSONArray();long earliest=0;for(JSONObject r:all.values()){rows.put(r);long at=r.optLong("timestamp");if(at>0&&(earliest==0||at<earliest))earliest=at;}
  d.put("rows",rows).put("updatedAt",now).put("earliestAt",earliest).put("complete",complete);
  store.put("water-ledger-"+owner,d);return d;
 }
 public JSONObject summary(String owner,long now,boolean complete)throws Exception{
  JSONObject d=read(owner);return WaterSpending.summarize(d.getJSONArray("rows"),now,complete).put("savedSince",d.optLong("savedSince")).put("earliestAt",d.optLong("earliestAt")).put("archiveCount",d.getJSONArray("rows").length());
 }
 private static SimpleDateFormat format(String pattern){SimpleDateFormat f=new SimpleDateFormat(pattern,Locale.ROOT);f.setTimeZone(WaterSpending.ZONE);f.setLenient(false);return f;}
 public JSONObject detail(String owner,String category,String period,String date,long now)throws Exception{
  if(!"drink".equals(category)&&!"bath".equals(category))throw new IllegalArgumentException("消费类别无效");
  if(!"day".equals(period)&&!"week".equals(period)&&!"month".equals(period))throw new IllegalArgumentException("统计周期无效");
  long selected=now;
  if(date!=null&&!date.isEmpty()){ParsePosition p=new ParsePosition(0);Date parsed=format("yyyy-MM-dd").parse(date,p);if(parsed==null||p.getIndex()!=date.length())throw new IllegalArgumentException("日期无效");selected=parsed.getTime();if(selected>now)throw new IllegalArgumentException("请选择今天或之前的日期");}
  long[] b=WaterSpending.boundaries(selected);long start=b["day".equals(period)?0:"week".equals(period)?1:2];
  Calendar c=Calendar.getInstance(WaterSpending.ZONE);c.setTimeInMillis(start);c.add("month".equals(period)?Calendar.MONTH:Calendar.DAY_OF_MONTH,"week".equals(period)?7:1);long end=c.getTimeInMillis();
  int size="day".equals(period)?24:(int)((end-start)/86400000L);BigDecimal[] sums=new BigDecimal[size];Arrays.fill(sums,BigDecimal.ZERO);int[] counts=new int[size];
  JSONObject archive=read(owner);JSONArray source=archive.getJSONArray("rows"),rows=new JSONArray();List<JSONObject> sorted=new ArrayList<>();BigDecimal total=BigDecimal.ZERO;int invalid=0;
  for(int i=0;i<source.length();i++){
   JSONObject r=source.optJSONObject(i);if(r==null||!r.optBoolean("expense")||!category.equals(r.optString("category")))continue;
   long at=r.optLong("timestamp");if(at==0){invalid++;continue;}if(at<start||at>=end||at>now)continue;
   BigDecimal amount;try{amount=new BigDecimal(r.get("amount").toString());if(amount.signum()<0)throw new Exception();}catch(Exception e){invalid++;continue;}
   int idx=(int)((at-start)/("day".equals(period)?3600000L:86400000L));sums[idx]=sums[idx].add(amount);counts[idx]++;total=total.add(amount);sorted.add(r);
  }
  sorted.sort((a,z)->Long.compare(z.optLong("timestamp"),a.optLong("timestamp")));for(JSONObject r:sorted)rows.put(r);
  JSONArray series=new JSONArray();for(int i=0;i<size;i++){long at=start+i*("day".equals(period)?3600000L:86400000L);series.put(new JSONObject().put("label",format("day".equals(period)?"HH:mm":"MM-dd").format(new Date(at))).put("amount",sums[i].setScale(2,RoundingMode.HALF_UP).toPlainString()).put("count",counts[i]).put("future",at>now));}
  return new JSONObject().put("ok",true).put("category",category).put("period",period).put("date",format("yyyy-MM-dd").format(new Date(selected))).put("start",start).put("end",end).put("amount",total.setScale(2,RoundingMode.HALF_UP).toPlainString()).put("count",rows.length()).put("average",rows.length()==0?JSONObject.NULL:total.divide(new BigDecimal(rows.length()),2,RoundingMode.HALF_UP).toPlainString()).put("series",series).put("list",rows).put("updatedAt",archive.optLong("updatedAt")).put("savedSince",archive.optLong("savedSince")).put("earliestAt",archive.optLong("earliestAt")).put("invalidRecords",invalid).put("complete",archive.optBoolean("complete")&&invalid==0).put("scope","本机已保存账单；798未返回的历史及未同步期间可能缺失。空白日期不代表没有消费。卸载或清除数据会删除本地记录。");
 }
}
