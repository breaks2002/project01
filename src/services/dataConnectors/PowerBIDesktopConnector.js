import { DataConnector } from './DataConnector';

/**
 * Power BI Desktop 连接器
 * 通过本地代理服务 (pbi-proxy.exe) 连接 PBI Desktop 的 SSAS 实例
 */
export class PowerBIDesktopConnector extends DataConnector {
  constructor(proxyBaseUrl = 'http://localhost:5678') {
    super();
    this._baseUrl = proxyBaseUrl;
    this._connected = false;
    this._tables = [];
    this._measures = [];
  }

  get type() { return 'pbi-desktop'; }
  get displayName() { return 'Power BI Desktop'; }
  get tables() { return this._tables; }
  get measures() { return this._measures; }

  /**
   * 检查代理服务是否运行
   */
  async checkAvailability() {
    try {
      const res = await fetch(`${this._baseUrl}/api/health`, { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      return { available: data.status === 'ok', message: '代理服务运行中' };
    } catch {
      return { available: false, message: '代理服务未启动，请先运行 pbi-proxy.exe' };
    }
  }

  /**
   * 发现本地 PBI Desktop 实例
   * @returns {Promise<Array>} 实例列表
   */
  async discoverInstances() {
    const res = await fetch(`${this._baseUrl}/api/instances`);
    if (!res.ok) throw new Error('发现实例失败');
    const data = await res.json();
    return data.instances || [];
  }

  /**
   * 连接到指定实例
   * @param {Object} config - { instanceId?: string, port?: number }
   */
  async connect(config) {
    const res = await fetch(`${this._baseUrl}/api/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    const data = await res.json();

    if (data.connected) {
      this._connected = true;
      this._tables = data.tables || [];
      this._measures = data.measures || [];
    }

    return data;
  }

  /**
   * 刷新表和度量值列表
   */
  async refreshMetadata() {
    const [tablesRes, measuresRes] = await Promise.all([
      fetch(`${this._baseUrl}/api/tables`),
      fetch(`${this._baseUrl}/api/measures`)
    ]);
    const tablesData = await tablesRes.json();
    const measuresData = await measuresRes.json();
    this._tables = tablesData.tables || [];
    this._measures = measuresData.measures || [];
    return { tables: this._tables, measures: this._measures };
  }

  /**
   * 执行 DAX 查询
   * @param {string} dax - DAX 查询语句
   * @returns {Promise<{ columns: string[], rows: Object[], rowCount: number }>}
   */
  async executeQuery(dax) {
    const res = await fetch(`${this._baseUrl}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dax })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'DAX 查询失败');
    }
    return await res.json();
  }

  /**
   * 获取数据并转换为 ValQ SourceDataNode 格式
   * @param {Object} mapping - 字段映射配置
   * @param {string} mapping.dax - DAX 查询
   * @param {string} mapping.nodeIdColumn - 节点ID列
   * @param {string} mapping.nodeNameColumn - 节点名称列
   * @param {string} mapping.periodColumn - 时间期间列
   * @param {string} [mapping.tableFormat='long'] - 'long'(属性在行) | 'wide'(AC/FC/BU各一列)
   * 长表专用：
   * @param {string} [mapping.dataTypeColumn] - 数据类型列 (AC/FC/BU)
   * @param {string} [mapping.valueColumn] - 值列
   * 宽表专用：
   * @param {string} [mapping.acColumn] - AC 列
   * @param {string} [mapping.fcColumn] - FC 列
   * @param {string} [mapping.buColumn] - BU 列
   * @param {string[]} [mapping.formulaNodes] - 计算指标节点ID列表
   * @returns {Promise<Map<string, Object>>}
   */
  async fetchData(mapping) {
    const queryResult = await this.executeQuery(mapping.dax);
    return this._transformToSourceDataNodes(queryResult, mapping);
  }

  /**
   * 将 DAX 查询结果转换为 ValQ SourceDataNode Map
   * 支持长表和宽表两种格式
   */
  _transformToSourceDataNodes(queryResult, mapping) {
    const nodesMap = new Map();

    // DAX 返回的列名可能是 "tableName[colName]" 格式
    const colKeys = queryResult.columns || [];
    const findKey = (shortName) => {
      if (!shortName) return null;
      if (colKeys.includes(shortName)) return shortName;
      const found = colKeys.find(k => {
        const m = k.match(/\[(.+)\]$/);
        return m && m[1] === shortName;
      });
      return found || null;
    };

    const idKey = findKey(mapping.nodeIdColumn);
    const nameKey = findKey(mapping.nodeNameColumn);
    const periodKey = findKey(mapping.periodColumn);
    const isWide = mapping.tableFormat === 'wide';

    // 宽表模式的列 key
    const acKey = isWide ? findKey(mapping.acColumn) : null;
    const fcKey = isWide ? findKey(mapping.fcColumn) : null;
    const buKey = isWide ? findKey(mapping.buColumn) : null;

    // 长表模式的列 key
    const typeKey = !isWide ? findKey(mapping.dataTypeColumn) : null;
    const valueKey = !isWide ? findKey(mapping.valueColumn) : null;

    const ensureNode = (nodeId, nodeName) => {
      if (!nodesMap.has(nodeId)) {
        nodesMap.set(nodeId, {
          id: nodeId,
          name: nodeName || nodeId,
          type: (mapping.formulaNodes || []).includes(nodeId) ? 'computed' : 'driver',
          unit: '', format: '', direction: 'up', level: '',
          aggregationType: 'sum', periods: {}, formula: null,
          range: undefined, source: 'powerbi-desktop',
          createdAt: Date.now(), updatedAt: Date.now()
        });
      }
      return nodesMap.get(nodeId);
    };

    for (const row of queryResult.rows) {
      const nodeId = String(row[idKey] ?? '').trim();
      const nodeName = String(row[nameKey] ?? '').trim();
      const period = String(row[periodKey] ?? '').trim();

      if (!nodeId || !period) continue;

      const node = ensureNode(nodeId, nodeName);
      if (!node.periods[period]) {
        node.periods[period] = { AC: null, FC: null, BU: null };
      }

      if (isWide) {
        // 宽表：AC/FC/BU 各占一列
        if (acKey) {
          const v = parseFloat(row[acKey]);
          if (!isNaN(v)) node.periods[period].AC = v;
        }
        if (fcKey) {
          const v = parseFloat(row[fcKey]);
          if (!isNaN(v)) node.periods[period].FC = v;
        }
        if (buKey) {
          const v = parseFloat(row[buKey]);
          if (!isNaN(v)) node.periods[period].BU = v;
        }
      } else {
        // 长表：一个类型列 + 一个值列
        const dataType = typeKey ? String(row[typeKey] ?? 'AC').trim().toUpperCase() : 'AC';
        const value = parseFloat(row[valueKey]);
        if (['AC', 'FC', 'BU'].includes(dataType) && !isNaN(value)) {
          node.periods[period][dataType] = value;
        }
      }
    }

    return nodesMap;
  }

  /**
   * 断开连接
   */
  async disconnect() {
    try {
      await fetch(`${this._baseUrl}/api/disconnect`, { method: 'POST' });
    } catch { /* 忽略 */ }
    this._connected = false;
    this._tables = [];
    this._measures = [];
  }
}
