const { SMA, RSI, MACD, BollingerBands } = require('technicalindicators');

class StrategyManager {
    constructor() {
        this.strategies = {
            'sma_crossover': this.smaCrossoverStrategy,
            'rsi_strategy': this.rsiStrategy,
            'macd_strategy': this.macdStrategy,
            'bollinger_strategy': this.bollingerStrategy,
            'combined_strategy': this.combinedStrategy
        };
    }
    
    // SMA交叉策略
    smaCrossoverStrategy(indicators, config = {}) {
        const { shortPeriod = 20, longPeriod = 50 } = config;
        
        try {
            const shortSMA = indicators[`sma${shortPeriod}`];
            const longSMA = indicators[`sma${longPeriod}`];
            
            if (!shortSMA || !longSMA || shortSMA.length < 2 || longSMA.length < 2) {
                return { signal: 'HOLD', reason: 'SMA数据不足', confidence: 0 };
            }
            
            const currentShort = shortSMA[shortSMA.length - 1];
            const currentLong = longSMA[longSMA.length - 1];
            const prevShort = shortSMA[shortSMA.length - 2];
            const prevLong = longSMA[longSMA.length - 2];
            
            // 计算趋势强度
            const trendStrength = Math.abs(currentShort - currentLong) / currentLong * 100;
            const confidence = Math.min(trendStrength * 2, 100);
            
            if (currentShort > currentLong && prevShort <= prevLong) {
                return { 
                    signal: 'BUY', 
                    reason: `SMA${shortPeriod}上穿SMA${longPeriod}`,
                    confidence: confidence
                };
            } else if (currentShort < currentLong && prevShort >= prevLong) {
                return { 
                    signal: 'SELL', 
                    reason: `SMA${shortPeriod}下穿SMA${longPeriod}`,
                    confidence: confidence
                };
            }
            
            return { signal: 'HOLD', reason: '无交叉信号', confidence: 0 };
            
        } catch (error) {
            return { signal: 'HOLD', reason: 'SMA策略计算错误', confidence: 0 };
        }
    }
    
    // RSI策略
    rsiStrategy(indicators, config = {}) {
        const { period = 14, oversold = 30, overbought = 70 } = config;
        
        try {
            const rsi = indicators.rsi;
            
            if (!rsi || rsi.length < 2) {
                return { signal: 'HOLD', reason: 'RSI数据不足', confidence: 0 };
            }
            
            const currentRSI = rsi[rsi.length - 1];
            const prevRSI = rsi[rsi.length - 2];
            
            // 计算RSI变化速度
            const rsiChange = currentRSI - prevRSI;
            const confidence = Math.min(Math.abs(rsiChange) * 2, 100);
            
            if (currentRSI < oversold && rsiChange > 0) {
                return { 
                    signal: 'BUY', 
                    reason: `RSI超卖反弹 (${currentRSI.toFixed(1)})`,
                    confidence: confidence
                };
            } else if (currentRSI > overbought && rsiChange < 0) {
                return { 
                    signal: 'SELL', 
                    reason: `RSI超买回落 (${currentRSI.toFixed(1)})`,
                    confidence: confidence
                };
            }
            
            return { signal: 'HOLD', reason: 'RSI在正常范围', confidence: 0 };
            
        } catch (error) {
            return { signal: 'HOLD', reason: 'RSI策略计算错误', confidence: 0 };
        }
    }
    
    // MACD策略
    macdStrategy(indicators, config = {}) {
        try {
            const macd = indicators.macd;
            
            if (!macd || macd.length < 2) {
                return { signal: 'HOLD', reason: 'MACD数据不足', confidence: 0 };
            }
            
            const current = macd[macd.length - 1];
            const prev = macd[macd.length - 2];
            
            const currentMACD = current.MACD;
            const currentSignal = current.signal;
            const currentHistogram = current.histogram;
            
            const prevMACD = prev.MACD;
            const prevSignal = prev.signal;
            const prevHistogram = prev.histogram;
            
            // 计算MACD信号强度
            const histogramChange = currentHistogram - prevHistogram;
            const confidence = Math.min(Math.abs(histogramChange) * 10, 100);
            
            // MACD金叉
            if (currentMACD > currentSignal && prevMACD <= prevSignal && currentHistogram > 0) {
                return { 
                    signal: 'BUY', 
                    reason: 'MACD金叉',
                    confidence: confidence
                };
            }
            // MACD死叉
            else if (currentMACD < currentSignal && prevMACD >= prevSignal && currentHistogram < 0) {
                return { 
                    signal: 'SELL', 
                    reason: 'MACD死叉',
                    confidence: confidence
                };
            }
            
            return { signal: 'HOLD', reason: 'MACD无明确信号', confidence: 0 };
            
        } catch (error) {
            return { signal: 'HOLD', reason: 'MACD策略计算错误', confidence: 0 };
        }
    }
    
