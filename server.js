const express = require("express");
const socketio = require("socket.io");
const https = require('https');
const crypto = require('crypto');
const NodeCache = require("node-cache");
const TradingEngine = require('./trading-engine');

const app = express();
const server = app.listen(3000);
const io = socketio(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 初始化交易引擎
const tradingEngine = new TradingEngine({
  symbol: 'BTC-USDT',
  strategy: 'sma_crossover',
  riskPercent: 2
});

// 配置缓存
const cache = new NodeCache({ stdTTL: 5, checkperiod: 1 });

// API配置 - 从环境变量获取
const API_KEY = process.env.OKX_API_KEY || '';
const SECRET_KEY = process.env.OKX_SECRET_KEY || '';
const PASSPHRASE = process.env.OKX_PASSPHRASE || '';
const USE_AUTH = !!API_KEY;

// 创建优化的HTTP Agent
const httpsAgent = new https.Agent({
  keepAlive: true,
  timeout: 10000,
  maxSockets: 10,
});

// 签名函数
function signRequest(method, path, body = '') {
  const timestamp = new Date().toISOString();
  const message = timestamp + method + path + body;
  const signature = crypto.createHmac('sha256', SECRET_KEY)
                         .update(message)
                         .digest('base64');
  
  return {
    'OK-ACCESS-KEY': API_KEY,
    'OK-ACCESS-SIGN': signature,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': PASSPHRASE,
    'Content-Type': 'application/json'
  };
}

// 获取行情数据（带缓存和错误处理）
async function getTicker() {
  // 尝试从缓存获取
  const cached = cache.get("ticker");
  if (cached) {
    return cached;
  }
  
  return new Promise((resolve, reject) => {
    const path = '/api/v5/market/ticker?instId=BTC-USDT';
    const options = {
      hostname: 'aws.okx.com',
      path,
      method: 'GET',
      agent: httpsAgent,
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'NodeJS-Trading-App'
      }
    };

    // 添加认证头
    if (USE_AUTH) {
      Object.assign(options.headers, signRequest('GET', path));
    }

    const startTime = Date.now();
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => data += chunk);
      
      res.on('end', () => {
        try {
          const latency = Date.now() - startTime;
          
          // 处理非JSON响应
          if (!res.headers['content-type'] || !res.headers['content-type'].includes('application/json')) {
            // 尝试解析错误代码
            const errorMatch = data.match(/error code: (\d+)/);
            if (errorMatch) {
              const errorCode = parseInt(errorMatch[1]);
              return reject({ 
                type: 'API_ERROR', 
                code: errorCode, 
                message: `API错误: ${data.trim()}` 
              });
            }
            return reject({ 
              type: 'INVALID_RESPONSE', 
              message: `无效响应: ${data.trim()}` 
            });
          }
          
          const json = JSON.parse(data);
          
          if (json.code && json.code !== '0') {
            return reject({ 
              type: 'API_ERROR', 
              code: parseInt(json.code), 
              message: `API错误: ${json.msg} (${json.code})` 
            });
          }
          
          if (json.data && json.data.length > 0) {
            const ticker = json.data[0];
            const result = {
              last: parseFloat(ticker.last),
              bid: parseFloat(ticker.bidPx),
              ask: parseFloat(ticker.askPx),
              high: parseFloat(ticker.high24h),
              low: parseFloat(ticker.low24h),
              volume: parseFloat(ticker.vol24h),
              open24h: parseFloat(ticker.open24h),
              change: parseFloat(ticker.last) - parseFloat(ticker.open24h),
              changePercent: ((parseFloat(ticker.last) - parseFloat(ticker.open24h)) / parseFloat(ticker.open24h)) * 100,
              latency: latency,
              timestamp: Date.now()
            };
            
            // 缓存结果
            cache.set("ticker", result);
            resolve(result);
          } else {
            reject({ 
              type: 'INVALID_DATA', 
              message: 'API返回数据格式错误' 
            });
          }
        } catch (e) {
          reject({ 
            type: 'PARSE_ERROR', 
            message: `解析响应失败: ${e.message}` 
          });
        }
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject({ 
        type: 'TIMEOUT', 
        message: '请求超时' 
      });
    });
    
    req.on('error', (err) => {
      reject({ 
        type: 'NETWORK_ERROR', 
        message: `网络错误: ${err.message}` 
      });
    });
    
    req.end();
  });
}

