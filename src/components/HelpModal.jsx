import React, { useState, useMemo, useRef, useCallback } from 'react';

// MD 文档内容
const MANUAL_MD = `# AIDM 用户操作手册

**版本**: 1.0.0  **适用对象**: 零基础用户  **更新日期**: 2026年6月

---

## 目录

1. 软件简介
2. 安装与启动
3. 界面介绍
4. 核心功能详解
5. 示例模型使用
6. 数据导入导出
7. 常见问题解答

---

## 1. 软件简介

### 1.1 产品定位

AIDM（AI Decision Making）是一款价值驱动树分析工具，主要用途包括：

- 建立业务指标之间的因果关系模型
- 分析驱动因子对目标指标的影响程度
- 预测调整驱动因子后的结果变化
- 支持多方案对比和敏感性分析

### 1.2 适用场景

| 场景 | 说明 |
|------|------|
| 利润分析 | 分析营业收入、成本、费用对净利润的影响 |
| 销售预测 | 建立销售漏斗模型，预测销售收入 |
| 成本控制 | 分析各项成本对利润的敏感度 |
| 战略规划 | 多方案对比，选择最优策略 |
| 预算编制 | 设定目标值，推算需要达成的驱动因子水平 |

### 1.3 版本说明

| 版本 | 功能限制 |
|------|----------|
| 试用版 | 节点<=30，层级<=3，方案<=2，指标体系<=2，禁用AI决策/导出/PowerBI，30天有效期 |
| 标准版 | 节点<=100，层级<=5，方案<=10，指标体系<=5，完整功能 |
| 专业版 | 无限制，完整功能 |

---

## 2. 安装与启动

### 2.1 安装步骤

1. 从官方渠道获取 AIDM-Setup-1.0.0.exe 安装文件
2. 双击安装文件，按照向导完成安装
3. 安装完成后，桌面会出现 AIDM 图标，双击启动

首次启动时，试用版会自动生成30天试用许可证。

### 2.2 许可证管理

**试用版激活**
首次启动时软件自动创建试用许可证，有效期30天。

**专业版激活**
1. 点击状态栏的「升级专业版」按钮
2. 点击「导入授权文件」
3. 选择 .lic 授权文件
4. 点击「验证授权」完成激活

---

## 3. 界面介绍

### 3.1 整体布局

    +-------------------------------------------------------------+
    |  工具栏（顶部）                                                |
    +-------------------------------------------------------------+
    |                                                             |
    |    节点列表面板    |         画布区域（主工作区）             |
    |    （左侧可收起）  |         - 节点卡片                      |
    |                    |         - 连线关系                      |
    |                    |         - 拖拽/缩放操作                 |
    |                                                             |
    +-------------------------------------------------------------+
    |  状态栏（底部）                                                |
    |  授权状态 / 节点层级方案数量 / 功能限制提示                    |
    +-------------------------------------------------------------+

### 3.2 工具栏功能

**左侧功能区：**
- **节点列表**：展开/收起节点树形列表
- **方案比选**：打开方案对比面板
- **分析模块**：敏感性分析、标准差分析
- **AI 决策**：AI配置、AI调参、知识库、场景选择、规则管理、别名管理
- **新建节点**：创建新的驱动因子或计算指标

**右侧功能区：**
- **示例模型**：销售漏斗模型、利润模型、数据表模板、公式表模板
- **获取数据**：导入数据、PowerBI连接、刷新数据
- **指标体系**：打开指标体系管理窗口
- **导出**：导出图片、导出JSON、导出CSV
- **横版/竖版**：切换画布布局方向
- **帮助**：打开本帮助文档

---

## 4. 核心功能详解

### 4.1 指标体系管理

指标体系是一套完整的业务模型，包含驱动因子、计算指标和时间数据。

操作方法：点击工具栏「指标体系」按钮，打开管理窗口，可新建、导入、导出、切换、重命名或删除指标体系。

数量限制：试用版最多2个，标准版最多5个，专业版无限制。

### 4.2 节点管理

**节点类型**

| 类型 | 说明 |
|------|------|
| 驱动因子 | 直接输入的参数，可手动调整值 |
| 计算指标 | 公式计算的结果，依赖其他节点 |

**创建节点**
点击「新建节点」按钮，填写节点ID、名称、类型、层级、单位、聚合方式，如果是计算指标还需填写公式。

**编辑节点**
双击节点卡片，或点击右上角编辑按钮，修改后保存。

**删除节点**
点击节点右上角删除按钮，确认后删除。

### 4.3 场景管理

场景是一套调整方案的快照，保存所有驱动因子的当前调整状态。

工具栏左侧有场景选择器，下拉菜单可切换、新建、保存、重命名、复制或删除场景。

场景数量限制：试用版最多2个，标准版最多10个，专业版无限制。

### 4.4 节点卡片详解

**值调整方式**

| 方式 | 操作 | 适用场景 |
|------|------|----------|
| 滑块调整 | 拖动滑块 | 快速调整，直观 |
| 数值输入 | 输入框输入精确值 | 精确调整 |
| 百分比调整 | 输入百分比后点击应用 | 按比例调整 |
| 重置 | 点击重置按钮 | 恢复初始值 |

**分期调整**
点击「月度调整」按钮展开分期调整面板，可勾选月份批量操作，使用 Ctrl+Up / Ctrl+Down 快捷键批量增减1%，也可从CSV/Excel导入分期数据。

**权重分配**
点击「权重分配」按钮展开权重分配面板。权重分配的是调整额（当前值-原始值），权重总和必须等于1才能应用。支持负权重，可实现部分月份增加、部分月份减少的效果。

**调整描述**
点击「调整描述」按钮展开描述编辑面板，可记录调整理由、数据依据、预期效果和风险提示，便于后续复盘。

### 4.5 方案比选

点击「方案比选」按钮打开对比面板，自动显示所有方案的对比数据，包括各节点在不同方案下的值和差异。

### 4.6 敏感性分析

点击「分析模块」->「敏感性分析」，选择目标指标和驱动因子，设定变动幅度。

面板包含四个Tab：趋势图、汇总表、分期表、敏感性图。敏感性折线图展示各驱动因子变动对目标的影响，斜率越大表示影响越敏感。

敏感性系数含义：大于0表示正相关，小于0表示负相关，绝对值越大影响越敏感。

### 4.7 标准差分析

点击「分析模块」->「标准差分析」，选择分析指标，查看时间数据的波动率和离散系数。

### 4.8 数据面板

点击任意节点后右侧弹出数据面板，或点击节点卡片上的数据按钮打开。

面板包含三个Tab：
- 汇总对比：实际汇总、预测汇总、目标汇总、差额
- 月度明细：各期间详细数据
- 调整描述清单：所有节点的调整描述汇总

### 4.9 趋势图

点击节点卡片右上角的趋势图按钮打开，展示时间序列变化，包含目标值、实际值、预测值三条曲线，以及红/绿差额柱（调整后预测值与目标的差异）。

### 4.10 瀑布图

点击计算指标节点右上角的瀑布图按钮打开，展示各依赖因子对计算结果的贡献量。

### 4.11 AI 决策功能（专业版）

点击「AI 决策」下拉菜单，包含：
- AI 配置：配置API密钥、模型参数
- AI 调参：设定目标指标和目标值，AI自动推荐调整方案
- 知识库：管理历史案例
- 场景选择：管理AI场景模板
- 规则管理：配置约束映射规则
- 别名管理：配置因子别名映射

### 4.12 PowerBI 连接（专业版）

点击「获取数据」->「PowerBI 连接」，选择已打开的 Power BI Desktop 文件，选择数据集和字段，点击连接导入数据。

点击「获取数据」->「刷新数据」可更新最新数据。

---

## 5. 示例模型使用

### 5.1 利润模型

**公式**

| 计算指标 | 公式 |
|----------|------|
| 毛利润 | 营业收入 - 营业成本 |
| 营业利润 | 毛利润 - 销售费用 - 管理费用 |
| 净利润 | 营业利润 x 0.75 |

加载方式：点击「示例模型」->「利润模型」

### 5.2 销售漏斗模型

**公式**

| 计算指标 | 公式 |
|----------|------|
| 商机量 | 线索量 x 线索转化率 / 100 |
| 成交客户数 | 商机量 x 商机转化率 / 100 |
| 销售收入 | 成交客户数 x 客单价 |

加载方式：点击「示例模型」->「销售漏斗模型」

---

## 6. 数据导入导出

### 6.1 数据表模板

**数据表模板**

| 列名 | 说明 |
|------|------|
| 节点ID | 节点唯一标识 |
| 节点名称 | 显示名称 |
| 类型 | driver/computed |
| 层级 | 1-3 |
| 单位 | 万元/%等 |
| 聚合方式 | sum/average |
| 公式 | 计算指标公式 |
| 当前值 | 驱动因子值 |
| 目标值 | 基准目标值 |
| 最小值 | 范围下限 |
| 最大值 | 范围上限 |

### 6.2 导入数据

从 CSV/Excel 导入：点击「获取数据」->「导入数据」，选择文件，按照模板格式映射字段。

### 6.3 导出数据（专业版）

点击「导出」下拉菜单：
- 导出图片：保存画布截图
- 导出 JSON：保存完整模型数据
- 导出 CSV：保存节点数据表格

---

## 7. 常见问题解答

**Q1: 试用版过期怎么办？**
购买专业版授权文件，点击状态栏「升级专业版」，导入授权文件完成激活。

**Q2: 节点创建失败提示"超出限制"？**
试用版限制节点<=30、层级<=3，可升级专业版或精简模型。

**Q3: 调整驱动因子后计算指标没变化？**
检查计算指标的公式字段，确保引用了正确的节点ID。

**Q4: 趋势图没有红绿差额柱？**
预测值未调整或与目标值相同，调整驱动因子的预测值即可显示。

**Q5: 敏感性分析结果显示"无差异"？**
纯乘法公式的弹性系数都为1，查看敏感性折线图，斜率越大越敏感。

**Q6: 数据面板导出按钮无效？**
试用版禁用导出功能，升级专业版后可用。

**Q7: 节点位置混乱如何整理？**
点击「布局整理」按钮自动排列。

**Q8: 如何撤销误操作？**
当前版本暂不支持撤销，请谨慎操作。

**Q9: 分期调整后汇总值不对？**
检查聚合方式设置：百分比类型指标用「平均」，金额类型指标用「加总」。

**Q10: 如何备份模型？**
点击「指标体系」->「导出体系」，保存JSON文件。

---

## 附录：快捷键参考

| 快捷键 | 功能 | 适用场景 |
|--------|------|----------|
| Ctrl + Up | 增加选中月份 1% | 分期调整面板 |
| Ctrl + Down | 减少选中月份 1% | 分期调整面板 |
| Enter | 确认输入 | 数值输入框 |
| Escape | 取消/关闭 | 弹窗、编辑模式 |
| 双击节点 | 打开编辑窗口 | 节点卡片 |

---

## 联系我们

如有问题，请联系：

- 邮箱：3223279@qq.com
- 联系作者：15389225466（微信同号）
`;

