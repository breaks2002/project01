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

const months = [
  '1月实际','2月实际','3月实际','4月实际','5月实际','6月实际',
  '7月实际','8月实际','9月预测','10月预测','11月预测','12月预测'
];

console.log('=== 正确计算方式 ===\n');

// 1. 先计算商机量的各月值和总和
console.log('1. 商机量各月计算:');
const oppMonthlyValues = [];
let oppTotal = 0;
months.forEach(m => {
  const val = (sampleModel.nodes.线索量.originalTimeData[m] * sampleModel.nodes.线索转化率.originalTimeData[m]) / 100;
  oppMonthlyValues.push(val);
  oppTotal += val;
  console.log(`  ${m}: ${val.toFixed(2)}`);
});
console.log(`  → 商机量 SUM = ${oppTotal.toFixed(2)} (正确值)\n`);

// 2. 计算成交客户数的各月值（用商机量的各月值，而不是总和！）
console.log('2. 成交客户数各月计算 (用商机量各月值 * 商机转化率各月值 / 100):');
const dealMonthlyValues = [];
let dealTotal = 0;
months.forEach((m, i) => {
  const oppVal = oppMonthlyValues[i];
  const convVal = sampleModel.nodes.商机转化率.originalTimeData[m];
  const val = (oppVal * convVal) / 100;
  dealMonthlyValues.push(val);
  dealTotal += val;
  console.log(`  ${m}: ${oppVal.toFixed(2)} * ${convVal} / 100 = ${val.toFixed(4)}`);
});
console.log(`  → 成交客户数 SUM = ${dealTotal.toFixed(4)} (正确值)\n`);

console.log('=== 问题分析 ===');
console.log('当前代码的问题:');
console.log('  - 当计算 MONTHLY_SUM(商机量 * 商机转化率) 时');
console.log('  - 代码检测到商机量是 MONTHLY 节点，于是只用商机量的聚合值(16027)计算一次');
console.log('  - 但正确的做法是：虽然商机量是 MONTHLY 节点，但它有 timeData 存储了各月值！');
console.log('  - 我们应该用商机量的 timeData 各月值来计算，而不是只用聚合值！\n');

console.log('=== 结论 ===');
console.log('正确值:');
console.log(`  - 商机量: ${oppTotal.toFixed(2)}`);
console.log(`  - 成交客户数: ${dealTotal.toFixed(4)} (约 ${Math.round(dealTotal)})\n`);
