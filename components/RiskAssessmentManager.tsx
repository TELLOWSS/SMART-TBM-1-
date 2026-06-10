
import React, { useState, useRef, useMemo } from 'react';
import { MonthlyRiskAssessment, SafetyGuideline } from '../types';
import { extractMonthlyPriorities, ExtractedPriority, MonthlyExtractionResult } from '../services/geminiService';
import { Upload, Loader2, Trash2, ShieldCheck, Plus, RefreshCcw, Calendar, TrendingUp, Search, Edit2, Save, X, Download, FileJson, Layers, ArrowRight, BarChart3, AlertTriangle, CheckCircle2, ChevronDown, GitMerge, Scale, BookOpen, AlertOctagon, FileText, PieChart, Activity, FileStack, Sparkles, BrainCircuit, Clock, Copy } from 'lucide-react';
import { ConfirmDialog } from './common/ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

interface RiskAssessmentManagerProps {
  assessments: MonthlyRiskAssessment[];
  onSave: (data: MonthlyRiskAssessment[]) => void;
  onRestoreData: (files: FileList) => void; // [NEW] Unified Restore Handler
}

// ... (Rest of interfaces & helper components like AnalysisOverlay, RiskGauge remain unchanged) ...
// --- Helper Types for Regular Assessment ---
interface AggregatedRisk {
    content: string;
    category: string;
    level: 'HIGH' | 'GENERAL';
    frequency: number; // How many times it appeared in the selected year
    months: string[]; // Which months it appeared in
    source: 'INITIAL' | 'ADDED'; // [NEW] Origin of the risk item
}

// --- Premium Component: AI Analysis HUD Overlay ---
const AnalysisOverlay = ({ progress }: { progress: number }) => (
    <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-xl flex flex-col items-center justify-center animate-fade-in">
        <div className="bg-white/90 backdrop-blur-md rounded-[2rem] p-10 shadow-2xl flex flex-col items-center max-w-sm w-full mx-4 border border-white/20 relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-indigo-500/20 rounded-full blur-[50px] pointer-events-none"></div>
            <div className="relative z-10 flex flex-col items-center">
                <div className="relative w-20 h-20 mb-6 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-2 border-indigo-100 animate-ping opacity-20"></div>
                    <div className="absolute inset-0 rounded-full border border-indigo-200 opacity-50 scale-110"></div>
                    <div className="bg-white p-4 rounded-2xl shadow-lg border border-indigo-50 relative z-10">
                        <BrainCircuit size={32} className="text-indigo-600 animate-pulse" />
                    </div>
                </div>
                <h3 className="text-2xl font-black text-slate-800 mb-2 tracking-tight">AI 분석</h3>
                <p className="text-sm text-slate-500 text-center leading-relaxed mb-8 font-medium">
                    문서의 구조를 스캔하고<br/>
                    <span className="text-indigo-600 font-bold">위험성평가 데이터</span>를 추출합니다.
                </p>
                <div className="w-full space-y-2">
                    <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        <span>처리 진행</span>
                        <span>{progress}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden shadow-inner">
                        <div 
                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-300 ease-out shadow-[0_0_10px_rgba(99,102,241,0.5)]" 
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>
                    <p className="text-[10px] text-slate-400 text-right h-4">
                        {progress < 30 ? '이미지 스캔 중...' : progress < 70 ? '문맥 분석 중...' : '데이터 구조화 중...'}
                    </p>
                </div>
            </div>
        </div>
    </div>
);

const RiskGauge = ({ highCount, totalCount }: { highCount: number, totalCount: number }) => {
    const percentage = totalCount > 0 ? Math.min(100, Math.round((highCount / totalCount) * 100)) : 0;
    const generalCount = totalCount - highCount;
    const width = 180;
    const height = 90;
    const cx = width / 2;
    const cy = height; 
    const r = 70; 
    const strokeWidth = 14;
    const circumference = Math.PI * r;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    let colorStart = "#10B981"; let colorEnd = "#34D399";
    let textColor = "text-emerald-600"; let bgColor = "bg-emerald-50";

    if (percentage > 30) { colorStart = "#F59E0B"; colorEnd = "#FBBF24"; textColor = "text-amber-600"; bgColor = "bg-amber-50"; } 
    if (percentage > 50) { colorStart = "#EF4444"; colorEnd = "#F87171"; textColor = "text-red-600"; bgColor = "bg-red-50"; }

    return (
        <div className="flex flex-col items-center justify-center w-full">
            <div className="relative flex justify-center items-end" style={{ width: width, height: height }}>
                <svg width={width} height={height + strokeWidth} viewBox={`0 -${strokeWidth} ${width} ${height + strokeWidth * 2}`} className="overflow-visible">
                    <defs>
                        <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor={colorStart} />
                            <stop offset="100%" stopColor={colorEnd} />
                        </linearGradient>
                    </defs>
                    <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#F1F5F9" strokeWidth={strokeWidth} strokeLinecap="round" />
                    <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="url(#gaugeGradient)" strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
                </svg>
                <div className="absolute bottom-0 flex flex-col items-center mb-1">
                    <span className="text-3xl font-black text-slate-800 tracking-tighter leading-none">{percentage}<span className="text-sm text-slate-400">%</span></span>
                </div>
            </div>
            <div className="flex gap-2 mt-4 w-full justify-center">
                <div className="flex flex-col items-center bg-red-50 border border-red-100 px-3 py-1.5 rounded-xl min-w-[70px]">
                    <span className="text-[10px] font-bold text-red-400 uppercase">상(High)</span>
                    <span className="text-lg font-black text-red-600 leading-none">{highCount}</span>
                </div>
                <div className="flex flex-col items-center bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl min-w-[70px]">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">중·하</span>
                    <span className="text-lg font-black text-slate-600 leading-none">{generalCount}</span>
                </div>
            </div>
        </div>
    );
};

