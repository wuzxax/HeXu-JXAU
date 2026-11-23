package com.jxau.pocket;

import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import org.json.*;

/** Service adapter for Android versions without inline collection items. */
public final class WaterWidgetCollectionService extends RemoteViewsService {
    @Override public RemoteViewsFactory onGetViewFactory(Intent intent){
        final int widget=intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,-1);
        return new RemoteViewsFactory(){
            JSONArray rows=new JSONArray();String account="";
            WaterWidgetLayout layout;
            WaterWidgetProvider.PageState state=new WaterWidgetProvider.PageState("","","","",false);
            public void onCreate(){onDataSetChanged();}
            public void onDataSetChanged(){
                layout=WaterWidgetProvider.stackLayout(WaterWidgetCollectionService.this,widget);
                try{
                    rows=WaterWidgetProvider.devices(WaterWidgetCollectionService.this);
                    account=WaterWidgetProvider.owner(WaterWidgetCollectionService.this);
                    state=WaterWidgetProvider.readPageState(WaterWidgetCollectionService.this);
                }catch(Exception e){rows=new JSONArray();account="";}
            }
            public void onDestroy(){rows=new JSONArray();}
            public int getCount(){return Math.max(1,rows.length());}
            public RemoteViews getViewAt(int position){try{return WaterWidgetProvider.page(WaterWidgetCollectionService.this,widget,rows,account,position,layout,state,false);}catch(Exception e){return null;}}
            public RemoteViews getLoadingView(){return null;}
            public int getViewTypeCount(){return 1;}
            public long getItemId(int position){try{return WaterWidgetProvider.itemId(account,position<rows.length()?rows.getJSONObject(position).optString("id"):"empty");}catch(Exception e){return WaterWidgetProvider.itemId(account,"empty");}}
            public boolean hasStableIds(){return true;}
        };
    }
}
