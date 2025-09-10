import React from "react";
import { Table } from "antd"; // Ant Design의 Table 컴포넌트 사용

interface RecipeTableProps {
  finalRecipe: {
    summary: string;
    recipe: {
      flow: Array<{
        step_id: string;
        type: string;
        parameters: Record<string, any>;
        next_step?: string;
      }>;
    };
  } | null;
  onRowClick?: (stepId: string) => void;
}

const RecipeTable: React.FC<RecipeTableProps> = ({ finalRecipe, onRowClick }) => {
  if (!finalRecipe) {
    return (
      <div className="bg-white p-4 rounded shadow-md">
        <p className="text-gray-500">레시피 데이터가 없습니다.</p>
      </div>
    );
  }

  const columns = [
    { title: <span className="table-header">Step ID</span>, dataIndex: "step_id", key: "step_id" },
    { title: <span className="table-header">Type</span>, dataIndex: "type", key: "type" },
    {
      title: <span className="table-header">Parameters</span>,
      dataIndex: "parameters",
      key: "parameters",
      render: (params: Record<string, any>) => (
        <ul className="list-disc pl-4">
          {Object.entries(params).map(([key, value]) => (
            <li key={key}>
              <strong>{key}:</strong> {JSON.stringify(value)}
            </li>
          ))}
        </ul>
      ),
    },
  { title: <span className="table-header">Next Step</span>, dataIndex: "next_step", key: "next_step", render: (nextStep: string | undefined) => nextStep || "N/A" },
  ];

  const dataSource = finalRecipe.recipe.flow.map((step, index) => ({
    key: index,
    step_id: step.step_id,
    type: step.type,
    parameters: step.parameters,
    next_step: step.next_step,
  }));

  return (
    <div className="bg-white p-4 rounded shadow-md recipe-table h-full flex flex-col">
      <h2 className="text-3xl font-extrabold mb-2 text-left">실험설계 개요</h2>
      <p className="text-base text-gray-700 mb-3 text-left">{finalRecipe.summary}</p>
      <div className="flex-1 min-h-0 overflow-auto">
        <Table
          columns={columns}
          dataSource={dataSource}
          pagination={false}
          bordered
          scroll={{ x: true }}
          onRow={(record) => ({
            onClick: () => {
              if (onRowClick) onRowClick(record.step_id);
            },
          })}
          rowClassName={() => "cursor-pointer"}
        />
      </div>
    </div>
  );
};

export default RecipeTable;