const https = require('https');
const crypto = require('crypto');
const { SMA, RSI, MACD, BollingerBands } = require('technicalindicators');
const NodeCache = require("node-cache");

class TradingEngine {
    constructor(config = {}) {
        this.config = {
            symbol: 'BTC-USDT',
            strategy: 'sma_crossover',
            riskPercent: 2, // 每次交易风险2%
            maxPositions: 1,
            isSimulated: true, // 默认使用模拟盘
            simulatedBalance: 10000, // 模拟账户余额
            ...config
        };
        
        // API配置
        this.API_KEY = process.env.OKX_API_KEY || '';
        this.SECRET_KEY = process.env.OKX_SECRET_KEY || '';
        this.PASSPHRASE = process.env.OKX_PASSPHRASE || '';
        this.USE_AUTH = !!this.API_KEY;
        
        // 模拟盘配置
        this.simulatedAccount = {
            balance: this.config.simulatedBalance,
            positions: [],
            orders: [],
            trades: []
        };
        
        // 创建优化的HTTP Agent
        this.httpsAgent = new https.Agent({
            keepAlive: true,
            timeout: 10000,
            maxSockets: 10,
        });
        
        // 缓存
        this.cache = new NodeCache({ stdTTL: 300 });
        
        // 状态
        this.isRunning = false;
        this.currentPosition = null;
        this.trades = [];
        this.indicators = {};
        
        // 价格历史
        this.priceHistory = [];
        this.maxHistoryLength = 1000;
        
        // 交易统计
        this.stats = {
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
            totalProfit: 0,
            maxDrawdown: 0
        };
        
        // 止损止盈配置
        this.stopLossConfig = {
            enabled: true,
            percent: 2, // 2%止损
            trailing: false // 是否启用追踪止损
        };
        
        this.takeProfitConfig = {
            enabled: true,
            percent: 4, // 4%止盈
            trailing: false // 是否启用追踪止盈
        };
    }
    
    // 签名函数
    signRequest(method, path, body = '') {
        const timestamp = new Date().toISOString();
        const message = timestamp + method + path + body;
        const signature = crypto.createHmac('sha256', this.SECRET_KEY)
                               .update(message)
                               .digest('base64');
        
        return {
            'OK-ACCESS-KEY': this.API_KEY,
            'OK-ACCESS-SIGN': signature,
            'OK-ACCESS-TIMESTAMP': timestamp,
            'OK-ACCESS-PASSPHRASE': this.PASSPHRASE,
            'Content-Type': 'application/json'
        };
    }
    
