import { clamp } from "./modelAnalysis.js";

export const DEFAULT_PRO_SETTINGS = {
  executionTarget: "cloud",
  cloudApiUrl: "",
  solver: "calculix",
  meshSizeMm: 3,
  nonlinearContact: true,
  boltCount: 4,
  boltDiameterMm: 5,
  boltShearPlanes: 1,
  boltProofMPa: 240,
  boltPreloadKN: 2,
  adhesiveAreaMm2: 420,
  adhesiveShearMPa: 12,
  contactFriction: 0.28,
  couponStrengthMPa: 46,
  layerAdhesionMPa: 18,
  reportStandard: "prototype",
};

export const EXECUTION_TARGETS = {
  browser: { label: "브라우저 프리체크" },
  cloud: { label: "클라우드 해석 API" },
  windows: { label: "Windows 로컬 러너" },
};

export const SOLVER_OPTIONS = {
  calculix: { label: "CalculiX CCX", result: ".frd / .dat" },
  codeAster: { label: "Code_Aster", result: ".rmed / .mess" },
};

export const REPORT_STANDARDS = {
  prototype: { label: "시제품 검증" },
  internal: { label: "사내 설계 검토" },
  certificationPrep: { label: "인증 준비 패키지" },
};

export function buildProfessionalAnalysis(analysis, settings, proSettings, model) {
  const utilization = Math.max(analysis.maxUtilization, 0.0001);
  const targetSafeLoadKg = settings.loadKg / utilization;
  const nominalFailureLoadKg = settings.loadKg * Math.max(settings.targetSafety, 1) / utilization;
  const proofLoadKg = targetSafeLoadKg * 0.9;
  const contact = buildContactChecks(analysis, settings, proSettings);
  const slicer = buildSlicerChecks(analysis, settings, proSettings);
  const solver = buildSolverPlan(analysis, settings, proSettings, model);
  const certification = buildCertificationChecklist(analysis, proSettings, solver, slicer);

  return {
    failure: {
      targetSafeLoadKg,
      nominalFailureLoadKg,
      proofLoadKg,
      currentLoadKg: settings.loadKg,
      marginKg: targetSafeLoadKg - settings.loadKg,
      governingUtilization: utilization,
      method:
        "현재 메시 근사 응력이 하중에 선형 비례한다고 보고, 목표 안전한계와 재료 공칭 파괴한계를 역산합니다.",
    },
    contact,
    slicer,
    solver,
    certification,
    equations: [
      { label: "선형 정적 FEA", text: "K u = F" },
      { label: "von Mises", text: "sigma_vm = sqrt(((s1-s2)^2 + (s2-s3)^2 + (s3-s1)^2) / 2)" },
      { label: "안전계수", text: "SF = sigma_allow / sigma_vm" },
      { label: "파괴하중 근사", text: "P_fail ~= P_now * sigma_ult / sigma_max" },
    ],
  };
}

export function createSolverJobPayload(model, analysis, settings, proSettings, professional) {
  const loadPoint = analysis.loadPoint.toArray().map((value) => Number(value.toFixed(6)));
  const loadDirection = analysis.loadDirection.toArray().map((value) => Number(value.toFixed(6)));

  return {
    schema: "stressscope.solver-job.v1",
    createdAt: new Date().toISOString(),
    model: {
      name: model.name,
      source: model.source,
      triangleCount: analysis.triangleCount,
      vertexCount: analysis.vertexCount,
      size: vectorToPlain(analysis.size),
      units: settings.units,
      meshQuality: analysis.meshQuality,
    },
    loadCase: {
      loadKg: settings.loadKg,
      forceN: analysis.forceN,
      supportFace: settings.supportFace,
      loadDirection: settings.loadDirection,
      loadPoint,
      loadVector: loadDirection,
      targetSafety: settings.targetSafety,
    },
    printProfile: {
      material: analysis.material.label,
      infill: settings.infill,
      shells: settings.shells,
      layerAxis: settings.layerAxis,
      couponStrengthMPa: proSettings.couponStrengthMPa,
      layerAdhesionMPa: proSettings.layerAdhesionMPa,
    },
    solver: {
      target: proSettings.executionTarget,
      engine: proSettings.solver,
      meshSizeMm: proSettings.meshSizeMm,
      nonlinearContact: proSettings.nonlinearContact,
      estimatedElements: professional.solver.estimatedElements,
      commands: professional.solver.commands ?? professional.solver.windowsCommands ?? [],
      deckPreview: professional.solver.deckPreview,
    },
    acceptance: {
      maxUtilization: analysis.maxUtilization,
      preliminarySafetyFactor: analysis.safetyFactor,
      estimatedTargetSafeLoadKg: professional.failure.targetSafeLoadKg,
      requiresPhysicalTest: true,
    },
  };
}

