import React, { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  Activity,
  AlertTriangle,
  Box,
  Bolt,
  Calculator,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  ClipboardCheck,
  Cloud,
  Crosshair,
  Cpu,
  DatabaseZap,
  Download,
  FileCheck2,
  FileJson,
  FlaskConical,
  Gauge,
  HardDriveDownload,
  Info,
  Layers3,
  Network,
  Printer,
  Ruler,
  RotateCcw,
  Send,
  ServerCog,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Terminal,
  Upload,
  Weight,
  Zap,
} from "lucide-react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import ThreeStressViewer from "./ThreeStressViewer.jsx";
import {
  LOAD_DIRECTIONS,
  MATERIALS,
  SUPPORT_FACES,
  UNIT_SCALES,
  analyzeGeometry,
  clamp,
  createDemoGeometry,
  formatNumber,
  formatPercent,
  geometryFromObject,
  prepareGeometry,
  printRiskLabel,
  printRiskTone,
  utilizationLabel,
  utilizationTone,
} from "./modelAnalysis.js";
import {
  DEFAULT_PRO_SETTINGS,
  EXECUTION_TARGETS,
  REPORT_STANDARDS,
  SOLVER_OPTIONS,
  buildProfessionalAnalysis,
  createSolverJobPayload,
} from "./professionalAnalysis.js";

const DEFAULT_SETTINGS = {
  units: "mm",
  material: "pla",
  loadKg: 35,
  supportFace: "minY",
  loadDirection: "negY",
  loadU: 0.5,
  loadV: 0.5,
  loadW: 0.5,
  loadSpread: 32,
  infill: 35,
  shells: 2,
  targetSafety: 2,
  layerAxis: "y",
  overhangAngle: 45,
  viewMode: "stress",
};

const LAYER_AXES = {
  y: { label: "Y축 적층" },
  z: { label: "Z축 적층" },
  x: { label: "X축 적층" },
};

const VIEW_MODES = {
  stress: { label: "하중", icon: Activity },
  print: { label: "출력", icon: Printer },
};