    // 布林带策略
    bollingerStrategy(indicators, config = {}) {
        const { period = 20, stdDev = 2 } = config;
        
        try {
            const bollinger = indicators.bollinger;
            
            if (!bollinger || bollinger.length < 1) {
                return { signal: 'HOLD', reason: '布林带数据不足', confidence: 0 };
            }
            
            const current = bollinger[bollinger.length - 1];
            const currentPrice = current.close || current.price;
            
            const upper = current.upper;
            const lower = current.lower;
            const middle = current.middle;
            
            // 计算价格在布林带中的位置
            const bandWidth = upper - lower;
            const pricePosition = (currentPrice - lower) / bandWidth;
            
            const confidence = Math.min(Math.abs(pricePosition - 0.5) * 200, 100);
            
            // 价格触及下轨
            if (currentPrice <= lower * 1.01) {
                return { 
                    signal: 'BUY', 
                    reason: '价格触及布林带下轨',
                    confidence: confidence
                };
            }
            // 价格触及上轨
            else if (currentPrice >= upper * 0.99) {
                return { 
                    signal: 'SELL', 
                    reason: '价格触及布林带上轨',
                    confidence: confidence
                };
            }
            
            return { signal: 'HOLD', reason: '价格在布林带中间', confidence: 0 };
            
        } catch (error) {
            return { signal: 'HOLD', reason: '布林带策略计算错误', confidence: 0 };
        }
    }
    
    // 综合策略（多指标确认）
    combinedStrategy(indicators, config = {}) {
        try {
            const signals = [];
            let totalConfidence = 0;
            let signalCount = 0;
            
            // 获取各个策略的信号
            const smaSignal = this.smaCrossoverStrategy(indicators, config.sma);
            const rsiSignal = this.rsiStrategy(indicators, config.rsi);
            const macdSignal = this.macdStrategy(indicators, config.macd);
            const bollingerSignal = this.bollingerStrategy(indicators, config.bollinger);
            
            signals.push(smaSignal, rsiSignal, macdSignal, bollingerSignal);
            
            // 统计信号
            const buySignals = signals.filter(s => s.signal === 'BUY');
            const sellSignals = signals.filter(s => s.signal === 'SELL');
            
            // 计算综合置信度
            signals.forEach(signal => {
                if (signal.signal !== 'HOLD') {
                    totalConfidence += signal.confidence;
                    signalCount++;
                }
            });
            
            const avgConfidence = signalCount > 0 ? totalConfidence / signalCount : 0;
            
            // 需要至少2个指标确认
            if (buySignals.length >= 2) {
                return { 
                    signal: 'BUY', 
                    reason: `多指标确认买入 (${buySignals.length}个指标)`,
                    confidence: avgConfidence
                };
            } else if (sellSignals.length >= 2) {
                return { 
                    signal: 'SELL', 
                    reason: `多指标确认卖出 (${sellSignals.length}个指标)`,
                    confidence: avgConfidence
                };
            }
            
            return { signal: 'HOLD', reason: '指标信号不一致', confidence: 0 };
            
        } catch (error) {
            return { signal: 'HOLD', reason: '综合策略计算错误', confidence: 0 };
        }
    }
    
    // 执行策略
    executeStrategy(strategyName, indicators, config = {}) {
        const strategy = this.strategies[strategyName];
        
        if (!strategy) {
            return { 
                signal: 'HOLD', 
                reason: `策略 ${strategyName} 不存在`, 
                confidence: 0 
            };
        }
        
        return strategy.call(this, indicators, config);
    }
    
    // 获取可用策略列表
    getAvailableStrategies() {
        return Object.keys(this.strategies);
    }
    
    // 获取策略配置模板
    getStrategyConfig(strategyName) {
        const configs = {
            'sma_crossover': {
                shortPeriod: 20,
                longPeriod: 50
            },
            'rsi_strategy': {
                period: 14,
                oversold: 30,
                overbought: 70
            },
            'macd_strategy': {
                fastPeriod: 12,
                slowPeriod: 26,
                signalPeriod: 9
            },
            'bollinger_strategy': {
                period: 20,
                stdDev: 2
            },
            'combined_strategy': {
                sma: { shortPeriod: 20, longPeriod: 50 },
                rsi: { period: 14, oversold: 30, overbought: 70 },
                macd: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
                bollinger: { period: 20, stdDev: 2 }
            }
        };
        
        return configs[strategyName] || {};
    }
}

module.exports = StrategyManager; 