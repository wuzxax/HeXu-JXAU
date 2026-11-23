package com.jxau.pocket;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** Android Keystore AES-256/GCM. Plaintext never reaches SharedPreferences. */
public final class SecureStore {
    private static final String ALIAS = "jxau-pocket-vault-v1";
    private final SharedPreferences preferences;
    private final Context context;
    public SecureStore(Context context) {
        this.context=context.getApplicationContext();
        preferences = context.getSharedPreferences("jxau-vault", Context.MODE_PRIVATE);
    }
    private static synchronized SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).build());
        return generator.generateKey();
    }
    public synchronized void put(String name, JSONObject value) throws Exception {
        if (value == null) {
            if (!preferences.edit().remove(name).commit()) throw new Exception("无法删除本地凭证");
            notifyWidgets(name);
            return;
        }
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));
        byte[] encrypted = cipher.doFinal(value.toString().getBytes(StandardCharsets.UTF_8));
        String encoded = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "."
                + Base64.encodeToString(encrypted, Base64.NO_WRAP);
        if (!preferences.edit().putString(name, encoded).commit()) throw new Exception("无法保存本地凭证");
        notifyWidgets(name);
    }
    /** Remove the two account-scoped settings retired with the 798 points module. */
    synchronized void removeRetiredWaterSettings() {
        SharedPreferences.Editor edit = null;
        for (String name : preferences.getAll().keySet()) {
            if (!name.startsWith("life798-checkin-") && !name.startsWith("life798-auto-checkin-")) continue;
            if (edit == null) edit = preferences.edit();
            edit.remove(name);
        }
        if (edit != null) edit.apply();
    }
    private void notifyWidgets(String name){if("life798".equals(name)||name.startsWith("water-device-"))WaterWidgetProvider.refresh(context);}
    public synchronized JSONObject get(String name) throws Exception {
        String encoded = preferences.getString(name, "");
        if (encoded.isEmpty()) return null;
        try {
            String[] parts = encoded.split("\\.", 2);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
            cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));
            return new JSONObject(new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new Exception("本机安全凭证无法读取，请重新绑定账号");
        }
    }
}
