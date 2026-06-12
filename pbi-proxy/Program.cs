using PbiProxy.Services;
using PbiProxy.Models;

var builder = WebApplication.CreateBuilder(args);

// 配置端口（默认 5678）
var port = args.Length > 0 && int.TryParse(args[0], out var p) ? p : 5678;
builder.WebHost.UseUrls($"http://localhost:{port}");

// 注册服务
builder.Services.AddSingleton<SsasDiscoveryService>();
builder.Services.AddSingleton<SsasConnectionService>();

// 配置 CORS（允许前端访问）
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.SetIsOriginAllowed(origin =>
        {
            var uri = new Uri(origin);
            return uri.Host == "localhost" || uri.Host == "127.0.0.1";
        })
        .AllowAnyMethod()
        .AllowAnyHeader();
    });
});

var app = builder.Build();
app.UseCors();

var logger = app.Services.GetRequiredService<ILogger<Program>>();
logger.LogInformation("PBI Proxy 启动中... 端口: {Port}", port);

// ===== API 路由 =====

// 健康检查
app.MapGet("/api/health", () => new { status = "ok", version = "1.0.0" });

// 发现 PBI Desktop 实例
app.MapGet("/api/instances", (SsasDiscoveryService discovery) =>
{
    var instances = discovery.DiscoverInstances();
    return new { instances };
});

// 连接到指定实例
app.MapPost("/api/connect", async (ConnectRequest request, SsasDiscoveryService discovery, SsasConnectionService connection) =>
{
    int targetPort;

    if (request.Port.HasValue)
    {
        targetPort = request.Port.Value;
    }
    else if (!string.IsNullOrEmpty(request.InstanceId))
    {
        var instances = discovery.DiscoverInstances();
        var instance = instances.FirstOrDefault(i => i.Id == request.InstanceId);
        if (instance == null)
            return Results.NotFound(new { error = $"未找到实例: {request.InstanceId}" });
        targetPort = instance.Port;
    }
    else
    {
        return Results.BadRequest(new { error = "请提供 instanceId 或 port" });
    }

    var (success, dbName, error) = await connection.ConnectAsync(targetPort);

    if (!success)
        return Results.Json(new { connected = false, error }, statusCode: 500);

    // 连接成功后获取基本信息
    List<TableInfo> tables;
    List<MeasureInfo> measures;
    try
    {
        tables = connection.GetTables();
        measures = connection.GetMeasures();
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "获取模型元数据失败，但连接成功");
        tables = new();
        measures = new();
    }

    return Results.Ok(new
    {
        connected = true,
        databaseName = dbName,
        port = targetPort,
        tables,
        measures
    });
});

// 获取表信息
app.MapGet("/api/tables", (SsasConnectionService connection) =>
{
    try
    {
        var tables = connection.GetTables();
        return Results.Ok(new { tables });
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
});

// 获取度量值
app.MapGet("/api/measures", (SsasConnectionService connection) =>
{
    try
    {
        var measures = connection.GetMeasures();
        return Results.Ok(new { measures });
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
});

// 执行 DAX 查询
app.MapPost("/api/query", (QueryRequest request, SsasConnectionService connection) =>
{
    if (string.IsNullOrWhiteSpace(request.Dax))
        return Results.BadRequest(new { error = "DAX 查询不能为空" });

    try
    {
        var result = connection.ExecuteQuery(request.Dax);
        return Results.Ok(result);
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "DAX 查询执行失败");
        return Results.Json(new { error = $"查询失败: {ex.Message}" }, statusCode: 500);
    }
});

// 快捷表查询
app.MapPost("/api/query/table", (TableQueryRequest request, SsasConnectionService connection) =>
{
    if (string.IsNullOrWhiteSpace(request.TableName))
        return Results.BadRequest(new { error = "表名不能为空" });

    try
    {
        var result = connection.QueryTable(request.TableName, request.Columns, request.MaxRows);
        return Results.Ok(result);
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "表查询执行失败");
        return Results.Json(new { error = $"查询失败: {ex.Message}" }, statusCode: 500);
    }
});

// 断开连接
app.MapPost("/api/disconnect", (SsasConnectionService connection) =>
{
    connection.Disconnect();
    return new { disconnected = true };
});

// 获取连接状态
app.MapGet("/api/status", (SsasConnectionService connection) =>
{
    return new
    {
        connected = connection.IsConnected,
        port = connection.ConnectedPort
    };
});

logger.LogInformation("PBI Proxy 已启动: http://localhost:{Port}", port);
logger.LogInformation("按 Ctrl+C 停止服务");

app.Run();
