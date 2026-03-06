const fs = require("fs");
const path = require("path");

// 手动计算测试
const sampleModel = {
  nodes: {
    线索量: {
      id: '线索量',
      name: '线索量',
      type: 'driver',
      originalTimeData: {
        '1月实际': 4200,
        '2月实际': 4500,
        '3月实际': 4800,
        '4月实际': 5000,
        '5月实际': 5200,
        '6月实际': 4900,
        '7月实际': 5100,
        '8月实际': 5300,
        '9月预测': 5400,
        '10月预测': 5500,
        '11月预测': 5600,
        '12月预测': 5800,
      }
    },
    线索转化率: {
      id: '线索转化率',
      name: '线索转化率',
      type: 'driver',
      originalTimeData: {
        '1月实际': 23,
        '2月实际': 24,
        '3月实际': 25,
        '4月实际': 26,
        '5月实际': 25,
        '6月实际': 24,
        '7月实际': 26,
        '8月实际': 27,
        '9月预测': 27,
        '10月预测': 28,
        '11月预测': 28,
        '12月预测': 29,
      }
    },
    商机量: {
      id: '商机量',
      name: '商机量',
      type: 'computed',
      formula: 'MONTHLY_SUM(线索量 * 线索转化率) / 100',
      initialBaseline: 15938,
    },
    商机转化率: {
      id: '商机转化率',
      name: '商机转化率',
      type: 'driver',
      originalTimeData: {
        '1月实际': 38,
        '2月实际': 39,
        '3月实际': 40,
        '4月实际': 41,
        '5月实际': 40,
        '6月实际': 39,
        '7月实际': 41,
        '8月实际': 42,
        '9月预测': 42,
        '10月预测': 43,
        '11月预测': 43,
        '12月预测': 44,
      }
    },
    成交客户数: {
      id: '成交客户数',
      name: '成交客户数',
      type: 'computed',
      formula: 'MONTHLY_SUM(商机量 * 商机转化率) / 100',
    }
  }
};

console.log('=== 手动计算测试 ===\n');

// 1. 计算商机量的正确值
const clueData = sampleModel.nodes.线索量.originalTimeData;
const rateData = sampleModel.nodes.线索转化率.originalTimeData;

const months = [
  '1月实际','2月实际','3月实际','4月实际','5月实际','6月实际',
  '7月实际','8月实际','9月预测','10月预测','11月预测','12月预测'
];

console.log('1. 商机量计算 (线索量 * 线索转化率 / 100):');
let total = 0;
months.forEach(m => {
  const val = (clueData[m] * rateData[m]) / 100;
  total += val;
  console.log(`  ${m}: ${clueData[m]} * ${rateData[m]} / 100 = ${val}`);
});
console.log(`  → SUM = ${total} (正确值)\n`);

// 商机量正确值是 16027
console.log(`商机量正确值: ${total} (当前显示: ${sampleModel.nodes.商机量.initialBaseline})\n`);

// 2. 成交客户数计算
console.log('2. 成交客户数计算 (商机量聚合值 * 商机转化率平均值):');
const oppValue = total; // 16027
const convRateData = sampleModel.nodes.商机转化率.originalTimeData;
let convTotal = 0;
months.forEach(m => convTotal += convRateData[m]);
const avgConvRate = convTotal / months.length;

const dealValue = (oppValue * avgConvRate) / 100;
console.log(`  商机量 = ${oppValue}`);
console.log(`  平均商机转化率 = ${convTotal}/${months.length} = ${avgConvRate.toFixed(2)}%`);
console.log(`  → 成交客户数 = ${oppValue} * ${avgConvRate.toFixed(2)} / 100 = ${dealValue.toFixed(2)} (正确值)\n`);

console.log(`成交客户数正确值: ~${dealValue.toFixed(2)} (当前错误显示: 78852.84)\n`);

console.log('3. 问题分析:');
console.log('   78852.84 / 6613 ≈ 12 → 正好重复计算了12次！\n');
