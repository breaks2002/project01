using Microsoft.AnalysisServices.AdomdClient;

namespace PbiProxy.Services;

/// <summary>
/// SSAS 连接和 DAX 查询服务
/// 使用 ADOMD.NET 连接本地 PBI Desktop SSAS 实例
/// </summary>
public class SsasConnectionService : IDisposable
{
    private readonly ILogger<SsasConnectionService> _logger;
    private AdomdConnection? _connection;
    private int _connectedPort;

    public bool IsConnected => _connection?.State == System.Data.ConnectionState.Open;
    public int ConnectedPort => _connectedPort;

    public SsasConnectionService(ILogger<SsasConnectionService> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// 连接到指定端口的 SSAS 实例
    /// </summary>
    public async Task<(bool Success, string? DatabaseName, string? Error)> ConnectAsync(int port)
    {
        try
        {
            // 先断开现有连接
            Disconnect();

            var connectionString = $"Data Source=localhost:{port}";
            _logger.LogInformation("正在连接 SSAS: {ConnectionString}", connectionString);

            _connection = new AdomdConnection(connectionString);
            await Task.Run(() => _connection.Open());

            _connectedPort = port;
            var dbName = _connection.Database;

            _logger.LogInformation("SSAS 连接成功: database={Database}", dbName);
            return (true, dbName, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "SSAS 连接失败: port={Port}", port);
            _connection?.Dispose();
            _connection = null;
            return (false, null, ex.Message);
        }
    }

    /// <summary>
    /// 断开连接
    /// </summary>
    public void Disconnect()
    {
        if (_connection != null)
        {
            try
            {
                if (_connection.State == System.Data.ConnectionState.Open)
                    _connection.Close();
                _connection.Dispose();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "断开连接时出错");
            }
            _connection = null;
            _connectedPort = 0;
        }
    }

    /// <summary>
    /// 获取数据模型中的所有表及其列
    /// </summary>
    public List<Models.TableInfo> GetTables()
    {
        EnsureConnected();

        var tables = new List<Models.TableInfo>();

        // 第一步：用 DMV 获取所有表名
        var tableNames = new List<string>();
        var tablesDax = "SELECT [DIMENSION_UNIQUE_NAME] FROM $SYSTEM.MDSCHEMA_DIMENSIONS WHERE [CUBE_NAME] = 'Model'";
        using (var tablesCmd = new AdomdCommand(tablesDax, _connection))
        using (var tablesReader = tablesCmd.ExecuteReader())
        {
            while (tablesReader.Read())
            {
                var name = tablesReader.GetString(0);
                if (!name.StartsWith("$") && name != "Measures")
                {
                    name = name.TrimStart('[').TrimEnd(']');
                    tableNames.Add(name);
                }
            }
        }

        // 第二步：对每个表执行 TOPN(0) 查询，从结果列头获取列名
        foreach (var tableName in tableNames)
        {
            var table = new Models.TableInfo { Name = tableName };
            try
            {
                var colDax = $"EVALUATE TOPN(0, '{tableName}')";
                using var colCmd = new AdomdCommand(colDax, _connection);
                using var colReader = colCmd.ExecuteReader();
                for (int i = 0; i < colReader.FieldCount; i++)
                {
                    var fullName = colReader.GetName(i);
                    // 列名格式: "tableName[colName]"，提取方括号内的部分
                    var colName = fullName;
                    var bracketStart = fullName.IndexOf('[');
                    var bracketEnd = fullName.IndexOf(']');
                    if (bracketStart >= 0 && bracketEnd > bracketStart)
                    {
                        colName = fullName.Substring(bracketStart + 1, bracketEnd - bracketStart - 1);
                    }
                    table.Columns.Add(new Models.ColumnInfo
                    {
                        Name = colName,
                        DataType = colReader.GetFieldType(i)?.Name ?? "String"
                    });
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "获取表 {Table} 的列信息失败", tableName);
            }
            tables.Add(table);
        }

        _logger.LogInformation("获取到 {Count} 个表", tables.Count);
        return tables;
    }

    /// <summary>
    /// 获取数据模型中的所有 DAX 度量值
    /// </summary>
    public List<Models.MeasureInfo> GetMeasures()
    {
        EnsureConnected();

        var measures = new List<Models.MeasureInfo>();

        var dax = "SELECT [MEASURE_NAME], [EXPRESSION], [MEASUREGROUP_NAME] FROM $SYSTEM.MDSCHEMA_MEASURES WHERE [CUBE_NAME] = 'Model'";
        using var cmd = new AdomdCommand(dax, _connection);
        using var reader = cmd.ExecuteReader();

        while (reader.Read())
        {
            var name = reader.GetString(0);
            // 跳过内置度量值
            if (name.StartsWith("__"))
                continue;

            measures.Add(new Models.MeasureInfo
            {
                Name = name,
                Expression = reader.IsDBNull(1) ? "" : reader.GetString(1),
                TableName = reader.IsDBNull(2) ? "" : reader.GetString(2)
            });
        }

        _logger.LogInformation("获取到 {Count} 个度量值", measures.Count);
        return measures;
    }

    /// <summary>
    /// 执行 DAX 查询
    /// </summary>
    public Models.QueryResult ExecuteQuery(string dax)
    {
        EnsureConnected();

        _logger.LogInformation("执行 DAX 查询: {Dax}", dax.Length > 200 ? dax[..200] + "..." : dax);

        var result = new Models.QueryResult();

        using var cmd = new AdomdCommand(dax, _connection);
        using var reader = cmd.ExecuteReader();

        // 读取列信息
        for (int i = 0; i < reader.FieldCount; i++)
        {
            result.Columns.Add(reader.GetName(i));
        }

        // 读取数据行
        while (reader.Read())
        {
            var row = new Dictionary<string, object?>();
            for (int i = 0; i < reader.FieldCount; i++)
            {
                var colName = result.Columns[i];
                row[colName] = reader.IsDBNull(i) ? null : reader.GetValue(i);
            }
            result.Rows.Add(row);
        }

        result.RowCount = result.Rows.Count;

        _logger.LogInformation("查询返回 {Count} 行, {Cols} 列", result.RowCount, result.Columns.Count);
        return result;
    }

    /// <summary>
    /// 快捷查询：获取指定表的数据
    /// </summary>
    public Models.QueryResult QueryTable(string tableName, List<string>? columns = null, int? maxRows = null)
    {
        var dax = $"EVALUATE '{tableName}'";
        if (maxRows.HasValue)
        {
            dax = $"EVALUATE TOPN({maxRows.Value}, '{tableName}')";
        }

        return ExecuteQuery(dax);
    }

    private void EnsureConnected()
    {
        if (!IsConnected)
            throw new InvalidOperationException("未连接到 SSAS 实例，请先调用 /api/connect");
    }

    public void Dispose()
    {
        Disconnect();
    }
}
