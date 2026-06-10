
import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Rocket, Shield, BrainCircuit, LayoutDashboard, FileText, Video, Sparkles, History, GitCommit, Zap, Minimize2, Edit2, ListOrdered, Save, FileVideo, Presentation, CalendarRange, FolderInput, GraduationCap, Lock, Database, Compass, TrendingUp, Grid, Layers, Monitor, HardDrive } from 'lucide-react';
import { AppActivityLog } from '../types';

interface HistoryModalProps {
  onClose: () => void;
  recentActivities?: AppActivityLog[];
}

const milestones = [
  {
    version: 'v4.0.1',
    date: '2026.01.13',
    title: '레거시 데이터 복구 프로토콜',
    desc: '이전 버전에서 생성된 모든 형식의 JSON 백업 파일을 인식할 수 있도록 복구 엔진을 고도화했습니다. 데이터 구조를 심층 스캔하여 TBM 일지, 위험성평가, 팀 정보를 자동으로 분류하고 복원합니다.',
    icon: <HardDrive size={18} />,
    color: 'bg-emerald-600'
  },
  {
    version: 'v4.0.0',
    date: '2026.01.13',
    title: '현장 통합 관제 센터 런칭',
    desc: '기존의 관리자 페이지를 건설 현장 실무에 최적화된 "통합 관제 센터"로 전면 개편했습니다. 실시간 현장 시계(KST)와 한국형 기상 관측 위젯을 탑재하고, 직관적인 대형 버튼과 KPI 지표를 통해 현장 상황을 한눈에 파악할 수 있도록 UX를 혁신했습니다.',
    icon: <Monitor size={18} />,
    color: 'bg-slate-900'
  },
  {
    version: 'v3.2.0',
    date: '2026.01.02',
    title: '대시보드 3.0: 커맨드 센터 리디자인',
    desc: '사용자 경험을 극대화하기 위해 최신 벤토 그리드 시스템을 전면 도입했습니다. 황금비율 레이아웃과 유리 질감 디자인을 적용해 정보 가독성과 심미성을 동시에 확보하고, 날씨 위젯을 대화형으로 고도화해 현장 환경 대응력을 강화했습니다.',
    icon: <Grid size={18} />,
    color: 'bg-violet-600'
  },
  {
    version: 'v3.0.0',
    date: '2026.01.01',
    title: '안전 철학의 구현',
    desc: 'AI 페르소나를 "평가자"에서 "안전 멘토"로 재정의했습니다. 작성 전 중점 위험을 주지시키는 "안전 나침반" 위젯과 현장 상향평준화 과정을 시각화한 "안전 문화 지수"를 도입해 무재해 목표를 시스템에 반영했습니다.',
    icon: <Compass size={18} />,
    color: 'bg-rose-600'
  },
  {
    version: 'v2.8.0',
    date: '2025.12.11',
    title: '빅데이터 정량 추출 엔진 탑재',
    desc: '수천 장의 종합 일지를 처리할 수 있는 빅데이터 추출 전용 모드 추가. 이미지 저장 없이 정량 데이터만 추출하여 브라우저 용량 한계를 극복하고 연구용 DB를 구축.',
    icon: <Database size={18} />,
    color: 'bg-indigo-800'
  },
  {
    version: 'v2.7.5',
    date: '2025.12.10',
    title: '시스템 무결성 및 디자인 혁신',
    desc: '브라우저 저장소 한계 극복을 위한 지능형 데이터 압축 및 우회 저장 기술을 탑재했습니다. "콘크리트 & 글래스" 디자인 철학을 적용해 건축적 미학이 돋보이는 UI로 전면 개편했습니다.',
    icon: <Lock size={18} />,
    color: 'bg-slate-800'
  },
  {
    version: 'v2.7.3',
    date: '2025.12.09',
    title: '연구용 데이터 패키지',
    desc: '학술 논문 및 빅데이터 분석을 위해 [서론-본론-결론] 구조의 정제된 데이터셋을 추출하는 기능 추가. 통계 분석에 즉시 활용 가능한 CSV 및 분석 리포트 제공.',
    icon: <GraduationCap size={18} />,
    color: 'bg-indigo-700'
  },
  {
    version: 'v2.7.2',
    date: '2025.12.09',
    title: '대량 문서 처리 모드',
    desc: '대량의 과거 데이터를 효율적으로 등록할 수 있도록 일괄 업로드 UX를 개선했습니다. 대시보드 바로가기 버튼과 상세 이용 가이드를 탑재했습니다.',
    icon: <FolderInput size={18} />,
    color: 'bg-blue-600'
  },
  {
    version: 'v2.7.1',
    date: '2025.12.09',
    title: '성과 분석 리포트 고도화',
    desc: '성과 분석 기능을 주간, 월간, 분기, 연간으로 세분화. 선택한 기간에 따라 실시간으로 데이터를 집계하고 맞춤형 평가 코멘트를 제공하는 알고리즘 적용.',
    icon: <CalendarRange size={18} />,
    color: 'bg-indigo-600'
  },
  {
    version: 'v2.7.0',
    date: '2025.12.09',
    title: '스마트 TBM 성과 분석 리포트',
    desc: '단순 기록을 넘어 안전 성과를 정량적으로 증명하는 성과 분석 보고서 기능을 추가했습니다. TBM 품질 점수, 위험 발굴 건수, 사각지대 제거율을 그래프로 시각화해 시스템 도입 효과를 입증합니다.',
    icon: <Presentation size={18} />,
    color: 'bg-emerald-600'
  },
  {
    version: 'v2.6.6',
    date: '2025.12.08',
    title: '보고서 증빙 표기 개선',
    desc: '보고서 출력 시 동영상 포함 여부를 명확히 식별하도록 UI 개선. 영상 파일명과 상태 아이콘을 상세하게 표시하여 증빙 신뢰도 향상.',
    icon: <FileVideo size={18} />,
    color: 'bg-red-500'
  },
  {
    version: 'v2.6.5',
    date: '2025.12.08',
    title: '오디오 엔진 및 AI 편향 수정',
    desc: '음성 인식 실패 해결을 위한 Web Audio API 라우팅을 적용했습니다. AI 분석 시 산만함 과대 평가를 방지하기 위한 긍정 우선 로직을 도입했습니다.',
    icon: <Zap size={18} />,
    color: 'bg-yellow-500'
  },
  {
    version: 'v2.6.2',
    date: '2025.12.08',
    title: '위험성평가 데이터 백업/복구',
    desc: '업데이트 및 초기화에 대비해 위험성평가 관리 데이터를 JSON 파일로 백업하고 즉시 복구할 수 있는 기능 추가.',
    icon: <Save size={18} />,
    color: 'bg-emerald-500'
  },
  {
    version: 'v2.6.1',
    date: '2025.12.08',
    title: '팀 데이터 동기화 및 목록 확장',
    desc: '11개 이상의 팀 등록 시 목록에서 누락되는 현상 수정. 대시보드 표시 개수 확장(10→30개) 및 팀 데이터 자동 동기화 로직 적용.',
    icon: <ListOrdered size={18} />,
    color: 'bg-cyan-500'
  },
  {
    version: 'v2.6.0',
    date: '2025.12.08',
    title: '사용자 편의성 대폭 개선 (검색/수정)',
    desc: '위험성평가 항목 검색 및 오타 수정 기능 탑재. TBM 안전 피드백 문구 직접 편집 기능 추가로 현장 대응력 강화.',
    icon: <Edit2 size={18} />,
    color: 'bg-green-500'
  },
  {
    version: 'v2.5.5',
    date: '2025.12.07',
    title: '동영상 자동 압축/최적화 엔진',
    desc: '브라우저에서 고화질 영상을 480p/VP8 코덱으로 실시간 압축합니다. 100MB 이상 대용량 파일도 10MB대로 줄여 AI 분석 실패율 최소화에 집중했습니다.',
    icon: <Minimize2 size={18} />,
    color: 'bg-amber-500'
  },
  {
    version: 'v2.5.2',
    date: '2025.12.06',
    title: '시스템 안정성 강화',
    desc: '수정 모드 진입 시 데이터 초기화 문제 해결 및 대용량 동영상 처리 로직 최적화 완료.',
    icon: <GitCommit size={18} />,
    color: 'bg-rose-500'
  },
  {
    version: 'v2.5.0',
    date: '2025.12.05',
    title: '동영상 분석 엔진 고도화',
    desc: '20MB 이상 고화질 영상 자동 분할 전송 기능을 적용해 현장 네트워크 부담을 줄였습니다.',
    icon: <Video size={18} />,
    color: 'bg-violet-500'
  },
  {
    version: 'v2.4.0',
    date: '2025.12.04',
    title: 'Vision AI 품질 진단 도입',
    desc: 'Gemini 2.5 Flash 모델 탑재. TBM 활동 영상의 음성/보호구/참여도를 AI가 정량적으로 평가.',
    icon: <Sparkles size={18} />,
    color: 'bg-indigo-500'
  },
  {
    version: 'v2.2.0',
    date: '2025.12.02',
    title: '보고서 센터 & ZIP 패키징',
    desc: '법적 증빙 대응을 위한 PDF 일괄 변환 및 원본 사진 대량 다운로드 기능 구현.',
    icon: <FileText size={18} />,
    color: 'bg-blue-500'
  },
  {
    version: 'v2.0.0',
    date: '2025.11.30',
    title: '통합 대시보드',
    desc: '현장 전체 팀 활동 현황 모니터링 및 주간 통계 시각화 시스템 구축.',
    icon: <LayoutDashboard size={18} />,
    color: 'bg-emerald-500'
  },
  {
    version: 'v1.5.0',
    date: '2025.11.29',
    title: '위험성평가 OCR 연동',
    desc: '종이 문서를 촬영하면 AI가 텍스트를 인식하여 디지털 데이터로 자동 변환.',
    icon: <BrainCircuit size={18} />,
    color: 'bg-orange-500'
  },
  {
    version: 'v1.0.0',
    date: '2025.11.28',
    title: '스마트 TBM 시스템 런칭',
    desc: '용인 푸르지오 원클러스터 현장 전용 안전 관리 시스템 최초 가동.',
    icon: <Rocket size={18} />,
    color: 'bg-slate-800'
  }
];

