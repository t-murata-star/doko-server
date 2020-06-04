//モジュール参照
const fs = require('fs');
const bodyParser = require('body-parser');
const jsonServer = require('json-server');
const jwt = require('jsonwebtoken');
const morgan = require('morgan');
const path = require('path');
const rfs = require('rotating-file-stream');
const moment = require('moment-timezone');

// 設定ファイル読み込み
const SETTINGS = JSON.parse(fs.readFileSync('./settings.json', 'UTF-8'));
//ログの保存場所
const LOG_DIRECTORY = path.join(__dirname, './logs');
//指定したディレクトリが存在しなければ作成
fs.existsSync(LOG_DIRECTORY) || fs.mkdirSync(LOG_DIRECTORY);
//ファイルストリームを作成
const ACCESS_LOG_STREAM = rfs('access.log', {
  size: '10MB',
  interval: '1M',
  compress: 'gzip',
  path: LOG_DIRECTORY,
});
const TIMEZONE = 'Asia/Tokyo';

const unauthorizedStatus = 401;

//JSON Serverで、利用するJSONファイルを設定
const server = jsonServer.create();
const router = jsonServer.router('./DB.json');
const middlewares = jsonServer.defaults({ logger: false });

//JSONリクエスト対応
server.use(bodyParser.urlencoded({ extended: true }));
server.use(bodyParser.json());

//expressミドルウェアを設定
server.use(middlewares);

const CUSTOM_TOKEN =
  ':custom_token,":remote-addr",":remote-user",":method",":url","HTTP/:http-version",":status",":referrer",":user-agent"';

morgan.token('custom_token', (req, res) => {
  const return_log = `${moment().tz(TIMEZONE).format()},${req.body['id'] || '"-"'},"${req.body['name'] || '-'}","${
    req.body['status'] || '-'
  }"`;
  return return_log;
});

server.use(
  morgan(CUSTOM_TOKEN, {
    stream: ACCESS_LOG_STREAM,
  })
);

//署名作成ワードと有効期限(24時間)
const SECRET_WORD = '4U!ZgF/a';
const expiresIn = '24h';

//署名作成関数
const createToken = (payload) => jwt.sign(payload, SECRET_WORD, { expiresIn });

//署名検証関数（非同期）
const verifyToken = (token) =>
  new Promise((resolve, reject) =>
    jwt.verify(token, SECRET_WORD, (err, decode) => (decode !== undefined ? resolve(decode) : reject(err)))
  );

//ログイン関数 true:ok false:ng
const isAuth = ({ username, password }) =>
  SETTINGS.users.findIndex((user) => user.username === username && user.password === password) !== -1;

const authenticate = async (req) => {
  //認証ヘッダー形式検証
  if (req.headers.authorization === undefined || req.headers.authorization.split(' ')[0] !== 'Bearer') {
    return false;
  }

  //認証トークンの検証
  try {
    await verifyToken(req.headers.authorization.split(' ')[1]);
  } catch (err) {
    //失効している認証トークン
    return false;
  }

  return true;
};

server.use(
  jsonServer.rewriter({
    '/healthCheck/:id': '/userList/:id',
    '/updateAppVersion/:id': '/userList/:id',
    '/changeOrder/:id': '/userList/:id',
  })
);

//ログインRouter
server.post('/auth/login', (req, res) => {
  const { username, password } = req.body;

  //ログイン検証
  if (isAuth({ username, password }) === false) {
    const message = 'Error in authorization';
    res.status(unauthorizedStatus).json({ status: unauthorizedStatus, message });
    return;
  }

  //ログイン成功時に認証トークンを発行
  const token = createToken({ username, password });
  res.status(200).json({ token });
});

//認証が必要なRouter(ログイン以外全て)
server.use(/^(?!\/auth).*$/, async (req, res, next) => {
  if ((await authenticate(req)) === false) {
    const message = 'Error in authorization';
    res.status(unauthorizedStatus).json({ status: unauthorizedStatus, message });
    return;
  }

  if (/^\/healthCheck\/([0-9][0-9]*)$/g.test(req.originalUrl)) {
    let nowDate;
    switch (req.method) {
      case 'PATCH':
        nowDate = formatDate(new Date());
        req.body['healthCheckAt'] = nowDate;
        break;
    }

    return next();
  }

  if (req.originalUrl === '/userList') {
    let nowDate;
    switch (req.method) {
      case 'POST':
        nowDate = formatDate(new Date());
        req.body['updatedAt'] = nowDate;
        req.body['healthCheckAt'] = nowDate;
        break;
    }

    return next();
  }

  if (/^\/userList\/([0-9][0-9]*)$/g.test(req.originalUrl)) {
    let nowDate;
    switch (req.method) {
      case 'PATCH':
        nowDate = formatDate(new Date());
        req.body['updatedAt'] = nowDate;
        break;
    }

    return next();
  }

  return next();
});

//認証機能付きのREST APIサーバ起動
server.use(router);
server.listen(3001, () => {
  console.log('Run Auth API Server');
});

formatDate = (date) => {
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
