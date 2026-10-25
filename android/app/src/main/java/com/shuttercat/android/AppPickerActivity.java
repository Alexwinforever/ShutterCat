package com.shuttercat.android;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.ResolveInfo;
import android.os.Bundle;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class AppPickerActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        FocusStore store = new FocusStore(this);
        if (store.bedtimeUntil() > 0) {
            new android.app.AlertDialog.Builder(this).setMessage("睡眠守护期间不能修改娱乐 App 范围")
                .setPositiveButton(android.R.string.ok, (dialog, which) -> finish()).setOnCancelListener(dialog -> finish()).show(); return;
        }
        LinearLayout root = NativeUi.root(this);
        root.addView(NativeUi.text(this, MeowLocale.text(AppPickerActivity.this, "选择需要守护的娱乐 App"), 22));
        root.addView(NativeUi.text(this, MeowLocale.text(AppPickerActivity.this, "只显示可启动的非系统应用。ShutterCat、系统设置、电话和桌面不会被守护。应用列表仅保存在此设备。"), 14));
        ScrollView scroll = new ScrollView(this);
        LinearLayout list = new LinearLayout(this); list.setOrientation(LinearLayout.VERTICAL); scroll.addView(list);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        Set<String> chosen = store.selected();
        Set<String> seen = new HashSet<>();
        List<ResolveInfo> apps = new ArrayList<>(getPackageManager().queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0));
        apps.sort(Comparator.comparing(info -> info.loadLabel(getPackageManager()).toString(), String.CASE_INSENSITIVE_ORDER));
        for (ResolveInfo info : apps) {
            ApplicationInfo app = info.activityInfo.applicationInfo;
            String pkg = app.packageName;
            if ((app.flags & (ApplicationInfo.FLAG_SYSTEM | ApplicationInfo.FLAG_UPDATED_SYSTEM_APP)) != 0
                || FocusAccessibilityService.isProtected(this, pkg) || !seen.add(pkg)) continue;
            CheckBox check = new CheckBox(this);
            check.setText(info.loadLabel(getPackageManager()) + "\n" + pkg);
            check.setTextSize(15); check.setPadding(24, 16, 24, 16); check.setChecked(chosen.contains(pkg));
            check.setOnCheckedChangeListener((button, checked) -> { if (checked) chosen.add(pkg); else chosen.remove(pkg); });
            list.addView(check);
        }
        chosen.retainAll(seen);
        if (seen.isEmpty()) list.addView(NativeUi.text(this, MeowLocale.text(AppPickerActivity.this, "没有找到可选择的非系统应用。可以先安装一款娱乐 App 再返回。"), 16));
        Button save = new Button(this); save.setText(MeowLocale.text(AppPickerActivity.this, "保存选择"));
        save.setOnClickListener(view -> {
            if (store.setSelected(chosen)) finish();
            else new android.app.AlertDialog.Builder(this).setMessage("睡眠守护已开始，不能修改娱乐 App 范围")
                .setPositiveButton(android.R.string.ok, (dialog, which) -> finish()).show();
        });
        root.addView(save);
        Button cancel = new Button(this); cancel.setText(MeowLocale.text(AppPickerActivity.this, "取消")); cancel.setOnClickListener(view -> finish()); root.addView(cancel);
    }
}
