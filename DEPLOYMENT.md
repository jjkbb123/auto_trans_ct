# 项目部署指南

## 🚀 将项目推送到GitHub

### 方法一：使用Git命令行（推荐）

#### 1. 安装Git
- 访问 https://git-scm.com/download/win
- 下载并安装Git for Windows
- 安装完成后重启命令提示符

#### 2. 配置Git用户信息
```bash
git config --global user.name "您的GitHub用户名"
git config --global user.email "您的邮箱"
```

#### 3. 初始化并推送项目
```bash
# 进入项目目录
cd E:\Project\auto_trans_ct

# 初始化Git仓库
git init

# 添加所有文件到暂存区
git add .

# 创建初始提交
git commit -m "Initial commit: OKX量化交易监控系统

- 实时行情监控
- 技术指标计算
- 量化交易引擎
- 多种交易策略
- 现代化Web界面"

# 添加远程仓库
git remote add origin https://github.com/jjkbb123/auto_trans.git

# 推送到GitHub
git push -u origin main
```

### 方法二：使用GitHub Desktop

#### 1. 安装GitHub Desktop
- 访问 https://desktop.github.com/
- 下载并安装GitHub Desktop

#### 2. 克隆仓库
- 打开GitHub Desktop
- 点击"Clone a repository from the Internet"
- 输入仓库URL：`https://github.com/jjkbb123/auto_trans.git`
- 选择本地保存路径
- 点击"Clone"

#### 3. 复制项目文件
- 将当前项目中的所有文件复制到克隆的文件夹中
- 在GitHub Desktop中查看变更
- 添加提交信息并提交
- 点击"Push origin"推送

### 方法三：手动上传

#### 1. 下载仓库
- 访问 https://github.com/jjkbb123/auto_trans
- 点击"Code" → "Download ZIP"
- 解压到本地

#### 2. 复制文件
- 将当前项目文件复制到解压的文件夹中
- 在GitHub网页上点击"Add file" → "Upload files"
- 选择所有文件并上传

## 📁 项目文件结构

```
auto_trans_ct/
├── server.js              # 主服务器文件
├── trading-engine.js       # 交易引擎核心
├── strategies.js          # 交易策略管理器
├── package.json           # 项目依赖配置
├── package-lock.json      # 依赖锁定文件
├── README.md              # 项目说明文档
├── DEPLOYMENT.md          # 部署指南
├── .gitignore             # Git忽略文件
└── public/
    └── index.html         # 前端界面
```

## 🔧 部署后配置

### 1. 环境变量设置
在GitHub仓库的Settings → Secrets中添加：
- `OKX_API_KEY` - OKX API密钥
- `OKX_SECRET_KEY` - OKX API密钥
- `OKX_PASSPHRASE` - OKX API密码

### 2. 本地运行
```bash
# 安装依赖
npm install

# 启动服务器
node server.js
```

### 3. 访问系统
打开浏览器访问：`http://localhost:3000`

## 📋 检查清单

在推送前请确认：

- [ ] 所有源代码文件完整
- [ ] README.md 文档更新
- [ ] .gitignore 文件配置正确
- [ ] 没有包含敏感信息（API密钥等）
- [ ] package.json 依赖配置正确

## 🚨 注意事项

1. **API密钥安全**：确保不要将真实的API密钥提交到GitHub
2. **环境变量**：使用.env文件管理敏感配置
3. **依赖管理**：确保package.json包含所有必要的依赖
4. **文档完整性**：README.md应该包含完整的使用说明

## 🆘 常见问题

### Q: Git命令不可用
A: 请先安装Git for Windows

### Q: 推送失败
A: 检查网络连接和GitHub账户权限

### Q: 文件过大
A: 确保node_modules文件夹被.gitignore排除

### Q: 权限错误
A: 确认GitHub仓库的所有权或协作权限

---

完成部署后，您的量化交易系统就可以在GitHub上公开访问了！ 