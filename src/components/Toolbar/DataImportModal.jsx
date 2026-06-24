import React, { useState, useCallback } from 'react';
import { parseCSV, isFormulaTable, validateFormulaTable, isWideTable } from '../../utils/csvParser';
import { parseExcel } from '../../utils/excelParser';

const DataImportModal = ({ onClose, onImport, existingNodesCount = 0, existingNodes = {} }) => {
  const [step, setStep] = useState(1);
  const [rawData, setRawData] = useState([]);
  const [rawDataFile, setRawDataFile] = useState(null);
  const [formulaRawFile, setFormulaRawFile] = useState(null);
  const [isFormulaMode, setIsFormulaMode] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [importMode, setImportMode] = useState('append');
  const [fileType, setFileType] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dataRawData, setDataRawData] = useState([]);

  const getFileType = (fileName) => {
    const ext = fileName.toLowerCase().split('.').pop();
    if (ext === 'csv') return 'csv';
    if (ext === 'xlsx' || ext === 'xls') return 'excel';
    return null;
  };

  /**
   * 检测列名是否包含空格或全角字符，返回异常列名列表
   */
  const checkColumnNames = (data) => {
    if (!data || data.length === 0) return [];
    const headers = Object.keys(data[0]);
    const issues = [];
    headers.forEach(h => {
      if (h.includes(' ')) issues.push(`"${h}" 包含空格`);
      if (/[！-～]/.test(h)) issues.push(`"${h}" 包含全角字符`);
    });
    return issues;
  };

  const handleFileUpload = useCallback(async (e, isDataTable = false) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    const type = getFileType(file.name);
    setFileType(type);

    // 保存文件引用
    if (!isDataTable) {
      setRawDataFile(file);
    } else {
      setFormulaRawFile(file);
    }

    try {
      let data;

      if (type === 'csv') {
        const text = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target.result);
          reader.onerror = reject;
          reader.readAsText(file);
        });
        data = parseCSV(text);
      } else if (type === 'excel') {
        data = await parseExcel(file);
      } else {
        alert('不支持的文件格式');
        setLoading(false);
        return;
      }

      // 列名校验：检测空格和全角字符，给出友好提示
      const colIssues = checkColumnNames(data);
      if (colIssues.length > 0) {
        alert('⚠️ 检测到列名格式问题：\n\n' + colIssues.join('\n') + '\n\n系统已自动处理，无需手动修改。');
      }

      if (isDataTable) {
        setDataRawData(data);
      } else {
        setRawData(data);

        // 检查是否为公式表
        if (isFormulaTable(data)) {
          setIsFormulaMode(true);
          const validation = validateFormulaTable(data, dataRawData.length > 0 ? dataRawData : null);
          setValidationResult(validation);
          if (validation.valid) {
            setStep(2);
          }
        } else if (isWideTable(data)) {
          // 宽表格式（有 指标ID/指标名称/属性 列），直接到确认
          setIsFormulaMode(false);
          setStep(2);
        } else {
          // 非标准格式，不支持
          alert('️ 文件格式不被支持\n\n数据表需要包含「指标ID」「指标名称」「属性」三列，且属性值为 AC/FC/BU。\n公式表需要包含「指标ID」「指标名称」「节点类型」「公式」列。\n\n请参考导出模板的格式。');
          setLoading(false);
          return;
        }
      }
    } catch (error) {
      console.error('文件解析失败:', error);
      alert('文件解析失败：' + error.message);
    } finally {
      setLoading(false);
    }
  }, [dataRawData]);

  // Excel 数据转 CSV 文本
  const excelDataToCSVText = useCallback((excelData) => {
    if (!excelData || excelData.length === 0) return '';
    const headers = Object.keys(excelData[0]);
    let csvText = headers.map(h => {
      const s = String(h ?? '');
      return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',');
    csvText += '\n';
    excelData.forEach(row => {
      csvText += headers.map(h => {
        const val = row[h];
        if (val === undefined || val === null || val === '') return '';
        const s = String(val);
        return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(',');
      csvText += '\n';
    });
    return csvText;
  }, []);

  const handleImport = async () => {
    // 新架构导入：统一走 loadFromCSVNew 路径
    // CSV 直接传文件，Excel 转成 CSV 文本传 Blob
    // 确保宽表检测、公式引擎等处理与 CSV 完全一致
    if (rawDataFile || formulaRawFile) {
      try {
        if (fileType === 'csv') {
          await onImport({
            dataFile: rawDataFile,
            formulaFile: formulaRawFile,
            mode: importMode
          });
        } else if (fileType === 'excel') {
          // Excel 转 CSV：根据 isFormulaMode 区分数据表和公式表
          let dataCSVText = '';
          let formulaCSVText = '';

          if (isFormulaMode) {
            // 主文件是公式表，配合文件是数据表
            if (dataRawData.length > 0) {
              dataCSVText = excelDataToCSVText(dataRawData);
            } else {
              // 公式表单独导入，从 localStorage 恢复之前的数据表 CSV
              try {
                const STORAGE_KEY = 'vdt-store-data-v2';
                const stored = localStorage.getItem(STORAGE_KEY);
                if (stored) {
                  const data = JSON.parse(stored);
                  if (data.csvText) {
                    dataCSVText = data.csvText;
                    console.log('[DataImportModal] 从 localStorage 恢复数据表 CSV');
                  }
                }
              } catch (error) {
                console.error('从 localStorage 恢复数据表失败:', error);
              }
            }
            formulaCSVText = excelDataToCSVText(rawData);
          } else {
            // 主文件是数据表
            dataCSVText = excelDataToCSVText(rawData);
          }

          const dataBlob = new Blob([dataCSVText], { type: 'text/csv' });
          const formulaBlob = formulaCSVText
            ? new Blob([formulaCSVText], { type: 'text/csv' })
            : null;

          await onImport({
            dataFile: dataBlob,
            formulaFile: formulaBlob,
            mode: importMode
          });
        }
        onClose();
      } catch (error) {
        console.error('导入失败:', error);
        alert('导入失败：' + error.message + '\n\n请检查文件格式是否正确，或参考导出模板重新准备数据。');
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-lg w-full max-w-5xl h-[80vh] flex flex-col">
        {/* 标题栏 */}
        <div className="h-14 border-b flex items-center justify-between px-6">
          <h2 className="text-lg font-medium">导入数据</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        {/* 步骤指示器 */}
        <div className="h-12 border-b flex items-center px-6 gap-4">
          <div className={`flex items-center gap-2 ${step >= 1 ? 'text-blue-600' : 'text-gray-400'}`}>
            <span className="w-6 h-6 rounded-full bg-current text-white text-xs flex items-center justify-center">1</span>
            <span className="text-sm">选择文件</span>
          </div>
          <div className="w-8 h-px bg-gray-300"></div>
          <div className={`flex items-center gap-2 ${step >= 2 ? 'text-blue-600' : 'text-gray-400'}`}>
            <span className="w-6 h-6 rounded-full bg-current text-white text-xs flex items-center justify-center">2</span>
            <span className="text-sm">确认导入</span>
          </div>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-auto p-6">
          {/* 步骤 1: 选择文件 */}
          {step === 1 && (
            <div className="text-center py-10">
              <div className="text-6xl mb-4">📄</div>
              <p className="text-gray-600 mb-4">选择 CSV 或 Excel 文件导入</p>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => handleFileUpload(e, false)}
                disabled={loading}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-md file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100"
              />
              {loading && <p className="mt-4 text-blue-600">正在解析文件...</p>}

              {dataRawData.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm text-gray-600 mb-2">可选：上传数据表（与公式表配合）</p>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => handleFileUpload(e, true)}
                    disabled={loading}
                    className="block w-full text-sm text-gray-500
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-md file:border-0
                      file:text-sm file:font-semibold
                      file:bg-green-50 file:text-green-700
                      hover:file:bg-green-100"
                  />
                </div>
              )}

              <div className="mt-6 text-left text-sm text-gray-500 bg-gray-50 p-4 rounded">
                <p className="font-medium mb-2">支持两种文件，可分次导入：</p>
                <p className="text-xs text-gray-400 mb-3">先导入数据表，再导入公式表；或先导入公式表，再导入数据表均可。系统会自动识别文件类型。</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 p-3 rounded">
                    <p className="font-medium text-blue-700">📊 数据表</p>
                    <p className="text-xs text-gray-500 mt-1 mb-1">包含指标的实际数值数据</p>
                    <pre className="text-xs overflow-auto bg-white p-2 rounded">
{`指标ID,指标名称,属性,2026WK01,2026WK02,...
fangwenliuliang,访问流量,AC,50000,52000,...
fangwenliuliang,访问流量,FC,,,72000,...`}
                    </pre>
                  </div>
                  <div className="bg-purple-50 p-3 rounded">
                    <p className="font-medium text-purple-700">📝 公式表</p>
                    <p className="text-xs text-gray-500 mt-1 mb-1">定义指标之间的计算关系</p>
                    <pre className="text-xs overflow-auto bg-white p-2 rounded">
{`指标ID,指标名称,节点类型,公式,最小值,最大值
yingyeshouru,营业收入,driver,,0,10000,...
maolirun,毛利润,computed,yingyeshouru-yingyechengben,...`}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 步骤 2: 确认导入 */}
          {step === 2 && (
            <div className="text-center py-10">
              <div className="text-6xl mb-4">✅</div>
              <p className="text-gray-600 mb-6">确认导入{isFormulaMode ? '公式表' : '数据表'}？</p>
              <div className="flex justify-center gap-4 mb-6">
                <label className="flex items-center gap-2 px-4 py-2 rounded border cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="importMode"
                    value="append"
                    checked={importMode === 'append'}
                    onChange={(e) => setImportMode(e.target.value)}
                    className="w-4 h-4"
                  />
                  <span>追加模式</span>
                </label>
                <label className="flex items-center gap-2 px-4 py-2 rounded border cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="importMode"
                    value="replace"
                    checked={importMode === 'replace'}
                    onChange={(e) => setImportMode(e.target.value)}
                    className="w-4 h-4"
                  />
                  <span>覆盖模式</span>
                </label>
              </div>
              <p className="text-sm text-gray-500">
                {importMode === 'append' ? '当前选择：追加模式（保留现有数据）' : '当前选择：覆盖模式（清空现有数据）'}
              </p>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="h-16 border-t flex items-center justify-between px-6">
          <div className="text-sm text-gray-500">
            {step === 1 ? '请选择要导入的文件' : '请选择导入模式'}
          </div>
          <div className="flex gap-3">
            {step > 1 && (
              <button onClick={() => setStep(1)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">上一步</button>
            )}
            {step === 1 ? (
              <button
                onClick={() => setStep(2)}
                disabled={loading || rawData.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                下一步
              </button>
            ) : (
              <button
                onClick={handleImport}
                disabled={loading}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                导入
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataImportModal;
