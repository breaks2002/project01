import React, { useState, useRef, useEffect } from 'react';
import knowledgeService from '../../services/knowledgeService';

/**
 * 文档上传组件
 * 支持多种格式：TXT, WORD, PDF, EXCEL, MD
 */
const KnowledgeUploader = ({ onClose, onUploadComplete, initialFile }) => {
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState(null);
  const [metadata, setMetadata] = useState({
    title: '',
    industry: '通用',
    description: '',
    tags: ''
  });
  const fileInputRef = useRef(null);

  // 监听外部文件上传事件（从导入按钮触发）
  useEffect(() => {
    const handleUploadFile = (e) => {
      const file = e.detail;
      if (file) {
        handleFile(file);
      }
    };

    window.addEventListener('knowledge-upload-file', handleUploadFile);
    return () => window.removeEventListener('knowledge-upload-file', handleUploadFile);
  }, []);

  // 如果有初始文件，直接处理
  useEffect(() => {
    if (initialFile) {
      handleFile(initialFile);
    }
  }, [initialFile]);

  /**
   * 支持的文件格式
   */
  const ACCEPTED_FORMATS = [
    '.txt', '.md',
    '.doc', '.docx',
    '.pdf',
    '.xls', '.xlsx', '.csv'
  ];

  /**
   * 处理文件拖拽
   */
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  /**
   * 处理文件放置
   */
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFile(files[0]);
    }
  };

  /**
   * 处理文件选择
   */
  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  /**
   * 处理单个文件
   */
  const handleFile = async (file) => {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ACCEPTED_FORMATS.includes(ext)) {
      alert(`不支持的文件格式：${ext}\n支持的格式：TXT, MD, WORD, PDF, EXCEL, CSV`);
      return;
    }

    setCurrentFile({
      file,
      name: file.name,
      size: (file.size / 1024).toFixed(1) + ' KB',
      type: ext
    });

    // 自动填充元数据
    setMetadata(prev => ({
      ...prev,
      title: file.name.replace(/\.[^/.]+$/, ''),
      industry: '通用'
    }));

    // 读取文件内容
    await readFileContent(file);
  };

  /**
   * 读取文件内容
   */
  const readFileContent = async (file) => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
      // 模拟进度（实际解析可能很快）
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 100);

      const content = await parseFile(file);

      clearInterval(progressInterval);
      setUploadProgress(100);

      // 自动提取描述（前 500 字符）
      const autoDescription = content.substring(0, 500);
      setMetadata(prev => ({
        ...prev,
        description: prev.description || autoDescription
      }));

      setIsUploading(false);
    } catch (error) {
      console.error('文件解析失败:', error);
      alert('文件解析失败：' + error.message);
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  /**
   * 解析不同类型的文件
   */
  const parseFile = async (file) => {
    const ext = '.' + file.name.split('.').pop().toLowerCase();

    // TXT 和 MD 直接读取
    if (ext === '.txt' || ext === '.md') {
      return await readTextFile(file);
    }

    // CSV 读取
    if (ext === '.csv') {
      return await readTextFile(file);
    }

    // PDF/Word/Excel 需要特殊处理
    // 简化版本：提供友好的提示信息
    if (ext === '.pdf') {
      return `[PDF 文件] ${file.name}

📋 文件信息：
- 文件名：${file.name}
- 文件大小：${(file.size / 1024).toFixed(1)} KB
- 上传时间：${new Date().toLocaleString()}

💡 提示：
PDF 文件需要额外的解析服务才能提取内容。

建议操作：
1. 如果 PDF 主要是文字，可以先复制文字内容，创建 TXT 文件后上传
2. 如果 PDF 包含表格，可以先导出为 Excel/CSV 格式
3. 后续版本将支持直接解析 PDF 内容`;
    }

    if (ext === '.doc' || ext === '.docx') {
      return `[Word 文档] ${file.name}

📋 文件信息：
- 文件名：${file.name}
- 文件大小：${(file.size / 1024).toFixed(1)} KB
- 上传时间：${new Date().toLocaleString()}

💡 提示：
Word 文档需要额外的解析服务才能提取内容。

建议操作：
1. 直接复制 Word 文档中的文字内容
2. 粘贴到新的 TXT 文件中保存后上传
3. 后续版本将支持直接解析 Word 内容`;
    }

    if (ext === '.xls' || ext === '.xlsx') {
      return `[Excel 文件] ${file.name}

📋 文件信息：
- 文件名：${file.name}
- 文件大小：${(file.size / 1024).toFixed(1)} KB
- 上传时间：${new Date().toLocaleString()}

💡 提示：
Excel 文件需要额外的解析服务才能提取内容。

建议操作：
1. 在 Excel 中点击「文件」→「另存为」
2. 选择保存类型为「CSV (逗号分隔) (*.csv)」
3. 上传转换后的 CSV 文件
4. 后续版本将支持直接解析 Excel 内容`;
    }

    throw new Error('不支持的文件格式');
  };

  /**
   * 读取文本文件
   */
  const readTextFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file, 'UTF-8');
    });
  };

  /**
   * 提交上传
   */
  const handleSubmit = async () => {
    if (!currentFile) return;

    try {
      // 读取文件内容（如果还没读）
      let content = metadata.description;
      if (!content) {
        content = await parseFile(currentFile.file);
      }

      // 创建知识库条目
      const entry = knowledgeService.createEntryFromDocument(content, {
        filename: currentFile.name,
        type: currentFile.type,
        size: currentFile.size,
        industry: metadata.industry
      });

      // 更新元数据
      if (metadata.title) entry.title = metadata.title;
      if (metadata.description) entry.description = metadata.description;
      if (metadata.tags) {
        entry.tags = metadata.tags.split(/[,,\s]+/).filter(t => t);
      }

      // 保存
      knowledgeService._save();

      alert('文档上传成功！');
      onUploadComplete(entry);
      onClose();
    } catch (error) {
      console.error('上传失败:', error);
      alert('上传失败：' + error.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
      <div className="bg-white rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl">
        {/* 头部 */}
        <div className="px-6 py-4 border-b bg-gradient-to-r from-indigo-50 to-purple-50">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-800">上传文档到知识库</h3>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
          </div>
        </div>

        {/* 内容 */}
        <div className="p-6">
          {/* 拖拽上传区域 */}
          {!currentFile ? (
            <div
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-all ${
                dragActive
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="text-6xl mb-4">📁</div>
              <p className="text-lg text-gray-700 mb-2">拖拽文件到此处</p>
              <p className="text-sm text-gray-500 mb-1">✅ 直接支持：TXT、MD、CSV</p>
              <p className="text-sm text-orange-600 mb-4">⚠️ 需转换：PDF、Word、Excel（内容复制或使用转换工具）</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
              >
                选择文件
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FORMATS.join(',')}
                onChange={handleChange}
                className="hidden"
              />
            </div>
          ) : (
            <div className="border rounded-xl p-4 bg-gray-50">
              <div className="flex items-center gap-4 mb-4">
                <div className="text-4xl">📄</div>
                <div className="flex-1">
                  <p className="font-medium text-gray-800">{currentFile.name}</p>
                  <p className="text-sm text-gray-500">{currentFile.size} • {currentFile.type}</p>
                </div>
                <button
                  onClick={() => {
                    setCurrentFile(null);
                    setUploadProgress(0);
                  }}
                  className="text-red-500 hover:text-red-700"
                >
                  移除
                </button>
              </div>

              {isUploading && (
                <div className="mb-4">
                  <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                    <span>解析中...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 元数据编辑 */}
          {currentFile && (
            <div className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  标题
                </label>
                <input
                  type="text"
                  value={metadata.title}
                  onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="请输入标题"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  所属行业
                </label>
                <select
                  value={metadata.industry}
                  onChange={(e) => setMetadata({ ...metadata, industry: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="通用">通用</option>
                  <option value="零售/电商">零售/电商</option>
                  <option value="制造业">制造业</option>
                  <option value="互联网/科技">互联网/科技</option>
                  <option value="金融">金融</option>
                  <option value="医疗">医疗</option>
                  <option value="教育">教育</option>
                  <option value="服务业">服务业</option>
                  <option value="其他">其他</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  描述/摘要
                </label>
                <textarea
                  value={metadata.description}
                  onChange={(e) => setMetadata({ ...metadata, description: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="请简要描述文档内容（可选，将自动从文档中提取）"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  标签（用逗号或空格分隔）
                </label>
                <input
                  type="text"
                  value={metadata.tags}
                  onChange={(e) => setMetadata({ ...metadata, tags: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="例如：Q4, 旺季，利润增长，销售费用"
                />
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-lg hover:bg-gray-100"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!currentFile || isUploading}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading ? '处理中...' : '确认上传'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeUploader;
