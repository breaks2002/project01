/**
 * Excel 解析工具
 * 支持导入 .xlsx 和 .xls 格式的 Excel 文件
 */

import * as XLSX from 'xlsx';
import { csvToNodes, detectCSVStructure, isFormulaTable, validateFormulaTable, formulaTableToNodes } from './csvParser';

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

        // 获取第一个工作表
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // 将工作表转换为 JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        // 清理数据：将数字字符串转换为数字
        const cleanedData = jsonData.map(row => {
          const cleanedRow = {};
          Object.entries(row).forEach(([key, value]) => {
            if (typeof value === 'string') {
              // 尝试转换为数字
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

/**
 * 将 Excel 数据转换为 VDT 节点（复用 CSV 的解析逻辑）
 * @param {Array<Object>} excelData - 解析后的 Excel 数据
 * @param {string} nameColumn - 名称列
 * @param {Array<string>} valueColumns - 值列
 * @returns {Object} VDT 节点对象
 */
export function excelToNodes(excelData, nameColumn = '指标名称', valueColumns = []) {
  // 直接复用 csvToNodes 函数
  return csvToNodes(excelData, nameColumn, valueColumns);
}

/**
 * 检测 Excel 的列结构（复用 CSV 的检测逻辑）
 * @param {Array<Object>} excelData - 解析后的 Excel 数据
 * @returns {Object} 检测结果
 */
export function detectExcelStructure(excelData) {
  // 直接复用 detectCSVStructure 函数
  return detectCSVStructure(excelData);
}

/**
 * 检测是否为公式表（复用 CSV 的检测逻辑）
 */
export function isExcelFormulaTable(excelData) {
  return isFormulaTable(excelData);
}

/**
 * 校验公式表数据（复用 CSV 的校验逻辑）
 */
export function validateExcelFormulaTable(formulaData, dataTableData = null) {
  return validateFormulaTable(formulaData, dataTableData);
}

/**
 * 将公式表 Excel 转换为节点（复用 CSV 的转换逻辑）
 */
export function excelFormulaTableToNodes(formulaData, dataTableData, existingNodes = {}) {
  return formulaTableToNodes(formulaData, dataTableData, existingNodes);
}

/**
 * 获取 Excel 文件中的所有工作表名称
 * @param {File} file - Excel 文件对象
 * @returns {Promise<Array<string>>} 工作表名称列表
 */
export function getExcelSheetNames(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        resolve(workbook.SheetNames);
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

/**
 * 从指定工作表解析 Excel 数据
 * @param {File} file - Excel 文件对象
 * @param {string} sheetName - 工作表名称
 * @returns {Promise<Array<Object>>} 解析后的对象数组
 */
export function parseExcelSheet(file, sheetName) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[sheetName];

        if (!worksheet) {
          reject(new Error(`找不到工作表：${sheetName}`));
          return;
        }

        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        // 清理数据
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
