# Sovereign Council API — Timeout & Connection Guide

**Base URL:** `https://api.fisheye.news`

---

## The Core Challenge

A full 12-perspective deliberation takes **60–120 seconds**. Most HTTP clients, proxies, and frameworks have default timeouts of 30 seconds or less.

---

## Option A: Use the Streaming Endpoint (Recommended)

**`POST https://api.fisheye.news/deliberate/stream`**

This is the SSE (Server-Sent Events) endpoint. It sends data continuously — keepalive pings every 8 seconds, plus each perspective as it completes. Because data flows throughout the entire request, **no timeout will trigger** as long as the client reads the stream.

### Key Implementation Details

| Concern | Solution |
|---------|----------|
| Client HTTP timeout | Set to **180 seconds** minimum, or disable entirely since data streams continuously |
| Connection type | Must accept `text/event-stream` — do NOT buffer the full response before processing |
| Keepalive pings | The server sends `event: ping` every 8 seconds to prevent idle timeouts |
| Proxy/load balancer timeouts | If behind Cloudflare, nginx, etc., set proxy read timeout to 180s+ |
| Content-Type header | Send `Content-Type: application/json` with the POST body |

### Request Body

```json
{
  "query": "The full article text to analyze",
  "context": "Optional additional context",
  "model": "optional-model-override",
  "lensId": "default-12"
}
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `query` | Yes | The article text or question to analyze |
| `context` | No | Additional context to include with each perspective prompt |
| `model` | No | Override the default model (otherwise uses per-wave defaults) |
| `lensId` | No | Lens configuration ID (default: `"default-12"`) |

### SSE Event Types

| Event | Description | Data Fields |
|-------|-------------|-------------|
| `status` | Phase updates | `message`, `phase` ("submitting", "deliberating", "synthesizing") |
| `perspective` | Individual perspective result | `perspectiveId`, `perspectiveName`, `content`, `model`, `wave` (1 or 2), `responseTime`, `status` |
| `synthesis` | Final synthesis | `content`, `model`, `responseTime` |
| `complete` | Deliberation finished | `synthesis`, `totalTime`, `perspectiveCount`, `sessionId` |
| `ping` | Keepalive (every 8s) | `elapsed` |
| `error` | Error occurred | `message`, `detail` |

### Python Example

```python
import requests
import json

response = requests.post(
    "https://api.fisheye.news/deliberate/stream",
    json={"query": "Your article text here"},
    stream=True,  # CRITICAL: must stream
    timeout=180
)

for line in response.iter_lines(decode_unicode=True):
    if not line:
        continue
    if line.startswith("event: "):
        event_type = line[7:]
    elif line.startswith("data: "):
        data = json.loads(line[6:])
        if event_type == "perspective":
            print(f"✓ {data['perspectiveName']}: {data['content'][:100]}...")
        elif event_type == "synthesis":
            print(f"SYNTHESIS: {data['content'][:200]}...")
        elif event_type == "complete":
            print(f"Done in {data['totalTime']}s")
```

### JavaScript / Node.js Example

```javascript
const response = await fetch("https://api.fisheye.news/deliberate/stream", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query: "Your article text here" })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });

  const lines = buffer.split("\n");
  buffer = lines.pop(); // keep incomplete line

  let eventType = "";
  for (const line of lines) {
    if (line.startsWith("event: ")) eventType = line.slice(7);
    else if (line.startsWith("data: ")) {
      const data = JSON.parse(line.slice(6));
      console.log(eventType, data);
    }
  }
}
```

---

## Option B: Use the Batch Endpoint

**`POST https://api.fisheye.news/deliberate`**

This waits for ALL 12 perspectives + synthesis before returning a single JSON response. **This is where timeouts are dangerous.**

| Setting | Required Value |
|---------|---------------|
| HTTP client timeout | **180 seconds** minimum |
| Reverse proxy timeout (nginx `proxy_read_timeout`) | **180s** |
| Cloudflare (if applicable) | Enterprise plan needed for >100s timeouts |
| AWS ALB idle timeout | Set to **180s** |
| Vercel/Netlify serverless | Will NOT work (10-30s function limits) |

---

## Health Check

**`GET https://api.fisheye.news/health`**

Returns server status, model configuration, and client pool info. Use this to verify the server is online before submitting a deliberation.

```bash
curl https://api.fisheye.news/health
```

---

## The 12 Perspectives (default-12 lens)

| Wave | Seat | ID |
|------|------|----|
| 1 | The Strategist | `strategist` |
| 1 | The Ethicist | `ethicist` |
| 1 | The Engineer | `engineer` |
| 1 | The Artist | `artist` |
| 1 | The Historian | `historian` |
| 1 | The Skeptic | `skeptic` |
| 2 | The Mystic | `mystic` |
| 2 | The Economist | `economist` |
| 2 | The Psychologist | `psychologist` |
| 2 | The Futurist | `futurist` |
| 2 | The Guardian | `guardian` |
| 2 | The Sovereign | `sovereign` |

---

## Common Pitfalls

1. **Buffering the SSE stream** — frameworks like Axios buffer by default. Must use `stream=True` (Python requests) or `responseType: 'stream'` (Axios).

2. **Intermediate proxies** — if your app sits behind nginx, Cloudflare, or a load balancer, those have their own timeouts that must be raised independently.

3. **Serverless functions** — AWS Lambda (15min max), Vercel (10-30s), Netlify (10s). The batch endpoint won't work on most serverless platforms. Use the streaming endpoint and process on the client side instead.

4. **Browser fetch** — works fine with the streaming endpoint since browsers handle SSE natively. No special timeout config needed.

---

## Bottom Line

Use `/deliberate/stream` and read the SSE events as they arrive. The 8-second keepalive pings guarantee no proxy or client will time out.

---

**CORS:** Enabled for all origins. These endpoints can be called from any browser or server.
