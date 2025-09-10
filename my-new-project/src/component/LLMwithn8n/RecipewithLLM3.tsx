import React, { useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  Tabs,
  Form,
  Input,
  InputNumber,
  Select,
  Slider,
  Card,
  Button,
  Spin,
  Divider,
  Alert,
  Tag,
  Tooltip,
  Typography,
  Collapse,
  Space,
  message,
  ConfigProvider,
  Switch,
  theme,
} from "antd";
import { SendOutlined, PlayCircleOutlined, SaveOutlined, ReloadOutlined } from "@ant-design/icons";
import RecipeTable from "./RecipeTable";
import CustomDiagramEditor from "./FlowDiagram/CustomDiagramEditor";

const { Title, Text } = Typography;
// AntD v5: Prefer Collapse items API

/** ✅ index.css 에서 LGSmart를 기본으로 쓴다는 전제
 *  AntD 토큰과 일반 DOM 모두에 같은 스택을 강제 적용합니다.
 */
const APP_FONT =
  '"LGSmart", Pretendard, "Noto Sans KR", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"';

// -------------------- Types --------------------
interface MessageItem {
  id: string;
  role: "user" | "assistant";
  content: string; // HTML-safe string
}

interface CellInfo {
  cell_id: string;
  chemistry: "NCM" | "LFP" | "LCO" | "NCA" | "LMO" | "Other" | "";
  capacity_mAh: number | undefined;
  manufacturer: string;
  form_factor: "pouch" | "cylindrical" | "prismatic" | "";
  nominal_voltage?: number;
  rated_voltage_max?: number;
  rated_voltage_min?: number;
}

interface SafetyConstraints {
  max_voltage?: number;
  min_voltage?: number;
  max_temp?: number;
  max_charge_c?: number;
  max_discharge_c?: number;
  cutoff_current_c?: number;
}

interface SchedulingPlan {
  total_cycles: number | undefined;
  rest_after_charge_min?: number;
  rest_after_discharge_min?: number;
  measure_ir_every_n_cycles?: number;
  record_timeseries_every_n_sec?: number;
  dq_dv_every_n_cycles?: number;
  capacity_check_every_n_cycles?: number;
}

interface ThermalControl {
  chamber_control: "ambient" | "peltier" | "air_cooled" | "liquid_cooled" | "chamber" | "unknown";
  setpoint_c?: number;
  tolerance_c?: number;
}

interface ExperimentInfo {
  objective: string;
  soc_range: [number, number];
  total_cycles: number | undefined;
  safety_constraints: SafetyConstraints;
  scheduling: SchedulingPlan;
  thermal: ThermalControl;
  termination?: {
    capacity_fade_threshold_pct?: number;
    ir_increase_threshold_pct?: number;
    hard_limit_cycles?: number;
  };
  notes?: string;
}

