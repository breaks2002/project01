using System.Diagnostics;

namespace PbiProxy.Services;

/// <summary>
/// SSAS 实例发现服务
/// 扫描本地 Power BI Desktop 工作区，读取 msmdsrv.port.txt 发现运行中的 SSAS 实例
/// </summary>
public class SsasDiscoveryService
{
    private readonly ILogger<SsasDiscoveryService> _logger;

    public SsasDiscoveryService(ILogger<SsasDiscoveryService> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// 发现所有运行中的 PBI Desktop SSAS 实例
    /// </summary>
    public List<Models.PbiInstance> DiscoverInstances()
    {
        var instances = new List<Models.PbiInstance>();

        // MSI 安装版路径
        var msiPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Microsoft", "Power BI Desktop", "AnalysisServicesWorkspaces");

        // Microsoft Store 版路径
        var storePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Packages", "Microsoft.MicrosoftPowerBIDesktop_8wekyb3d8bbwe",
            "LocalState", "AnalysisServicesWorkspaces");

        foreach (var basePath in new[] { msiPath, storePath })
        {
            if (!Directory.Exists(basePath))
            {
                _logger.LogDebug("工作区路径不存在: {Path}", basePath);
                continue;
            }

            foreach (var workspaceDir in Directory.GetDirectories(basePath, "AnalysisServicesWorkspace_*"))
            {
                var instance = TryReadInstance(workspaceDir);
                if (instance != null)
                {
                    instances.Add(instance);
                }
            }
        }

        // 尝试通过进程匹配 pbix 文件名
        EnrichWithProcessInfo(instances);

        _logger.LogInformation("发现 {Count} 个 PBI Desktop 实例", instances.Count);
        return instances;
    }

    private Models.PbiInstance? TryReadInstance(string workspaceDir)
    {
        var portFile = Path.Combine(workspaceDir, "Data", "msmdsrv.port.txt");

        if (!File.Exists(portFile))
        {
            _logger.LogDebug("端口文件不存在: {Path}", portFile);
            return null;
        }

        try
        {
            var portText = File.ReadAllText(portFile).Trim();
            // msmdsrv.port.txt 可能是 UTF-16 编码，读出来每个字符间会有 null 字节
            // 移除所有非数字字符
            portText = new string(portText.Where(char.IsDigit).ToArray());
            if (!int.TryParse(portText, out var port) || port <= 0)
            {
                _logger.LogWarning("无效的端口号: {PortText} in {Path}", portText, portFile);
                return null;
            }

            // 从目录名提取工作区 GUID
            var dirName = Path.GetFileName(workspaceDir);
            var id = dirName.Replace("AnalysisServicesWorkspace_", "");

            _logger.LogInformation("发现 SSAS 实例: port={Port}, id={Id}", port, id);

            return new Models.PbiInstance
            {
                Id = id,
                Port = port,
                Status = "discovered"
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "读取端口文件失败: {Path}", portFile);
            return null;
        }
    }

    /// <summary>
    /// 通过 PBI Desktop 进程信息补充 pbix 文件名
    /// </summary>
    private void EnrichWithProcessInfo(List<Models.PbiInstance> instances)
    {
        try
        {
            var pbiProcesses = Process.GetProcessesByName("PBIDesktop");
            if (pbiProcesses.Length == 0)
            {
                _logger.LogDebug("未发现 PBI Desktop 进程");
                return;
            }

            foreach (var process in pbiProcesses)
            {
                try
                {
                    var title = process.MainWindowTitle;
                    if (!string.IsNullOrEmpty(title))
                    {
                        // PBI Desktop 窗口标题格式: "文件名 - Power BI Desktop"
                        var dashIndex = title.LastIndexOf(" - Power BI Desktop");
                        var fileName = dashIndex > 0 ? title[..dashIndex] : title;

                        // 如果只有一个实例，直接关联
                        if (instances.Count == 1 && pbiProcesses.Length == 1)
                        {
                            instances[0].PbixFileName = fileName;
                        }
                        // 多个实例时，按进程启动时间排序尝试匹配
                        // 这不是100%准确，但在大多数场景够用
                    }
                }
                catch { /* 忽略单个进程的访问错误 */ }
                finally
                {
                    process.Dispose();
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "获取 PBI Desktop 进程信息失败");
        }
    }
}
