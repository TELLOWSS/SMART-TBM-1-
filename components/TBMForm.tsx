
import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TBMEntry, RiskAssessmentItem, SafetyGuideline, TeamOption, TBMAnalysisResult, ScoreRubric, MonthlyRiskAssessment } from '../types';
import { analyzeMasterLog, evaluateTBMVideo, generateSafetyFeedback } from '../services/geminiService';
import { SESSION_API_KEY_STORAGE_KEY } from '../utils/siteConfigStorage';
import { compressVideo, type VideoCompressionResult } from '../utils/videoUtils';
import { buildManualEvaluation, MANUAL_EVALUATION_LEVELS, type ManualEvaluationLevel } from '../utils/manualEvaluationTemplates';
import { buildEntryTeamPayload, getEntryTeamIds, getEntryTeamNames, getWorkDescriptionDisplay } from '../utils/teamUtils';
import { Upload, Camera, FileText, X, Layers, ArrowLeft, Trash2, Film, Save, Plus, UserCheck, BrainCircuit, CheckCircle2, AlertCircle, Loader2, PlayCircle, Zap, Image as ImageIcon, Copy, Sparkles, Maximize, ScanText, ChevronRight, ChevronDown, ChevronUp, SplitSquareHorizontal, Paperclip, Users, Eye, Mic, Edit3, Sliders, Shield, Award, ClipboardCheck } from 'lucide-react';

interface TBMFormProps {
    onSave: (data: TBMEntry | TBMEntry[], shouldExit?: boolean) => Promise<boolean>;
  onCancel: () => void;
  monthlyGuidelines: SafetyGuideline[];
    riskAssessments?: MonthlyRiskAssessment[];
    linkedRiskAssessment?: {
        id?: string;
        fileName: string;
        label: string;
        total: number;
        high: number;
        actionNotes: number;
    };
  initialData?: TBMEntry;
  onDelete?: (id: string) => void;
  teams: TeamOption[];
  mode?: 'BATCH' | 'ROUTINE';
}

interface QueueItem extends Partial<TBMEntry> {
  tempId: string;
  file?: File; 
  originalLogFile?: File;
  originalLogPreview?: string;
  tbmPhotoFile?: File;
  tbmPhotoPreview?: string; 
  tbmVideoFile?: File;
  tbmVideoPreview?: string;
  status: 'WAITING' | 'ANALYZING' | 'READY' | 'SAVED' | 'ERROR';
  analysisResult?: string;
}

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (e) => reject(e);
  });
};

// [RELIABILITY FIX] iOS HEIC/HEIF 및 비표준 이미지를 Gemini 지원 포맷(JPEG)으로 정규화
const normalizeImageToJpeg = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                // 최대 해상도 제한 (4096px) — Gemini 안정 처리 범위
                const MAX = 4096;
                let w = img.naturalWidth;
                let h = img.naturalHeight;
                if (w > MAX || h > MAX) {
                    const ratio = Math.min(MAX / w, MAX / h);
                    w = Math.round(w * ratio);
                    h = Math.round(h * ratio);
                }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('Canvas context unavailable');
                ctx.drawImage(img, 0, 0, w, h);
                URL.revokeObjectURL(objectUrl);
                resolve(canvas.toDataURL('image/jpeg', 0.92));
            } catch (err) {
                URL.revokeObjectURL(objectUrl);
                reject(err);
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('이미지를 불러올 수 없습니다. 파일이 손상되었거나 지원하지 않는 형식일 수 있습니다.'));
        };
        img.src = objectUrl;
    });
};

// ============================================================
// 공종별 수기 입력 예시 코멘트 사전
// ============================================================
interface WorkTypeExample {
    type: string;
    work: string;
    locationBuildingScope: string;
    locationArea: string;
    locationDetail: string;
    todayInstalledItems: string;
    managerRequiredInstallItems: string;
    risks: { risk: string; measure: string }[];
    feedback: string[];
    videoEvals: { evalLog: string; evalAttendance: string; evalFocus: string; evalLeader: string; evaluation: string };
}

export const WORK_TYPE_EXAMPLES: WorkTypeExample[] = [
    {
        type: '토공/굴착',
        work: '굴착기를 이용한 터파기 작업 및 토사 반출',
        locationBuildingScope: '전체동',
        locationArea: '외곽구간',
        locationDetail: '단지 외곽 터파기 구간 및 흙막이 주변',
        todayInstalledItems: '굴착구간 흙막이 지보공 설치, 출입통제 라바콘 및 접근금지선 설치, 장비 작업반경 경고 표지 설치',
        managerRequiredInstallItems: '굴착 심화 구간 추가 흙막이 보강재 설치, 우천 대비 배수펌프 및 미끄럼 방지 발판 추가 설치',
        risks: [
            { risk: '굴착 중 지반 붕괴 및 비탈면 파괴', measure: '비탈면 기울기 기준 준수, 흙막이 지보공 설치 및 일일 점검' },
            { risk: '굴착장비 선회 반경 내 작업자 접근', measure: '유도원 배치, 접근금지선 설치, 굴착장비 경광등 작동 확인' },
            { risk: '굴착 지반 지하매설물 파손', measure: '작업 전 지하매설물 도면 확인, 매설물 주변 수작업 전환' },
        ],
        feedback: [
            '굴착 작업 전 주변 지하매설물(가스·수도·전기) 위치 확인 필수',
            '우천 후 굴착면 상태 점검 및 붕괴 위험 구간 추가 지보공 설치',
            '장비 반경 5m 이내 작업자 접근 금지 철저 준수',
        ],
        videoEvals: {
            evalLog: '작업 일지에 굴착 구역 및 장비 배치가 명확히 기재됨. 지하매설물 확인 서명란 포함 여부 보완 필요.',
            evalAttendance: '작업 참석 인원 점호 진행 확인. 유도원 포함 전원 참석.',
            evalFocus: '중장비 작업 특성상 집중도 유지가 중요하며 전반적으로 집중된 자세 확인.',
            evalLeader: '팀장이 굴착 위험 구간을 직접 지적하며 안전 사항을 명확히 전달함.',
            evaluation: '토공/굴착 공종 TBM 전반적으로 양호. 지하매설물 확인 절차 반복 교육 권고.',
        }
    },
    {
        type: '콘크리트 타설',
        work: '기초·슬라브 콘크리트 타설 및 양생 작업',
        locationBuildingScope: '101동',
        locationArea: '지상층',
        locationDetail: '1층 슬라브 타설 구간',
        todayInstalledItems: '타설 구간 거푸집 및 동바리 설치 완료, 레미콘 차량 유도라인 설치, 양생포 배치',
        managerRequiredInstallItems: '타설 확대 구간 추가 동바리 보강, 야간 조명탑 및 이동식 안전휀스 추가 설치',
        risks: [
            { risk: '콘크리트 타설 중 거푸집 붕괴', measure: '타설 전 거푸집 동바리 체결 상태 확인, 콘크리트 타설 속도 준수' },
            { risk: '레미콘 차량 후진 시 작업자 충돌', measure: '차량 유도원 배치, 차량 이동 경로 작업자 통제' },
            { risk: '콘크리트 직접 접촉으로 인한 피부염', measure: '고무장갑·방호복 착용, 눈·피부 접촉 시 즉시 물로 세척' },
        ],
        feedback: [
            '타설 전 철근 피복 두께 및 동바리 간격 최종 점검 실시',
            '야간 타설 작업 시 조명 확보 및 감독자 상주',
            '하절기 콘크리트 양생 중 급격한 건조 방지를 위한 양생포 덮기 철저',
        ],
        videoEvals: {
            evalLog: '타설 수량 및 타설 구역 일지 기재 확인. 품질시험 결과 첨부 여부 확인 권고.',
            evalAttendance: '콘크리트 타설 팀 전원 참석. 레미콘 기사 포함 교육 실시 여부 확인.',
            evalFocus: '타설 특성상 연속 작업으로 집중도 유지 중요. 전반적 집중 양호.',
            evalLeader: '팀장이 타설 순서와 동바리 안전 확인 절차를 직접 시연함.',
            evaluation: '콘크리트 타설 공종 TBM 양호. 레미콘 차량 후진 시 유도원 모든 대기 상태 재확인 권고.',
        }
    },
    {
        type: '철근/거푸집',
        work: '기둥·보 철근 배근 및 거푸집 조립·해체 작업',
        locationBuildingScope: '102동',
        locationArea: '지상층',
        locationDetail: '3층 보·슬래브 배근 구간',
        todayInstalledItems: '철근 선단부 보호캡 설치, 고소작업 구간 안전난간 설치, 거푸집 지지대 설치 완료',
        managerRequiredInstallItems: '해체 예정 구간 낙하물 방지망 추가 설치, 고소작업 발판 보강재 추가 설치',
        risks: [
            { risk: '철근 운반 및 배근 중 찔림·베임', measure: '장갑 착용 의무화, 절단면 캡 설치, 2인 1조 운반' },
            { risk: '거푸집 해체 시 낙하 및 전도', measure: '해체 순서 준수, 하부 출입금지 구역 설정, 안전띠 착용' },
            { risk: '고소 작업 중 추락', measure: '안전띠 체결 확인, 비계 발판 고정 상태 점검' },
        ],
        feedback: [
            '철근 선단부 캡 설치 여부 작업 시작 전 확인 필수',
            '거푸집 해체 전 동바리 최종 지지 상태 확인 후 단계별 해체',
            '고소 작업 구간 안전 난간 설치 적정 여부 점검',
        ],
        videoEvals: {
            evalLog: '배근 도면 배포 여부 및 거푸집 조립도 현장 비치 확인 권고.',
            evalAttendance: '팀 전원 참석 확인. 신규 투입 인원 안전 교육 실시 여부 재확인.',
            evalFocus: '철근 배근 시 집중도 중요. 작업자 대부분 집중된 자세 유지.',
            evalLeader: '팀장이 추락 위험 구간을 직접 지목하며 안전띠 체결 상태를 점검함.',
            evaluation: '철근/거푸집 공종 TBM 전반 양호. 고소 안전띠 체결 지적 사항 이행 여부 추적 관리 권고.',
        }
    },
    {
        type: '비계/가설구조물',
        work: '강관 비계 및 시스템 비계 설치·해체 작업',
        locationBuildingScope: '전체동',
        locationArea: '외벽',
        locationDetail: '외벽 작업 전층 비계 설치 구간',
        todayInstalledItems: '비계 발판 및 벽연결재 설치, 하부 출입통제 바리케이드 설치, 낙하물 방지망 설치',
        managerRequiredInstallItems: '작업 확장 구간 비계 발판 추가 설치, 강풍 대비 보강 연결재 추가 설치',
        risks: [
            { risk: '비계 발판 탈락으로 인한 추락', measure: '발판 고정핀 체결 확인, 작업 전 점검표 작성' },
            { risk: '비계 설치 중 자재 낙하', measure: '낙하물 방지망 설치, 하부 출입금지, 안전모 착용' },
            { risk: '강풍 시 비계 도괴', measure: '풍속 초과 시 작업 중단 기준 준수, 벽연결재 설치 간격 확인' },
        ],
        feedback: [
            '비계 작업 시작 전 조립 상태 정기 점검표 작성 및 서명 완료',
            '비계 발판 3점 지지 원칙 및 안전발판 이탈 방지 장치 확인',
            '강풍 경보 발령 시 즉시 작업 중지 및 안전 상태 확인',
        ],
        videoEvals: {
            evalLog: '일일 비계 점검표 기재 여부 및 결함 사항 조치 이력 확인.',
            evalAttendance: '비계 작업 해당 팀원 전원 참석. 고소 작업자 안전 교육 이수 현황 확인.',
            evalFocus: '안전 규정 전달 시 집중도 양호. 고소 위험 인지 교육 효과적.',
            evalLeader: '팀장이 벽연결재 설치 간격 및 발판 고정 상태를 현장에서 직접 점검함.',
            evaluation: '비계/가설구조물 공종 TBM 양호. 강풍 기상 조건 대응 절차를 매일 반복 전달 권고.',
        }
    },
    {
        type: '도장/마감',
        work: '내외부 도장 및 마감 작업',
        locationBuildingScope: '103동',
        locationArea: '지상층',
        locationDetail: '12층 세대 내부 마감 구간',
        todayInstalledItems: '도장 구역 환기팬 설치, 사다리 고정 장치 설치, 인화물 보관함 배치',
        managerRequiredInstallItems: '밀폐 구역 추가 환기덕트 설치, 화재 대비 소화기 및 경고표지 추가 설치',
        risks: [
            { risk: '도료 흡입으로 인한 호흡기 유해물질 노출', measure: '방독마스크 착용, 작업 구역 환기 유지' },
            { risk: '사다리 사용 중 추락', measure: '사다리 발 고정 확인, 2인 1조 작업(1인 보조)' },
            { risk: '유기용제 인화로 인한 화재', measure: '인화성 도료 사용 시 발화원 제거, 소화기 비치' },
        ],
        feedback: [
            '밀폐 구역 도장 작업 전 산소 농도 측정 및 환기 확인',
            '도료 보관 시 직사광선·열원 차단, 밀폐 보관',
            '도장 작업 종료 후 잔여 도료 및 솔벤트 안전 폐기',
        ],
        videoEvals: {
            evalLog: '사용 도료 MSDS 게시 여부 및 보호구 착용 기준 일지 기재 확인.',
            evalAttendance: '도장 팀 전원 참석 및 환기 담당자 배정 여부 확인.',
            evalFocus: '흡입 위험 인지 교육 집중도 양호.',
            evalLeader: '팀장이 방독 마스크 착용 상태를 1인씩 확인하는 절차 시행.',
            evaluation: '도장/마감 공종 TBM 양호. 밀폐 작업 허가제 적용 여부 재확인 권고.',
        }
    },
    {
        type: '전기/기계설비',
        work: '전기 배선 및 기계설비 설치·유지보수 작업',
        locationBuildingScope: '104동',
        locationArea: '기계실/전기실',
        locationDetail: '지하 전기실 및 EPS실 배선 구간',
        todayInstalledItems: '분전함 차단 표지 설치, LOTO 잠금장치 설치, 기계 회전부 임시 방호덮개 설치',
        managerRequiredInstallItems: '추가 작업구간 절연매트 설치, 점검구역 접근금지 펜스 및 경광등 추가 설치',
        risks: [
            { risk: '활선 작업 중 감전', measure: '전원 차단 후 LOTO(잠금제어) 적용, 절연 장갑·절연공구 사용' },
            { risk: '배선 작업 중 고소 추락', measure: '안전발판 또는 사다리 고정 후 사용, 안전띠 착용' },
            { risk: '기계 회전부 접촉으로 인한 협착', measure: '정비 전 전원 차단 및 가드 제거 금지, 방호 덮개 원복 확인' },
        ],
        feedback: [
            '전기 작업 전 분전함 차단기 OFF 및 표지판 부착 확인',
            'LOTO(잠금-태그아웃) 절차 반드시 준수 및 이행 확인',
            '기계 점검 완료 후 방호장치 복원 여부 최종 확인',
        ],
        videoEvals: {
            evalLog: '작업 허가서(PTW) 발급 및 서명 여부, LOTO 절차 기재 확인.',
            evalAttendance: '전기·기계 팀 전원 참석 확인. 자격 보유자 작업 배정 여부 확인.',
            evalFocus: '감전 위험 구간 집중 교육 효과적. 전반 집중도 양호.',
            evalLeader: '팀장이 LOTO 절차를 순서대로 직접 시연하며 팀원이 따라 하도록 유도.',
            evaluation: '전기/기계설비 공종 TBM 양호. 자격증 미보유자 활선 접근 금지 재확인 필요.',
        }
    },
    {
        type: '공통 일반',
        work: '현장 공통 안전관리 및 일반 작업',
        locationBuildingScope: '전체동',
        locationArea: '공용구간',
        locationDetail: '현장 공용 통로 및 자재 이동 동선',
        todayInstalledItems: '현장 출입통제선 설치, 공용 안전표지 설치, 통로 정리정돈 및 위험구역 표시 완료',
        managerRequiredInstallItems: '추가 이동통로 유도표지 설치, 취약구역 보호난간 및 야간 조명 추가 설치',
        risks: [
            { risk: '개인 보호구 미착용으로 인한 상해', measure: '안전모·안전화·안전조끼 착용 의무화 및 일일 점검' },
            { risk: '작업장 정리 불량으로 인한 전도', measure: '작업 전·중·후 정리정돈, 통로 확보' },
            { risk: '신호/연락 체계 불량으로 인한 사고', measure: '무전기 또는 신호 체계 사전 확인, 유도원 배치' },
        ],
        feedback: [
            '오늘 작업 전 개인 보호구 착용 상태 상호 점검 실시',
            '작업 구역 내 불필요한 자재 즉시 정리 및 통로 확보',
            '작업 중 이상 상황(울림·균열·낙하) 발생 즉시 작업 중지 및 보고',
        ],
        videoEvals: {
            evalLog: '작업 일지 기재 항목 기본 양식 충족. 특이 사항 및 서명란 확인.',
            evalAttendance: '팀 전원 참석 확인. 신규 투입자 별도 소개 여부 확인.',
            evalFocus: '발 표시 및 시선 처리 기준으로 집중도 전반 양호.',
            evalLeader: '팀장이 오늘 주요 위험 요인을 명확히 전달하고 질의응답 진행.',
            evaluation: '일반 공종 TBM 전반 양호. 일일 안전 점검 체크리스트 활용 지속 권고.',
        }
    },
    {
        type: '지하주차장 설비/마감',
        work: '지하주차장 배관, 트레이, 도장 및 마감 보수 작업',
        locationBuildingScope: '전체동',
        locationArea: '지하주차장',
        locationDetail: 'B2 서측 주차구획 및 램프 접속부',
        todayInstalledItems: '차량 통제 콘 설치, 작업구간 펜스 설치, 임시 조명 및 배수커버 보호판 설치',
        managerRequiredInstallItems: '추가 환기팬 설치, 차량 우회 안내 표지 및 고정식 차단대 추가 설치',
        risks: [
            { risk: '차량 이동과 작업 동선 중첩으로 인한 충돌', measure: '차량 통제요원 배치, 차단봉·유도표지 설치, 작업 시간대 분리' },
            { risk: '지하 환기 부족에 따른 유해가스 노출', measure: '환기팬 가동, 밀폐도 점검, 작업 중 주기적 환기' },
            { risk: '램프부 미끄럼 및 전도', measure: '미끄럼 방지 매트 설치, 누수 구간 즉시 정리, 이동 동선 분리' },
        ],
        feedback: [
            '지하주차장 작업은 차량 통제 계획과 작업자 보행 동선 분리를 먼저 확인해야 합니다.',
            '램프 접속부는 누수·오염 여부를 수시 점검해 전도 위험을 제거하세요.',
            '저조도 구간은 임시 조명을 충분히 확보하고 사각지대를 없애야 합니다.',
        ],
        videoEvals: {
            evalLog: '지하주차장 구획과 차량 통제 범위가 일지에 구체적으로 기록됨.',
            evalAttendance: '배관·마감 작업자와 차량 통제 인원 참석 확인.',
            evalFocus: '차량 접근 위험에 대한 집중도 전반 양호.',
            evalLeader: '팀장이 램프부 위험구간과 차량 유도 절차를 명확히 설명함.',
            evaluation: '지하주차장 작업 TBM은 양호하나 차량 통제 표지 추가 설치 여부를 재확인할 필요가 있습니다.',
        }
    },
    {
        type: '외부계단/출입구',
        work: '외부계단 난간, 디딤판 마감 및 출입구 주변 정리 작업',
        locationBuildingScope: '전체동',
        locationArea: '외부계단',
        locationDetail: '2호 외부계단 1~3층 연결 구간',
        todayInstalledItems: '추락방지 난간 설치, 출입 통제 바리케이드 설치, 계단부 미끄럼 방지 테이프 부착',
        managerRequiredInstallItems: '계단참 보호덮개 추가 설치, 야간 경고등 및 접근금지 안내판 추가 설치',
        risks: [
            { risk: '계단 단차 및 자재 적치로 인한 전도', measure: '계단 통로 확보, 자재 적치 금지, 미끄럼 방지 조치' },
            { risk: '난간 미설치 구간 추락', measure: '임시 난간 선설치 후 작업, 계단참 개구부 덮개 설치' },
            { risk: '출입구 공용동선과 작업동선 충돌', measure: '작업 시간 분리, 통제선 및 유도 인원 배치' },
        ],
        feedback: [
            '외부계단 작업은 통행자와 작업자 동선이 겹치지 않도록 통제해야 합니다.',
            '계단참 개구부와 난간 미설치 구간은 작업 전 선조치가 필요합니다.',
            '우천 시 계단부 미끄럼 위험이 커지므로 미끄럼 방지 상태를 수시 점검하세요.',
        ],
        videoEvals: {
            evalLog: '외부계단 작업 위치와 통제 범위가 일지에 명확히 기록됨.',
            evalAttendance: '작업자와 통제요원 참여 확인.',
            evalFocus: '통행자 접근 통제가 잘 공유되어 집중도 양호.',
            evalLeader: '팀장이 외부계단 추락·전도 위험을 반복 강조하며 통제 절차를 설명함.',
            evaluation: '외부계단 작업 TBM은 적정하나 계단참 추가 보호조치 설치 여부 확인이 필요합니다.',
        }
    },
    {
        type: '옥상 방수/실외기 기초',
        work: '옥상 방수 보수 및 실외기 기초 정리 작업',
        locationBuildingScope: '105동',
        locationArea: '옥상',
        locationDetail: '옥상 서측 실외기 기초 주변',
        todayInstalledItems: '옥상 추락방지 로프 설치, 작업구간 안전표지 설치, 자재 비산 방지망 설치',
        managerRequiredInstallItems: '난간 취약부 추가 보호난간 설치, 강풍 대비 자재 고정장치 추가 설치',
        risks: [
            { risk: '옥상 가장자리 접근 중 추락', measure: '생명줄 체결, 가장자리 접근 금지선 설치, 2인 1조 작업' },
            { risk: '강풍에 의한 자재 비산', measure: '자재 묶음 고정, 강풍 시 작업 중지 기준 준수' },
            { risk: '방수재 취급 중 화학물질 노출', measure: '보호장갑·보안경 착용, MSDS 교육 실시' },
        ],
        feedback: [
            '옥상 작업은 기상 조건에 따라 작업 중지 기준을 분명히 해야 합니다.',
            '가장자리 작업 시 생명줄 체결 여부를 상호 확인하세요.',
            '비산 가능 자재는 반드시 고정하고 잔재물을 즉시 정리해야 합니다.',
        ],
        videoEvals: {
            evalLog: '옥상 작업 특성과 기상 조건 반영 내용이 적절히 기재됨.',
            evalAttendance: '작업자 참석 및 보호구 착용 상태 공유 확인.',
            evalFocus: '고소 위험 인지 수준이 높고 집중도 양호.',
            evalLeader: '팀장이 생명줄 체결과 강풍 대응 절차를 명확히 안내함.',
            evaluation: '옥상 방수/실외기 기초 작업 TBM은 양호하며 난간 취약부 보강 설치를 병행하면 더 좋습니다.',
        }
    },
    {
        type: '창호/유리 설치',
        work: '창호 프레임 및 유리 설치 작업',
        locationBuildingScope: '106동',
        locationArea: '외벽',
        locationDetail: '15층 남측 창호 설치 구간',
        todayInstalledItems: '유리 양중 통제구역 설치, 흡착기 점검 완료, 외부 작업 발판 점검 완료',
        managerRequiredInstallItems: '추가 낙하물 방지망 설치, 하부 통제 펜스 확대 설치',
        risks: [
            { risk: '유리 파손 및 절상', measure: '절단방지 장갑 착용, 전용 거치대 사용, 충격 방지' },
            { risk: '고소 외벽 작업 중 추락', measure: '안전대 체결, 작업발판 상태 확인, 양중 동선 통제' },
            { risk: '유리 낙하물 발생', measure: '하부 출입금지, 낙하물 방지망 및 통제요원 배치' },
        ],
        feedback: [
            '창호/유리 작업은 하부 통제 범위를 충분히 넓게 설정해야 합니다.',
            '흡착기와 양중 장비 점검 결과를 작업 전 공유하세요.',
            '유리 이동 경로에는 불필요한 인원 접근을 차단해야 합니다.',
        ],
        videoEvals: {
            evalLog: '양중 구간과 유리 취급 절차가 일지에 명확히 반영됨.',
            evalAttendance: '양중 담당자 포함 전원 참석 확인.',
            evalFocus: '고소·파손 위험에 대한 경계 수준이 높음.',
            evalLeader: '팀장이 유리 이동 동선과 하부 통제 절차를 구체적으로 설명함.',
            evaluation: '창호/유리 설치 TBM은 양호하나 낙하물 방지망 확대 설치가 필요합니다.',
        }
    },
    {
        type: '소방/배관',
        work: '소방 배관 및 기계 배관 설치 작업',
        locationBuildingScope: '전체동',
        locationArea: '코어부',
        locationDetail: '코어 샤프트 및 지하 주배관 연결부',
        todayInstalledItems: '배관 지지대 설치, 용접작업 화재감시 배치, 화기취급 통제구역 설치',
        managerRequiredInstallItems: '추가 화재감시 인원 배치, 비상소화장비 및 용접불티 비산방지포 추가 설치',
        risks: [
            { risk: '용접·절단 중 화재', measure: '화기작업 허가서 발급, 불티비산방지포 설치, 소화기 비치' },
            { risk: '배관 반입 중 협착', measure: '반입 동선 정리, 신호수 배치, 2인 이상 운반' },
            { risk: '샤프트 작업 중 추락', measure: '개구부 덮개 설치, 안전대 체결, 작업발판 점검' },
        ],
        feedback: [
            '소방/배관 작업은 화기작업 허가와 화재감시 체계를 먼저 확인해야 합니다.',
            '샤프트 개구부 주변은 항상 덮개와 난간 상태를 점검하세요.',
            '장척 자재 반입 시 신호수 배치와 통행 통제가 필요합니다.',
        ],
        videoEvals: {
            evalLog: '화기작업 허가와 배관 반입 동선이 일지에 잘 기록됨.',
            evalAttendance: '용접 작업자와 화재감시 인원 참석 확인.',
            evalFocus: '화재·협착 위험 인지 수준이 높음.',
            evalLeader: '팀장이 화기작업 절차와 샤프트 추락 예방을 반복 설명함.',
            evaluation: '소방/배관 작업 TBM은 적정하나 추가 소화장비 설치 여부를 병행 점검해야 합니다.',
        }
    },
];

