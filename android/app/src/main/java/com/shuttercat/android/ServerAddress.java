package com.shuttercat.android;

import java.net.URI;
import java.util.Locale;
import java.util.Set;

public final class ServerAddress {
    private ServerAddress() {}
    public static String normalize(String value, boolean debug) {
        try {
            URI uri = new URI(value.trim());
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            boolean local = java.util.Arrays.asList("localhost", "127.0.0.1", "10.0.2.2").contains(host);
            if (host.isEmpty() || uri.getRawUserInfo() != null || uri.getRawQuery() != null
                || uri.getRawFragment() != null || (uri.getRawPath() != null && !uri.getRawPath().isEmpty() && !"/".equals(uri.getRawPath()))
                || uri.getPort() == 0 || uri.getPort() > 65535 || uri.getPort() < -1
                || (!"https".equals(scheme) && !(debug && local && "http".equals(scheme))))
                throw new IllegalArgumentException();
            int port = uri.getPort();
            if ((scheme.equals("https") && port == 443) || (scheme.equals("http") && port == 80)) port = -1;
            return new URI(scheme, null, host, port, null, null, null).toString();
        } catch (Exception error) {
            throw new IllegalArgumentException("请输入完整的 HTTPS 服务根地址，不包含路径、账号、参数或片段。调试版也支持本机回环 HTTP 地址。");
        }
    }
    public static boolean sameOrigin(String value, String expected) {
        try {
            URI uri = new URI(value);
            if (uri.getRawUserInfo() != null || uri.getHost() == null) return false;
            return normalize(new URI(uri.getScheme(), null, uri.getHost(), uri.getPort(), null, null, null).toString(), true).equals(expected);
        } catch (Exception ignored) { return false; }
    }
}
