package com.shuttercat.android;

import static org.junit.Assert.*;
import org.junit.Test;

public class ServerAddressTest {
    @Test public void normalizesHttpsRoot() {
        assertEquals("https://example.com", ServerAddress.normalize(" https://EXAMPLE.com:443/ ", false));
        assertEquals("https://example.com:8443", ServerAddress.normalize("https://example.com:8443", false));
    }
    @Test public void onlyDebugAllowsLoopbackHttp() {
        assertEquals("http://127.0.0.1:8787", ServerAddress.normalize("http://127.0.0.1:8787", true));
        assertEquals("http://10.0.2.2:8787", ServerAddress.normalize("http://10.0.2.2:8787", true));
        for (String url : new String[]{"http://example.com", "http://192.168.1.2", "https://user:pass@example.com", "file:///x", "javascript:alert(1)", "https://example.com/path", "https://example.com?token=x", "https://example.com#x", "https://example.com:99999"}) {
            assertThrows(IllegalArgumentException.class, () -> ServerAddress.normalize(url, true));
        }
        assertThrows(IllegalArgumentException.class, () -> ServerAddress.normalize("http://127.0.0.1:8787", false));
    }
    @Test public void rejectsUntrustedBridgeOrigin() {
        assertTrue(ServerAddress.sameOrigin("https://example.com/api/state", "https://example.com"));
        assertFalse(ServerAddress.sameOrigin("https://example.com.evil.test", "https://example.com"));
        assertFalse(ServerAddress.sameOrigin("http://example.com", "https://example.com"));
        assertFalse(ServerAddress.sameOrigin("https://example.com:444", "https://example.com"));
        assertFalse(ServerAddress.sameOrigin("https://user@example.com", "https://example.com"));
    }
}