export const RiskAssessmentManager: React.FC<RiskAssessmentManagerProps> = ({ assessments, onSave, onRestoreData }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0); 
    const [librarySectionOpen, setLibrarySectionOpen] = useState({ baseline: true, monthly: true });
  
  // Separate Assessments by Type
  const initialAssessments = useMemo(() => {
      return assessments.filter(a => a.type === 'INITIAL' || a.type === 'REGULAR').sort((a, b) => b.createdAt - a.createdAt);
  }, [assessments]);

  const monthlyAssessments = useMemo(() => {
      // Sort first by Month, then by CreatedAt (newest first) to handle duplicates
      return assessments.filter(a => a.type !== 'INITIAL' && a.type !== 'REGULAR').sort((a, b) => {
          const monthDiff = b.month.localeCompare(a.month);
          if (monthDiff !== 0) return monthDiff;
          return (b.createdAt || 0) - (a.createdAt || 0);
      });
  }, [assessments]);

  // Initial State from Props
  const [selectedMonthId, setSelectedMonthId] = useState<string>('');
    const [mobilePrimaryView, setMobilePrimaryView] = useState<'LIBRARY' | 'DETAIL'>('LIBRARY');
    const [mobileWorkspaceView, setMobileWorkspaceView] = useState<'TOOLS' | 'LIST'>('LIST');
        const [mobileListFilter, setMobileListFilter] = useState<'ALL' | 'HIGH'>('ALL');

  // Auto-Select Logic
    React.useEffect(() => {
      // [FIX] Ensure selectedMonthId is valid. If deleted, switch to another.
      if (selectedMonthId && assessments.some(a => a.id === selectedMonthId)) return;

      if (monthlyAssessments.length > 0) {
          setSelectedMonthId(monthlyAssessments[0].id);
      } else if (initialAssessments.length > 0) {
          setSelectedMonthId(initialAssessments[0].id);
      } else {
          setSelectedMonthId('');
      }
  }, [assessments, monthlyAssessments, initialAssessments, selectedMonthId]);

  // ... (Other state variables: newMonthMode, targetMonth, etc.) ...
  const [newMonthMode, setNewMonthMode] = useState(false);
  const [targetMonth, setTargetMonth] = useState(() => {
      const today = new Date();
      return today.toISOString().slice(0, 7);
  }); 
  const [uploadType, setUploadType] = useState<'MONTHLY' | 'INITIAL'>('MONTHLY');
  const [showRegularBuilder, setShowRegularBuilder] = useState(false);
  const [regularTargetYear, setRegularTargetYear] = useState(new Date().getFullYear().toString());
  const [baseAssessmentId, setBaseAssessmentId] = useState<string>('');
  const [aggregatedRisks, setAggregatedRisks] = useState<AggregatedRisk[]>([]);
  const [regularStep, setRegularStep] = useState<'SELECT' | 'REVIEW'>('SELECT');

  const activeAssessment = assessments.find(a => a.id === selectedMonthId);

  React.useEffect(() => {
      if (activeAssessment) {
          setMobilePrimaryView('DETAIL');
      }
  }, [activeAssessment]);
  
  const previousAssessment = useMemo(() => {
     if (!activeAssessment) return null;
     const list = activeAssessment.type === 'INITIAL' || activeAssessment.type === 'REGULAR' ? initialAssessments : monthlyAssessments;
     const currentIndex = list.findIndex(a => a.id === activeAssessment.id);
     if (currentIndex !== -1 && currentIndex < list.length - 1) {
        return list[currentIndex + 1];
     }
     return null;
  }, [activeAssessment, initialAssessments, monthlyAssessments]);

  const [candidates, setCandidates] = useState<ExtractedPriority[]>([]);
  const [manualInput, setManualInput] = useState('');
  const [manualCategory, setManualCategory] = useState('공통');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
    const regularBuilderTriggerRef = useRef<HTMLButtonElement>(null);
    const regularBuilderCloseButtonRef = useRef<HTMLButtonElement>(null);
        const regularBuilderDialogRef = useRef<HTMLDivElement>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [backupStatusMessage, setBackupStatusMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [editForm, setEditForm] = useState<{content: string, level: string, category: string, actionNote: string}>({
      content: '', level: 'GENERAL', category: '공통', actionNote: ''
  });
  const { confirmDialogState, requestConfirm, closeConfirmDialog } = useConfirmDialog();

  const announceStatus = (message: string) => {
      setStatusMessage('');
      requestAnimationFrame(() => {
          setStatusMessage(message);
      });
  };

    React.useEffect(() => {
      if (!showRegularBuilder) return;

      const handleEscClose = (event: KeyboardEvent) => {
          if (event.key === 'Escape') {
              if (confirmDialogState.isOpen) return;
              setShowRegularBuilder(false);
              window.setTimeout(() => {
                  regularBuilderTriggerRef.current?.focus();
              }, 0);
          }
      };

      window.addEventListener('keydown', handleEscClose);
      return () => window.removeEventListener('keydown', handleEscClose);
    }, [showRegularBuilder, confirmDialogState.isOpen]);

    React.useEffect(() => {
      if (showRegularBuilder) {
          window.setTimeout(() => {
              regularBuilderCloseButtonRef.current?.focus();
          }, 0);
      }
  }, [showRegularBuilder]);

  const displayPriorities = useMemo(() => {
    if (!activeAssessment) return [];
        return activeAssessment.priorities.filter(item => {
                const matchesSearch = !searchTerm.trim() || (item.content || '').includes(searchTerm) || (item.category || '').includes(searchTerm);
                const matchesLevel = mobileListFilter === 'ALL' || item.level === 'HIGH';
                return matchesSearch && matchesLevel;
        });
    }, [activeAssessment, searchTerm, mobileListFilter]);

  const stats = useMemo(() => {
      if (!activeAssessment) return null;
      // [SAFEGUARD] Fallback to empty array if priorities is undefined
      const priorities = activeAssessment.priorities || [];
      
      const total = priorities.length;
      const high = priorities.filter(p => p.level === 'HIGH').length;
      const general = total - high;
      
      const catMap: Record<string, number> = {};
      priorities.forEach(p => {
          catMap[p.category] = (catMap[p.category] || 0) + 1;
      });
      const topCategories = Object.entries(catMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);

      let diff = 0;
      if (previousAssessment && previousAssessment.priorities) {
          diff = total - previousAssessment.priorities.length;
      }

      return { total, high, general, topCategories, diff };
  }, [activeAssessment, previousAssessment]);

  const mobileReadiness = useMemo(() => {
      if (!activeAssessment) return null;
      const priorities = activeAssessment.priorities || [];
      const high = priorities.filter(item => item.level === 'HIGH').length;
      const general = priorities.length - high;
      return {
          evaluator: {
              summary: `${priorities.length}건 중 상위험 ${high}건`,
              detail: previousAssessment ? `${previousAssessment.month} 대비 ${stats?.diff || 0}건 변동 추적 가능` : '기준 비교 데이터는 다음 평가 선택 시 활성화'
          },
          practitioner: {
              summary: `수동등록·수정·삭제·문서추가 즉시 수행 가능`,
              detail: `일반 ${general}건 / 상위험 ${high}건을 모바일에서 직접 관리`
          }
      };
  }, [activeAssessment, previousAssessment, stats]);

  const highRiskHighlights = useMemo(() => {
      if (!activeAssessment?.priorities) return [];
      return activeAssessment.priorities
          .filter(item => item.level === 'HIGH')
          .slice(0, 3)
          .map(item => ({
              content: item.content,
              category: item.category,
              actionNote: item.actionNote || '즉시조치 메모 미입력'
          }));
  }, [activeAssessment]);

  const batchActionNoteText = useMemo(() => {
      if (!activeAssessment?.priorities) return '';
      const items = activeAssessment.priorities.filter(item => item.level === 'HIGH' || item.actionNote?.trim());
      if (items.length === 0) return '';

      return [
          `[위험성평가 즉시조치 일괄복사]`,
          `${activeAssessment.fileName}`,
          ...items.map((item, index) => `${index + 1}. [${item.category}] ${item.content}\n- 등급: ${item.level === 'HIGH' ? '상위험' : '일반'}\n- 즉시조치: ${item.actionNote?.trim() || '메모 미입력'}`),
      ].join('\n');
  }, [activeAssessment]);

  const normalizeString = (str: string) => {
    return (str || '').replace(/[\s\n\r.,\-()[\]]/g, '').trim();
  };

  // --- Handlers (Backup, Export, Regular Logic) ---
  const handleExportBackup = () => {
    if (assessments.length === 0) {
            setBackupStatusMessage("백업할 위험성평가 데이터가 없습니다.");
            announceStatus('백업할 데이터가 없습니다.');
      return;
    }
    const backupData = {
        version: '3.1.0',
        scope: 'RISK',
        backupDate: new Date().toISOString(),
        assessments: assessments
    };

    const dataStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RISK_ASSESSMENT_BACKUP_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
        setBackupStatusMessage(`위험성평가 ${assessments.length}건 백업 파일을 생성했습니다.`);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
                const invalidFiles = Array.from(files).filter(file => {
                    const lowerName = file.name.toLowerCase();
                    const isJsonMime = file.type === 'application/json' || file.type === 'text/json';
                    const isJsonExt = lowerName.endsWith('.json');
                    return !(isJsonMime || isJsonExt);
                });

                if (invalidFiles.length > 0) {
                    setBackupStatusMessage(`복구 파일 형식 오류: JSON 파일만 업로드할 수 있습니다. (${invalidFiles.length}개 제외)`);
                    announceStatus('위험성평가 복구는 JSON 파일만 지원합니다. PDF는 문서 분석에서 업로드하세요.');
                    if (backupInputRef.current) backupInputRef.current.value = '';
                    return;
                }

                setBackupStatusMessage(`복구 파일 ${files.length}개를 불러오는 중입니다...`);
        onRestoreData(files);
        if(backupInputRef.current) backupInputRef.current.value = '';
    }
  };

  // ... (Regular Assessment Logic & Create Month Logic - Unchanged) ...
  const handleOpenRegularBuilder = () => {
      const latestInitial = initialAssessments.length > 0 ? initialAssessments[0].id : '';
      setBaseAssessmentId(latestInitial);
      setShowRegularBuilder(true);
      setRegularStep('SELECT');
  };

  const handleCloseRegularBuilder = () => {
      setShowRegularBuilder(false);
      window.setTimeout(() => {
          regularBuilderTriggerRef.current?.focus();
      }, 0);
  };

  const handleRegularDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Tab') return;

      const dialogNode = regularBuilderDialogRef.current;
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

  const handleAnalyzeRegular = () => {
      const baseAssessment = assessments.find(a => a.id === baseAssessmentId);
      const targetAssessments = monthlyAssessments.filter(a => a.month.startsWith(regularTargetYear));
      
      if (!baseAssessment && targetAssessments.length === 0) {
          announceStatus("분석할 데이터가 없습니다. 기초 데이터(최초 위험성평가) 또는 선택한 연도의 월간 데이터가 필요합니다.");
          return;
      }

      const riskMap = new Map<string, AggregatedRisk>();

      if (baseAssessment && Array.isArray(baseAssessment.priorities)) {
          baseAssessment.priorities.forEach(p => {
              const key = normalizeString(p.content);
              riskMap.set(key, {
                  content: p.content,
                  category: p.category,
                  level: p.level as 'HIGH' | 'GENERAL',
                  frequency: 0, 
                  months: [],
                  source: 'INITIAL'
              });
          });
      }

      targetAssessments.forEach(monthData => {
          if(Array.isArray(monthData.priorities)) {
              monthData.priorities.forEach(p => {
                  const key = normalizeString(p.content); 
                  
                  if (riskMap.has(key)) {
                      const existing = riskMap.get(key)!;
                      existing.frequency += 1;
                      existing.months.push(monthData.month.slice(5)); 
                      if (p.level === 'HIGH') existing.level = 'HIGH';
                  } else {
                      riskMap.set(key, {
                          content: p.content,
                          category: p.category,
                          level: p.level as 'HIGH' | 'GENERAL',
                          frequency: 1,
                          months: [monthData.month.slice(5)],
                          source: 'ADDED' 
                      });
                  }
              });
          }
      });

      const sortedRisks = Array.from(riskMap.values()).sort((a, b) => {
          if (a.level === 'HIGH' && b.level !== 'HIGH') return -1;
          if (a.level !== 'HIGH' && b.level === 'HIGH') return 1;
          return b.frequency - a.frequency;
      });

      setAggregatedRisks(sortedRisks);
      setRegularStep('REVIEW');
  };

  const handleCreateRegularAssessment = () => {
      if (aggregatedRisks.length === 0) return;

      const title = `${regularTargetYear}년 정기위험성평가 (통합)`;
      
      const finalPriorities: SafetyGuideline[] = aggregatedRisks.map(r => ({
          content: r.content,
          category: r.category,
          level: r.level
      }));

      const newAssessment: MonthlyRiskAssessment = {
          id: `REGULAR-${regularTargetYear}-${Date.now()}`,
          month: `${regularTargetYear}-Yearly`, 
          type: 'REGULAR', 
          fileName: title,
          priorities: finalPriorities,
          createdAt: Date.now()
      };

      onSave([newAssessment, ...assessments]);
      setSelectedMonthId(newAssessment.id);
      handleCloseRegularBuilder();
      setRegularStep('SELECT');
      announceStatus(`${title}가 생성되었습니다. 최초 평가 ${aggregatedRisks.filter(r=>r.source==='INITIAL').length}건, 근로자 참여 분석 ${aggregatedRisks.filter(r=>r.source==='ADDED').length}건이 반영되었습니다.`);
  };

  const handleRemoveAggregatedItem = (index: number) => {
      const newRisks = [...aggregatedRisks];
      newRisks.splice(index, 1);
      setAggregatedRisks(newRisks);
  };

  const handleCreateMonth = () => {
     if (assessments.some(a => a.month === targetMonth && a.type !== 'INITIAL' && a.type !== 'REGULAR')) {
          announceStatus('이미 해당 월의 평가가 존재합니다.');
        return;
     }

     const newAssessment: MonthlyRiskAssessment = {
        id: `MONTH-${Date.now()}`,
        month: targetMonth,
        type: 'MONTHLY',
        fileName: '신규 월간 평가',
        priorities: [],
        createdAt: Date.now()
     };

     const updated = [newAssessment, ...assessments];
     onSave(updated);
     setSelectedMonthId(newAssessment.id);
     setNewMonthMode(false);
  };

  const updateActiveAssessment = (newPriorities: SafetyGuideline[]) => {
     if (!activeAssessment) return;
     const updated = assessments.map(a => a.id === activeAssessment.id ? { ...a, priorities: newPriorities } : a);
     onSave(updated);
  };

  const handleUploadClick = (type: 'INITIAL' | 'MONTHLY') => {
      setUploadType(type);
      fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const lowerName = (file.name || '').toLowerCase();
      const isJsonFile = lowerName.endsWith('.json') || file.type === 'application/json' || file.type === 'text/json';

      if (isJsonFile) {
          setBackupStatusMessage(`복구 파일 1개를 불러오는 중입니다...`);
          announceStatus('JSON 복구 파일을 감지했습니다. 데이터 복구를 진행합니다.');
          onRestoreData(e.target.files);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
      }

      const isLikelyPdf = lowerName.endsWith('.pdf') || file.type === 'application/pdf' || file.type === 'application/octet-stream';
      const isLikelyImage = !!file.type && file.type.startsWith('image/');
      const isImageExt = /\.(jpg|jpeg|png|webp|heic|heif|gif|bmp)$/i.test(lowerName);
      if (!(isLikelyPdf || isLikelyImage || isImageExt)) {
          announceStatus('문서 분석은 PDF 또는 이미지 파일만 지원합니다.');
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
      }
      
      setIsAnalyzing(true);
      setLoadingProgress(0); 

      const timer = setInterval(() => {
          setLoadingProgress(prev => {
              if (prev >= 90) return prev; 
              return prev + (prev < 50 ? 5 : 2); 
          });
      }, 300);

      const reader = new FileReader();
      
      reader.onload = async (event) => {
        const base64Url = event.target?.result as string;
        if (!base64Url) return;

        try {
          const base64Data = base64Url.split(',')[1];
                    const dataUrlMime = base64Url.startsWith('data:') ? (base64Url.split(';')[0]?.replace('data:', '') || '') : '';
                    const normalizedMime = (() => {
                            if (dataUrlMime === 'application/pdf' || dataUrlMime.startsWith('image/')) return dataUrlMime;
                            if (file.type === 'application/pdf' || file.type.startsWith('image/')) return file.type;
                            if (lowerName.endsWith('.pdf')) return 'application/pdf';
                            if (/\.(jpg|jpeg)$/i.test(lowerName)) return 'image/jpeg';
                            if (/\.png$/i.test(lowerName)) return 'image/png';
                            if (/\.webp$/i.test(lowerName)) return 'image/webp';
                            if (/\.(heic|heif)$/i.test(lowerName)) return 'image/heic';
                            return 'application/pdf';
                    })();
                    const result: MonthlyExtractionResult = await extractMonthlyPriorities(base64Data, normalizedMime, uploadType);
          
          clearInterval(timer);
          setLoadingProgress(100);
          await new Promise(r => setTimeout(r, 600)); 

          const { items: extracted, detectedMonth } = result;

          let targetAssessment: MonthlyRiskAssessment | undefined;
          let isNewCreated = false;

          if (uploadType === 'INITIAL') {
              const newAssessment: MonthlyRiskAssessment = {
                  id: `INITIAL-${Date.now()}`,
                  month: detectedMonth || '최초',
                  type: 'INITIAL',
                  fileName: file.name,
                  priorities: [],
                  createdAt: Date.now()
              };
              const updatedList = [newAssessment, ...assessments];
              onSave(updatedList);
              setSelectedMonthId(newAssessment.id);
              targetAssessment = newAssessment;
              isNewCreated = true;
          } else {
              if (detectedMonth && activeAssessment && detectedMonth !== activeAssessment.month && activeAssessment.type !== 'INITIAL') {
                 const isConfirmed = await requestConfirm(`📄 문서 분석: [${detectedMonth}월] 자료입니다.\n\n해당 월로 등록하시겠습니까?`, {
                     title: '월간 평가 등록',
                     confirmLabel: '등록',
                     variant: 'warning'
                 });
                 if (isConfirmed) {
                    const existingTarget = monthlyAssessments.find(a => a.month === detectedMonth);
                    if (existingTarget) {
                       targetAssessment = existingTarget;
                       setSelectedMonthId(existingTarget.id);
                    } else {
                       const newAssessment: MonthlyRiskAssessment = {
                          id: `MONTH-${Date.now()}`,
                          month: detectedMonth,
                          type: 'MONTHLY',
                          fileName: file.name,
                          priorities: [],
                          createdAt: Date.now()
                       };
                       const updatedList = [newAssessment, ...assessments];
                       onSave(updatedList);
                       setSelectedMonthId(newAssessment.id);
                       targetAssessment = newAssessment;
                       isNewCreated = true;
                    }
                 } else {
                     targetAssessment = activeAssessment;
                 }
              } else {
                  targetAssessment = activeAssessment;
              }
          }

          if (!targetAssessment) {
                 announceStatus('평가 데이터를 저장할 대상을 선택하거나 새로 생성해주세요.');
             setIsAnalyzing(false);
             return;
          }

          const currentPriorities = [...(targetAssessment.priorities || [])];
          let addedCount = 0;
          
          extracted.forEach(item => {
             const normalizedContent = normalizeString(item.content);
             const isDuplicate = currentPriorities.some(f => {
                 const existingNorm = normalizeString(f.content);
                 return existingNorm === normalizedContent;
             });

             if (!isDuplicate) {
                currentPriorities.push({ content: item.content, level: item.level, category: item.category });
                addedCount++;
             }
          });
          
          currentPriorities.sort((a, b) => {
             if (a.level === 'HIGH' && b.level !== 'HIGH') return -1;
             if (a.level !== 'HIGH' && b.level === 'HIGH') return 1;
             return 0;
          });

          if (isNewCreated) {
              targetAssessment.priorities = currentPriorities;
              const freshList = assessments.some(a => a.id === targetAssessment!.id) 
                  ? assessments.map(a => a.id === targetAssessment!.id ? targetAssessment! : a)
                  : [targetAssessment!, ...assessments];
              onSave(freshList);

          } else {
              const updatedList = assessments.map(a => 
                 a.id === targetAssessment!.id 
                 ? { ...a, priorities: currentPriorities, fileName: file.name }
                 : a
              );
              onSave(updatedList);
          }

          setCandidates([]);
                    announceStatus(`${addedCount}건의 항목이 등록되었습니다.`);
          
        } catch (err: any) {
          console.error(err);
          const msg = err.message || "문서 분석 중 오류가 발생했습니다.";
                    announceStatus(msg.includes('429') || msg.includes('제한') || msg.includes('Quota') ? msg : '문서 분석 중 오류가 발생했습니다.');
        } finally {
          // [FIX] Always clear interval in finally to prevent orphaned timers
          clearInterval(timer);
          setIsAnalyzing(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const addToFinal = (item: ExtractedPriority) => {
    if (!activeAssessment) return;
    if (!activeAssessment.priorities.some(p => normalizeString(p.content) === normalizeString(item.content))) {
      const newGuideline: SafetyGuideline = { 
        content: item.content, 
        level: item.level, 
        category: item.category 
      };
      updateActiveAssessment([...activeAssessment.priorities, newGuideline]);
      setCandidates(prev => prev.filter(c => c.content !== item.content));
            setMobileWorkspaceView('LIST');
    }
  };

  const removeFromFinal = (indexToRemove: number) => {
    if (!activeAssessment) return;
        const targetItem = activeAssessment.priorities[indexToRemove];
        const confirmMessage = targetItem
            ? `선택한 위험요소를 삭제하시겠습니까?\n\n[${targetItem.category}] ${targetItem.content}`
            : "정말 삭제하시겠습니까?";
        requestConfirm(confirmMessage, { title: '위험요소 삭제', confirmLabel: '삭제', variant: 'danger' }).then((isConfirmed) => {
            if (!isConfirmed) return;
        const newPriorities = activeAssessment.priorities.filter((_, i) => i !== indexToRemove);
        updateActiveAssessment(newPriorities);
        });
  };

  const addManualPriority = () => {
    if (manualInput.trim() && activeAssessment) {
      const newGuideline: SafetyGuideline = {
        content: manualInput.trim(),
        level: 'GENERAL',
                category: manualCategory,
                actionNote: ''
      };
      updateActiveAssessment([newGuideline, ...activeAssessment.priorities]);
      setManualInput('');
            setMobilePrimaryView('DETAIL');
            setMobileWorkspaceView('LIST');
            setMobileListFilter('ALL');
    }
  };

  // [FIXED] Robust Deletion Handler
    const handleDeleteMonth = async () => {
     if (!selectedMonthId) return;
      const selectedAssessment = assessments.find(a => a.id === selectedMonthId);
      const targetLabel = selectedAssessment?.type === 'INITIAL'
          ? `최초 위험성평가 (${selectedAssessment.month})`
          : selectedAssessment?.type === 'REGULAR'
          ? `정기 위험성평가 (${selectedAssessment.month})`
          : `월간 위험성평가 (${selectedAssessment?.month || '미지정'})`;
     
            const isConfirmed = await requestConfirm(`${targetLabel}를 삭제하시겠습니까?\n\n삭제 후 복구할 수 없습니다.`, {
                    title: '평가 삭제',
                    confirmLabel: '삭제',
                    variant: 'danger'
            });
            if (!isConfirmed) return;

            const updated = assessments.filter(a => a.id !== selectedMonthId);
            onSave(updated); // Sync with Parent State & DB
            setSelectedMonthId(''); // Clear selection to force UI update
  }

  // --- Edit Logic ---
  const handleSelectAssessment = (assessmentId: string) => {
      setSelectedMonthId(assessmentId);
      setMobilePrimaryView('DETAIL');
      setMobileWorkspaceView('LIST');
      setMobileListFilter('ALL');
  };

  const startEditing = (index: number, item: SafetyGuideline) => {
      setEditingIndex(index);
      setEditForm({
          content: item.content,
          level: item.level,
          category: item.category,
          actionNote: item.actionNote || ''
      });
      setMobilePrimaryView('DETAIL');
      setMobileWorkspaceView('LIST');
  };

  const handleActionNoteChange = (index: number, actionNote: string) => {
      if (!activeAssessment) return;
      const updatedPriorities = [...activeAssessment.priorities];
      updatedPriorities[index] = {
          ...updatedPriorities[index],
          actionNote,
      };
      updateActiveAssessment(updatedPriorities);
  };

  const handleCopyActionNote = (item: SafetyGuideline) => {
      const text = [
          `[위험성평가 즉시조치]`,
          `구분: ${item.category}`,
          `위험: ${item.content}`,
          `등급: ${item.level === 'HIGH' ? '상위험' : '일반'}`,
          `즉시조치: ${item.actionNote || '메모 미입력'}`,
      ].join('\n');

      navigator.clipboard.writeText(text).then(() => {
          announceStatus('즉시조치 메모가 클립보드에 복사되었습니다.');
      }).catch(() => {
          announceStatus('즉시조치 메모 복사에 실패했습니다.');
      });
  };

  const handleCopyAllActionNotes = () => {
      if (!batchActionNoteText) {
          announceStatus('복사할 즉시조치 메모가 없습니다.');
          return;
      }

      navigator.clipboard.writeText(batchActionNoteText).then(() => {
          announceStatus('즉시조치 메모 일괄 복사가 완료되었습니다.');
      }).catch(() => {
          announceStatus('즉시조치 메모 일괄 복사에 실패했습니다.');
      });
  };

  const cancelEditing = () => {
      setEditingIndex(null);
  };

  const saveEditing = () => {
      if (!activeAssessment || editingIndex === null) return;
      
      const updatedPriorities = [...activeAssessment.priorities];
      updatedPriorities[editingIndex] = {
          content: editForm.content,
          level: editForm.level as 'HIGH' | 'GENERAL',
          category: editForm.category,
          actionNote: editForm.actionNote
      };
      
      updateActiveAssessment(updatedPriorities);
      setEditingIndex(null);
      setMobileWorkspaceView('LIST');
  };

  // ... (Component rendering remains same as provided in previous full file context, using handleDeleteMonth) ...
  // [NOTE] Re-pasting the CategoryBadge and Return statement to ensure file completeness for XML

  const CategoryBadge = ({ category }: { category: string }) => {
    let colorClass = "bg-slate-100 text-slate-600";
    if (category.includes("공통")) colorClass = "bg-slate-200 text-slate-700";
    else if (category.includes("형틀")) colorClass = "bg-amber-100 text-amber-700";
    else if (category.includes("철근")) colorClass = "bg-indigo-100 text-indigo-700";
    else if (category.includes("비계") || category.includes("시스템")) colorClass = "bg-purple-100 text-purple-700";
    else if (category.includes("장비") || category.includes("지게차")) colorClass = "bg-orange-100 text-orange-700";
    else if (category.includes("전기")) colorClass = "bg-yellow-100 text-yellow-700";
    
    return (
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border border-black/5 ${colorClass}`}>
        {category}
      </span>
    );
  };

  return (
    <div className="bg-slate-50 min-h-[calc(100vh-140px)] flex flex-col xl:flex-row gap-4 xl:gap-6 relative pb-28 xl:pb-0">
             <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{statusMessage}</p>
       {isAnalyzing && <AnalysisOverlay progress={loadingProgress} />}

       <input type="file" ref={backupInputRef} className="hidden" accept=".json" onChange={handleImportBackup} multiple/>
    <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="application/pdf,.pdf,image/*,.jpg,.jpeg,.png,.webp,.heic,.heif,.json,application/json,text/json"/>

       <div className="xl:hidden bg-white border border-slate-200 rounded-2xl p-3 shadow-sm sticky top-2 z-20">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
              <button
                  type="button"
                  onClick={() => setMobilePrimaryView('LIBRARY')}
                  className={`rounded-xl px-4 py-3 text-sm font-black transition-all ${mobilePrimaryView === 'LIBRARY' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600'}`}
              >
                  평가목록
              </button>
              <button
                  type="button"
                  onClick={() => setMobilePrimaryView('DETAIL')}
                  className={`rounded-xl px-4 py-3 text-sm font-black transition-all ${mobilePrimaryView === 'DETAIL' ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200' : 'text-slate-600'}`}
              >
                  평가내용
              </button>
          </div>
       </div>

       {/* Sidebar */}
    <div className={`w-full xl:w-64 flex-col gap-4 overflow-y-auto custom-scrollbar pr-0 xl:pr-2 ${mobilePrimaryView === 'LIBRARY' ? 'flex' : 'hidden'} xl:flex`}>
          <button 
                 ref={regularBuilderTriggerRef}
             onClick={handleOpenRegularBuilder}
                 aria-label="정기 위험성평가 수립 마법사 열기"
                 aria-haspopup="dialog"
                 aria-expanded={showRegularBuilder}
             className="w-full bg-indigo-600 text-white p-4 rounded-2xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all flex flex-col items-center gap-2 group border border-indigo-500"
          >
             <div className="p-2 bg-indigo-500 rounded-lg group-hover:scale-110 transition-transform">
                <Layers size={24} className="text-white"/>
             </div>
             <div className="text-center">
                <h3 className="font-bold text-sm">정기 위험성평가 수립</h3>
                <p className="text-xs text-indigo-200 mt-1 font-medium">최초 + 월간 + 피드백 통합</p>
             </div>
          </button>

          {/* Section 1: Baseline */}
             <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
             <div className="flex justify-between items-center mb-3">
                <h3 className="font-black text-slate-800 flex items-center gap-2 text-xs">
                   <BookOpen size={14} className="text-amber-500"/> 기준 정보 (Standard)
                </h3>
                     <div className="flex items-center gap-1">
                          <button
                                type="button"
                                onClick={() => setLibrarySectionOpen(prev => ({ ...prev, baseline: !prev.baseline }))}
                                className="p-1.5 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition-colors"
                                aria-label="기준 정보 목록 접기 또는 펼치기"
                          >
                                <ChevronDown size={14} className={`transition-transform ${librarySectionOpen.baseline ? '' : '-rotate-90'}`}/>
                          </button>
                          <button onClick={() => handleUploadClick('INITIAL')} aria-label="최초 위험성평가 문서 등록" className="p-1.5 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition-colors" title="최초 위험성평가 등록">
                              <Plus size={14}/>
                          </button>
                     </div>
             </div>
                 {librarySectionOpen.baseline && (
                 <div className="space-y-2">
                {initialAssessments.length === 0 ? (
                    <div className="text-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 cursor-pointer hover:bg-slate-100" onClick={() => handleUploadClick('INITIAL')} onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleUploadClick('INITIAL');
                        }
                    }} role="button" tabIndex={0} aria-label="최초 평가 등록 시작">
                        <span className="text-[10px] text-slate-400 font-bold">최초 평가 등록 필요</span>
                    </div>
                ) : (
                    initialAssessments.map(ass => (
                        <button
                            key={ass.id}
                            onClick={() => handleSelectAssessment(ass.id)}
                            aria-label={`${ass.type === 'INITIAL' ? '최초평가' : '정기평가'} ${ass.fileName} 선택`}
                            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                                selectedMonthId === ass.id 
                                ? 'bg-amber-500 text-white border-amber-600 shadow-md shadow-amber-200' 
                                : 'bg-amber-50 text-amber-900 border-amber-100 hover:border-amber-300'
                            }`}
                        >
                            <div className="flex flex-col items-start truncate">
                                <span className="font-bold text-xs truncate w-32">{ass.fileName}</span>
                                <span className="text-[9px] opacity-80">{ass.type === 'INITIAL' ? '최초평가' : '정기평가'}</span>
                            </div>
                            <span className="text-[10px] font-bold bg-white/20 px-1.5 py-0.5 rounded">{(ass.priorities || []).length}</span>
                        </button>
                    ))
                )}
             </div>
                 )}
          </div>

          {/* Section 2: Monthly */}
             <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
             <div className="flex justify-between items-center mb-3">
                <h3 className="font-black text-slate-800 flex items-center gap-2 text-xs">
                   <Calendar size={14} className="text-blue-600"/> 운영 정보 (Updates)
                </h3>
                     <div className="flex items-center gap-1">
                          <button
                                type="button"
                                onClick={() => setLibrarySectionOpen(prev => ({ ...prev, monthly: !prev.monthly }))}
                                className="p-1.5 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition-colors"
                                aria-label="운영 정보 목록 접기 또는 펼치기"
                          >
                                <ChevronDown size={14} className={`transition-transform ${librarySectionOpen.monthly ? '' : '-rotate-90'}`}/>
                          </button>
                          <button onClick={() => setNewMonthMode(true)} aria-label="신규 월간 위험성평가 생성 열기" className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors">
                              <Plus size={14}/>
                          </button>
                     </div>
             </div>
             
                 {librarySectionOpen.monthly && newMonthMode && (
                <div className="mb-4 bg-slate-50 p-3 rounded-xl border border-slate-200 animate-slide-up">
                   <label className="text-[10px] font-bold text-slate-500 mb-1 block">추가할 월 선택</label>
                   <input 
                      type="month" 
                      value={targetMonth} 
                      onChange={(e) => setTargetMonth(e.target.value)}
                      className="w-full text-sm font-bold border border-slate-300 rounded-lg p-2 mb-2 outline-none focus:border-blue-500"
                   />
                   <div className="flex gap-2">
                             <button onClick={handleCreateMonth} aria-label={`${targetMonth} 월간 평가 생성`} className="flex-1 bg-blue-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-blue-700">생성</button>
                             <button onClick={() => setNewMonthMode(false)} aria-label="월간 평가 생성 취소" className="flex-1 bg-white border border-slate-300 text-slate-600 text-xs font-bold py-2 rounded-lg hover:bg-slate-50">취소</button>
                   </div>
                </div>
             )}

                 {librarySectionOpen.monthly && (
                 <div className="space-y-2">
                {monthlyAssessments.map(month => (
                   <button
                      key={month.id}
                      onClick={() => handleSelectAssessment(month.id)}
                             aria-label={`${month.month}월 월간 위험성평가 선택`}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                         selectedMonthId === month.id 
                         ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200' 
                         : 'bg-white text-slate-600 border-slate-100 hover:border-slate-300'
                      }`}
                   >
                      <div className="flex flex-col items-start text-left">
                          <span className="font-bold text-sm">{month.month}월</span>
                          <div className="flex items-center gap-1 mt-0.5 opacity-80">
                              <Clock size={8} />
                              <span className="text-[9px]">
                                {new Date(month.createdAt || 0).toLocaleDateString().slice(5)} 등록
                              </span>
                          </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${selectedMonthId === month.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                         {(month.priorities || []).length}건
                      </span>
                   </button>
                ))}
             </div>
                 )}
          </div>
       </div>

       {/* Main Content */}
         <div className={`flex-1 flex-col gap-4 xl:gap-6 overflow-hidden ${mobilePrimaryView === 'DETAIL' ? 'flex' : 'hidden'} xl:flex`}>
          {activeAssessment ? (
             <>
                <div className={`rounded-2xl p-6 shadow-sm border flex flex-col gap-6 ${
                    activeAssessment.type === 'INITIAL' || activeAssessment.type === 'REGULAR' 
                    ? 'bg-amber-50 border-amber-200' 
                    : 'bg-white border-slate-200'
                }`}>
                   <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
                       <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                              {activeAssessment.type === 'INITIAL' || activeAssessment.type === 'REGULAR' ? (
                                  <span className="bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded">기준 정보</span>
                              ) : (
                                  <span className="bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded">운영 정보</span>
                              )}
                              <span className="text-xs font-bold text-slate-500 bg-white/50 px-2 py-0.5 rounded border border-slate-200/50 max-w-full truncate">
                                파일명: {activeAssessment.fileName}
                             </span>
                          </div>
                          <h2 className="text-xl sm:text-2xl font-black text-slate-800 flex items-center gap-3 leading-tight">
                             {activeAssessment.type === 'REGULAR' ? `${activeAssessment.month.split('-')[0]}년 정기 위험성평가` : 
                              activeAssessment.type === 'INITIAL' ? '최초 위험성평가 (Baseline)' : 
                              `${activeAssessment.month}월 월간/수시 위험성평가`}
                          </h2>
                          <p className="text-[10px] text-slate-400 mt-1 font-mono">ID: {activeAssessment.id}</p>
                       </div>
                       
                       <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full lg:w-auto">
                                  <button onClick={() => handleUploadClick(activeAssessment.type === 'INITIAL' ? 'INITIAL' : 'MONTHLY')} aria-label={activeAssessment.type === 'INITIAL' ? '최초 위험성평가 문서 분석(PDF/이미지) 또는 추가' : `${activeAssessment.month} 위험성평가 문서 분석(PDF/이미지) 또는 추가`} className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 min-h-[48px] w-full sm:w-auto">
                             <FileJson size={18}/>
                                      <span>문서 분석(PDF/이미지)</span>
                          </button>
                          <div className="grid grid-cols-3 gap-2 w-full sm:w-auto sm:flex sm:flex-col sm:gap-1">
                              <button onClick={handleExportBackup} aria-label="위험성평가 데이터 백업 다운로드(JSON)" className="p-3 bg-white border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50 transition-colors text-xs font-bold flex items-center justify-center min-h-[48px]" title="데이터 백업(JSON) 다운로드">
                                      <Download size={16}/>
                                  </button>
                              <button onClick={() => backupInputRef.current?.click()} aria-label="위험성평가 데이터 복구 파일 업로드(JSON)" className="p-3 bg-white border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50 transition-colors text-xs font-bold flex items-center justify-center min-h-[48px]" title="데이터 복구(JSON) 업로드">
                                      <Upload size={16}/>
                                  </button>
                              <button onClick={handleDeleteMonth} aria-label={`현재 선택된 ${activeAssessment.month} 위험성평가 삭제`} className="p-3 bg-white border border-slate-200 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors text-xs font-bold flex justify-center min-h-[48px]" title="현재 월 삭제">
                                  <Trash2 size={16}/>
                              </button>
                          </div>
                       </div>
                   </div>
                   {backupStatusMessage && (
                      <div className="-mt-2">
                          <p className="text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2" role="status" aria-live="polite" aria-atomic="true">
                              {backupStatusMessage}
                          </p>
                      </div>
                   )}

                   {mobileReadiness && (
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                           <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                               <div className="flex items-center gap-2 mb-2">
                                   <BarChart3 size={16} className="text-indigo-600"/>
                                   <span className="text-sm font-black text-indigo-900">평가자 관점</span>
                               </div>
                               <p className="text-sm font-bold text-slate-800">{mobileReadiness.evaluator.summary}</p>
                               <p className="text-xs text-slate-600 mt-1 leading-relaxed">{mobileReadiness.evaluator.detail}</p>
                           </div>
                           <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                               <div className="flex items-center gap-2 mb-2">
                                   <Activity size={16} className="text-emerald-600"/>
                                   <span className="text-sm font-black text-emerald-900">실무자 관점</span>
                               </div>
                               <p className="text-sm font-bold text-slate-800">{mobileReadiness.practitioner.summary}</p>
                               <p className="text-xs text-slate-600 mt-1 leading-relaxed">{mobileReadiness.practitioner.detail}</p>
                           </div>
                       </div>
                   )}

                   {stats && (
                       <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                           <div className="flex flex-col items-center md:border-r border-slate-100 md:pr-4">
                               <RiskGauge highCount={stats.high} totalCount={stats.total} />
                           </div>
                           <div className="flex flex-col gap-3 md:border-r border-slate-100 md:pr-4 h-full justify-center">
                               <div className="flex justify-between items-end p-2 bg-slate-50 rounded-lg">
                                   <span className="text-xs font-bold text-slate-400">총 항목</span>
                                   <span className="text-2xl font-black text-slate-800">{stats.total}</span>
                               </div>
                               <div className="flex justify-between items-center px-2">
                                   <span className="text-xs font-bold text-slate-400">전월 대비</span>
                                   <div className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded ${stats.diff > 0 ? 'bg-red-50 text-red-600' : stats.diff < 0 ? 'bg-green-50 text-green-600' : 'bg-slate-50 text-slate-500'}`}>
                                       {stats.diff > 0 ? <TrendingUp size={12}/> : stats.diff < 0 ? <TrendingUp size={12} className="rotate-180"/> : null}
                                       {stats.diff > 0 ? `+${stats.diff} 증가` : stats.diff < 0 ? `${stats.diff} 감소` : '변동 없음'}
                                   </div>
                               </div>
                           </div>
                           <div className="flex flex-col gap-2 h-full justify-center">
                               <h4 className="text-[10px] font-bold text-slate-400 mb-1">위험 카테고리 상위</h4>
                               {stats.topCategories.map(([cat, count], idx) => (
                                   <div key={cat} className="flex items-center gap-2">
                                       <span className="text-xs font-bold text-slate-600 w-16 truncate">{cat}</span>
                                       <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                           <div 
                                               className={`h-full rounded-full ${idx === 0 ? 'bg-indigo-500' : idx === 1 ? 'bg-blue-500' : 'bg-sky-400'}`} 
                                               style={{ width: `${(count / stats.total) * 100}%` }}
                                           ></div>
                                       </div>
                                       <span className="text-[10px] font-mono text-slate-400 w-6 text-right">{count}</span>
                                   </div>
                               ))}
                           </div>
                       </div>
                   )}
                </div>

                {/* Main Workspace */}
                <div className="xl:hidden bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
                    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                        <button
                            type="button"
                            onClick={() => setMobileWorkspaceView('TOOLS')}
                            className={`rounded-xl px-4 py-3 text-sm font-black transition-all ${mobileWorkspaceView === 'TOOLS' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600'}`}
                        >
                            실무도구
                        </button>
                        <button
                            type="button"
                            onClick={() => setMobileWorkspaceView('LIST')}
                            className={`rounded-xl px-4 py-3 text-sm font-black transition-all ${mobileWorkspaceView === 'LIST' ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200' : 'text-slate-600'}`}
                        >
                            최종목록
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 xl:gap-6 h-full min-h-0">
                   <div className={`xl:col-span-4 flex flex-col gap-4 ${mobileWorkspaceView === 'TOOLS' ? 'flex' : 'hidden'} xl:flex`}>
                             {highRiskHighlights.length > 0 && (
                                 <div className="bg-white rounded-2xl p-4 border border-red-200 shadow-sm sticky top-2 z-10">
                                     <div className="flex items-center gap-2 mb-3">
                                         <AlertTriangle size={16} className="text-red-500"/>
                                         <h3 className="font-black text-red-900 text-sm">상위위험 고정 섹션</h3>
                                         <span className="text-[10px] font-black px-2 py-1 rounded-full bg-red-100 text-red-700">{highRiskHighlights.length}건</span>
                                     </div>
                                     <div className="space-y-2">
                                         {highRiskHighlights.map((risk, idx) => (
                                             <div key={`${risk.content}-${idx}-fixed`} className="rounded-xl border border-red-100 bg-red-50/60 p-3">
                                                  <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-[10px] font-black px-2 py-0.5 rounded bg-red-500 text-white">상위험</span>
                                                        <span className="text-[10px] font-bold text-slate-500">{risk.category}</span>
                                                  </div>
                                                  <p className="text-xs font-bold text-slate-800 leading-snug">{risk.content}</p>
                                                  <p className="mt-2 text-[11px] text-slate-600 leading-relaxed">{risk.actionNote}</p>
                                             </div>
                                         ))}
                                     </div>
                                     <button
                                         type="button"
                                         onClick={handleCopyAllActionNotes}
                                         className="mt-3 w-full rounded-xl bg-slate-900 text-white py-3 text-xs font-black min-h-[48px] flex items-center justify-center gap-2"
                                     >
                                         <Copy size={14}/> 즉시조치 메모 일괄 복사
                                     </button>
                                 </div>
                             )}

                      {/* Manual Input */}
                      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                         <h3 className="font-bold text-slate-700 mb-3 text-sm flex items-center gap-2"><Plus size={16}/> 수동 항목 추가</h3>
                         <div className="flex flex-col gap-2">
                           <div className="flex flex-col sm:flex-row gap-2">
                              <select 
                                 value={manualCategory} 
                                 onChange={(e) => setManualCategory(e.target.value)}
                                 className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-3 text-xs font-bold w-full sm:w-24 outline-none min-h-[48px]"
                              >
                                 <option value="공통">공통</option>
                                 <option value="형틀">형틀</option>
                                 <option value="철근">철근</option>
                              </select>
                              <input 
                                 type="text" 
                                 value={manualInput}
                                 onChange={(e) => setManualInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && addManualPriority()}
                                 placeholder="내용 입력..."
                                            className="flex-1 border border-slate-300 rounded-lg px-3 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none min-h-[48px]"
                              />
                           </div>
                                    <button onClick={addManualPriority} aria-label="수동 입력 위험요소 추가하기" className="w-full bg-slate-800 text-white py-3 rounded-lg text-xs font-bold hover:bg-slate-700 min-h-[48px]">추가하기</button>
                         </div>
                      </div>

                      {/* Recover Deleted Items */}
                      {candidates.length > 0 && (
                         <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex-1 flex flex-col">
                           <h3 className="font-bold text-slate-700 mb-3 text-sm flex items-center gap-2">
                              <RefreshCcw size={16}/> 제외된 항목 ({candidates.length})
                           </h3>
                           <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar max-h-[300px]">
                              {candidates.map((item, idx) => (
                                 <div key={idx} className="bg-slate-50 p-2 rounded-lg border border-slate-100 flex justify-between items-center group">
                                    <span className="text-xs text-slate-600 truncate flex-1">{item.content}</span>
                                    <button onClick={() => addToFinal(item)} aria-label={`${item.content} 항목 다시 추가`} className="text-blue-500 hover:text-blue-700"><Plus size={16}/></button>
                                 </div>
                              ))}
                           </div>
                         </div>
                      )}
                   </div>

                   {/* Right: Active Priorities List */}
                         <div className={`xl:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-sm flex-col min-h-[420px] xl:h-[500px] ${mobileWorkspaceView === 'LIST' ? 'flex' : 'hidden'} xl:flex`}>
                             {highRiskHighlights.length > 0 && (
                                <div className="border-b border-red-100 bg-gradient-to-r from-red-50 to-amber-50 p-4 rounded-t-2xl">
                                    <div className="flex items-center gap-2 mb-3">
                                        <AlertTriangle size={16} className="text-red-500"/>
                                        <h4 className="text-sm font-black text-slate-800">상위위험 상단 요약</h4>
                                        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-red-100 text-red-700">상위 {highRiskHighlights.length}</span>
                                        <button
                                            type="button"
                                            onClick={handleCopyAllActionNotes}
                                            className="ml-auto inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[10px] font-black text-slate-700 border border-slate-200 hover:bg-slate-50"
                                        >
                                            <Copy size={11}/> 일괄 복사
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                        {highRiskHighlights.map((risk, idx) => (
                                            <div key={`${risk.content}-${idx}`} className="rounded-xl border border-red-100 bg-white/80 p-3">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-red-500 text-white">상위험</span>
                                                    <span className="text-[10px] font-bold text-slate-500">{risk.category}</span>
                                                </div>
                                                <p className="text-xs font-bold text-slate-800 leading-snug line-clamp-2">{risk.content}</p>
                                                <p className="mt-2 text-[11px] text-slate-600 leading-relaxed line-clamp-3">{risk.actionNote}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                             )}
                             <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-slate-50/50 rounded-t-2xl">
                                 <div className="flex items-center gap-2 min-w-0">
                            <ShieldCheck className="text-green-600" size={20}/>
                            <h3 className="font-bold text-slate-800">최종 관리 목록</h3>
                         </div>
                                 <div className="flex flex-col sm:flex-row gap-2 sm:items-center w-full sm:w-auto">
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setMobileListFilter('ALL')}
                                            className={`px-3 py-2 rounded-lg text-[11px] font-black border transition-colors min-h-[44px] ${mobileListFilter === 'ALL' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200'}`}
                                        >
                                            전체
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setMobileListFilter('HIGH')}
                                            className={`px-3 py-2 rounded-lg text-[11px] font-black border transition-colors min-h-[44px] ${mobileListFilter === 'HIGH' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-500 border-slate-200'}`}
                                        >
                                            상위험만
                                        </button>
                                    </div>
                                    <div className="relative w-full sm:w-auto">
                               <input 
                                   type="text" 
                                   placeholder="항목 검색..." 
                                   value={searchTerm}
                                   onChange={(e) => setSearchTerm(e.target.value)}
                                              className="pl-8 pr-3 py-3 text-xs font-bold border border-slate-300 rounded-lg outline-none focus:border-blue-500 w-full sm:w-40 min-h-[48px]"
                               />
                                         <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
                           </div>
                           
                           {previousAssessment && (
                                             <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-2 py-2 rounded-lg flex items-center gap-1 w-fit">
                                         <TrendingUp size={12}/> 기준월 {previousAssessment.month} 비교 중
                              </span>
                           )}
                         </div>
                      </div>

                      <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                         {(!activeAssessment.priorities || activeAssessment.priorities.length === 0) ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300">
                               <ShieldCheck size={48} className="mb-2 opacity-20"/>
                               <p>등록된 항목이 없습니다.</p>
                            </div>
                         ) : (
                            displayPriorities.length === 0 ? (
                                <div className="text-center py-10 text-slate-400 font-medium">검색 결과가 없습니다.</div>
                            ) : (
                                displayPriorities.map((item) => {
                                   const originalIndex = activeAssessment.priorities.findIndex(priority => priority === item);

                                   if (editingIndex === originalIndex) {
                                       return (
                                           <div key={originalIndex} className="p-3 rounded-xl border border-blue-400 bg-blue-50/50 flex flex-col gap-2 shadow-md">
                                               <div className="flex gap-2">
                                                   <input 
                                                       type="text"
                                                       value={editForm.content}
                                                       onChange={(e) => setEditForm({...editForm, content: e.target.value})}
                                                       className="flex-1 text-sm font-bold border border-blue-300 rounded px-2 py-1 outline-none"
                                                       placeholder="오타 수정..."
                                                       autoFocus
                                                   />
                                               </div>
                                               <textarea
                                                   value={editForm.actionNote}
                                                   onChange={(e) => setEditForm({...editForm, actionNote: e.target.value})}
                                                   className="w-full text-xs border border-blue-300 rounded px-3 py-2 outline-none bg-white resize-none"
                                                   rows={3}
                                                   placeholder="즉시조치 메모를 입력하세요. 예: 작업 전 난간 재확인, 팀장 구두전파 후 사진증빙"
                                               />
                                               <div className="flex justify-between items-center">
                                                   <div className="flex gap-2">
                                                       <select 
                                                           value={editForm.level} 
                                                           onChange={(e) => setEditForm({...editForm, level: e.target.value})}
                                                           className="text-xs font-bold border border-blue-300 rounded px-1 py-1 bg-white"
                                                       >
                                                           <option value="HIGH">상(High)</option>
                                                           <option value="GENERAL">일반</option>
                                                       </select>
                                                       <input 
                                                           type="text" 
                                                           value={editForm.category}
                                                           onChange={(e) => setEditForm({...editForm, category: e.target.value})}
                                                           className="w-20 text-xs font-bold border border-blue-300 rounded px-2 py-1 bg-white text-center"
                                                           placeholder="공종"
                                                       />
                                                   </div>
                                                   <div className="flex gap-1">
                                                       <button onClick={saveEditing} aria-label="위험요소 수정 저장" className="p-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1 text-xs font-bold px-3">
                                                           <Save size={14}/> 저장
                                                       </button>
                                                       <button onClick={cancelEditing} aria-label="위험요소 수정 취소" className="p-1.5 bg-white border border-slate-300 text-slate-600 rounded hover:bg-slate-50 flex items-center gap-1 text-xs font-bold px-3">
                                                           <X size={14}/> 취소
                                                       </button>
                                                   </div>
                                               </div>
                                           </div>
                                       );
                                   }

                                   let status: 'NEW' | 'CHANGED' | 'SAME' = 'SAME';
                                   if (previousAssessment && previousAssessment.priorities) {
                                      const prevItem = previousAssessment.priorities.find(p => p.content === item.content);
                                      if (!prevItem) {
                                         status = 'NEW';
                                      } else if (prevItem.level !== item.level) {
                                         status = 'CHANGED';
                                      }
                                   }

                                   return (
                                                  <div key={originalIndex} className={`p-3 rounded-xl border flex items-start gap-3 group transition-all ${status === 'NEW' ? 'bg-blue-50/50 border-blue-200' : 'bg-white border-slate-100 hover:border-blue-300'}`}>
                                         <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${item.level === 'HIGH' ? 'bg-red-500 text-white shadow-red-200 shadow-sm' : 'bg-slate-200 text-slate-600'}`}>
                                            {item.level === 'HIGH' ? '상' : '일반'}
                                         </div>
                                         
                                         <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                               {status === 'NEW' && <span className="text-[9px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded animate-pulse">NEW</span>}
                                               {status === 'CHANGED' && <span className="text-[9px] font-black bg-orange-500 text-white px-1.5 py-0.5 rounded">등급변경</span>}
                                               <CategoryBadge category={item.category} />
                                            </div>
                                            <p className="text-sm font-bold text-slate-800 leading-snug">{item.content}</p>
                                            {(item.level === 'HIGH' || item.actionNote) && (
                                                <div className="mt-3 rounded-xl border border-red-100 bg-red-50/70 p-3">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <AlertTriangle size={14} className="text-red-500"/>
                                                        <span className="text-[11px] font-black text-red-700">즉시조치 메모</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleCopyActionNote(item)}
                                                            className="ml-auto inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[10px] font-black text-red-600 border border-red-100 hover:bg-red-50"
                                                        >
                                                            <Copy size={11}/> 복사
                                                        </button>
                                                    </div>
                                                    <textarea
                                                        value={item.actionNote || ''}
                                                        onChange={(e) => handleActionNoteChange(originalIndex, e.target.value)}
                                                        className="w-full rounded-lg border border-red-100 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-red-200 resize-none"
                                                        rows={3}
                                                        placeholder="모바일 실무자용 즉시조치 메모를 입력하세요."
                                                    />
                                                </div>
                                            )}
                                         </div>

                                                      <div className="flex gap-1 opacity-100 xl:opacity-0 xl:group-hover:opacity-100 xl:group-focus-within:opacity-100 transition-opacity shrink-0">
                                                            <button onClick={() => startEditing(originalIndex, item)} aria-label={`${item.content} 항목 수정`} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="수정">
                                                <Edit2 size={16}/>
                                             </button>
                                                            <button onClick={() => removeFromFinal(originalIndex)} aria-label={`${item.content} 항목 삭제`} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="삭제">
                                                <Trash2 size={16}/>
                                             </button>
                                         </div>
                                      </div>
                                   );
                                })
                            )
                         )}
                      </div>
                   </div>
                </div>
             </>
          ) : (
             <div className="flex-1 flex flex-col items-center justify-center text-slate-400 animate-fade-in px-4 py-10">
                <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6 shadow-sm">
                    <ShieldCheck size={40} className="text-indigo-400"/>
                </div>
                <h3 className="text-2xl font-black text-slate-800 mb-2">위험성평가 관리 시작하기</h3>
                <p className="text-sm text-slate-500 max-w-md text-center leading-relaxed mb-8">
                   현장의 안전 기준이 되는 <strong>[최초 위험성평가]</strong>를 먼저 등록하고,<br/>
                   매월 변동되는 <strong>[월간/수시 평가]</strong>를 추가하여 빈틈없이 관리하세요.
                </p>
                
                     <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xl">
                   <button 
                     onClick={() => handleUploadClick('INITIAL')} 
                         aria-label="최초 위험성평가 문서 등록 시작(PDF/이미지)"
                             className="px-6 py-4 bg-indigo-600 text-white rounded-2xl text-sm font-bold hover:bg-indigo-700 shadow-xl shadow-indigo-200 flex items-center justify-center gap-3 transition-transform hover:scale-105 min-h-[52px]"
                   >
                     <Plus size={18}/> 최초 위험성평가 등록(PDF/이미지)
                   </button>
                   <button 
                      onClick={() => backupInputRef.current?.click()} 
                         aria-label="기존 위험성평가 데이터 복구 파일 업로드(JSON)"
                             className="px-6 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl text-sm font-bold hover:bg-slate-50 hover:border-slate-300 flex items-center justify-center gap-3 transition-colors min-h-[52px]"
                   >
                     <Upload size={18}/> 기존 데이터 복구(JSON)
                   </button>
                </div>
             </div>
          )}
       </div>

       {activeAssessment && (
           <div className="xl:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur px-3 py-3 shadow-[0_-10px_30px_rgba(15,23,42,0.12)]">
               <div className="mb-2 flex items-center justify-between gap-3 rounded-2xl bg-slate-100 px-3 py-2">
                   <div className="min-w-0">
                       <p className="text-[10px] font-bold text-slate-500">현재 선택</p>
                       <p className="text-xs font-black text-slate-800 truncate">{activeAssessment.fileName}</p>
                   </div>
                   <div className="shrink-0 text-right">
                       <p className="text-[10px] font-bold text-slate-500">상위험</p>
                       <p className="text-xs font-black text-red-600">{stats?.high || 0}건</p>
                   </div>
               </div>
               <div className="grid grid-cols-4 gap-2">
                   <button
                       type="button"
                       onClick={() => setMobilePrimaryView('LIBRARY')}
                       className={`rounded-2xl px-2 py-3 text-[11px] font-black min-h-[56px] transition-colors ${mobilePrimaryView === 'LIBRARY' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                   >
                       평가목록
                   </button>
                   <button
                       type="button"
                       onClick={() => {
                           setMobilePrimaryView('DETAIL');
                           setMobileWorkspaceView('TOOLS');
                       }}
                       className={`rounded-2xl px-2 py-3 text-[11px] font-black min-h-[56px] transition-colors ${mobilePrimaryView === 'DETAIL' && mobileWorkspaceView === 'TOOLS' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                   >
                       실무도구
                   </button>
                   <button
                       type="button"
                       onClick={() => {
                           setMobilePrimaryView('DETAIL');
                           setMobileWorkspaceView('LIST');
                       }}
                       className={`rounded-2xl px-2 py-3 text-[11px] font-black min-h-[56px] transition-colors ${mobilePrimaryView === 'DETAIL' && mobileWorkspaceView === 'LIST' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                   >
                       최종목록
                   </button>
                   <button
                       type="button"
                       onClick={() => {
                           setMobilePrimaryView('DETAIL');
                           setMobileWorkspaceView('LIST');
                           setMobileListFilter(prev => prev === 'ALL' ? 'HIGH' : 'ALL');
                       }}
                       className={`rounded-2xl px-2 py-3 text-[11px] font-black min-h-[56px] transition-colors ${mobileListFilter === 'HIGH' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                   >
                       상위험
                   </button>
               </div>
               <button
                   type="button"
                   onClick={() => handleUploadClick(activeAssessment.type === 'INITIAL' ? 'INITIAL' : 'MONTHLY')}
                   className="mt-2 w-full rounded-2xl bg-blue-600 text-white py-3 text-xs font-black min-h-[52px] shadow-lg shadow-blue-200"
               >
                   문서 분석/추가 바로가기
               </button>
           </div>
       )}

       {/* Regular Assessment Modal */}
       {showRegularBuilder && (
           <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-fade-in">
               <div ref={regularBuilderDialogRef} role="dialog" aria-modal="true" aria-labelledby="regular-assessment-dialog-title" aria-describedby="regular-assessment-dialog-desc" onKeyDown={handleRegularDialogKeyDown} className="bg-white rounded-[24px] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                   <div className="bg-indigo-900 text-white p-6 shrink-0 relative overflow-hidden">
                       <div className="absolute inset-0 bg-gradient-to-r from-indigo-900 to-indigo-800"></div>
                       <div className="absolute right-0 top-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                       <div className="relative z-10 flex justify-between items-start">
                           <div>
                               <div className="flex items-center gap-2 mb-2 text-indigo-300">
                                   <Scale size={18} />
                                   <span className="text-xs font-bold uppercase tracking-wider">Legal Compliance Module (2026)</span>
                               </div>
                               <h2 id="regular-assessment-dialog-title" className="text-2xl font-black">정기 위험성평가 수립 마법사</h2>
                               <p id="regular-assessment-dialog-desc" className="text-sm text-indigo-200 mt-1 opacity-80">최초평가(전체) + 월간평가(추가분) = 차기 정기평가(통합)</p>
                           </div>
                           <button ref={regularBuilderCloseButtonRef} onClick={handleCloseRegularBuilder} aria-label="정기 위험성평가 수립 마법사 닫기" className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={20}/></button>
                       </div>
                   </div>

                   <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                       {regularStep === 'SELECT' ? (
                           <div className="max-w-2xl mx-auto py-6">
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                                   <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
                                       <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                                           <FileJson size={24} />
                                       </div>
                                       <h3 className="text-lg font-bold text-slate-800 mb-2">1. 기초 데이터 (필수)</h3>
                                       <p className="text-xs text-slate-500 mb-4 h-10">
                                           기존에 수립된 '최초' 또는 '전년도 정기' 평가를 선택하세요.<br/>이 데이터가 전체 항목의 기준(Baseline)이 됩니다.
                                       </p>
                                       <div className="relative">
                                           <select 
                                               value={baseAssessmentId} 
                                               onChange={(e) => setBaseAssessmentId(e.target.value)}
                                               aria-label="정기평가 기준 기초 데이터 선택"
                                               className="w-full text-sm font-bold border border-slate-300 rounded-xl p-3 appearance-none outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 bg-white"
                                           >
                                               <option value="">선택 안함</option>
                                               {initialAssessments.map(a => (
                                                   <option key={a.id} value={a.id}>{a.type === 'INITIAL' ? '[최초]' : '[정기]'} {a.fileName}</option>
                                               ))}
                                           </select>
                                           <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
                                       </div>
                                   </div>

                                   <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
                                       <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
                                           <Calendar size={24} />
                                       </div>
                                       <h3 className="text-lg font-bold text-slate-800 mb-2">2. 분석 연도 (필수)</h3>
                                       <p className="text-xs text-slate-500 mb-4 h-10">
                                           해당 연도에 등록된 '월간/수시 평가' 데이터를 모두 스캔하여<br/>새롭게 발견된 위험 요인을 병합합니다.
                                       </p>
                                       <input 
                                           type="number" 
                                           value={regularTargetYear} 
                                           onChange={(e) => setRegularTargetYear(e.target.value)}
                                           aria-label="정기평가 분석 연도 입력"
                                           className="w-full text-center font-bold text-lg border border-slate-300 rounded-xl py-2.5 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none"
                                       />
                                   </div>
                               </div>

                               <div className="mt-8 flex justify-center">
                                   <div className="hidden md:flex items-center gap-4 text-slate-400 text-sm font-bold mb-8">
                                       <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full">기준 데이터(전체)</span>
                                       <Plus size={16}/>
                                       <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full">증분 데이터(신규 위험)</span>
                                       <ArrowRight size={16}/>
                                       <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full">정기평가 통합본</span>
                                   </div>
                               </div>

                               <button 
                                   onClick={handleAnalyzeRegular}
                                   aria-label="기초 데이터와 월간 데이터를 병합 분석 시작"
                                   className="w-full bg-indigo-600 text-white font-bold rounded-xl py-4 hover:bg-indigo-700 shadow-xl shadow-indigo-200 transition-all flex items-center justify-center gap-3 text-lg"
                               >
                                   <GitMerge size={24} /> 데이터 병합 및 분석 시작
                               </button>
                           </div>
                       ) : (
                           <div className="h-full flex flex-col">
                               <div className="mb-4 shrink-0">
                                   <div className="flex justify-between items-center mb-2">
                                       <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                           <CheckCircle2 size={18} className="text-emerald-500"/>
                                           분석 결과: 총 {aggregatedRisks.length}개 항목 도출
                                       </h3>
                                       <div className="flex gap-2">
                                           <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">
                                               기존(Base): {aggregatedRisks.filter(r => r.source === 'INITIAL').length}
                                           </span>
                                           <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100">
                                               신규(Added): {aggregatedRisks.filter(r => r.source === 'ADDED').length}
                                           </span>
                                       </div>
                                   </div>
                                   <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-xl flex items-start gap-2">
                                       <Scale size={16} className="text-indigo-600 shrink-0 mt-0.5"/>
                                       <p className="text-xs text-indigo-800 font-bold leading-relaxed">
                                           [2026 안전보건규칙 준수 확인]<br/>
                                           본 데이터는 산업안전보건법 제36조에 의거, 1년간의 수시/월간 평가(근로자 청취 및 빈도 분석) 결과를 정기 평가에 반영(환류)한 것으로 법적 효력을 갖습니다.
                                       </p>
                                   </div>
                               </div>

                               <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                                   {aggregatedRisks.map((risk, idx) => (
                                       <div key={idx} className={`bg-white p-4 rounded-xl border shadow-sm flex items-start gap-4 group transition-colors ${risk.source === 'ADDED' ? 'border-blue-200 bg-blue-50/10' : 'border-slate-200'}`}>
                                            <div className="flex flex-col items-center gap-1 shrink-0">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs ${risk.level === 'HIGH' ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                                    {risk.level === 'HIGH' ? '상' : '일반'}
                                                </div>
                                                <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-1.5 rounded">{risk.category}</span>
                                            </div>
                                            
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    {risk.source === 'ADDED' && (
                                                        <span className="text-[9px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded animate-pulse">NEW (월간발굴)</span>
                                                    )}
                                                    {risk.source === 'INITIAL' && (
                                                        <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">기존항목</span>
                                                    )}
                                                </div>
                                                <p className="text-sm font-bold text-slate-800 leading-snug">{risk.content}</p>
                                                <div className="mt-2 flex gap-2 flex-wrap">
                                                    {risk.frequency > 0 && (
                                                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100 flex items-center gap-1">
                                                            <AlertTriangle size={10}/> {risk.frequency}회 반복 발생 (중점관리 필요)
                                                        </span>
                                                    )}
                                                    {risk.months.map(m => (
                                                        <span key={m} className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{m}월</span>
                                                    ))}
                                                </div>
                                            </div>

                                            <button 
                                                    onClick={() => handleRemoveAggregatedItem(idx)}
                                                    aria-label={`${risk.content} 항목 제외`}
                                                className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                                                title="목록에서 제외"
                                            >
                                                <X size={18} />
                                            </button>
                                       </div>
                                   ))}
                               </div>
                           </div>
                       )}
                   </div>

                   {/* Footer Actions */}
                   {regularStep === 'REVIEW' && (
                       <div className="p-4 bg-white border-t border-slate-100 flex justify-end gap-3 shrink-0">
                           <button 
                               onClick={() => setRegularStep('SELECT')}
                               aria-label="정기평가 설정 단계로 돌아가기"
                               className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-colors"
                           >
                               뒤로가기
                           </button>
                           <button 
                               onClick={handleCreateRegularAssessment}
                               aria-label="정기 위험성평가 확정 및 저장"
                               className="px-8 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-colors flex items-center gap-2"
                           >
                               <Save size={18} /> 정기평가 확정 및 저장
                           </button>
                       </div>
                   )}
               </div>
           </div>
       )}

       <ConfirmDialog
           isOpen={confirmDialogState.isOpen}
           title={confirmDialogState.title}
           message={confirmDialogState.message}
           confirmLabel={confirmDialogState.confirmLabel}
           cancelLabel={confirmDialogState.cancelLabel}
           variant={confirmDialogState.variant}
           onConfirm={() => closeConfirmDialog(true)}
           onCancel={() => closeConfirmDialog(false)}
       />
    </div>
  );
};
