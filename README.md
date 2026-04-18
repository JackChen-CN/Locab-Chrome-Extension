# Locab Chrome Extension

> **Location + Vocabulary** - 智能网页生词标记与复习助手

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-blue?logo=google-chrome&logoColor=white)](https://chrome.google.com/webstore)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)](https://developer.chrome.com/docs/extensions/mv3/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![AI Generated](https://img.shields.io/badge/AI-Generated-purple)](README.md)

Locab 是一款功能强大的 Chrome 浏览器扩展插件，专为语言学习者设计。它允许您在网页上标记生词，自动记录单词的上下文句子、精确位置信息（行号、词序号、XPath），并支持复习模式和一键定位回原文功能。

**✨ 核心亮点：**
- 🔍 **精确位置记录**：自动计算单词在原文中的行号和词序号
- 📍 **智能定位**：一键返回单词在原文中的位置，支持跨页面定位
- 📚 **复习系统**：卡片式复习模式，标记认识/不认识
- 💾 **本地存储**：所有数据保存在本地，隐私安全
- 📤 **数据导出**：支持导出为 JSONL 格式，便于备份和分析

## 🎯 功能特性

### 1. 智能标记生词
- **右键菜单标记**：在任意网页上选中单个单词，右键点击"标记生词"
- **自动翻译**：调用 MyMemory API 获取中文翻译，失败时可手动输入
- **上下文捕获**：自动获取单词所在的完整句子
- **位置计算**：精确计算行号、词序号、XPath 和字符偏移量

### 2. 精确位置信息
- **行号计算**：基于段落文本自动计算单词所在行
- **词序号定位**：在行内确定单词的精确位置
- **XPath 记录**：保存 DOM 元素路径，确保定位准确性
- **双重定位策略**：XPath + 行号/词序号双重保障

### 3. 单词管理
- **列表展示**：所有标记单词按时间排序展示
- **搜索过滤**：支持按单词、翻译、句子内容搜索
- **批量操作**：支持删除、清空、导出操作
- **预览功能**：显示句子预览、来源网址、记录时间

### 4. 复习模式
- **卡片式复习**：逐张展示单词卡片
- **上下文展示**：显示单词、翻译、完整句子
- **简单评估**：标记"认识"/"不认识"，自动切换卡片
- **进度显示**：显示当前进度和总数

### 5. 智能定位
- **一键定位**：点击定位按钮返回单词在原文中的位置
- **跨页支持**：自动判断是否在原页面，支持新标签页打开
- **智能高亮**：黄色背景高亮单词，3秒后自动消失
- **降级策略**：XPath失效时降级为全文搜索

### 6. 数据管理
- **本地存储**：使用 `chrome.storage.local` 存储数据
- **JSONL 导出**：导出为标准的 JSON Lines 格式
- **重复检测**：自动检测重复记录，避免重复保存
- **数据备份**：随时导出备份，随时恢复

## 📦 技术栈

- **平台**：Chrome Extension (Manifest V3)
- **语言**：JavaScript (ES6+)
- **存储**：chrome.storage.local
- **API**：MyMemory Translation API
- **权限**：contextMenus, activeTab, storage, scripting, tabs
- **样式**：现代CSS，支持暗色主题
- **UI**：响应式设计，500×550px 弹窗

## 🚀 快速开始

### 安装方法

1. **克隆仓库**
   ```bash
   git clone https://github.com/yourusername/locab-chrome-extension.git
   cd locab-chrome-extension
   ```

2. **Chrome 加载扩展**
   - 打开 Chrome 浏览器，访问 `chrome://extensions/`
   - 开启右上角的"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择项目文件夹

3. **开始使用**
   - 安装成功后，浏览器工具栏会出现 Locab 图标
   - 在任意网页上右键即可看到"标记生词"选项

### 使用步骤

#### 标记生词
1. 在网页上选中一个**单个单词**（不含空格）
2. 右键点击，选择"标记生词"
3. 自动获取翻译和上下文信息
4. 页面右上角显示"已标记单词"提示

#### 管理单词
1. 点击浏览器工具栏中的 Locab 图标
2. 在"单词列表"标签页查看所有记录
3. 使用搜索框过滤单词
4. 点击"定位"按钮返回原文位置
5. 点击"删除"按钮移除记录

#### 复习单词
1. 切换到"复习模式"标签页
2. 卡片展示单词、翻译和句子
3. 点击"认识"或"不认识"标记学习状态
4. 自动切换到下一张卡片

#### 导出数据
1. 在单词列表页面点击"导出"按钮
2. 自动下载 `vocab_export_YYYYMMDD.txt` 文件
3. 文件为 JSONL 格式，每行一条完整记录

## 📁 项目结构

```
locab-chrome-extension/
├── manifest.json          # 扩展配置文件 (Manifest V3)
├── background.js          # Service Worker 后台脚本
├── content.js            # 内容脚本 (注入到网页)
├── popup.html            # 弹出窗口界面
├── popup.js              # 弹出窗口逻辑
├── styles.css            # 样式文件 (暗色主题)
├── icons/                # 扩展图标
│   ├── icon16.png        # 16×16 图标
│   ├── icon48.png        # 48×48 图标
│   └── icon128.png       # 128×128 图标
├── INSTALL.txt           # 安装说明
└── README.md             # 项目说明文档
```

## 🔧 文件说明

### manifest.json
扩展的主配置文件，定义权限、内容脚本、背景脚本、弹出窗口等。

### background.js
Service Worker 脚本，处理：
- 右键菜单创建和响应
- MyMemory API 翻译请求
- 数据存储和读取操作
- 跨页面消息通信

### content.js
注入到每个网页的内容脚本，处理：
- 单词上下文信息提取
- 行号和词序号计算
- XPath 生成
- 单词定位和高亮
- 页面通知显示

### popup.html/popup.js
弹出窗口界面和逻辑，提供：
- 单词列表展示和搜索
- 复习模式卡片系统
- 数据导出功能
- 用户交互处理

### styles.css
现代暗色主题样式，响应式设计，确保良好的用户体验。

## 📖 详细功能说明

### 位置计算算法
1. **块级元素识别**：自动找到包含选中单词的最近块级元素（p, div, li 等）
2. **行号计算**：将元素文本按换行符分割，根据选区偏移量确定所在行
3. **词序号计算**：在行内使用正则表达式匹配单词，确定选中单词的位置
4. **XPath 生成**：生成 DOM 元素的唯一 XPath 路径
5. **字符偏移量**：记录单词在元素文本中的起始位置

### 定位策略
1. **精确定位**：优先使用 XPath 找到元素，结合行号和词序号定位
2. **降级定位**：如果 XPath 失效，使用行号和词序号定位
3. **全文搜索**：如果位置信息失效，在元素内全文搜索单词
4. **跨页处理**：自动判断当前页面，支持新标签页打开定位

### 数据格式
```json
{
  "id": "1703123456789_abc123",
  "word": "infinitive",
  "translation": "不定式",
  "sentence": "An infinitive is the base form of a verb.",
  "url": "https://example.com/page",
  "line": 3,
  "wordIndex": 2,
  "timestamp": 1703123456789,
  "xpath": "/html/body/p[2]",
  "offset": 45
}
```

## 🌐 API 使用

### MyMemory Translation API
- **端点**：`https://api.mymemory.translated.net/get`
- **参数**：`q={word}&langpair=en|zh`
- **超时**：5秒，超时后使用手动输入
- **备用方案**：API失败时提示用户手动输入翻译

## 🎨 用户体验

### 暗色主题
- 主背景：`#1e1e2f`
- 文字颜色：`#cdd6f4`
- 强调色：`#89b4fa` (蓝色)
- 成功色：`#a6e3a1` (绿色)
- 警告色：`#f9e2af` (黄色)
- 错误色：`#f38ba8` (红色)

### 响应式设计
- 弹出窗口：500×550px
- 自适应布局，支持不同屏幕尺寸
- 移动端友好设计

### 交互反馈
- 页面右上角 Toast 通知
- 操作确认对话框
- 按钮悬停效果
- 加载状态提示

## 🤝 贡献指南

欢迎贡献代码、报告问题或提出改进建议！

### 报告问题
1. 在 [Issues](https://github.com/yourusername/locab-chrome-extension/issues) 页面查看现有问题
2. 如无相关问题，创建新的 Issue
3. 详细描述问题、复现步骤和期望行为

### 提交代码
1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

### 开发环境
1. 确保安装 Chrome 浏览器
2. 克隆仓库到本地
3. 在 `chrome://extensions/` 加载扩展
4. 开启扩展的"开发者模式"以便调试

### 代码规范
- 使用 ES6+ 语法
- 添加必要的注释
- 保持代码模块化
- 错误处理完善

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

### 使用的技术
- [Chrome Extensions API](https://developer.chrome.com/docs/extensions/)
- [MyMemory Translation API](https://mymemory.translated.net/)
- [Font Awesome](https://fontawesome.com/) 图标
- [Google Fonts](https://fonts.google.com/)

### 灵感来源
- 语言学习者的实际需求
- 现有单词管理工具的不足
- 位置记忆在学习中的重要性

## 📞 支持与反馈

如果您在使用过程中遇到问题或有改进建议：

1. **GitHub Issues**：报告问题或功能请求
2. **电子邮件**：通过 GitHub 个人资料联系
3. **Pull Request**：直接贡献代码

## 🏷️ 版本历史

### v1.0.0 (2026-04-18)
- 初始版本发布
- 完整的基础功能
- Manifest V3 支持
- 暗色主题界面
- JSONL 导出功能

---

## ⚠️ 关于 AI 生成

本项目由 **AI 辅助生成**，旨在展示 AI 在软件开发中的应用能力。

### 生成过程
1. **需求分析**：详细的功能需求文档分析
2. **架构设计**：系统架构和模块划分
3. **代码生成**：完整的 6 个核心文件代码
4. **测试验证**：代码完整性和可运行性检查
5. **文档编写**：完整的安装和使用文档

### AI 的角色
- **代码编写**：生成可运行的 JavaScript 代码
- **逻辑设计**：实现复杂的定位算法和数据管理
- **界面设计**：创建美观的用户界面
- **文档生成**：编写详细的技术文档

### 人类的作用
- **需求定义**：明确功能和用户体验要求
- **架构指导**：提供技术栈和设计原则
- **质量检查**：验证代码的正确性和完整性
- **部署指导**：提供安装和部署说明

### 项目意义
- 展示 AI 在完整项目开发中的能力
- 提供实际可用的 Chrome 扩展示例
- 演示复杂功能（如位置计算）的实现
- 展示现代 Web 开发的最佳实践

**注意**：虽然本项目由 AI 生成，但所有代码都经过验证，可以直接运行。建议在实际使用前进行充分测试。

---

**快乐学习，高效记忆！** 🎉

*Locab - 让每一个单词都有迹可循*