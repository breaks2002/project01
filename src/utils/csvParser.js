/**
 * CSV 解析工具
 * 支持导入利润表等表格数据
 */

import { FormulaParser } from '../engine/FormulaParser';

/**
 * 解析 CSV 字符串，支持带引号的字段和字段内的逗号
 * @param {string} csvText - CSV 文本内容
 * @returns {Array<Object>} 解析后的对象数组
 */
export function parseCSV(csvText) {
  if (!csvText || csvText.trim() === '') return [];

  /**
   * 解析单个 CSV 行，处理带引号的字段
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
        } else if (char === ',') {
          // 字段分隔符
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

  // 解析数据行
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((header, index) => {
      let value = values[index] || '';
      // 尝试转换为数字
      const num = parseFloat(value);
      row[header] = !isNaN(num) && value !== '' ? num : value;
    });
    if (Object.values(row).some(v => v !== '')) {
      result.push(row);
    }
  }

  return result;
}

/**
 * 将 CSV 数据转换为 VDT 节点
 * @param {Array<Object>} csvData - 解析后的 CSV 数据
 * @param {string} nameColumn - 名称列（如"指标名称"）
 * @param {Array<string>} valueColumns - 值列（如["1月", "2月"...]）
 * @returns {Object} VDT 节点对象
 */
export function csvToNodes(csvData, nameColumn = '指标名称', valueColumns = []) {
  const nodes = {};

  csvData.forEach((row, index) => {
    const name = row[nameColumn] || `指标_${index + 1}`;
    // 优先使用指标ID列，如果没有则从名称生成
    let id = row['指标ID'];
    if (!id) {
      id = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_\u4e00-\u9fa5]/g, '');
    }

    // 收集时间序列数据 - 保存所有列数据
    const timeData = {};
    valueColumns.forEach(col => {
      if (row[col] !== undefined && row[col] !== null && row[col] !== '') {
        timeData[col] = row[col];
      }
    });

    // 计算实际+预测的汇总作为当前值
    let currentValue = 0;
    let baselineValue = 0;
    let actualTotal = 0;
    let actualMonths = 0;

    // 找出所有"实际"和"预测"列并计算汇总
    const actualColumns = valueColumns.filter(col => col.includes('实际'));
    const forecastColumns = valueColumns.filter(col => col.includes('预测'));
    const targetColumns = valueColumns.filter(col => col.includes('目标'));

    // 计算实际合计
    actualColumns.forEach(col => {
      const val = row[col];
      if (val !== undefined && val !== null && val !== '' && !isNaN(val)) {
        actualTotal += val;
        actualMonths++;
        currentValue += val;
      }
    });
    // 计算预测合计
    forecastColumns.forEach(col => {
      const val = row[col];
      if (val !== undefined && val !== null && val !== '' && !isNaN(val)) {
        currentValue += val;
      }
    });

    // 基准值用目标汇总
    targetColumns.forEach(col => {
      const val = row[col];
      if (val !== undefined && val !== null && val !== '' && !isNaN(val)) {
        baselineValue += val;
      }
    });

    // 如果没有目标列，就用实际+预测作为基准
    if (baselineValue === 0 && currentValue !== 0) {
      baselineValue = currentValue;
    }

    // 如果都没有， fallback 到第一个数值列
    if (currentValue === 0) {
      const firstCol = valueColumns[0];
      if (firstCol && row[firstCol] !== undefined) {
        currentValue = row[firstCol] || 0;
        baselineValue = currentValue;
      }
    }

    // 计算 min 和 max
    let minVal, maxVal;
    if (actualTotal > 0 && actualMonths > 0) {
      // 最小值 = 实际数汇总
      minVal = actualTotal;
      // 最大值 = 实际数汇总 * 12 / 实际月份数
      maxVal = actualTotal * 12 / actualMonths;
    } else {
      minVal = 0;
      maxVal = Math.max(currentValue * 2, 100);
    }

    nodes[id] = {
      id: id,
      name: name,
      type: 'driver', // 默认为驱动因子
      unit: '',
      format: '#,##0',
      value: currentValue,
      baseline: baselineValue,
      range: {
        min: minVal,
        max: maxVal
      },
      position: {
        x: 100 + (index % 3) * 600,
        y: 100 + Math.floor(index / 3) * 250
      },
      size: { width: 520, height: 'auto' },
      direction: 'auto',
      timeData: timeData, // 保存完整时间序列数据
      dependsOn: []
    };
  });

  return nodes;
}

/**
 * 检测 CSV 的列结构
 * @param {Array<Object>} csvData - 解析后的 CSV 数据
 * @returns {Object} 检测结果
 */
