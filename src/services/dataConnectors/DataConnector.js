/**
 * 数据连接器抽象接口
 * 所有数据源连接器（PBI Desktop / PBI Service / 未来其他数据源）都实现此接口
 */
export class DataConnector {
  /** @returns {string} 连接器类型标识 */
  get type() { throw new Error('Not implemented'); }

  /** @returns {string} 显示名称 */
  get displayName() { throw new Error('Not implemented'); }

  /**
   * 检查连接器是否可用（如代理是否运行、认证是否有效）
   * @returns {Promise<{ available: boolean, message?: string }>}
   */
  async checkAvailability() { throw new Error('Not implemented'); }

  /**
   * 连接并返回可用数据源信息
   * @param {Object} config - 连接配置
   * @returns {Promise<{ connected: boolean, tables?: Array, measures?: Array, error?: string }>}
   */
  async connect(config) { throw new Error('Not implemented'); }

  /**
   * 获取数据并转换为 ValQ SourceDataNode 格式
   * @param {Object} mapping - 字段映射配置
   * @returns {Promise<Map<string, Object>>} nodeId → SourceDataNode
   */
  async fetchData(mapping) { throw new Error('Not implemented'); }

  /**
   * 断开连接
   */
  async disconnect() { throw new Error('Not implemented'); }
}
