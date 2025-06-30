const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

let clientCount = 0;

wss.on('connection', function connection(ws) {
  clientCount++;
  console.log(`新しい接続。現在の接続数: ${clientCount}`);

  // 接続数を全クライアントに送信
  broadcastClientCount();

  ws.on('close', () => {
    clientCount--;
    console.log(`切断。現在の接続数: ${clientCount}`);
    broadcastClientCount();
  });
});

function broadcastClientCount() {
  const message = JSON.stringify({ type: 'count', count: clientCount });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}