function buildContactChecks(analysis, settings, proSettings) {
  const forceN = Math.max(analysis.forceN, 0);
  const targetSafety = Math.max(settings.targetSafety, 1);
  const sizeMm = analysis.sizeMeters.clone().multiplyScalar(1000);
  const smallestMm = Math.max(Math.min(sizeMm.x, sizeMm.y, sizeMm.z), 0.5);
  const memberThicknessMm = clamp(smallestMm * 0.18 + settings.shells * 0.45, 1.2, 18);
  const boltCount = Math.max(proSettings.boltCount, 1);
  const boltDiameterMm = Math.max(proSettings.boltDiameterMm, 1);
  const boltAreaMm2 =
    boltCount * Math.max(proSettings.boltShearPlanes, 1) * Math.PI * (boltDiameterMm / 2) ** 2;
  const boltShearMPa = forceN / Math.max(boltAreaMm2, 1);
  const boltAllowableMPa = (proSettings.boltProofMPa * 0.55) / targetSafety;
  const bearingAreaMm2 = boltCount * boltDiameterMm * memberThicknessMm;
  const bearingMPa = forceN / Math.max(bearingAreaMm2, 1);
  const bearingAllowableMPa = analysis.material.strengthMPa / targetSafety;
  const adhesiveMPa = forceN / Math.max(proSettings.adhesiveAreaMm2, 1);
  const adhesiveAllowableMPa = proSettings.adhesiveShearMPa / targetSafety;
  const frictionCapacityN =
    boltCount * Math.max(proSettings.boltPreloadKN, 0) * 1000 * clamp(proSettings.contactFriction, 0.02, 1.2);
  const frictionUtilization = forceN / Math.max(frictionCapacityN, 1);
  const contactDiameterMm = Math.max(smallestMm * (0.2 + settings.loadSpread / 100), 1.5);
  const contactAreaMm2 = Math.PI * (contactDiameterMm / 2) ** 2;
  const contactPressureMPa = forceN / contactAreaMm2;
  const contactAllowableMPa = (analysis.material.strengthMPa * 0.75) / targetSafety;

  return {
    memberThicknessMm,
    checks: [
      {
        label: "볼트 전단",
        valueMPa: boltShearMPa,
        allowableMPa: boltAllowableMPa,
        utilization: boltShearMPa / Math.max(boltAllowableMPa, 0.001),
        note: `${boltCount}개 × M${boltDiameterMm} 가정`,
      },
      {
        label: "구멍 지압",
        valueMPa: bearingMPa,
        allowableMPa: bearingAllowableMPa,
        utilization: bearingMPa / Math.max(bearingAllowableMPa, 0.001),
        note: `유효 두께 ${memberThicknessMm.toFixed(1)} mm`,
      },
      {
        label: "접착 전단",
        valueMPa: adhesiveMPa,
        allowableMPa: adhesiveAllowableMPa,
        utilization: adhesiveMPa / Math.max(adhesiveAllowableMPa, 0.001),
        note: `${Math.round(proSettings.adhesiveAreaMm2)} mm2 접착면`,
      },
      {
        label: "마찰 미끄럼",
        valueMPa: forceN / 1000,
        allowableMPa: frictionCapacityN / 1000,
        utilization: frictionUtilization,
        note: `예압 ${proSettings.boltPreloadKN} kN/개, mu ${proSettings.contactFriction}`,
        unit: "kN",
      },
      {
        label: "접촉 압력",
        valueMPa: contactPressureMPa,
        allowableMPa: contactAllowableMPa,
        utilization: contactPressureMPa / Math.max(contactAllowableMPa, 0.001),
        note: `등가 접촉 지름 ${contactDiameterMm.toFixed(1)} mm`,
      },
    ],
  };
}