export function detectCSVStructure(csvData) {
  if (csvData.length === 0) return null;

  const firstRow = csvData[0];
  const headers = Object.keys(firstRow);

  // 尝试找到名称列
  let nameColumn = headers.find(h =>
    h.includes('名称') || h.includes('指标') || h.includes('项目') || h.includes('科目')
  ) || headers[0];

  // 尝试找到数值列（看起来像月份的）
  const monthPatterns = ['月', 'M', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const valueColumns = headers.filter(h => {
    if (h === nameColumn) return false;
    return monthPatterns.some(p => h.includes(p)) || !isNaN(parseFloat(firstRow[h]));
  });

  return {
    nameColumn,
    valueColumns,
    allColumns: headers,
    sampleRow: firstRow
  };
}

// ========== 公式表 CSV 解析 ==========

/**
 * 检测是否为公式表
 */
export function isFormulaTable(csvData) {
  if (csvData.length === 0) return false;
  const headers = Object.keys(csvData[0]);
  return headers.includes('公式') || headers.includes('节点类型');
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
  const dataIds = dataTableData ? new Set(dataTableData.map(row => row['指标ID'] || row['指标名称'])) : null;

  formulaData.forEach((row, index) => {
    const rowNum = index + 2; // CSV行号（从2开始，因为表头是第1行）
    const nodeId = row['指标ID'] || row['指标名称'];
    const nodeName = row['指标名称'] || row['指标ID'];
    const nodeType = row['节点类型'];
    const formula = row['公式'];

    // 检查必填字段
    if (!nodeId && !nodeName) {
      errors.push(`第 ${rowNum} 行：缺少指标ID或指标名称`);
      return;
    }

    // 检查ID重复
    if (nodeId) {
      if (allIds.has(nodeId)) {
        errors.push(`第 ${rowNum} 行：指标ID "${nodeId}" 重复`);
      }
      allIds.add(nodeId);
    }

    // 检查节点类型
    if (nodeType && !['driver', 'computed'].includes(nodeType)) {
      errors.push(`第 ${rowNum} 行：节点类型 "${nodeType}" 无效，应为 driver 或 computed`);
    }

    // 校验计算公式
    if (nodeType === 'computed' || (formula && formula.trim())) {
      if (!formula || formula.trim() === '') {
        errors.push(`第 ${rowNum} 行：计算指标 "${nodeName || nodeId}" 缺少公式`);
      } else {
        // 尝试解析公式，检查语法
        try {
          // 提取依赖的节点ID，用于后续校验
          const deps = FormulaParser.extractDependencies(formula, Array.from(allIds));
          // 这里可以进一步校验依赖是否存在
        } catch (e) {
          errors.push(`第 ${rowNum} 行：公式 "${formula}" 解析失败 - ${e.message}`);
        }
      }
    }

    // 如果有数据表，检查ID匹配
    if (dataIds && nodeId && !dataIds.has(nodeId)) {
      warnings.push(`第 ${rowNum} 行：指标ID "${nodeId}" 在数据表中不存在`);
    }

    // 校验数值类型
    if (row['最小值'] !== undefined && row['最小值'] !== '' && isNaN(parseFloat(row['最小值']))) {
      errors.push(`第 ${rowNum} 行：最小值 "${row['最小值']}" 不是有效数字`);
    }
    if (row['最大值'] !== undefined && row['最大值'] !== '' && isNaN(parseFloat(row['最大值']))) {
      errors.push(`第 ${rowNum} 行：最大值 "${row['最大值']}" 不是有效数字`);
    }
    // 校验汇总方式
    if (row['汇总方式'] !== undefined && row['汇总方式'] !== '') {
      const validAggTypes = ['sum', 'average', 'avg', 'min', 'max', 'count', 'count_nonzero', 'distinct'];
      const aggType = String(row['汇总方式']).toLowerCase();
      if (!validAggTypes.includes(aggType)) {
        warnings.push(`第 ${rowNum} 行：汇总方式 "${row['汇总方式']}" 不常见，有效值为: sum, average, min, max, count, count_nonzero, distinct`);
      }
    }
    // 校验比率型指标
    if (row['比率型指标'] !== undefined && row['比率型指标'] !== '') {
      const ratioVal = String(row['比率型指标']).toLowerCase();
      if (!['true', 'false', '1', '0', '是', '否', ''].includes(ratioVal)) {
        warnings.push(`第 ${rowNum} 行：比率型指标 "${row['比率型指标']}" 应为 true/false 或 1/0`);
      }
    }
  });

  // 第二轮：检查公式中引用的节点是否存在
  const idToRow = {};
  formulaData.forEach((row, index) => {
    const nodeId = row['指标ID'] || row['指标名称'];
    if (nodeId) {
      idToRow[nodeId] = { row, index };
    }
  });

  formulaData.forEach((row, index) => {
    const formula = row['公式'];
    const nodeName = row['指标名称'] || row['指标ID'];
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

/**
 * 从 timeData 中计算实际数据的汇总和月份数
 */
function calculateActualStats(timeData) {
  if (!timeData) return { actualTotal: 0, actualMonths: 0 };

  let actualTotal = 0;
  let actualMonths = 0;

  Object.entries(timeData).forEach(([key, value]) => {
    if (key.includes('实际')) {
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        actualTotal += numValue;
        actualMonths++;
      }
    }
  });

  return { actualTotal, actualMonths };
}

/**
 * 将公式表 CSV 转换为节点，并与数据表合并
 * @param {Array<Object>} formulaData - 公式表数据
 * @param {Array<Object>} dataTableData - 数据表数据
 * @param {Object} existingNodes - 现有节点（用于追加模式）
 * @returns {Object} VDT 节点对象
 */
export function formulaTableToNodes(formulaData, dataTableData, existingNodes = {}) {
  const nodes = {};

  // 先用数据表创建基础节点
  if (dataTableData) {
    const dataNodes = csvToNodes(dataTableData, '指标名称', Object.keys(dataTableData[0]).filter(c => c !== '指标名称' && c !== '指标ID'));
    Object.assign(nodes, dataNodes);
  }

  // 用公式表更新节点属性
  formulaData.forEach((row, index) => {
    const nodeId = row['指标ID'] || row['指标名称'];
    if (!nodeId) return;

    // 规范化ID
    const id = nodeId.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_\u4e00-\u9fa5]/g, '');

    // 优先从 existingNodes 获取，然后从 dataTableData 节点获取，最后创建新节点
    let baseNode = existingNodes[id] || existingNodes[nodeId] || nodes[id] || nodes[nodeId] || {
      id: id,
      name: row['指标名称'] || nodeId,
      type: 'driver',
      unit: '',
      format: '#,##0',
      value: 0,
      baseline: 0,
      range: { min: 0, max: 100 },
      position: { x: 100 + (index % 3) * 300, y: 100 + Math.floor(index / 3) * 220 },
      size: { width: 520, height: 'auto' },
      direction: 'auto',
      level: '1',
      timeData: {},
      dependsOn: []
    };

    // 更新属性
    const nodeType = row['节点类型'] || baseNode.type;
    const formula = row['公式'];

    // 计算 min 和 max：根据实际数据自动计算
    let min, max;

    if (nodeType === 'driver') {
      // 获取 timeData（从 baseNode 或 existingNodes）
      const timeData = baseNode.timeData || existingNodes[id]?.timeData || existingNodes[nodeId]?.timeData;
      const { actualTotal, actualMonths } = calculateActualStats(timeData);

      // 最小值 = 实际数汇总（不论公式表中是否设置了）
      if (actualTotal > 0) {
        min = actualTotal;
      } else {
        min = row['最小值'] !== undefined && row['最小值'] !== '' ? parseFloat(row['最小值']) : (baseNode.range?.min ?? 0);
      }

      // 最大值 = 实际数汇总 * 12 / 实际月份数（如果有实际数据）
      if (actualTotal > 0 && actualMonths > 0) {
        const calculatedMax = actualTotal * 12 / actualMonths;
        // 如果公式表中有设置最大值，取公式表值和计算值中的较大者
        const formulaMax = row['最大值'] !== undefined && row['最大值'] !== '' ? parseFloat(row['最大值']) : null;
        max = formulaMax !== null ? Math.max(formulaMax, calculatedMax) : calculatedMax;
      } else {
        max = row['最大值'] !== undefined && row['最大值'] !== '' ? parseFloat(row['最大值']) : (baseNode.range?.max ?? (baseNode.value ? baseNode.value * 2 : 100));
      }
    } else {
      // 计算指标不需要 range
      min = undefined;
      max = undefined;
    }

    nodes[id] = {
      ...baseNode,
      id: id,
      name: row['指标名称'] || baseNode.name,
      type: nodeType,
      unit: row['单位'] || baseNode.unit,
      format: row['显示格式'] || baseNode.format,
      direction: row['指标方向'] || baseNode.direction,
      level: row['层级'] ? String(row['层级']) : baseNode.level,
      formula: nodeType === 'computed' ? (formula || '') : '',
      range: nodeType === 'driver' ? {
        min: min,
        max: max
      } : undefined,
      // 新增字段：月度数据汇总方式
      aggregationType: row['汇总方式'] || baseNode.aggregationType || '',
      // 新增字段：比率型指标
      isRatioIndicator: row['比率型指标'] !== undefined
        ? (String(row['比率型指标']).toLowerCase() === 'true' || String(row['比率型指标']) === '1')
        : (baseNode.isRatioIndicator || false)
      // 计算指标的 dependsOn 在保存时由系统重新计算
    };
  });

  return nodes;
}

/**
 * 合并两个节点对象，用公式表的节点覆盖数据表的节点
 */
export function mergeDataAndFormulaNodes(dataNodes, formulaNodes) {
  const merged = { ...dataNodes };

  Object.entries(formulaNodes).forEach(([id, formulaNode]) => {
    if (merged[id]) {
      // 合并：保留数据节点的 timeData, value, baseline，更新公式等属性
      merged[id] = {
        ...merged[id],
        type: formulaNode.type,
        formula: formulaNode.formula,
        unit: formulaNode.unit || merged[id].unit,
        format: formulaNode.format || merged[id].format,
        direction: formulaNode.direction || merged[id].direction,
        range: formulaNode.range || merged[id].range
      };
    } else {
      // 新增节点
      merged[id] = formulaNode;
    }
  });

  return merged;
}
