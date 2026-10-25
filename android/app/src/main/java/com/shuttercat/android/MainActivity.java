package com.shuttercat.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.provider.Settings;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JsResult;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.io.File;
import java.util.Set;

public final class MainActivity extends Activity {
    private static final int FILE_CHOOSER = 71;
    private WebView web;
    private PlayBilling billing;
    private LinearLayout root, failure;
    private TextView loading;
    private FocusStore store;
    private String origin = "";
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraOutput;
    private File cameraFile;
    private android.window.OnBackInvokedCallback backCallback;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        store = new FocusStore(this);
        billing = new PlayBilling(this, value -> runOnUiThread(() -> {
            if (web != null && ServerAddress.sameOrigin(web.getUrl() == null ? "" : web.getUrl(), origin))
                web.evaluateJavascript("window.meowBillingReply?.(" + value + ")", null);
        }));
        if (Build.VERSION.SDK_INT >= 33) {
            backCallback = this::handleBack;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        }
        try { origin = ServerAddress.normalize(store.origin(), BuildConfig.DEBUG); }
        catch (IllegalArgumentException ignored) { }
        if (origin.isEmpty()) showSetup(); else showWeb();
    }

    private void destroyWeb() {
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
        if (web != null) {
            web.stopLoading();
            if (web.getParent() instanceof android.view.ViewGroup parent) parent.removeView(web);
            web.destroy(); web = null;
        }
    }
    private void showSetup() {
        if (store.bedtimeUntil() > 0) {
            new AlertDialog.Builder(this).setMessage("睡眠守护期间不能修改服务地址").setPositiveButton(android.R.string.ok, null).show(); return;
        }
        destroyWeb();
        root = NativeUi.root(this);
        Button language = new Button(this); language.setText(MeowLocale.text(this, "语言") + " / Language");
        language.setOnClickListener(v -> chooseLanguage()); root.addView(language);
        root.addView(NativeUi.text(this, MeowLocale.text(MainActivity.this, "ShutterCat · 安卓版"), 28));
        root.addView(NativeUi.text(this, MeowLocale.text(MainActivity.this, "填写已部署的 HTTPS 服务地址，即可打开你的ShutterCat。切换服务会关闭守护并清除本机守护计划。"), 15));
        EditText input = new EditText(this);
        input.setHint("https://your-worker.workers.dev");
        input.setSingleLine(true);
        input.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        input.setText(origin);
        root.addView(input, new LinearLayout.LayoutParams(-1, NativeUi.dp(this, 60)));
        if (BuildConfig.DEBUG) root.addView(NativeUi.text(this, MeowLocale.text(MainActivity.this, "本机调试：USB 连接后执行 adb reverse tcp:8787 tcp:8787，再填写 http://127.0.0.1:8787。模拟器也可使用 http://10.0.2.2:8787。"), 13));
        Button save = new Button(this); save.setText(MeowLocale.text(MainActivity.this, "打开ShutterCat"));
        save.setOnClickListener(v -> {
            try {
                String value = ServerAddress.normalize(input.getText().toString(), BuildConfig.DEBUG);
                store.setOrigin(value); origin = value; showWeb();
            } catch (IllegalArgumentException error) { input.setError(MeowLocale.text(this, error.getMessage())); }
        });
        root.addView(save);
        Button cancel = new Button(this); cancel.setText(MeowLocale.text(MainActivity.this, "返回"));
        cancel.setOnClickListener(v -> { if (origin.isEmpty()) finish(); else showWeb(); }); root.addView(cancel);
    }

    private void chooseLanguage() {
        String[] names = MeowLocale.NAMES.clone(); names[0] = MeowLocale.text(this, "跟随系统");
        int selected = java.util.Arrays.asList(MeowLocale.CODES).indexOf(MeowLocale.choice(this));
        new AlertDialog.Builder(this).setTitle(MeowLocale.text(this, "语言"))
            .setSingleChoiceItems(names, selected, (dialog, which) -> {
                MeowLocale.save(this, MeowLocale.CODES[which]); dialog.dismiss(); showSetup();
            }).setNegativeButton(MeowLocale.text(this, "取消"), null).show();
    }

    private void showWeb() {
        destroyWeb();
        root = NativeUi.root(this);
        loading = NativeUi.text(this, MeowLocale.text(MainActivity.this, "小猫正在连接服务…"), 14); root.addView(loading);
        failure = new LinearLayout(this); failure.setOrientation(LinearLayout.VERTICAL); failure.setVisibility(View.GONE);
        failure.addView(NativeUi.text(this, MeowLocale.text(MainActivity.this, "暂时无法打开ShutterCat，请检查网络和服务地址。普通守护可关闭；已开始的睡眠守护将在约定的六小时后结束。"), 17));
        Button retry = new Button(this); retry.setText(MeowLocale.text(MainActivity.this, "重新连接"));
        retry.setOnClickListener(v -> { failure.setVisibility(View.GONE); web.setVisibility(View.VISIBLE); web.loadUrl(origin + "/"); });
        failure.addView(retry);
        Button setup = new Button(this); setup.setText(MeowLocale.text(MainActivity.this, "修改服务地址")); setup.setOnClickListener(v -> showSetup()); failure.addView(setup);
        Button stop = new Button(this); stop.setText(MeowLocale.text(MainActivity.this, "关闭专注守护")); stop.setOnClickListener(v -> { stop.setText(MeowLocale.text(MainActivity.this, store.setEnabled(false) ? "守护已关闭" : "睡眠守护六小时后自动结束，不能提前解除")); }); failure.addView(stop);
        root.addView(failure);
        web = new WebView(this); web.setBackgroundColor(NativeUi.PAPER);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true);
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            destroyWeb();
            root.addView(NativeUi.text(this, MeowLocale.text(MainActivity.this, "请先在应用商店更新 Android System WebView 或 Chrome，再重新打开ShutterCat。"), 17));
            return;
        }
        // Only the configured origin receives the bridge. Reject subframe messages too.
        WebViewCompat.addWebMessageListener(web, "MeowAndroid", java.util.Collections.singleton(origin), (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
            if (!isMainFrame || !ServerAddress.sameOrigin(sourceOrigin.toString(), origin)) return;
            String body = message.getData();
            if (body == null || body.length() > 2_000_000) { reply(MeowLocale.text(MainActivity.this, "任务数据过大，无法同步守护。")); return; }
            handleMessage(body);
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Keep the authenticated shell on its own origin, including redirects.
                return !ServerAddress.sameOrigin(request.getUrl().toString(), origin);
            }
            @Override public void onPageStarted(WebView view, String url, Bitmap favicon) {
                if (!ServerAddress.sameOrigin(url, origin)) { view.stopLoading(); failed(); return; }
                loading.setVisibility(View.VISIBLE);
            }
            @Override public void onPageFinished(WebView view, String url) {
                loading.setVisibility(View.GONE); CookieManager.getInstance().flush(); reply(null);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) failed();
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse error) {
                if (request.isForMainFrame()) failed();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message)
                    .setPositiveButton(MeowLocale.text(MainActivity.this, "确认"), (d, w) -> result.confirm())
                    .setNegativeButton(MeowLocale.text(MainActivity.this, "取消"), (d, w) -> result.cancel())
                    .setOnCancelListener(d -> result.cancel()).show();
                return true;
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                clearCameraFile();
                if (params.isCaptureEnabled()) takePhoto(); else pickPhoto();
                return true;
            }
        });
        root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        web.loadUrl(origin + "/");
    }
    private void failed() {
        loading.setVisibility(View.GONE); failure.setVisibility(View.VISIBLE);
        if (web != null) web.setVisibility(View.GONE);
    }
    private void pickPhoto() {
        Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*");
        picker.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try { startActivityForResult(picker, FILE_CHOOSER); }
        catch (Exception e) { finishPhoto(null); reply(MeowLocale.text(MainActivity.this, "无法打开系统相册，请安装可选择照片的应用。")); }
    }
    private void takePhoto() {
        try {
            File directory = new File(getCacheDir(), "proof_photos");
            if (!directory.exists() && !directory.mkdirs()) throw new java.io.IOException();
            cameraFile = File.createTempFile("proof-", ".jpg", directory);
            cameraOutput = FileProvider.getUriForFile(this, getPackageName() + ".photos", cameraFile);
            Intent capture = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            capture.putExtra(MediaStore.EXTRA_OUTPUT, cameraOutput);
            capture.setClipData(ClipData.newRawUri(MeowLocale.text(MainActivity.this, "ShutterCat凭证"), cameraOutput));
            capture.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            startActivityForResult(capture, FILE_CHOOSER);
        } catch (Exception error) {
            clearCameraFile(); finishPhoto(null); reply(MeowLocale.text(MainActivity.this, "无法打开系统相机，请使用「从相册选择」。"));
        }
    }
    private void finishPhoto(Uri[] value) {
        if (fileCallback != null) { fileCallback.onReceiveValue(value); fileCallback = null; }
    }
    private void clearCameraFile() {
        if (cameraOutput != null) revokeUriPermission(cameraOutput, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        if (cameraFile != null) cameraFile.delete();
        cameraOutput = null; cameraFile = null;
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != FILE_CHOOSER) return;
        if (result != RESULT_OK) { finishPhoto(null); clearCameraFile(); return; }
        Uri uri = cameraOutput != null && cameraFile != null && cameraFile.length() > 0 ? cameraOutput : data == null ? null : data.getData();
        if (uri != null && !"content".equals(uri.getScheme())) uri = null;
        finishPhoto(uri == null ? null : new Uri[]{uri});
        // Keep the capture file until the next selection, so WebView can read it asynchronously.
    }
    private void handleMessage(String raw) {
        try {
            JSONObject body = new JSONObject(raw);
            switch (body.getString("action")) {
                case "billingCatalog": billing.catalog(); break;
                case "billingRestore": billing.restore(); break;
                case "billingManage": billing.manage(); break;
                case "billingPurchase":
                    JSONObject purchase = body.getJSONObject("payload");
                    billing.purchase(purchase.getString("productId"), purchase.getString("accountId")); break;
                case "setLanguage": MeowLocale.save(this, body.getJSONObject("payload").optString("language")); break;
                case "status": reply(null); break;
                case "authorize": authorize(); break;
                case "selectApps": startActivity(new Intent(this, AppPickerActivity.class)); break;
                case "sync":
                    JSONObject sync = body.getJSONObject("payload");
                    store.sync(sync.getJSONArray("tasks"), sync.optString("activeCat", store.activeCat()));
                    reply(null); break;
                case "disableGuard": reply(store.setEnabled(false) ? null : "睡眠守护六小时后自动结束，不能提前解除"); break;
                case "deleteAccount": store.deleteAccountData(); reply(null); break;
                case "configureServer": showSetup(); break;
                default: reply(MeowLocale.text(MainActivity.this, "不支持的原生操作。"));
            }
        } catch (Exception error) { reply(MeowLocale.text(MainActivity.this, "守护操作失败：") + (error.getMessage() == null ? MeowLocale.text(MainActivity.this, "请重试") : MeowLocale.text(this, error.getMessage()))); }
    }
    private void authorize() {
        new AlertDialog.Builder(this).setTitle(MeowLocale.text(MainActivity.this, "开启安卓专注守护"))
            .setMessage(MeowLocale.text(MainActivity.this, "ShutterCat需要你主动开启无障碍服务，在约定任务到期后为选中的 App 显示提醒。\n\n仅在本机使用前台 App 的包名，不读取屏幕内容，不自动点击，不上传应用列表。\n\n普通任务可以在ShutterCat或提醒页关闭守护。睡眠任务开始后六小时内，App中不能提前解除；结束后自动解除睡眠覆盖。系统设置仍可撤销权限。关闭守护不等于完成任务，也不会自动扣喵币。"))
            .setNegativeButton(MeowLocale.text(MainActivity.this, "暂不开启"), null)
            .setPositiveButton(MeowLocale.text(MainActivity.this, "同意并继续"), (dialog, which) -> {
                store.acceptDisclosure();
                if (!FocusAccessibilityService.isEnabled(this)) {
                    try { startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)); }
                    catch (Exception error) { reply(MeowLocale.text(MainActivity.this, "无法打开系统设置，请手动进入无障碍设置。")); return; }
                }
                reply(null);
            }).show();
    }
    private void reply(String error) {
        if (web == null || !ServerAddress.sameOrigin(web.getUrl() == null ? "" : web.getUrl(), origin)) return;
        try {
            JSONObject value = new JSONObject()
                .put("platform", "android")
                .put("bedtimeSupported", true)
                .put("bedtimeUntil", store.bedtimeUntil())
                .put("locale", store.prefs.contains("locale") ? MeowLocale.choice(this) : JSONObject.NULL)
                .put("authorized", FocusAccessibilityService.isEnabled(this))
                .put("guardEnabled", store.enabled())
                .put("serviceRunning", FocusAccessibilityService.isRunning())
                .put("selectedCount", store.selected().size())
                .put("lastSyncAt", store.lastSync())
                .put("error", error == null ? JSONObject.NULL : error);
            web.evaluateJavascript("window.meowNativeReply?.(" + value + ")", null);
        } catch (Exception ignored) { }
    }
    @Override protected void onResume() {
        super.onResume();
        if (web != null) { web.onResume(); reply(null); web.evaluateJavascript("window.dispatchEvent(new Event('meowNativeResume'))", null); }
    }
    @Override protected void onPause() { if (web != null) { CookieManager.getInstance().flush(); web.onPause(); } super.onPause(); }
    @Override public void onBackPressed() { handleBack(); }
    private void handleBack() {
        if (web == null) { if (origin.isEmpty()) finish(); else showWeb(); return; }
        web.evaluateJavascript("(()=>{const d=document.querySelector('dialog[open]');if(!d)return false;d.dispatchEvent(new Event('cancel',{cancelable:true}));return true})()", value -> {
            if ("true".equals(value)) return;
            if (web != null && web.canGoBack()) web.goBack(); else moveTaskToBack(true);
        });
    }
    @Override protected void onDestroy() {
        if (Build.VERSION.SDK_INT >= 33 && backCallback != null) getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        if (billing != null) billing.close();
        destroyWeb(); clearCameraFile(); super.onDestroy();
    }
}