const AI_DECISION_MD = `# AI 决策模块操作说明书

> 文档版本：1.0
> 适用版本：AIDM 1.0.0+

---

## 目录

1. 概述
2. AI 配置
3. AI 调参
4. 知识库
5. 场景选择
6. 规则管理
7. 别名管理
8. 常见问题

---

## 1. 概述

### 1.1 AI 决策模块简介

AI 决策模块是 AIDM 的核心功能之一（专业版），提供基于人工智能的业务指标智能调参能力。

### 1.2 模块组成

| 模块 | 功能描述 |
|------|----------|
| AI 配置 | 配置 AI 连接参数、模型选择、温度值等 |
| AI 调参 | 智能调整驱动因子，生成调参方案 |
| 知识库 | 管理历史调参案例，支持语义检索 |
| 场景选择 | 选择 AI 场景模板，定义 Prompt 策略 |
| 规则管理 | 配置约束映射规则和单位体系 |
| 别名管理 | 配置因子别名映射，提升识别准确率 |

### 1.3 访问方式

1. 在顶部工具栏找到「AI 决策」按钮（紫色）
2. 点击后展开下拉菜单
3. 选择对应的模块进入

---

## 2. AI 配置

### 2.1 功能说明

配置 AI 服务连接参数，支持多家 AI 厂商和本地部署方案。

### 2.2 配置项说明

**温度值说明：**
- **0.0-0.3**：输出严谨、确定性强
- **0.4-0.7**：平衡创造性与准确性（推荐）
- **0.8-1.0**：更具创造性，适合头脑风暴
- **>1.0**：高度发散，可能不稳定

### 2.3 预设厂商

| 厂商 | 说明 |
|------|------|
| 自定义 | 手动配置所有参数 |
| DeepSeek | 深度求索 AI |
| 通义千问 | 阿里云 Qwen 模型 |
| 文心一言 | 百度 AI 模型 |
| 智谱 AI | 智谱华章 GLM 模型 |
| 讯飞星火 | 科大讯飞模型 |
| 本地 Ollama | 本地部署 Ollama |
| 本地 LM Studio | 本地部署 LM Studio |

### 2.4 操作步骤

1. 选择服务厂商
2. 填写 API 地址
3. 填写 API 密钥
4. 选择或填写模型名称
5. 点击「测试连接」验证配置
6. 测试通过后点击「保存配置」

---

## 3. AI 调参

### 3.1 功能说明

AI 调参是核心功能，根据用户输入的业务背景和目标，智能分析并生成驱动因子调整方案。

> 需先导入或创建指标模型才能使用此功能

### 3.2 操作步骤

**步骤 1：描述业务背景**

在文本框中输入业务场景和目标，支持自然语言描述。

**步骤 2：因子匹配检测（实时）**

输入时系统自动检测已匹配模型因子和未匹配指标。

**步骤 3：上传经营计划文档（可选）**

支持格式：PDF、Word、Excel、TXT、MD

**步骤 4：选择场景和知识库（可选）**

- 选择场景：点击按钮打开场景选择器
- 选择知识库：点击按钮打开知识库

**步骤 5：开始智能分析**

解析用户输入，规则引擎匹配，知识库检索，综合生成方案。

**步骤 6：查看分析结果**

- AI 理解摘要：业务背景总结、目标列表
- 驱动因子分析表
- 知识库命中：显示相似历史案例
- 并集决策结果：Top 3 推荐调整因子

### 3.3 特殊约束语法

| 类型 | 示例 | 说明 |
|------|------|------|
| 增加 | 毛利率增加 5 个百分点 | 指定增幅 |
| 降低 | 管理费用降低 10% | 指定降幅 |
| 控制 | 管理费用控制在 100 万以内 | 设置上限 |
| 允许 | 销售费用允许超出 20% | 允许突破限制 |
| 必须 | 净利润必须达到 500 万 | 强制目标 |
| 范围 | 销售费用在+-10% 范围内调整 | 限定调整范围 |

---

## 4. 知识库

### 4.1 功能说明

知识库用于存储和检索历史调参案例，支持多行业、多领域的经验积累和复用。

### 4.2 核心功能

**文档上传**
支持格式：TXT、Word、PDF、Excel、MD

**语义检索**
在搜索框输入关键词，系统自动进行语义相似度检索，返回最相关的案例。

**案例管理**
- 编辑案例：点击案例右侧的「编辑」按钮
- 删除案例：点击案例右侧的「删除」按钮

### 4.3 最佳实践

- **及时沉淀**：每次调参后保存有效方案
- **规范命名**：标题清晰，便于检索
- **分类管理**：按行业、场景分类

---

## 5. 场景选择

### 5.1 内置场景

| 场景 | 适用场景 | 说明 |
|------|----------|------|
| 财务场景 | 成本优化、利润提升、收入增长 | 财务指标调参 |
| HR 人力场景 | 招聘优化、人力成本控制、人效提升 | 人力资源调参 |
| 生产场景 | 产能提升、良率优化、生产计划 | 生产制造调参 |
| 通用场景 | 跨部门综合优化 | 默认场景 |

### 5.2 操作步骤

**选择场景**
1. 点击「场景选择」按钮
2. 勾选适用的场景模板（支持多选）
3. 系统会自动应用到 AI 调参

**自定义场景**
1. 点击「新建模板」按钮
2. 填写模板信息：名称、描述、关键词、System Prompt
3. 点击「保存」

---

## 6. 规则管理

### 6.1 功能说明

规则管理用于配置约束映射规则，将用户自然语言转换为结构化约束条件。

### 6.2 单位管理

系统内置以下单位：

| 单位 | 类型 | 关键词 | 倍数 |
|------|------|--------|------|
| 万 | absolute | 万，万元 | 10000 |
| 亿 | absolute | 亿，亿元 | 100000000 |
| 元 | absolute | 元，块 | 1 |
| 百分比 | ratio | %，百分之 | 0.01 |
| 百分点 | ratio | 个百分点，个点 | 0.01 |

---

## 7. 别名管理

### 7.1 功能说明

别名管理用于配置因子别名映射，解决用户输入与模型因子名称不一致的问题。

### 7.2 别名配置

**添加别名**
1. 点击「添加别名」按钮
2. 填写标准名称、别名列表（逗号分隔）、启用状态
3. 点击「保存」

### 7.3 后缀管理

后缀用于用户输入时的智能分词识别。

系统内置后缀：费用、成本、收入、利润、利率、率、额

---

## 8. 常见问题

### 8.1 AI 连接问题

**Q: 测试连接失败，提示「网络错误」**
检查 API 地址、API 密钥、网络状态、防火墙设置。

**Q: 响应超时**
尝试选择更快的模型或减少最大 Token 数。

### 8.2 约束解析问题

**Q: 约束解析结果不正确**
尝试使用更明确的表达，用逗号分隔不同约束。

### 8.3 知识库问题

**Q: 上传文档后解析失败**
检查文件格式、文件是否损坏、文件内容是否清晰。

---

**文档结束**
`;

