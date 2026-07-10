package com.safarenglishka.app;

import com.getcapacitor.BridgeActivity;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import androidx.core.view.WindowCompat;

public class MainActivity extends BridgeActivity {
    /** Pending callback for an in-flight `<input type="file">` picker. */
    private ValueCallback<Uri[]> filePathCallback;
    private static final int FILE_CHOOSER_REQUEST = 51426;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // capacitor-razorpay auto-registers its plugin via Capacitor's plugin
        // discovery (declared in package.json). Do NOT call registerPlugin()
        // with com.razorpay.Checkout — that's the native Razorpay SDK class,
        // not a Capacitor Plugin subclass, and won't compile.
        super.onCreate(savedInstanceState);


        // Hook the WebView's WebChromeClient so we can react to HTML5
        // Element.requestFullscreen() (used by our video players) and
        // toggle Android immersive mode — hides the top status bar and
        // bottom navigation bar while a video is fullscreen.
        com.getcapacitor.Bridge b = getBridge();
        if (b != null && b.getWebView() != null) {
            b.getWebView().setWebChromeClient(new BridgeFullscreenWebChromeClient(this));
            b.getWebView().addJavascriptInterface(new ImmersiveBridge(this), "AndroidImmersive");
        }
    }

    /**
     * Launches the native file picker for a WebView `<input type="file">`.
     * Returns true so the WebView waits for the async result delivered via
     * onActivityResult. Without this, tapping "Add PDF" does nothing.
     */
    boolean startFileChooser(ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
        // Cancel any previous in-flight picker so we never leak a callback.
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
        }
        filePathCallback = callback;

        Intent intent;
        try {
            intent = params.createIntent();
        } catch (Exception e) {
            intent = new Intent(Intent.ACTION_GET_CONTENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
        }
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

        try {
            startActivityForResult(Intent.createChooser(intent, "Select file"), FILE_CHOOSER_REQUEST);
        } catch (Exception e) {
            filePathCallback = null;
            callback.onReceiveValue(null);
            return false;
        }
        return true;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (filePathCallback != null) {
                Uri[] results = null;
                if (resultCode == Activity.RESULT_OK && data != null) {
                    results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
                }
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }



    void enterImmersive() {
        runOnUiThread(() -> {
            Window window = getWindow();
            if (window == null) return;
            WindowCompat.setDecorFitsSystemWindows(window, false);
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                WindowInsetsController controller = window.getInsetsController();
                if (controller != null) {
                    controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    controller.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                    );
                }
            } else {
                View decor = window.getDecorView();
                decor.setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                );
            }
        });
    }

    void exitImmersive() {
        runOnUiThread(() -> {
            Window window = getWindow();
            if (window == null) return;
            WindowCompat.setDecorFitsSystemWindows(window, true);
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                WindowInsetsController controller = window.getInsetsController();
                if (controller != null) {
                    controller.show(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                }
            } else {
                View decor = window.getDecorView();
                decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
            }
        });
    }
}

class ImmersiveBridge {
    private final MainActivity activity;
    ImmersiveBridge(MainActivity activity) { this.activity = activity; }

    /**
     * S1 (security): Origin-gate the JS bridge so only first-party app HTML
     * (loaded from https://localhost via Capacitor's androidScheme, or a
     * trusted safarenglishka.com origin) can toggle immersive mode. Without
     * this, any 3rd-party iframe/page ever loaded into the main WebView
     * could control device chrome.
     */
    private boolean isTrustedOrigin() {
        try {
            com.getcapacitor.Bridge b = activity.getBridge();
            String url = b != null && b.getWebView() != null
                ? b.getWebView().getUrl() : null;
            if (url == null) return false;
            return url.startsWith("https://localhost")
                || url.startsWith("capacitor://localhost")
                || url.startsWith("http://localhost")
                || url.startsWith("https://safarenglishka.com")
                || url.startsWith("https://www.safarenglishka.com")
                || url.startsWith("https://app.safarenglishka.com");
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public void enter() {
        if (!isTrustedOrigin()) return;
        activity.enterImmersive();
    }

    @JavascriptInterface
    public void exit() {
        if (!isTrustedOrigin()) return;
        activity.exitImmersive();
    }
}
