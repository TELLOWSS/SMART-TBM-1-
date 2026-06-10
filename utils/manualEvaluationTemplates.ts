import type { TBMAnalysisResult } from '../types';

export type ManualEvaluationLevel = 'GOOD' | 'MODERATE' | 'POOR' | 'UNVERIFIED';

export const MANUAL_EVALUATION_LEVELS: Array<{
  value: ManualEvaluationLevel;
  label: string;
  description: string;
}> = [
  { value: 'GOOD', label: '양호', description: '전달·참여·집중 상태가 전반적으로 양호한 경우' },
  { value: 'MODERATE', label: '보통', description: '기본 진행은 되었으나 질의응답이나 구체성이 부족한 경우' },
  { value: 'POOR', label: '미흡', description: '일방 전달, 집중 저하, 보호구 확인 부족 등 보완이 필요한 경우' },
  { value: 'UNVERIFIED', label: '확인 불가', description: '영상·음성 품질 또는 자료 부족으로 판단할 수 없는 경우' },
];

const TEMPLATES: Record<ManualEvaluationLevel, Omit<TBMAnalysisResult, 'analysisSource' | 'verificationStatus'>> = {
  GOOD: {
    score: 88,
    evaluation: '종합판정: TBM 전달과 참여 상태가 전반적으로 양호합니다. 확인검증: 핵심 위험요인 공유와 작업자 반응이 확인되었습니다. 다음 계획: 현재 수준을 유지하며 작업 전 상호 확인을 반복합니다.',
    evalLog: '작업 내용과 핵심 위험요인이 일지에 구체적으로 정리되었습니다.',
    evalAttendance: '참석자가 진행 내용을 경청하고 질문 또는 응답에 참여했습니다.',
    evalFocus: '작업자 시선과 자세가 진행자에게 향해 전반적인 집중도가 양호했습니다.',
    evalLeader: '팀장이 작업 순서와 위험요인을 연결해 명확하게 전달했습니다.',
    rubric: { logQuality: 23, focus: 24, voice: 20, ppe: 21, deductions: ['수기 보기글 적용'] },
    leaderCoaching: {
      actionItem: '현재 진행 방식을 유지하고 마지막에 작업자 확인 질문을 반복하세요.',
      rationale: '양호한 TBM도 작업자의 직접 응답으로 이해도를 재확인하면 효과가 높아집니다.',
    },
    details: { participation: 'GOOD', voiceClarity: 'CLEAR', ppeStatus: 'GOOD', interaction: true },
    focusAnalysis: { overall: 88, distractedCount: 0, focusZones: { front: 'HIGH', back: 'HIGH', side: 'HIGH' } },
    insight: { mentionedTopics: [], missingTopics: [], suggestion: '작업 시작 전 핵심 위험요인을 한 번 더 상호 확인하세요.' },
    feedback: [
      '핵심 위험요인을 작업 순서에 따라 다시 확인하세요.',
      'TBM 종료 전 작업자에게 확인 질문을 실시하세요.',
      '보호구 착용 상태를 작업자 상호 간 점검하세요.',
    ],
  },
  MODERATE: {
    score: 70,
    evaluation: '종합판정: 기본적인 TBM은 진행되었으나 전달의 구체성과 참여 확인이 부족합니다. 확인검증: 주요 항목은 공유되었지만 작업자 응답 근거가 제한적입니다. 다음 계획: 질문과 복창 절차를 추가합니다.',
    evalLog: '기본 작업 내용은 기재되었으나 위험요인과 예방대책의 연결을 보완해야 합니다.',
    evalAttendance: '참석은 확인되나 작업자 질의응답과 이해도 확인이 부족합니다.',
    evalFocus: '대부분 참여했으나 일부 시선 분산 또는 소극적인 반응이 관찰됩니다.',
    evalLeader: '주요 사항은 전달했으나 작업 순서별 위험 설명과 확인 질문이 부족합니다.',
    rubric: { logQuality: 19, focus: 18, voice: 17, ppe: 16, deductions: ['수기 보기글 적용', '질의응답 보완 필요'] },
    leaderCoaching: {
      actionItem: '핵심 위험요인마다 작업자 한 명 이상에게 확인 질문을 하세요.',
      rationale: '일방 전달만으로는 실제 이해 여부를 확인하기 어렵습니다.',
    },
    details: { participation: 'MODERATE', voiceClarity: 'CLEAR', ppeStatus: 'GOOD', interaction: false },
    focusAnalysis: { overall: 70, distractedCount: 1, focusZones: { front: 'HIGH', back: 'LOW', side: 'HIGH' } },
    insight: { mentionedTopics: [], missingTopics: [], suggestion: '질문, 복창, 손들기 방식으로 참여 여부를 확인하세요.' },
    feedback: [
      '일방적인 전달보다 질문과 복창 방식으로 이해도를 확인하세요.',
      '위험요인과 예방대책을 작업 순서에 맞춰 설명하세요.',
      '집중이 흐트러진 작업자를 진행자 가까이 배치하세요.',
    ],
  },
  POOR: {
    score: 45,
    evaluation: '종합판정: TBM 전달과 작업자 참여가 미흡하여 보완이 필요합니다. 확인검증: 핵심 위험요인 전달과 이해도 확인 근거가 부족합니다. 다음 계획: 작업 전 재교육과 보호구·작업순서 재점검을 실시합니다.',
    evalLog: '작업 내용 또는 예방대책이 불명확해 현장 상황에 맞는 구체적인 보완이 필요합니다.',
    evalAttendance: '참석자의 반응과 이해도 확인이 부족해 재교육이 필요합니다.',
    evalFocus: '시선 분산과 소극적인 자세가 보여 집중 유도 조치가 필요합니다.',
    evalLeader: '일방적인 전달 위주로 진행되어 질문과 확인 절차를 추가해야 합니다.',
    rubric: { logQuality: 12, focus: 11, voice: 12, ppe: 10, deductions: ['수기 보기글 적용', '재교육 필요'] },
    leaderCoaching: {
      actionItem: '작업을 시작하기 전에 핵심 위험요인을 다시 설명하고 전원에게 확인 질문을 하세요.',
      rationale: '현재 상태로는 작업자의 위험 인지와 예방대책 이해를 확인하기 어렵습니다.',
    },
    details: { participation: 'BAD', voiceClarity: 'MUFFLED', ppeStatus: 'BAD', interaction: false },
    focusAnalysis: { overall: 45, distractedCount: 2, focusZones: { front: 'LOW', back: 'LOW', side: 'LOW' } },
    insight: { mentionedTopics: [], missingTopics: [], suggestion: '작업 전 재교육 후 관리자 확인을 받고 작업을 시작하세요.' },
    feedback: [
      '작업 시작 전 핵심 위험요인과 예방대책을 다시 교육하세요.',
      '보호구 착용 상태를 전원 재점검하세요.',
      '교육 후 작업자별 확인 질문을 실시하고 이해 여부를 기록하세요.',
    ],
  },
  UNVERIFIED: {
    score: 0,
    evaluation: '종합판정: 제공된 영상 또는 자료만으로 TBM 상태를 판단하기 어렵습니다. 확인검증: 화면·음성 근거가 충분하지 않습니다. 다음 계획: 수기 확인 또는 선명한 영상으로 현장 상태를 다시 기록합니다.',
    evalLog: '자료 품질 또는 기록 부족으로 일지 활용 상태를 확인하기 어렵습니다.',
    evalAttendance: '참석자 반응과 참여 여부를 확인할 수 없습니다.',
    evalFocus: '영상 품질 또는 촬영 구도로 작업자 집중도를 판단할 수 없습니다.',
    evalLeader: '음성 또는 화면 근거 부족으로 팀장 리딩 상태를 확인할 수 없습니다.',
    rubric: { logQuality: 0, focus: 0, voice: 0, ppe: 0, deductions: ['수기 보기글 적용', '근거 부족으로 미채점'] },
    leaderCoaching: {
      actionItem: '현장 확인 결과를 직접 입력하거나 화면과 음성이 포함된 영상을 다시 촬영하세요.',
      rationale: '확인되지 않은 내용을 임의로 평가하면 기록의 신뢰성이 낮아집니다.',
    },
    details: { participation: 'MODERATE', voiceClarity: 'NONE', ppeStatus: 'BAD', interaction: false },
    focusAnalysis: { overall: 0, distractedCount: 0, focusZones: { front: 'LOW', back: 'LOW', side: 'LOW' } },
    insight: { mentionedTopics: [], missingTopics: [], suggestion: '확인 가능한 자료를 확보한 뒤 평가를 보완하세요.' },
    feedback: [
      '영상 또는 현장 확인 자료를 보완하세요.',
      '확인되지 않은 항목은 임의로 평가하지 말고 확인 불가로 기록하세요.',
    ],
  },
};

export const buildManualEvaluation = (
  level: ManualEvaluationLevel,
  workType: string,
): TBMAnalysisResult => {
  const base = TEMPLATES[level];
  const prefix = workType ? `[${workType}] ` : '';

  return {
    ...base,
    analysisSource: 'MANUAL',
    verificationStatus: 'MANUAL',
    evaluation: `${prefix}${base.evaluation}`,
    rubric: { ...base.rubric, deductions: [...base.rubric.deductions] },
    leaderCoaching: { ...base.leaderCoaching },
    details: { ...base.details },
    focusAnalysis: {
      ...base.focusAnalysis,
      focusZones: { ...base.focusAnalysis.focusZones },
    },
    insight: {
      ...base.insight,
      mentionedTopics: [...base.insight.mentionedTopics],
      missingTopics: [...base.insight.missingTopics],
    },
    feedback: base.feedback.map(item => `${prefix}${item}`),
  };
};