function App() {
  const fileInputRef = useRef(null);
  const [model, setModel] = useState(() => ({
    name: "샘플 브래킷",
    source: "demo",
    geometry: createDemoGeometry(),
  }));
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [proSettings, setProSettings] = useState(DEFAULT_PRO_SETTINGS);
  const [fileError, setFileError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [cloudStatus, setCloudStatus] = useState({
    tone: "",
    message: "Cloud API URL을 넣으면 이 브라우저에서 바로 해석 job을 제출할 수 있습니다.",
  });
  const [isSubmittingCloud, setIsSubmittingCloud] = useState(false);

  const analysis = useMemo(() => analyzeGeometry(model.geometry, settings), [model.geometry, settings]);
  const professional = useMemo(
    () => buildProfessionalAnalysis(analysis, settings, proSettings, model),
    [analysis, settings, proSettings, model],
  );
  const solverJob = useMemo(
    () => createSolverJobPayload(model, analysis, settings, proSettings, professional),
    [model, analysis, settings, proSettings, professional],
  );
  const isPrintMode = settings.viewMode === "print";
  const activeScore = isPrintMode ? analysis.printStability.maxRisk : analysis.maxUtilization;
  const tone = isPrintMode ? printRiskTone(activeScore) : utilizationTone(activeScore);
  const statusText = isPrintMode
    ? `${printRiskLabel(activeScore)} · 출력 리스크 ${formatPercent(activeScore)}`
    : `${utilizationLabel(activeScore)} · 최대 사용률 ${formatPercent(activeScore)}`;
  const recommendations = useMemo(
    () => (settings.viewMode === "print" ? buildPrintRecommendations(analysis, settings) : buildRecommendations(analysis, settings)),
    [analysis, settings],
  );

  function updateSetting(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function updateProSetting(key, value) {
    setProSettings((current) => ({ ...current, [key]: value }));
    if (key === "cloudApiUrl" || key === "executionTarget") {
      setCloudStatus({
        tone: "",
        message: "Cloud API URL을 넣으면 이 브라우저에서 바로 해석 job을 제출할 수 있습니다.",
      });
    }
  }

  function centerLoadPoint() {
    setSettings((current) => ({
      ...current,
      loadU: 0.5,
      loadV: 0.5,
      loadW: 0.5,
    }));
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    setFileError("");

    try {
      const geometry = await parseModelFile(file);
      setModel({
        name: file.name,
        source: "upload",
        geometry,
      });
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "파일을 읽지 못했습니다.");
    } finally {
      setIsLoading(false);
      event.target.value = "";
    }
  }

  function resetDemo() {
    setModel({
      name: "샘플 브래킷",
      source: "demo",
      geometry: createDemoGeometry(),
    });
    setSettings(DEFAULT_SETTINGS);
    setProSettings(DEFAULT_PRO_SETTINGS);
    setFileError("");
    setCloudStatus({
      tone: "",
      message: "Cloud API URL을 넣으면 이 브라우저에서 바로 해석 job을 제출할 수 있습니다.",
    });
  }

  function downloadSolverJob() {
    downloadJson(solverJob, `${model.name.replace(/\.[^.]+$/, "") || "stressscope"}-solver-job.json`);
  }

  async function submitCloudJob() {
    if (proSettings.executionTarget !== "cloud") {
      setCloudStatus({ tone: "warn", message: "실행 위치를 클라우드 해석 API로 바꾼 뒤 제출하세요." });
      return;
    }

    if (!professional.solver.cloud.endpoint) {
      setCloudStatus({ tone: "warn", message: "Cloud API URL이 비어 있습니다. 예: https://solver.example.com" });
      return;
    }

    setIsSubmittingCloud(true);
    setCloudStatus({ tone: "warn", message: "클라우드 해석 job을 제출하는 중입니다." });

    try {
      const response = await fetch(professional.solver.cloud.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(solverJob),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      const jobId = payload.jobId || payload.id || "accepted";
      setCloudStatus({
        tone: "safe",
        message: `클라우드 제출 완료: ${jobId} · 상태 ${payload.status || "queued"}`,
      });
    } catch (error) {
      setCloudStatus({
        tone: "danger",
        message: `클라우드 연결 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
      });
    } finally {
      setIsSubmittingCloud(false);
    }
  }

  function downloadReport() {
    const report = {
      model: model.name,
      createdAt: new Date().toISOString(),
      settings,
      result: {
        status: utilizationLabel(analysis.maxUtilization),
        maxUtilization: analysis.maxUtilization,
        maxStressMPa: analysis.maxStressMPa,
        allowableMPa: analysis.allowableMPa,
        safetyFactor: analysis.safetyFactor,
        deflectionMm: analysis.deflectionMm,
        massGrams: analysis.massGrams,
        warningRatio: analysis.warningRatio,
        printStatus: printRiskLabel(analysis.printStability.maxRisk),
      },
      printStability: summarizePrintStability(analysis.printStability),
      hotspots: analysis.hotspots.map((hotspot) => ({
        utilization: hotspot.utilization,
        stressMPa: hotspot.stressMPa,
        reason: hotspot.reason,
        position: hotspot.position.toArray(),
      })),
      meshQuality: analysis.meshQuality,
      professionalSettings: proSettings,
      professional,
      solverJob,
      note: "Mesh-based preliminary stress screening. Validate production parts with a real FEA solver and physical tests.",
    };
    downloadJson(report, `${model.name.replace(/\.[^.]+$/, "") || "stress-report"}-report.json`);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Box size={23} strokeWidth={2.2} />
          </span>
          <div>
            <h1>StressScope 3D</h1>
            <p>Fusion 모델 기반 3D 하중 집중 프리체크</p>
          </div>
        </div>
        <div className={`status-chip ${tone}`}>
          {isPrintMode ? <Printer size={17} /> : <ShieldCheck size={17} />}
          {statusText}
        </div>
      </header>

      <section className="workspace">
        <aside className="control-panel">
          <PanelHeading icon={Upload} title="모델 불러오기" />
          <div className="upload-box">
            <input
              ref={fileInputRef}
              type="file"
              accept=".stl,.obj,.3mf,.glb,.gltf"
              onChange={handleFileChange}
            />
            <button type="button" className="primary-button" onClick={() => fileInputRef.current?.click()}>
              <Upload size={17} />
              {isLoading ? "읽는 중" : "Fusion 파일 선택"}
            </button>
            <span>STL · OBJ · 3MF · GLB</span>
          </div>
          {fileError ? (
            <div className="inline-alert">
              <AlertTriangle size={15} />
              {fileError}
            </div>
          ) : null}

          <div className="panel-block">
            <PanelHeading icon={SlidersHorizontal} title="하중 조건" />
            <ControlSlider
              label="하중"
              value={settings.loadKg}
              min={1}
              max={250}
              step={1}
              unit="kg"
              onChange={(value) => updateSetting("loadKg", value)}
            />
            <div className="field-grid">
              <SelectField
                label="고정면"
                value={settings.supportFace}
                options={SUPPORT_FACES}
                onChange={(value) => updateSetting("supportFace", value)}
              />
              <SelectField
                label="하중 방향"
                value={settings.loadDirection}
                options={LOAD_DIRECTIONS}
                onChange={(value) => updateSetting("loadDirection", value)}
              />
            </div>
            <ControlSlider
              label="하중 위치 X"
              value={settings.loadU}
              min={0.05}
              max={0.95}
              step={0.01}
              unit=""
              formatter={(value) => `${Math.round(value * 100)}%`}
              onChange={(value) => updateSetting("loadU", value)}
            />
            <ControlSlider
              label="하중 위치 Y"
              value={settings.loadV}
              min={0.05}
              max={0.95}
              step={0.01}
              unit=""
              formatter={(value) => `${Math.round(value * 100)}%`}
              onChange={(value) => updateSetting("loadV", value)}
            />
            <ControlSlider
              label="하중 위치 Z"
              value={settings.loadW}
              min={0.05}
              max={0.95}
              step={0.01}
              unit=""
              formatter={(value) => `${Math.round(value * 100)}%`}
              onChange={(value) => updateSetting("loadW", value)}
            />
            <button type="button" className="center-load-button" onClick={centerLoadPoint}>
              <Crosshair size={16} />
              하중 중앙 정렬
            </button>
            <ControlSlider
              label="하중 접촉 면적"
              value={settings.loadSpread}
              min={5}
              max={100}
              step={1}
              unit="%"
              onChange={(value) => updateSetting("loadSpread", value)}
            />
          </div>

          <div className="panel-block">
            <PanelHeading icon={Settings2} title="출력 조건" />
            <ViewModeToggle value={settings.viewMode} onChange={(value) => updateSetting("viewMode", value)} />
            <div className="field-grid">
              <SelectField
                label="단위"
                value={settings.units}
                options={UNIT_SCALES}
                onChange={(value) => updateSetting("units", value)}
              />
              <SelectField
                label="재료"
                value={settings.material}
                options={MATERIALS}
                onChange={(value) => updateSetting("material", value)}
              />
            </div>
            <div className="field-grid">
              <SelectField
                label="적층 방향"
                value={settings.layerAxis}
                options={LAYER_AXES}
                onChange={(value) => updateSetting("layerAxis", value)}
              />
              <ControlSlider
                compact
                label="외벽 수"
                value={settings.shells}
                min={1}
                max={5}
                step={1}
                unit="겹"
                onChange={(value) => updateSetting("shells", value)}
              />
            </div>
            <ControlSlider
              label="서포트 기준 각도"
              value={settings.overhangAngle}
              min={35}
              max={65}
              step={1}
              unit="도"
              onChange={(value) => updateSetting("overhangAngle", value)}
            />
            <ControlSlider
              label="인필"
              value={settings.infill}
              min={10}
              max={100}
              step={5}
              unit="%"
              onChange={(value) => updateSetting("infill", value)}
            />
            <ControlSlider
              label="목표 안전계수"
              value={settings.targetSafety}
              min={1}
              max={4}
              step={0.1}
              unit="x"
              onChange={(value) => updateSetting("targetSafety", value)}
            />
          </div>

          <div className="panel-block">
            <PanelHeading icon={Cpu} title="정밀 해석 준비" />
            <SelectField
              label="실행 위치"
              value={proSettings.executionTarget}
              options={EXECUTION_TARGETS}
              onChange={(value) => updateProSetting("executionTarget", value)}
            />
            <TextField
              label="Cloud API URL"
              value={proSettings.cloudApiUrl}
              placeholder="https://solver.example.com"
              onChange={(value) => updateProSetting("cloudApiUrl", value)}
            />
            <div className="field-grid">
              <SelectField
                label="해석기"
                value={proSettings.solver}
                options={SOLVER_OPTIONS}
                onChange={(value) => updateProSetting("solver", value)}
              />
              <SelectField
                label="리포트 목적"
                value={proSettings.reportStandard}
                options={REPORT_STANDARDS}
                onChange={(value) => updateProSetting("reportStandard", value)}
              />
            </div>
            <ControlSlider
              label="체적 메시 크기"
              value={proSettings.meshSizeMm}
              min={0.8}
              max={12}
              step={0.2}
              unit="mm"
              onChange={(value) => updateProSetting("meshSizeMm", value)}
            />
            <ToggleField
              label="비선형 접촉/마찰 해석 준비"
              checked={proSettings.nonlinearContact}
              onChange={(value) => updateProSetting("nonlinearContact", value)}
            />
            <div className="field-grid">
              <ControlSlider
                compact
                label="볼트 수"
                value={proSettings.boltCount}
                min={1}
                max={12}
                step={1}
                unit="개"
                onChange={(value) => updateProSetting("boltCount", value)}
              />
              <ControlSlider
                compact
                label="볼트 지름"
                value={proSettings.boltDiameterMm}
                min={2}
                max={12}
                step={0.5}
                unit="mm"
                onChange={(value) => updateProSetting("boltDiameterMm", value)}
              />
            </div>
            <ControlSlider
              label="접착 면적"
              value={proSettings.adhesiveAreaMm2}
              min={50}
              max={2500}
              step={10}
              unit="mm2"
              onChange={(value) => updateProSetting("adhesiveAreaMm2", value)}
            />
            <ControlSlider
              label="Z층 접착 강도"
              value={proSettings.layerAdhesionMPa}
              min={5}
              max={45}
              step={1}
              unit="MPa"
              onChange={(value) => updateProSetting("layerAdhesionMPa", value)}
            />
          </div>

          <div className="button-row">
            <button type="button" className="secondary-button" onClick={resetDemo}>
              <RotateCcw size={16} />
              샘플 리셋
            </button>
            <button type="button" className="secondary-button" onClick={downloadReport}>
              <Download size={16} />
              결과 저장
            </button>
          </div>
        </aside>

        <section className="simulation-panel">
          <div className="canvas-toolbar">
            <div>
              <PanelHeading icon={isPrintMode ? Printer : Activity} title={model.name} />
              <span className="toolbar-subtext">
                {formatNumber(analysis.size.x, 1)} × {formatNumber(analysis.size.y, 1)} × {formatNumber(analysis.size.z, 1)} {settings.units}
                {" · "}
                {formatNumber(analysis.triangleCount, 0)} triangles
              </span>
            </div>
            <div className="legend">
              {isPrintMode ? (
                <>
                  <span><i className="safe" /> 출력 안정</span>
                  <span><i className="warn" /> 서포트 후보</span>
                  <span><i className="danger" /> 불안정</span>
                </>
              ) : (
                <>
                  <span><i className="safe" /> 안정</span>
                  <span><i className="warn" /> 주의</span>
                  <span><i className="danger" /> 위험</span>
                </>
              )}
            </div>
          </div>
          <ThreeStressViewer analysis={analysis} />
          <StressSummary analysis={analysis} mode={settings.viewMode} />
        </section>

        <aside className="results-panel">
          <PanelHeading icon={isPrintMode ? Printer : Gauge} title={isPrintMode ? "출력 안정성" : "해석 결과"} />
          <MetricRing value={activeScore} label={isPrintMode ? "출력 리스크" : "최대 사용률"} tone={tone} />
          {isPrintMode ? (
            <PrintMetrics analysis={analysis} settings={settings} />
          ) : (
            <>
              <div className="metric-grid">
                <Metric label="최대 응력" value={`${formatNumber(analysis.maxStressMPa, 1)} MPa`} tone={tone} />
                <Metric label="허용 응력" value={`${formatNumber(analysis.allowableMPa, 1)} MPa`} />
                <Metric label="안전계수" value={`${formatNumber(analysis.safetyFactor, 2)} x`} tone={tone} />
                <Metric label="추정 변위" value={`${formatNumber(analysis.deflectionMm, 2)} mm`} />
                <Metric label="예상 무게" value={`${formatNumber(analysis.massGrams, 0)} g`} />
                <Metric label="주의 면적" value={formatPercent(analysis.warningRatio)} tone={analysis.warningRatio > 0.16 ? "warn" : ""} />
              </div>

              <div className="hotspot-list">
                <h2>응력 집중 지점</h2>
                {analysis.hotspots.map((hotspot, index) => (
                  <div className="hotspot-row" key={`${hotspot.reason}-${index}`}>
                    <span className={`hotspot-dot ${index === 0 ? "critical" : ""}`}>{index + 1}</span>
                    <div>
                      <strong>{hotspot.reason}</strong>
                      <small>{formatNumber(hotspot.stressMPa, 1)} MPa · 사용률 {formatPercent(hotspot.utilization)}</small>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="recommend-list">
            <h2>개선 방향</h2>
            {recommendations.map((item) => {
              const Icon = item.icon;
              return (
                <div className="recommend-row" key={item.text}>
                  <Icon size={16} />
                  <span>{item.text}</span>
                </div>
              );
            })}
          </div>

          <div className="note">
            {isPrintMode
              ? "출력 안정성 표시는 오버행, 브릿지, 베드 접촉, 높고 얇은 형상을 보는 슬라이서 전 예비 판정입니다. 실제 서포트는 사용하는 슬라이서에서 한 번 더 확인하세요."
              : "빠른 메시 기반 근사 해석입니다. 실제 제품 판정은 Fusion Simulation, Abaqus, Ansys 같은 FEA와 출력물 파괴 시험으로 검증하세요."}
          </div>
        </aside>
      </section>

      <ProfessionalWorkbench
        professional={professional}
        analysis={analysis}
        settings={settings}
        cloudStatus={cloudStatus}
        isSubmittingCloud={isSubmittingCloud}
        onDownloadJob={downloadSolverJob}
        onSubmitCloudJob={submitCloudJob}
      />
    </main>
  );
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function parseModelFile(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension) throw new Error("파일 확장자를 확인할 수 없습니다.");

  if (extension === "stl") {
    const buffer = await file.arrayBuffer();
    return prepareGeometry(new STLLoader().parse(buffer));
  }

  if (extension === "obj") {
    const text = await file.text();
    return geometryFromObject(new OBJLoader().parse(text));
  }

  if (extension === "3mf") {
    const buffer = await file.arrayBuffer();
    return geometryFromObject(new ThreeMFLoader().parse(buffer));
  }

  if (extension === "glb" || extension === "gltf") {
    const content = extension === "glb" ? await file.arrayBuffer() : await file.text();
    const gltf = await new Promise((resolve, reject) => {
      new GLTFLoader().parse(content, "", resolve, reject);
    });
    return geometryFromObject(gltf.scene);
  }

  if (["f3d", "step", "stp", "iges", "igs"].includes(extension)) {
    throw new Error("Fusion에서 STL, OBJ, 3MF 또는 GLB로 내보낸 뒤 불러와 주세요.");
  }

  throw new Error("지원 형식은 STL, OBJ, 3MF, GLB, GLTF입니다.");
}

function PanelHeading({ icon: Icon, title }) {
  return (
    <div className="panel-heading">
      <Icon size={18} />
      <h2>{title}</h2>
    </div>
  );
}

function ControlSlider({ label, value, min, max, step, unit, onChange, formatter, compact = false }) {
  const displayValue = formatter ? formatter(value) : `${formatNumber(value, step < 1 ? 1 : 0)} ${unit}`.trim();
  return (
    <label className={`control ${compact ? "compact" : ""}`}>
      <span className="control-top">
        <span className="control-label">{label}</span>
        <strong>{displayValue}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function SelectField({ label, value, options, onChange }) {
  return (
    <label className="select-field">
      <span className="control-label">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {Object.entries(options).map(([key, option]) => (
          <option value={key} key={key}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({ label, value, placeholder, onChange }) {
  return (
    <label className="text-field">
      <span className="control-label">{label}</span>
      <input
        type="url"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ToggleField({ label, checked, onChange }) {
  return (
    <label className="toggle-field">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>
        <strong>{label}</strong>
        <small>{checked ? "해석 입력에 접촉 조건 포함" : "단일 부품 선형 해석으로 준비"}</small>
      </span>
    </label>
  );
}

function ViewModeToggle({ value, onChange }) {
  return (
    <div className="mode-toggle" role="group" aria-label="표시 모드">
      {Object.entries(VIEW_MODES).map(([key, mode]) => {
        const Icon = mode.icon;
        return (
          <button
            type="button"
            className={value === key ? "active" : ""}
            onClick={() => onChange(key)}
            key={key}
            aria-pressed={value === key}
          >
            <Icon size={15} />
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}

function StressSummary({ analysis, mode }) {
  const isPrintMode = mode === "print";
  const print = analysis.printStability;
  const stressBars = isPrintMode
    ? [
        { label: "최대 리스크", value: print.maxRisk, icon: AlertTriangle, tone: printRiskTone },
        { label: "오버행", value: print.overhangRatio, icon: Printer, tone: printRatioTone },
        { label: "흔들림", value: print.wobbleRatio, icon: Target, tone: printRatioTone },
      ]
    : [
        { label: "최대", value: analysis.maxStressMPa / Math.max(analysis.allowableMPa, 0.001), icon: Zap, tone: utilizationTone },
        { label: "평균", value: analysis.avgStressMPa / Math.max(analysis.allowableMPa, 0.001), icon: Activity, tone: utilizationTone },
        { label: "주의 면적", value: analysis.warningRatio, icon: Target, tone: utilizationTone },
  ];

  return (
    <div className="summary-strip">
      {stressBars.map((item) => {
        const Icon = item.icon;
        return (
          <div className="summary-item" key={item.label}>
            <div>
              <Icon size={16} />
              <strong>{item.label}</strong>
            </div>
            <span className="stress-track">
              <i
                className={item.tone(item.value)}
                style={{ width: `${clamp(item.value, 0.03, 1.25) * 80}%` }}
              />
            </span>
            <em>{formatPercent(item.value)}</em>
          </div>
        );
      })}
    </div>
  );
}

function MetricRing({ value, label = "최대 사용률", tone = utilizationTone(value) }) {
  const percent = clamp(value, 0, 1.25);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * clamp(percent, 0, 1);

  return (
    <div className={`metric-ring ${tone}`}>
      <svg viewBox="0 0 132 132">
        <circle cx="66" cy="66" r={radius} fill="none" stroke="#e3eaee" strokeWidth="12" />
        <circle
          cx="66"
          cy="66"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform="rotate(-90 66 66)"
        />
      </svg>
      <div>
        <strong>{formatPercent(value)}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function PrintMetrics({ analysis, settings }) {
  const print = analysis.printStability;
  return (
    <>
      <div className="metric-grid">
        <Metric label="최대 리스크" value={formatPercent(print.maxRisk)} tone={printRiskTone(print.maxRisk)} />
        <Metric label="오버행 후보" value={formatPercent(print.overhangRatio)} tone={printRatioTone(print.overhangRatio)} />
        <Metric label="브릿지 후보" value={formatPercent(print.bridgeRatio)} tone={printRatioTone(print.bridgeRatio)} />
        <Metric label="흔들림 후보" value={formatPercent(print.wobbleRatio)} tone={printRatioTone(print.wobbleRatio)} />
        <Metric
          label="베드 접촉"
          value={formatPercent(print.bedContactRatio)}
          tone={print.bedContactRatio < 0.08 ? "warn" : ""}
        />
        <Metric
          label="형상 세장비"
          value={`${formatNumber(print.slenderness, 1)} x`}
          tone={print.slenderness > 5 ? "warn" : ""}
        />
        <Metric label="출력 방향" value={`${print.buildAxis.toUpperCase()}축`} />
        <Metric label="서포트 기준" value={`${settings.overhangAngle}도`} />
      </div>

      <div className="hotspot-list">
        <h2>출력 불안정 지점</h2>
        {print.hotspots.map((hotspot, index) => (
          <div className="hotspot-row" key={`${hotspot.reason}-${index}`}>
            <span className={`hotspot-dot ${index === 0 ? "critical" : ""}`}>{index + 1}</span>
            <div>
              <strong>{hotspot.reason}</strong>
              <small>리스크 {formatPercent(hotspot.risk)} · 적층 {print.buildAxis.toUpperCase()}축 기준</small>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Metric({ label, value, tone = "" }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProfessionalWorkbench({
  professional,
  analysis,
  settings,
  cloudStatus,
  isSubmittingCloud,
  onDownloadJob,
  onSubmitCloudJob,
}) {
  const runnerTone = runnerStatusTone(professional);
  const solverCommands = professional.solver.commands ?? professional.solver.windowsCommands ?? [];
  return (
    <section className="pro-workbench">
      <div className="pro-header">
        <PanelHeading icon={ServerCog} title="Cloud/Windows CAE 워크벤치" />
        <div className="pro-actions">
          <button type="button" className="secondary-button" onClick={onDownloadJob}>
            <FileJson size={16} />
            해석 패키지 저장
          </button>
          <button type="button" className="primary-button" onClick={onSubmitCloudJob} disabled={isSubmittingCloud}>
            <Send size={16} />
            {isSubmittingCloud ? "제출 중" : "클라우드 제출"}
          </button>
          <span className={`runner-chip ${runnerTone}`}>
            <RunnerIcon professional={professional} />
            {professional.solver.runnerStatus}
          </span>
        </div>
      </div>
      <div className={`cloud-status ${cloudStatus.tone}`}>
        <Network size={16} />
        <span>{cloudStatus.message}</span>
      </div>

      <div className="pro-grid">
        <article className="pro-card pro-card-large">
          <div className="pro-card-title">
            <Calculator size={18} />
            <h3>파괴 하중 역산</h3>
          </div>
          <div className="pro-metric-grid">
            <ProMetric label="목표 안전한계" value={`${formatNumber(professional.failure.targetSafeLoadKg, 1)} kg`} tone={utilizationTone(analysis.maxUtilization)} />
            <ProMetric label="공칭 파괴하중" value={`${formatNumber(professional.failure.nominalFailureLoadKg, 1)} kg`} />
            <ProMetric label="Proof 권장" value={`${formatNumber(professional.failure.proofLoadKg, 1)} kg`} />
            <ProMetric label="현재 대비 여유" value={`${formatNumber(professional.failure.marginKg, 1)} kg`} />
          </div>
          <p className="pro-note">{professional.failure.method}</p>
        </article>

        <article className="pro-card">
          <div className="pro-card-title">
            <DatabaseZap size={18} />
            <h3>슬라이서/인필 보정</h3>
          </div>
          <div className="slicer-stack">
            <ProMetric label="XY 등가 강도" value={`${formatNumber(professional.slicer.rasterStrengthMPa, 1)} MPa`} />
            <ProMetric label="층간 강도" value={`${formatNumber(professional.slicer.layerStrengthMPa, 1)} MPa`} />
            <ProMetric
              label="보정 사용률"
              value={formatPercent(professional.slicer.adjustedUtilization)}
              tone={utilizationTone(professional.slicer.adjustedUtilization)}
            />
          </div>
          <p className="pro-note">{professional.slicer.recommendation}</p>
        </article>

        <article className="pro-card">
          <div className="pro-card-title">
            <ShieldCheck size={18} />
            <h3>메시 품질</h3>
          </div>
          <div className="slicer-stack">
            <ProMetric label="메시 점수" value={formatPercent(analysis.meshQuality.score)} tone={meshQualityTone(analysis.meshQuality)} />
            <ProMetric label="열린 edge" value={`${formatNumber(analysis.meshQuality.openEdges, 0)} 개`} tone={analysis.meshQuality.openEdges > 0 ? "warn" : ""} />
            <ProMetric label="비정상 edge" value={`${formatNumber(analysis.meshQuality.nonManifoldEdges, 0)} 개`} tone={analysis.meshQuality.nonManifoldEdges > 0 ? "warn" : ""} />
          </div>
          <p className="pro-note">{analysis.meshQuality.warning}</p>
        </article>

        <article className="pro-card pro-card-large">
          <div className="pro-card-title">
            <Bolt size={18} />
            <h3>접촉/볼트/접착 간이 체크</h3>
          </div>
          <div className="check-grid">
            {professional.contact.checks.map((check) => (
              <CheckTile check={check} key={check.label} />
            ))}
          </div>
        </article>

        <article className="pro-card">
          <div className="pro-card-title">
            {professional.solver.executionTarget === "cloud" ? <Cloud size={18} /> : <Terminal size={18} />}
            <h3>{professional.solver.executionTarget === "cloud" ? "클라우드 제출 경로" : "실행 명령"}</h3>
          </div>
          <div className="command-stack">
            {professional.solver.cloud.endpoint ? <code>{professional.solver.cloud.endpoint}</code> : null}
            {solverCommands.map((command) => (
              <code key={command}>{command}</code>
            ))}
          </div>
          <p className="pro-note">{professional.solver.cloud.note}</p>
        </article>

        <article className="pro-card">
          <div className="pro-card-title">
            <HardDriveDownload size={18} />
            <h3>해석 파이프라인</h3>
          </div>
          <div className="pipeline-list">
            {professional.solver.steps.map((step) => (
              <PipelineStep step={step} key={step.label} />
            ))}
          </div>
        </article>

        <article className="pro-card">
          <div className="pro-card-title">
            <FileCheck2 size={18} />
            <h3>CalculiX 입력 미리보기</h3>
          </div>
          <pre className="deck-preview">{professional.solver.deckPreview.join("\n")}</pre>
        </article>

        <article className="pro-card">
          <div className="pro-card-title">
            <FlaskConical size={18} />
            <h3>인증/시험 준비도</h3>
          </div>
          <div className="cert-list">
            {professional.certification.map((item) => (
              <CertificationItem item={item} key={item.label} />
            ))}
          </div>
        </article>

        <article className="pro-card equation-card">
          <div className="pro-card-title">
            <ClipboardCheck size={18} />
            <h3>물리 모델</h3>
          </div>
          <div className="equation-list">
            {professional.equations.map((equation) => (
              <div key={equation.label}>
                <span>{equation.label}</span>
                <code>{equation.text}</code>
              </div>
            ))}
          </div>
          <p className="pro-note">
            현재 화면의 히트맵은 {formatNumber(settings.loadKg, 0)} kg 하중 조건에서 빠르게 보는 예비 판정이고, 인증용 값은 위 파이프라인의 체적 메시와 실제 출력물 시험으로 확정해야 합니다.
          </p>
        </article>

        <article className="pro-card equation-card">
          <div className="pro-card-title">
            <Info size={18} />
            <h3>아직 남는 한계</h3>
          </div>
          <div className="limit-list">
            <span>브라우저 모드는 표면 메시 근사라 인증용 응력값이 아닙니다.</span>
            <span>클라우드 모드는 서버에 Gmsh/CalculiX/Code_Aster가 설치되어야 실제 FEA가 됩니다.</span>
            <span>실제 인필 경로와 층간 결함은 G-code와 재료 쿠폰 시험값을 연결해야 확정됩니다.</span>
            <span>제품 인증은 최종적으로 출력물 proof/파괴 시험 기록이 필요합니다.</span>
          </div>
        </article>
      </div>
    </section>
  );
}

function RunnerIcon({ professional }) {
  if (professional.solver.executionTarget === "cloud") return <Cloud size={16} />;
  if (professional.solver.executionTarget === "windows") return <ServerCog size={16} />;
  return <CircleDashed size={16} />;
}

function runnerStatusTone(professional) {
  if (professional.solver.executionTarget === "cloud" && professional.solver.cloud.endpoint) return "safe";
  if (professional.solver.executionTarget === "browser") return "neutral";
  return "warn";
}

function meshQualityTone(meshQuality) {
  if (meshQuality.score >= 0.9) return "safe";
  if (meshQuality.score >= 0.72) return "warn";
  return "danger";
}

function printRatioTone(value) {
  if (value >= 0.18) return "danger";
  if (value >= 0.08) return "warn";
  return "safe";
}

function ProMetric({ label, value, tone = "" }) {
  return (
    <div className={`pro-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CheckTile({ check }) {
  const tone = utilizationTone(check.utilization);
  const unit = check.unit ?? "MPa";
  return (
    <div className={`check-tile ${tone}`}>
      <div>
        <strong>{check.label}</strong>
        <UtilizationBadge value={check.utilization} />
      </div>
      <span>
        {formatNumber(check.valueMPa, 2)} / {formatNumber(check.allowableMPa, 2)} {unit}
      </span>
      <small>{check.note}</small>
    </div>
  );
}

function UtilizationBadge({ value }) {
  return <em className={`util-badge ${utilizationTone(value)}`}>{formatPercent(value)}</em>;
}

function PipelineStep({ step }) {
  return (
    <div className={`pipeline-step ${step.state}`}>
      <StatusIcon state={step.state} />
      <div>
        <strong>{step.label}</strong>
        <span>{step.detail}</span>
      </div>
    </div>
  );
}

function CertificationItem({ item }) {
  return (
    <div className={`cert-item ${item.state}`}>
      <StatusIcon state={item.state} />
      <div>
        <strong>{item.label}</strong>
        <span>{item.detail}</span>
      </div>
    </div>
  );
}

function StatusIcon({ state }) {
  if (state === "ready") return <CircleCheck size={17} />;
  if (state === "warn") return <CircleAlert size={17} />;
  return <CircleDashed size={17} />;
}

function buildRecommendations(analysis, settings) {
  const items = [];

  if (analysis.maxUtilization >= 1) {
    items.push({ icon: AlertTriangle, text: "하중을 낮추거나 고정면 근처 단면을 키우세요." });
  } else if (analysis.maxUtilization >= 0.7) {
    items.push({ icon: Ruler, text: "빨간/노란 구간에 필렛, 리브, 두께 보강을 추가하세요." });
  } else {
    items.push({ icon: ShieldCheck, text: "현재 조건에서는 여유가 있지만 실제 출력 방향을 유지하세요." });
  }

  if (settings.infill < 50 && analysis.maxUtilization >= 0.7) {
    items.push({ icon: Layers3, text: "인필을 50% 이상으로 올리고 외벽 수를 늘려 보세요." });
  }

  if (settings.material === "pla" && analysis.maxUtilization >= 0.7) {
    items.push({ icon: Weight, text: "충격 하중이면 PETG나 Nylon으로 재료를 바꾸는 쪽이 낫습니다." });
  }

  if (settings.loadSpread < 35) {
    items.push({ icon: Crosshair, text: "와셔나 접촉 패드로 하중이 닿는 면적을 넓히세요." });
  }

  return items.slice(0, 4);
}

function buildPrintRecommendations(analysis, settings) {
  const print = analysis.printStability;
  const items = [];

  if (print.maxRisk >= 0.78) {
    items.push({ icon: AlertTriangle, text: "빨간 면은 서포트를 켜거나 모델 출력 방향을 바꾸세요." });
  } else if (print.maxRisk >= 0.46) {
    items.push({ icon: Printer, text: "노란 면은 슬라이서에서 서포트 생성 후보로 확인하세요." });
  } else {
    items.push({ icon: ShieldCheck, text: "현재 적층 방향에서는 큰 출력 불안정 구간이 적습니다." });
  }

  if (print.overhangRatio >= 0.08) {
    items.push({ icon: Layers3, text: `${settings.overhangAngle}도 기준 오버행이 많습니다. 챔퍼나 지지 리브를 추가하세요.` });
  }

  if (print.bridgeRatio >= 0.05) {
    items.push({ icon: Ruler, text: "긴 브릿지는 분할 출력하거나 임시 서포트 기둥을 넣는 편이 안전합니다." });
  }

  if (print.wobbleRatio >= 0.06 || print.slenderness > 5) {
    items.push({ icon: Target, text: "높고 얇은 부분은 brim/raft, 출력 속도 감소, 벽 두께 증가가 필요합니다." });
  }

  if (print.bedContactRatio < 0.08) {
    items.push({ icon: Crosshair, text: "베드 접촉이 작습니다. 바닥 면을 넓히거나 brim/raft를 적용하세요." });
  }

  return items.slice(0, 4);
}

function summarizePrintStability(print) {
  return {
    maxRisk: print.maxRisk,
    avgRisk: print.avgRisk,
    overhangRatio: print.overhangRatio,
    bridgeRatio: print.bridgeRatio,
    wobbleRatio: print.wobbleRatio,
    curlRatio: print.curlRatio,
    bedContactRatio: print.bedContactRatio,
    bedContactAreaMeters2: print.bedContactAreaMeters2,
    footprintMeters2: print.footprintMeters2,
    slenderness: print.slenderness,
    buildAxis: print.buildAxis,
    overhangAngle: print.overhangAngle,
    label: print.label,
    hotspots: print.hotspots.map((hotspot) => ({
      risk: hotspot.risk,
      reason: hotspot.reason,
      position: hotspot.position.toArray(),
    })),
  };
}

export default App;
