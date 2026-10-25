package com.shuttercat.android;

import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.WindowInsets;
import android.widget.LinearLayout;
import android.widget.TextView;

final class NativeUi {
    static final int PAPER = Color.rgb(247, 243, 233);
    static final int INK = Color.rgb(76, 64, 53);
    static int dp(android.content.Context context, int n) { return Math.round(context.getResources().getDisplayMetrics().density * n); }
    static LinearLayout root(Activity activity) {
        if (Build.VERSION.SDK_INT >= 30) activity.getWindow().setDecorFitsSystemWindows(false);
        LinearLayout root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(PAPER);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        activity.setContentView(root);
        root.requestApplyInsets();
        return root;
    }
    static TextView text(Activity activity, String value, int size) {
        TextView view = new TextView(activity);
        view.setText(value); view.setTextSize(size); view.setTextColor(INK);
        view.setPadding(dp(activity, 20), dp(activity, 12), dp(activity, 20), dp(activity, 12));
        return view;
    }
}
