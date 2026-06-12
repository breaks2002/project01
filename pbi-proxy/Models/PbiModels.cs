namespace PbiProxy.Models;

/// <summary>
/// 发现的 Power BI Desktop SSAS 实例信息
/// </summary>
public class PbiInstance
{
    public string Id { get; set; } = string.Empty;
    public int Port { get; set; }
    public string? DatabaseName { get; set; }
    public string? PbixFileName { get; set; }
    public string Status { get; set; } = "discovered";
}

/// <summary>
/// DAX 查询请求
/// </summary>
public class QueryRequest
{
    public string Dax { get; set; } = string.Empty;
}

/// <summary>
/// 快捷表查询请求
/// </summary>
public class TableQueryRequest
{
    public string TableName { get; set; } = string.Empty;
    public List<string>? Columns { get; set; }
    public int? MaxRows { get; set; }
}

/// <summary>
/// 连接请求
/// </summary>
public class ConnectRequest
{
    public string? InstanceId { get; set; }
    public int? Port { get; set; }
}

/// <summary>
/// DAX 查询结果
/// </summary>
public class QueryResult
{
    public List<string> Columns { get; set; } = new();
    public List<Dictionary<string, object?>> Rows { get; set; } = new();
    public int RowCount { get; set; }
}

/// <summary>
/// 表信息
/// </summary>
public class TableInfo
{
    public string Name { get; set; } = string.Empty;
    public List<ColumnInfo> Columns { get; set; } = new();
}

/// <summary>
/// 列信息
/// </summary>
public class ColumnInfo
{
    public string Name { get; set; } = string.Empty;
    public string DataType { get; set; } = string.Empty;
}

/// <summary>
/// 度量值信息
/// </summary>
public class MeasureInfo
{
    public string Name { get; set; } = string.Empty;
    public string Expression { get; set; } = string.Empty;
    public string TableName { get; set; } = string.Empty;
}
