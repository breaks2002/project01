import re

with open(r'E:/MY AI/ValQ/src/components/DataPanel/AITuningPanel.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 找到旧的目标识别代码
old_start = '// 1. 从业务背景中提取目标指标和目标值'
old_end = '];'

# 找到起始位置
start_idx = content.find(old_start)
if start_idx == -1:
    print('未找到起始标记')
    exit(1)

# 找到结束位置（第一个 ]; 之后）
search_start = start_idx + len(old_start)
end_idx = content.find(old_end, search_start)
if end_idx == -1:
    print('未找到结束标记')
    exit(1)
end_idx += len(old_end)  # 包含 ];

# 提取旧代码用于确认
old_code = content[start_idx:end_idx]
print('找到旧代码，长度:', len(old_code))

# 新代码
new_code = '''    // 1. 从业务背景中提取目标指标和目标值（动态识别 + 兜底）
    // 首先从模型中提取所有计算指标名称，用于动态匹配
    const metricNames = computedNodes.map(n => n.name).filter(Boolean);
    const uniqueMetricNames = [...new Set(metricNames)];

    // 构建动态正则表达式（基于模型中的实际指标名称）
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\\\\\$&');
    const metricPattern = uniqueMetricNames.length > 0
      ? '(' + uniqueMetricNames.map(escapeRegex).join('|') + ')'
      : '(净利润 | 营业利润 | 利润总额 | 毛利 | 净利 | 利润 | 收入 | 成本 | 费用)'; // 兜底模式

    const targetPatterns = [
      // 模式 1: 指标名 + 达到 + 数字 + 万（允许左右/以上/以下等后缀）
      new RegExp(metricPattern + '.*?达到.*?([\\\\d.]+)\\\\s*万', 'i'),
      // 模式 2: 指标名 + 目标 + 数字 + 万
      new RegExp(metricPattern + '.*?目标.*?([\\\\d.]+)\\\\s*万', 'i'),
      // 模式 3: 目标 + 指标名 + 数字 + 万
      new RegExp('目标.*?' + metricPattern + '.*?([\\\\d.]+)\\\\s*万', 'i'),
      // 模式 4: 实现 + 指标名 + 数字 + 万
      new RegExp('实现.*?' + metricPattern + '.*?([\\\\d.]+)\\\\s*万', 'i'),
      // 模式 5: 数字 + 万 + 指标名（如\"达到 350 万净利润\"）
      new RegExp('([\\\\d.]+)\\\\s*万.*?' + metricPattern, 'i'),
      // 模式 6: 指标名 + 达到 + 数字（不要求万字，允许\"350 左右\"）
      new RegExp(metricPattern + '.*?达到.*?([\\\\d.]+)', 'i'),
      // 模式 7: 指标名 + 目标 + 数字
      new RegExp(metricPattern + '.*?目标.*?([\\\\d.]+)', 'i'),
    ];'''

# 替换
new_content = content[:start_idx] + new_code + content[end_idx:]

with open(r'E:/MY AI/ValQ/src/components/DataPanel/AITuningPanel.jsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('修复完成！目标识别现在会从模型中动态读取指标名称')