const formatActivityTime = (timestamp: number) => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}.${month}.${day} ${hour}:${minute}`;
};

const getActivityBadge = (message: string) => {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes('삭제') || normalizedMessage.includes('제거')) {
    return { label: '삭제', className: 'bg-rose-50 text-rose-700 border-rose-200' };
  }
  if (normalizedMessage.includes('복구') || normalizedMessage.includes('백업') || normalizedMessage.includes('restore')) {
    return { label: '복구/백업', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  if (normalizedMessage.includes('정규화') || normalizedMessage.includes('요청') || normalizedMessage.includes('승인') || normalizedMessage.includes('반려')) {
    return { label: '정규화', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
  }
  if (normalizedMessage.includes('저장') || normalizedMessage.includes('등록') || normalizedMessage.includes('적용')) {
    return { label: '저장', className: 'bg-blue-50 text-blue-700 border-blue-200' };
  }
  return { label: '시스템', className: 'bg-slate-100 text-slate-700 border-slate-200' };
};

export const HistoryModal: React.FC<HistoryModalProps> = ({ onClose, recentActivities = [] }) => {
  const historyDialogRef = useRef<HTMLDivElement>(null);
  const historyCloseButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    previouslyFocusedElementRef.current = document.activeElement as HTMLElement | null;
    window.setTimeout(() => {
      historyCloseButtonRef.current?.focus();
    }, 0);

    const handleEscClose = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscClose);
    return () => {
      window.removeEventListener('keydown', handleEscClose);
      window.setTimeout(() => {
        previouslyFocusedElementRef.current?.focus();
      }, 0);
    };
  }, [onClose]);

  const handleHistoryDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;

    const dialogNode = historyDialogRef.current;
    if (!dialogNode) return;

    const focusableElements = dialogNode.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement as HTMLElement | null;

    if (event.shiftKey) {
      if (activeElement === firstElement || !dialogNode.contains(activeElement)) {
        event.preventDefault();
        lastElement.focus();
      }
      return;
    }

    if (activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
      <div 
        ref={historyDialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-modal-title"
        aria-describedby="history-modal-description"
        onKeyDown={handleHistoryDialogKeyDown}
        className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden animate-slide-up relative flex flex-col max-h-[85vh]" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-900 p-6 text-white shrink-0 relative overflow-hidden">
           <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
           <div className="relative z-10 flex justify-between items-start">
              <div>
                 <div className="flex items-center gap-2 mb-2 opacity-80">
                    <History size={16} />
                    <span className="text-xs font-bold uppercase tracking-widest">개발 이력</span>
                 </div>
                  <h2 id="history-modal-title" className="text-2xl font-black leading-tight">시스템<br/>진화 이력</h2>
                  <p id="history-modal-description" className="text-slate-400 text-xs font-medium mt-2">
                    단기간에 혁신적으로 진화한<br/>스마트 안전 시스템의 기록입니다.
                 </p>
              </div>
                <button ref={historyCloseButtonRef} onClick={onClose} aria-label="시스템 진화 히스토리 닫기" className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white">
                 <X size={20} />
              </button>
           </div>
        </div>

        {/* Timeline Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 custom-scrollbar">
           {recentActivities.length > 0 && (
             <div className="mb-6 bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
               <div className="flex items-center justify-between mb-3">
                 <h3 className="text-sm font-black text-indigo-900 flex items-center gap-2">
                   <History size={14}/> 최근 작업 기록 (재시작 복원)
                 </h3>
                 <span className="text-[10px] font-bold text-indigo-500">최대 8건</span>
               </div>
               <div className="space-y-2">
                 {recentActivities.slice(0, 8).map((activity) => {
                   const badge = getActivityBadge(activity.message);
                   return (
                   <div key={activity.id} className="bg-white border border-indigo-100 rounded-xl px-3 py-2">
                     <div className="flex items-center justify-between gap-2">
                       <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badge.className}`}>{badge.label}</span>
                       <p className="text-[10px] text-slate-400">{formatActivityTime(activity.timestamp)}</p>
                     </div>
                     <p className="text-[11px] font-bold text-slate-700 break-keep mt-1">{activity.message}</p>
                   </div>
                 )})}
               </div>
             </div>
           )}

           <div className="relative border-l-2 border-slate-200 ml-3 space-y-8 py-2">
              {milestones.map((milestone, idx) => {
                 const isLatest = idx === 0;
                 return (
                 <div key={idx} className="relative pl-8 group">
                    {/* Timeline Dot */}
                    <div className={`absolute -left-[9px] top-0 w-[18px] h-[18px] rounded-full border-4 border-slate-50 ${milestone.color} shadow-sm group-hover:scale-125 transition-transform duration-300 ${isLatest ? 'ring-4 ring-amber-100 animate-pulse' : ''}`}></div>
                    
                    {/* Content Card */}
                    <div className="flex flex-col gap-1">
                       <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded text-white ${milestone.color} ${isLatest ? 'shadow-lg shadow-amber-300' : ''}`}>
                             {milestone.version}
                          </span>
                          <span className={`text-xs font-bold ${isLatest ? 'text-amber-600' : 'text-slate-400'}`}>{milestone.date}</span>
                          {isLatest && <span className="text-[9px] font-black text-amber-600 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded animate-bounce">최신</span>}
                       </div>
                       
                       <h3 className={`font-bold text-sm flex items-center gap-2 mt-1 ${isLatest ? 'text-slate-900' : 'text-slate-800'}`}>
                          {milestone.title}
                       </h3>
                       
                       <div className={`text-xs leading-relaxed break-keep p-3 rounded-xl border mt-1 transition-all relative overflow-hidden ${
                          isLatest 
                          ? 'bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-100 border-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.3)] text-slate-800 font-medium' 
                          : 'bg-white border-slate-200 text-slate-500 shadow-sm group-hover:border-blue-300'
                       }`}>
                          {isLatest && (
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent -skew-x-12 animate-shimmer pointer-events-none"></div>
                          )}
                          {milestone.desc}
                       </div>
                    </div>
                 </div>
              )})}
              
              {/* Start Point */}
              <div className="relative pl-8">
                 <div className="absolute -left-[5px] top-1 w-3 h-3 rounded-full bg-slate-300"></div>
                  <p className="text-xs font-bold text-slate-400 italic">프로젝트 시작 (2025.11.28)</p>
              </div>
           </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-slate-100 shrink-0 text-center">
           <p className="text-[10px] text-slate-400 font-medium">
              개발 및 운영: 박성훈 부장 · 이다애 기사
           </p>
        </div>
      </div>
    </div>,
    document.body
  );
};
