# OKX 量化交易监控系统

一个基于OKX交易所API的实时量化交易监控系统，支持多种技术指标策略和自动化交易。

## 🚀 功能特性

### 核心功能
- **实时行情监控** - 直接对接OKX API获取BTC/USDT实时价格
- **技术指标计算** - 支持SMA、RSI、MACD、布林带等多种技术指标
- **交易策略引擎** - 内置多种量化交易策略
- **自动化交易** - 基于技术指标信号自动执行买卖操作
- **风险控制** - 内置风险管理和资金管理机制
- **实时监控界面** - 现代化的Web界面，实时显示交易状态

### 交易策略
1. **SMA交叉策略** - 基于短期和长期移动平均线交叉
2. **RSI策略** - 基于相对强弱指数的超买超卖信号
3. **MACD策略** - 基于MACD指标的金叉死叉信号
4. **布林带策略** - 基于价格在布林带中的位置
5. **综合策略** - 多指标确认的复合策略

## 📋 系统要求

- Node.js 16.0+
- npm 或 yarn
- OKX API密钥（可选，用于真实交易）

## 🛠️ 安装配置

### 1. 克隆项目
```bash
git clone <repository-url>
cd auto_trans_ct
```

### 2. 安装依赖
```bash
npm install
```

### 3. 环境配置
创建 `.env` 文件（可选，用于真实交易）：
```env
OKX_API_KEY=your_api_key
OKX_SECRET_KEY=your_secret_key
OKX_PASSPHRASE=your_passphrase
NODE_ENV=development
```

### 4. 启动系统
```bash
node server.js
```

系统将在 `http://localhost:3000` 启动

## 🎯 使用指南

### 基础监控
1. 打开浏览器访问 `http://localhost:3000`
2. 系统会自动开始获取BTC/USDT实时行情
3. 查看价格走势、账户权益等实时数据

### 启动量化交易
1. 在界面上点击"启动交易"按钮
2. 系统会初始化交易引擎并加载历史数据
3. 交易引擎会根据设定的策略自动分析市场信号
4. 当信号置信度超过70%时，系统会自动执行交易

### 交易策略配置
系统默认使用SMA交叉策略，您可以通过修改 `trading-engine.js` 中的配置来调整：

```javascript
const tradingEngine = new TradingEngine({
    symbol: 'BTC-USDT',        // 交易对
    strategy: 'sma_crossover',  // 策略类型
    riskPercent: 2             // 每次交易风险比例
});
```

## 📊 API接口

### 健康检查
```
GET /health
```

### 交易引擎控制
```
POST /api/trading/start    # 启动交易引擎
POST /api/trading/stop     # 停止交易引擎
GET  /api/trading/status   # 获取引擎状态
GET  /api/trading/signal   # 获取当前交易信号
```

## 🔧 技术架构

### 后端技术栈
- **Node.js** - 运行环境
- **Express** - Web框架
- **Socket.IO** - 实时通信
- **Technical Indicators** - 技术指标计算
- **NodeCache** - 数据缓存

### 前端技术栈
- **HTML5/CSS3** - 界面结构
- **Chart.js** - 图表展示
- **Socket.IO Client** - 实时数据接收
- **Font Awesome** - 图标库

### 核心模块
- `server.js` - 主服务器文件
- `trading-engine.js` - 交易引擎核心
- `strategies.js` - 交易策略管理器
- `public/index.html` - 前端界面

## ⚠️ 风险提示

1. **模拟交易** - 系统默认运行在模拟模式下，不会执行真实交易
2. **API密钥** - 如需真实交易，请确保API密钥具有交易权限
3. **资金风险** - 量化交易存在资金损失风险，请谨慎使用
4. **策略测试** - 建议先在模拟环境中充分测试策略效果

## 🔄 开发计划

### 第一阶段 ✅
- [x] 基础监控系统
- [x] 技术指标计算
- [x] 简单交易策略
- [x] 基础交易引擎

### 第二阶段 🚧
- [ ] 更多交易策略
- [ ] 回测系统
- [ ] 策略优化
- [ ] 风险管理增强

### 第三阶段 📋
- [ ] 多币种支持
- [ ] 高级图表分析
- [ ] 策略回测报告
- [ ] 移动端适配

## 🤝 贡献指南

欢迎提交Issue和Pull Request来改进这个项目！

## 📄 许可证

本项目采用 MIT 许可证。

## 📞 联系方式

如有问题或建议，请通过以下方式联系：
- 提交GitHub Issue
- 发送邮件至项目维护者

---

**免责声明**: 本系统仅供学习和研究使用，不构成投资建议。使用本系统进行真实交易的风险由用户自行承担。 