export function connectWs(params: {
  channel: 'admin' | 'player' | 'deliberation';
  gameId: string;
  token?: string;
  onMessage: (message: any) => void;
  onStateChange?: (state: 'connecting' | 'connected' | 'disconnected') => void;
}) {
  const base = (import.meta.env.VITE_ENGINE_WS_URL || 'ws://localhost:3001').replace(/\/$/, '');
  const tokenQuery = params.token ? `?token=${encodeURIComponent(params.token)}` : '';
  const url = `${base}/ws/v2/${params.channel}/${params.gameId}${tokenQuery}`;

  let ws: WebSocket | null = null;
  let disposed = false;
  let retryDelay = 400;

  const connect = () => {
    if (disposed) return;
    params.onStateChange?.('connecting');
    ws = new WebSocket(url);

    ws.onopen = () => {
      retryDelay = 400;
      params.onStateChange?.('connected');
    };

    ws.onmessage = (event) => {
      try {
        params.onMessage(JSON.parse(event.data));
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = (event) => {
      if (disposed) return;
      params.onStateChange?.('disconnected');

      // Policy violation/forbidden: do not reconnect endlessly.
      if (event.code === 1008) {
        return;
      }

      const delay = retryDelay;
      retryDelay = Math.min(retryDelay * 2, 4000);
      window.setTimeout(connect, delay);
    };

    ws.onerror = () => {
      // onclose handles reconnect.
    };
  };

  connect();

  return {
    close() {
      disposed = true;
      ws?.close();
      ws = null;
    }
  };
}
