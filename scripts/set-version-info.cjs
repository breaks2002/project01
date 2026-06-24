/**
 * afterPack 脚本：使用 rcdit 写入 exe 版本信息
 * 解决 electron-builder 内置 rcdit 因文件锁定失败的问题
 */
const { execSync } = require('child_process');
const path = require('path');

module.exports = async function(context) {
  const appOutDir = context.appOutDir;
  const exePath = path.join(appOutDir, 'AIDM.exe');
  const rcditPath = path.join(
    process.env.LOCALAPPDATA || path.join(require('os').homedir(), 'AppData', 'Local'),
    'electron-builder', 'Cache', 'winCodeSign', 'winCodeSign-2.6.0', 'rcedit-x64.exe'
  );

  try {
    execSync(
      `"${rcditPath}" "${exePath}"` +
      ` --set-version-string FileDescription "AIDM"` +
      ` --set-version-string ProductName "AIDM"` +
      ` --set-version-string LegalCopyright "Copyright 2026 AIDM Team"` +
      ` --set-file-version 1.0.0` +
      ` --set-product-version 1.0.0.0` +
      ` --set-version-string InternalName "AIDM"` +
      ` --set-version-string CompanyName "AIDM Team"` +
      ` --set-version-string OriginalFilename "AIDM.exe"`,
      { stdio: 'inherit' }
    );
    console.log('[afterPack] 版本信息写入成功');
  } catch (e) {
    console.warn('[afterPack] 版本信息写入失败（不影响功能）:', e.message);
  }
};