function buildSlicerChecks(analysis, settings, proSettings) {
  const infillFactor = clamp(0.22 + settings.infill / 100 * 0.78, 0.2, 1);
  const shellFactor = clamp(0.58 + settings.shells * 0.12, 0.58, 1.18);
  const loadAxis = settings.loadDirection.replace("neg", "").replace("pos", "").toLowerCase();
  const layerNormalLoad = loadAxis === settings.layerAxis;
  const rasterStrengthMPa = proSettings.couponStrengthMPa * infillFactor * shellFactor;
  const layerStrengthMPa = proSettings.layerAdhesionMPa * clamp(0.82 + settings.shells * 0.06, 0.82, 1.18);
  const governingStrengthMPa = layerNormalLoad
    ? Math.min(rasterStrengthMPa, layerStrengthMPa)
    : Math.min(rasterStrengthMPa, layerStrengthMPa * 1.25);
  const adjustedAllowableMPa = governingStrengthMPa / Math.max(settings.targetSafety, 1);
  const adjustedUtilization = analysis.maxStressMPa / Math.max(adjustedAllowableMPa, 0.001);

  return {
    rasterStrengthMPa,
    layerStrengthMPa,
    governingStrengthMPa,
    adjustedAllowableMPa,
    adjustedUtilization,
    layerNormalLoad,
    profileStatus: "브라우저 미연결",
    recommendation:
      adjustedUtilization >= 1
        ? "이 조건은 적층면 강도가 지배할 수 있습니다. 출력 방향을 돌리거나 외벽/인필을 올려야 합니다."
        : "현재 설정에서는 슬라이서 보정 후에도 여유가 있습니다. 실제 G-code 인필 방향까지 연결하면 정확도가 올라갑니다.",
  };
}

function buildSolverPlan(analysis, settings, proSettings, model) {
  const sizeMm = analysis.sizeMeters.clone().multiplyScalar(1000);
  const longestMm = Math.max(sizeMm.x, sizeMm.y, sizeMm.z, 1);
  const meshDensity = clamp(longestMm / Math.max(proSettings.meshSizeMm, 0.5), 8, 120);
  const estimatedElements = Math.round(analysis.triangleCount * clamp(meshDensity / 8, 2, 70));
  const solverLabel = SOLVER_OPTIONS[proSettings.solver]?.label ?? "CalculiX CCX";
  const modelBase = sanitizeName(model?.name ?? "model");
  const loadSign = settings.loadDirection.startsWith("neg") ? "-" : "";
  const loadAxis = settings.loadDirection.replace("neg", "").replace("pos", "").toUpperCase();
  const runner = runnerDescriptor(proSettings);
  const meshReady = analysis.triangleCount > 0 && analysis.meshQuality.score >= 0.72;

  return {
    connected: false,
    executionTarget: proSettings.executionTarget,
    runnerLabel: runner.label,
    runnerStatus: runner.status,
    cloudApiUrl: proSettings.cloudApiUrl,
    solverLabel,
    modelBase,
    estimatedElements,
    meshSizeMm: proSettings.meshSizeMm,
    resultType: SOLVER_OPTIONS[proSettings.solver]?.result ?? ".frd / .dat",
    commands: [
      `gmsh "${modelBase}.step" -3 -clscale ${proSettings.meshSizeMm.toFixed(2)} -format inp -o "${modelBase}.inp"`,
      proSettings.solver === "codeAster"
        ? `run_aster "${modelBase}.export"`
        : `ccx "${modelBase}"`,
      `prusa-slicer-console.exe --export-gcode "${modelBase}.3mf" --load "printer-profile.ini"`,
    ],
    cloud: {
      endpoint: proSettings.cloudApiUrl ? `${proSettings.cloudApiUrl.replace(/\/+$/, "")}/api/solve` : "",
      jobType: "static-structural-fea",
      transferable: meshReady,
      note: proSettings.cloudApiUrl
        ? "브라우저에서 이 API로 해석 job을 보낼 수 있습니다."
        : "Cloud API URL을 넣으면 로컬 실행기 없이 서버에서 해석 job을 받을 수 있습니다.",
    },
    deckPreview: [
      "*STATIC",
      `*MATERIAL, NAME=${analysis.material.label.replace(/\s+/g, "_")}`,
      "*ELASTIC",
      `${Math.round(analysis.material.modulusGPa * 1000)}, 0.36`,
      "*BOUNDARY",
      "support_nodes, 1, 3, 0",
      "*CLOAD",
      `load_nodes, ${axisToDof(loadAxis)}, ${loadSign}${analysis.forceN.toFixed(1)}`,
      "*NODE FILE",
      "U",
      "*EL FILE",
      "S",
    ],
    steps: [
      {
        label: "CAD/메시 준비",
        state: meshReady ? "ready" : "warn",
        detail: `${analysis.triangleCount.toLocaleString("ko-KR")} triangles · ${analysis.meshQuality.label}`,
      },
      {
        label: "체적 메시",
        state: "pending",
        detail: `Gmsh 사면체 약 ${estimatedElements.toLocaleString("ko-KR")} elements 예상`,
      },
      {
        label: "정적 구조해석",
        state: "pending",
        detail: `${solverLabel} · ${runner.status}`,
      },
      {
        label: "결과 검증/리포트",
        state: "pending",
        detail: `${SOLVER_OPTIONS[proSettings.solver]?.result ?? ".frd"} 결과 파싱 후 확정`,
      },
    ],
  };
}

