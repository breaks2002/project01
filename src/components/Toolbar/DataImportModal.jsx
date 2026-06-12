import React, { useState, useCallback } from 'react';
import { parseCSV, csvToNodes, detectCSVStructure, isFormulaTable, validateFormulaTable, formulaTableToNodes, parseWideTableToNodes, validateWideTable, isWideTable, getColumn } from '../../utils/csvParser';
import { parseExcel, excelToNodes, detectExcelStructure, isExcelFormulaTable, validateExcelFormulaTable, excelFormulaTableToNodes } from '../../utils/excelParser';

const DataImportModal = ({ onClose, onImport, existingNodesCount = 0, existingNodes = {} }) => {
  const [step, setStep] = useState(1);
  const [rawData, setRawData] = useState([]);
  const [rawDataFile, setRawDataFile] = useState(null); // 保存文件引用
  const [formulaRawFile, setFormulaRawFile] = useState(null); // 保存公式文件引用
  const [structure, setStructure] = useState(null);
  const [selectedNameColumn, setSelectedNameColumn] = useState('');
  const [selectedValueColumns, setSelectedValueColumns] = useState([]);
  const [isFormulaMode, setIsFormulaMode] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [importMode, setImportMode] = useState('append');
  const [fileType, setFileType] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dataRawData, setDataRawData] = useState([]);
  const [dataFileType, setDataFileType] = useState(null);

  const getFileType = (fileName) => {
    const ext = fileName.toLowerCase().split('.').pop();
    if (ext === 'csv') return 'csv';
    if (ext === 'xlsx' || ext === 'xls') return 'excel';
    return null;
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

      if (isDataTable) {
        setDataRawData(data);
        setDataFileType(type);
      } else {
        setRawData(data);

        // 自动检测结构
        const struct = detectCSVStructure(data);
        setStructure(struct);

        // 检查是否为公式表
        if (isFormulaTable(data)) {
          setIsFormulaMode(true);
          const validation = validateFormulaTable(data, dataRawData.length > 0 ? dataRawData : null);
          setValidationResult(validation);
          if (validation.valid) {
            setStep(3);
          }
        } else {
          setIsFormulaMode(false);
          // 新格式宽表（有 指标ID/指标名称/属性 列）不需要手动选列，直接到确认
          if (isWideTable(data)) {
            setStep(3);
          } else {
            // 旧格式：需要手动选列
            if (struct && struct.nameColumn) {
              setSelectedNameColumn(struct.nameColumn);
            }
            if (struct && struct.valueColumns && struct.valueColumns.length > 0) {
              setSelectedValueColumns(struct.valueColumns);
            }
            setStep(2);
          }
        }
      }
    } catch (error) {
      console.error('文件解析失败:', error);
      alert('文件解析失败：' + error.message);
    } finally {
      setLoading(false);
    }
  }, [dataRawData]);

  const handleNext = () => {
    setStep(3);
  };

  const handleImport = async () => {
    // 使用新架构导入（如果可用）
    if (fileType === 'csv' && rawDataFile) {
      try {
        // 传递文件给 onImport
        await onImport({
          dataFile: rawDataFile,
          formulaFile: formulaRawFile,
          mode: importMode
        });
        onClose();
        return;
      } catch (error) {
        console.error('新架构导入失败:', error);
        // 失败时回退到旧方法
      }
    }

    // 旧架构导入（向后兼容）
    let nodes;

    if (isFormulaMode) {
      // 公式表导入 - 检查是否只导入了公式表（没有数据表）
      if (formulaRawFile && !rawDataFile && fileType === 'csv') {
        // 只导入了公式表，尝试从 localStorage 获取之前的数据表
        try {
          const STORAGE_KEY = 'vdt-store-data-v2';
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) {
            const data = JSON.parse(stored);
            if (data.csvText && data.formulaText) {
              // 有之前导入的数据，使用数据表 + 公式表一起导入
              const dataBlob = new Blob([data.csvText], { type: 'text/csv' });
              const formulaBlob = new Blob([await formulaRawFile.text()], { type: 'text/csv' });
              await onImport({
                dataFile: dataBlob,
                formulaFile: formulaBlob,
                mode: importMode
              });
              onClose();
              return;
            }
          }
        } catch (error) {
          console.error('从 localStorage 恢复数据表失败:', error);
        }
      }

      // 回退到旧方法
      if (dataRawData.length > 0) {
        nodes = fileType === 'excel'
          ? excelFormulaTableToNodes(rawData, dataRawData, existingNodes)
          : formulaTableToNodes(rawData, dataRawData, existingNodes);
      } else {
        nodes = fileType === 'excel'
          ? excelFormulaTableToNodes(rawData, null, existingNodes)
          : formulaTableToNodes(rawData, null, existingNodes);
      }
    } else {
      // 检测是否为新格式横表
      const isNewFormat = isWideTable(rawData);

      if (isNewFormat) {
        const result = parseWideTableToNodes(rawData);
        if (!result.validation.valid) {
          alert('数据校验失败：' + result.validation.errors.join(', '));
          return;
        }
        nodes = result.nodes;
      } else {
        nodes = fileType === 'excel'
          ? excelToNodes(rawData, selectedNameColumn, selectedValueColumns)
          : csvToNodes(rawData, selectedNameColumn, selectedValueColumns);
      }
    }

    onImport({ nodes, mode: importMode });
    onClose();
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
            <span className="text-sm">数据预览</span>
          </div>
          <div className="w-8 h-px bg-gray-300"></div>
          <div className={`flex items-center gap-2 ${step >= 3 ? 'text-blue-600' : 'text-gray-400'}`}>
            <span className="w-6 h-6 rounded-full bg-current text-white text-xs flex items-center justify-center">3</span>
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

          {/* 步骤 2: 数据预览 */}
          {step === 2 && !isFormulaMode && structure && (
            <div>
              <h3 className="font-medium mb-4">📊 数据预览</h3>
              <div className="mb-4">
                <p className="text-sm text-gray-600">名称列：<span className="text-blue-600 font-medium">{selectedNameColumn || structure.nameColumn || '未检测到'}</span></p>
              </div>
              <div className="mb-4">
                <p className="text-sm text-gray-600">数据列（已选 {selectedValueColumns.length}）：</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {structure.valueColumns && structure.valueColumns.map(col => (
                    <label key={col} className="flex items-center gap-1 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedValueColumns.includes(col)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedValueColumns([...selectedValueColumns, col]);
                          } else {
                            setSelectedValueColumns(selectedValueColumns.filter(c => c !== col));
                          }
                        }}
                      />
                      {col}
                    </label>
                  ))}
                </div>
              </div>
              <div className="overflow-auto border rounded max-h-64">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      {rawData[0] && Object.keys(rawData[0]).map(col => (
                        <th key={col} className="px-2 py-1 border text-left font-medium">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rawData.slice(0, 5).map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        {rawData[0] && Object.keys(rawData[0]).map(col => (
                          <td key={col} className="px-2 py-1 border">{row[col]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 步骤 2: 公式表校验结果 */}
          {step === 2 && isFormulaMode && validationResult && (
            <div>
              <h3 className="font-medium mb-4">📋 公式表校验结果</h3>
              {validationResult.errors.length > 0 && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded">
                  <p className="font-medium text-red-700 mb-2">❌ 错误 ({validationResult.errors.length})</p>
                  <ul className="text-sm text-red-600 list-disc list-inside">
                    {validationResult.errors.map((err, i) => (<li key={i}>{err}</li>))}
                  </ul>
                </div>
              )}
              {validationResult.warnings.length > 0 && (
                <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
                  <p className="font-medium text-yellow-700 mb-2">⚠️ 警告 ({validationResult.warnings.length})</p>
                  <ul className="text-sm text-yellow-600 list-disc list-inside">
                    {validationResult.warnings.map((warn, i) => (<li key={i}>{warn}</li>))}
                  </ul>
                </div>
              )}
              {validationResult.valid && (
                <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded">
                  <p className="font-medium text-green-700">✅ 校验通过！共 {rawData.length} 个节点</p>
                </div>
              )}
            </div>
          )}

          {/* 步骤 3: 确认导入 */}
          {step === 3 && (
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
            {step === 1 && '请选择要导入的文件'}
            {step === 2 && '请确认数据'}
            {step === 3 && '请选择导入模式'}
          </div>
          <div className="flex gap-3">
            {step > 1 && (
              <button onClick={() => setStep(step - 1)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">上一步</button>
            )}
            {step < 3 ? (
              <button
                onClick={handleNext}
                disabled={loading || (step === 1 && rawData.length === 0)}
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
