package com.jxau.pocket;

import java.util.*;

/** Fixed official destinations. Never accepts arbitrary URLs or packages from the WebView. */
final class ParcelTargets {
    final String key, title, app, web;
    final String[] links;
    final boolean homeFallback;
    private static final Map<String,ParcelTargets> ALL = new LinkedHashMap<>();
    private ParcelTargets(String key, String title, String app, String web, boolean home, String... links) {
        this.key=key; this.title=title; this.app=app; this.web=web; this.homeFallback=home; this.links=links;
        ALL.put(key,this);
    }
    static {
        new ParcelTargets("cainiao", "菜鸟身份码", "com.cainiao.wireless",
            "https://market.m.taobao.com/app/cn-yz/multi-activity/authCode.html?bizEntry=ALIPAY_GUOGUO", true,
            "cainiao://desktop/station_code");
        new ParcelTargets("taobao", "淘宝身份码", "com.taobao.taobao",
            "https://market.m.taobao.com/app/cn-yz/multi-activity/authCode.html", false,
            "taobao://m.taobao.com/tbopen/index.html?h5Url=https%3A%2F%2Fmarket.m.taobao.com%2Fapp%2Fcn-yz%2Fmulti-activity%2FauthCode.html",
            "tbopen://m.taobao.com/tbopen/index.html?h5Url=https%3A%2F%2Fmarket.m.taobao.com%2Fapp%2Fcn-yz%2Fmulti-activity%2FauthCode.html");
        new ParcelTargets("pinduoduo", "拼多多身份码", "com.xunmeng.pinduoduo",
            "https://m.pinduoduo.net/mdkd/package?entry_source=18&extra_params=from_wx_jump%3D1&p_channel=0", false,
            "pinduoduo://com.xunmeng.pinduoduo/mdkd/package?tab=ID_CODE&entry_source=11&refer_page_name=login&refer_page_sn=10169",
            "pinduoduo://com.xunmeng.pinduoduo/mdkd/package?tab=ID_CODE&entry_source=11",
            "pinduoduo://com.xunmeng.pinduoduo/mdkd/package");
        new ParcelTargets("taobao_pending", "淘宝待取包裹", "com.taobao.taobao",
            "https://pages-fast.m.taobao.com/wow/z/uniapp/1100333/last-mile-fe/m-end-school-tab/home", false,
            "taobao://m.taobao.com/tbopen/index.html?h5Url=https%3A%2F%2Fpages-fast.m.taobao.com%2Fwow%2Fz%2Funiapp%2F1100333%2Flast-mile-fe%2Fm-end-school-tab%2Fhome",
            "tbopen://m.taobao.com/tbopen/index.html?h5Url=https%3A%2F%2Fpages-fast.m.taobao.com%2Fwow%2Fz%2Funiapp%2F1100333%2Flast-mile-fe%2Fm-end-school-tab%2Fhome");
        new ParcelTargets("pinduoduo_pending", "拼多多包裹", "com.xunmeng.pinduoduo",
            "https://m.pinduoduo.net/mdkd/package?entry_source=18&extra_params=from_wx_jump%3D1&p_channel=0", false,
            "pinduoduo://com.xunmeng.pinduoduo/mdkd/package");
        new ParcelTargets("jd", "京东订单", "com.jingdong.app.mall", "https://order.jd.com/center/list.action", false,
            "openjd://virtual?params=%7B%22category%22%3A%22jump%22%2C%22des%22%3A%22orderlist%22%7D");
        new ParcelTargets("xhs", "小红书订单", "com.xingin.xhs", "https://www.xiaohongshu.com/", false,
            "xhsdiscover://rn/lancer-order/order/list");
    }
    static ParcelTargets get(String key) { return ALL.get(key); }
    interface Dispatcher {
        boolean uri(String uri, String app);
        boolean home(String app);
        void message(String text);
    }
    /** Success means Android accepted an intent, not that a third party rendered the intended page. */
    static boolean open(String key, Dispatcher d) {
        ParcelTargets target=get(key);
        if(target==null){d.message("无法识别的快递入口");return false;}
        for(String link:target.links)if(d.uri(link,target.app))return true;
        if(target.homeFallback&&d.home(target.app)){
            d.message("已打开菜鸟，请在官方 App 内查看身份码");return true;
        }
        if(d.uri(target.web,target.app)){d.message("已尝试打开官方页面，可能需要登录");return true;}
        if(d.uri(target.web,null)){
            d.message("已打开官方网页"+("xhs".equals(key)?"首页，请进入订单查看":"，可能需要登录"));return true;
        }
        if(d.home(target.app)){d.message("直达入口不可用，已打开官方 App，请在应用内查看");return true;}
        d.message("无法打开，请安装或更新对应官方 App 后重试");return false;
    }
}
