/**
 * 文档解析工具
 * 支持PDF、Word、Excel、TXT、MD等格式的文本提取
 */

/**
 * 读取文本文件（TXT、MD）
 * @param {File} file - 文件对象
 * @returns {Promise<string>} 文件内容
 */
const readTextFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(new Error('读取文件失败'));
    reader.readAsText(file);
  });
};

/**
 * 尝试从Excel文件提取文本
 * 注意：这是一个简化版本，实际项目中可以使用xlsx库
 * @param {File} file - 文件对象
 * @returns {Promise<string>} 提取的文本
 */
const readExcelFile = async (file) => {
  // 简化处理：读取为文本并提取可识别的内容
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = e.target.result;
        // Excel文件是二进制格式，尝试提取文本内容
        const text = extractTextFromBinary(result);
        resolve(text || `[Excel文件: ${file.name}]\n（建议手动复制关键内容粘贴到输入框）`);
      } catch (err) {
        resolve(`[Excel文件: ${file.name}]\n（建议手动复制关键内容粘贴到输入框）`);
      }
    };
    reader.onerror = () => {
      resolve(`[Excel文件: ${file.name}]\n（建议手动复制关键内容粘贴到输入框）`);
    };
    reader.readAsBinaryString(file);
  });
};

/**
 * 尝试从Word文件提取文本
 * @param {File} file - 文件对象
 * @returns {Promise<string>} 提取的文本
 */
const readWordFile = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = e.target.result;
        const text = extractTextFromBinary(result);
        resolve(text || `[Word文件: ${file.name}]\n（建议手动复制关键内容粘贴到输入框）`);
      } catch (err) {
        resolve(`[Word文件: ${file.name}]\n（建议手动复制关键内容粘贴到输入框）`);
      }
    };
    reader.onerror = () => {
      resolve(`[Word文件: ${file.name}]\n（建议手动复制关键内容粘贴到输入框）`);
    };
    reader.readAsBinaryString(file);
  });
};

/**
 * 尝试从PDF文件提取文本
 * @param {File} file - 文件对象
 * @returns {Promise<string>} 提取的文本
 */
const readPDFFile = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = e.target.result;
        // 尝试提取PDF中的文本内容
        const text = extractPDFText(result);
        resolve(text || `[PDF文件: ${file.name}]\n（建议手动复制关键内容粘贴到输入框）`);
      } catch (err) {
        resolve(`[PDF文件: ${file.name}]\n（建议手动复制关键内容粘贴到输入框）`);
      }
    };
    reader.onerror = () => {
      resolve(`[PDF文件: ${file.name}]\n（建议手动复制关键内容粘贴到输入框）`);
    };
    reader.readAsText(file);
  });
};

/**
 * 从二进制数据中提取可读文本
 * @param {string} binary - 二进制字符串
 * @returns {string|null} 提取的文本
 */
const extractTextFromBinary = (binary) => {
  if (!binary) return null;

  // 尝试提取连续的ASCII可打印字符
  const textParts = [];
  let currentPart = '';

  for (let i = 0; i < binary.length; i++) {
    const char = binary[i];
    const code = binary.charCodeAt(i);

    // 只保留可打印字符（包括中文）
    if ((code >= 32 && code <= 126) || code > 127) {
      currentPart += char;
    } else {
      if (currentPart.length > 3) {
        textParts.push(currentPart);
      }
      currentPart = '';
    }
  }

  if (currentPart.length > 3) {
    textParts.push(currentPart);
  }

  // 过滤出有意义的文本段落
  const meaningfulParts = textParts.filter(part => {
    // 至少有5个字符，且包含字母或中文
    return part.length >= 5 && /[\u4e00-\u9fa5a-zA-Z]/.test(part);
  });

  if (meaningfulParts.length === 0) return null;

  // 去重并合并
  const uniqueParts = [...new Set(meaningfulParts)];
  return uniqueParts.join('\n');
};

/**
 * 从PDF内容中提取文本（简化版）
 * @param {string} content - PDF内容
 * @returns {string|null} 提取的文本
 */
