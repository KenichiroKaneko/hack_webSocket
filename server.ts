import WebSocket, { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';

const wss = new WebSocketServer({ port: 8080, maxPayload: 10 * 1024 * 1024 }); // 最大ペイロードサイズを10MBに設定

type ClientMap = Map<string, WebSocket>;
const clients: ClientMap = new Map();
let controller = {
  id: '',
  socket: null as WebSocket | null
};

let clientCount = 0;
let loopCount = 0;
interface ClientDTO {
    type: 'count' | 'message' | 'image' | 'role';
    body: string;
}

const sleep = (time: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, time));

const emojiArray: string[] = [
  "笑顔", "悲しい", "怒り", "驚き", "愛",
  "感謝", "興奮", "疲れ", "安心", "不安"
];

wss.on('connection', (ws: WebSocket) => {
  // const clientId = uuidv4();
  // clients.set(clientId, ws);
  addClientBySocket(ws); // ソケットを追加
  // clientCount = clients.size + (controller.id ? 1 : 0); // コントローラーがいる場合は1を追加

  // console.log(`✅ 接続: ${clientId} | 現在の接続数: ${clientCount}`);
  // console.log(`クライアント情報: ${clientId}`);

  // コントローラーにクライアント接続数を送信
  if(controller.socket) {
    unicastController(controller.socket, JSON.stringify({type: 'count', body: clientCount.toString()}));
  }
  ws.on('message', async (response: WebSocket.RawData) => {
    const parsedResponse = JSON.parse(response.toString()) as ClientDTO;
    console.log(`受信(生データ): ${response}`);
    console.log(`受信(パース済): ${parsedResponse}`);
    console.log(`受信(ボディ): ${parsedResponse.body}`);
    console.log(`受信(タイプ): ${parsedResponse.type}`);
    switch (parsedResponse.type) {
      case 'role':
        console.log('ロールを確認');
        if (parsedResponse.body === 'Controller') {
          removeClientBySocket(ws); // コントローラーをクライアントリストから削除
          if (!controller.socket) {
            controller.id = uuidv4();
            controller.socket = ws; // コントローラーのソケットを保存
            console.log(`コントローラーが設定されました: ${controller.id}`);
          } else {
            console.error('既にコントローラーが設定されています。');
            // ws.send(JSON.stringify({ type: 'error', body: 'コントローラーは一つだけです。' }));
          }
        } else {}
        break;
      case 'image':
        console.log('画像データを取得&送信');
        console.log(`controllerID: ${controller.id}`);
        // 画像と絵文字を取得してそのままcontrollerに送信
        if(controller.socket) {
          const testResponse: ClientDTO = {
            type: 'image',
            body: '' // JSON.stringify({ picture: '', emoji: '' }) // 画像データをそのまま送信
          }
          // console.log('受信データのbodyを確認: ', JSON.parse(response.toString()).body.image);
          // const imageBuffer = Buffer.from(JSON.parse(response.toString()).body.picture, 'base64'); // 受信した画像データをバッファに変換
          // const emoji = JSON.parse(response.toString()).body.emoji;
          // JSON.parse(response.toString()).type
          // testResponse.body = JSON.stringify({ picture: imageBuffer, emoji });
          // unicastController(controller.socket, response.toString());
          const buf = Buffer.from(response.toString());
          console.log('バッファのサイズ:', Buffer.byteLength(response.toString(), 'utf-8'));
          unicastBufferToController(controller.socket, Buffer.from(response.toString()));
          // unicastController(controller.socket, testResponse.toString());
        } else {
          console.error('コントローラーが接続されていません。画像を送信できません。');
          break;
        }
        loopCount++;
        if (loopCount >= 5) {
          console.log('5回ループしたので、終了メッセージを送信します');
          broadcastClientStartStopEnd('end');
          loopCount = 0; // ループカウントをリセット
        } else {
          console.log(`クライアントにメッセージ送信ループカウント: ${loopCount}`);
          await sleep(3000); // 3秒待機
          await controlClients();
        }
        break;
      case 'count':
        // クライアント数をカウント（サーバ側は受信しない）
        console.log('クライアント数をカウント(サーバサイドは何もしない)');
        break;
      case 'message':
        // controller側からのメッセージを受信(start) or playerにメッセージ送信（start or stop）
        console.log('controller側からのメッセージを受信: ', parsedResponse);
        if (parsedResponse.body === 'setup') {
          await controlClients();
        }

        loopCount++;
        break;
      default:
        console.log('想定外のケースです');
    }
  });

  ws.on('close', () => {
    removeClientBySocket(ws);
    clientCount = clients.size + (controller.socket ? 1 : 0); // コントローラーがいる場合は1を追加
    console.log(`切断。現在の接続数: ${clientCount}`);
    broadcastClientCount();
  });
});