function buildCertificationChecklist(analysis, proSettings, solver, slicer) {
  return [
    {
      label: "형상 파일 추적성",
      state: analysis.triangleCount > 0 ? "ready" : "blocked",
      detail: "불러온 모델명, 단위, 삼각형 수를 리포트에 기록합니다.",
    },
    {
      label: "메시 수리 상태",
      state: analysis.meshQuality.score >= 0.9 ? "ready" : "warn",
      detail: `${analysis.meshQuality.label}: 열린 edge ${analysis.meshQuality.openEdges.toLocaleString("ko-KR")}개, 비정상 edge ${analysis.meshQuality.nonManifoldEdges.toLocaleString("ko-KR")}개`,
    },
    {
      label: "재료 쿠폰 시험",
      state: proSettings.couponStrengthMPa > 0 && proSettings.layerAdhesionMPa > 0 ? "warn" : "blocked",
      detail: "PLA/PETG 기본값이 아니라 같은 프린터/필라멘트/방향의 시험값이 필요합니다.",
    },
    {
      label: "검증된 FEA 결과",
      state: solver.connected ? "ready" : "blocked",
      detail: "현재 브라우저만으로는 인증용 해석 결과가 아닙니다.",
    },
    {
      label: "슬라이서 인필 반영",
      state: slicer.profileStatus === "연결됨" ? "ready" : "warn",
      detail: "PrusaSlicer/Cura 프로파일과 G-code 경로를 연결하면 보강 방향을 더 정확히 반영합니다.",
    },
    {
      label: "파괴/Proof 시험",
      state: "blocked",
      detail: "인증 판정에는 실제 출력물 시험, 사진, 시험기 캘리브레이션 기록이 필요합니다.",
    },
  ];
}

function axisToDof(axis) {
  if (axis === "X") return 1;
  if (axis === "Y") return 2;
  return 3;
}

function runnerDescriptor(proSettings) {
  if (proSettings.executionTarget === "cloud") {
    return {
      label: "Cloud solver API",
      status: proSettings.cloudApiUrl ? "클라우드 제출 준비" : "Cloud API URL 필요",
    };
  }

  if (proSettings.executionTarget === "windows") {
    return {
      label: "Windows local runner",
      status: "로컬 실행기 설치/연결 필요",
    };
  }

  return {
    label: "Browser preliminary mode",
    status: "브라우저 예비해석만 실행",
  };
}

function vectorToPlain(vector) {
  return {
    x: Number(vector.x.toFixed(6)),
    y: Number(vector.y.toFixed(6)),
    z: Number(vector.z.toFixed(6)),
  };
}

function sanitizeName(name) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "model";
}
