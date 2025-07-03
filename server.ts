import WebSocket, { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';

const wss = new WebSocketServer({ port: 8080, maxPayload: 10 * 1024 * 1024 }); // 最大ペイロードサイズを10MBに設定

type ClientMap = Map<string, WebSocket>;
interface Controller {
  id: string;
  socket: WebSocket | null;
};

/** クライアント or コントローラーとの通信用フォーマット */
interface ClientDTO {
    type: 'count' | 'message' | 'image' | 'role';
    body: string;
}

/** 接続済のクライアントを保持 */
const clients: ClientMap = new Map(); // 接続済のクライアントを保持
let controller: Controller = { // 接続済のコントローラーの情報を保持
  id: '',
  socket: null as WebSocket | null
};

let connectionCount = 0; // コントローラー + クライアントの接続数をカウント
let loopCount = 0; // ループ数をカウント

const sleep = (time: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, time));

const broadcastClientCount = (): void => {
  const message = JSON.stringify({ type: 'count', message: connectionCount });

  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

const broadcastClientStartStopEnd = (message: string): void => {
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

const unicastController = (ws: WebSocket, message: string): void => {
  console.log(`クライアント(${ws})にメッセージを送信: ${message}`);
  ws.send(message);
}

const unicastBufferToController = (ws: WebSocket, buf: Buffer): void => {
  console.log(`クライアント(${ws})にバッファを送信: ${buf}`);
  ws.send(buf);
}

// ランダムに1要素選ぶ関数
const getRandomKey = <K, V>(map: Map<K, V>): K | undefined => {
  const keys = Array.from(map.keys());
  if (keys.length === 0) return undefined;
  const randomIndex = Math.floor(Math.random() * keys.length);
  return keys[randomIndex];
}

const removeClientBySocket = (socket: WebSocket): void => {
  if (controller.socket === socket) {
    console.log(`🗑 コントローラーが切断されました: ${controller.id}`);
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
      return; // 見つけたらループ終了
    }
  }
  // 接続されていない場合は新規登録
  const clientId = uuidv4();
  clients.set(clientId, socket);
  connectionCount = clients.size + (controller.id ? 1 : 0); // コントローラーがいる場合は1を追加

  console.log(`✅ 新しいクライアントに接続しました: ${clientId} | 現在の接続数: ${connectionCount}`);
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
    loopCount++;
    console.log(`接続されたclientの数: ${clients.size}`);
    console.log(`🎯 選ばれたキー: ${selectedKey}`);
    console.log(`ループ数：${loopCount}`);

    // 動作確認のためにコントローラーにメッセージを送信
    if (controller.socket) {
      console.log(`コントローラーに撮影開始を伝達`);
      unicastController(controller.socket, JSON.stringify({type: 'message', body: `撮影${loopCount}回目`}));
    } else {
      console.error('コントローラーが接続されていません。撮影指示を送信できません。');
      return;
    }

    // Mapをループし、選ばれた要素とそれ以外で処理を分ける
    clients.forEach((value, key) => {
      if (key === selectedKey) {
        console.log(`✅ ランダムで選ばれた1台に撮影指示: ${key} = ${value}`);
        unicastController(value, JSON.stringify({type: 'message', body: 'capture'}));
      } else {
        console.log(`🔸 選ばれなかった台はストップ: ${key} = ${value}`);
        unicastController(value, JSON.stringify({type: 'message', body: 'stop'}));
      }
    });
  }
}

wss.on('connection', (ws: WebSocket) => {
  addClientBySocket(ws); // ソケットを追加

  // コントローラーにクライアント接続数を送信
  if(controller.socket) {
    unicastController(controller.socket, JSON.stringify({type: 'count', body: connectionCount.toString()}));
  }
  ws.on('message', async (response: WebSocket.RawData) => {
    const parsedResponse = JSON.parse(response.toString()) as ClientDTO;
    console.log(`受信(生データ): ${response}`);
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
          // Playerから受信したデータをbufferに変換してControllerに送信
          const buf = Buffer.from(response.toString());
          unicastBufferToController(controller.socket, buf);
        } else {
          console.error('コントローラーが接続されていません。画像を送信できません。');
          break;
        }
        if (loopCount >= 6) {
          console.log('6回ループしたので、終了メッセージを送信します');
          broadcastClientStartStopEnd('end');
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
          loopCount = 0;
          await controlClients();
        }

        console.log(`ループカウント: ${loopCount}`);
        break;
      default:
        console.log('想定外のケースです');
    }
  });

  ws.on('close', () => {
    removeClientBySocket(ws);
    connectionCount = clients.size + (controller.socket ? 1 : 0); // コントローラーがいる場合は1を追加
    console.log(`切断。現在の接続数: ${connectionCount}`);
    broadcastClientCount();
  });
});