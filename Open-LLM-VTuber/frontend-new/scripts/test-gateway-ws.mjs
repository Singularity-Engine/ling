#!/usr/bin/env node
/**
 * Gateway WebSocket connection test script.
 * Usage: node scripts/test-gateway-ws.mjs [url]
 * Default URL: ws://localhost:18789
 */

const url = process.argv[2] || 'ws://localhost:18789';
const TOKEN = 'ed7c72944103e6fecc89140cb5e9661d04dc6699a09bdf05';

console.log(`Connecting to ${url} ...`);

const ws = new WebSocket(url);
let connected = false;

ws.addEventListener('open', () => {
  console.log('[open] WebSocket connection established, waiting for challenge...');
});

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  console.log('[recv]', JSON.stringify(msg, null, 2).slice(0, 500));

  // Handle challenge
  if (msg.type === 'event' && msg.event === 'connect.challenge') {
    const nonce = msg.payload?.nonce || '';
    console.log(`[challenge] nonce=${nonce}, sending connect...`);

    const connectMsg = {
      type: 'req',
      id: crypto.randomUUID(),
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'cli',
          displayName: 'Gateway Test Script',
          version: '1.0.0',
          platform: 'node',
          mode: 'webchat',
          instanceId: crypto.randomUUID(),
        },
        caps: [],
        commands: [],
        permissions: {},
        auth: { token: TOKEN },
        role: 'operator',
        scopes: ['operator.admin'],
      },
    };
    ws.send(JSON.stringify(connectMsg));
    return;
  }

  // Handle hello-ok
  if (msg.type === 'res' && msg.ok === true && msg.payload?.type === 'hello-ok') {
    connected = true;
    console.log('\n=== Gateway connected successfully! ===');
    console.log(`Protocol: ${msg.payload.protocol}`);
    console.log(`Server: ${JSON.stringify(msg.payload.server)}`);
    console.log(`Tick interval: ${msg.payload.policy?.tickIntervalMs}ms`);
    console.log(`Methods: ${msg.payload.features?.methods?.join(', ') || 'N/A'}`);
    console.log(`Events: ${msg.payload.features?.events?.join(', ') || 'N/A'}`);
    console.log('\nSending test chat message...');

    // Try sending a chat message
    const chatMsg = {
      type: 'req',
      id: crypto.randomUUID(),
      method: 'chat.send',
      params: {
        sessionKey: 'test-session',
        message: '你好，这是连接测试',
        idempotencyKey: crypto.randomUUID(),
      },
    };
    ws.send(JSON.stringify(chatMsg));
    return;
  }

  // Handle agent events (streaming response)
  if (msg.type === 'event' && msg.event === 'agent.event') {
    const { stream, data, seq } = msg.payload || {};
    if (stream === 'assistant') {
      process.stdout.write(data?.text || '');
    } else if (stream === 'tool') {
      console.log(`\n[tool] ${data?.phase}: ${data?.name} (${data?.toolCallId})`);
    } else if (stream === 'lifecycle') {
      console.log(`\n[lifecycle] ${data?.phase}`);
      if (data?.phase === 'end') {
        console.log('\n\n=== Test complete! Gateway connection works. ===');
        ws.close();
        process.exit(0);
      }
    }
    return;
  }

  // Handle tick
  if (msg.type === 'event' && msg.event === 'tick') {
    console.log('[tick] heartbeat received');
    return;
  }

  // Handle errors
  if (msg.type === 'res' && msg.ok === false) {
    console.error('[error]', msg.error);
  }
});

ws.addEventListener('error', (event) => {
  console.error('[error] WebSocket error:', event.message || 'connection failed');
});

ws.addEventListener('close', (event) => {
  console.log(`[close] code=${event.code} reason=${event.reason}`);
  if (!connected) {
    console.log('\nFailed to connect. Is the Gateway running on', url, '?');
  }
  process.exit(connected ? 0 : 1);
});

// Timeout after 30s
setTimeout(() => {
  if (!connected) {
    console.log('\n[timeout] No response after 30s. Closing.');
    ws.close();
    process.exit(1);
  }
}, 30000);
