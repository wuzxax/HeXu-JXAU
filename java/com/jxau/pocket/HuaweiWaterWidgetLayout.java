package com.jxau.pocket;

/** Huawei launcher dimensions, in DP. Does not depend on control state. */
final class HuaweiWaterWidgetLayout {
    final int slotWidth,slotHeight,cardWidth,cardHeight;
    final boolean compact,narrow,showNumber,showStatus;
    private HuaweiWaterWidgetLayout(int width,int height,float fontScale){
        slotWidth=Math.round(width*.9f);slotHeight=Math.round(height*.9f);
        cardWidth=slotWidth-6;cardHeight=slotHeight-6;
        compact=cardHeight<165||fontScale>1.25f;
        narrow=cardWidth<140;
        showNumber=cardHeight>=165&&cardWidth>=160;
        showStatus=cardHeight>=140;
    }
    static HuaweiWaterWidgetLayout measure(int width,int height,float fontScale){
        width=width<=0?150:Math.max(110,Math.min(720,width));
        height=height<=0?150:Math.max(110,Math.min(800,height));
        if(Float.isNaN(fontScale)||fontScale<=0)fontScale=1;
        return new HuaweiWaterWidgetLayout(width,height,fontScale);
    }
}
