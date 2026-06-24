import { PowerBIDesktopConnector } from './PowerBIDesktopConnector';
import { PowerBIServiceConnector } from './PowerBIServiceConnector';

/**
 * 数据连接器注册表
 * 管理所有可用的数据源连接器
 */
class ConnectorRegistry {
  constructor() {
    this._connectors = new Map();
  }

  register(connector) {
    this._connectors.set(connector.type, connector);
  }

  get(type) {
    return this._connectors.get(type);
  }

  getAll() {
    return Array.from(this._connectors.values());
  }

  /**
   * 检查所有连接器的可用性
   * @returns {Promise<Array<{ type: string, displayName: string, available: boolean, message?: string }>>}
   */
  async checkAll() {
    const results = [];
    for (const connector of this._connectors.values()) {
      const status = await connector.checkAvailability();
      results.push({
        type: connector.type,
        displayName: connector.displayName,
        ...status
      });
    }
    return results;
  }
}

// 创建全局注册表实例并注册连接器
const registry = new ConnectorRegistry();
registry.register(new PowerBIDesktopConnector());
registry.register(new PowerBIServiceConnector());

export { registry as connectorRegistry };
export { PowerBIDesktopConnector } from './PowerBIDesktopConnector';
export { PowerBIServiceConnector } from './PowerBIServiceConnector';
export { DataConnector } from './DataConnector';
