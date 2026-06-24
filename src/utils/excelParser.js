/**
 * Excel 解析工具
 * 支持导入 .xlsx 和 .xls 格式的 Excel 文件
 */

import * as XLSX from 'xlsx';

/**
 * 解析 Excel 文件为 JSON 数据
 * @param {File} file - Excel 文件对象
 * @returns {Promise<Array<Object>>} 解析后的对象数组
 */
export function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        // 清理数据：将数字字符串转换为数字
        const cleanedData = jsonData.map(row => {
          const cleanedRow = {};
          Object.entries(row).forEach(([key, value]) => {
            if (typeof value === 'string') {
              const trimmed = value.trim();
              const num = parseFloat(trimmed);
              if (!isNaN(num) && trimmed !== '' && !isNaN(parseInt(trimmed.charAt(0)))) {
                cleanedRow[key] = num;
              } else {
                cleanedRow[key] = value;
              }
            } else {
              cleanedRow[key] = value;
            }
          });
          return cleanedRow;
        });

        resolve(cleanedData);
      } catch (error) {
        reject(new Error('Excel 文件解析失败：' + error.message));
      }
    };

    reader.onerror = () => {
      reject(new Error('文件读取失败'));
    };

    reader.readAsArrayBuffer(file);
  });
}