const extractPDFText = (content) => {
  if (!content) return null;

  // PDF中的文本通常包含在特定标记中
  // 尝试提取stream和endstream之间的内容
  const textParts = [];
  const streamRegex = /stream\s*([\s\S]*?)\s*endstream/g;
  let match;

  while ((match = streamRegex.exec(content)) !== null) {
    const stream = match[1];
    // 清理二进制数据，保留文本
    const cleaned = stream.replace(/[^\x20-\x7E\u4e00-\u9fa5\s]/g, ' ').trim();
    if (cleaned.length > 10) {
      textParts.push(cleaned);
    }
  }

  // 同时尝试提取括号内的文本（PDF文本对象）
  const textRegex = /\(([^)]{3,})\)/g;
  while ((match = textRegex.exec(content)) !== null) {
    const text = match[1];
    if (/[\u4e00-\u9fa5a-zA-Z]/.test(text)) {
      textParts.push(text);
    }
  }

  if (textParts.length === 0) return null;

  // 合并并清理
  const combined = textParts.join(' ');
  // 去除多余的空格
  return combined.replace(/\s+/g, ' ').trim();
};

/**
 * 解析文档
 * @param {File} file - 文件对象
 * @returns {Promise<Object>} 解析结果
 */
export const parseDocument = async (file) => {
  if (!file) {
    throw new Error('请提供文件');
  }

  const fileName = file.name.toLowerCase();
  const fileType = file.type;

  let content = '';
  let type = 'unknown';

  try {
    // 根据文件扩展名或类型选择解析方式
    if (fileName.endsWith('.txt') || fileName.endsWith('.md') ||
        fileType === 'text/plain' || fileType === 'text/markdown') {
      type = 'text';
      content = await readTextFile(file);
    }
    else if (fileName.endsWith('.csv')) {
      type = 'csv';
      content = await readTextFile(file);
    }
    else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') ||
             fileType.includes('excel') || fileType.includes('spreadsheet')) {
      type = 'excel';
      content = await readExcelFile(file);
    }
    else if (fileName.endsWith('.docx') || fileName.endsWith('.doc') ||
             fileType.includes('word')) {
      type = 'word';
      content = await readWordFile(file);
    }
    else if (fileName.endsWith('.pdf') || fileType === 'application/pdf') {
      type = 'pdf';
      content = await readPDFFile(file);
    }
    else {
      // 尝试作为文本读取
      try {
        type = 'text';
        content = await readTextFile(file);
      } catch {
        type = 'unknown';
        content = `[无法解析的文件: ${file.name}]\n支持的格式：TXT、MD、CSV、Excel、Word、PDF`;
      }
    }

    // 清理内容
    content = cleanContent(content);

    return {
      success: true,
      fileName: file.name,
      fileType: type,
      content: content,
      size: file.size,
      preview: content.substring(0, 500) + (content.length > 500 ? '...' : '')
    };

  } catch (error) {
    return {
      success: false,
      fileName: file.name,
      fileType: type,
      error: error.message,
      content: `[解析失败: ${file.name}]\n错误：${error.message}`
    };
  }
};

/**
 * 清理提取的内容
 * @param {string} content - 原始内容
 * @returns {string} 清理后的内容
 */
const cleanContent = (content) => {
  if (!content) return '';

  return content
    // 去除多余的空白字符
    .replace(/\s+/g, ' ')
    // 去除控制字符
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    // 去除重复的换行
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    // 去除行首行尾空白
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
};

/**
 * 提取关键业务信息
 * @param {string} content - 文档内容
 * @returns {Object} 提取的关键信息
 */
