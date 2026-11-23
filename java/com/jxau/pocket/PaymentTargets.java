package com.jxau.pocket;

/** Public official entry links only. No account data, amount submission or order creation. */
final class PaymentTargets {
    static final String ALIPAY_PACKAGE="com.eg.android.AlipayGphone";
    static final String WANXIAO_PACKAGE="com.newcapec.mobile.ncp";
    static final String LIFE798_APP="alipays://platformapi/startapp?appId=2019061465519660&page=pages%2Findex%2Findex";
    static final String LIFE798_SHARE="https://www.wmslz.com/s/8Wp9yc603EZ";
    static final String LIGHTING="https://h5cloud.17wanxiao.com:18443/CloudPayment/bill/selectPayProject.do?txcode=2&interurl=substituted_pay&payProId=6990&amtflag=0&payamt=1000&payproname=%E5%AD%A6%E7%94%9F%E7%85%A7%E6%98%8E%E7%94%A8%E7%94%B5%E7%BC%B4%E8%B4%B9&img=https://payicons.59wanmei.com/cloudpayment/images/project/img-nav_2.png&subPayProId=&fixamtlist=";
    interface Dispatcher {
        boolean uri(String url,String app);
        boolean home(String app);
        void message(String text);
    }
    static String web(String key){
        if("life798".equals(key))return LIFE798_SHARE;
        if("lighting".equals(key))return LIGHTING;
        return null;
    }
    /** A true result means Android accepted the intent, not that the payment page loaded. */
    static boolean open(String key,boolean share,Dispatcher d){
        if("aircon".equals(key)){
            if(d.home(WANXIAO_PACKAGE)){d.message("已打开完美校园，请在应用内选择对应的空调电费缴费项目");return true;}
            d.message("未能打开完美校园，请安装或更新官方 App 后重试");return false;
        }
        String web=web(key);
        if(web==null){d.message("无法识别的缴费入口");return false;}
        if("lighting".equals(key)){
            if(d.home(WANXIAO_PACKAGE)){d.message("已打开完美校园，请进入云缴费 → 学生照明用电缴费");return true;}
            d.message("未能打开完美校园，请安装或更新官方 App 后重试");return false;
        }
        if("life798".equals(key)&&!share&&d.uri(LIFE798_APP,ALIPAY_PACKAGE)){
            d.message("正在尝试打开支付宝 · 慧生活798");return true;
        }
        if(d.uri(web,null)){
            d.message("已交给浏览器打开798分享链接，可能需要唤起支付宝");return true;
        }
        d.message("无法打开，请返回复制链接，或安装对应官方应用后重试");return false;
    }
}