export default function RecipewithLLM() {
  const [messageApi, contextHolder] = message.useMessage();
  const [isDark, setIsDark] = useState<boolean>(false);
  const [activeTabKey, setActiveTabKey] = useState<string>("chat");
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [finalRecipe, setFinalRecipe] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState<string>("");
  const sessionID = useRef<string>(uuidv4());

  // -------- Controlled form state --------
  const [cellInfo, setCellInfo] = useState<CellInfo>({
    cell_id: "",
    chemistry: "NCM",
    capacity_mAh: undefined,
    manufacturer: "",
    form_factor: "pouch",
    nominal_voltage: 3.7,
    rated_voltage_max: 4.2,
    rated_voltage_min: 2.5,
  });

  const [experimentInfo, setExperimentInfo] = useState<ExperimentInfo>({
    objective: "열화 유도",
    soc_range: [20, 80],
    total_cycles: 500,
    safety_constraints: {
      max_voltage: 4.2,
      min_voltage: 2.5,
      max_temp: 55,
      max_charge_c: 5,
      max_discharge_c: 5,
      cutoff_current_c: 0.05,
    },
    scheduling: {
      total_cycles: 500,
      rest_after_charge_min: 10,
      rest_after_discharge_min: 10,
      measure_ir_every_n_cycles: 5,
      record_timeseries_every_n_sec: 1,
      dq_dv_every_n_cycles: 50,
      capacity_check_every_n_cycles: 20,
    },
    thermal: {
      chamber_control: "chamber",
      setpoint_c: 25,
      tolerance_c: 1,
    },
    termination: {
      capacity_fade_threshold_pct: 80,
      ir_increase_threshold_pct: 100,
      hard_limit_cycles: 1200,
    },
    notes: "안전 인터락: 과전압/과온 시 즉시 차단 및 알람",
  });

  const disabledSend = useMemo(() => isGenerating, [isGenerating]);

  async function handleSendMessage(text: string) {
    if (!text.trim()) return;
    setIsGenerating(true);
    setErrorText(null);

    const payload = {
      mode: "chat",
      message: text,
      cell_info: { ...cellInfo, capacity_mAh: Number(cellInfo.capacity_mAh) || 0 },
      experiment_info: { ...experimentInfo, total_cycles: experimentInfo.total_cycles },
      sessionID: sessionID.current,
    };

    try {
      const res = await fetch("http://localhost:5678/webhook/start-experiment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to send message to LLM");
      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        { id: uuidv4(), role: "user", content: text },
        {
          id: uuidv4(),
          role: "assistant",
          content: (data.output || "No response").replace(/\n/g, "<br/>").replace(/<script.*?>[\s\S]*?<\/script>/gi, ""),
        },
      ]);
    } catch (err: any) {
  console.error(err);
  setErrorText(err?.message || "전송 중 오류가 발생했습니다.");
  messageApi.error("LLM 전송 실패");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleGenerateRecipe() {
    setIsGenerating(true);
    setErrorText(null);

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

    const payload = {
      mode: "recipe",
      finalMessage: lastAssistant?.content || "",
      cell_info: { ...cellInfo, capacity_mAh: Number(cellInfo.capacity_mAh) || 0 },
      experiment_info: { ...experimentInfo, total_cycles: experimentInfo.total_cycles },
      sessionID: sessionID.current,
    };

    try {
      const res = await fetch("http://localhost:5678/webhook/start-experiment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to generate recipe");
      const recipeData = await res.json();

      try {
  const parsed = JSON.parse(recipeData.output);
  setFinalRecipe(parsed);
  messageApi.success("레시피 생성 완료");
        setActiveTabKey("recipe-table");
      } catch (e) {
        setFinalRecipe(null);
        setActiveTabKey("chat");
        setMessages((prev) => [
          ...prev,
          { id: uuidv4(), role: "assistant", content: "레시피 JSON 파싱 실패: 백엔드 응답을 확인하세요.<br/>RAW: " + (recipeData.output || "(empty)") },
        ]);
      }
    } catch (err: any) {
  console.error(err);
  setErrorText(err?.message || "레시피 생성 중 오류가 발생했습니다.");
  messageApi.error("레시피 생성 실패");
    } finally {
      setIsGenerating(false);
    }
  }

  function resetAll() {
    setMessages([]);
    setFinalRecipe(null);
    setErrorText(null);
    setChatDraft("");
  messageApi.info("초기화했습니다.");
  }

  // -------------- UI Blocks --------------
  const ChatView = (
    <div className="flex flex-col h-[calc(100vh-160px)]">
      <Card className="mb-3" styles={{ body: { padding: 16 } }}>
        <div className="flex items-center justify-between">
          <Title level={4} className="!mb-0">실험 설계 LLM 시연</Title>
          <Space>
            <Tooltip title="초기화">
              <Button icon={<ReloadOutlined />} onClick={resetAll}>초기화</Button>
            </Tooltip>
            <Tooltip title="레시피 생성">
              <Button type="primary" icon={<PlayCircleOutlined />} loading={isGenerating} onClick={handleGenerateRecipe}>레시피 생성</Button>
            </Tooltip>
          </Space>
        </div>
      </Card>

      {errorText && <Alert type="error" showIcon message={errorText} className="mb-3" />}

      <Card className="flex-1 overflow-hidden" styles={{ body: { display: 'flex', flexDirection: 'column', height: '100%' } }}>
        {/* 메시지 영역 */}
        <div className="flex-1 overflow-auto px-1">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-70">
              <Title level={5} className="!mb-1">AI 배터리 실험 설계 도우미</Title>
              <Text>메시지를 입력하고 Enter를 눌러 대화를 시작하세요.</Text>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((m) => (
                <div key={m.id} className="w-full">
                  {m.role === "user" ? (
                    <div className="max-w-[40%] text-left rounded-xl p-3 shadow-sm border bg-blue-900/10 border-blue-400/30">
                      <div className="flex items-center gap-2 mb-1">
                        <Tag color="blue">김범수 선임님</Tag>
                        <Text type="secondary">user</Text>
                      </div>
                      <Text className="whitespace-pre-wrap text-base">{m.content}</Text>
                    </div>
                  ) : (
                    <div className="ml-auto text-left max-w-[80%] rounded-xl p-3 shadow-sm border bg-green-900/10 border-green-400/30">
                      <div className="flex items-center gap-2 mb-1 justify-end">
                        <Text type="secondary">AI 에이전트</Text>
                        <Tag color="green">assistant</Tag>
                      </div>
                      {/* ✅ prose에도 LGSmart 강제 */}
                      <div className="prose prose-sm max-w-none text-base" style={{ fontFamily: APP_FONT }} dangerouslySetInnerHTML={{ __html: m.content }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <Divider className="my-3" />

        {/* 입력 영역 */}
        <div className="flex items-end gap-2">
          <Input.TextArea
            value={chatDraft}
            onChange={(e) => setChatDraft(e.target.value)}
            placeholder="메시지를 입력하세요… (Enter 줄바꿈, Ctrl/Cmd+Enter 전송)"
            autoSize={{ minRows: 3, maxRows: 12 }}
            style={{ fontSize: 16, fontFamily: APP_FONT }}
            allowClear
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                if (chatDraft.trim()) {
                  handleSendMessage(chatDraft.trim());
                  setChatDraft("");
                }
              }
            }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            disabled={disabledSend}
            loading={isGenerating}
            onClick={() => {
              if (chatDraft.trim()) {
                handleSendMessage(chatDraft.trim());
                setChatDraft("");
              }
            }}
          >
            Send
          </Button>
        </div>
      </Card>
    </div>
  );

  const FlowView = (
    <div className="h-[calc(100vh-160px)]">
      <CustomDiagramEditor />
    </div>
  );

  const TableView = (
    <div className="h-[calc(100vh-160px)]">
      <RecipeTable finalRecipe={finalRecipe} />
    </div>
  );

  const SidebarForms = (
    <div className="space-y-3">
      <Card title="셀 기준정보" size="small">
        <Form layout="vertical">
          <Form.Item label="셀 ID">
            <Input value={cellInfo.cell_id} onChange={(e) => setCellInfo((s) => ({ ...s, cell_id: e.target.value }))} placeholder="셀 ID 입력" />
          </Form.Item>
          <Form.Item label="화학 성분">
            <Select
              value={cellInfo.chemistry}
              onChange={(v) => setCellInfo((s) => ({ ...s, chemistry: v as CellInfo["chemistry"] }))}
              options={[
                { value: "NCM", label: "NCM" },
                { value: "LFP", label: "LFP" },
                { value: "LCO", label: "LCO" },
                { value: "NCA", label: "NCA" },
                { value: "LMO", label: "LMO" },
                { value: "Other", label: "Other" },
              ]}
            />
          </Form.Item>
          <Form.Item label="용량 (mAh)">
            <InputNumber className="w-full" value={cellInfo.capacity_mAh} onChange={(v) => setCellInfo((s) => ({ ...s, capacity_mAh: v ?? undefined }))} placeholder="예: 3000" />
          </Form.Item>
          <Form.Item label="제조사">
            <Input value={cellInfo.manufacturer} onChange={(e) => setCellInfo((s) => ({ ...s, manufacturer: e.target.value }))} placeholder="제조사 입력" />
          </Form.Item>
          <Form.Item label="형태">
            <Select
              value={cellInfo.form_factor}
              onChange={(v) => setCellInfo((s) => ({ ...s, form_factor: v as CellInfo["form_factor"] }))}
              options={[{ value: "pouch", label: "파우치" }, { value: "cylindrical", label: "원통형" }, { value: "prismatic", label: "각형" }]}
            />
          </Form.Item>
          <Collapse
            ghost
            items={[
              {
                key: "v",
                label: <Text strong>전압 사양(선택)</Text>,
                children: (
                  <Space direction="vertical" className="w-full">
                    <InputNumber className="w-full" value={cellInfo.nominal_voltage} onChange={(v) => setCellInfo((s) => ({ ...s, nominal_voltage: v ?? undefined }))} placeholder="정격전압 (예: 3.7)" />
                    <InputNumber className="w-full" value={cellInfo.rated_voltage_max} onChange={(v) => setCellInfo((s) => ({ ...s, rated_voltage_max: v ?? undefined }))} placeholder="최대전압 (예: 4.2)" />
                    <InputNumber className="w-full" value={cellInfo.rated_voltage_min} onChange={(v) => setCellInfo((s) => ({ ...s, rated_voltage_min: v ?? undefined }))} placeholder="최소전압 (예: 2.5)" />
                  </Space>
                ),
              },
            ]}
          />
        </Form>
      </Card>

      <Card title="실험설계 기준정보" size="small">
        <Form layout="vertical">
          <Form.Item label="목표">
            <Input value={experimentInfo.objective} onChange={(e) => setExperimentInfo((s) => ({ ...s, objective: e.target.value }))} placeholder="예: 열화 유도" />
          </Form.Item>
          <Form.Item label="SOC 범위">
            <Slider range min={0} max={100} step={1} value={experimentInfo.soc_range} onChange={(v) => setExperimentInfo((s) => ({ ...s, soc_range: v as [number, number] }))} />
          </Form.Item>
          <Form.Item label="총 사이클">
            <InputNumber className="w-full" value={experimentInfo.total_cycles} onChange={(v) => setExperimentInfo((s) => ({ ...s, total_cycles: v ?? undefined, scheduling: { ...s.scheduling, total_cycles: v ?? undefined } }))} placeholder="예: 500" />
          </Form.Item>

          <Divider>안전 제한</Divider>
          <div className="grid grid-cols-3 gap-2">
            <InputNumber className="w-full" value={experimentInfo.safety_constraints.max_voltage} onChange={(v) => setExperimentInfo((s) => ({ ...s, safety_constraints: { ...s.safety_constraints, max_voltage: v ?? undefined } }))} placeholder="최대 전압 (예: 4.2)" />
            <InputNumber className="w-full" value={experimentInfo.safety_constraints.min_voltage} onChange={(v) => setExperimentInfo((s) => ({ ...s, safety_constraints: { ...s.safety_constraints, min_voltage: v ?? undefined } }))} placeholder="최소 전압 (예: 2.5)" />
            <InputNumber className="w-full" value={experimentInfo.safety_constraints.max_temp} onChange={(v) => setExperimentInfo((s) => ({ ...s, safety_constraints: { ...s.safety_constraints, max_temp: v ?? undefined } }))} placeholder="최대 온도 (예: 55)" />
            <InputNumber className="w-full" value={experimentInfo.safety_constraints.max_charge_c} onChange={(v) => setExperimentInfo((s) => ({ ...s, safety_constraints: { ...s.safety_constraints, max_charge_c: v ?? undefined } }))} placeholder="최대 충전 C" />
            <InputNumber className="w-full" value={experimentInfo.safety_constraints.max_discharge_c} onChange={(v) => setExperimentInfo((s) => ({ ...s, safety_constraints: { ...s.safety_constraints, max_discharge_c: v ?? undefined } }))} placeholder="최대 방전 C" />
            <InputNumber className="w-full" value={experimentInfo.safety_constraints.cutoff_current_c} onChange={(v) => setExperimentInfo((s) => ({ ...s, safety_constraints: { ...s.safety_constraints, cutoff_current_c: v ?? undefined } }))} placeholder="컷오프 전류(C)" />
          </div>

          <Divider>스케줄링</Divider>
          <div className="grid grid-cols-2 gap-2">
            <InputNumber className="w-full" value={experimentInfo.scheduling.rest_after_charge_min} onChange={(v) => setExperimentInfo((s) => ({ ...s, scheduling: { ...s.scheduling, rest_after_charge_min: v ?? undefined } }))} placeholder="충전 후 휴지(min)" />
            <InputNumber className="w-full" value={experimentInfo.scheduling.rest_after_discharge_min} onChange={(v) => setExperimentInfo((s) => ({ ...s, scheduling: { ...s.scheduling, rest_after_discharge_min: v ?? undefined } }))} placeholder="방전 후 휴지(min)" />
            <InputNumber className="w-full" value={experimentInfo.scheduling.measure_ir_every_n_cycles} onChange={(v) => setExperimentInfo((s) => ({ ...s, scheduling: { ...s.scheduling, measure_ir_every_n_cycles: v ?? undefined } }))} placeholder="IR 측정 주기(cycles)" />
            <InputNumber className="w-full" value={experimentInfo.scheduling.record_timeseries_every_n_sec} onChange={(v) => setExperimentInfo((s) => ({ ...s, scheduling: { ...s.scheduling, record_timeseries_every_n_sec: v ?? undefined } }))} placeholder="타임시리즈 주기(sec)" />
            <InputNumber className="w-full" value={experimentInfo.scheduling.dq_dv_every_n_cycles} onChange={(v) => setExperimentInfo((s) => ({ ...s, scheduling: { ...s.scheduling, dq_dv_every_n_cycles: v ?? undefined } }))} placeholder="dQ/dV 주기(cycles)" />
            <InputNumber className="w-full" value={experimentInfo.scheduling.capacity_check_every_n_cycles} onChange={(v) => setExperimentInfo((s) => ({ ...s, scheduling: { ...s.scheduling, capacity_check_every_n_cycles: v ?? undefined } }))} placeholder="capacity check 주기" />
          </div>

          <Divider>열 관리</Divider>
          <div className="grid grid-cols-3 gap-2">
            <Select value={experimentInfo.thermal.chamber_control} onChange={(v) => setExperimentInfo((s) => ({ ...s, thermal: { ...s.thermal, chamber_control: v } }))} options={[{ value: "ambient", label: "주변" }, { value: "peltier", label: "펠티어" }, { value: "air_cooled", label: "공냉" }, { value: "liquid_cooled", label: "수냉" }, { value: "chamber", label: "챔버" }, { value: "unknown", label: "미정" }]} />
            <InputNumber className="w-full" value={experimentInfo.thermal.setpoint_c} onChange={(v) => setExperimentInfo((s) => ({ ...s, thermal: { ...s.thermal, setpoint_c: v ?? undefined } }))} placeholder="설정온도(°C)" />
            <InputNumber className="w-full" value={experimentInfo.thermal.tolerance_c} onChange={(v) => setExperimentInfo((s) => ({ ...s, thermal: { ...s.thermal, tolerance_c: v ?? undefined } }))} placeholder="허용편차(°C)" />
          </div>

          <Collapse
            className="mt-2"
            ghost
            items={[
              {
                key: "t",
                label: <Text strong>종료 조건 / 비고 (선택)</Text>,
                children: (
                  <>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      <InputNumber className="w-full" value={experimentInfo.termination?.capacity_fade_threshold_pct} onChange={(v) => setExperimentInfo((s) => ({ ...s, termination: { ...s.termination, capacity_fade_threshold_pct: v ?? undefined } }))} placeholder="용량 임계(%)" />
                      <InputNumber className="w-full" value={experimentInfo.termination?.ir_increase_threshold_pct} onChange={(v) => setExperimentInfo((s) => ({ ...s, termination: { ...s.termination, ir_increase_threshold_pct: v ?? undefined } }))} placeholder="IR 증가 임계(%)" />
                      <InputNumber className="w-full" value={experimentInfo.termination?.hard_limit_cycles} onChange={(v) => setExperimentInfo((s) => ({ ...s, termination: { ...s.termination, hard_limit_cycles: v ?? undefined } }))} placeholder="하드 제한 사이클" />
                    </div>
                    <Input.TextArea rows={3} value={experimentInfo.notes} onChange={(e) => setExperimentInfo((s) => ({ ...s, notes: e.target.value }))} placeholder="특이사항/안전 인터락/샘플 교정 등" />
                  </>
                ),
              },
            ]}
          />
        </Form>
      </Card>

      <Space direction="vertical" className="w-full">
        <Button type="default" icon={<SaveOutlined />} className="w-full" onClick={() => messageApi.success("임시 저장 완료 (메모리)")}>저장</Button>
        <Button type="primary" icon={<PlayCircleOutlined />} className="w-full" loading={isGenerating} onClick={handleGenerateRecipe}>레시피 생성</Button>
      </Space>
    </div>
  );

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        /** ✅ AntD 내부 컴포넌트도 LGSmart 적용 */
        token: { fontFamily: APP_FONT },
      }}
    >
      {contextHolder}
      {/* ✅ 전체 DOM에도 동일 폰트 강제 + 다크 배경은 너무 새까맣지 않게 보정 */}
      <div
        className="h-screen w-full"
        style={{
          fontFamily: APP_FONT,
          background: isDark ? "#0f172a" /* slate-900 */ : "#f7f8fa",
        }}
      >
        <div className="h-full grid grid-cols-[1fr_380px] gap-4 p-4">
          {/* Main Area */}
          <div className="min-w-0">
            <Card className="mb-3" styles={{ body: { padding: 12 } }}>
              <Space className="w-full items-center justify-between">
                <Title level={3} className="!mb-0">Battery Experiment Designer</Title>
                <Space>
                  <span>Dark</span>
                  <Switch checked={isDark} onChange={setIsDark} />
                </Space>
              </Space>
            </Card>

            <Tabs
              activeKey={activeTabKey}
              onChange={setActiveTabKey}
              items={[
                { key: "chat", label: "Chat", children: ChatView },
                { key: "recipe", label: "Flow", children: <div className="h-[calc(100vh-160px)]"><CustomDiagramEditor /></div> },
                { key: "recipe-table", label: "Recipe Table", children: <div className="h-[calc(100vh-160px)]"><RecipeTable finalRecipe={finalRecipe} /></div> },
              ]}
            />
          </div>

          {/* Sidebar */}
          <div className="overflow-auto pb-4">{SidebarForms}</div>
        </div>

        {/* Global loading shade */}
        {isGenerating && (
          <div className="fixed inset-0 pointer-events-none">
            <div className="absolute right-4 bottom-4 rounded-xl shadow-lg px-3 py-2 flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.9)' }}>
              <Spin size="small" />
              <Text>생성 중…</Text>
            </div>
          </div>
        )}
      </div>
    </ConfigProvider>
  );
}
