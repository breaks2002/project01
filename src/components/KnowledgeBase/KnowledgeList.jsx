import React from 'react';

/**
 * 知识库条目列表组件
 * 支持列表视图和网格视图，支持多选
 */
const KnowledgeList = ({
  entries,
  selectedEntries = [],
  onSelectEntries,
  onDelete,
  viewMode = 'list'
}) => {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8">
        <div className="text-6xl mb-4">📚</div>
        <p className="text-center">知识库还是空的</p>
      </div>
    );
  }

  // 按创建时间倒序排序
  const sortedEntries = [...entries].sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );

  const handleToggleEntry = (entry) => {
    onSelectEntries(prev => {
      const exists = prev.find(e => e.id === entry.id);
      return exists ? prev.filter(e => e.id !== entry.id) : [...prev, entry];
    });
  };

  const handleSelectAll = () => {
    if (selectedEntries.length === entries.length) {
      onSelectEntries([]);
    } else {
      onSelectEntries([...entries]);
    }
  };

  if (viewMode === 'grid') {
    return (
      <div className="p-4 grid grid-cols-2 gap-3">
        <div className="mb-2 col-span-2">
          <button
            onClick={handleSelectAll}
            className="text-xs px-3 py-1 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200"
          >
            {selectedEntries.length === entries.length ? '取消全选' : '全选'}
          </button>
          <span className="ml-2 text-xs text-gray-500">
            已选 {selectedEntries.length} / {entries.length}
          </span>
        </div>
        {sortedEntries.map((entry) => {
          const isSelected = selectedEntries.find(e => e.id === entry.id);
          return (
            <div
              key={entry.id}
              onClick={() => handleToggleEntry(entry)}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                  : 'hover:border-indigo-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <input
                  type="checkbox"
                  checked={isSelected || false}
                  onChange={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 text-indigo-600 rounded"
                />
                <h3 className="font-medium text-gray-800 text-sm truncate flex-1">
                  {entry.title}
                </h3>
              </div>
              <p className="text-xs text-gray-500 truncate mb-2 ml-6">
                {entry.description?.substring(0, 50) || '暂无描述'}
              </p>
              <div className="flex items-center gap-1 flex-wrap ml-6">
                <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                  {entry.industry}
                </span>
                {entry.tags?.slice(0, 2).map((tag, idx) => (
                  <span
                    key={idx}
                    className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // 列表视图
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={handleSelectAll}
          className="text-xs px-3 py-1 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200"
        >
          {selectedEntries.length === entries.length ? '取消全选' : '全选'}
        </button>
        <span className="text-xs text-gray-500">
          已选 {selectedEntries.length} / {entries.length}
        </span>
      </div>
      {sortedEntries.map((entry) => {
        const isSelected = selectedEntries.find(e => e.id === entry.id);
        return (
          <div
            key={entry.id}
            onClick={() => handleToggleEntry(entry)}
            className={`p-3 mb-2 rounded-lg border cursor-pointer transition-all ${
              isSelected
                ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                : 'hover:border-indigo-300 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => e.stopPropagation()}
                  className="w-4 h-4 text-indigo-600 rounded mt-0.5"
                />
                <div className="flex-1">
                  <h3 className="font-medium text-gray-800 mb-1">
                    {entry.title}
                  </h3>
                  <p className="text-sm text-gray-600 line-clamp-2">
                    {entry.description || '暂无描述'}
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                      {entry.industry}
                    </span>
                    <span className="text-xs text-gray-400">•</span>
                    <span className="text-xs text-gray-500">
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </span>
                    {entry.usageCount > 0 && (
                      <>
                        <span className="text-xs text-gray-400">•</span>
                        <span className="text-xs text-gray-500">
                          使用 {entry.usageCount} 次
                        </span>
                      </>
                    )}
                  </div>
                  {entry.tags && entry.tags.length > 0 && (
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      {entry.tags.slice(0, 5).map((tag, idx) => (
                        <span
                          key={idx}
                          className="text-xs px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(entry.id);
                }}
                className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                title="删除"
              >
                🗑️
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default KnowledgeList;
