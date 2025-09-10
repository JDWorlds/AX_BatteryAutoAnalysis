import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { SendOutlined, PlayCircleOutlined, SaveOutlined, ReloadOutlined, AudioOutlined, StopOutlined, PauseCircleOutlined } from "@ant-design/icons";
import RecipeTable from "./RecipeTable";
import CustomDiagramEditor, { applyRecipeSchema, selectNodeById } from "./FlowDiagram/CustomDiagramEditor";

const { Title, Text } = Typography;
// AntD v5: Prefer Collapse items API over children Panels

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
  audioUrl?: string;
  audioMimeType?: string;
  audioFileName?: string;
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

  // -------- Audio Recording state --------
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const [isUploadingAudio, setIsUploadingAudio] = useState<boolean>(false);
  const [audioEndpoint, setAudioEndpoint] = useState<string>("http://localhost:5678/webhook-test/start-experiment-voice");
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

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

  // 유연한 레시피 파서: 문자열/배열/객체 모두 처리
  function parseRecipeFlexible(input: any): any {
    // 이미 올바른 객체 형태
    if (input && typeof input === "object" && !Array.isArray(input)) {
      if (input.recipe?.flow && Array.isArray(input.recipe.flow)) return input;
      // n8n 스타일 배열 래핑일 수도 있음: [{ text: "{...}" }] 내부를 다시 시도
      if (Object.prototype.hasOwnProperty.call(input, "text") && typeof (input as any).text === "string") {
        return parseRecipeFlexible((input as any).text);
      }
    }
    // 배열: 첫 번째로 유효한 항목 찾기
    if (Array.isArray(input)) {
      for (const el of input) {
        try {
          const r = parseRecipeFlexible(el);
          if (r && r.recipe?.flow) return r;
        } catch {}
      }
    }
    // 문자열: 코드펜스/잡텍스트 제거 후 JSON 추출
    if (typeof input === "string") {
      let s = input.trim();
      // ```json ... ``` 제거
      s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      // 앞뒤 잡텍스트 있을 경우 중괄호 블록만 추출
      const first = s.indexOf("{");
      const last = s.lastIndexOf("}");
      if (first !== -1 && last !== -1 && last > first) {
        s = s.slice(first, last + 1);
      }
      const obj = JSON.parse(s);
      if (!obj || !obj.recipe || !Array.isArray(obj.recipe.flow)) {
        throw new Error("recipe.flow가 없습니다");
      }
      return obj;
    }
    throw new Error("지원되지 않는 레시피 응답 형식");
  }

  function getPreferredMimeType(): string {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/mp4",
      "audio/ogg;codecs=opus",
      "audio/ogg",
    ];
    for (const t of candidates) {
      // Some browsers (older Safari) may not expose isTypeSupported
      // In that case, just return empty string to let browser pick default
      if (typeof MediaRecorder !== "undefined" && (MediaRecorder as any).isTypeSupported && MediaRecorder.isTypeSupported(t)) {
        return t;
      }
    }
    return "";
  }

  async function startRecording() {
    if (isRecording) return;
    setRecordError(null);
    try {
      console.log("[rec] getUserMedia(audio:true) 요청");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("[rec] MediaStream 획득", { trackCount: stream.getTracks().length });
      recordStreamRef.current = stream;
      const preferred = getPreferredMimeType();
      console.log("[rec] MediaRecorder mimeType 선호도", { preferred });
      const mr = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
    mr.onstop = () => {
        try {
          const type = mr.mimeType || preferred || "audio/webm";
          const totalSize = audioChunksRef.current.reduce((s, p:any) => s + (p?.size || 0), 0);
          console.log("[rec] MediaRecorder onstop", {
            mimeType: type,
            chunkCount: audioChunksRef.current.length,
            totalSize,
          });
          const blob = new Blob(audioChunksRef.current, { type });
          if (audioUrl) URL.revokeObjectURL(audioUrl);
          const url = URL.createObjectURL(blob);
          setAudioBlob(blob);
          setAudioUrl(url);
      // Auto-upload right after recording stops
      // Use the freshly created blob to avoid setState timing issues
      console.log("[rec] Auto upload 직전", { blobType: blob.type, blobSize: blob.size });
      uploadAudioToN8n(blob);
        } catch (e) {
          console.error(e);
        } finally {
          // stop tracks
          recordStreamRef.current?.getTracks().forEach((t) => t.stop());
          recordStreamRef.current = null;
        }
      };
      mediaRecorderRef.current = mr;
      mr.start();
      console.log("[rec] MediaRecorder.start() 호출");
      setIsRecording(true);
  messageApi.success("녹음을 시작했습니다");
    } catch (e: any) {
      console.error(e);
      setRecordError(e?.message || "마이크 권한을 확인해주세요.");
  messageApi.error("마이크 접근 실패");
    }
  }

  function stopRecording() {
    if (!isRecording) return;
    const mr = mediaRecorderRef.current;
    try {
      mr?.stop();
    } catch (e) {
      console.error(e);
    } finally {
      setIsRecording(false);
  messageApi.info("녹음을 종료했습니다");
    }
  }

  function toggleRecording() {
    if (isRecording) stopRecording();
    else startRecording();
  }

  function clearRecording() {
    try {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    } catch {}
    setAudioUrl(null);
    setAudioBlob(null);
  }

  function inferExtFromType(type: string | undefined): string {
    if (!type) return "webm";
    const t = type.toLowerCase();
    if (t.includes("webm")) return "webm";
    if (t.includes("ogg")) return "ogg";
    if (t.includes("mp4")) return "m4a"; // often audio/mp4 -> .m4a
    return "webm";
  }
  function inferMimeFromExt(ext: string | undefined): string {
    if (!ext) return "audio/mpeg";
    const e = ext.replace(/^\./, "").toLowerCase();
    switch (e) {
      case "mp3":
        return "audio/mpeg";
      case "wav":
        return "audio/wav";
      case "ogg":
        return "audio/ogg";
      case "m4a":
        return "audio/mp4";
      case "webm":
        return "audio/webm";
      default:
        return "audio/mpeg";
    }
  }

  function createBlobFromBase64(base64: string, mime: string): Blob {
    const byteString = atob(base64);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mime });
  }

  async function uploadAudioToN8n(blobOverride?: Blob) {
    const useBlob = blobOverride || audioBlob;
    if (!useBlob) {
  messageApi.warning("업로드할 녹음이 없습니다");
      return;
    }
    if (!audioEndpoint.trim()) {
  messageApi.warning("엔드포인트 URL을 입력하세요");
      return;
    }
    setIsUploadingAudio(true);
    const tLabel = `[n8n] upload ${Date.now()}`;
    try {
      console.time(tLabel);
      console.log("[n8n] Upload start", {
        endpoint: audioEndpoint,
        blobType: useBlob.type,
        blobSize: useBlob.size,
        sessionID: sessionID.current,
      });
      const ext = inferExtFromType(useBlob.type);
      const fileName = `recording-${sessionID.current}-${Date.now()}.${ext}`;
      const fd = new FormData();
      fd.append("audio", useBlob, fileName);
      fd.append("sessionID", sessionID.current);
      fd.append("mimeType", useBlob.type || "");
      fd.append("mode", "voice");
      const pkg = {
        mode: "chat",
        sessionID: sessionID.current,
        cell_info: { ...cellInfo, capacity_mAh: Number(cellInfo.capacity_mAh) || 0 },
        experiment_info: { ...experimentInfo, total_cycles: experimentInfo.total_cycles },
        timestamp: new Date().toISOString(),
      };
      const pkgStr = JSON.stringify(pkg);
      fd.append("package", pkgStr);
      console.log("[n8n] FormData 구성", {
        fileField: "audio",
        fileName,
        sessionID: sessionID.current,
        mode: "voice",
        packageBytes: pkgStr.length,
      });

      const res = await fetch(audioEndpoint, {
        method: "POST",
        body: fd,
      });
      console.log("[n8n] Response status", res.status, res.statusText);
      const headersObj: Record<string, string> = {};
      res.headers.forEach((v, k) => (headersObj[k] = v));
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const cd = res.headers.get("content-disposition") || "";
      console.log("[n8n] Response headers", { ct, cd, headersObj });

      // 1) 바이너리 오디오 응답 (audio/* 또는 octet-stream)
      if (ct.startsWith("audio/") || ct.includes("application/octet-stream")) {
        console.time("[n8n] blob() elapsed");
        const blob = await res.blob();
        console.timeEnd("[n8n] blob() elapsed");
        console.log("[n8n] Binary audio 응답", { size: blob.size, type: blob.type });
        // 파일명 추출
        const fnMatch = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
        const fileName = decodeURIComponent(fnMatch?.[1] || fnMatch?.[2] || `response-${Date.now()}`);
        const extFromName = fileName.split('.').pop();
        const inferred = blob.type || inferMimeFromExt(extFromName);
        const url = URL.createObjectURL(blob);
        setMessages((prev) => [
          ...prev,
          { id: uuidv4(), role: "assistant", content: "음성 응답", audioUrl: url, audioMimeType: inferred, audioFileName: fileName },
        ]);
  messageApi.success("오디오 응답을 수신했습니다");
        return; // done
      }

      // 2) JSON 응답 처리
      try {
        console.time("[n8n] json() elapsed");
        const data = await res.json();
        console.timeEnd("[n8n] json() elapsed");
        const arr = Array.isArray(data) ? data : [data];
        console.log("[n8n] JSON parsed 타입", Array.isArray(data) ? `array[len=${arr.length}]` : typeof data);

        let anyHandled = false;

        // 2-0) 최우선: data[0].audio.base64
        const first = arr[0] ?? null;
        const exactB64: string | undefined = first?.audio?.base64;
        const exactMime: string = first?.audio?.mimeType || first?.mimeType || "audio/mpeg";
        const exactName: string = first?.audio?.fileName || first?.fileName || `response-${Date.now()}.${inferExtFromType(exactMime)}`;
        const exactTextRaw = first?.text || first?.output || first?.message || first?.transcript || first?.content || "";
        const exactTextHtml = exactTextRaw ? String(exactTextRaw).replace(/\n/g, "<br/>").replace(/<script.*?>[\s\S]*?<\/script>/gi, "") : "";
        if (typeof exactB64 === "string" && exactB64.length > 0) {
          console.log("[n8n] data[0].audio.base64 사용", { len: exactB64.length, mime: exactMime, name: exactName });
          const blob = createBlobFromBase64(exactB64, exactMime);
          const url = URL.createObjectURL(blob);
          setMessages((prev) => [
            ...prev,
            { id: uuidv4(), role: "assistant", content: exactTextHtml || "음성 응답", audioUrl: url, audioMimeType: exactMime, audioFileName: exactName },
          ]);
          anyHandled = true;
          messageApi.success("오디오 응답을 수신했습니다");
        }

        // 2-1) 폴백: 각 항목에서 URL/base64/텍스트 탐색
        if (!anyHandled) {
          for (let i = 0; i < arr.length; i++) {
            const m: any = arr[i];
            console.log(`[n8n] 항목 처리 i=${i}`, m && typeof m === "object" ? Object.keys(m) : typeof m);
            const audioObj = (m && typeof m === "object" && (m.audio || {})) || {};
            const mime = (audioObj as any)?.mimeType || (audioObj as any)?.mimetype || (m as any)?.mimeType || (m as any)?.mimetype || "audio/mpeg";
            const name = (audioObj as any)?.fileName || (audioObj as any)?.filename || (m as any)?.fileName || (m as any)?.filename || `response-${Date.now()}.${inferExtFromType(mime)}`;
            const rawText = (m as any)?.text || (m as any)?.output || (m as any)?.message || (m as any)?.transcript || (m as any)?.content || "";
            const textHtml = rawText ? String(rawText).replace(/\n/g, "<br/>").replace(/<script.*?>[\s\S]*?<\/script>/gi, "") : "";

            // URL 우선
            const urlField = (m as any)?.fileUrl || (m as any)?.url || (m as any)?.downloadUrl || (audioObj as any)?.url;
            if (urlField && typeof urlField === "string") {
              console.log("[n8n] Downloading audio from URL:", urlField);
              const fileResp = await fetch(urlField);
              if (!fileResp.ok) throw new Error(`오디오 다운로드 실패: ${fileResp.status}`);
              const blob = await fileResp.blob();
              const fh: Record<string, string> = {};
              fileResp.headers.forEach((v, k) => (fh[k] = v));
              console.log("[n8n] 파일 응답 헤더", fh);
              const url = URL.createObjectURL(blob);
              setMessages((prev) => [
                ...prev,
                { id: uuidv4(), role: "assistant", content: textHtml || "음성 응답", audioUrl: url, audioMimeType: blob.type || mime, audioFileName: name },
              ]);
              anyHandled = true;
              messageApi.success("오디오 응답을 수신했습니다");
              break;
            }

            // base64 폴백
            const b64 = (audioObj as any)?.base64 || (m as any)?.audio?.base64 || (m as any)?.base64;
            if (b64 && typeof b64 === "string") {
              console.log("[n8n] Base64 audio length:", b64?.length);
              const blob = createBlobFromBase64(b64, mime);
              const url = URL.createObjectURL(blob);
              setMessages((prev) => [
                ...prev,
                { id: uuidv4(), role: "assistant", content: textHtml || "음성 응답", audioUrl: url, audioMimeType: mime, audioFileName: name },
              ]);
              anyHandled = true;
              messageApi.success("오디오 응답을 수신했습니다");
              break;
            }

            // 텍스트만
            if (textHtml) {
              setMessages((prev) => [
                ...prev,
                { id: uuidv4(), role: "assistant", content: textHtml },
              ]);
              anyHandled = true;
              messageApi.success("텍스트 응답을 수신했습니다");
              break;
            }
          }
        }

        if (!anyHandled) {
          console.log("[n8n] No audio/text payload; showing meta only");
          setMessages((prev) => [
            ...prev,
            { id: uuidv4(), role: "assistant", content: "응답 수신(메타) 완료" },
          ]);
          messageApi.success("응답 수신 완료");
        }
      } catch (err) {
        console.log("[n8n] JSON parse 실패 또는 비정형 응답", err);
        const textPrev = await res.text().catch(() => "");
        console.log("[n8n] 응답 미리보기", textPrev.slice(0, 500));
  messageApi.info("응답을 처리했습니다");
      }
    } catch (e: any) {
      console.error(e);
  messageApi.error(e?.message || "업로드 중 오류가 발생했습니다");
    } finally {
      setIsUploadingAudio(false);
      console.timeEnd(tLabel);
    }
  }

  useEffect(() => {
    return () => {
      // cleanup on unmount
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      } catch {}
  recordStreamRef.current?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, []);

  async function handleSendMessage(text: string) {
    if (!text.trim()) return;
    setIsGenerating(true);
    setErrorText(null);

    const payload = {
      mode: "text",
      message: text,
      sessionID: sessionID.current,
      package: {
  mode: "chat",
        sessionID: sessionID.current,
        cell_info: { ...cellInfo, capacity_mAh: Number(cellInfo.capacity_mAh) || 0 },
        experiment_info: { ...experimentInfo, total_cycles: experimentInfo.total_cycles },
        timestamp: new Date().toISOString(),
      },
    };

    try {
      console.log("[chat] POST 시작", { url: "http://localhost:5678/webhook-test/start-experiment-voice" });
      console.time("[chat] fetch elapsed");
      const res = await fetch("http://localhost:5678/webhook-test/start-experiment-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      console.timeEnd("[chat] fetch elapsed");
      console.log("[chat] 상태", res.status, res.statusText);
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const cd = res.headers.get("content-disposition") || "";
      console.log("[chat] headers", { ct, cd });
      if (!res.ok) throw new Error("Failed to send message to LLM");

      // 사용자 메시지는 항상 기록
      setMessages((prev) => [
        ...prev,
        { id: uuidv4(), role: "user", content: text },
      ]);

      // 1) 오디오 바이너리 응답
      if (ct.startsWith("audio/") || ct.includes("application/octet-stream")) {
        console.time("[chat] blob() elapsed");
        const blob = await res.blob();
        console.timeEnd("[chat] blob() elapsed");
        const fnMatch = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
        const fileName = decodeURIComponent(fnMatch?.[1] || fnMatch?.[2] || `chat-${Date.now()}`);
        const extFromName = fileName.split('.').pop();
        const inferred = blob.type || inferMimeFromExt(extFromName);
        const url = URL.createObjectURL(blob);
        setMessages((prev) => [
          ...prev,
          { id: uuidv4(), role: "assistant", content: "음성 응답", audioUrl: url, audioMimeType: inferred, audioFileName: fileName },
        ]);
        console.log("[chat] 바이너리 오디오 처리 완료", { size: blob.size, type: inferred });
        return;
      }

      // 2) JSON 응답
      if (ct.includes("json")) {
        const data = await res.json();
        const arr = Array.isArray(data) ? data : [data];
        console.log("[chat] JSON parsed 타입", Array.isArray(data) ? `array[len=${arr.length}]` : typeof data);

        // 2-0) 최우선: data[0].audio.base64
        const first = arr[0] ?? null;
        const exactB64: string | undefined = first?.audio?.base64;
        const exactMime: string = first?.audio?.mimeType || first?.mimeType || "audio/mpeg";
        const exactName: string = first?.audio?.fileName || first?.fileName || `chat-${Date.now()}.${inferExtFromType(exactMime)}`;
        const exactTextRaw = first?.text || first?.output || first?.message || first?.transcript || first?.content || "";
        const exactTextHtml = exactTextRaw ? String(exactTextRaw).replace(/\n/g, "<br/>").replace(/<script.*?>[\s\S]*?<\/script>/gi, "") : "";
        if (typeof exactB64 === "string" && exactB64.length > 0) {
          console.log("[chat] data[0].audio.base64 사용", { len: exactB64.length, mime: exactMime, name: exactName, TextRaw : exactTextRaw  });
          const blob = createBlobFromBase64(exactB64, exactMime);
          const url = URL.createObjectURL(blob);
          setMessages((prev) => [
            ...prev,
            { id: uuidv4(), role: "assistant", content: exactTextHtml || "음성 응답", audioUrl: url, audioMimeType: exactMime, audioFileName: exactName },
          ]);
          return;
        }

        // 2-1) URL 폴백
        for (let i = 0; i < arr.length; i++) {
          const m: any = arr[i];
          const audioObj = (m && typeof m === "object" && (m.audio || {})) || {};
          const mime = (audioObj as any)?.mimeType || (audioObj as any)?.mimetype || (m as any)?.mimeType || (m as any)?.mimetype || "audio/mpeg";
          const name = (audioObj as any)?.fileName || (audioObj as any)?.filename || (m as any)?.fileName || (m as any)?.filename || `chat-${Date.now()}.${inferExtFromType(mime)}`;
          const rawText = (m as any)?.text || (m as any)?.output || (m as any)?.message || (m as any)?.transcript || (m as any)?.content || "";
          const textHtml = rawText ? String(rawText).replace(/\n/g, "<br/>").replace(/<script.*?>[\s\S]*?<\/script>/gi, "") : "";
          const urlField = (m as any)?.fileUrl || (m as any)?.url || (m as any)?.downloadUrl || (audioObj as any)?.url;
          if (urlField && typeof urlField === "string") {
            console.log("[chat] audio URL 감지", urlField);
            const fileResp = await fetch(urlField);
            if (!fileResp.ok) throw new Error(`오디오 다운로드 실패: ${fileResp.status}`);
            const blob = await fileResp.blob();
            const url = URL.createObjectURL(blob);
            setMessages((prev) => [
              ...prev,
              { id: uuidv4(), role: "assistant", content: textHtml || "음성 응답", audioUrl: url, audioMimeType: blob.type || mime, audioFileName: name },
            ]);
            return;
          }
        }

        // 2-2) 텍스트 기본값
        const textContent = (arr[0]?.text || arr[0]?.output || arr[0]?.message || arr[0]?.transcript || arr[0]?.content || "No response");
        const textHtml = String(textContent).replace(/\n/g, "<br/>").replace(/<script.*?>[\s\S]*?<\/script>/gi, "");
        setMessages((prev) => [
          ...prev,
          { id: uuidv4(), role: "assistant", content: textHtml },
        ]);
        return;
      }

      // 3) 그 외(non-JSON) 텍스트 응답 처리
      const textResp = await res.text();
      console.log("[chat] non-JSON 응답 미리보기", textResp.slice(0, 500));
      const textHtml = String(textResp).replace(/\n/g, "<br/>").replace(/<script.*?>[\s\S]*?<\/script>/gi, "");
      setMessages((prev) => [
        ...prev,
        { id: uuidv4(), role: "assistant", content: textHtml },
      ]);
      return;
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
      mode: "text",
      finalMessage: lastAssistant?.content || "",
      sessionID: sessionID.current,
      package: {
  mode: "recipe",
        sessionID: sessionID.current,
        cell_info: { ...cellInfo, capacity_mAh: Number(cellInfo.capacity_mAh) || 0 },
        experiment_info: { ...experimentInfo, total_cycles: experimentInfo.total_cycles },
        timestamp: new Date().toISOString(),
      },
    };

    try {
      console.log("[recipe] POST 시작", { url: "http://localhost:5678/webhook-test/start-experiment-voice" });
      console.time("[recipe] fetch elapsed");
      const res = await fetch("http://localhost:5678/webhook-test/start-experiment-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      console.timeEnd("[recipe] fetch elapsed");
      console.log("[recipe] 상태", res.status, res.statusText);
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      console.log("[recipe] content-type", ct);
      if (!res.ok) throw new Error("Failed to generate recipe");
  let recipeData: any = null;
      if (ct.includes("json")) {
        recipeData = await res.json();
        console.log("[recipe] JSON parsed keys", recipeData && typeof recipeData === 'object' ? Object.keys(recipeData) : typeof recipeData);
      } else {
        const textResp = await res.text();
        console.log("[recipe] non-JSON 응답 미리보기", textResp.slice(0, 800));
        try { recipeData = JSON.parse(textResp); } catch { recipeData = { output: textResp }; }
      }

      try {
        const parsed = parseRecipeFlexible(recipeData);
        console.log("[recipe] 레시피 파싱 성공", { keys: Object.keys(parsed || {}) });
        setFinalRecipe(parsed);
  messageApi.success("레시피 생성 완료");
        // 다이어그램에 주입하고 Flow 탭으로 이동
        try {
          applyRecipeSchema(parsed);
          console.log("[recipe] 다이어그램에 스키마 적용 완료");
          setActiveTabKey("recipe");
        } catch (e) {
          console.warn("[recipe] 다이어그램 주입 실패", e);
          setActiveTabKey("recipe-table");
        }
      } catch (e: any) {
        console.warn("[recipe] 레시피 파싱 실패", e);
        setFinalRecipe(null);
        setActiveTabKey("chat");
        const rawPreview = typeof recipeData === 'string' ? recipeData.slice(0, 800) : JSON.stringify(recipeData)?.slice(0, 800);
        setMessages((prev) => [
          ...prev,
          { id: uuidv4(), role: "assistant", content: `레시피 JSON 파싱 실패: ${e?.message || ''}<br/>RAW: ${rawPreview}` },
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
  {recordError && <Alert type="error" showIcon message={recordError} className="mb-3" />}

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
                      {m.audioUrl ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-3">
                            <Button
                              shape="circle"
                              type="primary"
                              icon={playingAudioId === m.id ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                              onClick={() => {
                                const el = audioRefs.current.get(m.id);
                                if (!el) return;
                                if (playingAudioId === m.id && !el.paused) {
                                  el.pause();
                                  setPlayingAudioId(null);
                                  return;
                                }
                                if (playingAudioId && audioRefs.current.get(playingAudioId)) {
                                  const prev = audioRefs.current.get(playingAudioId);
                                  if (prev && !prev.paused) prev.pause();
                                }
                                el.currentTime = 0;
                                el.play();
                                setPlayingAudioId(m.id);
                                el.onended = () => setPlayingAudioId(null);
                              }}
                            />
                            <div className="flex flex-col">
                              <Text strong>음성 응답</Text>
                              <Text type="secondary" className="text-xs">{m.audioFileName || m.audioMimeType || "audio"}</Text>
                            </div>
                            <audio
                              src={m.audioUrl}
                              preload="auto"
                              ref={(el) => {
                                if (el) audioRefs.current.set(m.id, el);
                                else audioRefs.current.delete(m.id);
                              }}
                              style={{ display: 'none' }}
                            />
                          </div>
                          {m.content && (
                            <div className="prose prose-sm max-w-none text-base" style={{ fontFamily: APP_FONT }} dangerouslySetInnerHTML={{ __html: m.content }} />
                          )}
                        </div>
                      ) : (
                        <div className="prose prose-sm max-w-none text-base" style={{ fontFamily: APP_FONT }} dangerouslySetInnerHTML={{ __html: m.content }} />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <Divider className="my-3" />

        {/* 녹음 미리 듣기/전송 패널 */}
        {audioBlob && audioUrl && !isRecording && (
          <Card size="small" className="mb-2" styles={{ body: { padding: 12 } }}>
            <div className="flex items-center gap-3">
              <audio src={audioUrl} controls className="max-w-full" />
              {isUploadingAudio && <Spin size="small" />}
            </div>
          </Card>
        )}

        {/* 입력 영역 */}
        <div className="flex items-end gap-2">
          {/* Voice Record Button */}
          <Tooltip title={isRecording ? "녹음 종료" : "음성 녹음 시작"}>
            <Button
              type={isRecording ? "primary" : "default"}
              danger={isRecording}
              shape="circle"
              size="large"
              icon={isRecording ? <StopOutlined /> : <AudioOutlined />}
              onClick={toggleRecording}
            />
          </Tooltip>
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
      <RecipeTable
        finalRecipe={finalRecipe}
        onRowClick={(stepId) => {
          // Flow 탭으로 전환 후 해당 노드 선택
          setActiveTabKey("recipe");
          const ok = selectNodeById(stepId);
          if (!ok) console.warn("[table→flow] 노드 선택 실패", stepId);
        }}
      />
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
                { key: "recipe-table", label: "Recipe Table", children: TableView },
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

        {/* Recording overlay */}
        {isRecording && (
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="relative w-44 h-44">
              <div className="absolute inset-0 rounded-full bg-red-500 opacity-20 animate-ping"></div>
              <div className="absolute inset-4 rounded-full bg-red-500 opacity-20 animate-ping [animation-delay:200ms]"></div>
              <div className="absolute inset-8 rounded-full bg-red-500 opacity-20 animate-ping [animation-delay:400ms]"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="rounded-full w-20 h-20 bg-red-600 text-white flex items-center justify-center shadow-2xl">
                  <AudioOutlined style={{ fontSize: 28 }} />
                </div>
              </div>
              <div className="absolute -bottom-10 w-full text-center">
                <Text strong style={{ color: isDark ? '#fff' : '#111827' }}>녹음 중…</Text>
              </div>
            </div>
          </div>
        )}
      </div>
    </ConfigProvider>
  );
}
