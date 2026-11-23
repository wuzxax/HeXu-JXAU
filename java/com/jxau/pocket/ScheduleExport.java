package com.jxau.pocket;
import android.content.*;
import android.os.Build;
import android.net.Uri;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
/** Stages bounded schedule exports before a user chooses how to save them. */
public final class ScheduleExport {
 private final File directory;public ScheduleExport(Context c){directory=new File(c.getCacheDir(),"schedule-exports");directory.mkdirs();}
 public synchronized JSONObject stage(JSONObject body)throws Exception{
  String mime=body.optString("mime"),content=body.optString("content"),name=body.optString("name");byte[] bytes;
  if("image/png".equals(mime)){if(!content.startsWith("data:image/png;base64,")||content.length()>8000000)throw new IllegalArgumentException("课表图片无效或过大");bytes=android.util.Base64.decode(content.substring(22),android.util.Base64.DEFAULT);if(bytes.length<8||bytes[0]!=(byte)137||bytes[1]!=80||bytes[2]!=78||bytes[3]!=71)throw new IllegalArgumentException("图片格式无效");name="禾序-课表.png";}
  else if("text/calendar".equals(mime)){if(!content.startsWith("BEGIN:VCALENDAR\r\n")||!content.endsWith("END:VCALENDAR\r\n")||content.length()>2000000)throw new IllegalArgumentException("日历文件无效");bytes=content.getBytes(StandardCharsets.UTF_8);name="禾序-课表.ics";}
  else throw new IllegalArgumentException("不支持的导出格式");
  File[] old=directory.listFiles();if(old!=null){Arrays.sort(old,Comparator.comparingLong(File::lastModified));for(int i=0;i<old.length;i++)if(old[i].lastModified()<System.currentTimeMillis()-3600000L||i<old.length-7)old[i].delete();}
  String id=UUID.randomUUID().toString();try(FileOutputStream out=new FileOutputStream(new File(directory,id))){out.write(bytes);}JSONObject meta=new JSONObject().put("mime",mime).put("name",name);try(FileOutputStream out=new FileOutputStream(new File(directory,id+".json"))){out.write(meta.toString().getBytes(StandardCharsets.UTF_8));}
  return new JSONObject().put("ok",true).put("id",id)
   .put("directImageSave", "image/png".equals(mime) && Build.VERSION.SDK_INT>=29);
 }
 private File checked(String id)throws Exception{if(id==null||!id.matches("[a-f0-9-]{36}"))throw new IllegalArgumentException("导出文件已失效，请重新生成");File f=new File(directory,id);if(!f.isFile()||f.lastModified()<System.currentTimeMillis()-3600000L)throw new IllegalArgumentException("导出文件已失效，请重新生成");return f;}
 private static String readText(File f)throws Exception{try(InputStream in=new FileInputStream(f);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[1024];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return new String(out.toByteArray(),StandardCharsets.UTF_8);}}
 public String imageName(String id)throws Exception{
  checked(id);
  JSONObject metadata=new JSONObject(readText(new File(directory,id+".json")));
  if(!"image/png".equals(metadata.getString("mime")))throw new IOException("这里只能保存课表图片");
  return metadata.getString("name");
 }
 public Intent create(String id)throws Exception{checked(id);JSONObject meta=new JSONObject(readText(new File(directory,id+".json")));return new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(meta.getString("mime")).putExtra(Intent.EXTRA_TITLE,meta.getString("name"));}
 public void write(String id,Uri uri,Context c)throws Exception{File file=checked(id);try(InputStream in=new FileInputStream(file);OutputStream out=c.getContentResolver().openOutputStream(uri,"w")){if(out==null)throw new IOException("无法写入所选位置");byte[] data=new byte[8192];int n;while((n=in.read(data))!=-1)out.write(data,0,n);}}
}
