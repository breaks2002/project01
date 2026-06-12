/**
 * 示例模型数据（使用新格式：202601-AC/FC/BU）
 */

// 时间数据映射工具函数
// actual: 8个值 -> 202601-AC ~ 202608-AC（实际期）
// forecast: 4个值 -> 202609-FC ~ 202612-FC（预测期）
// target: 12个值 -> 202601-BU ~ 202612-BU（目标值）
function makeTimeData(actual, forecast, target) {
  const data = {};
  const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

  // 实际数：前8个月 (202601-202608)
  actual.forEach((v, i) => {
    if (v !== undefined) data[`2026${months[i]}-AC`] = v;
  });

  // 初始预测数：后4个月 (202609-202612)
  forecast.forEach((v, i) => {
    if (v !== undefined) data[`2026${months[8 + i]}-FC`] = v;
  });

  // 目标数：全部12个月
  target.forEach((v, i) => {
    if (v !== undefined) data[`2026${months[i]}-BU`] = v;
  });

  return data;
}

/**
 * 销售漏斗模型
 * 包含：线索量 → 线索转化率 → 商机量 → 商机转化率 → 成交客户数 → 客单价 → 销售收入
 */
export const sampleSalesModel = {
  nodes: {
    线索量: {
      id: '线索量',
      name: '线索量',
      type: 'driver',
      level: '4',
      unit: '条',
      aggregationType: 'sum',
      value: 5000,
      baseline: 5000,
      range: { min: 2000, max: 10000 },
      format: '#,##0',
      position: { x: 100, y: 100 },
      timeData: makeTimeData(
        [4200, 4500, 4800, 5000, 5200, 4900, 5100, 5300],
        [5400, 5500, 5600, 5800],
        [4500, 4600, 4700, 4800, 4900, 5000, 5100, 5200, 5300, 5400, 5500, 5600]
      )
    },
    线索转化率: {
      id: '线索转化率',
      name: '线索转化率',
      type: 'driver',
      level: '4.1',
      unit: '%',
      aggregationType: 'average',
      value: 25,
      baseline: 25,
      range: { min: 15, max: 40 },
      format: '#,##0',
      position: { x: 100, y: 300 },
      timeData: makeTimeData(
        [23, 24, 25, 26, 25, 24, 26, 27],
        [27, 28, 28, 29],
        [25, 25, 25, 26, 26, 26, 27, 27, 27, 28, 28, 28]
      )
    },
    商机量: {
      id: '商机量',
      name: '商机量',
      type: 'computed',
      level: '3',
      unit: '个',
      formula: '线索量 * 线索转化率 / 100',
      value: 1250,
      baseline: 1200,
      format: '#,##0',
      dependsOn: ['线索量', '线索转化率'],
      position: { x: 450, y: 180 }
    },
    商机转化率: {
      id: '商机转化率',
      name: '商机转化率',
      type: 'driver',
      level: '3.1',
      unit: '%',
      aggregationType: 'average',
      value: 40,
      baseline: 40,
      range: { min: 25, max: 60 },
      format: '#,##0',
      position: { x: 450, y: 380 },
      timeData: makeTimeData(
        [38, 39, 40, 41, 40, 39, 41, 42],
        [42, 43, 43, 44],
        [40, 40, 41, 41, 42, 42, 43, 43, 44, 44, 45, 45]
      )
    },
    成交客户数: {
      id: '成交客户数',
      name: '成交客户数',
      type: 'computed',
      level: '2',
      unit: '个',
      formula: '商机量 * 商机转化率 / 100',
      value: 500,
      baseline: 480,
      format: '#,##0',
      dependsOn: ['商机量', '商机转化率'],
      position: { x: 800, y: 260 }
    },
    客单价: {
      id: '客单价',
      name: '客单价',
      type: 'driver',
      level: '2.1',
      unit: '万元',
      aggregationType: 'average',
      value: 2.5,
      baseline: 2.5,
      range: { min: 1, max: 10 },
      format: '#,##0.00',
      position: { x: 800, y: 460 },
      timeData: makeTimeData(
        [2.3, 2.4, 2.5, 2.6, 2.5, 2.4, 2.6, 2.7],
        [2.7, 2.8, 2.8, 2.9],
        [2.5, 2.5, 2.6, 2.6, 2.7, 2.7, 2.8, 2.8, 2.9, 2.9, 3.0, 3.0]
      )
    },
    销售收入: {
      id: '销售收入',
      name: '销售收入',
      type: 'computed',
      level: '1',
      unit: '万元',
      formula: '成交客户数 * 客单价',
      value: 1250,
      baseline: 1200,
      format: '#,##0',
      dependsOn: ['成交客户数', '客单价'],
      position: { x: 1150, y: 340 }
    }
  }
};

