/**
 * 第零层：原始数据管理器
 * 负责加载和管理用户导入/PowerBI 同步的原始数据
 * 数据只读，除非重新导入
 */

import { parseCSV, parseWideTableToNodes, detectTimeFormat, parseNumericValue, getColumn } from '../../utils/csvParser';

export class SourceDataManager {
  constructor() {
    // 内部存储：Map<nodeId, SourceDataNode>
    this._sourceData = new Map();

    // 源数据版本（用于缓存失效判断）
    this._version = 0;

    // 时间维度配置
    this._timeDimension = null;
  }

  /**
   * 从 CSV 加载数据
   * @param {string} csvText - CSV 文本内容
   * @param {string} formulaText - 公式表 CSV 文本内容（可选）
   * @param {Map<string, SourceDataNode>} existingNodes - 现有节点（用于合并时间数据）
   * @returns {Map<string, SourceDataNode>} 节点数据
   */
  loadFromCSV(csvText, formulaText = null, existingNodes = new Map()) {
    console.log('[SourceDataManager] 开始加载 CSV 数据...', {
      hasExistingNodes: existingNodes.size > 0,
      existingNodeCount: existingNodes.size
    });

    // 解析 CSV 文本
    const csvData = parseCSV(csvText);
    const formulaData = formulaText ? parseCSV(formulaText) : null;

    if (!csvData || csvData.length === 0) {
      console.error('[SourceDataManager] CSV 数据为空');
      return new Map();
    }

    console.log('[SourceDataManager] 解析后的数据:', {
      rows: csvData.length,
      firstRow: csvData[0],
      keys: Object.keys(csvData[0])
    });

    // 检测 CSV 类型（宽表或公式表）
    // 宽表特征：有 '属性' 列，且第一行数据包含 AC/FC/BU 或 实际/预测/目标
    const hasAttributeColumn = csvData[0] && csvData[0]['属性'] !== undefined;
    const hasACFCBU = csvData[0] && (csvData[0]['AC'] || csvData[0]['FC'] || csvData[0]['BU']);
    const hasChineseType = csvData[0] && (csvData[0]['实际'] || csvData[0]['预测'] || csvData[0]['目标']);
    const isWideTable = hasAttributeColumn || hasACFCBU || hasChineseType;

    console.log('[SourceDataManager] CSV 类型检测:', {
      isWideTable,
      hasAttributeColumn,
      hasACFCBU,
      hasChineseType
    });

    let nodes = {};
    let timeDimension = null;

    if (isWideTable) {
      // 宽表数据（第一行是数据）
      const timeFormat = detectTimeFormat(Object.keys(csvData[0]).find(k => k !== '指标 ID' && k !== '指标名称' && k !== '属性'));
      timeDimension = {
        type: timeFormat?.type || 'month',
        periodCount: Object.keys(csvData[0]).length - 3,  // 减去指标 ID、指标名称、属性
        isRolling: false
      };

      console.log('[SourceDataManager] 使用宽表解析，时间维度:', timeDimension);

      // 使用 parseWideTableToNodes 解析
      const wideTableResult = parseWideTableToNodes(csvData, timeFormat?.type);
      nodes = wideTableResult.nodes || {};

      console.log('[SourceDataManager] 宽表解析结果:', {
        nodeCount: Object.keys(nodes).length,
        sampleNode: Object.keys(nodes)[0],
        sampleNodeData: nodes[Object.keys(nodes)[0]] ? {
          hasOriginalTimeData: !!nodes[Object.keys(nodes)[0]].originalTimeData,
          originalTimeDataSample: nodes[Object.keys(nodes)[0]].originalTimeData ?
            Object.entries(nodes[Object.keys(nodes)[0]].originalTimeData).slice(0, 3) : null
        } : null
      });
    } else {
      // 公式表数据（第一行是表头）
      // 驱动因子直接从 CSV 创建，计算指标从公式表创建
      console.log('[SourceDataManager] 使用公式表解析（无宽表数据）');
      csvData.forEach((row, index) => {
        const id = getColumn(row, '指标ID') || getColumn(row, '指标名称');
        if (!id) return;

        const name = getColumn(row, '指标名称') || id;
        const type = getColumn(row, '节点类型') || 'driver';
        const formula = getColumn(row, '公式') || '';

        // 从 existingNodes 获取时间数据
        const existingNode = existingNodes.get(id);
        const hasTimeData = existingNode && (existingNode.periods && Object.keys(existingNode.periods).length > 0);

        // 将 periods 转换为 originalTimeData 格式
        let originalTimeData = {};
        let timeData = {};
        if (hasTimeData) {
          Object.entries(existingNode.periods).forEach(([period, data]) => {
            if (data.AC !== null && data.AC !== undefined) {
              originalTimeData[`${period}-AC`] = data.AC;
              timeData[`${period}-AC`] = data.AC;
            }
            if (data.FC !== null && data.FC !== undefined) {
              originalTimeData[`${period}-FC`] = data.FC;
              timeData[`${period}-FC`] = data.FC;
            }
            if (data.BU !== null && data.BU !== undefined) {
              originalTimeData[`${period}-BU`] = data.BU;
            }
          });
          console.log(`[SourceDataManager] 公式表节点 ${id} 从 existingNodes 获取时间数据:`, {
            periodsCount: Object.keys(existingNode.periods).length,
            samplePeriod: Object.keys(existingNode.periods)[0]
          });
        }

        // 解析公式表中的 range 配置
        const formulaMin = parseNumericValue(getColumn(row, '最小值'));
        const formulaMax = parseNumericValue(getColumn(row, '最大值'));

        console.log(`[SourceDataManager] 公式表节点 ${id} range 解析:`, {
          '最小值 原始': getColumn(row, '最小值'),
          '最大值 原始': getColumn(row, '最大值'),
          'formulaMin': formulaMin,
          'formulaMax': formulaMax
        });

        nodes[id] = {
          id,
          name,
          type,
          formula,
          unit: getColumn(row, '单位') || '',
          format: getColumn(row, '显示格式') || '#,##0',
          direction: getColumn(row, '指标方向') || 'auto',
          level: getColumn(row, '层级') || '1',
          // range: 直接从公式表解析
          range: (formulaMin !== null || formulaMax !== null)
            ? { min: formulaMin ?? 0, max: formulaMax ?? 100 }
            : undefined,
          timeData,
          originalTimeData,
          timeDimension: existingNode?.timeDimension || null
        };
      });

      timeDimension = { type: 'month', periodCount: 0, isRolling: false };
    }

    // 如果有公式表，合并公式信息
    if (formulaData && formulaData.length > 0) {
      console.log('🔥🔥 [SourceDataManager] 开始处理公式表，行数:', formulaData.length);
      console.log('🔥 公式表第一行:', formulaData[0]);

      const formulaNodes = {};
      formulaData.forEach((row, index) => {
        // 兼容 BOM 和空格的列名
        let id = getColumn(row, '指标ID') || getColumn(row, '指标名称') || '';
        if (!id) {
          console.warn('[SourceDataManager] 跳过无效行:', row);
          return;
        }

        // 规范化 ID
        id = id.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_一-龥]/g, '');

        console.log(`[SourceDataManager] 处理公式行 ${index}:`, {
          id,
          name: row['指标名称'],
          '最小值': row['最小值'],
          '最大值': row['最大值']
        });

        // 检查是否已存在该节点（从数据表创建）
        const existingNode = nodes[id];

        // 解析公式表中的 range 配置
        const formulaMin = parseNumericValue(getColumn(row, '最小值'));
        const formulaMax = parseNumericValue(getColumn(row, '最大值'));

        console.log('[SourceDataManager] 公式表 range:', {
          id,
          'formulaMinValue': getColumn(row, '最小值'),
          'formulaMaxValue': getColumn(row, '最大值'),
          'formulaMin': formulaMin,
          'formulaMax': formulaMax,
          'existingRange': existingNode?.range
        });

        formulaNodes[id] = {
          ...existingNode,  // 保留原有节点的时间数据等属性
          id,
          name: getColumn(row, '指标名称') || (existingNode?.name || id),
          type: getColumn(row, '节点类型') || (existingNode?.type || 'computed'),
          formula: getColumn(row, '公式') || '',
          unit: getColumn(row, '单位') || existingNode?.unit || '',
          format: getColumn(row, '显示格式') || existingNode?.format || '#,##0',
          direction: getColumn(row, '指标方向') || existingNode?.direction || 'auto',
          level: getColumn(row, '层级') || existingNode?.level || '1',
          // range: 优先使用公式表中的配置，其次使用 existingNode 的 range
          range: (formulaMin !== null || formulaMax !== null)
            ? { min: formulaMin ?? 0, max: formulaMax ?? 100 }
            : existingNode?.range,
          // 保留时间数据
          originalTimeData: existingNode?.originalTimeData || {},
          timeData: existingNode?.timeData || {},
          timeDimension: existingNode?.timeDimension || null
        };
      });

