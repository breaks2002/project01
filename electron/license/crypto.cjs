const crypto = require('crypto');

// AES 密钥（32字节 = 256位）
// 注意：生产环境应从安全配置中读取，不应硬编码
const AES_KEY = Buffer.from('AIDM2026SecretKeyForAES256Encry!', 'utf8').slice(0, 32);

// RSA 公钥（用于验证签名，嵌入应用中）
const RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAjV1HdyMQpFf7K5hhIldn
aCrixmcFcD2R/+dRAq3kxBVxfsaDJnf3GUW0vVGB78lrB+b47JBifPtZl1Cmq9mU
UXMOXRH5IujLofuhACHczYSbCA+RxpndCGGAP0UbWCuOOsZlQLxesa5mwr1Mjsi3
M/0VlFvnXs1+mwcsWRUJ1KL9XPHd2Oo0NHORNJZbbp4KoeehwlKNBdbp253V+ZKN
bFpjzXQYsDz6JtarrDkTdjYyiM4lJ0VbCdI2XG3OaPHqvRmOBwvLNxuQ3BF0QH5E
tJan6pivqQrPceruEbmI1FiVxZtCXcb7YhIrIzvj3ADeYszFgUJI91b965rzT7dC
rwIDAQAB
-----END PUBLIC KEY-----`;

/**
 * AES-256-GCM 加密
 * @param {string|object} data - 要加密的数据
 * @returns {string} - Base64 编码的加密数据
 */
function encryptAES(data) {
  const plaintext = typeof data === 'string' ? data : JSON.stringify(data);

  // 生成随机 IV（12字节，GCM 推荐）
  const iv = crypto.randomBytes(12);

  // 创建加密器
  const cipher = crypto.createCipheriv('aes-256-gcm', AES_KEY, iv);

  // 加密
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);

  // 获取认证标签
  const authTag = cipher.getAuthTag();

  // 组合：IV + AuthTag + Encrypted
  const result = Buffer.concat([iv, authTag, encrypted]);

  return result.toString('base64');
}

/**
 * AES-256-GCM 解密
 * @param {string} encryptedData - Base64 编码的加密数据
 * @returns {object|string} - 解密后的数据
 */
function decryptAES(encryptedData) {
  const buffer = Buffer.from(encryptedData, 'base64');

  // 解析：IV(12) + AuthTag(16) + Encrypted
  const iv = buffer.slice(0, 12);
  const authTag = buffer.slice(12, 28);
  const encrypted = buffer.slice(28);

  // 创建解密器
  const decipher = crypto.createDecipheriv('aes-256-gcm', AES_KEY, iv);
  decipher.setAuthTag(authTag);

  // 解密
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);

  const text = decrypted.toString('utf8');

  // 尝试解析 JSON
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * RSA-SHA256 签名验证
 * @param {string} data - 原始数据
 * @param {string} signature - Base64 编码的签名
 * @returns {boolean} - 签名是否有效
 */
function verifySignature(data, signature) {
  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(data);
    verifier.end();

    const sigBuffer = Buffer.from(signature, 'base64');
    return verifier.verify(RSA_PUBLIC_KEY, sigBuffer);
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

/**
 * 生成随机授权码
 * @returns {string} - 16位授权码
 */
function generateLicenseKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = '';
  for (let i = 0; i < 16; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
    if (i === 3 || i === 7 || i === 11) {
      key += '-';
    }
  }
  return key; // 格式: XXXX-XXXX-XXXX-XXXX
}

module.exports = {
  encryptAES,
  decryptAES,
  verifySignature,
  generateLicenseKey,
  RSA_PUBLIC_KEY
};