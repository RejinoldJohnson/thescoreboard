import { useEffect, useRef, useCallback } from "react";

const PING_MS       = 20_000;  // client sends ping every 20 s
const RECONNECT_MS  = 3_000;   // initial reconnect delay
const MAX_RECONNECT = 30_000;  // cap backoff at 30 s

function buildWsUrl(slug) {
  // 1. Explicit WS URL (set in .env.development to bypass Vite's broken WS proxy)
  const wsUrl = import.meta.env.VITE_WS_URL;
  if (wsUrl) return `${wsUrl}/ws/tournament/${slug}`;

  // 2. Production: derive from the HTTP API URL (https → wss)
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl) return `${apiUrl.replace(/^http/, "ws")}/ws/tournament/${slug}`;

  // 3. Last-resort fallback — same host, /api prefix
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/api/ws/tournament/${slug}`;
}

/**
 * Opens a WebSocket to the tournament real-time endpoint.
 *
 * @param {object} opts
 * @param {string}   opts.slug          - tournament slug
 * @param {function} opts.onData        - called with parsed JSON whenever server pushes
 * @param {function} [opts.onConnected] - called when WS opens
 * @param {function} [opts.onDisconnected] - called on close/error (before reconnect)
 */
export function useTournamentSocket({ slug, onData, onConnected, onDisconnected }) {
  const wsRef        = useRef(null);
  const pingRef      = useRef(null);
  const reconnectRef = useRef(null);
  const delayRef     = useRef(RECONNECT_MS);
  const deadRef      = useRef(false);   // set true on unmount to stop reconnects

  // Stable refs so the connect closure never stales
  const onDataRef         = useRef(onData);
  const onConnectedRef    = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);
  useEffect(() => { onDataRef.current         = onData;         }, [onData]);
  useEffect(() => { onConnectedRef.current    = onConnected;    }, [onConnected]);
  useEffect(() => { onDisconnectedRef.current = onDisconnected; }, [onDisconnected]);

  const connect = useCallback(() => {
    if (deadRef.current || !slug) return;

    const url = buildWsUrl(slug);
    const ws  = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      // Component may have unmounted while the handshake was in flight (React
      // StrictMode double-mount).  Close immediately — onclose will fire and
      // skip the reconnect because deadRef is already true.
      if (deadRef.current) { ws.close(); return; }
      delayRef.current = RECONNECT_MS; // reset backoff on successful connect
      onConnectedRef.current?.();
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, PING_MS);
    };

    ws.onmessage = (e) => {
      if (e.data === "ping") { ws.send("pong"); return; }
      if (e.data === "pong") return;
      try {
        const payload = JSON.parse(e.data);
        onDataRef.current?.(payload);
      } catch {
        // ignore malformed frames
      }
    };

    ws.onerror = (e) => {
      console.warn("[WS] connection error", url, e);
      onDisconnectedRef.current?.();
    };

    ws.onclose = () => {
      clearInterval(pingRef.current);
      onDisconnectedRef.current?.();
      if (!deadRef.current) {
        reconnectRef.current = setTimeout(() => {
          delayRef.current = Math.min(delayRef.current * 2, MAX_RECONNECT);
          connect();
        }, delayRef.current);
      }
    };
  }, [slug]);

  useEffect(() => {
    deadRef.current = false;
    connect();
    return () => {
      deadRef.current = true;
      clearInterval(pingRef.current);
      clearTimeout(reconnectRef.current);
      const ws = wsRef.current;
      // Only close OPEN sockets.  CONNECTING sockets are handled by onopen
      // (it checks deadRef and closes there), avoiding the StrictMode warning.
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [connect]);
}
