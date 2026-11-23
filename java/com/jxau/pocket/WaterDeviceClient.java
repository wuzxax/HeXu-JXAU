package com.jxau.pocket;
import org.json.*;
import java.util.*;
/** 798 设备控制：读取设备并按用户确认启动/停止接水。 */
public final class WaterDeviceClient {
    private static final Object CONTROL_LOCK=new Object();
    private final SecureStore store;
    public WaterDeviceClient(SecureStore s){store=s;}
    private JSONObject s()throws Exception{JSONObject x=store.get("life798");if(x==null||x.optString("token").isEmpty())throw new Exception("请先绑定798账号");return x;}
    private JSONObject call(String path)throws Exception{
      JSONObject x=s();Map<String,String> h=Http.headers("ApplicationType","1,1","VersionCode","3.1.9","User-Agent","Android_ilife798_3.1.9","Authorization",x.optString("token"));
      return new JSONObject(Http.call("https://i.ilife798.com/api/v1"+path,"GET",null,h));
    }
    private JSONObject profiles()throws Exception{JSONObject all=store.get("water-device-registry");return all==null?new JSONObject():all;}
    private String owner()throws Exception{return WaterDeviceRegistry.account(s());}
    private void sameOwner(String wanted)throws Exception{if(!wanted.equals(owner()))throw new Exception("798账号已变化，请刷新设备后重试");}
    private JSONObject result(JSONObject profile,String warning)throws Exception{
        return new JSONObject().put("ok",true).put("devices",WaterDeviceRegistry.display(profile)).put("active",active()).put("warning",warning).put("updatedAt",System.currentTimeMillis());
    }
    public synchronized JSONObject devices()throws Exception{
        String owner=owner();JSONObject all=profiles(),p=WaterDeviceRegistry.profile(all,owner);String warning="";
        try{
            JSONObject r=call("/ui/app/master");int code=r.optInt("code",-1);
            if(code==-99){
                sameOwner(owner);
                return result(p,"").put("sessionExpired",true);
            }
            if(code!=0)throw new Exception(r.optString("msg","设备同步失败"));
            JSONObject data=r.optJSONObject("data");JSONArray remote=data==null?null:data.optJSONArray("favos");
            if(remote==null)throw new Exception("798收藏列表返回格式变化");
            sameOwner(owner);WaterDeviceRegistry.merge(p,remote);store.put("water-device-registry",all);
        }catch(Exception e){sameOwner(owner);warning="收藏同步失败，显示本机已保存设备："+(e.getMessage()==null?"网络连接失败":e.getMessage());}
        return result(p,warning);
    }
    public synchronized JSONObject save(JSONObject body)throws Exception{
        String owner=owner();String id=WaterDeviceRegistry.normalize(body.optString("did"));JSONObject all=profiles(),p=WaterDeviceRegistry.profile(all,owner);
        WaterDeviceRegistry.save(p,id,body.optString("name"));sameOwner(owner);store.put("water-device-registry",all);
        return result(p,"").put("msg","设备已保存到本机，以后可直接点击接水");
    }
    public synchronized JSONObject remove(String did)throws Exception{
        String owner=owner(),id=WaterDeviceRegistry.normalize(did);if(active().has(id))throw new IllegalArgumentException("请先结束接水，再移除设备");
        JSONObject all=profiles(),p=WaterDeviceRegistry.profile(all,owner);WaterDeviceRegistry.remove(p,id);sameOwner(owner);store.put("water-device-registry",all);
        return result(p,"").put("msg","设备已从本机移除");
    }
    private JSONObject active()throws Exception{JSONObject a=store.get("water-device-active");return a==null?new JSONObject():a;}
    private void validate(String did,boolean start)throws Exception{
        if(did==null||!did.matches("[A-Za-z0-9_-]{1,80}"))throw new IllegalArgumentException("设备编号无效，请刷新后重试");
        if(start&&active().length()>0)throw new IllegalArgumentException("已有接水请求未结束，请先确认并停止设备");
        if(!start&&active().has(did))return;
        JSONArray rows=WaterDeviceRegistry.display(WaterDeviceRegistry.profile(profiles(),owner()));for(int i=0;i<rows.length();i++)if(did.equals(rows.getJSONObject(i).optString("id")))return;
        throw new IllegalArgumentException("此设备尚未保存，请先添加设备");
    }
    public synchronized JSONObject acknowledgeStopped(String did,boolean confirmed)throws Exception{synchronized(CONTROL_LOCK){
        if(!confirmed)throw new IllegalArgumentException("请先确认现场已停止出水并完成结算");
        validate(did,false);JSONObject a=active();a.remove(did);store.put("water-device-active",a.length()==0?null:a);
        return new JSONObject().put("ok",true).put("active",a).put("message","已解除本机请求记录；未向设备发送启动或停止指令");
    }}
    public synchronized JSONObject start(String did)throws Exception{synchronized(CONTROL_LOCK){validate(did,true);return action("/dev/start?did="+Http.enc(did)+"&upgrade=true&ptype=91&rcp=false",true,did);}}
    public synchronized JSONObject end(String did)throws Exception{synchronized(CONTROL_LOCK){validate(did,false);return action("/dev/end?did="+Http.enc(did)+"&rcp=false",false,did);}}
    private JSONObject action(String path,boolean start,String did)throws Exception{
        JSONObject a=active();if(start){a.put(did,"unknown");store.put("water-device-active",a);}
        JSONObject r;
        try{r=call(path);}catch(Exception e){throw new Exception((start?"启动结果尚未确认":"停止结果尚未确认")+"，请检查现场设备；未自动重试。可使用结束接水或798官方App确认。");}
        int code=r.optInt("code",-1);
        if(code==0){if(start)a.put(did,"requested");else a.remove(did);store.put("water-device-active",a.length()==0?null:a);return new JSONObject().put("ok",true).put("active",a).put("message",start?"请求已接受，请及时在水机上按“接水”；未确认可能超时退出，出水状态以现场为准":"停止请求已发出，请确认现场停止与账单结算");}
        if(start)a.remove(did);
        else if(code==-2)a.put(did,"manual-required");
        store.put("water-device-active",a.length()==0?null:a);
        String m=r.optString("msg","");
        if(!start&&code==-2)m="平台拒绝本次远程结束，提示需在机器上结算。如现场未启动，或已停止且无待结算状态，可确认后解除本机请求记录。";
        else if(code==-99)m="798登录状态已过期，请重新绑定";
        else if(code==-21)m="当前账号没有设备控制权限，请先在798官方App登录设备端";
        else if(code==-88)m="尚未签约代扣，请先在798官方App完成签约";
        else if(code==-87)m="代扣签约已过期，请先在798官方App重新签约";
        else if(code==-52)m="账户余额不足，请先充值";
        else if(code==-20)m="尚未绑定一卡通，请先在798官方App绑定";
        else if(code==-19)m="设备正在准备，请稍后再试";
        else if(code==-82)m="需要先支付，请先在798官方App完成支付";
        if(m.isEmpty())m=(start?"开始接水失败":"停止接水失败")+"（code="+code+"）";
        return new JSONObject().put("ok",false).put("msg",m).put("code",code).put("active",a).put("requiresManualSettlement",!start&&code==-2);
    }
}