// 主监控循环
let equityHistory = [10000];
let lastTicker = null;
let lastUpdate = 0;
let requestsCount = 0;
let errorsCount = 0;

// 频率控制参数
let requestInterval = USE_AUTH ? 5000 : 10000; // 初始间隔
const MIN_INTERVAL = USE_AUTH ? 2000 : 5000;
const MAX_INTERVAL = 60000;
let consecutiveErrors = 0;
let lastErrorType = '';
let backoffUntil = 0;

// 发送数据到前端
async function sendDataToFrontend() {
  if (!lastTicker) return;
  
  // 更新交易引擎的价格数据
  if (tradingEngine.isRunning) {
    await tradingEngine.updatePriceData(lastTicker);
    
    // 计算交易信号
    const signal = tradingEngine.calculateSignal();
    
    // 如果置信度足够高，执行交易
    if (signal.confidence > 70 && signal.signal !== 'HOLD') {
      await tradingEngine.executeTrade(signal);
    }
  }
  
  // 获取真实账户信息
  let accountInfo = null;
  let positionInfo = null;
  
  if (USE_AUTH && tradingEngine.isRunning) {
    try {
      accountInfo = await tradingEngine.getAccountInfo();
      positionInfo = await tradingEngine.getPositions();
    } catch (error) {
      console.error('获取账户信息失败:', error.message);
    }
  }
  
  // 计算权益（使用真实数据或模拟数据）
  let currentEquity = 10000;
  let positionValue = 0;
  let availableMargin = 0;
  
  if (accountInfo) {
    currentEquity = accountInfo.total.USDT || 10000;
    availableMargin = accountInfo.free.USDT || 0;
    positionValue = positionInfo ? Math.abs(positionInfo.size * lastTicker.last) : 0;
  } else {
    // 模拟计算权益
    const currentReturn = Math.random() * 0.002 - 0.001;
    currentEquity = equityHistory[equityHistory.length - 1] * (1 + currentReturn);
    equityHistory.push(currentEquity);
    positionValue = (currentEquity * 0.7);
    availableMargin = (currentEquity * 0.3);
  }
  
  // 准备发送的数据
  const frontendData = {
    price: lastTicker.last,
    bidPrice: lastTicker.bid,
    askPrice: lastTicker.ask,
    change24h: lastTicker.changePercent.toFixed(2) + '%',
    volume24h: (lastTicker.volume).toFixed(2) + ' BTC',
    equity: currentEquity,
    todayProfit: (Math.random() * 500 - 250).toFixed(2),
    positionValue: positionValue.toFixed(2),
    availableMargin: availableMargin.toFixed(2),
    riskRatio: (Math.random() * 30 + 70).toFixed(2) + '%',
    latency: lastTicker.latency,
    timestamp: lastTicker.timestamp,
    requests: requestsCount,
    errors: errorsCount,
    authStatus: USE_AUTH ? "已认证" : "未认证",
    requestInterval: requestInterval,
    lastUpdate: new Date().toLocaleTimeString(),
    // 交易引擎状态
    tradingEngineStatus: tradingEngine.getStatus(),
    currentSignal: tradingEngine.isRunning ? tradingEngine.calculateSignal() : null
  };
  
  // 发送数据到前端
  io.emit("price_update", frontendData);
}

