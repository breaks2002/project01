/**
 * 创建Excel测试数据文件的脚本
 */

import * as XLSX from 'xlsx';
import fs from 'fs';
import { parseCSV } from './src/utils/csvParser.js';

// 读取CSV文件内容
function readCSVFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseCSV(content);
}

// 创建Excel文件
function createExcelFile(data, outputPath) {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  XLSX.writeFile(workbook, outputPath);
  console.log(`✅ 创建文件: ${outputPath}`);
}

// 主函数
async function main() {
  console.log('开始创建Excel测试数据文件...\n');

  try {
    // 1. 公式表
    const formulaData = readCSVFile('./利润表测试数据_公式表.csv');
    createExcelFile(formulaData, './利润表测试数据_公式表.xlsx');

    // 2. 完整版
    const fullData = readCSVFile('./利润表测试数据_完整版.csv');
    createExcelFile(fullData, './利润表测试数据_完整版.xlsx');

    // 3. 简单版
    const simpleData = readCSVFile('./利润表测试数据.csv');
    createExcelFile(simpleData, './利润表测试数据.xlsx');

    console.log('\n🎉 所有Excel文件创建完成！');
  } catch (error) {
    console.error('❌ 创建失败:', error.message);
    process.exit(1);
  }
}

main();
