package com.shuttercat.android;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

final class FocusStore {
    final SharedPreferences prefs;
    FocusStore(Context context) { prefs = context.getSharedPreferences("meow_focus", Context.MODE_PRIVATE); }
    long bedtimeUntil() { return TaskRules.bedtimeUntil(tasks(), System.currentTimeMillis()); }
    boolean enabled() { return (prefs.getBoolean("guard_enabled", false) || bedtimeUntil() > 0) && prefs.getBoolean("disclosure_accepted", false); }
    boolean setEnabled(boolean enabled) {
        if (!enabled && bedtimeUntil() > 0) return false;
        prefs.edit().putBoolean("guard_enabled", enabled).apply(); return true;
    }
    String activeCat() { return prefs.getString("active_cat", "cloud"); }
    void acceptDisclosure() { prefs.edit().putBoolean("disclosure_accepted", true).putBoolean("guard_enabled", true).apply(); }
    Set<String> selected() { return new HashSet<>(prefs.getStringSet("selected_packages", java.util.Collections.emptySet())); }
    boolean setSelected(Set<String> packages) {
        if (bedtimeUntil() > 0) return false;
        prefs.edit().putStringSet("selected_packages", new HashSet<>(packages)).apply(); return true;
    }
    String origin() { return prefs.getString("origin", BuildConfig.APP_URL); }
    void setOrigin(String origin) {
        if (bedtimeUntil() > 0) throw new IllegalStateException("睡眠守护期间不能修改服务地址");
        if (!origin.equals(origin())) {
            prefs.edit().putString("origin", origin).putString("tasks", "[]")
                .putBoolean("guard_enabled", false).remove("last_sync").remove("active_cat").apply();
        }
    }
    void deleteAccountData() {
        String currentOrigin = origin();
        String language = prefs.getString("locale", null);
        SharedPreferences.Editor editor = prefs.edit().clear().putString("origin", currentOrigin);
        if (language != null) editor.putString("locale", language);
        editor.apply();
    }
    long lastSync() { return prefs.getLong("last_sync", 0); }
    void sync(JSONArray input, String activeCat) throws JSONException {
        if (input.length() > 2000) throw new IllegalArgumentException("待处理任务过多，无法同步守护。");
        JSONArray clean = new JSONArray();
        Set<String> ids = new HashSet<>();
        // Preserve an active local commitment through logout, refresh, or a stale server response.
        for (TaskRules.Task old : tasks()) {
            if ("bedtime".equals(old.kind) && TaskRules.pending(old, System.currentTimeMillis())) {
                clean.put(new JSONObject().put("id", old.id).put("title", old.title).put("kind", "bedtime")
                    .put("status", "sleeping").put("scheduledAt", java.time.Instant.ofEpochMilli(old.scheduledAt).toString()));
                ids.add(old.id);
            }
        }
        Set<String> incomingIds = new HashSet<>();
        for (int i = 0; i < input.length(); i++) {
            JSONObject t = input.getJSONObject(i);
            String id = t.getString("id"), title = t.getString("title"), status = t.getString("status");
            if (id.isEmpty() || id.length() > 128 || title.length() > 80 || !incomingIds.add(id))
                throw new IllegalArgumentException("任务数据格式无效。");
            if (ids.contains(id)) continue;
            if (!java.util.Arrays.asList("scheduled", "waiting_proof", "started", "escaped", "sleeping", "slept").contains(status))
                throw new IllegalArgumentException("任务状态无效。");
            String scheduled = t.getString("scheduledAt");
            TaskRules.parseTimestamp(scheduled);
            String kind = t.optString("kind", "photo");
            if (!"photo".equals(kind) && !"bedtime".equals(kind)) throw new IllegalArgumentException("任务类型无效");
            if ("scheduled".equals(status) || "waiting_proof".equals(status) || "sleeping".equals(status)) {
                clean.put(new JSONObject().put("id", id).put("title", title).put("status", status).put("scheduledAt", scheduled).put("kind", kind));
            }
        }
        if (!java.util.Arrays.asList("cloud", "peach", "matcha", "butter", "moon").contains(activeCat)) activeCat = "cloud";
        prefs.edit().putString("tasks", clean.toString()).putString("active_cat", activeCat)
            .putLong("last_sync", System.currentTimeMillis()).apply();
    }
    List<TaskRules.Task> tasks() {
        List<TaskRules.Task> tasks = new ArrayList<>();
        try {
            JSONArray list = new JSONArray(prefs.getString("tasks", "[]"));
            for (int i = 0; i < list.length(); i++) {
                JSONObject t = list.getJSONObject(i);
                tasks.add(new TaskRules.Task(t.getString("id"), t.getString("title"), t.getString("status"), TaskRules.parseTimestamp(t.getString("scheduledAt")), t.optString("kind", "photo")));
            }
        } catch (Exception ignored) { return new ArrayList<>(); }
        return tasks;
    }
}
