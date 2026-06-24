/**
 * CSV 解析工具
 * 支持导入利润表等表格数据
 */

import { FormulaParser } from '../engine/FormulaParser';

/**
 * 辅助函数：获取列值，兼容 BOM 字符和空格的列名
 */
export function getColumn(row, colName) {
  if (row[colName] !== undefined) return row[colName];
  const cleanName = colName.replace(/^﻿/, '').trim();
  const normalizedName = cleanName.replace(/\s+/g, ''); // 去掉所有空格用于比较
  for (const k of Object.keys(row)) {
    const cleanKey = k.replace(/^﻿/, '').trim();
    const normalizedKey = cleanKey.replace(/\s+/g, ''); // 去掉所有空格用于比较
    if (normalizedKey === normalizedName) return row[k];
  }
  return undefined;
}

/**
 * 辅助函数：解析数值，兼容中文逗号
 * @param {string|number} value - 要解析的值
 * @returns {number|null} 解析后的数值
 */
export function parseNumericValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  // 将中文逗号替换为英文逗号，然后解析
  const cleaned = String(value).replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * 解析 CSV 字符串，支持带引号的字段和字段内的逗号
 * @param {string} csvText - CSV 文本内容
 * @returns {Array<Object>} 解析后的对象数组
 */
export function parseCSV(csvText) {
  if (!csvText || csvText.trim() === '') return [];

  /**
   * 解析单个 CSV 行，处理带引号的字段
   * 支持英文逗号 (,) 和中文逗号 (，) 作为分隔符
   */
  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          // 两个引号转义为一个引号
          current += '"';
          i++;
        } else if (char === '"') {
          // 结束引号
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          // 开始引号
          inQuotes = true;
        } else if (char === ',' || char === '，') {
          // 字段分隔符（支持英文逗号和中文逗号）
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
    }
    // 添加最后一个字段
    result.push(current.trim());
    return result;
  }

  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length === 0) return [];

  // 解析表头
  const headers = parseCSVLine(lines[0]);
  console.log('[parseCSV] 表头:', headers);

  // 解析数据行
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((header, index) => {
      // 清理列名（去除 BOM 和空格）
      const cleanHeader = header.replace(/^﻿/, '').trim().replace(/^"|"$/g, '');
      let value = values[index] || '';
      // 清理值（去除引号）
      value = value.replace(/^"|"$/g, '').trim();
      // 公式列保持字符串类型，其他列尝试转换为数字
      if (cleanHeader === '公式') {
        row[cleanHeader] = value;
      } else {
        const num = parseFloat(value);
        row[cleanHeader] = !isNaN(num) && value !== '' ? num : value;
      }
    });
    if (Object.values(row).some(v => v !== '')) {
      result.push(row);
    }
  }

  return result;
}

// ========== 公式表检测与校验 ==========

/**
 * 清理列名，去除 BOM 字符和空格
 */
const cleanHeader = (header) => {
  if (!header) return '';
  return header.replace(/^﻿/, '').trim();
};

/**
 * 检查 headers 是否包含指定列（容错处理 BOM 和空格）
 */
const hasColumn = (headers, colName) => {
  return headers.some(h => cleanHeader(h) === colName);
};

/**
 * 检测是否为公式表
 */
export function isFormulaTable(csvData) {
  if (csvData.length === 0) return false;
  const headers = Object.keys(csvData[0]);
  return hasColumn(headers, '公式') || hasColumn(headers, '节点类型');
}

/**
 * 检测是否为宽表格式（新格式：AC/FC/BU 属性行）
 */
export function isWideTable(csvData) {
  if (csvData.length === 0) return false;
  const headers = Object.keys(csvData[0]);
  return (hasColumn(headers, '指标 ID') || hasColumn(headers, '指标ID')) && hasColumn(headers, '指标名称') && hasColumn(headers, '属性');
}

/**
 * 校验公式表数据
 * @param {Array<Object>} formulaData - 公式表数据
 * @param {Array<Object>} dataTableData - 数据表数据（可选，用于校验ID匹配）
 * @returns {Object} 校验结果 { valid: boolean, errors: Array, warnings: Array }
 */
