package com.jxau.pocket;

import android.app.Activity;
import android.os.Bundle;

/** Tiny shortcut entry: no CAS or loopback server initialization. */
public class ParcelShortcutActivity extends Activity {
    @Override protected void onCreate(Bundle state){
        super.onCreate(state);
        if("com.jxau.pocket.PARCEL".equals(getIntent().getAction())){
            String key=getIntent().getStringExtra("destination");
            if(ParcelTargets.get(key)!=null)ParcelLauncher.open(this,key);
        }
        finish();
    }
}
