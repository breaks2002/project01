import { DataConnector } from './DataConnector';

/**
 * Power BI Service 云端连接器（第二阶段占位）
 * 使用 MSAL OAuth2 + PBI REST API
 */
export class PowerBIServiceConnector extends DataConnector {
  get type() { return 'pbi-service'; }
  get displayName() { return 'Power BI Service (云端)'; }

  async checkAvailability() {
    return { available: false, message: '云端连接功能开发中，敬请期待' };
  }

  async connect() {
    throw new Error('Power BI Service 连接功能尚未实现');
  }

  async fetchData() {
    throw new Error('Power BI Service 连接功能尚未实现');
  }

  async disconnect() {
    // no-op
  }
}