// 定时执行
async function fetchData() {
  try {
    const now = Date.now();
    
    // 检查是否在退避期
    if (now < backoffUntil) {
      const remaining = Math.ceil((backoffUntil - now) / 1000);
      console.log(`[${new Date().toISOString()}] 退避期等待: ${remaining}秒`);
      io.emit("network_status", { 
        status: "warning", 
        message: `退避期等待: ${remaining}秒` 
      });
      return;
    }
    
    // 执行请求
    lastTicker = await getTicker();
    lastUpdate = now;
    requestsCount++;
    consecutiveErrors = 0; // 重置错误计数
    
    console.log(`[${new Date().toISOString()}] 价格更新: ${lastTicker.last} | 延迟: ${lastTicker.latency}ms | 间隔: ${requestInterval}ms`);
    
    // 发送网络状态
    io.emit("network_status", { 
      status: "normal", 
      message: "连接正常"
    });
    
    // 发送数据
    await sendDataToFrontend();
    
    // 成功时逐渐降低间隔
    if (requestInterval > MIN_INTERVAL) {
      requestInterval = Math.max(MIN_INTERVAL, requestInterval - 1000);
    }
    
  } catch (err) {
    errorsCount++;
    consecutiveErrors++;
    
    // 根据错误类型处理
    let status = "error";
    let message = `获取行情失败: ${err.message}`;
    
    if (err.type === 'API_ERROR') {
      // 1016错误是频率限制
      if (err.code === 1016) {
        status = "warning";
        message = "请求过于频繁，降低频率";
        
        // 指数退避
        const backoffTime = Math.min(10000 * Math.pow(2, consecutiveErrors - 1), 300000);
        backoffUntil = Date.now() + backoffTime;
        requestInterval = Math.min(MAX_INTERVAL, requestInterval + 5000);
      }
      // 其他API错误
      else {
        status = "warning";
      }
    } 
    else if (err.type === 'TIMEOUT') {
      status = "warning";
      requestInterval = Math.min(MAX_INTERVAL, requestInterval + 3000);
    }
    
    console.error(`[${new Date().toISOString()}] ${message}`);
    lastErrorType = err.type;
    
    io.emit("network_status", { 
      status,
      message
    });
    
    // 使用缓存数据发送到前端
    if (lastTicker) {
      sendDataToFrontend();
    }
  }
}

// 设置定时器（动态间隔）
function scheduleNextFetch() {
  setTimeout(() => {
    fetchData().finally(() => {
      scheduleNextFetch();
    });
  }, requestInterval);
}

// 状态监控
setInterval(() => {
  if (lastTicker && Date.now() - lastTicker.timestamp > 15000) {
    io.emit("network_status", { 
      status: "warning", 
      message: "行情数据延迟超过15秒"
    });
  }
}, 5000);

// 提供前端文件
app.use(express.static("public"));

// 根路由重定向到前端
app.get("/", (req, res) => {
  res.redirect("/index.html");
});

// 添加健康检查端点
app.get("/health", (req, res) => {
  res.json({
    status: lastTicker ? "healthy" : "unhealthy",
    requests: requestsCount,
    errors: errorsCount,
    lastUpdate: lastUpdate ? new Date(lastUpdate).toISOString() : "never",
    authStatus: USE_AUTH ? "authenticated" : "unauthenticated",
    currentInterval: requestInterval,
    lastError: lastErrorType || "none",
    lastPrice: lastTicker ? lastTicker.last : null,
    tradingEngine: tradingEngine.getStatus()
  });
});

// 交易引擎控制端点
app.post("/api/trading/start", async (req, res) => {
  try {
    const success = await tradingEngine.start();
    res.json({ 
      success, 
      message: success ? "交易引擎启动成功" : "交易引擎启动失败",
      status: tradingEngine.getStatus()
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: `启动失败: ${error.message}` 
    });
  }
});

app.post("/api/trading/stop", (req, res) => {
  try {
    tradingEngine.stop();
    res.json({ 
      success: true, 
      message: "交易引擎已停止",
      status: tradingEngine.getStatus()
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: `停止失败: ${error.message}` 
    });
  }
});

app.get("/api/trading/status", (req, res) => {
  res.json({
    status: tradingEngine.getStatus(),
    indicators: tradingEngine.getIndicators(),
    tradeHistory: tradingEngine.getTradeHistory()
  });
});

app.get("/api/trading/signal", (req, res) => {
  if (!tradingEngine.isRunning) {
    return res.json({ signal: 'HOLD', reason: '交易引擎未运行' });
  }
  
  const signal = tradingEngine.calculateSignal();
  res.json(signal);
});

console.log("交易监控系统运行在: http://localhost:3000");
console.log(`使用${USE_AUTH ? "认证" : "非认证"}模式`);
console.log(`初始请求间隔: ${requestInterval}ms`);

// 启动数据获取循环
scheduleNextFetch();