export const extractKeyInformation = (content) => {
  if (!content) return null;

  const lines = content.split('\n').filter(line => line.trim());

  // 提取数字信息
  const numbers = [];
  const numberRegex = /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(万|亿|千|百万|千万|元|百分比|%)?/g;
  let match;
  while ((match = numberRegex.exec(content)) !== null) {
    numbers.push({
      value: match[1],
      unit: match[2] || '',
      context: content.substring(Math.max(0, match.index - 30), match.index + match[0].length + 30)
    });
  }

  // 提取时间信息
  const timeInfo = [];
  const timePatterns = [
    { regex: /Q[1-4]|第[一二三四]季度/g, type: 'quarter' },
    { regex: /\d{4}年|\d{2}年/g, type: 'year' },
    { regex: /\d{1,2}月/g, type: 'month' },
    { regex: /上半年|下半年/g, type: 'half' }
  ];

  timePatterns.forEach(pattern => {
    const matches = content.match(pattern.regex);
    if (matches) {
      timeInfo.push(...matches.map(m => ({ value: m, type: pattern.type })));
    }
  });

  // 提取关键词
  const keywords = [];
  const keywordPatterns = [
    '目标', '计划', '预算', '增长', '提高', '降低', '控制', '优化',
    '销售', '成本', '费用', '利润', '收入', '市场', '客户',
    'Q1', 'Q2', 'Q3', 'Q4', '年度', '季度'
  ];

  keywordPatterns.forEach(keyword => {
    if (content.includes(keyword)) {
      const count = (content.match(new RegExp(keyword, 'g')) || []).length;
      if (count > 0) {
        keywords.push({ word: keyword, count });
      }
    }
  });

  // 生成摘要
  const summary = generateDocumentSummary(lines, keywords, timeInfo);

  return {
    lineCount: lines.length,
    charCount: content.length,
    numbers: numbers.slice(0, 20), // 限制数量
    timeInfo: [...new Set(timeInfo.map(t => t.value))],
    keywords: keywords.sort((a, b) => b.count - a.count).slice(0, 10),
    summary
  };
};

/**
 * 生成文档摘要
 * @param {Array} lines - 文本行
 * @param {Array} keywords - 关键词
 * @param {Array} timeInfo - 时间信息
 * @returns {string} 摘要
 */
const generateDocumentSummary = (lines, keywords, timeInfo) => {
  const parts = [];

  if (timeInfo.length > 0) {
    const uniqueTimes = [...new Set(timeInfo.map(t => t.value))].slice(0, 3);
    parts.push(`时间范围：${uniqueTimes.join('、')}`);
  }

  if (keywords.length > 0) {
    const topKeywords = keywords
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(k => k.word);
    parts.push(`关键词：${topKeywords.join('、')}`);
  }

  if (lines.length > 0) {
    // 尝试找到标题行（短且有意义）
    const titleCandidates = lines
      .filter(line => line.length < 50 && line.length > 5)
      .slice(0, 3);
    if (titleCandidates.length > 0) {
      parts.push(`主要内容：${titleCandidates.join('；')}`);
    }
  }

  return parts.join('\n');
};

/**
 * 支持的文件类型
 */
export const SUPPORTED_FILE_TYPES = [
  { extension: '.txt', mime: 'text/plain', name: '文本文件' },
  { extension: '.md', mime: 'text/markdown', name: 'Markdown' },
  { extension: '.csv', mime: 'text/csv', name: 'CSV文件' },
  { extension: '.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: 'Excel文件' },
  { extension: '.xls', mime: 'application/vnd.ms-excel', name: 'Excel文件' },
  { extension: '.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', name: 'Word文件' },
  { extension: '.doc', mime: 'application/msword', name: 'Word文件' },
  { extension: '.pdf', mime: 'application/pdf', name: 'PDF文件' }
];

/**
 * 检查文件类型是否支持
 * @param {File} file - 文件对象
 * @returns {boolean} 是否支持
 */
export const isSupportedFileType = (file) => {
  if (!file) return false;

  const fileName = file.name.toLowerCase();
  return SUPPORTED_FILE_TYPES.some(type =>
    fileName.endsWith(type.extension) || file.type === type.mime
  );
};

/**
 * 获取文件类型的显示名称
 * @param {File} file - 文件对象
 * @returns {string} 显示名称
 */
export const getFileTypeName = (file) => {
  if (!file) return '未知';

  const fileName = file.name.toLowerCase();
  const type = SUPPORTED_FILE_TYPES.find(t =>
    fileName.endsWith(t.extension) || file.type === t.mime
  );

  return type?.name || file.type || '未知类型';
};

// 默认导出
export default {
  parseDocument,
  extractKeyInformation,
  isSupportedFileType,
  getFileTypeName,
  SUPPORTED_FILE_TYPES
};
