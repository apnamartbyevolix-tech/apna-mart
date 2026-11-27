package in.apnamart.app;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Packaged waiting room: no remote HTML or device bridge is exposed here. */
public class StartupActivity extends AppCompatActivity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private WebView screen;
    private volatile HttpURLConnection connection;
    private boolean foreground, busy, pageReady, closed;
    private int attempts;
    private String server;
    private final Runnable nextAttempt = this::probe;

    @Override public void onCreate(Bundle state) {
        setTheme(R.style.AppTheme_NoActionBar);
        super.onCreate(state);
        attempts = state == null ? 0 : state.getInt("startupAttempts", 0);
        try {
            JSONObject config = new JSONObject(asset("capacitor.config.json"));
            JSONObject remote = config.optJSONObject("server");
            server = remote == null ? null : remote.optString("url", "");
            if (server == null || server.isEmpty()) { openApp(); return; }
            boolean debug = (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
            if (!allowedServer(server, debug)) throw new IllegalStateException("Invalid startup origin");
            screen = new WebView(this);
            WebView.setWebContentsDebuggingEnabled(debug);
            screen.setBackgroundColor(0xfffaf7f0);
            screen.getSettings().setJavaScriptEnabled(true);
            screen.getSettings().setAllowFileAccess(false);
            screen.getSettings().setAllowContentAccess(false);
            screen.getSettings().setBlockNetworkLoads(true);
            screen.setWebViewClient(new WebViewClient() {
                @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    if ("mart-startup:retry".equals(request.getUrl().toString()) && !busy) {
                        attempts = 0; handler.removeCallbacks(nextAttempt); probe();
                    }
                    return true;
                }
                @Override public void onPageFinished(WebView view, String url) {
                    pageReady = true;
                    if (attempts >= 12) show("error", "The server has not confirmed it is ready. Please try again.");
                    else probe();
                }
            });
            setContentView(screen);
            ViewCompat.setOnApplyWindowInsetsListener(screen, (view, insets) -> {
                androidx.core.graphics.Insets safe = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom); return WindowInsetsCompat.CONSUMED;
            });
            ViewCompat.requestApplyInsets(screen);
            WindowInsetsControllerCompat bars = new WindowInsetsControllerCompat(getWindow(), screen);
            bars.setAppearanceLightStatusBars(true); bars.setAppearanceLightNavigationBars(true);
            String html = "<!doctype html><html lang=\"en\" data-native-startup=\"true\"><head>"
                + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                + "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:;\">"
                + "<style>" + asset("public/startup.css") + "</style></head><body><script>"
                + "window.MART_STARTUP_LOGO='data:image/png;base64," + android.util.Base64.encodeToString(assetBytes("public/brand/apna-mart-icon-192.png"), android.util.Base64.NO_WRAP) + "';"
                + asset("public/startup.js") + "</script></body></html>";
            screen.loadDataWithBaseURL("https://startup.apnamart.invalid/", html, "text/html", "UTF-8", null);
        } catch (Exception error) {
            // The built-in page is required; never navigate to an unvalidated origin.
            android.widget.TextView message = new android.widget.TextView(this);
            message.setText("Apna Mart could not start. Please close and reopen the app.");
            message.setPadding(32, 80, 32, 32); setContentView(message);
        }
    }

    static boolean allowedServer(String url, boolean debug) {
        return "https://apna-mart.in".equals(url) || debug && (
            "http://127.0.0.1:5205".equals(url) || "http://127.0.0.1:5206".equals(url) || "http://127.0.0.1:5210".equals(url));
    }
    private String asset(String name) throws Exception {
        return new String(assetBytes(name), StandardCharsets.UTF_8);
    }
    private byte[] assetBytes(String name) throws Exception {
        try (InputStream input = getAssets().open(name)) { return readBounded(input, 131072); }
    }
    private byte[] readBounded(InputStream input, int limit) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream(); byte[] buffer = new byte[1024]; int count;
        while ((count = input.read(buffer, 0, Math.min(buffer.length, limit + 1 - output.size()))) != -1) {
            output.write(buffer, 0, count);
            if (output.size() > limit) throw new IllegalStateException("Response limit");
        }
        return output.toByteArray();
    }
    private void show(String phase, String message) {
        if (!closed && pageReady && screen != null)
            screen.evaluateJavascript("window.MartStartup?.phase(" + JSONObject.quote(phase) + "," + JSONObject.quote(message) + ")", null);
    }
    private void probe() {
        if (!foreground || closed || busy || !pageReady || attempts >= 12) return;
        attempts++; busy = true;
        show("waiting", attempts == 1 ? "Connecting to your local marketplace…" : "Our shop server is still waking up. You can play while you wait.");
        worker.execute(() -> {
            boolean ready = false;
            HttpURLConnection request = null;
            try {
                request = (HttpURLConnection) new URL(server + "/api/health/ready").openConnection();
                connection = request;
                request.setConnectTimeout(6000); request.setReadTimeout(6000);
                request.setInstanceFollowRedirects(false); request.setRequestProperty("Accept", "application/json");
                if (request.getResponseCode() == 200 && request.getContentType() != null && request.getContentType().contains("application/json")) {
                    try (InputStream input = request.getInputStream()) {
                        byte[] bytes = readBounded(input, 256);
                        ready = bytes.length <= 256 && "ok".equals(new JSONObject(new String(bytes, StandardCharsets.UTF_8)).optString("status"));
                    }
                }
            } catch (Exception ignored) { /* Only a confirmed JSON readiness response opens the app. */ }
            finally { if (request != null) request.disconnect(); connection = null; }
            final boolean confirmed = ready;
            handler.post(() -> {
                busy = false;
                if (closed || !foreground) return;
                if (confirmed) { show("opening", "Connected. Opening your marketplace…"); openApp(); }
                else if (attempts >= 12) show("error", "The server has not confirmed it is ready. Please check your connection and try again.");
                else handler.postDelayed(nextAttempt, Math.min(8000, attempts * 1500));
            });
        });
    }
    private void openApp() {
        if (closed) return;
        closed = true; handler.removeCallbacksAndMessages(null);
        startActivity(new Intent(this, MainActivity.class)); finish();
    }
    @Override protected void onStart() { super.onStart(); foreground = true; if (screen != null) screen.onResume(); probe(); }
    @Override protected void onStop() {
        foreground = false; handler.removeCallbacks(nextAttempt);
        if (screen != null) screen.onPause();
        HttpURLConnection active = connection; if (active != null) active.disconnect();
        super.onStop();
    }
    @Override protected void onSaveInstanceState(Bundle state) { state.putInt("startupAttempts", attempts); super.onSaveInstanceState(state); }
    @Override protected void onDestroy() {
        closed = true; handler.removeCallbacksAndMessages(null); worker.shutdownNow();
        HttpURLConnection active = connection; if (active != null) active.disconnect();
        if (screen != null) { screen.loadUrl("about:blank"); screen.destroy(); }
        super.onDestroy();
    }
}
