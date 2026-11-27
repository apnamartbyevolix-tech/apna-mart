package in.apnamart.app;
import org.junit.Test;
import static org.junit.Assert.*;

public class StartupOriginTest {
    @Test public void releaseAcceptsOnlyTheOwnedHttpsOrigin() {
        assertTrue(StartupActivity.allowedServer("https://apna-mart.in", false));
        for (String url : new String[]{"http://apna-mart.in", "https://apna-mart.in/other", "https://apna-mart.in.evil.invalid", "https://user@apna-mart.in", "https://apna-mart.in#test", "https://apna-mart.in?host=elsewhere"})
            assertFalse(StartupActivity.allowedServer(url, false));
    }
    @Test public void loopbackPreviewCannotLeakIntoRelease() {
        for (String url : new String[]{"http://127.0.0.1:5205", "http://127.0.0.1:5206", "http://127.0.0.1:5210"}) {
            assertTrue(StartupActivity.allowedServer(url, true));
            assertFalse(StartupActivity.allowedServer(url, false));
        }
    }
    @Test public void debugDoesNotPermitArbitraryOriginsOrPorts() {
        assertFalse(StartupActivity.allowedServer("https://attacker.invalid", true));
        assertFalse(StartupActivity.allowedServer("http://127.0.0.1:9999", true));
        assertFalse(StartupActivity.allowedServer("http://localhost:5210", true));
    }
}
