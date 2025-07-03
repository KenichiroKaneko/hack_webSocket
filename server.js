const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const wss = new WebSocket.Server({ port: 8080 });
const clients = new Map();
const sleep = (time) => new Promise((resolve) => setTimeout(resolve, time));

let clientCount = 0;

const emojiArray = ["笑顔", "悲しい", "怒り", "驚き", "愛", "感謝", "興奮", "疲れ", "安心", "不安"];

wss.on('connection', function connection(ws) {
  const clientId = uuidv4();
  clients.set(clientId, ws);
  clientCount = clients.size;
  console.log(`✅ 接続: ${clientId} | 現在の接続数: ${clients.size}`);
  console.log(`クライアント情報: ${clients[0]}`);

  // 接続数を全クライアントに送信
  broadcastClientCount();

  ws.on("message", (message) => {
    console.log(`Received message => ${message}`);
    // すべてのクライアントにメッセージをブロードキャスト
    if (message.toString().trim() == 'connected') {
      console.log(`文字列メッセージ: ${message}`);
      console.log(`新しい接続。現在の接続数: ${clientCount}`);
    }
    broadcastClientMessage(message);
    // if (message.toString().trim() === "接続しました") {
    //   broadcastClientMessage(message);
    //   // clients.forEach((client) => {
    //   //   if (client.readyState === WebSocket.OPEN) {
    //   //     client.send(`\nClient said: ${message}`);
    //   //   }
    //   // });
    // } else {
    //   console.log(`受信失敗 ${message}`);
    // }
  });

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

async function broadcastClientMessage(text) {
  console.log(`メッセージを受信 sleep前: ${text}`);
  const startMessage = JSON.stringify({ type: 'message', message: "顔文字: "+ emojiArray[Math.floor(Math.random() * emojiArray.length)]});
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(startMessage);
    }
  });
  await sleep(5000);
  console.log(`メッセージを受信 sleep後: ${text}`);
  const endMessage = JSON.stringify({ type: 'message', message: "ストップ"});
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(endMessage);
    }
  });
}
