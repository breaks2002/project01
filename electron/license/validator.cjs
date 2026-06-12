const fs = require('fs');
const path = require('path');
const nodeCrypto = require('crypto');
const { app } = require('electron');
const { decryptAES, encryptAES, verifySignature } = require('./crypto.cjs');
const machineCode = require('./machineCode.cjs');

// 试用版固定盐值（防止随意篡改）
const TRIAL_SALT = 'AIDM2026TrialIntegrityCheck';

// 生成试用版哈希签名（基于机器码+时间戳+盐值）
function generateTrialHash(licenseData) {
  const content = `${licenseData.machineCode}|${licenseData.expiresAt}|${licenseData.issuedAt}|${TRIAL_SALT}`;
  return nodeCrypto.createHash('sha256').update(content).digest('hex');
}

// 授权文件存储路径
const getLicensePath = () => {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'license.lic');
};

/**
 * 创建试用版授权数据
 */
function createTrialLicense() {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  const trialData = {
    version: '1.0',
    machineCode: 'TRIAL',
    licenseType: 'trial',
    expiresAt: expiresAt.toISOString(),
    issuedAt: issuedAt.toISOString(),
    features: ['basic']
  };
  // 生成哈希签名，防止篡改
  trialData.signature = generateTrialHash(trialData);
  return trialData;
}

/**
 * 检查授权状态
 * @returns {object} - { valid, type, expiresAt, features, machineCode, daysLeft }
 */
async function checkLicense() {
  const licensePath = getLicensePath();
  console.log('[Validator] License path:', licensePath);
  console.log('[Validator] File exists?', fs.existsSync(licensePath));

  // 授权文件不存在 - 自动创建 30 天试用授权
  if (!fs.existsSync(licensePath)) {
    console.log('[Validator] Creating trial license...');
    const trialData = createTrialLicense();
    fs.writeFileSync(licensePath, encryptAES(trialData), 'utf8');

    const expiresAt = new Date(trialData.expiresAt);
    const daysLeft = Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24));

    console.log('[Validator] Trial license created successfully');
    console.log('[Validator] Returning:', {
      valid: true,
      type: 'trial',
      expiresAt: trialData.expiresAt,
      daysLeft,
      machineCode: 'TRIAL'
    });

    return {
      valid: true,
      type: 'trial',
      expiresAt: trialData.expiresAt,
      issuedAt: trialData.issuedAt,
      features: trialData.features,
      daysLeft,
      machineCode: 'TRIAL'
    };
  }

  try {
    // 读取并解密授权文件
    const encryptedData = fs.readFileSync(licensePath, 'utf8');
    const licenseData = decryptAES(encryptedData);

    console.log('[Validator] Existing license data:', JSON.stringify(licenseData, null, 2));

    // 试用版验证：使用哈希校验（防篡改）
    if (licenseData.licenseType === 'trial') {
      console.log('[Validator] Trial license detected, verifying hash...');
      const expectedHash = generateTrialHash({
        machineCode: licenseData.machineCode,
        expiresAt: licenseData.expiresAt,
        issuedAt: licenseData.issuedAt
      });

      if (licenseData.signature !== expectedHash) {
        return {
          valid: false,
          reason: 'TRIAL_TAMPERED',
          message: '试用版授权文件已被篡改，请重新激活'
        };
      }

      const expiresAt = new Date(licenseData.expiresAt);
      const now = new Date();

      if (now > expiresAt) {
        return {
          valid: false,
          reason: 'EXPIRED',
          message: '试用期已过期，请购买授权',
          expiresAt: licenseData.expiresAt
        };
      }

      const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
      const currentMachineCode = await machineCode.generate();

      return {
        valid: true,
        type: 'trial',
        expiresAt: licenseData.expiresAt,
        issuedAt: licenseData.issuedAt,
        features: licenseData.features,
        daysLeft,
        machineCode: currentMachineCode
      };
    }

    // 正式授权：验证签名
    const dataToVerify = JSON.stringify({
      version: licenseData.version,
      machineCode: licenseData.machineCode,
      licenseType: licenseData.licenseType,
      expiresAt: licenseData.expiresAt,
      issuedAt: licenseData.issuedAt,
      features: licenseData.features
    });

    if (!verifySignature(dataToVerify, licenseData.signature)) {
      return {
        valid: false,
        reason: 'SIGNATURE_INVALID',
        message: '授权文件签名无效'
      };
    }

    // 获取当前机器码
    const currentMachineCode = await machineCode.generate();

    // 验证机器码
    if (licenseData.machineCode !== currentMachineCode) {
      return {
        valid: false,
        reason: 'MACHINE_CODE_MISMATCH',
        message: '机器码不匹配，当前设备未被授权',
        expectedMachineCode: licenseData.machineCode,
        currentMachineCode
      };
    }

    // 验证有效期
    const expiresAt = new Date(licenseData.expiresAt);
    const now = new Date();

    if (now > expiresAt) {
      return {
        valid: false,
        reason: 'EXPIRED',
        message: '授权已过期',
        expiresAt: licenseData.expiresAt
      };
    }

    // 计算剩余天数
    const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

    return {
      valid: true,
      type: licenseData.licenseType,
      expiresAt: licenseData.expiresAt,
      issuedAt: licenseData.issuedAt,
      features: licenseData.features,
      daysLeft,
      machineCode: currentMachineCode
    };
  } catch (error) {
    console.error('License check error:', error);
    return {
      valid: false,
      reason: 'CHECK_ERROR',
      message: '授权检查失败: ' + error.message
    };
  }
}