      console.log('[SourceDataManager] 公式表节点:', Object.keys(formulaNodes));
      console.log('[SourceDataManager] fangwenliuliang range:', formulaNodes['fangwenliuliang']?.range);

      // 合并 - 公式表优先
      Object.assign(nodes, formulaNodes);
    }

    console.log('[SourceDataManager] 最终节点列表:', Object.keys(nodes));

    // 转换为新的数据结构
    this._sourceData = new Map();
    this._timeDimension = timeDimension;

    Object.values(nodes).forEach(node => {
      // 调试：打印节点详情
      if (node.originalTimeData && Object.keys(node.originalTimeData).length > 0) {
        console.log(`[SourceDataManager] 节点 ${node.id} 有时间数据:`, {
          originalTimeDataSample: Object.entries(node.originalTimeData).slice(0, 3),
          timeDataSample: Object.entries(node.timeData || {}).slice(0, 3)
        });
      } else {
        console.warn(`[SourceDataManager] 节点 ${node.id} 没有时间数据!`, {
          hasOriginalTimeData: !!node.originalTimeData,
          hasTimeData: !!node.timeData,
          nodeKeys: Object.keys(node)
        });
      }

      const sourceDataNode = this._convertToSourceDataNode(node, timeDimension);
      this._sourceData.set(sourceDataNode.id, sourceDataNode);
    });

    this._version++;
    console.log(`[SourceDataManager] 加载完成，共 ${this._sourceData.size} 个节点`);

    return this._sourceData;
  }

  /**
   * 将旧格式节点转换为新格式
   * @param {Object} node - 旧格式节点
   * @param {Object} timeDimension - 时间维度配置
   * @returns {SourceDataNode} 新格式节点
   */
  /**
   * 从原始节点转换到 SourceDataNode
   * @param {Object} node - 原始节点
   * @param {Object} timeDimension - 时间维度
   * @returns {SourceDataNode}
   */
  _convertToSourceDataNode(node, timeDimension) {
    // 从 originalTimeData 中提取 AC/FC/BU 到 periods 结构
    const periods = {};

    console.log(`[SourceDataManager] _convertToSourceDataNode: ${node.id}`, {
      hasOriginalTimeData: !!node.originalTimeData,
      hasTimeData: !!node.timeData,
      originalTimeDataKeys: node.originalTimeData ? Object.keys(node.originalTimeData).slice(0, 5) : [],
      timeDataKeys: node.timeData ? Object.keys(node.timeData).slice(0, 5) : []
    });

    // 提取所有期间 key
    const allKeys = new Set();
    if (node.originalTimeData) {
      Object.keys(node.originalTimeData).forEach(key => allKeys.add(key));
    }
    if (node.timeData) {
      Object.keys(node.timeData).forEach(key => allKeys.add(key));
    }

    console.log(`[SourceDataManager] ${node.id} 所有期间 keys:`, Array.from(allKeys).slice(0, 10));

    // 解析每个期间
    allKeys.forEach(key => {
      // 提取期间部分和类型部分
      // 支持格式：2026WK01-AC, 2026WK01 实际
      const match = key.match(/^(.+)-(AC|FC|BU)$|^(.+)(实际|预测|目标)$/);
      let period, type;
      if (match) {
        period = match[1] || match[3];
        if (period) period = period.replace(/[-–]\s*$/, '').trim();
        type = match[2] ||
          (match[4] === '实际' ? 'AC' : match[4] === '预测' ? 'FC' : match[4] === '目标' ? 'BU' : null);
      } else {
        // 没有类型后缀的 key（如 '2026WK01'），默认作为 AC 类型
        period = key.replace(/[-–]\s*$/, '').trim();
        type = 'AC';
      }

      if (!period) return;

      // 初始化期间数据
      if (!periods[period]) {
        periods[period] = { AC: null, FC: null, BU: null };
      }

      // 赋值 - 使用原始值，不修改源数据
      const value = node.originalTimeData?.[key] ?? node.timeData?.[key];
      if (value !== undefined && value !== null) {
        periods[period][type] = value;
      }
    });

    console.log(`[SourceDataManager] ${node.id} 转换后的 periods:`, {
      periodsCount: Object.keys(periods).length,
      samplePeriod: Object.keys(periods)[0] ? periods[Object.keys(periods)[0]] : null
    });

    // 深拷贝 range，避免引用问题
    const rangeCopy = node.range ? { min: node.range.min ?? 0, max: node.range.max ?? 100 } : undefined;

    return {
      id: node.id,
      name: node.name,
      type: node.type || 'driver',
      unit: node.unit || '',
      format: node.format || '#,##0',
      direction: node.direction || 'auto',
      level: node.level || '1',
      aggregationType: node.aggregationType || 'sum',
      periods,
      formula: node.formula || null,
      // 保留 range 配置（驱动因子的最小值/最大值）- 深拷贝
      range: rangeCopy,
      source: 'csv',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  /**
   * 从 PowerBI 加载数据
   * @param {Map<string, Object>} nodesMap - 连接器返回的节点数据 Map
   * @returns {Map<string, SourceDataNode>}
   */
  loadFromPowerBI(nodesMap) {
    console.log('[SourceDataManager] 从 PowerBI 加载数据...', { nodeCount: nodesMap.size });

    this._sourceData = new Map();

    // 检测时间维度
    const allPeriods = new Set();
    nodesMap.forEach(node => {
      Object.keys(node.periods || {}).forEach(p => allPeriods.add(p));
    });
    const periodsArray = Array.from(allPeriods);

    if (periodsArray.length > 0) {
      const sample = periodsArray[0];
      if (/^\d{8}$/.test(sample)) this._timeDimension = 'day';
      else if (/^\d{4}WK\d{2}$/i.test(sample)) this._timeDimension = 'week';
      else if (/^\d{6}$/.test(sample)) this._timeDimension = 'month';
      else if (/^\d{4}Q\d$/i.test(sample)) this._timeDimension = 'quarter';
      else if (/^\d{4}$/.test(sample)) this._timeDimension = 'year';
      else this._timeDimension = 'month';
    }

    // 存入内部 Map
    nodesMap.forEach((node, nodeId) => {
      this._sourceData.set(nodeId, {
        ...node,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    });

    this._version++;
    console.log('[SourceDataManager] PowerBI 数据加载完成:', {
      nodeCount: this._sourceData.size,
      timeDimension: this._timeDimension,
      periodCount: periodsArray.length
    });

    return this._sourceData;
  }

  /**
   * 更新节点的期间数据
   * @param {string} nodeId - 节点 ID
   * @param {string} period - 期间
   * @param {'AC' | 'FC' | 'BU'} dataType - 数据类型
   * @param {number} value - 值
   * @param {boolean} isAdjustment - 是否是调整操作 (如果是，不覆盖原始数据)
   */
  updatePeriodData(nodeId, period, dataType, value, isAdjustment = false) {
    const node = this._sourceData.get(nodeId);
    if (!node) {
      console.warn(`[SourceDataManager] 更新失败：节点 ${nodeId} 不存在`);
      return false;
    }

    if (!node.periods[period]) {
      node.periods[period] = {};
    }

    // 关键修复：调整操作不应该修改源数据！
    // 源数据应该保持不变，调整数据由 AdjustmentManager 管理
    // 这个方法仅用于数据加载等场景
    if (isAdjustment) {
      console.log(`[SourceDataManager] 跳过调整更新 (保持源数据不变): ${nodeId} ${period}-${dataType} = ${value}`);
      return true;
    }

    // 更新对应数据类型的值 (非调整场景)
    node.periods[period][dataType] = value;

    // 如果是驱动因子，同步更新 originalTimeData (用于保持数据一致性)
    if (node.type === 'driver' && node.originalTimeData) {
      node.originalTimeData[period] = node.originalTimeData[period] || {};
      node.originalTimeData[period][dataType] = value;
    }

    this._version++;
    console.log(`[SourceDataManager] 更新节点数据：${nodeId} ${period}-${dataType} = ${value}`);
    return true;
  }

  /**
   * 获取单个节点的原始数据
   * @param {string} nodeId - 节点 ID
   * @returns {SourceDataNode | null}
   */
  getSourceData(nodeId) {
    return this._sourceData.get(nodeId) || null;
  }

  /**
   * 获取所有节点
   * @returns {Map<string, SourceDataNode>}
   */
  getAllNodes() {
    return new Map(this._sourceData);
  }

  /**
   * 获取所有节点 ID
   * @returns {string[]}
   */
  getAllNodeIds() {
    return Array.from(this._sourceData.keys());
  }

  /**
   * 检查节点是否存在
   * @param {string} nodeId - 节点 ID
   * @returns {boolean}
   */
  hasNode(nodeId) {
    return this._sourceData.has(nodeId);
  }

  /**
   * 获取时间维度配置
   * @returns {Object}
   */
  getTimeDimension() {
    return this._timeDimension;
  }

  /**
   * 获取数据版本
   * @returns {number}
   */
  getVersion() {
    return this._version;
  }

  /**
   * 清空数据
   */
  clear() {
    this._sourceData.clear();
    this._timeDimension = null;
    this._version++;
  }

  /**
   * 导出为 JSON（用于调试或持久化）
   * @returns {Object}
   */
  toJSON() {
    return {
      version: this._version,
      timeDimension: this._timeDimension,
      nodes: Object.fromEntries(this._sourceData)
    };
  }

  /**
   * 从 JSON 导入
   * @param {Object} json - JSON 数据
   */
  fromJSON(json) {
    this._version = json.version || 0;
    this._timeDimension = json.timeDimension || null;
    this._sourceData = new Map(
      Object.entries(json.nodes || {}).map(([id, node]) => [id, node])
    );
  }
}

/**
 * 辅助函数：判断是否是有效的期间 key
 */
function isValidPeriodKey(key) {
  const patterns = [
    /^\d{8}$/,              // 20260101 (日度)
    /^\d{6}$/,              // 202601 (月度)
    /^\d{4}WK\d{2}$/,       // 2026WK01 (周度)
    /^\d{4}Q[1-4]$/,        // 2026Q1 (季度)
    /^\d{4}$/,              // 2026 (年度)
    /^\d{4}-\d{2}$/,        // 2026-01
    /\d+月/                  // 1月
  ];

  // 检查是否是 period-type 格式
  const match = key.match(/^(.+)-(AC|FC|BU)|(.+)(实际|预测|目标)$/);
  if (match) {
    const period = match[1] || match[3];
    return patterns.some(p => p.test(period));
  }

  return false;
}

/**
 * 辅助函数：从 key 中提取期间和类型
 */
function parsePeriodKey(key) {
  const match = key.match(/^(.+)-(AC|FC|BU)|(.+)(实际|预测|目标)$/);
  if (!match) return null;

  let period = match[1] || match[3];
  let type = match[2] ||
    (match[4] === '实际' ? 'AC' : match[4] === '预测' ? 'FC' : match[4] === '目标' ? 'BU' : null);

  return { period, type };
}
