const { contextBridge, ipcRenderer } = require('electron');

// 暴露授权 API 给前端
contextBridge.exposeInMainWorld('electronAPI', {
  // 检查授权状态
  checkLicense: () => ipcRenderer.invoke('check-license'),

  // 获取机器码
  getMachineCode: () => ipcRenderer.invoke('get-machine-code'),

  // 导入授权文件
  importLicense: (filePath) => ipcRenderer.invoke('import-license', filePath),

  // 激活授权（授权码）
  activateLicense: (licenseKey) => ipcRenderer.invoke('activate-license', licenseKey),

  // 获取 PBI Proxy 状态
  getProxyStatus: () => ipcRenderer.invoke('get-proxy-status'),

  // 平台信息
  platform: process.platform,

  // 是否为开发模式
  isDev: process.env.NODE_ENV === 'development'
});