/**
 * 利润表模型
 * 包含：营业收入 → 营业成本 → 各项费用 → 毛利润 → 营业利润 → 净利润
 */
export const sampleProfitModel = {
  nodes: {
    营业收入: {
      id: '营业收入',
      name: '营业收入',
      type: 'driver',
      level: '4.1',
      unit: '万元',
      aggregationType: 'sum',
      value: 1450,
      baseline: 1450,
      range: { min: 830, max: 2000 },
      format: '#,##0',
      position: { x: 100, y: 150 },
      timeData: makeTimeData(
        [80, 90, 100, 110, 105, 95, 120, 130],
        [140, 150, 160, 170],
        [100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155]
      )
    },
    营业成本: {
      id: '营业成本',
      name: '营业成本',
      type: 'driver',
      level: '4.2',
      unit: '万元',
      aggregationType: 'sum',
      value: 725,
      baseline: 725,
      range: { min: 415, max: 1000 },
      format: '#,##0',
      position: { x: 100, y: 350 },
      timeData: makeTimeData(
        [40, 45, 50, 55, 52, 48, 60, 65],
        [70, 75, 80, 85],
        [50, 53, 55, 58, 60, 63, 65, 68, 70, 73, 75, 78]
      )
    },
    销售费用: {
      id: '销售费用',
      name: '销售费用',
      type: 'driver',
      level: '3.2',
      unit: '万元',
      aggregationType: 'sum',
      value: 231,
      baseline: 231,
      range: { min: 131, max: 500 },
      format: '#,##0',
      position: { x: 100, y: 550 },
      timeData: makeTimeData(
        [12, 14, 16, 18, 17, 15, 19, 20],
        [22, 24, 26, 28],
        [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26]
      )
    },
    管理费用: {
      id: '管理费用',
      name: '管理费用',
      type: 'driver',
      level: '3.3',
      unit: '万元',
      aggregationType: 'sum',
      value: 144,
      baseline: 144,
      range: { min: 82, max: 300 },
      format: '#,##0',
      position: { x: 100, y: 750 },
      timeData: makeTimeData(
        [8, 9, 10, 11, 10, 9, 12, 13],
        [14, 15, 16, 17],
        [10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15]
      )
    },
    毛利润: {
      id: '毛利润',
      name: '毛利润',
      type: 'computed',
      level: '3.1',
      unit: '万元',
      formula: '营业收入 - 营业成本',
      value: 725,
      baseline: 600,
      format: '#,##0',
      dependsOn: ['营业收入', '营业成本'],
      position: { x: 550, y: 200 }
    },
    营业利润: {
      id: '营业利润',
      name: '营业利润',
      type: 'computed',
      level: '2',
      unit: '万元',
      formula: '毛利润 - 销售费用 - 管理费用',
      value: 350,
      baseline: 300,
      format: '#,##0',
      dependsOn: ['毛利润', '销售费用', '管理费用'],
      position: { x: 900, y: 350 }
    },
    净利润: {
      id: '净利润',
      name: '净利润',
      type: 'computed',
      level: '1',
      unit: '万元',
      formula: '营业利润 * 0.75',
      value: 262.5,
      baseline: 225,
      format: '#,##0',
      dependsOn: ['营业利润'],
      position: { x: 1200, y: 400 }
    }
  }
};
