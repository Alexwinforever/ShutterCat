package com.shuttercat.android;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import com.android.billingclient.api.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.*;
import java.util.function.Consumer;

final class PlayBilling {
    private static final List<String> IDS = List.of("shuttercat_monthly", "shuttercat_quarterly", "shuttercat_yearly");
    private final Activity activity;
    private final Consumer<JSONObject> send;
    private final BillingClient client;
    private final Map<String, ProductDetails> products = new HashMap<>();
    private final Map<String, ProductDetails.SubscriptionOfferDetails> offers = new HashMap<>();
    private boolean connecting;
    private final List<Runnable> waiting = new ArrayList<>();
    PlayBilling(Activity activity, Consumer<JSONObject> send) {
        this.activity = activity; this.send = send;
        client = BillingClient.newBuilder(activity).setListener((result, purchases) -> {
            if (result.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) purchases(purchases);
            else if (result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) emit("cancelled", null);
            else error("Google Play purchase failed (" + result.getResponseCode() + ")");
        }).enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()).enableAutoServiceReconnection().build();
    }
    private void ready(Runnable task) {
        if (client.isReady()) { task.run(); return; }
        waiting.add(task);
        if (connecting) return;
        connecting = true;
        client.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(BillingResult result) {
                connecting = false;
                List<Runnable> tasks = new ArrayList<>(waiting); waiting.clear();
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) for (Runnable item : tasks) item.run();
                else error("Google Play Billing is unavailable (" + result.getResponseCode() + ")");
            }
            @Override public void onBillingServiceDisconnected() { connecting = false; }
        });
    }
    void catalog() {
        ready(() -> {
            List<QueryProductDetailsParams.Product> list = new ArrayList<>();
            for (String id : IDS) list.add(QueryProductDetailsParams.Product.newBuilder().setProductId(id).setProductType(BillingClient.ProductType.SUBS).build());
            client.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(list).build(), (result, response) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { error("Cannot load Google Play prices"); return; }
                products.clear(); offers.clear();
                JSONArray items = new JSONArray();
                for (ProductDetails product : response.getProductDetailsList()) {
                    if (product.getSubscriptionOfferDetails() == null) continue;
                    for (ProductDetails.SubscriptionOfferDetails offer : product.getSubscriptionOfferDetails()) {
                        // Only the configured full-price auto-renewing base plan, never a trial/intro offer.
                        if (!"standard".equals(offer.getBasePlanId()) || offer.getOfferId() != null) continue;
                        List<ProductDetails.PricingPhase> phases = offer.getPricingPhases().getPricingPhaseList();
                        String expectedPeriod = product.getProductId().equals("shuttercat_monthly") ? "P1M" : product.getProductId().equals("shuttercat_quarterly") ? "P3M" : "P1Y";
                        if (phases.size() != 1 || !expectedPeriod.equals(phases.get(0).getBillingPeriod()) || phases.get(0).getRecurrenceMode() != ProductDetails.RecurrenceMode.INFINITE_RECURRING) continue;
                        products.put(product.getProductId(), product); offers.put(product.getProductId(), offer);
                        try { items.put(new JSONObject().put("id", product.getProductId()).put("price", phases.get(0).getFormattedPrice())); } catch (Exception ignored) { }
                    }
                }
                emit("catalog", items);
            });
        });
    }
    void purchase(String productId, String accountId) {
        if (!IDS.contains(productId) || !accountId.matches("[a-f0-9]{64}")) { error("Invalid purchase request"); return; }
        ready(() -> {
            ProductDetails product = products.get(productId);
            ProductDetails.SubscriptionOfferDetails offer = offers.get(productId);
            if (product == null || offer == null) { error("Load Google Play prices first"); catalog(); return; }
            BillingFlowParams.ProductDetailsParams details = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(product).setOfferToken(offer.getOfferToken()).build();
            client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(), (query, existing) -> {
                if (query.getResponseCode() != BillingClient.BillingResponseCode.OK) { error("Cannot check existing subscriptions"); return; }
                for (Purchase purchase : existing) {
                    if (!Collections.disjoint(purchase.getProducts(), IDS)) { purchases(existing); return; }
                }
                activity.runOnUiThread(() -> {
                    BillingResult result = client.launchBillingFlow(activity, BillingFlowParams.newBuilder().setProductDetailsParamsList(List.of(details)).setObfuscatedAccountId(accountId).build());
                    if (result.getResponseCode() == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) restore();
                    else if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) error("Cannot start Google Play purchase (" + result.getResponseCode() + ")");
                });
            });
        });
    }
    void restore() {
        ready(() -> client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(), (result, purchases) -> {
            if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) purchases(purchases);
            else error("Cannot restore Google Play purchases");
        }));
    }
    private void purchases(List<Purchase> purchases) {
        JSONArray tokens = new JSONArray();
        boolean pending = false;
        for (Purchase purchase : purchases) {
            if (Collections.disjoint(purchase.getProducts(), IDS)) continue;
            if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) tokens.put(purchase.getPurchaseToken());
            else if (purchase.getPurchaseState() == Purchase.PurchaseState.PENDING) pending = true;
        }
        if (tokens.length() > 0) emit("purchases", tokens);
        else emit(pending ? "pending" : "empty", null);
        // Server verifies ownership and acknowledges; client never grants entitlement.
    }
    void manage() {
        try { activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/account/subscriptions?package=" + activity.getPackageName()))); }
        catch (Exception e) { error("Cannot open Google Play subscriptions"); }
    }
    private void error(String message) {
        try { send.accept(new JSONObject().put("kind", "error").put("message", message)); } catch (Exception ignored) { }
    }
    private void emit(String kind, JSONArray items) {
        try { send.accept(new JSONObject().put("kind", kind).put("items", items)); } catch (Exception ignored) { }
    }
    void close() { waiting.clear(); client.endConnection(); }
}
