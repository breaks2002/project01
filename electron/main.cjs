const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// 授权模块
const licenseValidator = require('./license/validator.cjs');
const machineCode = require('./license/machineCode.cjs');

let mainWindow;
let pbiProxyProcess;

// 开发模式检测
const isDev = !app.isPackaged;

// PBI Proxy 可执行文件路径
const getPbiProxyPath = () => {
  if (isDev) {
    return path.join(__dirname, '../pbi-proxy/pbi-proxy.exe');
  }
  // 生产环境：pbi-proxy.exe 在 resources 目录
  return path.join(process.resourcesPath, 'pbi-proxy/pbi-proxy.exe');
};

// 启动 PBI Proxy 后端服务
function startPbiProxy() {
  const proxyPath = getPbiProxyPath();

  if (!fs.existsSync(proxyPath)) {
    console.warn('PBI Proxy not found:', proxyPath);
    return;
  }

  console.log('Starting PBI Proxy:', proxyPath);
  pbiProxyProcess = spawn(proxyPath, [], {
    stdio: 'inherit',
    windowsHide: true
  });

  pbiProxyProcess.on('error', (err) => {
    console.error('PBI Proxy error:', err);
  });

  pbiProxyProcess.on('exit', (code) => {
    console.log('PBI Proxy exited with code:', code);
  });
}

// 停止 PBI Proxy
function stopPbiProxy() {
  if (pbiProxyProcess) {
    console.log('Stopping PBI Proxy...');
    pbiProxyProcess.kill();
    pbiProxyProcess = null;
  }
}

// 创建主窗口
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, '../public/icon.ico'),
    title: 'AIDM - 智能指标规划决策引擎'
  });

// 加载前端
  if (isDev) {
    // 开发模式：加载 Vite 开发服务器
    mainWindow.loadURL('http://localhost:3000');
    // mainWindow.webContents.openDevTools(); // 临时注释，测试生产环境体验
  } else {
    // 生产模式：加载打包后的静态文件
    const indexPath = path.join(__dirname, '../dist/index.html');
    console.log('[Production] Loading:', indexPath);
    mainWindow.loadFile(indexPath);

    // 🔒 安全加固：禁用 DevTools 快捷键 (F12, Ctrl+Shift+I)
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
        event.preventDefault();
      }
    });

    // 🔒 安全加固：禁用右键菜单
    mainWindow.webContents.on('context-menu', (event) => {
      event.preventDefault();
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC 处理：检查授权
ipcMain.handle('check-license', async () => {
  try {
    console.log('[IPC] check-license called');
    const result = await licenseValidator.checkLicense();
    console.log('[IPC] check-license result:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('[IPC] check-license error:', error);
    return { valid: false, error: error.message };
  }
});

// IPC 处理：获取机器码
ipcMain.handle('get-machine-code', async () => {
  try {
    const code = await machineCode.generate();
    return { success: true, code };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC 处理：导入授权文件
ipcMain.handle('import-license', async (event, filePath) => {
  try {
    // 如果没有传入路径，弹出文件选择对话框
    if (!filePath) {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: '选择授权文件',
        filters: [
          { name: '授权文件', extensions: ['lic'] },
          { name: '所有文件', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, message: '未选择文件' };
      }

      filePath = result.filePaths[0];
    }

    const importResult = await licenseValidator.importLicense(filePath);
    return importResult;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC 处理：激活授权（授权码）
ipcMain.handle('activate-license', async (event, licenseKey) => {
  try {
    const result = await licenseValidator.activateByKey(licenseKey);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC 处理：获取 PBI Proxy 状态
ipcMain.handle('get-proxy-status', async () => {
  return {
    running: pbiProxyProcess !== null,
    path: getPbiProxyPath()
  };
});

// IPC 处理：打开文件
ipcMain.handle('open-file', async (event, filePath) => {
  try {
    if (!filePath) {
      return { success: false, error: 'No file path provided' };
    }
    await shell.openPath(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 应用启动
app.whenReady().then(async () => {
  // 移除默认菜单栏
  const { Menu } = require('electron');
  Menu.setApplicationMenu(null);

  // 启动 PBI Proxy 后端
  startPbiProxy();

  // 等待后端启动（约2秒）
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 创建主窗口
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 应用关闭
app.on('window-all-closed', () => {
  stopPbiProxy();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopPbiProxy();
});