// 简化的 Markdown 转 HTML
function parseMarkdown(md) {
  const lines = md.split('\n');
  let html = '';
  let inCodeBlock = false;
  let inTable = false;
  let tableRows = [];

  function closeTable() {
    if (inTable && tableRows.length > 0) {
      html += '<table class="md-table">';
      html += '<thead><tr>' + tableRows[0].map(c => '<th>' + inlineFormat(c) + '</th>').join('') + '</tr></thead>';
      if (tableRows.length > 1) {
        html += '<tbody>' + tableRows.slice(1).map(row =>
          '<tr>' + row.map(c => '<td>' + inlineFormat(c) + '</td>').join('') + '</tr>'
        ).join('') + '</tbody>';
      }
      html += '</table>';
      tableRows = [];
      inTable = false;
    }
  }

  for (const line of lines) {
    if (line.startsWith('```')) {
      closeTable();
      if (inCodeBlock) {
        html += '</pre></code></div>';
        inCodeBlock = false;
      } else {
        html += '<div class="md-code-block"><pre><code>';
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      html += escapeHtml(line) + '\n';
      continue;
    }

    if (!line.trim()) {
      closeTable();
      continue;
    }

    if (line.trim() === '---') {
      closeTable();
      html += '<hr class="md-divider" />';
      continue;
    }

    const hMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (hMatch) {
      closeTable();
      const level = hMatch[1].length;
      html += '<h' + level + ' class="md-h' + level + '">' + inlineFormat(hMatch[2]) + '</h' + level + '>';
      continue;
    }

    if (line.startsWith('|')) {
      if (line.match(/^\|[-:| ]+\|$/)) continue;
      const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());
      if (cells.length > 0) {
        if (!inTable) { inTable = true; tableRows = []; }
        tableRows.push(cells);
      }
      continue;
    }

    closeTable();

    if (line.startsWith('> ')) {
      html += '<blockquote class="md-blockquote">' + inlineFormat(line.slice(2)) + '</blockquote>';
      continue;
    }

    if (line.match(/^[-*] /)) {
      html += '<div class="md-li">&#8226; ' + inlineFormat(line.slice(2)) + '</div>';
      continue;
    }

    const olMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (olMatch) {
      html += '<div class="md-li">' + olMatch[1] + '. ' + inlineFormat(olMatch[2]) + '</div>';
      continue;
    }

    html += '<p class="md-p">' + inlineFormat(line) + '</p>';
  }

  closeTable();
  return html;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inlineFormat(text) {
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return text;
}

// 悬浮可拖拽帮助窗口
const HelpModal = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState('manual');
  const [position, setPosition] = useState({ x: 100, y: 80 });
  const [size, setSize] = useState({ width: 700, height: 500 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isMinimized, setIsMinimized] = useState(false);
  const headerRef = useRef(null);

  const manualHtml = useMemo(() => parseMarkdown(MANUAL_MD), []);
  const aiHtml = useMemo(() => parseMarkdown(AI_DECISION_MD), []);

  const handleMouseDown = useCallback((e) => {
    if (e.target.closest('.no-drag')) return;
    setIsDragging(true);
    setDragOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
    e.preventDefault();
  }, [position]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    const newX = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragOffset.x));
    const newY = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragOffset.y));
    setPosition({ x: newX, y: newY });
  }, [isDragging, dragOffset]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 绑定到 window
  React.useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // 最小化时的小窗口
  if (isMinimized) {
    return (
      <div
        className="fixed z-[200] cursor-move"
        style={{ left: position.x, top: position.y }}
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white px-4 py-2 rounded-lg shadow-lg cursor-pointer hover:shadow-xl transition-shadow"
          onClick={() => setIsMinimized(false)}
        >
          <span className="text-sm">&#128214;</span>
          <span className="text-sm font-medium">帮助文档</span>
          <button className="no-drag ml-2 hover:bg-white/20 rounded px-1.5" onClick={(e) => { e.stopPropagation(); onClose(); }}>✕</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed z-[200] shadow-2xl rounded-xl overflow-hidden bg-white border border-gray-200"
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        boxShadow: isDragging ? '0 20px 60px rgba(0,0,0,0.3)' : '0 10px 40px rgba(0,0,0,0.15)',
        transition: isDragging ? 'none' : 'box-shadow 0.2s',
      }}
    >
      {/* 标题栏 - 可拖拽 */}
      <div
        ref={headerRef}
        className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white cursor-move select-none"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <span>&#128214;</span>
          <span className="text-sm font-medium">帮助文档</span>
          <span className="text-xs opacity-70 ml-1">（拖拽标题栏移动窗口）</span>
        </div>
        <div className="flex items-center gap-1 no-drag">
          <button
            onClick={() => setIsMinimized(true)}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/20 transition-colors"
            title="最小化"
          >
            <svg width="12" height="12" viewBox="0 0 12 12"><rect y="5" width="12" height="2" fill="white"/></svg>
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/20 transition-colors"
            title="关闭"
          >
            &#10005;
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b px-3 gap-0 bg-white flex-shrink-0 no-drag">
        <button
          onClick={() => setActiveTab('manual')}
          className={`px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'manual'
              ? 'text-blue-600 border-b-2 border-blue-500'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          &#128213; AIDM 操作手册
        </button>
        <button
          onClick={() => setActiveTab('ai')}
          className={`px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'ai'
              ? 'text-purple-600 border-b-2 border-purple-500'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          &#129302; AI 决策模块
        </button>
      </div>

      {/* Content */}
      <div className="overflow-y-auto px-6 py-4 help-content" style={{ height: size.height - 80 }}>
        {activeTab === 'manual' ? (
          <div dangerouslySetInnerHTML={{ __html: manualHtml }} />
        ) : (
          <div dangerouslySetInnerHTML={{ __html: aiHtml }} />
        )}
      </div>

      <style>{`
        .help-content {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
          color: #374151;
          font-size: 13px;
          line-height: 1.7;
        }
        .help-content h1 {
          font-size: 18px;
          font-weight: 700;
          color: #111827;
          margin: 0 0 12px 0;
          padding-bottom: 8px;
          border-bottom: 2px solid #e5e7eb;
        }
        .help-content h2 {
          font-size: 15px;
          font-weight: 600;
          color: #1f2937;
          margin: 18px 0 8px 0;
        }
        .help-content h3 {
          font-size: 14px;
          font-weight: 600;
          color: #374151;
          margin: 12px 0 6px 0;
        }
        .help-content p {
          margin: 4px 0;
        }
        .help-content .md-table {
          width: 100%;
          border-collapse: collapse;
          margin: 8px 0 14px 0;
          font-size: 12px;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
          overflow: hidden;
        }
        .help-content .md-table thead th {
          background: #f0f4ff;
          font-weight: 600;
          text-align: left;
          padding: 6px 10px;
          border-bottom: 2px solid #c7d2fe;
          color: #1e40af;
        }
        .help-content .md-table tbody td {
          padding: 5px 10px;
          border-bottom: 1px solid #f3f4f6;
          color: #4b5563;
        }
        .help-content .md-table tbody tr:hover {
          background: #f9fafb;
        }
        .help-content blockquote {
          border-left: 3px solid #818cf8;
          margin: 8px 0;
          padding: 6px 10px;
          background: #f5f3ff;
          border-radius: 0 4px 4px 0;
          color: #5b21b6;
          font-size: 12px;
        }
        .help-content pre {
          background: #1e293b;
          color: #e2e8f0;
          border-radius: 4px;
          padding: 8px 12px;
          overflow-x: auto;
          font-size: 12px;
          font-family: Consolas, monospace;
        }
        .help-content .md-inline-code {
          background: #f1f5f9;
          padding: 1px 4px;
          border-radius: 2px;
          font-size: 11px;
          color: #dc2626;
          font-family: Consolas, monospace;
        }
        .help-content .md-divider {
          border: none;
          border-top: 1px solid #e5e7eb;
          margin: 14px 0;
        }
        .help-content .md-li {
          margin: 3px 0 3px 14px;
          padding-left: 2px;
          font-size: 13px;
        }
        .help-content strong {
          color: #111827;
        }
      `}</style>
    </div>
  );
};

export default HelpModal;