function broadcastClientCount(): void {
  const message = JSON.stringify({ type: 'count', message: clientCount });

  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastClientStartStopEnd(message: string): void {
  const startEndMessage: ClientDTO = {
    type: 'message',
    body: message
  };
  console.log(`クライアントにメッセージを送信: ${JSON.stringify(startEndMessage)}`);
  console.log(`クライアントリスト: ${wss.clients.size}`);
  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(startEndMessage));
    }
  });
}

function unicastController(ws: WebSocket, message: string): void {
  console.log(`クライアント(${ws})にメッセージを送信: ${message}`);
  ws.send(message);
}

function unicastBufferToController(ws: WebSocket, buf: Buffer): void {
  console.log(`クライアント(${ws})にメッセージを送信: ${buf}`);
  ws.send(buf);
}

async function broadcastClientMessage(text: string): Promise<void> {
  console.log(`メッセージを受信 sleep前: ${text}`);

  const startMessage = JSON.stringify({
    type: 'message',
    message: `顔文字: ${emojiArray[Math.floor(Math.random() * emojiArray.length)]}`
  });

  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(startMessage);
    }
  });

  await sleep(5000);

  console.log(`メッセージを受信 sleep後: ${text}`);

  const endMessage = JSON.stringify({
    type: 'message',
    body: "stop"
  });

  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(endMessage);
    }
  });
}

// ランダムに1要素選ぶ関数
function getRandomKey<K, V>(map: Map<K, V>): K | undefined {
  const keys = Array.from(map.keys());
  if (keys.length === 0) return undefined;
  const randomIndex = Math.floor(Math.random() * keys.length);
  return keys[randomIndex];
}

const removeClientBySocket = (socket: WebSocket): void => {
  if (controller.socket === socket) {
    console.log(`コントローラーが切断されました: ${controller.id}`);
    controller.id = '';
    controller.socket = null;
    return; // コントローラーは特別扱い
  }
  for (const [key, value] of clients.entries()) {
    if (value === socket) {
      clients.delete(key);
      console.log(`🗑 クライアントが切断されました: ${key}`);
      break; // 見つけたらループ終了
    }
  }
}

const addClientBySocket = (socket: WebSocket): void => {
  if (controller.socket === socket) {
    console.log(`コントローラーは既に登録されています: ${controller.id}`);
    return; // コントローラーは特別扱い
  }
  for (const [key, value] of clients.entries()) {
    if (value === socket) {
      console.log(`接続済のクライアントです: ${key}`);
      break; // 見つけたらループ終了
    }
  }
  // 接続されていない場合は新規登録
  const clientId = uuidv4();
  clients.set(clientId, socket);
  clientCount = clients.size + (controller.id ? 1 : 0); // コントローラーがいる場合は1を追加

  console.log(`✅ クライアントに接続しました: ${clientId} | 現在の接続数: ${clientCount}`);
  console.log(`クライアント情報: ${clientId}`);
}

const controlClients = async(): Promise<void> => {
  console.log('開始をPlayerに伝達');
  console.log(`メッセージを受信 sleep前`);
  broadcastClientStartStopEnd('start');

  await sleep(5000);

  // ランダムなキーを取得
  const selectedKey = getRandomKey(clients);

  if (selectedKey === undefined) {
    console.log("Mapが空です");
  } else {
    console.log(`接続されたclientの数: ${clients.size}`);
    console.log(`🎯 選ばれたキー: ${selectedKey}`);

    // 動作確認のためにコントローラーにメッセージを送信
    if (controller.socket) {
      console.log(`コントローラーにメッセージを送信: 撮影指示テスト`);
      unicastController(controller.socket, JSON.stringify({type: 'message', body: '撮影指示テスト'}));
    } else {
      console.error('コントローラーが接続されていません。撮影指示を送信できません。');
      return;
    }
    // unicastController(controller.socket!, JSON.stringify({type: 'message', body: '撮影指示テスト'}));

    // Mapをループし、選ばれた要素とそれ以外で処理を分ける
    clients.forEach((value, key) => {
      if (key === selectedKey) {
        console.log(`✅ ランダムで選ばれた1台に撮影指示: ${key} = ${value}`);
        unicastController(value, JSON.stringify({type: 'message', body: 'capture'}));
      } else {
        console.log(`🔸 選ばれなかった台はストップ: ${key} = ${value}`);
        unicastController(value, JSON.stringify({type: 'message', body: 'stop'}));
        // unicastController(value, JSON.stringify({type: 'message', body: 'capture'}));
      }
    });
  }
}