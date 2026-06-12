import React, { useState, useEffect } from 'react';
import { X, Key, Upload, CheckCircle, AlertTriangle, Clock, Monitor } from 'lucide-react';

const LicensePanel = ({ onClose, onLicenseValid, showCopyright }) => {
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [machineCode, setMachineCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');

  // 检查授权状态
  useEffect(() => {
    checkLicense();
    getMachineCode();
  }, []);

  const checkLicense = async () => {
    setLoading(true);
    try {
      // 检查是否在 Electron 环境
      if (window.electronAPI) {
        const result = await window.electronAPI.checkLicense();
        setLicenseStatus(result);
        // 注：移除自动关闭逻辑，避免用户主动打开面板时闪退
        // 首次启动时由 App.jsx 的 useEffect 独立处理面板显隐
      } else {
        // 非 Electron 环境（开发模式），默认有效
        setLicenseStatus({ valid: true, type: 'dev', message: '开发模式' });
        onLicenseValid?.({ valid: true });
      }
    } catch (error) {
      setLicenseStatus({ valid: false, reason: 'CHECK_ERROR', message: error.message });
    }
    setLoading(false);
  };

  const getMachineCode = async () => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.getMachineCode();
        if (result.success) {
          setMachineCode(result.code);
        }
      } else {
        // 开发模式模拟
        setMachineCode('DEV-MODE-00000000');
      }
    } catch (error) {
      console.error('Get machine code error:', error);
    }
  };

  const handleImportLicense = async () => {
    setImporting(true);
    setMessage('');

    try {
      if (window.electronAPI) {
        // 使用 Electron 的文件选择对话框
        const result = await window.electronAPI.importLicense(null);
        setMessage(result.message);
        if (result.success) {
          await checkLicense();
        }
      } else {
        setMessage('请使用 Electron 打包版本导入授权');
      }
    } catch (error) {
      setMessage('导入失败: ' + error.message);
    }
    setImporting(false);
  };

  const getLicenseTypeLabel = (type) => {
    switch (type) {
      case 'trial': return '试用版';
      case 'standard': return '标准版';
      case 'pro': return '专业版';
      case 'dev': return '开发模式';
      default: return type;
    }
  };

  const getLicenseTypeColor = (type) => {
    switch (type) {
      case 'trial': return 'bg-yellow-100 text-yellow-800';
      case 'standard': return 'bg-blue-100 text-blue-800';
      case 'pro': return 'bg-purple-100 text-purple-800';
      case 'dev': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
          <p className="text-center mt-4 text-gray-600">正在检查授权状态...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            {showCopyright ? (
              <Monitor className="w-6 h-6 text-blue-600" />
            ) : (
              <Key className="w-6 h-6 text-blue-600" />
            )}
            <h2 className="text-xl font-semibold">
              {showCopyright ? '版权信息' : (licenseStatus?.type === 'trial' ? '升级专业版' : '授权管理')}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-8 py-6 space-y-6">
          {/* 版权信息 */}
          {showCopyright ? (
            <div className="space-y-6">
              <div className="text-center">
                <div style={{ fontSize: '24px', fontWeight: '700', color: '#0066FF' }}>AIDM</div>
                <div className="text-sm text-gray-500 mt-1">智能指标规划决策引擎</div>
              </div>
              <div className="border-t border-b py-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">软件名称</span>
                  <span className="text-gray-900">AIDM - 智能指标规划决策引擎</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">版本</span>
                  <span className="text-gray-900">v1.0.0</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">开发者</span>
                  <span className="text-gray-900">施飞</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">联系方式</span>
                  <span className="text-gray-900">15389225466（微同）</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">版权</span>
                  <span className="text-gray-900">© 2026 AIDM Developer All rights reserved</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 text-center">
                本软件受版权法保护，未经授权不得复制、传播或反向工程。
              </p>
            </div>
          ) : (
            <>
          {/* 授权状态 */}
          {licenseStatus?.type !== 'trial' && (
            <div className={`mb-6 p-4 rounded-lg ${licenseStatus?.valid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="flex items-center gap-3">
                {licenseStatus?.valid ? (
                  <CheckCircle className="w-6 h-6 text-green-600" />
                ) : (
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                )}
                <div>
                  <p className={`font-medium ${licenseStatus?.valid ? 'text-green-800' : 'text-red-800'}`}>
                    {licenseStatus?.valid ? '授权有效' : '授权无效'}
                  </p>
                  <p className={`text-sm ${licenseStatus?.valid ? 'text-green-600' : 'text-red-600'}`}>
                    {licenseStatus?.message || licenseStatus?.reason}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 试用版状态信息 */}
          {licenseStatus?.type === 'trial' && (
            <div className="mb-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">当前授权</span>
                <span className="px-2 py-1 rounded text-sm bg-yellow-100 text-yellow-800">
                  试用版
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600 flex items-center gap-1">
                  <Clock className="w-4 h-4" /> 到期时间
                </span>
                <span className="text-gray-900">
                  {new Date(licenseStatus.expiresAt).toLocaleDateString('zh-CN')}
                  {licenseStatus.daysLeft && (
                    <span className="text-sm text-gray-500 ml-2">
                      (剩余 {licenseStatus.daysLeft} 天)
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600 flex items-center gap-1">
                  <Monitor className="w-4 h-4" /> 机器码
                </span>
                <span className="text-gray-900 text-sm font-mono">
                  {machineCode || licenseStatus.machineCode}
                </span>
              </div>
            </div>
          )}

          {/* 试用版升级/未授权时的操作 */}
          {(!licenseStatus?.valid || licenseStatus?.type === 'trial') && (
            <div className="space-y-4">
              {/* 试用版升级提示 */}
              {licenseStatus?.type === 'trial' && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-orange-800 mb-1">升级专业版，解锁全部功能</p>
                  <p className="text-xs text-orange-600">导入授权文件后，AI决策、导出、PowerBI 等功能将立即解锁，节点数和层级限制也将解除。授权咨询请联系 15389225466（微同）</p>
                </div>
              )}

              {/* 机器码显示 */}
              <div className="bg-gray-50 p-5 rounded-lg">
                <p className="text-sm text-gray-600 mb-3">当前机器码（请复制发送给管理员）</p>
                <p className="text-base font-mono bg-white p-3 rounded border text-center select-all tracking-wider">
                  {machineCode || '获取中...'}
                </p>
              </div>

              {/* 导入授权按钮 */}
              <button
                onClick={handleImportLicense}
                disabled={importing}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 text-base font-medium transition-colors"
              >
                <Upload className="w-5 h-5" />
                {importing ? '导入中...' : '导入授权文件'}
              </button>
            </div>
          )}
            </>
          )}

          {/* 操作消息 */}
          {message && (
            <div className={`mt-4 p-3 rounded-lg ${message.includes('成功') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {message}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t bg-gray-50 rounded-b-lg">
          <p className="text-xs text-gray-500 text-center">
            AIDM © 2026 | 授权咨询请联系 15389225466（微同）
          </p>
        </div>
      </div>
    </div>
  );
};

export default LicensePanel;