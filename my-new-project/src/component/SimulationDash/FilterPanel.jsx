import React from "react";

export default function FilterPanel({
  metrics,
  selectedMetrics,
  onMetricChange,
  onGenerateGraph,
  yAxisSettings,
  onYAxisChange,
}) {
  return (
    <div className="bg-white p-4 rounded shadow mb-6">
      <h2 className="text-xl font-semibold mb-4">📊 출력할 데이터 선택</h2>
      <div className="flex flex-wrap gap-4">
        {metrics.map((metric) => (
          <button
            key={metric.key}
            onClick={() => onMetricChange(metric.key)}
            className={`px-4 py-2 rounded shadow border-2 ${
              selectedMetrics.includes(metric.key)
                ? "bg-blue-500 text-white border-blue-700"
                : "bg-gray-200 text-gray-700 border-transparent"
            }`}
          >
            {metric.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-2">Y축 설정</h3>
        {selectedMetrics.map((metricKey) => (
          <div key={metricKey} className="mb-4">
            <h4 className="font-medium">{metrics.find((m) => m.key === metricKey)?.label}</h4>
            <div className="flex gap-4">
              <div>
                <label className="block text-sm font-medium">최소값</label>
                <input
                  type="text" // 텍스트로 처리하여 "-" 입력 허용
                  value={yAxisSettings[metricKey]?.min ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!isNaN(value) || value === "-") {
                      onYAxisChange(metricKey, "min", value === "-" ? value : Number(value));
                    }
                  }}
                  className="border rounded px-2 py-1 w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">최대값</label>
                <input
                  type="number"
                  value={yAxisSettings[metricKey]?.max || ""}
                  onChange={(e) => onYAxisChange(metricKey, "max", Number(e.target.value))}
                  className="border rounded px-2 py-1 w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">간격</label>
                <input
                  type="number"
                  value={yAxisSettings[metricKey]?.interval || ""}
                  onChange={(e) => onYAxisChange(metricKey, "interval", Number(e.target.value))}
                  className="border rounded px-2 py-1 w-full"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="text-center mt-4">
        <button
          onClick={onGenerateGraph}
          className="px-6 py-2 bg-blue-500 text-white rounded shadow hover:bg-blue-600 transition"
        >
          그래프 생성
        </button>
      </div>
    </div>
  );
}