const LOCATION_BUILDING_SUGGESTIONS = ['전체동', '101동', '102동', '103동', '104동', '105동', '106동', '부대시설', '외곽구간'];
const LOCATION_AREA_SUGGESTIONS = ['지상층', '지하주차장', '외부계단', '옥상', '외벽', '코어부', '공용구간', '기계실/전기실', '출입구', '외부부지', '자재야적장'];

// [RELIABILITY FIX] API 키 사전 점검 — AI 기능 호출 전 공통 가드
const checkApiKeyOrThrow = () => {
    try {
        const sessionKey = sessionStorage.getItem(SESSION_API_KEY_STORAGE_KEY);
        const storedConfig = localStorage.getItem('siteConfig');
        const legacyKey = storedConfig ? (() => { try { return JSON.parse(storedConfig)?.userApiKey; } catch { return null; } })() : null;
        const devProxy = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (!devProxy && !sessionKey?.trim() && !legacyKey?.trim()) {
            throw new Error('API_KEY_MISSING');
        }
    } catch (e: any) {
        if (e.message === 'API_KEY_MISSING') throw e;
        // sessionStorage 접근 실패는 무시
    }
};

export const TBMForm: React.FC<TBMFormProps> = ({ onSave, onCancel, monthlyGuidelines, riskAssessments, linkedRiskAssessment, initialData, onDelete, teams, mode = 'ROUTINE' }) => {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
    const [mobileSection, setMobileSection] = useState<'MEDIA' | 'FORM'>('FORM');
  
  // [UPDATED] Default date set to current system date
  const [entryDate, setEntryDate] = useState(() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [entryTime, setEntryTime] = useState(() => {
      const hours = new Date().getHours();
      return hours >= 12 ? '13:00' : '07:30';
  });
  const [sessionType, setSessionType] = useState<'MORNING' | 'AFTERNOON' | 'SPECIAL' | 'REGULAR'>(() => {
      const hours = new Date().getHours();
      return hours >= 12 ? 'AFTERNOON' : 'MORNING';
  });
    const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>(teams[0]?.id ? [teams[0].id] : []);
  const [leaderName, setLeaderName] = useState('');
  const [attendeesCount, setAttendeesCount] = useState<number>(0);
  const [workDescription, setWorkDescription] = useState('');
    const [locationBuildingScope, setLocationBuildingScope] = useState('');
    const [locationArea, setLocationArea] = useState('');
    const [locationDetail, setLocationDetail] = useState('');
    const [todayInstalledItems, setTodayInstalledItems] = useState('');
    const [managerRequiredInstallItems, setManagerRequiredInstallItems] = useState('');
  const [riskFactors, setRiskFactors] = useState<RiskAssessmentItem[]>([]);
  const [safetyFeedback, setSafetyFeedback] = useState<string[]>([]);
  
  const [originalLogPreview, setOriginalLogPreview] = useState<string | null>(null);
  const [tbmPhotoPreview, setTbmPhotoPreview] = useState<string | null>(null);
  const [tbmVideoFile, setTbmVideoFile] = useState<File | null>(null);
  const [tbmVideoPreview, setTbmVideoPreview] = useState<string | null>(null);
  const [tbmVideoFileName, setTbmVideoFileName] = useState<string | null>(null);
  
  const [videoAnalysis, setVideoAnalysis] = useState<TBMAnalysisResult | null>(null);
  const [videoStatusMessage, setVideoStatusMessage] = useState<string>(''); 
    const [announceMessage, setAnnounceMessage] = useState('');
  const [isVideoAnalyzing, setIsVideoAnalyzing] = useState(false);
    const [videoUploadState, setVideoUploadState] = useState<'IDLE' | 'CHECKING' | 'READY' | 'ERROR'>('IDLE');
    const [videoUploadMessage, setVideoUploadMessage] = useState('');
    const [videoAnalysisProgress, setVideoAnalysisProgress] = useState(0);
        const [videoAnalysisStartedAt, setVideoAnalysisStartedAt] = useState<number | null>(null);
        const [videoAnalysisEtaSec, setVideoAnalysisEtaSec] = useState<number | null>(null);
        const [videoEstimatedTotalSec, setVideoEstimatedTotalSec] = useState<number | null>(null);
  const [isDocAnalyzing, setIsDocAnalyzing] = useState(false);
  // [RELIABILITY FIX] 화면에 보이는 오류/상태 토스트 배너 (기존 sr-only announceMessage 대체)
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const toastTimerRef = React.useRef<number | null>(null);
  React.useEffect(() => {
      return () => {
          if (toastTimerRef.current) {
              window.clearTimeout(toastTimerRef.current);
              toastTimerRef.current = null;
          }
      };
  }, []);

  const [editingFeedbackIndex, setEditingFeedbackIndex] = useState<number | null>(null);
  const [tempFeedbackText, setTempFeedbackText] = useState("");
  const [newFeedbackInput, setNewFeedbackInput] = useState("");
  const [isFeedbackGenerating, setIsFeedbackGenerating] = useState(false);

  // [수기 직접 입력] OCR 대신 수기 입력 모드 토글 및 공종 선택
  const [showManualOcrInput, setShowManualOcrInput] = useState(false);
  const [selectedWorkTypeIndex, setSelectedWorkTypeIndex] = useState(0);
    const [showOptionalFields, setShowOptionalFields] = useState(false);
  // [동영상 수기 채점] 공종별 예시 코멘트 확장 패널
  const [showVideoExamplePanel, setShowVideoExamplePanel] = useState(false);
  const [videoExampleWorkTypeIndex, setVideoExampleWorkTypeIndex] = useState(0);
  const [manualEvaluationLevel, setManualEvaluationLevel] = useState<ManualEvaluationLevel>('MODERATE');
  const [manualApplyMode, setManualApplyMode] = useState<'APPEND' | 'REPLACE' | 'EMPTY_ONLY'>('APPEND');
  const [showBulkManualPanel, setShowBulkManualPanel] = useState(false);
  const [videoDurationSec, setVideoDurationSec] = useState<number | null>(null);

  const resolvedLinkedRiskAssessment = React.useMemo(() => {
      const validAssessments = (riskAssessments || []).filter(assessment => Array.isArray(assessment.priorities) && assessment.priorities.length > 0);
      if (validAssessments.length === 0) return undefined;

      // 가장 최신의 유효한 위험성평가를 확실하게 연계 (1: MONTHLY 우선, 2: 최신 month, 3: 최신 createdAt)
      return [...validAssessments].sort((a, b) => {
          const monthlyWeightA = a.type === 'MONTHLY' ? 1 : 0;
          const monthlyWeightB = b.type === 'MONTHLY' ? 1 : 0;
          if (monthlyWeightA !== monthlyWeightB) {
              return monthlyWeightB - monthlyWeightA;
          }

          const monthA = a.month || '';
          const monthB = b.month || '';
          if (monthA !== monthB) {
              return monthB.localeCompare(monthA);
          }

          return (b.createdAt ?? 0) - (a.createdAt ?? 0);
      })[0];
  }, [riskAssessments]);

  const effectiveGuidelines = resolvedLinkedRiskAssessment?.priorities || monthlyGuidelines;

  const linkedRiskSuggestions = React.useMemo(() => {
      return [...effectiveGuidelines]
          .filter(item => item.level === 'HIGH' || !!item.actionNote?.trim())
          .sort((a, b) => {
              if (a.level === 'HIGH' && b.level !== 'HIGH') return -1;
              if (a.level !== 'HIGH' && b.level === 'HIGH') return 1;
              if (!!a.actionNote?.trim() && !b.actionNote?.trim()) return -1;
              if (!a.actionNote?.trim() && !!b.actionNote?.trim()) return 1;
              return 0;
          })
          .slice(0, 5);
  }, [effectiveGuidelines]);

    const selectedTeams = React.useMemo(() => teams.filter(team => selectedTeamIds.includes(team.id)), [teams, selectedTeamIds]);
    const selectedTeamNames = React.useMemo(() => selectedTeams.map(team => team.name), [selectedTeams]);
    const selectedTeamLabel = React.useMemo(
            () => (selectedTeamNames.length > 0 ? selectedTeamNames.join(', ') : '팀 미선택'),
            [selectedTeamNames]
    );

  const normalizeCategory = (value: string) => value.replace(/\s|\/|\(|\)|팀/gi, '').toLowerCase();

  const teamFocusedLinkedRiskSuggestions = React.useMemo(() => {
      if (linkedRiskSuggestions.length === 0) return [];
      const selectedCategories = selectedTeams.map(team => normalizeCategory(team.category || '')).filter(Boolean);
      const selectedNames = selectedTeams.map(team => normalizeCategory(team.name || '')).filter(Boolean);

      const scored = linkedRiskSuggestions.map(item => {
          const guidelineCategory = normalizeCategory(item.category || '');
          const isCommon = guidelineCategory.includes('공통');
          const matchesTeamCategory = selectedCategories.some(selectedCategory => guidelineCategory.includes(selectedCategory) || selectedCategory.includes(guidelineCategory));
          const matchesTeamName = selectedNames.some(selectedName => guidelineCategory.includes(selectedName) || selectedName.includes(guidelineCategory));
          const score = isCommon ? 1 : matchesTeamCategory ? 3 : matchesTeamName ? 2 : 0;
          return { item, score };
      });

      const focused = scored.filter(entry => entry.score > 0).sort((a, b) => b.score - a.score).map(entry => entry.item);
      return focused.length > 0 ? focused : linkedRiskSuggestions;
  }, [linkedRiskSuggestions, selectedTeams]);

  const linkedRiskAssessmentSummary = React.useMemo(() => {
      if (resolvedLinkedRiskAssessment) {
          return {
              fileName: resolvedLinkedRiskAssessment.fileName,
              label: resolvedLinkedRiskAssessment.type === 'INITIAL'
                  ? '최초 위험성평가'
                  : resolvedLinkedRiskAssessment.type === 'REGULAR'
                  ? '정기 위험성평가'
                  : '월간/수시 위험성평가',
              total: resolvedLinkedRiskAssessment.priorities.length,
              high: resolvedLinkedRiskAssessment.priorities.filter(item => item.level === 'HIGH').length,
              actionNotes: resolvedLinkedRiskAssessment.priorities.filter(item => !!item.actionNote?.trim()).length,
              id: resolvedLinkedRiskAssessment.id,
              matchedByMonth: true,
          };
      }

      if (linkedRiskAssessment) {
          return {
              ...linkedRiskAssessment,
              matchedByMonth: true,
          };
      }

      return undefined;
  }, [resolvedLinkedRiskAssessment, linkedRiskAssessment]);

  const activePageInfo = React.useMemo(() => {
      const activeItem = queue.find(item => item.tempId === activeId);
      if (!activeItem) return null;

      const current = activeItem.logPageNumber || 1;
      const groupId = activeItem.logPageGroupId;
      if (!groupId) {
          return { current, total: 1, groupId: `SINGLE-${activeItem.tempId}` };
      }

      const grouped = queue
          .filter(item => item.logPageGroupId === groupId)
          .sort((a, b) => (a.logPageNumber || 0) - (b.logPageNumber || 0));

      return {
          current,
          total: Math.max(1, grouped.length),
          groupId,
      };
  }, [queue, activeId]);

  const buildMeasureFromGuideline = (guideline: SafetyGuideline) => {
      if (guideline.actionNote?.trim()) return guideline.actionNote.trim();
      return `${guideline.category} 작업 전 위험요인 공유 및 보호구/작업순서 재점검`;
  };

    const normalizeRiskText = (value: string) => value.trim().replace(/\s+/g, ' ');
  const isLikelyVideoFile = (file: File) => {
      const mime = (file.type || '').toLowerCase();
      if (mime.startsWith('video/')) return true;

      const name = (file.name || '').toLowerCase();
      const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
      const allowedExt = new Set(['.mp4', '.mov', '.m4v', '.3gp', '.webm', '.avi', '.mkv']);
      return allowedExt.has(ext);
  };

  const estimateTotalSeconds = (fileSizeMB: number, profileLabel?: 'BALANCED' | 'FAST' | 'ULTRA_FAST') => {
      const sizeFactor = Math.min(1.8, Math.max(0.7, fileSizeMB / 80));

      let base = 18;
      if (profileLabel === 'ULTRA_FAST') base = 12;
      else if (profileLabel === 'FAST') base = 15;
      else if (profileLabel === 'BALANCED') base = 20;

      // 프로파일 미확정(초기 단계)에서는 파일 크기 기반으로 대략 추정
      if (!profileLabel) {
          if (fileSizeMB >= 200) base = 14;
          else if (fileSizeMB >= 50) base = 17;
          else base = 21;
      }

      return Math.round(base * sizeFactor);
  };

  const announceStatus = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      // 화면에 보이는 토스트로 표시 (기존 sr-only 병행 유지)
      setAnnounceMessage('');
      requestAnimationFrame(() => {
          setAnnounceMessage(message);
      });
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToastMessage({ text: message, type });
      toastTimerRef.current = window.setTimeout(() => setToastMessage(null), type === 'error' ? 8000 : 4000);
  };

  const logInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // [FIX] Track blob URL to revoke on change/unmount (memory leak prevention)
  const videoBlobUrlRef = useRef<string | null>(null);
    const compressedVideoCacheRef = useRef<{ key: string; result: VideoCompressionResult } | null>(null);

  // [FIX] Revoke video blob URL on component unmount
    React.useEffect(() => {
      return () => {
          if (videoBlobUrlRef.current) {
              URL.revokeObjectURL(videoBlobUrlRef.current);
              videoBlobUrlRef.current = null;
          }
      };
  }, []);

    React.useEffect(() => {
      if (!isVideoAnalyzing || !videoAnalysisStartedAt) {
          setVideoAnalysisEtaSec(null);
          return;
      }

      const calculateEta = () => {
          if (videoAnalysisProgress <= 3) {
              setVideoAnalysisEtaSec(null);
              return;
          }

          const elapsedSec = (Date.now() - videoAnalysisStartedAt) / 1000;
          const progressBasedTotal = Math.max(elapsedSec / (videoAnalysisProgress / 100), elapsedSec + 2);
          const calibratedTotal = videoEstimatedTotalSec ? Math.max(progressBasedTotal * 0.7 + videoEstimatedTotalSec * 0.3, elapsedSec + 2) : progressBasedTotal;
          const totalEstimatedSec = calibratedTotal;
          const remainingSec = Math.max(0, Math.round(totalEstimatedSec - elapsedSec));
          setVideoAnalysisEtaSec(remainingSec);
      };

      calculateEta();
      const timer = window.setInterval(calculateEta, 700);
      return () => window.clearInterval(timer);
    }, [isVideoAnalyzing, videoAnalysisStartedAt, videoAnalysisProgress, videoEstimatedTotalSec]);

    React.useEffect(() => {
      if (initialData) {
          const item: QueueItem = {
              tempId: initialData.id,
              status: 'READY',
              ...initialData,
              logPageGroupId: initialData.logPageGroupId || initialData.id,
              logPageNumber: initialData.logPageNumber || 1,
              originalLogPreview: initialData.originalLogImageUrl,
              tbmPhotoPreview: initialData.tbmPhotoUrl,
              tbmVideoPreview: initialData.tbmVideoUrl
          };
          setQueue([item]);
          setActiveId(item.tempId);
      } else if (mode === 'ROUTINE' && queue.length === 0) {
          const initialGroupId = `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const newItem: QueueItem = { tempId: `NEW-${Date.now()}`, status: 'WAITING', logPageGroupId: initialGroupId, logPageNumber: 1 };
          setQueue([newItem]);
          setActiveId(newItem.tempId);
      }
  }, [initialData, mode]);

    React.useEffect(() => {
      const activeItem = queue.find(q => q.tempId === activeId);
      if (activeItem) {
          const now = new Date();
          const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          
          setEntryDate(activeItem.date || todayStr);
          const itemTime = activeItem.time || '07:30';
          setEntryTime(itemTime);
          const itemSession = activeItem.sessionType || (Number(itemTime.split(':')[0] || '0') >= 12 ? 'AFTERNOON' : 'MORNING');
          setSessionType(itemSession);
          const restoredTeamIds = getEntryTeamIds(activeItem);
          setSelectedTeamIds(restoredTeamIds.length > 0 ? restoredTeamIds : (teams[0]?.id ? [teams[0].id] : []));
          setLeaderName(activeItem.leaderName || '');
          setAttendeesCount(activeItem.attendeesCount || 0);

          const resolvedWork = getWorkDescriptionDisplay({
              sessionType: itemSession,
              time: itemTime,
              workDescription: activeItem.workDescription
          });
          setWorkDescription(activeItem.workDescription !== undefined && activeItem.workDescription !== '' ? activeItem.workDescription : (itemSession === 'AFTERNOON' ? resolvedWork : ''));
          setLocationBuildingScope(activeItem.locationBuildingScope || '');
          setLocationArea(activeItem.locationArea || '');
          setLocationDetail(activeItem.locationDetail || '');
          setTodayInstalledItems(activeItem.todayInstalledItems || '');
          setManagerRequiredInstallItems(activeItem.managerRequiredInstallItems || '');
          const hasOptionalData = !!(
              activeItem.locationBuildingScope?.trim() ||
              activeItem.locationArea?.trim() ||
              activeItem.locationDetail?.trim() ||
              activeItem.todayInstalledItems?.trim() ||
              activeItem.managerRequiredInstallItems?.trim()
          );
          setShowOptionalFields(hasOptionalData);
          setRiskFactors(activeItem.riskFactors || []);
          setSafetyFeedback(activeItem.safetyFeedback || []);
          
          setOriginalLogPreview(activeItem.originalLogPreview || activeItem.originalLogImageUrl || null);
          setTbmPhotoPreview(activeItem.tbmPhotoPreview || activeItem.tbmPhotoUrl || null);
          setTbmVideoFile(activeItem.tbmVideoFile || null);
          setTbmVideoPreview(activeItem.tbmVideoPreview || activeItem.tbmVideoUrl || null);
          setTbmVideoFileName(activeItem.tbmVideoFileName || null);
          
          setVideoAnalysis(activeItem.videoAnalysis || null);
      }
  }, [activeId, queue]);

  const updateActiveItem = (updates: Partial<QueueItem>) => {
      setQueue(prev => prev.map(item => item.tempId === activeId ? { ...item, ...updates } : item));
  };

  const handleDateChange = (v: string) => { setEntryDate(v); updateActiveItem({ date: v }); };
  const handleTimeChange = (v: string) => {
      setEntryTime(v);
      const hours = Number(v.split(':')[0] || '0');
      const nextSession = hours >= 12 ? 'AFTERNOON' : 'MORNING';
      setSessionType(nextSession);
      
      let nextWork = workDescription;
      if (nextSession === 'AFTERNOON' && (!workDescription || workDescription.trim() === '' || workDescription === '작업없음' || workDescription === '내용 없음')) {
          nextWork = '오전과 동일함';
          setWorkDescription(nextWork);
      }
      updateActiveItem({ time: v, sessionType: nextSession, workDescription: nextWork });
  };
  const handleSessionTypeChange = (type: 'MORNING' | 'AFTERNOON' | 'SPECIAL' | 'REGULAR') => {
      setSessionType(type);
      let targetTime = entryTime;
      if (type === 'AFTERNOON' && Number(entryTime.split(':')[0]) < 12) {
          targetTime = '13:00';
          setEntryTime(targetTime);
      } else if (type === 'MORNING' && Number(entryTime.split(':')[0]) >= 12) {
          targetTime = '07:30';
          setEntryTime(targetTime);
      }
      
      let nextWork = workDescription;
      if (type === 'AFTERNOON' && (!workDescription || workDescription.trim() === '' || workDescription === '작업없음' || workDescription === '내용 없음')) {
          nextWork = '오전과 동일함';
          setWorkDescription(nextWork);
      }
      updateActiveItem({ sessionType: type, time: targetTime, workDescription: nextWork });
  };
  const handleTeamToggle = (nextTeamId: string) => {
      const nextIds = selectedTeamIds.includes(nextTeamId)
          ? selectedTeamIds.filter(teamId => teamId !== nextTeamId)
          : [...selectedTeamIds, nextTeamId];
      const teamPayload = buildEntryTeamPayload(nextIds, teams);
      setSelectedTeamIds(teamPayload.teamIds);
      updateActiveItem(teamPayload);
  };

  const handleSelectAllTeams = () => {
      const nextIds = selectedTeamIds.length === teams.length ? [] : teams.map(team => team.id);
      const teamPayload = buildEntryTeamPayload(nextIds, teams);
      setSelectedTeamIds(teamPayload.teamIds);
      updateActiveItem(teamPayload);
  };
  const handleLeaderChange = (v: string) => { setLeaderName(v); updateActiveItem({ leaderName: v }); };
  const handleCountChange = (v: number) => { setAttendeesCount(v); updateActiveItem({ attendeesCount: v }); };
  const handleWorkChange = (v: string) => { setWorkDescription(v); updateActiveItem({ workDescription: v }); };
    const handleLocationBuildingScopeChange = (v: string) => { setLocationBuildingScope(v); updateActiveItem({ locationBuildingScope: v }); };
    const handleLocationAreaChange = (v: string) => { setLocationArea(v); updateActiveItem({ locationArea: v }); };
    const handleLocationDetailChange = (v: string) => { setLocationDetail(v); updateActiveItem({ locationDetail: v }); };
    const handleTodayInstalledItemsChange = (v: string) => { setTodayInstalledItems(v); updateActiveItem({ todayInstalledItems: v }); };
    const handleManagerRequiredInstallItemsChange = (v: string) => { setManagerRequiredInstallItems(v); updateActiveItem({ managerRequiredInstallItems: v }); };

    const formatLocationSummary = (building: string, area: string, detail: string) => {
            return [building, area, detail].map(v => v?.trim()).filter(Boolean).join(' / ');
    };
  
  const addRiskFactor = () => {
      const newRisks = [...riskFactors, { risk: '', measure: '' }];
      setRiskFactors(newRisks);
      updateActiveItem({ riskFactors: newRisks });
  };
  const handleRiskChange = (i: number, field: keyof RiskAssessmentItem, val: string) => {
      const newRisks = [...riskFactors];
      newRisks[i][field] = val;
      setRiskFactors(newRisks);
      updateActiveItem({ riskFactors: newRisks });
  };
  const removeRiskFactor = (i: number) => {
      const newRisks = riskFactors.filter((_, idx) => idx !== i);
      setRiskFactors(newRisks);
      updateActiveItem({ riskFactors: newRisks });
  };

  const handleImportLinkedGuideline = (guideline: SafetyGuideline) => {
      const normalizedRisk = normalizeRiskText(guideline.content || '');
      if (!normalizedRisk) {
          announceStatus('가져올 위험요인 내용이 비어 있습니다.');
          return;
      }

      const exists = riskFactors.some(item => normalizeRiskText(item.risk || '') === normalizedRisk);
      if (exists) {
          announceStatus('이미 동일한 위험요인이 등록되어 있습니다.');
          return;
      }

      const next = [
          ...riskFactors,
          {
              risk: normalizedRisk,
              measure: buildMeasureFromGuideline(guideline),
          }
      ];
      setRiskFactors(next);
      updateActiveItem({ riskFactors: next });
      setMobileSection('FORM');
      announceStatus('연계된 위험성평가 항목을 위험요인에 추가했습니다.');
  };

  const handleImportAllLinkedGuidelines = () => {
      if (teamFocusedLinkedRiskSuggestions.length === 0) {
          announceStatus('가져올 연계 위험성평가 항목이 없습니다.');
          return;
      }

      const existingRisks = new Set(riskFactors.map(item => normalizeRiskText(item.risk || '')));
      const seen = new Set(existingRisks);
      const appendItems = teamFocusedLinkedRiskSuggestions.reduce<RiskAssessmentItem[]>((acc, item) => {
          const normalizedRisk = normalizeRiskText(item.content || '');
          if (!normalizedRisk || seen.has(normalizedRisk)) return acc;
          seen.add(normalizedRisk);
          acc.push({
              risk: normalizedRisk,
              measure: buildMeasureFromGuideline(item),
          });
          return acc;
      }, []);

      if (appendItems.length === 0) {
          announceStatus('추천 항목이 이미 모두 등록되어 있습니다.');
          return;
      }

      const next = [...riskFactors, ...appendItems];
      setRiskFactors(next);
      updateActiveItem({ riskFactors: next });
      setMobileSection('FORM');
      announceStatus(`연계 위험성평가 ${appendItems.length}건을 위험요인에 일괄 반영했습니다.`);
  };

  const handleApplyActionNotesToFeedback = () => {
      const noteFeedback = teamFocusedLinkedRiskSuggestions
          .filter(item => !!item.actionNote?.trim())
          .map(item => `[${item.category}] ${item.actionNote!.trim()}`);

      if (noteFeedback.length === 0) {
          announceStatus('안전 코멘트로 반영할 조치메모가 없습니다.');
          return;
      }

      const merged = Array.from(new Set([...safetyFeedback, ...noteFeedback]));
      setSafetyFeedback(merged);
      updateActiveItem({ safetyFeedback: merged });
      setMobileSection('FORM');
      announceStatus(`조치메모 ${noteFeedback.length}건을 안전 코멘트에 반영했습니다.`);
  };

  const handleAddFeedback = () => { if (newFeedbackInput.trim()) { const n = [...safetyFeedback, newFeedbackInput.trim()]; setSafetyFeedback(n); updateActiveItem({ safetyFeedback: n }); setNewFeedbackInput(""); } };
  const handleDeleteFeedback = (index: number) => { const n = safetyFeedback.filter((_, i) => i !== index); setSafetyFeedback(n); updateActiveItem({ safetyFeedback: n }); };
  const handleStartEditFeedback = (index: number) => { setEditingFeedbackIndex(index); setTempFeedbackText(safetyFeedback[index]); };
  const handleSaveEditFeedback = () => { if (editingFeedbackIndex !== null) { const updated = [...safetyFeedback]; updated[editingFeedbackIndex] = tempFeedbackText; setSafetyFeedback(updated); updateActiveItem({ safetyFeedback: updated }); setEditingFeedbackIndex(null); } };

  // --- Analysis Editable Handlers ---
  const handleAnalysisChange = (field: keyof TBMAnalysisResult, value: string) => {
      if (!videoAnalysis) return;
      const updated = { ...videoAnalysis, [field]: value };
      setVideoAnalysis(updated);
      updateActiveItem({ videoAnalysis: updated });
  };

  // Rubric Slider Logic
  const handleRubricChange = (field: keyof ScoreRubric, value: number) => {
      if (!videoAnalysis) return;
      
      const currentRubric = videoAnalysis.rubric || { logQuality:0, focus:0, voice:0, ppe:0, deductions:[] };
      const newRubric = { ...currentRubric, [field]: value };
      
      // Auto-calculate total score
      const newScore = (newRubric.logQuality || 0) + (newRubric.focus || 0) + (newRubric.voice || 0) + (newRubric.ppe || 0);
      
      const updated = {
          ...videoAnalysis,
          rubric: newRubric,
          score: newScore
      };
      setVideoAnalysis(updated);
      updateActiveItem({ videoAnalysis: updated });
  };

  // 1. Original Log (OCR Source)
  const handleLogUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          // [FIX] 이미지 파일 크기 제한 — 10MB 초과 시 IndexedDB OOM 방지
          if (file.size > 10 * 1024 * 1024) {
              announceStatus('이미지 파일이 너무 큽니다. 최대 10MB까지 업로드할 수 있습니다.', 'error');
              e.target.value = '';
              return;
          }
          // [RELIABILITY FIX] HEIC/HEIF/비표준 → JPEG 정규화 후 Gemini 전송 보장
          let preview: string;
          try {
              preview = await normalizeImageToJpeg(file);
          } catch {
              preview = await blobToBase64(file);
          }
          setOriginalLogPreview(preview);
          updateActiveItem({ originalLogFile: file, originalLogPreview: preview, originalLogImageUrl: preview });
      }
  };

  // 2. TBM Photo (Proof)
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          // [FIX] 이미지 파일 크기 제한 — 10MB 초과 시 IndexedDB OOM 방지
          if (file.size > 10 * 1024 * 1024) {
              announceStatus('이미지 파일이 너무 큽니다. 최대 10MB까지 업로드할 수 있습니다.', 'error');
              e.target.value = '';
              return;
          }
          let preview: string;
          try {
              preview = await normalizeImageToJpeg(file);
          } catch {
              preview = await blobToBase64(file);
          }
          setTbmPhotoPreview(preview);
          updateActiveItem({ tbmPhotoFile: file, tbmPhotoPreview: preview, tbmPhotoUrl: preview });
      }
  };

  // 3. TBM Video
  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          setVideoUploadState('CHECKING');
          setVideoUploadMessage('영상 파일 확인 중...');
          setVideoDurationSec(null);

          // [FIX] Revoke previous blob URL before creating a new one
          if (videoBlobUrlRef.current) {
              URL.revokeObjectURL(videoBlobUrlRef.current);
              videoBlobUrlRef.current = null;
          }
          const file = e.target.files[0];
          if (!isLikelyVideoFile(file)) {
              setVideoUploadState('ERROR');
              setVideoUploadMessage('동영상 형식을 확인해주세요.');
              announceStatus('동영상 파일만 업로드할 수 있습니다. (지원: MP4/MOV/M4V/3GP/WEBM 등)');
              e.target.value = '';
              return;
          }
          if (!file.size || file.size <= 0) {
              setVideoUploadState('ERROR');
              setVideoUploadMessage('파일 읽기에 실패했습니다. 다시 선택해주세요.');
              announceStatus('선택한 영상 파일을 읽을 수 없습니다. 다시 선택해주세요.');
              e.target.value = '';
              return;
          }
          // [FIX] 영상 파일 크기 제한 — 500MB 초과 시 메모리 압박 방지
          if (file.size > 500 * 1024 * 1024) {
              setVideoUploadState('ERROR');
              setVideoUploadMessage('파일이 너무 큽니다. 500MB 이하로 선택해주세요.');
              announceStatus('영상 파일이 너무 큽니다. 최대 500MB까지 업로드할 수 있습니다.');
              e.target.value = '';
              return;
          }

          // 새 영상은 근거 검증이 끝나기 전까지 분석 결과로 취급하지 않는다.
          setVideoAnalysis(null);
          setVideoAnalysisProgress(0);
          compressedVideoCacheRef.current = null;

          setTbmVideoFile(file);
          setTbmVideoFileName(file.name);
          const url = URL.createObjectURL(file);
          videoBlobUrlRef.current = url;
          setTbmVideoPreview(url);
          // [FIX] Do NOT persist blob URL to storage — blob URLs are session-only.
          // Store only the filename as evidence; the video content is analysed on upload.
          updateActiveItem({
              tbmVideoFile: file,
              tbmVideoPreview: url,
              tbmVideoUrl: null,
              tbmVideoFileName: file.name,
              videoAnalysis: undefined,
          });
          setVideoUploadState('READY');
          setVideoUploadMessage(`업로드 완료: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);

          const metadataVideo = document.createElement('video');
          const metadataUrl = URL.createObjectURL(file);
          metadataVideo.preload = 'metadata';
          metadataVideo.onloadedmetadata = () => {
              const duration = Number.isFinite(metadataVideo.duration) ? metadataVideo.duration : null;
              setVideoDurationSec(duration);
              if (duration && duration > 120) {
                  setVideoUploadMessage(`약 ${Math.round(duration)}초 영상 · 무료 API 절약을 위해 수기 보기글 사용을 권장합니다.`);
              } else if (duration && duration < 15) {
                  setVideoUploadMessage(`약 ${Math.round(duration)}초의 짧은 영상 · 근거 부족 시 수기 보기글로 보완하세요.`);
              }
              URL.revokeObjectURL(metadataUrl);
          };
          metadataVideo.onerror = () => URL.revokeObjectURL(metadataUrl);
          metadataVideo.src = metadataUrl;

          // 모바일에서 동일 파일 재선택 시 change 이벤트가 누락되는 문제 방지
          e.target.value = '';
      }
  };

  const handleSidebarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const newItems: QueueItem[] = [];
      const fileList = Array.from(files) as File[];
      const teamPayload = buildEntryTeamPayload(selectedTeamIds, teams);
      const baseItem: Partial<QueueItem> = {
          date: entryDate,
          time: entryTime,
          ...teamPayload,
          leaderName,
          attendeesCount,
          workDescription,
          locationBuildingScope,
          locationArea,
          locationDetail,
          todayInstalledItems,
          managerRequiredInstallItems,
          riskFactors: riskFactors.map(item => ({ ...item })),
          safetyFeedback: [...safetyFeedback],
      };
      
      for (const file of fileList) {
          if (file.type.startsWith('image/')) {
              const preview = await blobToBase64(file);
              newItems.push({
                  ...baseItem,
                  tempId: `ITEM-${Date.now()}-${Math.random()}`,
                  originalLogFile: file,
                  originalLogPreview: preview,
                  originalLogImageUrl: preview,
                  status: 'WAITING',
              });
          }
      }

      if (newItems.length === 0) {
          announceStatus('이미지 파일만 추가할 수 있습니다.', 'error');
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
      }

      const assignPageMeta = (items: QueueItem[], startPage: number, groupId: string): QueueItem[] => {
          return items.map((item, idx) => ({
              ...item,
              logPageGroupId: groupId,
              logPageNumber: startPage + idx,
          }));
      };

      const activeItem = queue.find(item => item.tempId === activeId);
      const canFillActiveItem = !!activeItem && !activeItem.originalLogPreview && !activeItem.originalLogImageUrl;

      if (canFillActiveItem) {
          const [first, ...rest] = newItems;
          const pageGroupId = activeItem.logPageGroupId || `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const activePageNumber = activeItem.logPageNumber || 1;
          const filledActiveItem: QueueItem = {
              ...activeItem,
              originalLogFile: first.originalLogFile,
              originalLogPreview: first.originalLogPreview,
              originalLogImageUrl: first.originalLogImageUrl,
              logPageGroupId: pageGroupId,
              logPageNumber: activePageNumber,
          };

          const pagedRest = assignPageMeta(rest, activePageNumber + 1, pageGroupId);

          const nextQueue = queue.map(item => item.tempId === activeItem!.tempId ? filledActiveItem : item);
          setQueue(pagedRest.length > 0 ? [...nextQueue, ...pagedRest] : nextQueue);
          setActiveId(activeItem.tempId);
      } else if (mode === 'ROUTINE' && queue.length === 1 && !queue[0].originalLogPreview) {
          const pageGroupId = queue[0].logPageGroupId || `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const paged = assignPageMeta(newItems, 1, pageGroupId);
          setQueue(paged);
          setActiveId(paged[0].tempId);
      } else {
          const pageGroupId = activeItem?.logPageGroupId || `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const currentMaxPage = queue
              .filter(item => item.logPageGroupId === pageGroupId)
              .reduce((max, item) => Math.max(max, item.logPageNumber || 0), 0);
          const paged = assignPageMeta(newItems, currentMaxPage + 1, pageGroupId);
          setQueue(prev => [...prev, ...paged]);
          if (!activeId && paged.length > 0) setActiveId(paged[0].tempId);
      }

      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Helper: Find best team match
  const findBestMatchingTeam = (extractedName: string): string => {
      if (!extractedName) return selectedTeamIds[0] || '';

      // 1. Clean up noise (Company names, common suffixes)
      // Removes: '휘강', '건설', '(주)', '주식회사', 'team', '팀', spaces
      const cleanInput = extractedName.replace(/휘강|건설|\(주\)|주식회사|team|팀|\s/gi, '').trim();
      
    if (cleanInput.length === 0) return selectedTeamIds[0] || ''; // If nothing left (e.g. input was just "휘강건설"), keep current

    let bestMatchId = selectedTeamIds[0] || '';
      let highestScore = 0;

      teams.forEach(t => {
          const cleanTeamName = t.name.replace(/팀|\s/g, '');
          let score = 0;

          // Exact substring match (strongest signal)
          if (cleanTeamName.includes(cleanInput) || cleanInput.includes(cleanTeamName)) {
              score += 10;
              // Bonus for length similarity (avoids short string matching everything)
              const lengthDiff = Math.abs(cleanTeamName.length - cleanInput.length);
              score -= lengthDiff;
          }

          if (score > highestScore) {
              highestScore = score;
              bestMatchId = t.id;
          }
      });

      return bestMatchId;
  };

  const findBestMatchingTeams = (extractedName: string) => {
      if (!extractedName) return selectedTeamIds;
      const parts = extractedName
          .split(/,|\/|\||·|&|\+|및/g)
          .map(part => part.trim())
          .filter(Boolean);
      const sourceParts = parts.length > 0 ? parts : [extractedName];
      const matchedIds = Array.from(new Set(sourceParts.map(part => findBestMatchingTeam(part)).filter(Boolean)));
      return matchedIds.length > 0 ? matchedIds : selectedTeamIds;
  };

  const handleAnalyzeDocument = async () => {
    if (!originalLogPreview) {
        announceStatus('분석할 수기 일지 사진이 없습니다.', 'error');
        return;
    }
    // [RELIABILITY FIX] API 키 사전 점검
    try { checkApiKeyOrThrow(); } catch {
        announceStatus('AI 분석을 사용하려면 [설정]에서 Gemini API 키를 먼저 등록해주세요.', 'error');
        return;
    }
    
    setIsDocAnalyzing(true);
    try {
        // [RELIABILITY FIX] DataURL에서 MIME 추출 + 지원 형식 강제 정규화
        const rawMime = originalLogPreview.split(';')[0].split(':')[1] || '';
        const SUPPORTED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        const mimeType = SUPPORTED_MIMES.includes(rawMime) ? rawMime : 'image/jpeg';
        const base64Data = originalLogPreview.split(',')[1];

        const results = await analyzeMasterLog(base64Data, mimeType, effectiveGuidelines, 'ROUTINE');
        
        if (results && results.length > 0) {
            const data = results[0];
            
            const newWork = data.workDescription || workDescription;
            const newLeader = data.leaderName || leaderName;
            const newCount = data.attendeesCount || attendeesCount;
            
            // [UPDATED] Smart Matching Logic
            let newTeamIds = selectedTeamIds;
            if (data.teamName) {
                newTeamIds = findBestMatchingTeams(data.teamName);
            }
            const nextTeamPayload = buildEntryTeamPayload(
                newTeamIds,
                teams,
                data.teamName ? getEntryTeamNames({ teamName: data.teamName } as Partial<TBMEntry>) : []
            );

            setWorkDescription(newWork);
            setLeaderName(newLeader);
            setAttendeesCount(newCount);
            setSelectedTeamIds(nextTeamPayload.teamIds);

            if (data.riskFactors && data.riskFactors.length > 0) {
                setRiskFactors(data.riskFactors);
            }
            if (data.safetyFeedback && data.safetyFeedback.length > 0) {
                setSafetyFeedback(data.safetyFeedback);
            }

            updateActiveItem({
                workDescription: newWork,
                leaderName: newLeader,
                attendeesCount: newCount,
                ...nextTeamPayload,
                riskFactors: data.riskFactors,
                safetyFeedback: data.safetyFeedback
            });

            announceStatus('수기 일지 내용이 자동으로 입력되었습니다.', 'success');
        } else {
            announceStatus('텍스트를 인식하지 못했습니다. 사진이 선명한지 확인하고 다시 시도해주세요.', 'error');
        }
    } catch (e: any) {
        console.error('[OCR Error]', e);
        const msg = (e.message || '') as string;
        let userMsg = '';
        if (msg.includes('API_KEY_MISSING') || msg.includes('API Key가 설정되지')) {
            userMsg = '설정에서 Gemini API 키를 등록해주세요.';
        } else if (msg.includes('429') || msg.includes('Quota') || msg.includes('제한') || msg.includes('Resource')) {
            userMsg = 'AI 사용량 초과입니다. 잠시 후 다시 시도하거나 개인 API 키를 설정하세요.';
        } else if (msg.includes('network') || msg.includes('fetch') || msg.includes('Failed to fetch')) {
            userMsg = '네트워크 연결을 확인해주세요.';
        } else {
            userMsg = `분석 실패: ${msg.slice(0, 80) || '알 수 없는 오류'}`;
        }
        announceStatus(userMsg, 'error');
    } finally {
        setIsDocAnalyzing(false);
    }
  };

  const handleTextGapAnalysis = async () => {
    if (!workDescription) {
                announceStatus('작업 내용을 먼저 입력해주세요.');
        return;
    }
    setIsFeedbackGenerating(true);
    try {
        const newFeedback = await generateSafetyFeedback(workDescription, riskFactors, effectiveGuidelines);
        
        if (newFeedback && newFeedback.length > 0) {
            const merged = Array.from(new Set([...safetyFeedback, ...newFeedback]));
            setSafetyFeedback(merged);
            updateActiveItem({ safetyFeedback: merged });
            announceStatus(`${newFeedback.length}개의 안전 코멘트가 생성되었습니다.`);
        } else {
            announceStatus('생성된 코멘트가 없습니다. 작업 내용을 더 자세히 입력해보세요.');
        }
    } catch (e: any) {
        console.error('[Feedback Generation Error]', e);
        const msg = (e.message || '') as string;
        if (msg.includes('API_KEY_MISSING') || msg.includes('API Key가 설정되지')) {
            announceStatus('설정에서 Gemini API 키를 등록해주세요.', 'error');
        } else if (msg.includes('429') || msg.includes('Quota') || msg.includes('제한')) {
            announceStatus('AI 사용량 초과입니다. 잠시 후 다시 시도하세요.', 'error');
        } else {
            announceStatus(`코멘트 생성 실패: ${msg.slice(0, 60) || '알 수 없는 오류'}`, 'error');
        }
    } finally {
        setIsFeedbackGenerating(false);
    }
  };

  const handleRunVideoAnalysis = async () => {
    if (!tbmVideoFile) return;
    if (videoDurationSec && videoDurationSec > 120) {
        setShowBulkManualPanel(true);
        announceStatus('120초 초과 영상은 무료 API 사용량이 커질 수 있어 수기 보기글 모드로 전환했습니다.', 'info');
        return;
    }
        const analysisStartedAt = Date.now();
    setIsVideoAnalyzing(true);
    setVideoAnalysisProgress(10);
        setVideoAnalysisStartedAt(Date.now());
        setVideoAnalysisEtaSec(null);
        setVideoEstimatedTotalSec(estimateTotalSeconds(tbmVideoFile.size / 1024 / 1024));
    setVideoStatusMessage("영상 최적화 준비 중...");
    setVideoUploadState('CHECKING');
    setVideoUploadMessage('AI 분석 준비 중...');

    try {
        const fileKey = `${tbmVideoFile.name}:${tbmVideoFile.size}:${tbmVideoFile.lastModified}`;
        let compressionResult: VideoCompressionResult;

        if (compressedVideoCacheRef.current?.key === fileKey) {
            compressionResult = compressedVideoCacheRef.current.result;
            setVideoStatusMessage(`압축 결과 재사용 (${compressionResult.profile.label})`);
            setVideoAnalysisProgress(35);
            setVideoEstimatedTotalSec(estimateTotalSeconds(compressionResult.originalSizeMB, compressionResult.profile.label));
        } else {
            setVideoStatusMessage('영상 자동 축소/고속 처리 중...');
            setVideoAnalysisProgress(25);
            compressionResult = await compressVideo(tbmVideoFile);
            compressedVideoCacheRef.current = { key: fileKey, result: compressionResult };
            setVideoAnalysisProgress(60);
            setVideoEstimatedTotalSec(estimateTotalSeconds(compressionResult.originalSizeMB, compressionResult.profile.label));
        }

        const base64Video = await blobToBase64(compressionResult.blob);
        setVideoAnalysisProgress(75);
        setVideoStatusMessage(`AI 분석 중 (${compressionResult.profile.label}, ${compressionResult.profile.playbackRate.toFixed(1)}x)`);
        setVideoUploadMessage(`AI 분석 진행: ${compressionResult.profile.label} 프로파일`);
        
        const result = await evaluateTBMVideo(
            base64Video.split(',')[1],
            compressionResult.mimeType,
            { workDescription, riskFactors },
            effectiveGuidelines,
            {
                sourceDurationSec: compressionResult.sourceDurationSec,
                analyzedDurationSec: compressionResult.analyzedDurationSec,
                playbackRate: compressionResult.profile.playbackRate,
                audioIncluded: compressionResult.audioIncluded,
            }
        );
        setVideoAnalysisProgress(95);

        setVideoAnalysis(result);
        updateActiveItem({ videoAnalysis: result });

        if (result.feedback && result.feedback.length > 0) {
            const currentFeedback = [...safetyFeedback];
            result.feedback.forEach(fb => {
                if (!currentFeedback.includes(fb)) currentFeedback.push(fb);
            });
            setSafetyFeedback(currentFeedback);
            updateActiveItem({ safetyFeedback: currentFeedback });
        }
        setVideoAnalysisProgress(100);
        setVideoUploadState('READY');
        setVideoUploadMessage('영상 근거 검증 완료. 결과를 확인하세요.');
        const elapsedSec = Math.max(1, Math.round((Date.now() - analysisStartedAt) / 1000));
        announceStatus(`AI 분석 완료: ${compressionResult.originalSizeMB.toFixed(1)}MB → ${compressionResult.compressedSizeKB.toFixed(0)}KB (${compressionResult.profile.label}) · 소요 ${elapsedSec}초`);
    } catch (e: any) {
        console.error(e);
        const msg = e.message || '';
        const elapsedSec = Math.max(1, Math.round((Date.now() - analysisStartedAt) / 1000));
        setVideoUploadState('ERROR');
        setVideoAnalysis(null);
        updateActiveItem({ videoAnalysis: undefined });
        setVideoUploadMessage('영상 근거를 검증하지 못했습니다. 결과는 저장되지 않습니다.');
        if (msg.includes('API_KEY_MISSING') || msg.includes('API Key가 설정되지')) {
            announceStatus(`설정에서 Gemini API 키를 등록해주세요. (소요 ${elapsedSec}초)`, 'error');
        } else if (msg.includes('429') || msg.includes('Quota') || msg.includes('제한')) {
            announceStatus(`AI 사용량 초과입니다. 잠시 후 다시 시도하세요. (소요 ${elapsedSec}초)`, 'error');
        } else {
            announceStatus(`영상 분석 실패: ${msg.slice(0, 60) || '알 수 없는 오류'} (소요 ${elapsedSec}초)`, 'error');
        }
    } finally {
        setIsVideoAnalyzing(false);
        setVideoAnalysisStartedAt(null);
        setVideoAnalysisEtaSec(null);
        setVideoEstimatedTotalSec(null);
        setVideoStatusMessage("");
    }
  };

  // [수기 직접 입력] 공종 예시 선택 시 폼 자동 채우기
  const handleApplyWorkTypeExample = (mode: 'ALL' | 'RISK_ONLY' | 'FEEDBACK_ONLY' | 'VIDEO_EVAL') => {
      const example = WORK_TYPE_EXAMPLES[selectedWorkTypeIndex];
      if (!example) return;

      if (mode === 'ALL' || mode === 'RISK_ONLY') {
          if (mode === 'ALL') {
              setShowOptionalFields(true);
              setWorkDescription(example.work);
              setLocationBuildingScope(example.locationBuildingScope);
              setLocationArea(example.locationArea);
              setLocationDetail(example.locationDetail);
              setTodayInstalledItems(example.todayInstalledItems);
              setManagerRequiredInstallItems(example.managerRequiredInstallItems);
              updateActiveItem({ 
                  workDescription: example.work,
                  locationBuildingScope: example.locationBuildingScope,
                  locationArea: example.locationArea,
                  locationDetail: example.locationDetail,
                  todayInstalledItems: example.todayInstalledItems,
                  managerRequiredInstallItems: example.managerRequiredInstallItems,
              });
          }
          setRiskFactors(example.risks);
          updateActiveItem({ riskFactors: example.risks });
      }
      if (mode === 'ALL' || mode === 'FEEDBACK_ONLY') {
          const merged = Array.from(new Set([...safetyFeedback, ...example.feedback]));
          setSafetyFeedback(merged);
          updateActiveItem({ safetyFeedback: merged });
      }
      if (mode === 'VIDEO_EVAL') {
          const ex = WORK_TYPE_EXAMPLES[videoExampleWorkTypeIndex];
          if (!ex) return;
          const updated: TBMAnalysisResult = {
              ...(videoAnalysis || {
                  score: 0, evaluation: '', evalLog: '', evalAttendance: '',
                  evalFocus: '', evalLeader: '', analysisSource: 'MANUAL' as const,
                  verificationStatus: 'MANUAL' as const,
                  rubric: { logQuality: 0, focus: 0, voice: 0, ppe: 0, deductions: [] },
                  leaderCoaching: { actionItem: '', rationale: '' },
                  details: { participation: 'GOOD' as const, voiceClarity: 'CLEAR' as const, ppeStatus: 'GOOD' as const, interaction: false },
                  focusAnalysis: { overall: 0, distractedCount: 0, focusZones: { front: 'HIGH' as const, back: 'HIGH' as const, side: 'HIGH' as const } },
                  insight: { mentionedTopics: [], missingTopics: [], suggestion: '' },
                  feedback: []
              }),
              evalLog: ex.videoEvals.evalLog,
              evalAttendance: ex.videoEvals.evalAttendance,
              evalFocus: ex.videoEvals.evalFocus,
              evalLeader: ex.videoEvals.evalLeader,
              evaluation: ex.videoEvals.evaluation,
              analysisSource: 'MANUAL',
              verificationStatus: 'MANUAL',
          };
          setVideoAnalysis(updated);
          updateActiveItem({ videoAnalysis: updated });
          announceStatus(`[${ex.type}] 공종 예시 평가가 채점 폼에 반영되었습니다. 내용을 수정해 사용하세요.`, 'success');
          return;
      }
      announceStatus(`[${example.type}] 공종 예시가 반영되었습니다. 내용을 수정해 사용하세요.`, 'success');
      setShowManualOcrInput(false);
      setMobileSection('FORM');
  };

  const mergeManualFeedback = (current: string[], template: string[]) => {
      if (manualApplyMode === 'REPLACE') return [...template];
      if (manualApplyMode === 'EMPTY_ONLY') return current.length > 0 ? current : [...template];
      return Array.from(new Set([...current, ...template]));
  };

  const handleApplyManualTemplate = (bulk: boolean) => {
      const workType = WORK_TYPE_EXAMPLES[videoExampleWorkTypeIndex]?.type || '공통';
      const template = buildManualEvaluation(manualEvaluationLevel, workType);
      const targetTeamIds = bulk ? selectedTeamIds : selectedTeamIds.slice(0, 1);

      if (targetTeamIds.length === 0) {
          announceStatus('적용할 팀을 먼저 선택해주세요.', 'error');
          return;
      }

      if (!bulk || targetTeamIds.length === 1) {
          const mergedFeedback = mergeManualFeedback(safetyFeedback, template.feedback);
          setVideoAnalysis(template);
          setSafetyFeedback(mergedFeedback);
          updateActiveItem({ videoAnalysis: template, safetyFeedback: mergedFeedback });
          announceStatus(`${workType} ${MANUAL_EVALUATION_LEVELS.find(item => item.value === manualEvaluationLevel)?.label} 보기글을 적용했습니다.`, 'success');
          return;
      }

      const activeItem = queue.find(item => item.tempId === activeId);
      if (!activeItem) return;

      const baseItem: QueueItem = {
          ...activeItem,
          date: entryDate,
          time: entryTime,
          leaderName,
          attendeesCount,
          workDescription,
          locationBuildingScope,
          locationArea,
          locationDetail,
          todayInstalledItems,
          managerRequiredInstallItems,
          riskFactors: riskFactors.map(item => ({ ...item })),
      };

      const generatedItems = targetTeamIds.map((teamId, index) => {
          const existingFeedback = index === 0 ? safetyFeedback : (baseItem.safetyFeedback || []);
          return {
              ...baseItem,
              tempId: index === 0 ? activeItem.tempId : `BULK-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
              ...buildEntryTeamPayload([teamId], teams),
              safetyFeedback: mergeManualFeedback(existingFeedback, template.feedback),
              videoAnalysis: {
                  ...template,
                  rubric: { ...template.rubric, deductions: [...template.rubric.deductions] },
                  feedback: [...template.feedback],
              },
              status: 'READY' as const,
          };
      });

      setQueue(prev => [
          ...prev.filter(item => item.tempId !== activeItem.tempId),
          ...generatedItems,
      ]);
      setActiveId(generatedItems[0].tempId);
      announceStatus(`선택한 ${generatedItems.length}개 팀에 수기 평가 보기글을 일괄 적용했습니다.`, 'success');
  };

  // [UPDATED] Save All Items in Queue (Batch Save Logic)
    const handleAddRegistration = () => {
            const activeItem = queue.find(item => item.tempId === activeId);
            const pageGroupId = activeItem?.logPageGroupId || `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const nextPageNumber = queue
                    .filter(item => item.logPageGroupId === pageGroupId)
                    .reduce((max, item) => Math.max(max, item.logPageNumber || 0), 0) + 1;
      const teamPayload = buildEntryTeamPayload(selectedTeamIds, teams);

      const nextItem: QueueItem = {
          tempId: `ITEM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          status: 'WAITING',
                    logPageGroupId: pageGroupId,
                    logPageNumber: nextPageNumber,
          date: entryDate,
          time: entryTime,
      ...teamPayload,
          leaderName,
          attendeesCount,
          workDescription,
          locationBuildingScope,
          locationArea,
          locationDetail,
          todayInstalledItems,
          managerRequiredInstallItems,
          riskFactors: riskFactors.map(item => ({ ...item })),
          safetyFeedback: [...safetyFeedback],
      };

      setQueue(prev => [...prev, nextItem]);
      setActiveId(nextItem.tempId);
      announceStatus(`${nextPageNumber}페이지 입력 항목을 만들었습니다. 다음 일지 페이지를 등록하세요.`, 'success');
      window.setTimeout(() => {
          fileInputRef.current?.click();
      }, 0);
  };

    const handleSaveAll = async () => {
      if (queue.length === 0) return;
      
      const now = new Date();
      const defaultDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      // Map all items in the queue to TBMEntry objects
      const orderedQueue = [...queue].sort((a, b) => {
          if ((a.logPageGroupId || '') === (b.logPageGroupId || '')) {
              return (a.logPageNumber || 0) - (b.logPageNumber || 0);
          }
          return (a.createdAt || 0) - (b.createdAt || 0);
      });

      const entriesToSave: TBMEntry[] = orderedQueue.map((item, index) => {
          const uniqueSuffix = Math.random().toString(36).substr(2, 6); // Ensure unique ID per item
          return {
              id: item.id || `ENTRY-${Date.now()}-${index}-${uniqueSuffix}`,
              date: item.date || defaultDate,
              time: item.time || '07:30',
              ...buildEntryTeamPayload(getEntryTeamIds(item), teams, getEntryTeamNames(item, teams)),
              leaderName: item.leaderName || '',
              attendeesCount: item.attendeesCount || 0,
              workDescription: getWorkDescriptionDisplay(item),
              locationBuildingScope: item.locationBuildingScope || '',
              locationArea: item.locationArea || '',
              locationDetail: item.locationDetail || '',
              todayInstalledItems: item.todayInstalledItems || '',
              managerRequiredInstallItems: item.managerRequiredInstallItems || '',
              riskFactors: item.riskFactors || [],
              safetyFeedback: item.safetyFeedback || [],
              tbmPhotoUrl: item.tbmPhotoUrl || item.tbmPhotoPreview, // Ensure URL is taken
              originalLogImageUrl: item.originalLogImageUrl || item.originalLogPreview,
              logPageNumber: item.logPageNumber,
              logPageGroupId: item.logPageGroupId,
              videoAnalysis: item.videoAnalysis?.analysisSource === 'VIDEO'
                  && item.videoAnalysis.verificationStatus !== 'VERIFIED'
                  ? undefined
                  : item.videoAnalysis,
              tbmVideoFileName: item.tbmVideoFileName,
              // [FIX] blob: URL은 세션 종료 후 무효화되므로 절대 저장하지 않음
              tbmVideoUrl: item.tbmVideoUrl?.startsWith('blob:') ? null : (item.tbmVideoUrl || null),
              linkedRiskAssessmentId: linkedRiskAssessmentSummary?.id,
              linkedRiskAssessmentLabel: linkedRiskAssessmentSummary?.label,
              linkedRiskAssessmentMatchedByMonth: linkedRiskAssessmentSummary?.matchedByMonth,
              linkedRiskAssessmentHighCount: linkedRiskAssessmentSummary?.high,
              linkedRiskAssessmentActionNoteCount: linkedRiskAssessmentSummary?.actionNotes,
              createdAt: item.createdAt || Date.now()
          };
      });

      // Filter out virtually empty items (e.g. initial placeholder if not touched)
      // We keep items that have at least an image OR a team name set
        const validEntries = entriesToSave.filter(e => getEntryTeamNames(e, teams).length > 0 || e.tbmPhotoUrl || e.originalLogImageUrl);

      if (validEntries.length === 0) {
          announceStatus('저장할 유효한 데이터가 없습니다.');
          return;
      }

      if (await onSave(validEntries, true)) {
          // Success handled by parent (usually closing form)
      }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-[#F8FAFC] flex flex-col animate-fade-in text-slate-800 font-sans">
        {/* 접근성용 sr-only 유지 */}
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {isDocAnalyzing
                ? '수기 일지 내용을 분석 중입니다.'
                : isVideoAnalyzing
                    ? (videoStatusMessage || '동영상 AI 분석을 진행 중입니다.')
                    : isFeedbackGenerating
                        ? '안전 코멘트를 생성 중입니다.'
                        : (announceMessage || '')}
        </p>
        {/* [RELIABILITY FIX] 화면에 보이는 토스트 배너 — 모든 AI 작업 결과/오류를 표시 */}
        {toastMessage && (
            <div className={`fixed top-0 left-0 right-0 z-[10001] flex items-start justify-between gap-3 px-4 py-3 shadow-xl border-b text-sm font-bold animate-fade-in ${
                toastMessage.type === 'error' ? 'bg-red-600 text-white border-red-700' :
                toastMessage.type === 'success' ? 'bg-emerald-600 text-white border-emerald-700' :
                'bg-indigo-600 text-white border-indigo-700'
            }`}>
                <span className="flex-1 leading-snug">{toastMessage.text}</span>
                <button type="button" onClick={() => setToastMessage(null)} className="shrink-0 opacity-80 hover:opacity-100 ml-2 text-white font-black text-base leading-none">✕</button>
            </div>
        )}
        {/* Header */}
        <div className="min-h-16 bg-white border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between px-3 md:px-6 py-2 md:py-0 shadow-sm shrink-0 z-50 gap-2 md:gap-0">
           <div className="flex items-center gap-3 md:gap-4 min-w-0 w-full md:w-auto">
              <button onClick={onCancel} className="text-slate-500 hover:text-slate-800 flex items-center gap-2 font-bold transition-colors">
                 <ArrowLeft size={20} />
                 <span>나가기</span>
              </button>
              <div className="h-6 w-px bg-slate-200 hidden md:block"></div>
              <h1 className="text-sm md:text-xl font-black text-slate-800 flex items-center gap-2 truncate">
                 {mode === 'BATCH' ? <Layers className="text-indigo-600" size={24}/> : <FileText className="text-emerald-600" size={24}/>}
                 <span className="truncate">{mode === 'BATCH' ? '대량 일괄 등록 (Batch Mode)' : '스마트 TBM 지휘 및 등록'}</span>
              </h1>
           </div>
           <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto">
              {initialData && onDelete && (
                  <button onClick={() => onDelete(String(initialData.id))} className="bg-white border border-red-200 text-red-500 px-3 md:px-4 py-2 rounded-xl text-xs md:text-sm font-bold hover:bg-red-50 transition-colors flex items-center justify-center gap-2 min-h-[44px]">
                      <Trash2 size={18} /> 삭제
                  </button>
              )}
              <button onClick={handleAddRegistration} className="bg-white border border-indigo-200 text-indigo-700 px-3 md:px-4 py-2 rounded-xl text-xs md:text-sm font-bold hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2 min-h-[44px]">
                  <Plus size={16}/> 페이지 추가
              </button>
              <button onClick={handleSaveAll} className="flex-1 md:flex-none bg-slate-900 text-white px-4 md:px-6 py-2.5 rounded-xl text-xs md:text-sm font-bold hover:bg-slate-800 shadow-lg flex items-center justify-center gap-2 transition-transform hover:scale-105 min-h-[44px]">
                  <Save size={18}/> {queue.length > 1 ? `전체 저장 완료 (${queue.length}건)` : '작성 완료'}
              </button>
           </div>
        </div>

        {(videoUploadState !== 'IDLE' || isVideoAnalyzing) && (
            <div className={`shrink-0 px-3 md:px-6 py-2 border-b ${videoUploadState === 'ERROR' ? 'bg-red-50 border-red-200' : 'bg-rose-50 border-rose-200'}`}>
                <div className="flex items-center gap-2">
                    {(isVideoAnalyzing || videoUploadState === 'CHECKING')
                        ? <Loader2 size={14} className="animate-spin text-rose-600"/>
                        : <CheckCircle2 size={14} className={videoUploadState === 'ERROR' ? 'text-red-500' : 'text-emerald-500'} />}
                    <span className={`text-xs md:text-sm font-bold ${videoUploadState === 'ERROR' ? 'text-red-700' : 'text-rose-700'}`}>
                        {isVideoAnalyzing ? (videoStatusMessage || '동영상 AI 분석 진행 중...') : (videoUploadMessage || '동영상 상태 확인 중...')}
                    </span>
                    {isVideoAnalyzing && videoAnalysisEtaSec !== null && videoAnalysisProgress < 100 && (
                        <span className="text-[11px] md:text-xs font-bold text-rose-500">· 약 {videoAnalysisEtaSec}초 남음</span>
                    )}
                </div>
                {isVideoAnalyzing && (
                    <div className="mt-2">
                        <div className="h-1.5 rounded-full bg-rose-100 overflow-hidden">
                            <div className="h-full bg-rose-500 transition-all duration-300" style={{ width: `${Math.max(8, videoAnalysisProgress)}%` }}></div>
                        </div>
                        <p className="mt-1 text-[10px] text-rose-600 font-semibold text-right">{videoAnalysisProgress}%</p>
                    </div>
                )}
            </div>
        )}

        {/* Body Layout */}
        <div className="flex-1 flex overflow-hidden flex-col lg:flex-row">
            {/* 1. Left Sidebar: Queue / List */}
            <div className="w-full lg:w-72 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-sm text-slate-600 uppercase tracking-wider flex items-center gap-2">
                        <Layers size={14}/> 대기열 (Queue)
                    </h3>
                    <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-[10px] font-black">{queue.length}</span>
                </div>
                <div className="overflow-x-auto lg:overflow-y-auto p-3 custom-scrollbar">
                    <div className="flex lg:block gap-3 lg:space-y-3 min-w-max lg:min-w-0">
                    {queue.map((item, idx) => (
                        <div 
                            key={item.tempId}
                            onClick={() => setActiveId(item.tempId)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setActiveId(item.tempId);
                                }
                            }}
                            role="button"
                            tabIndex={0}
                            aria-label={`${item.teamName || `항목 ${idx + 1}`} 선택`}
                            className={`min-w-[220px] lg:min-w-0 p-3 rounded-2xl cursor-pointer border-2 transition-all flex gap-3 items-center group relative ${activeId === item.tempId ? 'bg-indigo-50 border-indigo-500 shadow-md ring-2 ring-indigo-100' : 'bg-white border-transparent hover:border-slate-200 hover:bg-slate-50'}`}
                        >
                            <div className="w-12 h-12 rounded-xl bg-slate-200 overflow-hidden shrink-0 flex items-center justify-center border border-slate-300">
                                {item.originalLogPreview ? <img src={item.originalLogPreview} className="w-full h-full object-cover"/> : <FileText size={20} className="text-slate-400"/>}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-bold truncate ${activeId === item.tempId ? 'text-indigo-800' : 'text-slate-700'}`}>
                                    {item.teamName || `항목 #${idx + 1}`}
                                </p>
                                <p className="text-[10px] font-black text-indigo-500 mt-0.5">
                                    일지 {item.logPageNumber || idx + 1}페이지
                                </p>
                                <p className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                                    {item.status === 'WAITING' ? <span className="w-2 h-2 rounded-full bg-slate-300"></span> : <span className="w-2 h-2 rounded-full bg-emerald-500"></span>}
                                    {item.status === 'WAITING' ? '작성 대기' : item.status}
                                </p>
                            </div>
                            <button 
                                type="button"
                                aria-label={`${item.teamName || `항목 ${idx + 1}`} 대기열에서 제거`}
                                onClick={(e) => { e.stopPropagation(); setQueue(queue.filter(q => q.tempId !== item.tempId)); }}
                                className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 p-1 bg-white border border-red-100 shadow-sm rounded-full text-red-500 hover:bg-red-50 transition-all hover:scale-110"
                            >
                                <X size={14}/>
                            </button>
                        </div>
                    ))}
                    
                    <div onClick={() => fileInputRef.current?.click()} onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            fileInputRef.current?.click();
                        }
                    }} role="button" tabIndex={0} aria-label="다중페이지 일지 이미지 추가" className="p-4 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center text-slate-400 gap-2 cursor-pointer hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all min-h-[100px] group">
                        <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center transition-colors">
                            <Plus size={20}/>
                        </div>
                        <span className="text-xs font-bold">다중페이지 추가</span>
                    </div>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleSidebarUpload}/>
                    </div>
                </div>
            </div>

            {/* 2. Main Work Area - Split View */}
            <div className="flex-1 flex overflow-hidden flex-col xl:flex-row">
                <div className="xl:hidden px-4 py-3 border-b border-slate-200 bg-white">
                    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                        <button
                            type="button"
                            onClick={() => setMobileSection('MEDIA')}
                            className={`rounded-xl px-4 py-3 text-sm font-black transition-all ${mobileSection === 'MEDIA' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600'}`}
                        >
                            미디어
                        </button>
                        <button
                            type="button"
                            onClick={() => setMobileSection('FORM')}
                            className={`rounded-xl px-4 py-3 text-sm font-black transition-all ${mobileSection === 'FORM' ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200' : 'text-slate-600'}`}
                        >
                            입력데이터
                        </button>
                    </div>
                </div>
                
                {/* LEFT: Media Command Center */}
                <div className={`w-full xl:w-1/2 h-auto xl:h-full flex-col xl:border-r border-slate-200 bg-slate-100/80 overflow-y-auto custom-scrollbar ${mobileSection === 'MEDIA' ? 'flex' : 'hidden'} xl:flex`}>
                    <div className="p-4 sticky top-0 bg-slate-100/90 backdrop-blur z-20 border-b border-slate-200">
                        <h3 className="font-black text-slate-700 flex items-center gap-2"><ImageIcon size={18}/> 미디어 증빙 센터 (Assets)</h3>
                    </div>
                    
                    <div className="p-6 space-y-8 pb-20">
                        
                        {/* Section 1: Handwritten Log */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                            <div className="flex justify-between items-center mb-3">
                                <label className="text-sm font-black text-indigo-900 flex items-center gap-2">
                                    <FileText size={18} className="text-indigo-600"/> ① 수기 일지 (OCR 분석용)
                                </label>
                                <button onClick={()=>logInputRef.current?.click()} className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded hover:bg-indigo-100">변경</button>
                            </div>
                            
                            <div 
                                onClick={()=>!originalLogPreview && logInputRef.current?.click()}
                                onKeyDown={(e) => {
                                    if ((e.key === 'Enter' || e.key === ' ') && !originalLogPreview) {
                                        e.preventDefault();
                                        logInputRef.current?.click();
                                    }
                                }}
                                role="button"
                                tabIndex={0}
                                aria-label="수기 일지 원본 첨부"
                                className={`aspect-[3/4] rounded-xl border-2 overflow-hidden relative group transition-all ${originalLogPreview ? 'border-indigo-200 bg-slate-50' : 'border-dashed border-slate-300 bg-slate-50 hover:bg-indigo-50 cursor-pointer'}`}
                            >
                                {originalLogPreview ? (
                                    <img src={originalLogPreview} className="w-full h-full object-contain"/>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                                        <FileText size={32}/>
                                        <span className="text-xs font-bold">수기 일지 원본 첨부</span>
                                    </div>
                                )}
                            </div>
                            <input type="file" ref={logInputRef} className="hidden" accept="image/*" onChange={handleLogUpload}/>

                            {originalLogPreview && (
                                <button 
                                    onClick={handleAnalyzeDocument}
                                    disabled={isDocAnalyzing}
                                    className="w-full mt-3 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:shadow-lg hover:scale-[1.02] transition-all disabled:opacity-50"
                                >
                                    {isDocAnalyzing ? (
                                        <> <Loader2 size={16} className="animate-spin"/> 텍스트 추출 중... </>
                                    ) : (
                                        <> <ScanText size={16} className="text-yellow-300"/> 수기 내용 자동 추출 (OCR) </>
                                    )}
                                </button>
                            )}

                            {/* [수기 직접 입력] API 초과 시 수기로 직접 입력 */}
                            <button
                                type="button"
                                onClick={() => setShowManualOcrInput(v => !v)}
                                className="w-full mt-2 py-2.5 border-2 border-dashed border-slate-300 text-slate-600 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:border-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 transition-all"
                            >
                                <Edit3 size={14}/> {showManualOcrInput ? '▲ 수기 직접 입력 접기' : '✏️ 수기 직접 입력 (API 초과 시 사용)'}
                            </button>

                            {showManualOcrInput && (
                                <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-4 animate-fade-in">
                                    <div>
                                        <p className="text-xs font-black text-indigo-800 mb-2 flex items-center gap-1.5">
                                            <Layers size={13}/> 공종 선택 → 예시 내용으로 빠른 채우기
                                        </p>
                                        <select
                                            value={selectedWorkTypeIndex}
                                            onChange={(e) => setSelectedWorkTypeIndex(Number(e.target.value))}
                                            className="w-full border border-indigo-200 bg-white rounded-xl px-3 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-400"
                                        >
                                            {WORK_TYPE_EXAMPLES.map((ex, i) => (
                                                <option key={ex.type} value={i}>{ex.type}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* 선택된 공종 예시 미리보기 */}
                                    <div className="rounded-xl border border-indigo-100 bg-white p-3 space-y-2">
                                        <p className="text-[10px] font-black text-indigo-500 uppercase tracking-wider">예시 내용 미리보기</p>
                                        <p className="text-xs font-bold text-slate-700">📋 작업 내용</p>
                                        <p className="text-xs text-slate-600 bg-slate-50 rounded p-2 leading-relaxed">{WORK_TYPE_EXAMPLES[selectedWorkTypeIndex].work}</p>

                                        <p className="text-xs font-bold text-slate-700 pt-1">📍 위치 예시</p>
                                        <p className="text-[11px] text-slate-600 bg-sky-50 rounded p-2 leading-relaxed">
                                            {[WORK_TYPE_EXAMPLES[selectedWorkTypeIndex].locationBuildingScope, WORK_TYPE_EXAMPLES[selectedWorkTypeIndex].locationArea, WORK_TYPE_EXAMPLES[selectedWorkTypeIndex].locationDetail].filter(Boolean).join(' / ')}
                                        </p>

                                        <p className="text-xs font-bold text-slate-700 pt-1">🛠 금일 설치한 사항</p>
                                        <p className="text-[11px] text-slate-600 bg-amber-50 rounded p-2 leading-relaxed">{WORK_TYPE_EXAMPLES[selectedWorkTypeIndex].todayInstalledItems}</p>

                                        <p className="text-xs font-bold text-slate-700 pt-1">👷 관리자 추가 설치 필요 항목</p>
                                        <p className="text-[11px] text-slate-600 bg-violet-50 rounded p-2 leading-relaxed">{WORK_TYPE_EXAMPLES[selectedWorkTypeIndex].managerRequiredInstallItems}</p>

                                        <p className="text-xs font-bold text-slate-700 pt-1">⚠️ 위험 요인 예시</p>
                                        <div className="space-y-1">
                                            {WORK_TYPE_EXAMPLES[selectedWorkTypeIndex].risks.map((r, i) => (
                                                <div key={i} className="text-[11px] text-slate-600 bg-red-50 rounded p-2">
                                                    <span className="font-bold text-red-600">위험: </span>{r.risk}<br/>
                                                    <span className="font-bold text-blue-600">대책: </span>{r.measure}
                                                </div>
                                            ))}
                                        </div>

                                        <p className="text-xs font-bold text-slate-700 pt-1">💬 안전 코멘트 예시</p>
                                        <div className="space-y-1">
                                            {WORK_TYPE_EXAMPLES[selectedWorkTypeIndex].feedback.map((fb, i) => (
                                                <p key={i} className="text-[11px] text-slate-600 bg-emerald-50 rounded p-2">✓ {fb}</p>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleApplyWorkTypeExample('ALL')}
                                            className="py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-indigo-700 shadow-md shadow-indigo-100 min-h-[44px]"
                                        >
                                            <CheckCircle2 size={14}/> 전체 반영
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleApplyWorkTypeExample('RISK_ONLY')}
                                            className="py-3 border border-indigo-300 text-indigo-700 bg-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-indigo-50 min-h-[44px]"
                                        >
                                            <AlertCircle size={14}/> 위험요인만
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleApplyWorkTypeExample('FEEDBACK_ONLY')}
                                            className="py-3 border border-emerald-300 text-emerald-700 bg-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-emerald-50 min-h-[44px]"
                                        >
                                            <UserCheck size={14}/> 코멘트만
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setShowManualOcrInput(false); setMobileSection('FORM'); }}
                                            className="py-3 border border-slate-200 text-slate-500 bg-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-slate-50 min-h-[44px]"
                                        >
                                            <X size={14}/> 닫기
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-indigo-500 text-center">반영 후 우측 입력 데이터 탭에서 내용을 수정하세요.</p>
                                </div>
                            )}
                        </div>

                        {/* Section 2: Action Photo */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                            <div className="flex justify-between items-center mb-3">
                                <label className="text-sm font-black text-emerald-900 flex items-center gap-2">
                                    <Camera size={18} className="text-emerald-600"/> ③ TBM 활동 사진 (증빙용)
                                </label>
                                <button onClick={()=>photoInputRef.current?.click()} className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded hover:bg-emerald-100">변경</button>
                            </div>
                            <div 
                                onClick={()=>!tbmPhotoPreview && photoInputRef.current?.click()}
                                onKeyDown={(e) => {
                                    if ((e.key === 'Enter' || e.key === ' ') && !tbmPhotoPreview) {
                                        e.preventDefault();
                                        photoInputRef.current?.click();
                                    }
                                }}
                                role="button"
                                tabIndex={0}
                                aria-label="TBM 활동 사진 첨부"
                                className={`aspect-video rounded-xl border-2 overflow-hidden relative group transition-all ${tbmPhotoPreview ? 'border-emerald-200 bg-slate-50' : 'border-dashed border-slate-300 bg-slate-50 hover:bg-emerald-50 cursor-pointer'}`}
                            >
                                {tbmPhotoPreview ? (
                                    <img src={tbmPhotoPreview} className="w-full h-full object-cover"/>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                                        <Camera size={32}/>
                                        <span className="text-xs font-bold">활동 사진 첨부</span>
                                    </div>
                                )}
                            </div>
                            <input type="file" ref={photoInputRef} className="hidden" accept="image/*" onChange={handlePhotoUpload}/>
                        </div>

                        {/* Section 3: Video Analysis */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                            <div className="flex justify-between items-center mb-3">
                                <label className="text-sm font-black text-rose-900 flex items-center gap-2">
                                    <Film size={18} className="text-rose-600"/> ③ TBM 동영상 (AI 정밀진단)
                                </label>
                                <button onClick={()=>videoInputRef.current?.click()} className="text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded hover:bg-rose-100">변경</button>
                            </div>
                            
                            <div onClick={()=>!tbmVideoPreview && videoInputRef.current?.click()} onKeyDown={(e) => {
                                if (!tbmVideoPreview && (e.key === 'Enter' || e.key === ' ')) {
                                    e.preventDefault();
                                    videoInputRef.current?.click();
                                }
                            }} role="button" tabIndex={tbmVideoPreview ? -1 : 0} aria-label="TBM 동영상 "  className={`aspect-video rounded-xl border-2 flex items-center justify-center transition-all group ${
                                tbmVideoPreview 
                                ? 'border-rose-300 bg-black cursor-default' 
                                : 'border-dashed border-slate-300 bg-slate-50 cursor-pointer hover:border-rose-300 hover:bg-rose-50'
                            }`}>
                                {tbmVideoPreview ? (
                                    <div className="relative w-full h-full flex items-center justify-center">
                                        <video src={tbmVideoPreview} className="w-full h-full object-contain" controls playsInline preload="metadata"/>
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                            <PlayCircle size={60} className="text-white drop-shadow-2xl"/>
                                        </div>
                                        <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-full font-bold max-w-[280px] truncate">{tbmVideoFileName}</div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
                                        <PlayCircle size={40}/>
                                        <span className="text-xs font-bold">동영상 업로드</span>
                                    </div>
                                )}
                            </div>
                            <input type="file" ref={videoInputRef} className="hidden" accept="video/*,.mp4,.mov,.m4v,.3gp,.webm,.avi,.mkv" onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} onChange={handleVideoUpload}/>
                            <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
                                대용량 영상은 자동으로 축소/고속 처리되어 빠른 코칭 분석에 사용됩니다.
                            </p>

                            {(videoUploadState !== 'IDLE' || isVideoAnalyzing) && (
                                <div className={`mt-2 rounded-lg border px-3 py-2 ${videoUploadState === 'ERROR' ? 'border-red-200 bg-red-50' : 'border-rose-200 bg-rose-50'}`}>
                                    <div className="flex items-center gap-2">
                                        {(isVideoAnalyzing || videoUploadState === 'CHECKING')
                                            ? <Loader2 size={14} className="animate-spin text-rose-600"/>
                                            : <CheckCircle2 size={14} className={videoUploadState === 'ERROR' ? 'text-red-500' : 'text-emerald-500'} />}
                                        <span className={`text-[11px] font-bold ${videoUploadState === 'ERROR' ? 'text-red-700' : 'text-rose-700'}`}>
                                            {isVideoAnalyzing ? (videoStatusMessage || 'AI 분석 진행 중...') : (videoUploadMessage || '영상 상태 확인 중')}
                                        </span>
                                    </div>
                                    {isVideoAnalyzing && (
                                        <div className="mt-2">
                                            <div className="h-1.5 rounded-full bg-rose-100 overflow-hidden">
                                                <div className="h-full bg-rose-500 transition-all duration-300" style={{ width: `${Math.max(8, videoAnalysisProgress)}%` }}></div>
                                            </div>
                                            <p className="mt-1 text-[10px] text-rose-600 font-semibold text-right">{videoAnalysisProgress}%</p>
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            {tbmVideoPreview && (
                                <button 
                                    onClick={handleRunVideoAnalysis} 
                                    disabled={isVideoAnalyzing}
                                    className="w-full mt-3 py-3 bg-gradient-to-r from-rose-500 to-pink-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:shadow-lg hover:translate-y-[-1px] transition-all"
                                >
                                    {isVideoAnalyzing ? (
                                        <div className="flex items-center gap-2">
                                            <Loader2 size={16} className="animate-spin"/> 
                                            <span>{videoStatusMessage}</span>
                                        </div>
                                    ) : (
                                        <>
                                            <Sparkles size={16} className="text-yellow-300 animate-pulse"/> AI 안전 정밀 진단 실행
                                        </>
                                    )}
                                </button>
                            )}

                            {/* [수기 직접 채점] AI 없이 공종별 예시로 직접 채점 */}
                            {tbmVideoPreview && !isVideoAnalyzing && (
                                <button
                                    type="button"
                                    onClick={() => setShowVideoExamplePanel(v => !v)}
                                    className="w-full mt-2 py-2.5 border-2 border-dashed border-slate-300 text-slate-600 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:border-rose-400 hover:text-rose-700 hover:bg-rose-50 transition-all"
                                >
                                    <Edit3 size={14}/> {showVideoExamplePanel ? '▲ 수기 직접 채점 접기' : '✏️ 수기 직접 채점 (API 초과 시 사용)'}
                                </button>
                            )}

                            {showVideoExamplePanel && (
                                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-4 space-y-3 animate-fade-in">
                                    <p className="text-xs font-black text-rose-800 flex items-center gap-1.5">
                                        <ClipboardCheck size={13}/> 공종별 평가 예시 → 채점 폼 자동 채우기
                                    </p>
                                    <select
                                        value={videoExampleWorkTypeIndex}
                                        onChange={(e) => setVideoExampleWorkTypeIndex(Number(e.target.value))}
                                        className="w-full border border-rose-200 bg-white rounded-xl px-3 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-rose-400"
                                    >
                                        {WORK_TYPE_EXAMPLES.map((ex, i) => (
                                            <option key={ex.type} value={i}>{ex.type}</option>
                                        ))}
                                    </select>

                                    {/* 예시 미리보기 */}
                                    <div className="rounded-xl border border-rose-100 bg-white p-3 space-y-2 text-[11px]">
                                        <p className="text-[10px] font-black text-rose-500 uppercase tracking-wider">평가 예시 미리보기</p>
                                        {[
                                            { label: '① 일지 작성 평가', val: WORK_TYPE_EXAMPLES[videoExampleWorkTypeIndex].videoEvals.evalLog },
                                            { label: '② 참석·참여도 평가', val: WORK_TYPE_EXAMPLES[videoExampleWorkTypeIndex].videoEvals.evalAttendance },
                                            { label: '③ 작업자 집중도 평가', val: WORK_TYPE_EXAMPLES[videoExampleWorkTypeIndex].videoEvals.evalFocus },
                                            { label: '④ 팀장 리딩 평가', val: WORK_TYPE_EXAMPLES[videoExampleWorkTypeIndex].videoEvals.evalLeader },
                                            { label: '종합 의견', val: WORK_TYPE_EXAMPLES[videoExampleWorkTypeIndex].videoEvals.evaluation },
                                        ].map(item => (
                                            <div key={item.label}>
                                                <p className="font-bold text-slate-600">{item.label}</p>
                                                <p className="text-slate-500 bg-slate-50 rounded p-2 leading-relaxed mt-0.5">{item.val}</p>
                                            </div>
                                        ))}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            handleApplyWorkTypeExample('VIDEO_EVAL');
                                            setShowVideoExamplePanel(false);
                                        }}
                                        className="w-full py-3 bg-rose-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-rose-700 shadow-md shadow-rose-100 min-h-[44px]"
                                    >
                                        <CheckCircle2 size={14}/> 이 예시로 채점 폼 채우기
                                    </button>
                                    <p className="text-[10px] text-rose-500 text-center">채운 내용은 아래 채점 폼에서 수정 가능합니다.</p>
                                </div>
                            )}
                            
                            {/* AI Analysis Results (After Analysis) */}
                            {videoAnalysis && (
                                <div className="mt-4 bg-indigo-50 border border-indigo-100 rounded-xl p-4 animate-fade-in">
                                    <div className="flex justify-between items-center mb-3 border-b border-indigo-100 pb-2">
                                        <span className="text-sm font-black text-indigo-800 flex items-center gap-2">
                                            <Sparkles size={14}/> {videoAnalysis.verificationStatus === 'VERIFIED' ? '검증된 영상 분석' : '수기 채점 결과'} (수정 가능)
                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${videoAnalysis.verificationStatus === 'VERIFIED' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                                                {videoAnalysis.verificationStatus === 'VERIFIED' ? '영상 근거 확인' : 'AI 분석 아님'}
                                            </span>
                                            {(videoAnalysis.rubric?.deductions || []).some((item) => {
                                                const text = String(item || '');
                                                return text.includes('종합 평가문안 자동검사 경고') || text.includes('나열형 평가문안 자동 보정');
                                            }) && (
                                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700">
                                                    문안 보정 적용
                                                </span>
                                            )}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-indigo-400">종합 점수</span>
                                            <span className="bg-indigo-600 text-white px-3 py-1 rounded-lg text-lg font-black shadow-md shadow-indigo-200">{videoAnalysis.score}</span>
                                        </div>
                                    </div>
                                    
                                    {videoAnalysis.verificationStatus === 'VERIFIED' && videoAnalysis.videoEvidence && (
                                        <div className="mb-4 rounded-xl border border-emerald-200 bg-white p-3 space-y-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-xs font-black text-emerald-800 flex items-center gap-1.5"><Eye size={13}/> 영상 직접 관찰 근거</p>
                                                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5">
                                                    전체 {Math.round(videoAnalysis.videoEvidence.analyzedDurationSec || 0)}초 검증
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                                                <div>
                                                    <p className="font-black text-slate-600 mb-1">화면에서 확인</p>
                                                    <ul className="space-y-1 text-slate-700">
                                                        {videoAnalysis.videoEvidence.visualObservations.map((item, index) => <li key={`visual-${index}`} className="bg-emerald-50 rounded px-2 py-1">{item}</li>)}
                                                    </ul>
                                                </div>
                                                <div>
                                                    <p className="font-black text-slate-600 mb-1">음성에서 확인</p>
                                                    {videoAnalysis.videoEvidence.audioObservations.length > 0 ? (
                                                        <ul className="space-y-1 text-slate-700">
                                                            {videoAnalysis.videoEvidence.audioObservations.map((item, index) => <li key={`audio-${index}`} className="bg-sky-50 rounded px-2 py-1">{item}</li>)}
                                                        </ul>
                                                    ) : <p className="rounded bg-slate-50 px-2 py-1 text-slate-500">확인 가능한 음성 근거 없음</p>}
                                                </div>
                                            </div>
                                            {videoAnalysis.videoEvidence.limitations.length > 0 && (
                                                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">
                                                    분석 한계: {videoAnalysis.videoEvidence.limitations.join(' / ')}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* [UPDATED] Score Gauges (Sliders with Colors) */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 bg-white p-3 rounded-xl border border-indigo-100">
                                        {[
                                            { key: 'logQuality', label: '일지 충실도', max: 30, icon: <FileText size={12}/>, color: 'accent-indigo-600', text: 'text-indigo-600' },
                                            { key: 'focus', label: '작업자 집중도', max: 30, icon: <Eye size={12}/>, color: 'accent-emerald-600', text: 'text-emerald-600' },
                                            { key: 'voice', label: '전파 명확성', max: 20, icon: <Mic size={12}/>, color: 'accent-amber-500', text: 'text-amber-600' },
                                            { key: 'ppe', label: '보호구 상태', max: 20, icon: <Shield size={12}/>, color: 'accent-rose-500', text: 'text-rose-600' }
                                        ].map((item) => (
                                            <div key={item.key} className="space-y-1">
                                                <div className={`flex justify-between text-[10px] font-bold ${item.text}`}>
                                                    <span className="flex items-center gap-1">{item.icon} {item.label}</span>
                                                    <span>{videoAnalysis.rubric?.[item.key as keyof ScoreRubric] || 0} / {item.max}</span>
                                                </div>
                                                <input 
                                                    type="range" 
                                                    min="0" 
                                                    max={item.max} 
                                                    value={videoAnalysis.rubric?.[item.key as keyof ScoreRubric] || 0}
                                                    onChange={(e) => handleRubricChange(item.key as keyof ScoreRubric, parseInt(e.target.value))}
                                                    className={`w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer ${item.color}`}
                                                />
                                            </div>
                                        ))}
                                    </div>

                                    {/* [NEW] Leader's Action Card (Coaching) */}
                                    {videoAnalysis.leaderCoaching && (
                                        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white p-4 rounded-xl mb-4 shadow-lg shadow-indigo-200">
                                            <div className="flex items-center gap-2 mb-2 border-b border-white/20 pb-2">
                                                <Award size={16} className="text-yellow-300"/>
                                                <span className="text-xs font-black uppercase tracking-wider">현장 리더 실천 카드</span>
                                            </div>
                                            <p className="text-sm font-bold leading-relaxed mb-2">
                                                "{videoAnalysis.leaderCoaching.actionItem}"
                                            </p>
                                            <p className="text-[10px] bg-white/10 px-2 py-1 rounded inline-block text-indigo-100">
                                                💡 배경: {videoAnalysis.leaderCoaching.rationale}
                                            </p>
                                        </div>
                                    )}

                                    <div className="space-y-3">
                                        {/* Editable Evaluation Fields */}
                                        {[
                                            { key: 'evalLog',        label: '일지 작성 평가',       icon: <FileText size={12}/>, num: '①' },
                                            { key: 'evalAttendance', label: '참석 및 참여도 평가',   icon: <Users size={12}/>,    num: '②' },
                                            { key: 'evalFocus',      label: '작업자 집중도 평가',   icon: <Eye size={12}/>,      num: '③' },
                                            { key: 'evalLeader',     label: '주관자(팀장) 리딩 평가', icon: <Mic size={12}/>,    num: '④' },
                                        ].map((field) => (
                                            <div key={field.key} className="space-y-1">
                                                <label className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5">
                                                    <span className="text-indigo-600 font-black">{field.num}</span>
                                                    {field.icon} {field.label}
                                                </label>
                                                <div className="relative group">
                                                    <textarea 
                                                        value={(videoAnalysis as any)[field.key] || ''}
                                                        onChange={(e) => handleAnalysisChange(field.key as any, e.target.value)}
                                                        className="w-full text-xs font-medium text-slate-700 bg-white border border-indigo-100 rounded-lg p-2 focus:ring-2 focus:ring-indigo-300 outline-none resize-y min-h-[64px] shadow-sm transition-all"
                                                    />
                                                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                                                        <Edit3 size={12} className="text-slate-400"/>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        
                                        <div className="pt-2 border-t border-indigo-100">
                                            <label className="text-[10px] font-bold text-slate-500 mb-1 flex items-center gap-1">
                                                <UserCheck size={12}/> 종합 의견
                                            </label>
                                            <textarea 
                                                value={videoAnalysis.evaluation}
                                                onChange={(e) => handleAnalysisChange('evaluation', e.target.value)}
                                                className="w-full text-xs font-bold text-slate-800 bg-white border border-indigo-200 rounded-lg p-2 focus:ring-2 focus:ring-indigo-300 outline-none resize-none h-24 shadow-sm leading-relaxed"
                                                placeholder="건설안전기술사의 종합 소견이 입력됩니다."
                                            />
                                            {(() => {
                                                const autoEvalWarnings = (videoAnalysis.rubric?.deductions || []).filter((item) => {
                                                    const text = String(item || '');
                                                    return text.includes('종합 평가문안 자동검사 경고') || text.includes('나열형 평가문안 자동 보정');
                                                });
                                                if (autoEvalWarnings.length === 0) return null;
                                                const warningSummary = Array.from(new Set(autoEvalWarnings.map((item) => {
                                                    const raw = String(item || '');
                                                    const cleaned = raw.replace(/^종합 평가문안 자동검사 경고:\s*/, '').trim();
                                                    if (raw.includes('나열형 평가문안 자동 보정') || cleaned.includes('나열형 패턴 포함')) {
                                                        return '항목 나열형 문장 패턴 보정 적용';
                                                    }
                                                    if (cleaned.includes('분량 부족')) {
                                                        return '종합 의견 길이 보완 필요';
                                                    }
                                                    if (cleaned.includes('종합판정: 누락')) {
                                                        return '종합판정 문구 보완 필요';
                                                    }
                                                    if (cleaned.includes('확인검증: 누락')) {
                                                        return '확인검증 문구 보완 필요';
                                                    }
                                                    if (cleaned.includes('다음 계획: 누락')) {
                                                        return '다음 계획 문구 보완 필요';
                                                    }
                                                    return cleaned;
                                                }))).join(' / ');
                                                return (
                                                    <p className="mt-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                                                        보정 사유: {warningSummary}
                                                    </p>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                    </div>
                </div>

                {/* RIGHT: Form Data (Scrollable) */}
                <div className={`w-full xl:w-1/2 h-auto xl:h-full overflow-y-auto bg-white custom-scrollbar ${mobileSection === 'FORM' ? 'block' : 'hidden'} xl:block`}>
                    <div className="p-4 bg-slate-50 border-b border-slate-200 sticky top-0 z-10 flex items-center gap-2">
                        <FileText size={18} className="text-slate-500"/>
                        <h3 className="font-black text-slate-700">입력 데이터</h3>
                    </div>
                    
                    <div className="p-6 md:p-8 space-y-8 max-w-2xl mx-auto">
                        {activePageInfo && (
                            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3">
                                <p className="text-xs font-black text-indigo-700">현재 다중페이지 일지</p>
                                <p className="text-sm font-black text-indigo-900 mt-1">{activePageInfo.current} / {activePageInfo.total} 페이지</p>
                            </div>
                        )}

                        <div className={`rounded-2xl border p-4 ${linkedRiskAssessmentSummary ? 'border-indigo-200 bg-indigo-50' : 'border-amber-200 bg-amber-50'}`}>
                            <div className="flex items-start gap-3">
                                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${linkedRiskAssessmentSummary ? 'bg-indigo-600 text-white' : 'bg-amber-500 text-white'}`}>
                                    <Shield size={18}/>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                        <span className="text-xs font-black text-slate-800">위험성평가 연계 상태</span>
                                        <span className={`text-[10px] font-black px-2 py-1 rounded-full ${linkedRiskAssessmentSummary ? 'bg-indigo-600 text-white' : 'bg-amber-500 text-white'}`}>
                                            {linkedRiskAssessmentSummary ? '연계중' : '미연계'}
                                        </span>
                                    </div>
                                    {linkedRiskAssessmentSummary ? (
                                        <>
                                            <p className="text-sm font-bold text-slate-800 leading-snug">{linkedRiskAssessmentSummary.label}</p>
                                            <p className="text-xs text-slate-500 truncate mt-1">{linkedRiskAssessmentSummary.fileName}</p>
                                            <div className="mt-3 grid grid-cols-3 gap-2">
                                                <div className="rounded-xl bg-white/80 border border-indigo-100 px-3 py-2">
                                                    <p className="text-[10px] font-bold text-slate-400">연계 항목</p>
                                                    <p className="text-sm font-black text-slate-800">{linkedRiskAssessmentSummary.total}건</p>
                                                </div>
                                                <div className="rounded-xl bg-white/80 border border-red-100 px-3 py-2">
                                                    <p className="text-[10px] font-bold text-slate-400">상위험</p>
                                                    <p className="text-sm font-black text-red-600">{linkedRiskAssessmentSummary.high}건</p>
                                                </div>
                                                <div className="rounded-xl bg-white/80 border border-emerald-100 px-3 py-2">
                                                    <p className="text-[10px] font-bold text-slate-400">조치메모</p>
                                                    <p className="text-sm font-black text-emerald-600">{linkedRiskAssessmentSummary.actionNotes}건</p>
                                                </div>
                                            </div>
                                            <p className="mt-3 inline-flex items-center rounded-full px-3 py-1 text-[10px] font-black bg-emerald-600 text-white">
                                                최신 위험성평가 연계 완료 ({linkedRiskAssessmentSummary.label})
                                            </p>
                                            <p className="mt-3 text-[11px] text-slate-600 leading-relaxed">
                                                수기 일지 OCR, 안전 코멘트 생성, 동영상 평가 시 현재 연계된 위험성평가 항목이 함께 사용됩니다.
                                            </p>
                                        </>
                                    ) : (
                                        <p className="text-xs text-amber-800 leading-relaxed">
                                            현재 연계된 위험성평가가 없습니다. 위험성평가 관리에서 OCR 분석/등록 후 TBM 등록 OCR 정확도를 높일 수 있습니다.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {linkedRiskAssessmentSummary && teamFocusedLinkedRiskSuggestions.length > 0 && (
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                                    <div>
                                        <p className="text-sm font-black text-emerald-900">연계 위험성평가 빠른 가져오기</p>
                                        <p className="text-[11px] text-emerald-800 mt-1">{selectedTeams.length > 0 ? `${selectedTeamLabel} 기준 우선 추천 · ` : ''}상위위험 및 즉시조치 메모를 TBM 위험요인/대책 초안으로 즉시 반영합니다.</p>
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <button
                                            type="button"
                                            onClick={handleImportAllLinkedGuidelines}
                                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white px-4 py-3 text-xs font-black min-h-[44px] shadow-md shadow-emerald-200"
                                        >
                                            <Plus size={14}/> 추천 {teamFocusedLinkedRiskSuggestions.length}건 일괄 가져오기
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleApplyActionNotesToFeedback}
                                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-xs font-black text-emerald-700 min-h-[44px]"
                                        >
                                            <UserCheck size={14}/> 조치메모 → 코멘트
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {teamFocusedLinkedRiskSuggestions.map((item, index) => (
                                        <div key={`${item.content}-${index}`} className="rounded-xl border border-emerald-100 bg-white/80 p-3">
                                            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded ${item.level === 'HIGH' ? 'bg-red-500 text-white' : 'bg-slate-200 text-slate-700'}`}>
                                                            {item.level === 'HIGH' ? '상위험' : '연계항목'}
                                                        </span>
                                                        <span className="text-[10px] font-bold text-slate-500">{item.category}</span>
                                                    </div>
                                                    <p className="text-sm font-bold text-slate-800 leading-snug">{item.content}</p>
                                                    <p className="mt-2 text-[11px] text-slate-600 leading-relaxed">대책 제안: {buildMeasureFromGuideline(item)}</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleImportLinkedGuideline(item)}
                                                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 min-h-[44px] whitespace-nowrap"
                                                >
                                                    <ChevronRight size={14}/> 가져오기
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Form Fields */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500">작업 일자</label>
                                <input type="date" value={entryDate} onChange={(e) => handleDateChange(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"/>
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-slate-500">시작 시간 및 TBM 세션</label>
                                    <span className="text-[10px] font-bold text-slate-400">
                                        {sessionType === 'AFTERNOON' ? '🌤️ 오후 세션' : sessionType === 'SPECIAL' ? '🛡️ 수시 점검' : '☀️ 오전 세션'}
                                    </span>
                                </div>
                                <input type="time" value={entryTime} onChange={(e) => handleTimeChange(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"/>
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => handleSessionTypeChange('MORNING')}
                                        className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${sessionType === 'MORNING' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                                    >
                                        ☀️ 오전 TBM
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleSessionTypeChange('AFTERNOON')}
                                        className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${sessionType === 'AFTERNOON' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                                    >
                                        🌤️ 오후 TBM (사진/서면)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleSessionTypeChange('SPECIAL')}
                                        className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${sessionType === 'SPECIAL' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                                    >
                                        🛡️ 수시 점검
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-1 col-span-2">
                                <label className="text-xs font-bold text-slate-500">작업 팀 선택</label>
                                <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 space-y-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] font-bold text-slate-500">복수 선택 후 팀별 일괄 항목을 만들 수 있습니다.</span>
                                        <button type="button" onClick={handleSelectAllTeams} className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-[10px] font-black text-indigo-700">
                                            {selectedTeamIds.length === teams.length ? '전체 해제' : '전체 선택'}
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-1">
                                        {teams.map(t => {
                                            const checked = selectedTeamIds.includes(t.id);
                                            return (
                                                <label key={t.id} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold min-h-[44px] cursor-pointer transition-colors ${checked ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => handleTeamToggle(t.id)}
                                                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                    <span>{t.name}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                    <p className="text-[11px] font-semibold text-slate-500">선택된 팀: <span className="text-slate-700">{selectedTeamLabel}</span></p>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500">팀장명</label>
                                <input type="text" placeholder="이름" value={leaderName} onChange={(e) => handleLeaderChange(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"/>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500">참석 인원</label>
                                <div className="relative">
                                    <input type="number" placeholder="0" value={attendeesCount} onChange={(e) => handleCountChange(parseInt(e.target.value)||0)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"/>
                                    <span className="absolute right-4 top-3 text-sm font-bold text-slate-400">명</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500">금일 작업 내용</label>
                            <textarea value={workDescription} onChange={(e) => handleWorkChange(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none resize-none h-32 focus:ring-2 focus:ring-indigo-500 transition-shadow" placeholder={sessionType === 'AFTERNOON' ? "오전과 동일함 (특이 작업 내용 변경 시 수정)" : "구체적인 작업 내용을 입력하거나, 좌측 '수기 일지 자동 추출' 버튼을 사용하세요."}/>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <button
                                type="button"
                                onClick={() => setShowOptionalFields(prev => !prev)}
                                className="w-full flex items-center justify-between text-left"
                                aria-expanded={showOptionalFields}
                                aria-controls="tbm-optional-fields-panel"
                            >
                                <div>
                                    <p className="text-sm font-black text-slate-700">숨김 항목 (선택 입력)</p>
                                    <p className="text-[11px] text-slate-500 mt-1">작성하지 않아도 되는 항목입니다. 필요 시 열어서 입력하세요.</p>
                                </div>
                                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-600">
                                    {showOptionalFields ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                                </span>
                            </button>

                            {showOptionalFields && (
                                <div id="tbm-optional-fields-panel" className="mt-4 space-y-4">
                                    <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 space-y-3">
                                        <div>
                                            <p className="text-sm font-black text-sky-900">작업 위치</p>
                                            <p className="text-[11px] text-sky-800 mt-1">전체동 표기와 주차장·외부계단 같은 모호한 위치를 모두 직접 입력할 수 있습니다.</p>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-slate-500">동/구역</label>
                                                <input
                                                    list="tbm-location-building-suggestions"
                                                    value={locationBuildingScope}
                                                    onChange={(e) => handleLocationBuildingScopeChange(e.target.value)}
                                                    placeholder="예: 101동, 전체동, 부대시설"
                                                    className="w-full bg-white border border-sky-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-500 transition-shadow"
                                                />
                                                <datalist id="tbm-location-building-suggestions">
                                                    {LOCATION_BUILDING_SUGGESTIONS.map(option => <option key={option} value={option} />)}
                                                </datalist>
                                                <div className="mt-2 flex flex-wrap gap-1.5">
                                                    {LOCATION_BUILDING_SUGGESTIONS.map(option => (
                                                        <button
                                                            key={option}
                                                            type="button"
                                                            onClick={() => handleLocationBuildingScopeChange(option)}
                                                            className={`px-2 py-1 rounded-full text-[10px] font-black border transition-colors ${locationBuildingScope === option ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-sky-700 border-sky-200 hover:bg-sky-50'}`}
                                                        >
                                                            {option}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-slate-500">위치 유형</label>
                                                <input
                                                    list="tbm-location-area-suggestions"
                                                    value={locationArea}
                                                    onChange={(e) => handleLocationAreaChange(e.target.value)}
                                                    placeholder="예: 지하주차장, 외부계단, 옥상"
                                                    className="w-full bg-white border border-sky-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-500 transition-shadow"
                                                />
                                                <datalist id="tbm-location-area-suggestions">
                                                    {LOCATION_AREA_SUGGESTIONS.map(option => <option key={option} value={option} />)}
                                                </datalist>
                                                <div className="mt-2 flex flex-wrap gap-1.5">
                                                    {LOCATION_AREA_SUGGESTIONS.map(option => (
                                                        <button
                                                            key={option}
                                                            type="button"
                                                            onClick={() => handleLocationAreaChange(option)}
                                                            className={`px-2 py-1 rounded-full text-[10px] font-black border transition-colors ${locationArea === option ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-sky-700 border-sky-200 hover:bg-sky-50'}`}
                                                        >
                                                            {option}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-slate-500">상세 위치</label>
                                            <input
                                                type="text"
                                                value={locationDetail}
                                                onChange={(e) => handleLocationDetailChange(e.target.value)}
                                                placeholder="예: B2 서측 램프 앞, 2호 외부계단 3~5층, 남측 출입구 앞"
                                                className="w-full bg-white border border-sky-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-500 transition-shadow"
                                            />
                                        </div>
                                        <div className="rounded-xl border border-sky-100 bg-white px-3 py-2">
                                            <p className="text-[10px] font-black text-sky-600 mb-1">위치 미리보기</p>
                                            <p className="text-xs font-bold text-slate-700 leading-relaxed">{formatLocationSummary(locationBuildingScope, locationArea, locationDetail) || '위치를 입력하면 여기에 표시됩니다.'}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-slate-500">금일 설치한 사항</label>
                                            <textarea
                                                value={todayInstalledItems}
                                                onChange={(e) => handleTodayInstalledItemsChange(e.target.value)}
                                                className="w-full bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm outline-none resize-none h-24 focus:ring-2 focus:ring-amber-500 transition-shadow"
                                                placeholder="예: 안전난간 설치, 접근금지선 설치, 방호덮개 설치 등"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-slate-500">관리자가 추가로 설치해야 할 항목</label>
                                            <textarea
                                                value={managerRequiredInstallItems}
                                                onChange={(e) => handleManagerRequiredInstallItemsChange(e.target.value)}
                                                className="w-full bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 text-sm outline-none resize-none h-24 focus:ring-2 focus:ring-violet-500 transition-shadow"
                                                placeholder="예: 추가 안전휀스, 추가 조명, 추가 보호난간, 추가 표지판 등"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <hr className="border-slate-100"/>

                        {/* Risk Factors */}
                        <div className="space-y-3">
                             <div className="flex justify-between items-center">
                                <label className="text-sm font-black text-slate-700 flex items-center gap-2"><AlertCircle size={18} className="text-amber-500"/> 위험 요인 및 대책</label>
                                <button onClick={addRiskFactor} className="text-xs text-blue-600 font-bold flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"><Plus size={14}/> 항목 추가</button>
                             </div>
                             <div className="space-y-2">
                                 {riskFactors.map((r, i) => (
                                     <div key={i} className="flex gap-2 items-start group">
                                         <div className="grid grid-cols-1 gap-2 flex-1">
                                             <div className="flex gap-2">
                                                 <span className="bg-red-100 text-red-600 text-[10px] font-bold px-1.5 py-1 rounded shrink-0 flex items-center">위험</span>
                                                 <input value={r.risk} onChange={(e)=>handleRiskChange(i,'risk',e.target.value)} placeholder="위험 요인 입력" className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold outline-none flex-1 focus:bg-white focus:border-indigo-300 transition-colors"/>
                                             </div>
                                             <div className="flex gap-2">
                                                 <span className="bg-blue-100 text-blue-600 text-[10px] font-bold px-1.5 py-1 rounded shrink-0 flex items-center">대책</span>
                                                 <input value={r.measure} onChange={(e)=>handleRiskChange(i,'measure',e.target.value)} placeholder="안전 대책 입력" className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600 outline-none flex-1 focus:bg-white focus:border-indigo-300 transition-colors"/>
                                             </div>
                                         </div>
                                         <button onClick={() => removeRiskFactor(i)} aria-label={`${i + 1}번 위험요인 항목 삭제`} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors mt-2"><X size={16}/></button>
                                     </div>
                                 ))}
                                 {riskFactors.length === 0 && (
                                     <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs">
                                         등록된 위험 요인이 없습니다. (수기 일지 추출을 권장합니다)
                                     </div>
                                 )}
                             </div>
                        </div>

                        {/* Feedback */}
                        <div className="space-y-3">
                            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 space-y-3">
                                <button type="button" onClick={() => setShowBulkManualPanel(value => !value)} className="w-full flex items-center justify-between gap-3 text-left">
                                    <span>
                                        <span className="block text-sm font-black text-violet-900">수기 평가 보기글 · 다수 팀 일괄 적용</span>
                                        <span className="mt-1 block text-[11px] text-violet-700">무료 API 한도 또는 영상 품질 부족 시 공종·등급별 문구를 선택해 적용합니다.</span>
                                    </span>
                                    {showBulkManualPanel ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
                                </button>
                                {showBulkManualPanel && (
                                    <div className="space-y-3 border-t border-violet-200 pt-3">
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                            <label className="text-[10px] font-black text-slate-600">
                                                공종
                                                <select value={videoExampleWorkTypeIndex} onChange={(event) => setVideoExampleWorkTypeIndex(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-xs font-bold">
                                                    {WORK_TYPE_EXAMPLES.map((example, index) => <option key={example.type} value={index}>{example.type}</option>)}
                                                </select>
                                            </label>
                                            <label className="text-[10px] font-black text-slate-600">
                                                평가 등급
                                                <select value={manualEvaluationLevel} onChange={(event) => setManualEvaluationLevel(event.target.value as ManualEvaluationLevel)} className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-xs font-bold">
                                                    {MANUAL_EVALUATION_LEVELS.map(level => <option key={level.value} value={level.value}>{level.label}</option>)}
                                                </select>
                                            </label>
                                            <label className="text-[10px] font-black text-slate-600">
                                                코멘트 적용
                                                <select value={manualApplyMode} onChange={(event) => setManualApplyMode(event.target.value as typeof manualApplyMode)} className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-xs font-bold">
                                                    <option value="APPEND">기존 문구 뒤에 추가</option>
                                                    <option value="REPLACE">기존 문구 교체</option>
                                                    <option value="EMPTY_ONLY">빈 항목에만 적용</option>
                                                </select>
                                            </label>
                                        </div>
                                        <div className="rounded-xl border border-violet-100 bg-white p-3 text-[11px] text-slate-700">
                                            <p className="font-black text-violet-800 mb-1">적용 미리보기</p>
                                            <p>{buildManualEvaluation(manualEvaluationLevel, WORK_TYPE_EXAMPLES[videoExampleWorkTypeIndex]?.type || '공통').evaluation}</p>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <button type="button" onClick={() => handleApplyManualTemplate(false)} className="rounded-xl border border-violet-300 bg-white px-4 py-3 text-xs font-black text-violet-700">현재 항목에 적용</button>
                                            <button type="button" onClick={() => handleApplyManualTemplate(true)} className="rounded-xl bg-violet-700 px-4 py-3 text-xs font-black text-white shadow-md">선택 {selectedTeamIds.length}개 팀별 일괄 적용</button>
                                        </div>
                                        <p className="text-[10px] text-violet-700">일괄 적용 시 선택한 팀마다 별도 TBM 항목이 생성되며 이후 팀별 수정이 가능합니다.</p>
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-between items-center">
                                <label className="text-sm font-black text-slate-700 flex items-center gap-2"><UserCheck size={18} className="text-emerald-600"/> 안전관리자 코멘트</label>
                                <button 
                                    onClick={handleTextGapAnalysis}
                                    disabled={isFeedbackGenerating || !workDescription}
                                    className="text-[10px] bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg font-bold hover:bg-emerald-100 disabled:opacity-50 flex items-center gap-1 transition-colors"
                                >
                                    {isFeedbackGenerating ? <Loader2 size={14} className="animate-spin"/> : <BrainCircuit size={14}/>} AI 추천 생성
                                </button>
                            </div>
                            
                            <div className="space-y-2">
                                {safetyFeedback.map((fb, idx) => (
                                    <div key={idx} className="flex items-start gap-2 bg-white p-3 rounded-xl border border-emerald-100 shadow-sm group hover:border-emerald-300 transition-colors">
                                        {editingFeedbackIndex === idx ? (
                                            <div className="flex-1 flex gap-2">
                                                <input value={tempFeedbackText} onChange={(e) => setTempFeedbackText(e.target.value)} className="flex-1 text-xs border rounded px-2 py-1 outline-none focus:ring-2 focus:ring-emerald-500"/>
                                                <button type="button" onClick={handleSaveEditFeedback} className="text-emerald-600 text-xs font-bold px-2">저장</button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="mt-0.5"><CheckCircle2 size={14} className="text-emerald-500"/></div>
                                                <span className="text-xs text-slate-700 flex-1 leading-snug font-medium">{fb}</span>
                                                <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                                                    <button type="button" onClick={() => handleStartEditFeedback(idx)} aria-label={`코멘트 ${idx + 1} 수정`} className="text-slate-400 hover:text-blue-500 p-1"><FileText size={14}/></button>
                                                    <button type="button" onClick={() => handleDeleteFeedback(idx)} aria-label={`코멘트 ${idx + 1} 삭제`} className="text-slate-400 hover:text-red-500 p-1"><X size={14}/></button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                                <div className="flex gap-2 mt-2">
                                    <input 
                                        value={newFeedbackInput}
                                        onChange={(e) => setNewFeedbackInput(e.target.value)}
                                        placeholder="코멘트 직접 입력..."
                                        className="flex-1 text-xs border border-emerald-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500 bg-white shadow-sm"
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddFeedback()}
                                    />
                                    <button onClick={handleAddFeedback} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-md shadow-emerald-100">추가</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 md:hidden z-[10000] border-t border-slate-200 bg-white/95 backdrop-blur px-3 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
            <div className="flex items-center gap-2">
                <button onClick={onCancel} className="px-3 py-3 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold min-h-[48px] whitespace-nowrap">
                    나가기
                </button>
                <div className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-slate-100">
                    <p className="text-[10px] font-bold text-slate-500">현재 입력</p>
                    <p className="text-xs font-black text-slate-800 truncate">{selectedTeamLabel} · {leaderName || '팀장 미입력'}</p>
                </div>
                <button onClick={handleAddRegistration} className="px-3 py-3 rounded-xl border border-indigo-200 text-indigo-700 text-xs font-bold min-h-[48px] whitespace-nowrap bg-white">
                    페이지 추가
                </button>
                <button onClick={handleSaveAll} className="px-4 py-3 rounded-xl bg-slate-900 text-white text-xs font-black min-h-[48px] whitespace-nowrap shadow-lg">
                    {queue.length > 1 ? `전체 저장 ${queue.length}건` : '작성 완료'}
                </button>
            </div>
        </div>
    </div>,
    document.body
  );
};
