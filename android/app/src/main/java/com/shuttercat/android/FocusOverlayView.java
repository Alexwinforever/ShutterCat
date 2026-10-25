package com.shuttercat.android;

import android.content.Context;
import android.os.Build;
import android.view.Gravity;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;

/** Opaque artwork shield with controls kept outside the illustration. */
final class FocusOverlayView extends LinearLayout {
    private final ImageView artwork;
    private final ScrollView controls;
    private int controlsMaxHeight;

    FocusOverlayView(Context context, int image, long bedtimeUntil, Runnable returnToApp, Runnable disableGuard) {
        super(context);
        setBackgroundColor(NativeUi.PAPER);
        setClickable(true);
        setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(
                    WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                setPadding(safe.left, safe.top, safe.right, safe.bottom);
            } else {
                int left = insets.getSystemWindowInsetLeft(), top = insets.getSystemWindowInsetTop();
                int right = insets.getSystemWindowInsetRight(), bottom = insets.getSystemWindowInsetBottom();
                if (Build.VERSION.SDK_INT >= 28 && insets.getDisplayCutout() != null) {
                    android.view.DisplayCutout cutout = insets.getDisplayCutout();
                    left = Math.max(left, cutout.getSafeInsetLeft());
                    top = Math.max(top, cutout.getSafeInsetTop());
                    right = Math.max(right, cutout.getSafeInsetRight());
                    bottom = Math.max(bottom, cutout.getSafeInsetBottom());
                }
                setPadding(left, top, right, bottom);
            }
            return insets;
        });

        artwork = new ImageView(context);
        artwork.setImageResource(image);
        artwork.setScaleType(ImageView.ScaleType.FIT_CENTER);
        artwork.setContentDescription(bedtimeUntil > 0 ? MeowLocale.text(context, "按时睡觉，猫猫陪你休息") : MeowLocale.text(context, "先开始，再来玩。") + "\n"
            + MeowLocale.text(context, "小猫正在等你迈出第一步。\n回到ShutterCat，提交开始凭证或主动接受惩罚。\n多个任务到期时，需要逐项处理。"));
        addView(artwork);

        // Scrolling keeps both actions reachable with large fonts and small windows.
        controls = new ScrollView(context) {
            @Override protected void onMeasure(int widthSpec, int heightSpec) {
                super.onMeasure(widthSpec, MeasureSpec.makeMeasureSpec(controlsMaxHeight, MeasureSpec.AT_MOST));
            }
        };
        LinearLayout buttons = new LinearLayout(context);
        buttons.setOrientation(VERTICAL);
        buttons.setGravity(Gravity.CENTER);
        int gap = NativeUi.dp(context, 12);
        buttons.setPadding(gap, gap, gap, gap);
        if (bedtimeUntil > 0) {
            android.widget.TextView message = new android.widget.TextView(context);
            message.setText(MeowLocale.text(context, "睡眠守护中，无需提交照片") + "\n"
                + MeowLocale.text(context, "自动结束时间") + "：" + android.text.format.DateFormat.getTimeFormat(context).format(new java.util.Date(bedtimeUntil)));
            message.setTextSize(18);
            message.setTextColor(android.graphics.Color.rgb(50, 44, 40));
            message.setGravity(Gravity.CENTER);
            buttons.addView(message);
        }
        Button back = new Button(context);
        back.setText(MeowLocale.text(context, "回到ShutterCat"));
        back.setOnClickListener(v -> returnToApp.run());
        Button close = new Button(context);
        close.setText(MeowLocale.text(context, "紧急关闭守护（不结算任务）"));
        close.setOnClickListener(v -> disableGuard.run());
        buttons.addView(back, new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));
        if (bedtimeUntil == 0) buttons.addView(close, new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));
        controls.addView(buttons);
        addView(controls);
    }

    @Override protected void onMeasure(int widthSpec, int heightSpec) {
        int width = Math.max(0, MeasureSpec.getSize(widthSpec) - getPaddingLeft() - getPaddingRight());
        int height = Math.max(0, MeasureSpec.getSize(heightSpec) - getPaddingTop() - getPaddingBottom());
        boolean landscape = width > height;
        setOrientation(landscape ? HORIZONTAL : VERTICAL);
        setGravity(Gravity.CENTER);
        controlsMaxHeight = landscape ? height : height / 2;
        artwork.setLayoutParams(landscape
            ? new LayoutParams(0, LayoutParams.MATCH_PARENT, 1)
            : new LayoutParams(LayoutParams.MATCH_PARENT, 0, 1));
        controls.setLayoutParams(landscape
            ? new LayoutParams(Math.min(width / 2, NativeUi.dp(getContext(), 360)), LayoutParams.WRAP_CONTENT)
            : new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));
        super.onMeasure(widthSpec, heightSpec);
    }
}
