const crypto = require('crypto');
const os = require('os');
const { execSync } = require('child_process');

/**
 * 获取机器码
 * 基于 CPU ID + 硬盘序列号 + 主板序列号
 */
async function generate() {
  try {
    // 获取 CPU ID
    const cpuId = getCpuId();

    // 获取硬盘序列号
    const diskSn = getDiskSerialNumber();

    // 获取主板序列号
    const motherboardSn = getMotherboardSerial();

    // 组合并生成 SHA-256 哈希
    const rawCode = `${cpuId}|${diskSn}|${motherboardSn}`;
    const hash = crypto.createHash('sha256').update(rawCode).digest('hex');

    // 返回 32 位机器码
    return hash.substring(0, 32).toUpperCase();
  } catch (error) {
    console.error('Machine code generation error:', error);
    // 失败时使用备用方案
    return generateFallback();
  }
}

/**
 * Windows: 获取 CPU ID
 */
function getCpuId() {
  try {
    if (process.platform === 'win32') {
      const result = execSync(
        'wmic cpu get ProcessorId /Value',
        { encoding: 'utf8', timeout: 5000 }
      );
      const match = result.match(/ProcessorId=(.+)/);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  } catch (e) {
    console.warn('getCpuId failed:', e.message);
  }
  return 'CPU_UNKNOWN';
}

/**
 * Windows: 获取硬盘序列号
 */
function getDiskSerialNumber() {
  try {
    if (process.platform === 'win32') {
      const result = execSync(
        'wmic diskdrive get SerialNumber /Value',
        { encoding: 'utf8', timeout: 5000 }
      );
      const match = result.match(/SerialNumber=(.+)/);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  } catch (e) {
    console.warn('getDiskSerialNumber failed:', e.message);
  }
  return 'DISK_UNKNOWN';
}

/**
 * Windows: 获取主板序列号
 */
function getMotherboardSerial() {
  try {
    if (process.platform === 'win32') {
      const result = execSync(
        'wmic baseboard get SerialNumber /Value',
        { encoding: 'utf8', timeout: 5000 }
      );
      const match = result.match(/SerialNumber=(.+)/);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  } catch (e) {
    console.warn('getMotherboardSerial failed:', e.message);
  }
  return 'MB_UNKNOWN';
}

/**
 * 备用方案：使用 MAC 地址 + 主机名
 */
function generateFallback() {
  const interfaces = os.networkInterfaces();
  const macs = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        macs.push(iface.mac);
      }
    }
  }

  const rawCode = `${os.hostname()}|${macs.join('|')}`;
  const hash = crypto.createHash('sha256').update(rawCode).digest('hex');

  return hash.substring(0, 32).toUpperCase();
}

module.exports = { generate };