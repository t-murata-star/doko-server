//モジュール参照
const fs = require('fs');
const bodyParser = require('body-parser');
const jsonServer = require('json-server');
const jwt = require('jsonwebtoken');
const morgan = require('morgan');
const path = require('path');
const rfs = require('rotating-file-stream');

//ログの保存場所
const logDirectory = path.join(__dirname, './log');
//指定したディレクトリが存在しなければ作成
fs.existsSync(logDirectory) || fs.mkdirSync(logDirectory);
//ファイルストリームを作成
var accessLogStream = rfs('access.log', {
  size: '10MB',
  interval: '1M',
  compress: 'gzip',
  path: logDirectory
});

//JSON Serverで、利用するJSONファイルを設定
const server = jsonServer.create();
const router = jsonServer.router('./DB.json');
const middlewares = jsonServer.defaults({ logger: false });

//JSONリクエスト対応
server.use(bodyParser.urlencoded({ extended: true }));
server.use(bodyParser.json());

//expressミドルウェアを設定
server.use(middlewares);

var customToken =
  '":date[iso]",:custom_token,":remote-addr",":remote-user",":method",":url","HTTP/:http-version",":status",":referrer",":user-agent"';

morgan.token('custom_token', (req, res) => {
  const return_log = `${req.body['id'] || '"-"'},"${req.body['name'] || '-'}","${req.body['status'] || '-'}"`;
  return return_log;
});

server.use(
  morgan(customToken, {
    stream: accessLogStream
  })
);

//署名作成ワードと有効期限(24時間)
const SECRET_WORD = '4U!ZgF/a';
const expiresIn = '24h';

//署名作成関数
const createToken = payload => jwt.sign(payload, SECRET_WORD, { expiresIn });

//署名検証関数（非同期）
const verifyToken = token =>
  new Promise((resolve, reject) =>
    jwt.verify(token, SECRET_WORD, (err, decode) => (decode !== undefined ? resolve(decode) : reject(err)))
  );

//ユーザDBファイル読み込み
const userdb = JSON.parse(fs.readFileSync('./users.json', 'UTF-8'));

//ログイン関数 true:ok false:ng
const isAuth = ({ username, password }) =>
  userdb.users.findIndex(user => user.username === username && user.password === password) !== -1;

//ログインRouter
server.post('/auth/login', (req, res) => {
  const { username, password } = req.body;

  //ログイン検証
  if (isAuth({ username, password }) === false) {
    const status = 401;
    const message = 'Error in authorization';
    res.status(status).json({ status, message });
    return;
  }

  //ログイン成功時に認証トークンを発行
  const token = createToken({ username, password });
  res.status(200).json({ token });
});

//認証が必要なRouter(ログイン以外全て)
server.use(/^(?!\/auth).*$/, async (req, res, next) => {
  //認証ヘッダー形式検証
  if (req.headers.authorization === undefined || req.headers.authorization.split(' ')[0] !== 'Bearer') {
    const status = 401;
    const message = 'Error in authorization';
    res.status(status).json({ status, message });
    return;
  }

  //認証トークンの検証
  try {
    await verifyToken(req.headers.authorization.split(' ')[1]);
  } catch (err) {
    //失効している認証トークン
    const status = 401;
    const message = 'Error in authorization';
    res.status(status).json({ status, message });
  }

  if (req.baseUrl.includes('/userList')) {
    if (['POST', 'PUT'].includes(req.method)) {
      req.body['updated_at'] = formatDate(new Date());
    } else if (req.method === 'PATCH') {
      if (req.body.hasOwnProperty('heartbeat') === true) {
        req.body['heartbeat'] = formatDate(new Date());
      } else if (req.body.hasOwnProperty('order') === false) {
        req.body['updated_at'] = formatDate(new Date());
      }
    }
  }

  next();
});

//認証機能付きのREST APIサーバ起動
server.use(router);
server.listen(3001, () => {
  console.log('Run Auth API Server');
});

formatDate = date => {
  format = 'YYYY-MM-DD hh:mm:ss.SSS';
  format = format.replace(/YYYY/g, date.getFullYear());
  format = format.replace(/MM/g, ('0' + (date.getMonth() + 1)).slice(-2));
  format = format.replace(/DD/g, ('0' + date.getDate()).slice(-2));
  format = format.replace(/hh/g, ('0' + date.getHours()).slice(-2));
  format = format.replace(/mm/g, ('0' + date.getMinutes()).slice(-2));
  format = format.replace(/ss/g, ('0' + date.getSeconds()).slice(-2));
  const milliSeconds = ('00' + date.getMilliseconds()).slice(-3);
  const length = format.match(/S/g).length;
  for (let i = 0; i < length; i++) format = format.replace(/S/, milliSeconds.substring(i, i + 1));
  return format;
};
