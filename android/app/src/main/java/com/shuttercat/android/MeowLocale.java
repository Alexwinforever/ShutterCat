package com.shuttercat.android;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Locale;

final class MeowLocale {
    static final String[] CODES = { "system", "zh-CN", "zh-TW", "en", "ja", "ko", "es" };
    static final String[] NAMES = { "", "简体中文", "繁體中文", "English", "日本語", "한국어", "Español" };
    private static JSONObject catalog;
    static boolean valid(String value) { return Arrays.asList(CODES).contains(value); }
    static String choice(Context context) { return new FocusStore(context).prefs.getString("locale", "system"); }
    static void save(Context context, String value) {
        if (valid(value)) new FocusStore(context).prefs.edit().putString("locale", value).apply();
    }
    static String resolved(Context context) {
        String value = choice(context);
        if (!"system".equals(value)) return value;
        Locale locale = context.getResources().getConfiguration().getLocales().get(0);
        if ("zh".equals(locale.getLanguage())) return "Hant".equals(locale.getScript()) || Arrays.asList("TW", "HK", "MO").contains(locale.getCountry()) ? "zh-TW" : "zh-CN";
        return Arrays.asList("en", "ja", "ko", "es").contains(locale.getLanguage()) ? locale.getLanguage() : "en";
    }
    static synchronized String text(Context context, String source) {
        if (source == null) return "";
        int column = Arrays.asList("zh-TW", "en", "ja", "ko", "es").indexOf(resolved(context));
        if (column < 0) return source;
        try {
            if (catalog == null) {
                try (InputStream input = context.getAssets().open("locales.json")) {
                    java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
                    byte[] buffer = new byte[8192]; int count;
                    while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                    catalog = new JSONObject(new String(output.toByteArray(), StandardCharsets.UTF_8));
                }
            }
            JSONArray translations = catalog.optJSONArray(source);
            return translations == null ? source : translations.optString(column, source);
        } catch (Exception ignored) { return source; }
    }
}
