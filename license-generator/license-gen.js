#!/usr/bin/env node

/**
 * AIDM License Generator
 * 用于生成授权文件的命令行工具
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// RSA 密钥对（需要预生成）
let privateKey = null;
let publicKey = null;

// AES 密钥（32字节 = 256位，与 Electron 应用中相同）
const AES_KEY = Buffer.from('AIDM2026SecretKeyForAES256Encry!', 'utf8').slice(0, 32);

// 密钥文件路径
const KEYS_DIR = path.join(__dirname, 'keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private.pem');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'public.pem');

/**
 * 生成 RSA 密钥对
 */
function generateKeys() {
  if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
  }

  // 生成 2048 位 RSA 密钥对
  const { privateKey: privKey, publicKey: pubKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  fs.writeFileSync(PRIVATE_KEY_PATH, privKey);
  fs.writeFileSync(PUBLIC_KEY_PATH, pubKey);

  console.log('✅ RSA 密钥对已生成！');
  console.log(`   私钥: ${PRIVATE_KEY_PATH}`);
  console.log(`   公钥: ${PUBLIC_KEY_PATH}`);

  privateKey = privKey;
  publicKey = pubKey;
}

/**
 * 加载密钥
 */
function loadKeys() {
  if (!fs.existsSync(PRIVATE_KEY_PATH) || !fs.existsSync(PUBLIC_KEY_PATH)) {
    console.log('⚠️  密钥不存在，正在生成...');
    generateKeys();
  }

  privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
  publicKey = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
}

/**
 * 解析有效期参数
 * @param {string} duration - 如 '30d', '1m', '1y', '10y'
 * @returns {Date} - 到期日期
 */
function parseDuration(duration) {
  const now = new Date();

  const match = duration.match(/^(\d+)(m|y|d)$/);
  if (!match) {
    throw new Error('有效期格式错误，应为: 30d, 1m, 1y, 10y 等');
  }

  const value = parseInt(match[1]);
  const unit = match[2];

  if (unit === 'd') {
    now.setDate(now.getDate() + value);
  } else if (unit === 'm') {
    now.setMonth(now.getMonth() + value);
  } else if (unit === 'y') {
    now.setFullYear(now.getFullYear() + value);
  }

  return now;
}

/**
 * 获取授权类型功能列表
 * @param {string} type - trial, standard, pro
 * @returns {string[]} - 功能列表
 */
function getFeatures(type) {
  switch (type) {
    case 'trial':
      return ['basic'];
    case 'standard':
      return ['basic', 'advanced'];
    case 'pro':
      return ['basic', 'advanced', 'ai'];
    default:
      return ['basic'];
  }
}

/**
 * RSA-SHA256 签名
 * @param {string} data - 要签名的数据
 * @returns {string} - Base64 编码的签名
 */
function signData(data) {
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(data);
  signer.end();

  return signer.sign(privateKey, 'base64');
}

/**
 * AES-256-GCM 加密
 * @param {object} data - 要加密的数据
 * @returns {string} - Base64 编码的加密数据
 */
function encryptAES(data) {
  const plaintext = JSON.stringify(data);

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', AES_KEY, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  const result = Buffer.concat([iv, authTag, encrypted]);

  return result.toString('base64');
}

/**
 * 生成授权文件
 * @param {string} machineCode - 机器码
 * @param {string} type - 授权类型
 * @param {string} duration - 有效期
 * @param {string} output - 输出路径
 */
function generateLicense(machineCode, type, duration, output) {
  loadKeys();

  const expiresAt = parseDuration(duration);
  const issuedAt = new Date();
  const features = getFeatures(type);

  // 授权数据
  const licenseData = {
    version: '1.0',
    machineCode: machineCode.toUpperCase(),
    licenseType: type,
    expiresAt: expiresAt.toISOString(),
    issuedAt: issuedAt.toISOString(),
    features
  };

  // 签名数据
  const dataToSign = JSON.stringify({
    version: licenseData.version,
    machineCode: licenseData.machineCode,
    licenseType: licenseData.licenseType,
    expiresAt: licenseData.expiresAt,
    issuedAt: licenseData.issuedAt,
    features: licenseData.features
  });

  licenseData.signature = signData(dataToSign);

  // 加密
  const encrypted = encryptAES(licenseData);

  // 写入文件
  const outputPath = output || `${machineCode.toUpperCase()}-${type}-${duration}.lic`;
  fs.writeFileSync(outputPath, encrypted, 'utf8');

  console.log('');
  console.log('✅ AIDM 授权文件已生成！');
  console.log(`   机器码: ${machineCode}`);
  console.log(`   类型: ${type}`);
  console.log(`   有效期: ${duration} (到期: ${expiresAt.toLocaleDateString('zh-CN')})`);
  console.log(`   功能: ${features.join(', ')}`);
  console.log(`   文件: ${outputPath}`);
  console.log('');
}

/**
 * 显示帮助
 */
function showHelp() {
  console.log('');
  console.log('AIDM License Generator - 授权文件生成工具');
  console.log('');
  console.log('用法:');
  console.log('  license-gen --machine <code> --type <type> --duration <time> [--output <path>]');
  console.log('  license-gen --generate-keys');
  console.log('  license-gen --help');
  console.log('');
  console.log('参数:');
  console.log('  --machine <code>    机器码（32位十六进制字符）');
  console.log('  --type <type>       授权类型: trial, standard, pro');
  console.log('  --duration <time>   有效期: 30d(天), 1m(月), 1y(年), 10y(十年)');
  console.log('  --output <path>     输出文件路径（可选，默认: <机器码>-<类型>-<有效期>.lic）');
  console.log('');
  console.log('授权类型说明:');
  console.log('  trial     试用版 - 基础功能，30天限制');
  console.log('  standard  标准版 - 基础+高级功能');
  console.log('  pro       专业版 - 全部功能（AI决策、导出、PowerBI等）');
  console.log('');
  console.log('示例:');
  console.log('  license-gen --machine 88594C5EF7B300AAE81A8337FE014C2F --type pro --duration 10y');
  console.log('  license-gen --machine 88594C5EF7B300AAE81A8337FE014C2F --type standard --duration 1y --output license.lic');
  console.log('');
}

// 主程序
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help')) {
  showHelp();
  process.exit(0);
}

if (args.includes('--generate-keys')) {
  generateKeys();
  process.exit(0);
}

// 解析参数
let machineCode = null;
let type = 'standard';
let duration = '1y';
let output = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--machine') {
    machineCode = args[i + 1];
    i++;
  } else if (args[i] === '--type') {
    type = args[i + 1];
    i++;
  } else if (args[i] === '--duration') {
    duration = args[i + 1];
    i++;
  } else if (args[i] === '--output') {
    output = args[i + 1];
    i++;
  }
}

if (!machineCode) {
  console.error('❌ 错误: 必须指定机器码 (--machine)');
  process.exit(1);
}

if (machineCode.length !== 32) {
  console.error('❌ 错误: 机器码长度应为 32 位');
  process.exit(1);
}

if (!['trial', 'standard', 'pro'].includes(type)) {
  console.error('❌ 错误: 授权类型应为 trial, standard 或 pro');
  process.exit(1);
}

generateLicense(machineCode, type, duration, output);