package com.shuttercat.android;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.KeyguardManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.ResolveInfo;
import android.graphics.PixelFormat;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.telecom.TelecomManager;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityManager;
import java.util.List;

public final class FocusAccessibilityService extends AccessibilityService {
    // Match the actual illustrations in src/Cat.tsx, not the catalog color metadata.
    static int guardImage(String cat) {
        switch (cat) {
            case "peach": return R.drawable.guard_2; // Yellow
            case "matcha": return R.drawable.guard_3; // Pink
            case "butter": return R.drawable.guard_4; // Black
            case "moon": return R.drawable.guard_5; // White
            default: return R.drawable.guard_1; // Purple (cloud)
        }
    }
    private static volatile boolean running;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WindowManager manager;
    private View overlay;
    private long overlayBedtimeUntil;
    private FocusStore store;
    private String currentPackage = "";
    private SharedPreferences.OnSharedPreferenceChangeListener listener;
    private final Runnable tick = new Runnable() {
        @Override public void run() { update(); }
    };

    @Override protected void onServiceConnected() {
        store = new FocusStore(this); manager = getSystemService(WindowManager.class); running = true;
        listener = (preferences, key) -> handler.post(() -> {
            if ("locale".equals(key) || "active_cat".equals(key)) removeOverlay();
            update();
        });
        store.prefs.registerOnSharedPreferenceChangeListener(listener);
        // Foreground package is learned from the next window event; no screen content is queried.
        update();
    }
    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (store == null || event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        CharSequence pkg = event.getPackageName();
        if (pkg == null) return;
        String next = pkg.toString();
        // Adding our own overlay emits a window event. Do not let that remove the overlay.
        if (overlay != null && getPackageName().equals(next)) return;
        currentPackage = next; update();
    }
    private void update() {
        handler.removeCallbacks(tick);
        if (store == null) return;
        List<TaskRules.Task> tasks = store.tasks();
        boolean awake = getSystemService(PowerManager.class).isInteractive()
            && !getSystemService(KeyguardManager.class).isKeyguardLocked();
        boolean selected = store.selected().contains(currentPackage);
        boolean guard = awake && selected && !isProtected(this, currentPackage)
            && TaskRules.shouldGuard(store.enabled(), true, tasks, System.currentTimeMillis());
        long bedtimeUntil = TaskRules.bedtimeUntil(tasks, System.currentTimeMillis());
        if (overlay != null && overlayBedtimeUntil != bedtimeUntil) removeOverlay();
        if (guard) showOverlay(bedtimeUntil); else removeOverlay();
        // While an opted-in service is alive, also detect a due task without an app switch.
        // This is not an exact alarm and OEM power saving may delay or stop callbacks.
        if (store.enabled() && !tasks.isEmpty() && selected)
            handler.postDelayed(tick, TaskRules.nextCheckDelay(tasks, System.currentTimeMillis()));
    }
    private void showOverlay(long bedtimeUntil) {
        if (overlay != null) return;
        FocusOverlayView panel = new FocusOverlayView(this, bedtimeUntil > 0 ? R.drawable.sleep_cat : guardImage(store.activeCat()), bedtimeUntil, () -> {
            currentPackage = getPackageName(); removeOverlay();
            Intent launch = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            try { startActivity(launch); } catch (Exception ignored) { performGlobalAction(GLOBAL_ACTION_HOME); }
        }, () -> { if (store.setEnabled(false)) removeOverlay(); });
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(-1, -1, WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE, PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.CENTER;
        try {
            manager.addView(panel, params); overlay = panel; overlayBedtimeUntil = bedtimeUntil; panel.requestApplyInsets();
        }
        catch (RuntimeException ignored) { overlay = null; store.setEnabled(false); }
    }
    private void removeOverlay() {
        if (overlay != null && manager != null) { try { manager.removeView(overlay); } catch (RuntimeException ignored) { } overlay = null; }
    }
    @Override public void onInterrupt() { currentPackage = ""; removeOverlay(); }
    @Override public void onDestroy() {
        running = false; handler.removeCallbacksAndMessages(null); removeOverlay();
        if (store != null && listener != null) store.prefs.unregisterOnSharedPreferenceChangeListener(listener);
        super.onDestroy();
    }
    static boolean isRunning() { return running; }
    static boolean isEnabled(Context context) {
        AccessibilityManager manager = context.getSystemService(AccessibilityManager.class);
        ComponentName expected = new ComponentName(context, FocusAccessibilityService.class);
        for (AccessibilityServiceInfo info : manager.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)) {
            ComponentName actual = ComponentName.unflattenFromString(info.getId());
            if (expected.equals(actual)) return true;
        }
        return false;
    }
    static boolean isProtected(Context context, String pkg) {
        if (pkg.isEmpty() || pkg.equals(context.getPackageName()) || pkg.startsWith("com.android.") || pkg.startsWith("com.google.android.permissioncontroller")) return true;
        TelecomManager telecom = context.getSystemService(TelecomManager.class);
        if (telecom != null && pkg.equals(telecom.getDefaultDialerPackage())) return true;
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        for (ResolveInfo info : context.getPackageManager().queryIntentActivities(home, 0))
            if (pkg.equals(info.activityInfo.packageName)) return true;
        try {
            ApplicationInfo info = context.getPackageManager().getApplicationInfo(pkg, 0);
            return (info.flags & (ApplicationInfo.FLAG_SYSTEM | ApplicationInfo.FLAG_UPDATED_SYSTEM_APP)) != 0;
        } catch (Exception ignored) { return true; }
    }
}