export function validateFormulaTable(formulaData, dataTableData = null) {
  const errors = [];
  const warnings = [];
  const allIds = new Set();
  const dataIds = dataTableData ? new Set(dataTableData.map(row => getColumn(row, '指标ID') || getColumn(row, '指标名称'))) : null;

  formulaData.forEach((row, index) => {
    const rowNum = index + 2;
    const nodeId = getColumn(row, '指标ID') || getColumn(row, '指标名称');
    const nodeName = getColumn(row, '指标名称') || getColumn(row, '指标ID');
    const nodeType = getColumn(row, '节点类型');
    const formula = getColumn(row, '公式');

    // 检查必填字段
    if (!nodeId && !nodeName) {
      errors.push("第 " + rowNum + " 行：缺少指标 ID 或指标名称");
      return;
    }

    // 检查 ID 重复
    if (nodeId) {
      if (allIds.has(nodeId)) {
        errors.push("第 " + rowNum + " 行：指标 ID \"" + nodeId + "\" 重复");
      }
      allIds.add(nodeId);
    }

    // 检查节点类型
    if (nodeType && !['driver', 'computed'].includes(nodeType)) {
      errors.push("第 " + rowNum + " 行：节点类型 \"" + nodeType + "\" 无效，应为 driver 或 computed");
    }

    // 校验计算公式
    if (nodeType === 'computed' || (formula && formula.trim())) {
      if (!formula || formula.trim() === '') {
        errors.push("第 " + rowNum + " 行：计算指标 \"" + nodeName + "\" 缺少公式");
      } else {
        try {
          const deps = FormulaParser.extractDependencies(formula, Array.from(allIds));
        } catch (e) {
          errors.push("第 " + rowNum + " 行：公式 \"" + formula + "\" 解析失败 - " + e.message);
        }
      }
    }

    // 如果有数据表，检查 ID 匹配
    if (dataIds && nodeId && !dataIds.has(nodeId)) {
      warnings.push("第 " + rowNum + " 行：指标 ID \"" + nodeId + "\" 在数据表中不存在");
    }

    // 校验数值类型
    const minValue = getColumn(row, '最小值');
    const maxValue = getColumn(row, '最大值');
    if (minValue !== undefined && minValue !== '' && isNaN(parseFloat(minValue))) {
      errors.push("第 " + rowNum + " 行：最小值 \"" + minValue + "\" 不是有效数字");
    }
    if (maxValue !== undefined && maxValue !== '' && isNaN(parseFloat(maxValue))) {
      errors.push("第 " + rowNum + " 行：最大值 \"" + maxValue + "\" 不是有效数字");
    }
    // 校验汇总方式
    const aggType = getColumn(row, '汇总方式');
    if (aggType !== undefined && aggType !== '') {
      const validAggTypes = ['sum', 'average', 'avg', 'min', 'max', 'count', 'count_nonzero', 'distinct'];
      const normalizedAggType = String(aggType).toLowerCase();
      if (!validAggTypes.includes(normalizedAggType)) {
        warnings.push("第 " + rowNum + " 行：汇总方式 \"" + aggType + "\" 不常见，有效值为：sum, average, min, max, count, count_nonzero, distinct");
      }
    }
    // 校验比率型指标
    const ratioIndicator = getColumn(row, '比率型指标');
    if (ratioIndicator !== undefined && ratioIndicator !== '') {
      const ratioVal = String(ratioIndicator).toLowerCase();
      if (!['true', 'false', '1', '0', '是', '否', ''].includes(ratioVal)) {
        warnings.push("第 " + rowNum + " 行：比率型指标 \"" + ratioIndicator + "\" 应为 true/false 或 1/0");
      }
    }
  });

  // 第二轮：检查公式中引用的节点是否存在
  const idToRow = {};
  formulaData.forEach((row, index) => {
    const nodeId = getColumn(row, '指标ID') || getColumn(row, '指标名称');
    if (nodeId) {
      idToRow[nodeId] = { row, index };
    }
  });

  formulaData.forEach((row, index) => {
    const formula = getColumn(row, '公式');
    const nodeName = getColumn(row, '指标名称') || getColumn(row, '指标ID');
    if (formula && formula.trim()) {
      try {
        const deps = FormulaParser.extractDependencies(formula, Object.keys(idToRow));
        deps.forEach(depId => {
          if (!idToRow[depId]) {
            errors.push(`第 ${index + 2} 行：公式中引用的节点 "${depId}" 不存在（在 "${nodeName}" 的公式中）`);
          }
        });
      } catch (e) {
        // 已经在前面检查过了
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// ========== 新格式横表解析（支持 AC/FC/BU 属性） ==========

/**
 * 时间格式定义
 */
const TIME_FORMATS = {
  year:   { pattern: /^\d{4}$/,              name: '年度', example: '2026' },
  quarter:{ pattern: /^\d{4}Q[1-4]$/,        name: '季度', example: '2026Q1' },
  month:  { pattern: /^\d{6}$/,              name: '月度', example: '202601' },
  week:   { pattern: /^\d{4}WK\d{2}$/,       name: '周度', example: '2026WK01' },
  day:    { pattern: /^\d{8}$/,              name: '日报', example: '20260101' }
};

/**
 * 检测时间字符串格式
 * @param {string} timeStr - 时间字符串
 * @returns {string|null} 'year'|'quarter'|'month'|'week'|'day' 或 null
 */
export function detectTimeFormat(timeStr) {
  if (!timeStr) return null;
  for (const [type, config] of Object.entries(TIME_FORMATS)) {
    if (config.pattern.test(timeStr)) {
      return type;
    }
  }
  return null;
}

/**
 * 校验横表格式数据（新格式：AC/FC/BU 属性行）
 * @param {Array<Object>} wideData - 横表 CSV 数据
 * @param {string} selectedTimeType - 选择的时间维度（可选，自动检测）
 * @returns {Object} 校验结果 { valid: boolean, errors: Array, warnings: Array, timeType: string }
 */
export function validateWideTable(wideData, selectedTimeType = null) {
  const errors = [];
  const warnings = [];

  if (!wideData || wideData.length === 0) {
    errors.push('数据为空');
    return { valid: false, errors, warnings, timeType: null };
  }

  const headers = Object.keys(wideData[0]);

  // 1. 必需列检查
  const requiredColumns = ['指标名称', '属性'];
  const missingColumns = requiredColumns.filter(col => !headers.includes(col));
  const hasIdColumn = headers.includes('指标 ID') || headers.includes('指标ID');
  if (!hasIdColumn) {
    missingColumns.unshift('指标 ID');
  }
  if (missingColumns.length > 0) {
    errors.push(`缺少必需列：${missingColumns.join(', ')}（需要：指标 ID、指标名称、属性）`);
    return { valid: false, errors, warnings, timeType: null };
  }

  // 2. 提取时间列（排除必需列）
  const timeColumns = headers.filter(h => !requiredColumns.includes(h));
  if (timeColumns.length === 0) {
    errors.push('未找到时间列（至少需要 1 期数据）');
    return { valid: false, errors, warnings, timeType: null };
  }

  // 3. 检测时间格式
  let detectedTimeType = selectedTimeType;
  if (!detectedTimeType) {
    const formatCounts = {};
    timeColumns.forEach(col => {
      const fmt = detectTimeFormat(col);
      if (fmt) {
        formatCounts[fmt] = (formatCounts[fmt] || 0) + 1;
      }
    });
    detectedTimeType = Object.entries(formatCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'month';
  }

  // 4. 校验时间列格式
  const invalidTimeCols = timeColumns.filter(col => {
    const fmt = detectTimeFormat(col);
    return fmt && fmt !== detectedTimeType;
  });
  if (invalidTimeCols.length > 0) {
    warnings.push(`以下时间列格式与选择的${TIME_FORMATS[detectedTimeType]?.name}维度不一致：${invalidTimeCols.join(', ')}（已自动过滤）`);
  }

  // 5. 校验属性值（必须是 AC/FC/BU）
  const attributes = new Set(wideData.map(row => getColumn(row, '属性')));
  const invalidAttrs = [...attributes].filter(a => !['AC', 'FC', 'BU'].includes(a));
  if (invalidAttrs.length > 0) {
    errors.push(`无效的属性值：${invalidAttrs.join(', ')}（应为 AC/FC/BU）`);
  }

  // 6. 校验指标完整性（每个指标应该有 AC/FC/BU 三行）
  const idRows = {};
  wideData.forEach(row => {
    const id = getColumn(row, '指标ID');
    if (!id) return;
    if (!idRows[id]) {
      idRows[id] = new Set();
    }
    idRows[id].add(getColumn(row, '属性'));
  });

  const incompleteIndicators = [];
  Object.entries(idRows).forEach(([id, attrs]) => {
    if (!attrs.has('AC') || !attrs.has('FC') || !attrs.has('BU')) {
      incompleteIndicators.push(id);
    }
  });
  if (incompleteIndicators.length > 0) {
    warnings.push(`以下指标缺少 AC/FC/BU 中的某些属性：${incompleteIndicators.join(', ')}（缺失数据将填充为 NULL）`);
  }

  // 7. 校验数值数据
  let nonNumericCount = 0;
  wideData.forEach(row => {
    timeColumns.forEach(col => {
      const val = row[col];
      if (val !== undefined && val !== null && val !== '' && val !== '-' && isNaN(parseFloat(val))) {
        nonNumericCount++;
      }
    });
  });
  if (nonNumericCount > 0) {
    warnings.push(`发现 ${nonNumericCount} 个非数值数据单元格（将填充为 NULL）`);
  }

  const valid = errors.length === 0;
  return {
    valid,
    errors,
    warnings,
    timeType: detectedTimeType,
    periodCount: timeColumns.length
  };
}

/**
 * 解析横表格式 CSV 并转换为节点（新格式：AC/FC/BU 属性行）
 * @param {Array<Object>} wideData - 横表 CSV 数据
 * @param {string} selectedTimeType - 选择的时间维度（可选，自动检测）
 * @returns {{ nodes: Object, timeDimension: Object, summary: Object, validation: Object }}
 */
export function parseWideTableToNodes(wideData, selectedTimeType = null) {
  // 1. 校验
  const validation = validateWideTable(wideData, selectedTimeType);
  if (!validation.valid) {
    return {
      nodes: {},
      timeDimension: null,
      summary: null,
      validation
    };
  }

  const headers = Object.keys(wideData[0]);
  const requiredColumns = ['指标 ID', '指标名称', '属性'];
  const timeColumns = headers.filter(h => !requiredColumns.includes(h));

  // 过滤掉格式不一致的时间列
  const validTimeColumns = timeColumns.filter(col => {
    const fmt = detectTimeFormat(col);
    return !fmt || fmt === validation.timeType;
  });

  // 2. 按指标 ID 分组数据
  const dataById = {};
  const timeSet = new Set();

  wideData.forEach(row => {
    const rawId = getColumn(row, '指标ID');
    const name = getColumn(row, '指标名称');
    const attr = getColumn(row, '属性');
    if (!rawId) return;

    // 规范化 ID
    const id = rawId.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_一-龥]/g, '');

    if (!dataById[id]) {
      dataById[id] = {
        name,
        originalTimeData: {},
        times: new Set()
      };
    }

    // 收集时间数据 - 新格式：key 为 `${time}-${attribute}`
    validTimeColumns.forEach(time => {
      const value = row[time];
      if (value !== undefined && value !== null && value !== '' && value !== '-') {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          dataById[id].originalTimeData[`${time}-${attr}`] = numValue;
          timeSet.add(time);
          dataById[id].times.add(time);
        }
      }
    });
  });

  // 3. 计算时间维度
  const sortedTimeColumns = Array.from(timeSet).sort();
  const timeDimension = {
    type: validation.timeType,
    format: TIME_FORMATS[validation.timeType]?.example || null,
    periodCount: sortedTimeColumns.length,
    isRolling: false,
    range: {
      start: sortedTimeColumns[0],
      end: sortedTimeColumns[sortedTimeColumns.length - 1]
    }
  };

  // 检测是否滚动周期（跨年）
  if (sortedTimeColumns.length > 1) {
    const firstYear = sortedTimeColumns[0].slice(0, 4);
    const lastYear = sortedTimeColumns[sortedTimeColumns.length - 1].slice(0, 4);
    timeDimension.isRolling = firstYear !== lastYear;
  }

  // 4. 创建节点
  const nodes = {};
  Object.entries(dataById).forEach(([id, data], index) => {
    const originalTimeData = data.originalTimeData;

    // 计算汇总统计
    let actualTotal = 0;
    let actualCount = 0;
    let forecastTotal = 0;
    let forecastCount = 0;
    let budgetTotal = 0;
    let budgetCount = 0;

    Object.entries(originalTimeData).forEach(([key, value]) => {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return;

      const parts = key.split('-');
      if (parts.length !== 2) return;
      const [time, attr] = parts;

      if (!validTimeColumns.includes(time)) return;

      if (attr === 'AC') {
        actualTotal += numValue;
        actualCount++;
      } else if (attr === 'FC') {
        forecastTotal += numValue;
        forecastCount++;
      } else if (attr === 'BU') {
        budgetTotal += numValue;
        budgetCount++;
      }
    });

    const actualPlusForecast = actualTotal + forecastTotal;

    // timeData 只包含 AC 和 FC，不包括 BU（BU 只保留在 originalTimeData 中用于目标值计算）
    const timeData = {};
    Object.entries(originalTimeData).forEach(([key, value]) => {
      const parts = key.split('-');
      if (parts.length === 2) {
        const attr = parts[1];
        if (attr === 'AC' || attr === 'FC') {
          timeData[key] = value;
        }
      }
    });

    // 根据节点在数据中的顺序自动分配层级
    let autoLevel;
    if (index < 4) {
      autoLevel = `1.${index + 1}`;
    } else {
      autoLevel = `2.${index - 3}`;
    }

    const node = {
      id,
      name: data.name,
      type: 'driver',
      level: autoLevel,
      unit: '',
      format: '#,##0',
      value: actualPlusForecast,
      baseline: budgetTotal || actualPlusForecast,
      targetValue: budgetTotal,
      range: {
        min: actualTotal > 0 ? actualTotal : 0,
        max: actualTotal > 0 && actualCount > 0 ? actualTotal * 12 / actualCount : Math.max(actualPlusForecast * 2, 100)
      },
      position: {
        x: 100 + (index % 3) * 600,
        y: 100 + Math.floor(index / 3) * 250
      },
      size: { width: 520, height: 'auto' },
      direction: 'auto',
      originalTimeData: JSON.parse(JSON.stringify(originalTimeData)),
      timeData: JSON.parse(JSON.stringify(timeData)),
      timeDimension: { ...timeDimension },
      summary: {
        actualTotal,
        actualPeriods: actualCount > 0 ? `${sortedTimeColumns[0]}-${sortedTimeColumns[actualCount - 1]}` : '',
        actualCount,
        forecastTotal,
        forecastPeriods: forecastCount > 0 ? `${sortedTimeColumns[actualCount]}-${sortedTimeColumns[sortedTimeColumns.length - 1]}` : '',
        forecastCount,
        budgetTotal,
        budgetCount,
        actualPlusForecast
      },
      dependsOn: []
    };

    nodes[id] = node;
  });

  const summary = {
    indicatorCount: Object.keys(nodes).length,
    periodCount: timeDimension.periodCount,
    isRolling: timeDimension.isRolling
  };

  return { nodes, timeDimension, summary, validation };
}
