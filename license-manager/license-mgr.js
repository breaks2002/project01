#!/usr/bin/env node

/**
 * AIDM License Manager
 * 本地授权管理工具 - 管理授权记录、查询状态、生成授权
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// SQLite 数据库（使用文件存储）
const DB_PATH = path.join(__dirname, 'licenses.json');

// 密钥路径
const KEYS_DIR = path.join(__dirname, '../license-generator/keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private.pem');

// AES 密钥（32字节 = 256位，与 Electron 应用中相同）
const AES_KEY = Buffer.from('AIDM2026SecretKeyForAES256Encry!', 'utf8').slice(0, 32);

// 加载授权数据库
function loadDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    return { licenses: [] };
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

// 保存授权数据库
function saveDatabase(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

// 加载私钥
function loadPrivateKey() {
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    throw new Error('私钥不存在，请先运行 license-gen --generate-keys');
  }
  return fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
}

// 解析有效期
function parseDuration(duration) {
  const now = new Date();
  const match = duration.match(/^(\d+)(m|y|d)$/);
  if (!match) throw new Error('有效期格式错误，应为: 30d, 1m, 1y 等');

  const value = parseInt(match[1]);
  const unit = match[2];

  if (unit === 'd') now.setDate(now.getDate() + value);
  else if (unit === 'm') now.setMonth(now.getMonth() + value);
  else if (unit === 'y') now.setFullYear(now.getFullYear() + value);

  return now;
}

// RSA 签名
function signData(data) {
  const privateKey = loadPrivateKey();
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(data);
  signer.end();
  return signer.sign(privateKey, 'base64');
}

// AES 加密
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

// 生成授权
function generateLicense(machineCode, type, duration, output) {
  const expiresAt = parseDuration(duration);
  const issuedAt = new Date();

  const features = {
    trial: ['basic'],
    standard: ['basic', 'advanced'],
    pro: ['basic', 'advanced', 'ai']
  }[type] || ['basic'];

  const licenseData = {
    version: '1.0',
    machineCode: machineCode.toUpperCase(),
    licenseType: type,
    expiresAt: expiresAt.toISOString(),
    issuedAt: issuedAt.toISOString(),
    features
  };

  const dataToSign = JSON.stringify({
    version: licenseData.version,
    machineCode: licenseData.machineCode,
    licenseType: licenseData.licenseType,
    expiresAt: licenseData.expiresAt,
    issuedAt: licenseData.issuedAt,
    features: licenseData.features
  });

  licenseData.signature = signData(dataToSign);

  const encrypted = encryptAES(licenseData);
  const outputPath = output || `${machineCode.toUpperCase()}-${type}-${duration}.lic`;
  fs.writeFileSync(outputPath, encrypted, 'utf8');

  // 保存到数据库
  const db = loadDatabase();
  db.licenses.push({
    machineCode: machineCode.toUpperCase(),
    type,
    duration,
    expiresAt: expiresAt.toISOString(),
    issuedAt: issuedAt.toISOString(),
    filePath: outputPath
  });
  saveDatabase(db);

  console.log(`✅ AIDM 授权已生成: ${outputPath}`);
  console.log(`   机器码: ${machineCode}`);
  console.log(`   类型: ${type}`);
  console.log(`   到期: ${expiresAt.toLocaleDateString('zh-CN')}`);
}

// 查询授权
function queryLicense(machineCode) {
  const db = loadDatabase();
  const found = db.licenses.filter(l => l.machineCode === machineCode.toUpperCase());

  if (found.length === 0) {
    console.log('❌ 未找到授权记录');
    return;
  }

  console.log(`\n找到 ${found.length} 条授权记录:\n`);
  found.forEach((l, i) => {
    const expires = new Date(l.expiresAt);
    const daysLeft = Math.ceil((expires - new Date()) / (1000 * 60 * 60 * 24));
    const status = daysLeft > 0 ? '✅ 有效' : '❌ 已过期';

    console.log(`${i + 1}. ${l.machineCode}`);
    console.log(`   类型: ${l.type}`);
    console.log(`   状态: ${status}`);
    console.log(`   到期: ${expires.toLocaleDateString('zh-CN')} (${daysLeft > 0 ? `剩余 ${daysLeft} 天` : '已过期'})`);
    console.log(`   文件: ${l.filePath}`);
    console.log('');
  });
}

// 列出所有授权
function listAll() {
  const db = loadDatabase();
  if (db.licenses.length === 0) {
    console.log('暂无授权记录');
    return;
  }

  console.log(`\n共 ${db.licenses.length} 条授权记录:\n`);

  db.licenses.forEach((l, i) => {
    const expires = new Date(l.expiresAt);
    const daysLeft = Math.ceil((expires - new Date()) / (1000 * 60 * 60 * 24));
    const status = daysLeft > 0 ? '✅' : '❌';

    console.log(`${status} ${i + 1}. ${l.machineCode} | ${l.type} | ${expires.toLocaleDateString('zh-CN')}`);
  });
  console.log('');
}

// 显示帮助
function showHelp() {
  console.log(`
AIDM License Manager - 授权管理工具

命令:
  list                    列出所有授权记录
  query <machineCode>     查询指定机器码的授权
  gen <machine> <type> <duration> [output]  生成授权
  help                    显示帮助

授权类型:
  trial     试用版 - 基础功能，30天限制
  standard  标准版 - 基础+高级功能
  pro       专业版 - 全部功能

有效期格式:
  30d - 30天
  1m  - 1个月
  1y  - 1年
  10y - 10年

示例:
  license-mgr list
  license-mgr query 88594C5EF7B300AAE81A8337FE014C2F
  license-mgr gen 88594C5EF7B300AAE81A8337FE014C2F pro 10y license.lic
`);
}

// 创建交互式界面
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt() {
  rl.question('\n> ', (input) => {
    const args = input.trim().split(' ');
    const cmd = args[0];

    switch (cmd) {
      case 'list':
        listAll();
        prompt();
        break;
      case 'query':
        if (args[1]) {
          queryLicense(args[1]);
        } else {
          console.log('请指定机器码');
        }
        prompt();
        break;
      case 'gen':
        if (args.length >= 4) {
          generateLicense(args[1], args[2], args[3], args[4]);
        } else {
          console.log('用法: gen <machine> <type> <duration> [output]');
        }
        prompt();
        break;
      case 'help':
        showHelp();
        prompt();
        break;
      case 'exit':
        rl.close();
        break;
      default:
        showHelp();
        prompt();
    }
  });
}

// 主程序
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('AIDM License Manager - 授权管理工具');
  showHelp();
  prompt();
} else {
  const cmd = args[0];

  switch (cmd) {
    case 'list':
      listAll();
      break;
    case 'query':
      queryLicense(args[1]);
      break;
    case 'gen':
      generateLicense(args[1], args[2], args[3], args[4]);
      break;
    case 'help':
      showHelp();
      break;
    default:
      showHelp();
  }
  process.exit(0);
}