/**
 * 导入授权文件
 * @param {string} filePath - 授权文件路径
 * @returns {object} - { success, message }
 */
async function importLicense(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, message: '文件不存在' };
    }

    // 读取授权文件
    const encryptedData = fs.readFileSync(filePath, 'utf8');

    // 解密并验证
    const licenseData = decryptAES(encryptedData);

    // 验证签名（试用版使用哈希校验，正式版使用 RSA 验签）
    if (licenseData.licenseType === 'trial') {
      // 试用版哈希校验
      const expectedHash = generateTrialHash({
        machineCode: licenseData.machineCode,
        expiresAt: licenseData.expiresAt,
        issuedAt: licenseData.issuedAt
      });
      if (licenseData.signature !== expectedHash) {
        return { success: false, message: '试用版授权文件已被篡改' };
      }
    } else {
      // 正式版 RSA 验签
      const dataToVerify = JSON.stringify({
        version: licenseData.version,
        machineCode: licenseData.machineCode,
        licenseType: licenseData.licenseType,
        expiresAt: licenseData.expiresAt,
        issuedAt: licenseData.issuedAt,
        features: licenseData.features
      });

      if (!verifySignature(dataToVerify, licenseData.signature)) {
        return { success: false, message: '授权文件签名无效' };
      }
    }

    // 获取当前机器码并验证
    const currentMachineCode = await machineCode.generate();

    if (licenseData.machineCode !== currentMachineCode) {
      return {
        success: false,
        message: `机器码不匹配\n授权机器码: ${licenseData.machineCode}\n当前机器码: ${currentMachineCode}`
      };
    }

    // 保存授权文件
    const licensePath = getLicensePath();
    fs.writeFileSync(licensePath, encryptedData, 'utf8');

    return {
      success: true,
      message: '授权导入成功！',
      licenseType: licenseData.licenseType,
      expiresAt: licenseData.expiresAt
    };
  } catch (error) {
    console.error('Import license error:', error);
    return { success: false, message: '导入失败: ' + error.message };
  }
}

/**
 * 激活授权（通过授权码）
 * 注意：纯本地验证模式下，授权码需要预存在本地数据库
 * @param {string} licenseKey - 授权码（格式: XXXX-XXXX-XXXX-XXXX）
 * @returns {object} - { success, message }
 */
async function activateByKey(licenseKey) {
  // TODO: 如果使用授权码激活，需要查询本地授权码数据库
  // 这里暂时返回错误，建议使用导入授权文件方式
  return {
    success: false,
    message: '请使用导入授权文件方式激活'
  };
}

/**
 * 清除授权
 */
function clearLicense() {
  const licensePath = getLicensePath();
  if (fs.existsSync(licensePath)) {
    fs.unlinkSync(licensePath);
  }
}

module.exports = {
  checkLicense,
  importLicense,
  activateByKey,
  clearLicense,
  getLicensePath
};