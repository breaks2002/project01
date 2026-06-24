const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

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

  // 打开文件
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),

  // 获取帮助文档路径（PDF 格式）
  getHelpPath: () => {
    if (process.env.NODE_ENV === 'development') {
      return path.join(__dirname, '..', 'docs', 'AIDM用户操作手册.pdf');
    }
    // extraResources 会将 docs 目录放在 resources 根目录下
    return path.join(process.resourcesPath, 'docs', 'AIDM用户操作手册.pdf');
  },

  // 平台信息
  platform: process.platform,

  // 是否为开发模式
  isDev: process.env.NODE_ENV === 'development'
});