
import React from 'react';
import { createPortal } from 'react-dom';
import { X, Rocket, Shield, BrainCircuit, LayoutDashboard, FileText, Video, Sparkles, History, GitCommit, Zap, Minimize2, Edit2, ListOrdered, Save, FileVideo, Presentation, CalendarRange, FolderInput, GraduationCap } from 'lucide-react';

interface HistoryModalProps {
  onClose: () => void;
}

const milestones = [
  {
    version: 'v2.7.3',
    date: '2025.12.09',
    title: '연구용 데이터 패키지 (Research Data)',
    desc: '학술 논문 및 빅데이터 분석을 위해 [서론-본론-결론] 구조의 정제된 데이터셋을 추출하는 기능 추가. 통계 분석에 즉시 활용 가능한 CSV 및 분석 리포트 제공.',
    icon: <GraduationCap size={18} />,
    color: 'bg-indigo-700'
  },
  {
    version: 'v2.7.2',
    date: '2025.12.09',
    title: '대량 문서 처리 모드 (Batch Process)',
    desc: '3주치 이상의 과거 데이터를 효율적으로 등록할 수 있도록 일괄 업로드 UX 개선. 대시보드 바로가기 버튼 및 상세 이용 가이드(Queue System) 탑재.',
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
    desc: '단순 기록을 넘어 안전 성과를 정량적으로 증명하는 Impact Report 기능 추가. TBM 품질 점수, 위험 발굴 건수, 사각지대 제거율을 그래프로 시각화하여 시스템 도입 효과를 입증.',
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
    desc: '음성 인식 실패 해결을 위한 Web Audio API 라우팅 적용. AI 분석 시 산만함 과대 평가 방지를 위한 긍정 우선(Positive Default) 로직 도입.',
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
    desc: '브라우저단에서 고화질 영상을 480p/VP8 코덱으로 실시간 압축. 100MB 이상 대용량 파일도 10MB대로 줄여 AI 분석 실패율 0% 도전.',
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
    desc: '20MB 이상 고화질 영상 자동 분할(Smart Slicing) 전송 기능 적용. 현장 네트워크 부담 감소.',
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
    title: '통합 대시보드 (Dashboard)',
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

export const HistoryModal: React.FC<HistoryModalProps> = ({ onClose }) => {
  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
      <div 
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
                    <span className="text-xs font-bold uppercase tracking-widest">Devlog</span>
                 </div>
                 <h2 className="text-2xl font-black leading-tight">System<br/>Evolution History</h2>
                 <p className="text-slate-400 text-xs font-medium mt-2">
                    단기간에 혁신적으로 진화한<br/>스마트 안전 시스템의 기록입니다.
                 </p>
              </div>
              <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white">
                 <X size={20} />
              </button>
           </div>
        </div>

        {/* Timeline Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 custom-scrollbar">
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
                          {isLatest && <span className="text-[9px] font-black text-amber-600 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded animate-bounce">NEW</span>}
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
                 <p className="text-xs font-bold text-slate-400 italic">Project Initiated (2025.11.28)</p>
              </div>
           </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-slate-100 shrink-0 text-center">
           <p className="text-[10px] text-slate-400 font-medium">
              Made with Passion by 박성훈 부장 & 이다애 기사
           </p>
        </div>
      </div>
    </div>,
    document.body
  );
};
