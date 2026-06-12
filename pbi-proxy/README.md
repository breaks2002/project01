# PowerBI 代理服务编译说明

## 简介

`pbi-proxy` 是一个 C# 编写的本地代理服务，用于连接 Power BI Desktop 的 SSAS 实例，执行 DAX 查询并将数据返回给前端 ValQ 应用。

## 环境要求

- **.NET SDK 8.0** 或更高版本
- Windows 操作系统（x64）

检查是否已安装：
```bash
dotnet --version
```

如果未安装，请从 [Microsoft 官网](https://dotnet.microsoft.com/download/dotnet/8.0) 下载安装。

## 编译命令

### 开发调试版
```bash
cd pbi-proxy
dotnet build
```
输出位置：`pbi-proxy/bin/Debug/net8.0/win-x64/pbi-proxy.exe`

### 发布版（单文件自包含，推荐）
```bash
cd pbi-proxy
dotnet publish -c Release
```
输出位置：`pbi-proxy/bin/Release/net8.0/win-x64/publish/pbi-proxy.exe`

> 发布版约 98MB，包含完整的 .NET 运行时，无需用户额外安装 .NET。

## 运行方式

编译完成后，双击 `pbi-proxy.exe` 或在终端运行：
```bash
./pbi-proxy.exe
```

服务启动后默认监听：`http://localhost:5678`

## 项目结构

```
pbi-proxy/
├── PbiProxy.csproj      # 项目配置文件
├── Program.cs           # 主程序入口
├── Models/
│   └── PbiModels.cs     # 数据模型定义
├── Services/
│   ├── SsasDiscoveryService.cs   # SSAS 实例发现服务
│   └── SsasConnectionService.cs  # SSAS 连接与查询服务
└── pbitool.json         # Power BI 工具配置
```

## 主要依赖

| 包名 | 版本 | 用途 |
|------|------|------|
| Microsoft.AnalysisServices.AdomdClient.NetCore.retail.amd64 | 19.77.0 | SSAS/ADOMD 连接库 |

## API 接口

服务启动后提供以下 REST API：

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 检查服务状态 |
| `/api/instances` | GET | 发现本地 PBI Desktop 实例 |
| `/api/connect` | POST | 连接到指定实例 |
| `/api/tables` | GET | 获取表列表 |
| `/api/measures` | GET | 获取度量值列表 |
| `/api/query` | POST | 执行 DAX 查询 |
| `/api/disconnect` | POST | 断开连接 |

## 注意事项

1. 运行前需先打开 Power BI Desktop 并加载含有数据的模型
2. 代理服务会自动发现本地运行的 PBI Desktop 实例（通过端口扫描）
3. 如需修改端口，可在 `Program.cs` 中更改 `Urls` 配置