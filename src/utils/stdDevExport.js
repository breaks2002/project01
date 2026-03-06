import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';

/**
 * 导出标准差分析结果到 Excel
 */
export function exportStdDevToExcel(data, options, filename = '标准差分析.xlsx') {
  const wb = XLSX.utils.book_new();

  // Sheet1: 汇总结果
  const summaryData = data.map(d => ({
    '节点 ID': d.nodeId,
    '节点名称': d.nodeName,
    '节点类型': d.nodeType,
    '方案': d.scenarioId,
    '版本': d.isInitialVersion ? '初始' : '当前',
    'A-波动性 (标准差)': d.stdDevA?.toFixed(4) || '-',
    'A-波动性 (CV)': d.cvA?.toFixed(4) || '-',
    'B-偏离度 (标准差)': d.stdDevB?.toFixed(4) || '-',
    'B-偏离度 (CV)': d.cvB?.toFixed(4) || '-',
    '平均值': d.avg?.toFixed(2) || '-',
    '目标平均值': d.targetAvg?.toFixed(2) || '-',
    '象限': d.quadrant?.name || '-',
    '象限标签': d.quadrant?.label || '-',
    '洞察标题': d.insight?.title || '-',
    '洞察描述': d.insight?.desc || '-',
    '优先级': d.insight?.priority || '-',
    '数据月数': d.totalMonths || 0,
    '是否混合': d.isMixed ? '是' : '否',
    '实际月数': d.dataComposition?.actualCount || 0,
    '预测月数': d.dataComposition?.forecastCount || 0
  }));

  const wsSummary = XLSX.utils.json_to_sheet(summaryData);

  // 设置列宽
  const colWidths = [
    { wch: 15 }, // 节点 ID
    { wch: 20 }, // 节点名称
    { wch: 12 }, // 节点类型
    { wch: 15 }, // 方案
    { wch: 8 },  // 版本
    { wch: 15 }, // A-波动性 (标准差)
    { wch: 15 }, // A-波动性 (CV)
    { wch: 15 }, // B-偏离度 (标准差)
    { wch: 15 }, // B-偏离度 (CV)
    { wch: 12 }, // 平均值
    { wch: 12 }, // 目标平均值
    { wch: 10 }, // 象限
    { wch: 12 }, // 象限标签
    { wch: 20 }, // 洞察标题
    { wch: 40 }, // 洞察描述
    { wch: 8 },  // 优先级
    { wch: 8 },  // 数据月数
    { wch: 8 },  // 是否混合
    { wch: 8 },  // 实际月数
    { wch: 8 }   // 预测月数
  ];
  wsSummary['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, wsSummary, '汇总结果');

  // Sheet2: 明细数据
  const detailData = [];
  data.forEach(d => {
    if (d.monthlyData) {
      d.monthlyData.forEach(m => {
        detailData.push({
          '节点 ID': d.nodeId,
          '节点名称': d.nodeName,
          '方案': d.scenarioId,
          '版本': d.isInitialVersion ? '初始' : '当前',
          '月份': m.month,
          '值': m.value?.toFixed(2) || '-',
          '目标': m.target?.toFixed(2) || '-',
          '差额': m.deviation?.toFixed(2) || '-',
          '数据来源': m.source === 'actual' ? '实际' : '预测'
        });
      });
    }
  });

  const wsDetail = XLSX.utils.json_to_sheet(detailData);
  XLSX.utils.book_append_sheet(wb, wsDetail, '明细数据');

  // Sheet3: 配置信息
  const configData = [
    { '配置项': '数据模式', '值': options.dataMode === 'mixed' ? '混合（实际优先）' : options.dataMode === 'actual-only' ? '仅实际值' : '仅预测值' },
    { '配置项': '阈值 A', '值': options.thresholds?.A?.toFixed(2) || '0.10' },
    { '配置项': '阈值 B', '值': options.thresholds?.B?.toFixed(2) || '0.10' },
    { '配置项': '对比初始版本', '值': options.compareInitial ? '是' : '否' },
    { '配置项': '最少月份要求', '值': options.minMonths || 6 },
    { '配置项': '导出时间', '值': new Date().toLocaleString('zh-CN') }
  ];

  const wsConfig = XLSX.utils.json_to_sheet(configData);
  XLSX.utils.book_append_sheet(wb, wsConfig, '配置信息');

  // 导出
  XLSX.writeFile(wb, filename);
}

/**
 * 导出图表为图片
 */
export async function exportChartToImage(elementId, filename = '标准差分析图.png') {
  try {
    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error(`未找到元素：${elementId}`);
    }

    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: 2, // 高分辨率
      useCORS: true,
      logging: false
    });

    // 创建下载链接
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();

    return true;
  } catch (error) {
    console.error('导出图片失败:', error);
    alert('导出图片失败，请重试');
    return false;
  }
}

/**
 * 导出数据不足的报告
 */
export function exportInsufficientDataReport(data, filename = '数据不足报告.xlsx') {
  const insufficientData = data.filter(d => d.isInsufficient);

  if (insufficientData.length === 0) {
    alert('所有节点数据充足，无需导出报告');
    return;
  }

  const reportData = insufficientData.map(d => ({
    '节点 ID': d.nodeId,
    '节点名称': d.nodeName,
    '方案': d.scenarioId,
    '版本': d.isInitialVersion ? '初始' : '当前',
    '有效月数': d.totalMonths || 0,
    '实际月数': d.dataComposition?.actualCount || 0,
    '预测月数': d.dataComposition?.forecastCount || 0,
    '提示信息': d.message
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(reportData);
  XLSX.utils.book_append_sheet(wb, ws, '数据不足节点');

  XLSX.writeFile(wb, filename);
}