    // 通用API请求函数
    async makeRequest(path, method = 'GET', body = '') {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'aws.okx.com',
                path,
                method,
                agent: this.httpsAgent,
                timeout: 10000,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'NodeJS-Trading-App'
                }
            };

            // 添加认证头
            if (this.USE_AUTH) {
                Object.assign(options.headers, this.signRequest(method, path, body));
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
                        
                        resolve({ data: json.data, latency });
                        
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
            
            if (body) {
                req.write(body);
            }
            
            req.end();
        });
    }
    
    // 获取K线数据
    async getKlineData(limit = 500) {
        try {
            const path = `/api/v5/market/candles?instId=${this.config.symbol}&bar=1m&limit=${limit}`;
            const result = await this.makeRequest(path);
            
            this.priceHistory = result.data.map(candle => ({
                timestamp: parseInt(candle[0]),
                open: parseFloat(candle[1]),
                high: parseFloat(candle[2]),
                low: parseFloat(candle[3]),
                close: parseFloat(candle[4]),
                volume: parseFloat(candle[5])
            }));
            
            console.log(`✅ K线数据加载完成: ${this.priceHistory.length} 条记录`);
            return this.priceHistory;
            
        } catch (error) {
            console.error('❌ 获取K线数据失败:', error.message);
            throw error;
        }
    }
    
    // 获取账户信息
    async getAccountInfo() {
        try {
            // 如果是模拟盘，返回模拟账户信息
            if (this.config.isSimulated) {
                const accountInfo = {
                    total: { USDT: this.simulatedAccount.balance },
                    free: { USDT: this.simulatedAccount.balance },
                    used: { USDT: 0 }
                };
                
                this.cache.set('accountInfo', accountInfo);
                return accountInfo;
            }
            
            const path = '/api/v5/account/balance';
            const result = await this.makeRequest(path);
            
            const accountInfo = {
                total: {},
                free: {},
                used: {}
            };
            
            if (result.data && result.data.length > 0) {
                result.data.forEach(account => {
                    account.details.forEach(detail => {
                        const currency = detail.ccy;
                        accountInfo.total[currency] = parseFloat(detail.cashBal);
                        accountInfo.free[currency] = parseFloat(detail.availBal);
                        accountInfo.used[currency] = parseFloat(detail.frozenBal);
                    });
                });
            }
            
            this.cache.set('accountInfo', accountInfo);
            return accountInfo;
            
        } catch (error) {
            console.error('❌ 获取账户信息失败:', error.message);
            throw error;
        }
    }
    
    // 下单
    async placeOrder(side, size, orderType = 'market', stopLossPrice = null, takeProfitPrice = null) {
        try {
            // 如果是模拟盘，直接返回模拟订单
            if (this.config.isSimulated) {
                const currentPrice = this.priceHistory[this.priceHistory.length - 1].close;
                const simulatedOrder = {
                    ordId: `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    side: side,
                    sz: size.toString(),
                    instId: this.config.symbol,
                    ordType: orderType,
                    state: 'filled',
                    fillPx: currentPrice.toString(),
                    fillSz: size.toString(),
                    timestamp: Date.now()
                };
                
                // 如果是买入订单，设置止损止盈价格
                if (side === 'buy' && (stopLossPrice || takeProfitPrice)) {
                    simulatedOrder.stopLossPrice = stopLossPrice;
                    simulatedOrder.takeProfitPrice = takeProfitPrice;
                }
                
                this.simulatedAccount.orders.push(simulatedOrder);
                return simulatedOrder;
            }
            
            // 实盘下单
            const orderData = {
                instId: this.config.symbol,
                tdMode: 'cash',
                side: side,
                ordType: orderType,
                sz: size.toString()
            };
            
            // 添加止损止盈参数（仅对买入订单）
            if (side === 'buy' && (stopLossPrice || takeProfitPrice)) {
                if (stopLossPrice) {
                    orderData.slPx = stopLossPrice.toString(); // 止损价格
                    orderData.slOrdPx = stopLossPrice.toString(); // 止损委托价格
                }
                if (takeProfitPrice) {
                    orderData.tpPx = takeProfitPrice.toString(); // 止盈价格
                    orderData.tpOrdPx = takeProfitPrice.toString(); // 止盈委托价格
                }
            }
            
            const body = JSON.stringify(orderData);
            const path = '/api/v5/trade/order';
            const result = await this.makeRequest(path, 'POST', body);
            
            if (result.data && result.data.length > 0) {
                return result.data[0];
            }
            
            return null;
            
        } catch (error) {
            console.error('❌ 下单失败:', error.message);
            return null;
        }
    }
    
    // 获取持仓信息
    async getPositions() {
        try {
            // 如果是模拟盘，返回模拟持仓
            if (this.config.isSimulated) {
                if (this.simulatedAccount.positions.length === 0) {
                    return null;
                }
                
                const position = this.simulatedAccount.positions[0];
                return {
                    symbol: position.symbol,
                    size: position.size,
                    avgPrice: position.avgPrice,
                    timestamp: position.timestamp
                };
            }
            
            const path = `/api/v5/account/positions?instId=${this.config.symbol}`;
            const result = await this.makeRequest(path);
            
            if (result.data && result.data.length > 0) {
                const position = result.data[0];
                return {
                    symbol: position.instId,
                    size: parseFloat(position.pos),
                    avgPrice: parseFloat(position.avgPx),
                    timestamp: Date.now()
                };
            }
            
            return null;
            
        } catch (error) {
            console.error('❌ 获取持仓信息失败:', error.message);
            return null;
        }
    }
    
    // 计算技术指标
    calculateIndicators() {
        try {
            if (this.priceHistory.length < 50) {
                console.log('⚠️ 价格数据不足，无法计算指标');
                return;
            }
            
            const closes = this.priceHistory.map(p => p.close);
            const highs = this.priceHistory.map(p => p.high);
            const lows = this.priceHistory.map(p => p.low);
            const volumes = this.priceHistory.map(p => p.volume);
            
            // SMA指标
            this.indicators.sma20 = SMA.calculate({ period: 20, values: closes });
            this.indicators.sma50 = SMA.calculate({ period: 50, values: closes });
            
            // RSI指标
            this.indicators.rsi = RSI.calculate({ period: 14, values: closes });
            
            // MACD指标
            this.indicators.macd = MACD.calculate({
                fastPeriod: 12,
                slowPeriod: 26,
                signalPeriod: 9,
                values: closes
            });
            
            // 布林带
            this.indicators.bollinger = BollingerBands.calculate({
                period: 20,
                values: closes,
                stdDev: 2
            });
            
            console.log('📊 技术指标计算完成');
            
        } catch (error) {
            console.error('❌ 计算技术指标失败:', error.message);
        }
    }
    
    // 更新价格数据
    async updatePriceData(ticker) {
        try {
            const priceData = {
                timestamp: ticker.timestamp,
                open: ticker.last,
                high: ticker.high,
                low: ticker.low,
                close: ticker.last,
                volume: ticker.volume
            };
            
            this.priceHistory.push(priceData);
            
            // 保持历史数据长度
            if (this.priceHistory.length > this.maxHistoryLength) {
                this.priceHistory.shift();
            }
            
            // 更新指标
            this.calculateIndicators();
            
            // 检查止损止盈
            const stopSignal = this.checkStopLossAndTakeProfit(ticker.last);
            if (stopSignal) {
                await this.executeTrade({
                    signal: 'SELL',
                    reason: stopSignal.reason,
                    confidence: 100
                });
            }
            
        } catch (error) {
            console.error('❌ 更新价格数据失败:', error.message);
        }
    }
    
    // 计算交易信号
    calculateSignal() {
        try {
            if (!this.indicators.sma20 || !this.indicators.sma50) {
                return { signal: 'HOLD', reason: '指标数据不足', confidence: 0 };
            }
            
            const sma20 = this.indicators.sma20[this.indicators.sma20.length - 1];
            const sma50 = this.indicators.sma50[this.indicators.sma50.length - 1];
            const prevSma20 = this.indicators.sma20[this.indicators.sma20.length - 2];
            const prevSma50 = this.indicators.sma50[this.indicators.sma50.length - 2];
            
            // 计算趋势强度
            const trendStrength = Math.abs(sma20 - sma50) / sma50 * 100;
            const confidence = Math.min(trendStrength * 2, 100);
            
            // SMA交叉策略
            if (sma20 > sma50 && prevSma20 <= prevSma50) {
                return { 
                    signal: 'BUY', 
                    reason: 'SMA20上穿SMA50',
                    confidence: confidence
                };
            } else if (sma20 < sma50 && prevSma20 >= prevSma50) {
                return { 
                    signal: 'SELL', 
                    reason: 'SMA20下穿SMA50',
                    confidence: confidence
                };
            }
            
            return { signal: 'HOLD', reason: '无明确信号', confidence: 0 };
            
        } catch (error) {
            console.error('❌ 计算交易信号失败:', error.message);
            return { signal: 'HOLD', reason: '计算错误', confidence: 0 };
        }
    }
    
    // 计算交易数量
    calculateOrderSize(price, riskAmount) {
        try {
            const accountInfo = this.cache.get('accountInfo');
            if (!accountInfo) return 0;
            
            const availableBalance = accountInfo.free.USDT || 0;
            const maxRiskAmount = availableBalance * (this.config.riskPercent / 100);
            const actualRiskAmount = Math.min(riskAmount, maxRiskAmount);
            
            // 计算数量（简化计算）
            const quantity = actualRiskAmount / price;
            
            // 确保数量符合市场限制（BTC最小0.001）
            const minAmount = 0.001;
            const maxAmount = availableBalance / price;
            
            return Math.max(minAmount, Math.min(quantity, maxAmount));
            
        } catch (error) {
            console.error('❌ 计算交易数量失败:', error.message);
            return 0;
        }
    }
    
    // 执行交易
    async executeTrade(signal) {
        try {
            if (!this.isRunning) {
                console.log('⚠️ 交易引擎未运行');
                return false;
            }
            
            const currentPrice = this.priceHistory[this.priceHistory.length - 1].close;
            const currentPosition = await this.getPositions();
            
            console.log(`🔍 分析交易信号: ${signal.signal} - ${signal.reason} (置信度: ${signal.confidence.toFixed(1)}%)`);
            console.log(`💰 当前价格: $${currentPrice}`);
            
            if (signal.signal === 'BUY' && (!currentPosition || currentPosition.size === 0)) {
                // 开多仓
                const quantity = this.calculateOrderSize(currentPrice, 100);
                
                if (quantity > 0) {
                    // 计算止损止盈价格
                    let stopLossPrice = null;
                    let takeProfitPrice = null;
                    
                    if (this.stopLossConfig.enabled) {
                        stopLossPrice = currentPrice * (1 - this.stopLossConfig.percent / 100);
                        console.log(`🛑 设置止损价格: $${stopLossPrice.toFixed(2)} (${this.stopLossConfig.percent}%)`);
                    }
                    
                    if (this.takeProfitConfig.enabled) {
                        takeProfitPrice = currentPrice * (1 + this.takeProfitConfig.percent / 100);
                        console.log(`🎯 设置止盈价格: $${takeProfitPrice.toFixed(2)} (${this.takeProfitConfig.percent}%)`);
                    }
                    
                    const order = await this.placeOrder('buy', quantity, 'market', stopLossPrice, takeProfitPrice);
                    
                    if (order) {
                        console.log(`✅ 买入订单执行成功: ${order.ordId}`);
                        
                        // 更新模拟账户
                        if (this.config.isSimulated) {
                            const cost = quantity * currentPrice;
                            this.simulatedAccount.balance -= cost;
                            this.simulatedAccount.positions.push({
                                symbol: this.config.symbol,
                                size: quantity,
                                avgPrice: currentPrice,
                                timestamp: Date.now(),
                                stopLossPrice: stopLossPrice,
                                takeProfitPrice: takeProfitPrice
                            });
                        }
                        
                        this.trades.push({
                            id: order.ordId || `sim_${Date.now()}`,
                            type: 'BUY',
                            price: currentPrice,
                            quantity: quantity,
                            timestamp: Date.now(),
                            reason: signal.reason,
                            confidence: signal.confidence,
                            stopLossPrice: stopLossPrice,
                            takeProfitPrice: takeProfitPrice
                        });
                        
                        this.stats.totalTrades++;
                        return true;
                    }
                }
            } else if (signal.signal === 'SELL' && currentPosition && currentPosition.size > 0) {
                // 平多仓
                const order = await this.placeOrder('sell', currentPosition.size, 'market');
                
                if (order) {
                    console.log(`✅ 卖出订单执行成功: ${order.ordId}`);
                    
                    // 更新模拟账户
                    if (this.config.isSimulated) {
                        const revenue = currentPosition.size * currentPrice;
                        this.simulatedAccount.balance += revenue;
                        this.simulatedAccount.positions = [];
                        
                        // 计算盈亏
                        const entryPrice = currentPosition.avgPrice;
                        const pnl = (currentPrice - entryPrice) * currentPosition.size;
                        if (pnl > 0) {
                            this.stats.winningTrades++;
                        } else {
                            this.stats.losingTrades++;
                        }
                        this.stats.totalProfit += pnl;
                    }
                    
                    this.trades.push({
                        id: order.ordId || `sim_${Date.now()}`,
                        type: 'SELL',
                        price: currentPrice,
                        quantity: currentPosition.size,
                        timestamp: Date.now(),
                        reason: signal.reason,
                        confidence: signal.confidence
                    });
                    
                    this.stats.totalTrades++;
                    return true;
                }
            }
            
            return false;
            
        } catch (error) {
            console.error('❌ 执行交易失败:', error.message);
            return false;
        }
    }
    
    // 初始化
    async initialize() {
        try {
            console.log('🔄 初始化交易引擎...');
            
            // 如果是模拟模式，使用模拟数据
            if (this.config.isSimulated) {
                console.log('📊 使用模拟数据初始化...');
                this.initializeSimulatedData();
            } else {
                // 加载历史数据
                await this.getKlineData();
            }
            
            // 计算初始指标
            this.calculateIndicators();
            
            // 获取账户信息
            if (!this.config.isSimulated) {
                await this.getAccountInfo();
            }
            
            console.log('✅ 交易引擎初始化完成');
            return true;
        } catch (error) {
            console.error('❌ 交易引擎初始化失败:', error.message);
            
            // 如果是API错误，尝试使用模拟数据
            if (error.code === 1016 || error.message.includes('频率限制')) {
                console.log('⚠️ 检测到API频率限制，切换到模拟数据模式...');
                this.config.isSimulated = true;
                this.initializeSimulatedData();
                this.calculateIndicators();
                console.log('✅ 使用模拟数据初始化完成');
                return true;
            }
            
            return false;
        }
    }
    
    // 初始化模拟数据
    initializeSimulatedData() {
        const basePrice = 60000;
        const now = Date.now();
        
        // 生成模拟K线数据
        this.priceHistory = [];
        for (let i = 100; i >= 0; i--) {
            const timestamp = now - i * 60000; // 每分钟一个数据点
            const price = basePrice + (Math.random() - 0.5) * 2000; // 价格波动
            
            this.priceHistory.push({
                timestamp: timestamp,
                open: price,
                high: price + Math.random() * 100,
                low: price - Math.random() * 100,
                close: price + (Math.random() - 0.5) * 50,
                volume: Math.random() * 1000 + 500
            });
        }
        
        console.log(`📈 生成模拟K线数据: ${this.priceHistory.length} 条记录`);
    }
    
    // 启动交易引擎
    async start() {
        try {
            console.log('🚀 启动交易引擎...');
            
            const initialized = await this.initialize();
            if (!initialized) {
                throw new Error('初始化失败');
            }
            
            this.isRunning = true;
            console.log('✅ 交易引擎启动成功');
            
            return true;
        } catch (error) {
            console.error('❌ 启动交易引擎失败:', error.message);
            return false;
        }
    }
    
    // 停止交易引擎
    stop() {
        console.log('🛑 停止交易引擎...');
        this.isRunning = false;
        console.log('✅ 交易引擎已停止');
    }
    
    // 获取引擎状态
    getStatus() {
        return {
            isRunning: this.isRunning,
            symbol: this.config.symbol,
            strategy: this.config.strategy,
            tradesCount: this.trades.length,
            priceHistoryLength: this.priceHistory.length,
            indicators: Object.keys(this.indicators),
            stats: this.stats
        };
    }
    
    // 获取交易历史
    getTradeHistory() {
        return this.trades;
    }
    
    // 获取指标数据
    getIndicators() {
        return this.indicators;
    }
    
    // 获取价格历史
    getPriceHistory() {
        return this.priceHistory;
    }

    // 检查止损止盈
    checkStopLossAndTakeProfit(currentPrice) {
        try {
            if (!this.currentPosition || this.currentPosition.size === 0) {
                return null;
            }
            
            const entryPrice = this.currentPosition.avgPrice;
            const positionSize = this.currentPosition.size;
            const unrealizedPnL = (currentPrice - entryPrice) * positionSize;
            const unrealizedPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
            
            // 检查止损
            if (this.stopLossConfig.enabled && unrealizedPercent <= -this.stopLossConfig.percent) {
                console.log(`🛑 触发止损: 价格 $${currentPrice.toFixed(2)}, 入场价 $${entryPrice.toFixed(2)}, 亏损 ${unrealizedPercent.toFixed(2)}%`);
                console.log(`📊 持仓信息: 数量 ${positionSize}, 未实现盈亏 $${unrealizedPnL.toFixed(2)}`);
                
                return {
                    action: 'STOP_LOSS',
                    reason: `止损触发 (${this.stopLossConfig.percent}%)`,
                    price: currentPrice,
                    pnl: unrealizedPnL,
                    percent: unrealizedPercent,
                    entryPrice: entryPrice,
                    positionSize: positionSize
                };
            }
            
            // 检查止盈
            if (this.takeProfitConfig.enabled && unrealizedPercent >= this.takeProfitConfig.percent) {
                console.log(`🎯 触发止盈: 价格 $${currentPrice.toFixed(2)}, 入场价 $${entryPrice.toFixed(2)}, 盈利 ${unrealizedPercent.toFixed(2)}%`);
                console.log(`📊 持仓信息: 数量 ${positionSize}, 未实现盈亏 $${unrealizedPnL.toFixed(2)}`);
                
                return {
                    action: 'TAKE_PROFIT',
                    reason: `止盈触发 (${this.takeProfitConfig.percent}%)`,
                    price: currentPrice,
                    pnl: unrealizedPnL,
                    percent: unrealizedPercent,
                    entryPrice: entryPrice,
                    positionSize: positionSize
                };
            }
            
            // 记录当前盈亏状态（每10%记录一次）
            const absPercent = Math.abs(unrealizedPercent);
            if (absPercent >= 1 && absPercent % 1 < 0.1) {
                const status = unrealizedPercent > 0 ? '盈利' : '亏损';
                console.log(`📈 当前${status}: ${unrealizedPercent.toFixed(2)}% ($${unrealizedPnL.toFixed(2)})`);
            }
            
            return null;
            
        } catch (error) {
            console.error('❌ 检查止损止盈失败:', error.message);
            return null;
        }
    }
}

module.exports = TradingEngine; 