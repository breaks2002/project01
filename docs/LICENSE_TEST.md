# ValQ 打包 + 授权系统测试说明

## 目录

1. [环境准备](#环境准备)
2. [授权系统测试](#授权系统测试)
3. [打包测试](#打包测试)
4. [完整流程测试](#完整流程测试)

---

## 环境准备

### 1. 确认已安装的软件

| 软件 | 版本要求 | 检查命令 |
|------|----------|----------|
| Node.js | 18.x+ | `node --version` |
| npm | 9.x+ | `npm --version` |
| .NET SDK | 8.0+ | `dotnet --version` |

### 2. 安装项目依赖

```bash
cd E:/MY AI/ValQ
npm install
```

### 3. 确认 RSA 密钥已生成

```bash
cd license-generator
node license-gen.js --generate-keys
```

密钥文件位置：
- `license-generator/keys/private.pem` (私钥，保密)
- `license-generator/keys/public.pem` (公钥，已嵌入应用)

---

## 授权系统测试

### 测试 1: 获取机器码

```bash
# 方法 1: 使用管理工具
cd license-manager
node license-mgr.js
> 输入: query DEV-TEST-MACHINE

# 方法 2: 直接运行注册机查看帮助
cd license-generator
node license-gen.js --help
```

**预期结果**: 应显示 32 位机器码格式（如 `A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6`）

---

### 测试 2: 生成授权文件

```bash
cd license-generator
node license-gen.js --machine A1B2C3D4E5F6G7H8 --type pro --duration 10y
```

**预期结果**:
- 显示授权生成成功信息
- 在当前目录生成 `A1B2C3D4E5F6G7H8-pro-10y.lic` 文件

**测试不同类型**:

| 类型 | 命令 | 有效期 |
|------|------|--------|
| 试用版 | `--type trial --duration 1m` | 1个月 |
| 标准版 | `--type standard --duration 1y` | 1年 |
| 专业版 | `--type pro --duration 10y` | 10年 |

---

### 测试 3: 授权管理工具

```bash
cd license-manager
node license-mgr.js
```

**交互式命令测试**:

| 命令 | 说明 |
|------|------|
| `list` | 列出所有授权记录 |
| `query A1B2C3D4E5F6G7H8` | 查询指定机器码 |
| `gen A1B2C3D4E5F6G7H8 pro 10y` | 生成授权 |
| `help` | 显示帮助 |
| `exit` | 退出 |

---

### 测试 4: 验证授权文件（模拟）

由于授权验证需要真实机器码，可以临时修改测试：

```javascript
// 临时在 electron/license/validator.js 中添加测试模式
async function checkLicense() {
  // 测试模式：跳过机器码验证
  const TEST_MODE = true;
  if (TEST_MODE) {
    return { valid: true, type: 'pro', expiresAt: '2035-12-31', daysLeft: 365 };
  }
  // ... 正常验证逻辑
}
```

---

## 打包测试

### 测试 5: Vite 构建测试

```bash
npm run build
```

**预期结果**:
- 构建成功，无错误
- `dist/` 目录生成静态文件
- 控制台显示 `built in X.XXs`

---

### 测试 6: Electron 开发模式

```bash
npm run electron:dev
```

**预期结果**:
- Vite 开发服务器启动 (localhost:3000)
- Electron 窗口打开
- 显示授权面板（未授权状态）
- 控制台无错误

---

### 测试 7: Electron 打包

```bash
# 或使用 bat 脚本
build.bat
```

**预期结果**:
- `release/` 目录生成安装包
- 包含 `ValQ Setup X.X.X.exe` (NSIS 安装包)
- 包含 `ValQ X.X.X.exe` (便携版)

---

## 完整流程测试

### 测试 8: 用户端完整流程

**步骤 1**: 运行打包后的应用
```
双击 release/ValQ Setup 1.0.0.exe 安装
或直接运行 release/ValQ 1.0.0.exe
```

**步骤 2**: 获取机器码
- 应用启动后显示授权面板
- 复制显示的机器码（32位）

**步骤 3**: 生成授权文件（管理员操作）
```bash
cd license-generator
node license-gen.js --machine <机器码> --type pro --duration 10y --output license.lic
```

**步骤 4**: 导入授权
- 点击"导入授权文件"按钮
- 选择生成的 `license.lic` 文件
- 显示"授权导入成功"

**步骤 5**: 验证授权有效
- 授权面板关闭
- 应用正常显示主界面
- 工具栏显示授权状态（可选）

---

### 测试 9: 授权过期测试

创建一个即将过期的授权：

```bash
# 创建 1 天后过期的授权（修改代码临时测试）
node license-gen.js --machine TEST-CODE --type trial --duration 1m
```

手动修改授权文件中的 `expiresAt` 为过去日期，验证：
- 应用启动时显示"授权已过期"
- 无法进入主界面

---

### 测试 10: 机器码不匹配测试

1. 在电脑 A 生成机器码 `A1B2C3D4...`
2. 使用该机器码生成授权文件
3. 在电脑 B 运行应用并导入该授权文件

**预期结果**: 显示"机器码不匹配"，授权失败

---

## 测试检查清单

| 编号 | 测试项 | 状态 |
|------|--------|------|
| ✅ | RSA 密钥生成 | ⬜ |
| ✅ | 机器码获取 | ⬜ |
| ✅ | 授权文件生成 | ⬜ |
| ✅ | 授权管理工具 | ⬜ |
| ✅ | Vite 构建 | ⬜ |
| ✅ | Electron 开发模式 | ⬜ |
| ✅ | Electron 打包 | ⬜ |
| ✅ | 授权导入成功 | ⬜ |
| ✅ | 授权过期检测 | ⬜ |
| ✅ | 机器码验证 | ⬜ |

---

## 常见问题

### Q1: 打包后运行报错 "PBI Proxy not found"

**原因**: `pbi-proxy.exe` 未编译或未包含在打包中

**解决**:
```bash
cd pbi-proxy
dotnet publish -c Release
# 将生成的 exe 复制到 pbi-proxy/pbi-proxy.exe
```

### Q2: 授权导入失败 "签名无效"

**原因**: 公钥与私钥不匹配

**解决**: 确保使用同一密钥对，重新生成：
```bash
node license-gen.js --generate-keys
# 然后将新公钥复制到 electron/license/crypto.js
```

### Q3: 机器码每次运行不同

**原因**: WMIC 命令在某些 Windows 版本不稳定

**解决**: 已实现备用方案（MAC地址），检查 `machineCode.js` 日志

### Q4: 打包体积过大

**预期**: Electron 打包约 150-200MB（含 Chromium）

**优化**: 可使用 Tauri 替代（约 50MB），但需重构

---

## 联系支持

如遇问题，请检查：
1. 控制台错误日志
2. `electron/license/` 目录下的调试输出
3. 授权文件是否正确生成（`.lic` 文件）

测试完成后，请填写检查清单并反馈结果！