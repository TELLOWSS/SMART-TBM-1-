
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TBMEntry, RiskAssessmentItem, SafetyGuideline, TeamOption, TBMAnalysisResult } from '../types';
import { analyzeTBMLog, evaluateTBMVideo } from '../services/geminiService';
import { compressVideo } from '../utils/videoUtils';
import { Upload, Camera, Sparkles, AlertTriangle, CheckCircle2, Loader2, FileText, X, ShieldCheck, Layers, ArrowLeft, Trash2, Film, Save, ZoomIn, ZoomOut, Maximize, Minimize, RotateCw, Clock, Plus, Check, PlayCircle, BarChart, Mic, Volume2, Edit2, RefreshCcw, Target, Eye, AlertOctagon, UserCheck } from 'lucide-react';

interface TBMFormProps {
  onSave: (entry: TBMEntry, shouldExit?: boolean) => void;
  onCancel: () => void;
  monthlyGuidelines: SafetyGuideline[];
  initialData?: TBMEntry;
  onDelete?: (id: string) => void;
  teams: TeamOption[]; // NEW PROP: Dynamic teams list
}

interface SavedFormState {
  entryDate: string;
  entryTime: string;
  teamId: string;
  leaderName: string;
  attendeesCount: number;
  workDescription: string;
  riskFactors: RiskAssessmentItem[];
  safetyFeedback: string[];
  tbmPhotoPreview: string | null;
  tbmVideoPreview: string | null;
  tbmVideoFileName: string | null;
  currentLogBase64: string | null;
  videoAnalysis: TBMAnalysisResult | null; // NEW: Save Analysis State
}

interface QueueItem {
  id: string;
  file: File;
  previewUrl: string | null;
  isPdf: boolean;
  status: 'pending' | 'processing' | 'done';
  teamsRegistered: string[]; // List of team names registered for this doc
  savedFormData?: SavedFormState; // Snapshot of form state for restoration
}

export const TBMForm: React.FC<TBMFormProps> = ({ onSave, onCancel, monthlyGuidelines, initialData, onDelete, teams }) => {
  // --- Global State ---
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [activeQueueId, setActiveQueueId] = useState<string | null>(null);

  // --- Workspace State ---
  // Image Viewer State
  const [viewerMode, setViewerMode] = useState<'fit' | 'scroll'>('fit'); 
  const [imgRotation, setImgRotation] = useState(0);
  const [imgScale, setImgScale] = useState(1);
  
  // Form Fields
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [entryTime, setEntryTime] = useState(new Date().toTimeString().substring(0, 5));
  const [teamId, setTeamId] = useState(teams[0]?.id || '');
  const [leaderName, setLeaderName] = useState('');
  const [attendeesCount, setAttendeesCount] = useState<number>(0);
  const [workDescription, setWorkDescription] = useState('');
  const [riskFactors, setRiskFactors] = useState<RiskAssessmentItem[]>([]);
  const [safetyFeedback, setSafetyFeedback] = useState<string[]>([]);
  
  // Media State
  const [tbmPhotoFile, setTbmPhotoFile] = useState<File | null>(null);
  const [tbmPhotoPreview, setTbmPhotoPreview] = useState<string | null>(null);
  
  const [tbmVideoFile, setTbmVideoFile] = useState<File | null>(null);
  const [tbmVideoPreview, setTbmVideoPreview] = useState<string | null>(null);
  const [tbmVideoFileName, setTbmVideoFileName] = useState<string | null>(null);
  
  // New: Video Analysis State
  const [videoAnalysis, setVideoAnalysis] = useState<TBMAnalysisResult | null>(null);
  const [isVideoAnalyzing, setIsVideoAnalyzing] = useState(false);
  const [videoStatusMessage, setVideoStatusMessage] = useState<string>(''); // Progress Message
  const [isEditingAnalysis, setIsEditingAnalysis] = useState(false); // To allow manual correction

  // New: Safety Feedback Editing State
  const [editingFeedbackIndex, setEditingFeedbackIndex] = useState<number | null>(null);
  const [tempFeedbackText, setTempFeedbackText] = useState("");

  // Current Doc Base64 (for AI analysis)
  const [currentLogBase64, setCurrentLogBase64] = useState<string | null>(null);

  // UI State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  
  // Refs
  const queueInputRef = useRef<HTMLInputElement>(null);
  const sidebarInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // --- Helpers ---
  
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const MAX_WIDTH = 1024; // Limit width to 1024px for storage efficiency

          if (width > MAX_WIDTH) {
            height = Math.round((height *= MAX_WIDTH / width));
            width = MAX_WIDTH;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
             ctx.drawImage(img, 0, 0, width, height);
             // Compress to JPEG at 70% quality
             const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
             resolve(dataUrl);
          } else {
             reject(new Error("Canvas context unavailable"));
          }
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const getCurrentFormState = (): SavedFormState => ({
    entryDate, entryTime, teamId, leaderName, attendeesCount,
    workDescription, riskFactors, safetyFeedback,
    tbmPhotoPreview, tbmVideoPreview, tbmVideoFileName, currentLogBase64,
    videoAnalysis
  });

  const resetFormFields = () => {
     // Keep Date/Time as is usually, but reset other specific fields
     setTeamId(teams[0]?.id || '');
     setLeaderName('');
     setAttendeesCount(0);
     setWorkDescription('');
     setRiskFactors([]);
     setSafetyFeedback([]);
     setTbmPhotoFile(null);
     setTbmPhotoPreview(null);
     setTbmVideoFile(null);
     setTbmVideoPreview(null);
     setTbmVideoFileName(null);
     setVideoAnalysis(null);
     setIsEditingAnalysis(false);
     setVideoStatusMessage('');
     setEditingFeedbackIndex(null);
     
     // Reset File inputs
     if (photoInputRef.current) photoInputRef.current.value = '';
     if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const restoreFormData = (data: SavedFormState) => {
    setEntryDate(data.entryDate);
    setEntryTime(data.entryTime);
    setTeamId(data.teamId);
    setLeaderName(data.leaderName);
    setAttendeesCount(data.attendeesCount);
    setWorkDescription(data.workDescription);
    setRiskFactors(data.riskFactors || []);
    setSafetyFeedback(data.safetyFeedback || []);
    setTbmPhotoPreview(data.tbmPhotoPreview);
    setTbmVideoPreview(data.tbmVideoPreview);
    setTbmVideoFileName(data.tbmVideoFileName);
    setCurrentLogBase64(data.currentLogBase64);
    setVideoAnalysis(data.videoAnalysis || null);
    
    // Reset viewer
    setViewerMode('fit');
    setImgRotation(0);
    setImgScale(1);
  };

  // --- Editable Risk Factors Helpers ---
  const handleRiskChange = (index: number, field: 'risk' | 'measure', value: string) => {
    const newRisks = [...riskFactors];
    newRisks[index] = { ...newRisks[index], [field]: value };
    setRiskFactors(newRisks);
  };

  const addRiskFactor = () => {
    setRiskFactors([...riskFactors, { risk: '', measure: '' }]);
  };

  const removeRiskFactor = (index: number) => {
    const newRisks = riskFactors.filter((_, i) => i !== index);
    setRiskFactors(newRisks);
  };

  // --- Safety Feedback Editing Helpers ---
  const startEditingFeedback = (index: number, text: string) => {
      setEditingFeedbackIndex(index);
      setTempFeedbackText(text);
  };

  const saveEditingFeedback = () => {
      if (editingFeedbackIndex !== null) {
          const newFeedback = [...safetyFeedback];
          newFeedback[editingFeedbackIndex] = tempFeedbackText;
          setSafetyFeedback(newFeedback);
          setEditingFeedbackIndex(null);
      }
  };

  const cancelEditingFeedback = () => {
      setEditingFeedbackIndex(null);
  };


  // --- Manual Analysis Edit Helpers (Fixed for Reliability) ---
  const updateAnalysis = (updater: (prev: TBMAnalysisResult) => TBMAnalysisResult) => {
    setVideoAnalysis(prev => {
        if (!prev) return null;
        return updater(prev);
    });
  };

  // --- Reactive Workspace Loader ---
  useEffect(() => {
    if (!activeQueueId) return;

    const item = queue.find(q => q.id === activeQueueId);
    if (!item) return;

    if (item.status === 'pending') {
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'processing' } : q));
    }

    if (item.savedFormData) {
       restoreFormData(item.savedFormData);
    } else {
       resetFormFields();
       const reader = new FileReader();
       reader.onload = (event) => {
          setCurrentLogBase64(event.target?.result as string);
       };
       reader.readAsDataURL(item.file);
       setViewerMode('fit');
       setImgRotation(0);
       setImgScale(1);
    }

  }, [activeQueueId]);

  // --- Initialization (Edit Mode) ---
  useEffect(() => {
    if (initialData) {
      const fakeId = 'edit-mode';
      
      // Protect data from reset by creating a saved state snapshot
      const formState: SavedFormState = {
        entryDate: initialData.date || new Date().toISOString().split('T')[0],
        entryTime: initialData.time || '00:00',
        teamId: initialData.teamId || teams[0]?.id || '',
        leaderName: initialData.leaderName || '',
        attendeesCount: initialData.attendeesCount || 0,
        workDescription: initialData.workDescription || '',
        riskFactors: initialData.riskFactors || [],
        safetyFeedback: initialData.safetyFeedback || [],
        tbmPhotoPreview: initialData.tbmPhotoUrl || null,
        tbmVideoPreview: initialData.tbmVideoUrl || null,
        tbmVideoFileName: initialData.tbmVideoFileName || null,
        currentLogBase64: initialData.originalLogImageUrl || null,
        videoAnalysis: initialData.videoAnalysis || null
      };

      setQueue([{
          id: fakeId, 
          file: new File([], "기존 기록 수정"), 
          previewUrl: initialData.originalLogImageUrl || null, 
          isPdf: initialData.originalLogMimeType === 'application/pdf',
          status: 'processing',
          teamsRegistered: [initialData.teamName],
          savedFormData: formState // Key fix: inject data here
      }]);
      setActiveQueueId(fakeId);
      
      // Also set immediate state to prevent flicker
      restoreFormData(formState);
    }
  }, [initialData, teams]);

  // --- Queue Actions ---

  const handleBatchUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files) as File[];
      const newItems: QueueItem[] = files.map(file => ({
        id: `FILE-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        file,
        isPdf: file.type === 'application/pdf',
        previewUrl: URL.createObjectURL(file),
        status: 'pending',
        teamsRegistered: []
      }));
      setQueue(prev => [...prev, ...newItems]);
      
      if (!activeQueueId && newItems.length > 0) {
        setActiveQueueId(newItems[0].id);
      }
    }
  };

  const removeFromQueue = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation(); 
    e?.nativeEvent.stopImmediatePropagation();
    
    if (confirm("이 파일을 작업 목록에서 제거하시겠습니까?")) {
        const newQueue = queue.filter(item => item.id !== id);
        setQueue(newQueue);
        if (activeQueueId === id) {
           if (newQueue.length > 0) {
              setActiveQueueId(newQueue[0].id);
           } else {
              setActiveQueueId(null);
           }
        }
    }
  };

  // --- Analysis Logic ---

  const handleAnalyze = async () => {
    const activeItem = queue.find(q => q.id === activeQueueId);
    if (!activeItem || !currentLogBase64) return;

    setIsAnalyzing(true);
    try {
      const base64Data = currentLogBase64.split(',')[1];
      const targetTeamName = teams.find(t => t.id === teamId)?.name;
      
      const result = await analyzeTBMLog(base64Data, activeItem.file.type, monthlyGuidelines, targetTeamName);
      
      setLeaderName(result.leaderName);
      setAttendeesCount(result.attendeesCount);
      setWorkDescription(result.workDescription);
      setRiskFactors(result.riskFactors || []);
      setSafetyFeedback(result.safetyFeedback || []);
      
    } catch (err) {
      console.error(err);
      alert("분석 중 오류가 발생했습니다. 직접 입력해주세요.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- Updated Video Audit Logic for Robustness ---
  const handleVideoAudit = async () => {
    if (!tbmVideoFile) {
      alert("분석할 동영상 파일이 없습니다.");
      return;
    }

    setIsVideoAnalyzing(true);
    // 상태 메시지 초기화
    setVideoStatusMessage("⏳ AI 분석을 위해 핵심 구간(10초) 추출 및 압축 중...");
    
    try {
      // 1. 압축 시도 (compressVideo 내부에서 10초 컷, 10fps, 저해상도 변환 수행)
      const compressedBlob = await compressVideo(tbmVideoFile);

      setVideoStatusMessage(`✅ 최적화 완료! (${(compressedBlob.size / 1024).toFixed(1)} KB)\nAI 서버로 전송 중...`);

      // 2. Base64 변환
      const reader = new FileReader();
      reader.readAsDataURL(compressedBlob);
      
      reader.onload = async (e) => {
        const base64String = e.target?.result as string;
        if (base64String) {
           const base64Data = base64String.split(',')[1];
           const mimeTypeToProcess = compressedBlob.type || 'video/webm'; 
           
           // 3. Call AI API
           try {
               const analysis = await evaluateTBMVideo(base64Data, mimeTypeToProcess, workDescription);
               setVideoAnalysis(analysis);
               setIsEditingAnalysis(false); 
           } catch (apiError) {
               console.error(apiError);
               alert("AI 서버 분석 실패. 잠시 후 다시 시도해주세요.");
           }
        }
        setIsVideoAnalyzing(false);
        setVideoStatusMessage('');
      };
      
      reader.onerror = () => {
         alert("파일 처리 중 오류가 발생했습니다.");
         setIsVideoAnalyzing(false);
         setVideoStatusMessage('');
      }

    } catch (error: any) {
       console.error(error);
       alert(`영상 처리 실패: ${error.message || "알 수 없는 오류"}`);
       setIsVideoAnalyzing(false);
       setVideoStatusMessage('');
    }
  };

  // --- Save Logic ---

  const handleSave = (action: 'next_team' | 'finish_doc') => {
    if (!tbmPhotoPreview) {
      alert("⚠ TBM 증빙 사진은 필수입니다.\n하단의 사진 추가 버튼을 눌러주세요.");
      return;
    }

    const currentTeamName = teams.find(t => t.id === teamId)?.name || '알 수 없음';
    const isEditMode = !!initialData;
    
    // Clean up analysis data before saving (remove empty strings from missingTopics)
    const cleanedAnalysis = videoAnalysis ? {
        ...videoAnalysis,
        insight: {
            ...videoAnalysis.insight,
            missingTopics: videoAnalysis.insight.missingTopics.filter(t => t.trim().length > 0)
        }
    } : null;

    // We can't use getCurrentFormState directly here because we modified videoAnalysis
    // So we reconstruct it partially
    const newEntry: TBMEntry = {
      id: isEditMode ? String(initialData.id) : `ENTRY-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      date: entryDate,
      time: entryTime,
      teamId,
      teamName: currentTeamName,
      leaderName,
      attendeesCount,
      workDescription,
      riskFactors,
      safetyFeedback,
      tbmPhotoUrl: tbmPhotoPreview,
      tbmVideoUrl: tbmVideoPreview || undefined,
      tbmVideoFileName: tbmVideoFileName || undefined,
      videoAnalysis: cleanedAnalysis || undefined, // Save cleaned analysis
      originalLogImageUrl: currentLogBase64 || undefined,
      originalLogMimeType: isEditMode 
        ? initialData.originalLogMimeType 
        : (queue.find(q => q.id === activeQueueId)?.isPdf ? 'application/pdf' : 'image/jpeg'),
      createdAt: isEditMode ? initialData.createdAt : Date.now(),
    };
    
    // Also update current state to reflect cleaned data (for UI consistency if we stay on page)
    if (videoAnalysis) setVideoAnalysis(cleanedAnalysis);

    // 1. Save Data First
    try {
        onSave(newEntry, false); 
    } catch (error) {
        console.error("Save failed:", error);
        alert("저장 실패: 브라우저 저장 공간이 부족할 수 있습니다.");
        return;
    }

    // 2. Handle Navigation & Alerts
    setTimeout(() => {
        if (isEditMode) {
            alert("수정되었습니다.");
            onSave(newEntry, true); 
            return;
        }

        const currentIndex = queue.findIndex(q => q.id === activeQueueId);
        let nextIdToActivate: string | null = null;
        
        const currentFormState = {
            entryDate, entryTime, teamId, leaderName, attendeesCount,
            workDescription, riskFactors, safetyFeedback,
            tbmPhotoPreview, tbmVideoPreview, tbmVideoFileName, currentLogBase64,
            videoAnalysis: cleanedAnalysis 
        };

        if (action === 'finish_doc') {
           const forwardCandidate = queue.slice(currentIndex + 1).find(q => q.status !== 'done');
           if (forwardCandidate) {
               nextIdToActivate = forwardCandidate.id;
           } else {
               const backwardCandidate = queue.slice(0, currentIndex).find(q => q.status !== 'done');
               if (backwardCandidate) {
                   nextIdToActivate = backwardCandidate.id;
               }
           }
        }

        setQueue(prevQueue => {
            return prevQueue.map(q => {
                if (q.id === activeQueueId) {
                    return {
                        ...q,
                        teamsRegistered: [...q.teamsRegistered, currentTeamName],
                        status: action === 'finish_doc' ? 'done' : 'processing',
                        savedFormData: currentFormState
                    };
                }
                return q;
            });
        });

        if (action === 'next_team') {
            alert(`✅ [${currentTeamName}] 저장 완료! \n같은 문서에서 다른 팀 내용을 입력해주세요.`);
            resetFormFields();
        } else {
            if (nextIdToActivate) {
               alert(`✅ [${currentTeamName}] 저장 및 문서 완료.\n다음 대기 파일로 이동합니다.`);
               setActiveQueueId(nextIdToActivate); 
            } else {
               // LAST TEAM
               setTbmPhotoPreview(null);
               setCurrentLogBase64(null); 
               setTbmVideoPreview(null);
               setVideoAnalysis(null);
               
               setTimeout(() => {
                   alert(`✅ [${currentTeamName}] 저장 완료.\n모든 문서 작업이 완료되었습니다!`);
                   setActiveQueueId(null);
               }, 100);
            }
        }
    }, 100); 
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        const compressedBase64 = await compressImage(file);
        setTbmPhotoFile(file);
        setTbmPhotoPreview(compressedBase64); 
      } catch (err) {
        console.error("Image processing error", err);
        alert("이미지 처리 중 오류가 발생했습니다.");
      }
    }
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setTbmVideoFile(file);
      setTbmVideoPreview(URL.createObjectURL(file));
      setTbmVideoFileName(file.name);
      setVideoAnalysis(null); // Reset previous analysis when new file uploaded
      setIsEditingAnalysis(false);
      setVideoStatusMessage('');
    }
  };

  // --- Render ---

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-[#F8FAFC] flex flex-col animate-fade-in text-slate-800 font-sans">
        
        {/* Top Header */}
        <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm shrink-0 z-50">
           <div className="flex items-center gap-4">
              <button onClick={onCancel} className="text-slate-500 hover:text-slate-800 flex items-center gap-2 font-bold transition-colors">
                 <ArrowLeft size={20} />
                 <span>메인으로 나가기</span>
              </button>
              <div className="h-6 w-px bg-slate-200"></div>
              <h1 className="text-lg font-black text-slate-800 flex items-center gap-2">
                 <Layers className="text-blue-600" /> 스마트 TBM 통합 작업실
              </h1>
           </div>
           
           <div className="flex items-center gap-3">
              <div className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full flex items-center gap-2">
                 <span>진행 현황:</span>
                 <span className="text-blue-600">{queue.filter(q => q.status === 'done').length}</span>
                 <span className="text-slate-300">/</span>
                 <span>{queue.length} 파일</span>
              </div>
              <button 
                 onClick={() => onSave({} as any, true)} // Just exit
                 className="bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-700"
              >
                 작업 종료
              </button>
           </div>
        </div>

        {/* Main Workspace Layout */}
        <div className="flex-1 flex overflow-hidden">
           
           {/* LEFT SIDEBAR: File Queue */}
           <div className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 z-40">
              <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                 <button 
                    onClick={() => sidebarInputRef.current?.click()}
                    className="w-full py-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl font-bold text-sm hover:bg-blue-100 transition-colors flex items-center justify-center gap-2"
                 >
                    <Plus size={16} /> 파일 추가
                 </button>
                 <input ref={sidebarInputRef} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={handleBatchUpload}/>
              </div>
              
              <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                 {queue.length === 0 && (
                    <div className="text-center py-10 text-slate-400">
                       <p className="text-xs">등록된 파일이 없습니다.</p>
                    </div>
                 )}
                 {queue.map((item, idx) => {
                    const isActive = activeQueueId === item.id;
                    return (
                       <div 
                          key={item.id} 
                          onClick={() => setActiveQueueId(item.id)}
                          className={`
                             relative p-3 rounded-xl cursor-pointer border transition-all group
                             ${isActive 
                                ? 'bg-blue-50 border-blue-500 shadow-sm ring-1 ring-blue-50' 
                                : 'bg-white border-slate-100 hover:border-slate-300 hover:bg-slate-50'
                             }
                          `}
                       >
                          <div className="flex gap-3">
                             <div className={`w-12 h-12 rounded-lg bg-slate-100 shrink-0 overflow-hidden flex items-center justify-center border ${isActive ? 'border-blue-200' : 'border-slate-100'}`}>
                                {item.isPdf ? (
                                   <FileText size={20} className="text-slate-400"/>
                                ) : (
                                   <img src={item.previewUrl || ''} className="w-full h-full object-cover" alt="thumb"/>
                                )}
                             </div>
                             
                             <div className="flex-1 min-w-0 flex flex-col justify-center">
                                <div className="flex justify-between items-center mb-0.5">
                                   <span className="text-[10px] font-bold text-slate-500">#{idx + 1}</span>
                                   {item.status === 'done' && <CheckCircle2 size={12} className="text-green-500"/>}
                                   {item.status === 'processing' && <Loader2 size={12} className="text-blue-500 animate-spin"/>}
                                   {item.status === 'pending' && <Clock size={12} className="text-slate-300"/>}
                                </div>
                                <p className={`text-xs font-bold truncate ${isActive ? 'text-blue-700' : 'text-slate-700'}`}>
                                   {item.file.name}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                                   {item.teamsRegistered.length > 0 
                                      ? `${item.teamsRegistered.length}팀 완료` 
                                      : '대기 중'}
                                </p>
                             </div>
                          </div>
                          <button 
                             onClick={(e) => removeFromQueue(item.id, e)}
                             className="absolute -top-1.5 -right-1.5 bg-white text-slate-400 hover:text-red-500 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-full p-1.5 shadow-sm z-10 transition-all opacity-100"
                             title="목록에서 제거"
                          >
                             <Trash2 size={14} />
                          </button>
                       </div>
                    );
                 })}
              </div>
           </div>

           {/* MAIN AREA */}
           {activeQueueId ? (
              <div className="flex-1 flex overflow-hidden relative">
                 
                 {/* CENTER: Document Viewer */}
                 <div className="flex-1 bg-slate-900 relative flex flex-col overflow-hidden">
                    {/* Toolbar */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-700 shadow-2xl">
                       <button 
                         onClick={() => { setViewerMode('fit'); setImgScale(1); }}
                         className={`p-2 rounded-lg text-xs font-bold flex items-center gap-1 ${viewerMode === 'fit' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
                       >
                         <Minimize size={14}/> 전체
                       </button>
                       <button 
                         onClick={() => { setViewerMode('scroll'); setImgScale(1.5); }}
                         className={`p-2 rounded-lg text-xs font-bold flex items-center gap-1 ${viewerMode === 'scroll' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
                       >
                         <Maximize size={14}/> 확대
                       </button>
                       <div className="w-px h-4 bg-slate-600 mx-1"></div>
                       <button onClick={() => { setImgScale(s => Math.max(0.5, s - 0.25)); setViewerMode('scroll'); }} className="p-2 hover:bg-slate-700 text-white rounded-lg"><ZoomOut size={16}/></button>
                       <span className="text-white text-xs font-mono w-10 text-center">{Math.round(imgScale * 100)}%</span>
                       <button onClick={() => { setImgScale(s => Math.min(3, s + 0.25)); setViewerMode('scroll'); }} className="p-2 hover:bg-slate-700 text-white rounded-lg"><ZoomIn size={16}/></button>
                       <div className="w-px h-4 bg-slate-600 mx-1"></div>
                       <button onClick={() => setImgRotation(r => (r + 90) % 360)} className="p-2 hover:bg-slate-700 text-white rounded-lg"><RotateCw size={16}/></button>
                    </div>

                    {/* Image/PDF */}
                    <div className="flex-1 overflow-auto flex items-center justify-center p-8 custom-scrollbar">
                        {queue.find(q => q.id === activeQueueId)?.isPdf ? (
                           <object 
                              data={queue.find(q => q.id === activeQueueId)?.previewUrl!} 
                              type="application/pdf" 
                              className="w-full h-full min-h-[800px] shadow-2xl rounded-lg bg-white"
                           >
                              <div className="flex items-center justify-center h-full text-white">PDF Viewer Not Supported</div>
                           </object>
                        ) : (
                           <div 
                             className="relative transition-transform duration-200 ease-out origin-center"
                             style={{ 
                                transform: `rotate(${imgRotation}deg)`,
                                width: viewerMode === 'fit' ? 'auto' : `${imgScale * 100}%`,
                                height: viewerMode === 'fit' ? '100%' : 'auto', 
                             }}
                           >
                             <img 
                                src={queue.find(q => q.id === activeQueueId)?.previewUrl!} 
                                className={`rounded bg-white ${viewerMode === 'fit' ? 'max-w-full max-h-full object-contain' : 'w-full h-auto'}`}
                                alt="Log View"
                                style={{
                                   maxWidth: viewerMode === 'fit' ? '100%' : 'none',
                                   maxHeight: viewerMode === 'fit' ? '100%' : 'none',
                                }}
                             />
                           </div>
                        )}
                    </div>
                 </div>

                 {/* RIGHT: Form */}
                 <div className="w-[480px] bg-white border-l border-slate-200 flex flex-col h-full shadow-2xl z-30">
                    
                    {/* Form Header / Team Select */}
                    <div className="p-5 border-b border-slate-100 bg-slate-50/80 backdrop-blur-sm shrink-0">
                       <div className="flex items-end gap-2">
                          <div className="flex-1">
                             <label className="text-[11px] font-bold text-slate-500 mb-1 block uppercase">등록할 팀 선택</label>
                             <select 
                                value={teamId} 
                                onChange={(e) => setTeamId(e.target.value)}
                                className="w-full text-base font-bold text-slate-900 bg-white border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm"
                             >
                                {teams.map(t => (
                                   <option key={t.id} value={t.id}>
                                      {t.name}
                                   </option>
                                ))}
                             </select>
                          </div>
                          <button 
                             onClick={handleAnalyze}
                             disabled={isAnalyzing}
                             className="h-[46px] bg-slate-900 text-white px-4 rounded-lg font-bold hover:bg-blue-600 transition-colors shadow-md flex items-center gap-2 shrink-0 text-sm"
                          >
                             {isAnalyzing ? <Loader2 className="animate-spin" size={16}/> : <Sparkles size={16} className="text-yellow-400"/>}
                             추출
                          </button>
                       </div>
                       
                       {/* Registered Teams for this doc */}
                       <div className="mt-3 flex flex-wrap gap-1.5">
                          {queue.find(q => q.id === activeQueueId)?.teamsRegistered.map((team, i) => (
                             <span key={i} className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded border border-green-200 flex items-center gap-1">
                                <CheckCircle2 size={10}/> {team}
                             </span>
                          ))}
                       </div>
                    </div>

                    {/* Scrollable Form Fields */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar pb-24">
                       {/* Date & Time */}
                       <div className="grid grid-cols-2 gap-3">
                          <div>
                             <label className="text-[11px] font-bold text-slate-500 mb-1 block">일자</label>
                             <input type="date" value={entryDate} onChange={(e)=>setEntryDate(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 text-sm font-bold bg-slate-50"/>
                          </div>
                          <div>
                             <label className="text-[11px] font-bold text-slate-500 mb-1 block">시간</label>
                             <input type="time" value={entryTime} onChange={(e)=>setEntryTime(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 text-sm font-bold bg-slate-50"/>
                          </div>
                       </div>

                       {/* Leader & Attendees */}
                       <div className="grid grid-cols-2 gap-3">
                          <div>
                             <label className="text-[11px] font-bold text-slate-500 mb-1 block">팀장명</label>
                             <input type="text" value={leaderName} onChange={(e)=>setLeaderName(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 text-sm font-bold"/>
                          </div>
                          <div>
                             <label className="text-[11px] font-bold text-slate-500 mb-1 block">참석 인원</label>
                             <div className="relative">
                                <input type="number" value={attendeesCount} onChange={(e)=>setAttendeesCount(Number(e.target.value))} className="w-full border border-slate-300 rounded-lg p-2 text-sm font-bold"/>
                                <span className="absolute right-3 top-2 text-xs text-slate-400 font-bold">명</span>
                             </div>
                          </div>
                       </div>

                       {/* Work Description */}
                       <div>
                          <label className="text-[11px] font-bold text-slate-500 mb-1 block">작업 내용</label>
                          <textarea 
                             value={workDescription} 
                             onChange={(e)=>setWorkDescription(e.target.value)}
                             className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:border-blue-500 outline-none min-h-[80px] resize-none"
                             placeholder="작업 내용을 입력하세요."
                          />
                       </div>

                       {/* Risk Factors (EDITABLE) */}
                       <div className="bg-orange-50/50 rounded-xl border border-orange-100 p-3">
                          <div className="flex justify-between items-center mb-2">
                             <h4 className="text-[11px] font-bold text-orange-700 flex items-center gap-1">
                                <AlertTriangle size={12}/> 중점 위험 요인 (수정 가능)
                             </h4>
                             <button onClick={addRiskFactor} className="text-[10px] bg-white border border-orange-200 text-orange-600 px-2 py-0.5 rounded hover:bg-orange-50 font-bold transition-colors">
                                + 행 추가
                             </button>
                          </div>
                          <div className="space-y-2">
                             {(riskFactors || []).map((r, i) => (
                                <div key={i} className="bg-white p-2 rounded border border-orange-100 shadow-sm text-xs relative group">
                                   <button 
                                      onClick={() => removeRiskFactor(i)}
                                      className="absolute top-1 right-1 text-slate-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                      tabIndex={-1}
                                      title="삭제"
                                   >
                                      <X size={12}/>
                                   </button>
                                   <div className="flex gap-2 mb-1.5 items-start">
                                      <span className="text-red-500 font-bold w-7 shrink-0 mt-1">위험</span>
                                      <input 
                                          type="text" 
                                          value={r.risk}
                                          onChange={(e) => handleRiskChange(i, 'risk', e.target.value)}
                                          className="flex-1 bg-transparent border-b border-dashed border-slate-200 focus:border-orange-400 outline-none pb-0.5 text-slate-700 font-medium placeholder:text-slate-300 transition-colors"
                                          placeholder="위험 요인 입력 (오타 수정 가능)"
                                      />
                                   </div>
                                   <div className="flex gap-2 items-start">
                                      <span className="text-blue-500 font-bold w-7 shrink-0 mt-1">대책</span>
                                      <input 
                                          type="text" 
                                          value={r.measure}
                                          onChange={(e) => handleRiskChange(i, 'measure', e.target.value)}
                                          className="flex-1 bg-transparent border-b border-dashed border-slate-200 focus:border-blue-400 outline-none pb-0.5 text-slate-600 placeholder:text-slate-300 transition-colors"
                                          placeholder="안전 대책 입력"
                                      />
                                   </div>
                                </div>
                             ))}
                             {(!riskFactors || riskFactors.length === 0) && (
                                <div onClick={addRiskFactor} className="text-xs text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded cursor-pointer hover:bg-slate-50 transition-colors">
                                    등록된 위험 요인이 없습니다.<br/>
                                    <span className="underline">여기</span>를 눌러 추가하세요.
                                </div>
                             )}
                          </div>
                       </div>

                       {/* Feedback (Now Editable) */}
                       <div className="bg-blue-50/50 rounded-xl border border-blue-100 p-3">
                          <div className="flex justify-between items-center mb-2">
                             <h4 className="text-[11px] font-bold text-blue-700 flex items-center gap-1">
                                <ShieldCheck size={12}/> 안전 피드백
                             </h4>
                             <button onClick={()=>setShowFeedbackModal(true)} className="text-[10px] bg-white border border-blue-200 text-blue-600 px-2 py-0.5 rounded hover:bg-blue-50">
                                + 추가
                             </button>
                          </div>
                          <div className="space-y-1.5">
                             {(safetyFeedback || []).map((fb, i) => (
                                <div key={i} className="flex gap-2 items-start bg-white p-2 rounded border border-blue-100 text-xs text-slate-700 group">
                                   <CheckCircle2 size={12} className="text-blue-500 shrink-0 mt-0.5"/>
                                   
                                   <div className="flex-1 min-w-0">
                                       {editingFeedbackIndex === i ? (
                                           <div className="flex gap-1 items-start">
                                               <textarea 
                                                   value={tempFeedbackText}
                                                   onChange={(e) => setTempFeedbackText(e.target.value)}
                                                   className="flex-1 border border-blue-300 rounded p-1 outline-none text-xs bg-white"
                                                   rows={2}
                                                   autoFocus
                                               />
                                               <div className="flex flex-col gap-1">
                                                   <button onClick={saveEditingFeedback} className="bg-blue-600 text-white p-1 rounded hover:bg-blue-700"><Check size={12}/></button>
                                                   <button onClick={cancelEditingFeedback} className="bg-slate-200 text-slate-500 p-1 rounded hover:bg-slate-300"><X size={12}/></button>
                                               </div>
                                           </div>
                                       ) : (
                                           <span className="leading-tight block break-words">{fb}</span>
                                       )}
                                   </div>

                                   {editingFeedbackIndex !== i && (
                                       <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                           <button 
                                               onClick={() => startEditingFeedback(i, fb)}
                                               className="text-slate-300 hover:text-blue-600 p-0.5"
                                               title="수정"
                                           >
                                               <Edit2 size={12}/>
                                           </button>
                                           <button 
                                               onClick={()=>{
                                                  const newF = [...safetyFeedback];
                                                  newF.splice(i, 1);
                                                  setSafetyFeedback(newF);
                                               }} 
                                               className="text-slate-300 hover:text-red-500 p-0.5"
                                               title="삭제"
                                           >
                                               <X size={12}/>
                                           </button>
                                       </div>
                                   )}
                                </div>
                             ))}
                          </div>
                       </div>

                       {/* Media Upload */}
                       <div className="space-y-3">
                          <div className="flex gap-3">
                             <div className="flex-1 space-y-1">
                                <label className="text-[11px] font-bold text-slate-500 block">TBM 사진 (필수)</label>
                                {tbmPhotoPreview ? (
                                   <div className="relative aspect-video rounded-lg overflow-hidden border border-slate-200 group">
                                      <img src={tbmPhotoPreview} className="w-full h-full object-cover" alt="preview"/>
                                      <button onClick={()=>setTbmPhotoPreview(null)} className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                         <X size={12}/>
                                      </button>
                                   </div>
                                ) : (
                                   <div onClick={()=>photoInputRef.current?.click()} className="w-full aspect-video rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 bg-white">
                                      <Camera className="text-slate-300 mb-1" size={20}/>
                                      <span className="text-[10px] text-slate-400 font-bold">사진 추가</span>
                                   </div>
                                )}
                                <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload}/>
                             </div>
                             
                             <div className="flex-1 space-y-1">
                                <label className="text-[11px] font-bold text-slate-500 block">TBM 동영상</label>
                                {tbmVideoPreview ? (
                                   <div className="relative aspect-video rounded-lg overflow-hidden border border-slate-200 bg-black group">
                                      <video src={tbmVideoPreview} className="w-full h-full object-contain" controls />
                                      <button onClick={()=>{setTbmVideoPreview(null); setTbmVideoFileName(null); setVideoAnalysis(null);}} className="absolute top-1 right-1 bg-white/20 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 z-10">
                                         <X size={12}/>
                                      </button>
                                   </div>
                                ) : (
                                   <div onClick={()=>videoInputRef.current?.click()} className="w-full aspect-video rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 bg-white">
                                      <Film className="text-slate-300 mb-1" size={20}/>
                                      <span className="text-[10px] text-slate-400 font-bold">영상 추가</span>
                                   </div>
                                )}
                                <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoUpload}/>
                             </div>
                          </div>

                          {/* Video Audit Button */}
                          {tbmVideoPreview && !videoAnalysis && (
                             <div className="space-y-2">
                                <button 
                                   onClick={handleVideoAudit}
                                   disabled={isVideoAnalyzing}
                                   className="w-full py-3 bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 text-white rounded-xl font-bold text-xs shadow-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                                   style={{backgroundSize: '200% 100%'}}
                                >
                                   {isVideoAnalyzing ? <Loader2 size={16} className="animate-spin"/> : <Target size={16}/>}
                                   AI 심층 정밀 진단 (Deep Insight)
                                </button>
                                {isVideoAnalyzing && videoStatusMessage && (
                                   <div className="bg-slate-800 text-white text-[10px] p-2 rounded-lg text-center whitespace-pre-wrap">
                                      {videoStatusMessage}
                                   </div>
                                )}
                             </div>
                          )}
                          
                          {/* AI Deep Insight Result Card */}
                          {videoAnalysis && (
                             <div className="bg-white rounded-xl border border-indigo-100 shadow-xl overflow-hidden relative ring-1 ring-indigo-50">
                                
                                {/* Header */}
                                <div className="bg-gradient-to-r from-indigo-50 to-violet-50 p-4 border-b border-indigo-100 flex justify-between items-center">
                                   <div>
                                      <h4 className="text-sm font-black text-indigo-900 flex items-center gap-2">
                                         <Sparkles size={16} className="text-indigo-600"/> AI Deep Insight Report
                                      </h4>
                                      <p className="text-[10px] text-indigo-400 font-bold mt-0.5">Vision AI & Bias Analysis Engine</p>
                                   </div>
                                   <div className="flex items-center gap-2">
                                       <div className="text-right">
                                          <span className="text-[10px] font-bold text-slate-400 block">종합 점수</span>
                                          {isEditingAnalysis ? (
                                             <input 
                                                type="number" 
                                                value={videoAnalysis.score} 
                                                onChange={(e) => updateAnalysis(prev => ({...prev, score: Math.min(100, Math.max(0, Number(e.target.value)))}))}
                                                className="w-16 text-right font-black text-xl border-b border-indigo-300 bg-transparent outline-none focus:border-indigo-500"
                                             />
                                          ) : (
                                             <span className={`text-xl font-black ${videoAnalysis.score >= 80 ? 'text-green-600' : videoAnalysis.score >= 50 ? 'text-orange-500' : 'text-red-500'}`}>
                                                {videoAnalysis.score}
                                             </span>
                                          )}
                                       </div>
                                       {!isEditingAnalysis && (
                                          <button onClick={() => setIsEditingAnalysis(true)} className="p-1.5 hover:bg-white/50 rounded text-indigo-400"><Edit2 size={14}/></button>
                                       )}
                                       {isEditingAnalysis && (
                                          <button onClick={() => setIsEditingAnalysis(false)} className="p-1.5 bg-indigo-100 rounded text-indigo-600"><Check size={14}/></button>
                                       )}
                                   </div>
                                </div>

                                <div className="p-4 space-y-4">
                                   
                                   {/* 1. Evaluation Summary */}
                                   <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                      {isEditingAnalysis ? (
                                         <textarea 
                                            value={videoAnalysis.evaluation}
                                            onChange={(e) => updateAnalysis(prev => ({...prev, evaluation: e.target.value}))}
                                            className="w-full text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded p-2 focus:ring-1 focus:ring-indigo-500 outline-none"
                                            rows={3}
                                         />
                                      ) : (
                                         <p className="text-xs font-bold text-slate-700 leading-snug">
                                            "{videoAnalysis.evaluation}"
                                         </p>
                                      )}
                                   </div>

                                   {/* 2. Worker Focus Heatmap (Feature 3) */}
                                   <div>
                                      <h5 className="text-[10px] font-black text-slate-400 uppercase mb-2 flex items-center gap-1">
                                         <Eye size={12}/> Worker Focus Heatmap
                                      </h5>
                                      <div className="grid grid-cols-3 gap-2">
                                         {['front', 'back', 'side'].map((zone) => {
                                            const key = zone as keyof typeof videoAnalysis.focusAnalysis.focusZones;
                                            const level = videoAnalysis.focusAnalysis?.focusZones?.[key] || 'HIGH';
                                            const zoneName = zone === 'front' ? '전면(Front)' : zone === 'back' ? '후면(Back)' : '측면(Side)';
                                            
                                            return (
                                               <div key={zone} className={`p-2 rounded-lg border flex flex-col items-center gap-1 ${level === 'HIGH' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                                  <span className="text-[9px] font-bold text-slate-500 uppercase">{zoneName} Zone</span>
                                                  {isEditingAnalysis ? (
                                                      <select 
                                                         value={level} 
                                                         onChange={(e) => updateAnalysis(prev => ({
                                                             ...prev,
                                                             focusAnalysis: {
                                                                 ...prev.focusAnalysis,
                                                                 focusZones: {
                                                                     ...prev.focusAnalysis.focusZones,
                                                                     [key]: e.target.value as 'HIGH' | 'LOW'
                                                                 }
                                                             }
                                                         }))}
                                                         className="text-[10px] font-bold bg-white border border-slate-300 rounded px-1 py-0.5"
                                                      >
                                                          <option value="HIGH">집중</option>
                                                          <option value="LOW">산만</option>
                                                      </select>
                                                  ) : (
                                                      <span className={`text-xs font-black ${level === 'HIGH' ? 'text-green-600' : 'text-red-500'}`}>
                                                         {level === 'HIGH' ? '집중' : '산만'}
                                                      </span>
                                                  )}
                                               </div>
                                            );
                                         })}
                                      </div>
                                      <div className="mt-2 flex justify-between items-center text-[10px] text-slate-500 px-1">
                                         <div className="flex items-center gap-1">
                                            <span>전체 집중도:</span>
                                            {isEditingAnalysis ? (
                                                <input 
                                                    type="number" 
                                                    value={videoAnalysis.focusAnalysis?.overall || 0}
                                                    onChange={(e) => updateAnalysis(prev => ({...prev, focusAnalysis: {...prev.focusAnalysis, overall: Number(e.target.value)}}))}
                                                    className="w-10 text-right border-b border-slate-300 font-bold outline-none"
                                                />
                                            ) : (
                                                <strong className="text-slate-800">{videoAnalysis.focusAnalysis?.overall || 0}</strong>
                                            )}
                                            <span>%</span>
                                         </div>
                                         <div className="flex items-center gap-1">
                                            <span>딴짓 감지:</span>
                                            {isEditingAnalysis ? (
                                                <input 
                                                    type="number" 
                                                    value={videoAnalysis.focusAnalysis?.distractedCount || 0}
                                                    onChange={(e) => updateAnalysis(prev => ({...prev, focusAnalysis: {...prev.focusAnalysis, distractedCount: Number(e.target.value)}}))}
                                                    className="w-8 text-right border-b border-slate-300 font-bold outline-none text-red-500"
                                                />
                                            ) : (
                                                <strong className="text-red-500">{videoAnalysis.focusAnalysis?.distractedCount || 0}</strong>
                                            )}
                                            <span>명</span>
                                         </div>
                                      </div>
                                   </div>

                                   {/* 3. Bias Analysis - Blind Spots (Feature 2) */}
                                   {(videoAnalysis.insight?.missingTopics?.length > 0 || isEditingAnalysis) && (
                                       <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 relative overflow-hidden">
                                          <div className="absolute top-0 right-0 w-16 h-16 bg-orange-100 rounded-full -translate-y-1/2 translate-x-1/2 blur-xl"></div>
                                          <h5 className="text-[10px] font-black text-orange-700 uppercase mb-2 flex items-center gap-1 relative z-10">
                                             <AlertOctagon size={12}/> Blind Spot Alert (누락 위험)
                                          </h5>
                                          
                                          {isEditingAnalysis ? (
                                              <div className="relative z-10 space-y-2">
                                                  <input 
                                                      type="text"
                                                      value={videoAnalysis.insight.missingTopics.join(',')} // Join with comma only to allow space typing if user wants
                                                      onChange={(e) => updateAnalysis(prev => ({
                                                          ...prev, 
                                                          insight: {
                                                              ...prev.insight, 
                                                              // Allow empty strings while typing to preserve trailing comma
                                                              missingTopics: e.target.value.split(',')
                                                          }
                                                      }))}
                                                      className="w-full text-[10px] border border-orange-300 rounded px-2 py-1 bg-white mb-1 placeholder:text-orange-300"
                                                      placeholder="누락된 주제 입력 (콤마로 구분)"
                                                  />
                                                  <textarea 
                                                      value={videoAnalysis.insight.suggestion}
                                                      onChange={(e) => updateAnalysis(prev => ({
                                                          ...prev, 
                                                          insight: {
                                                              ...prev.insight, 
                                                              suggestion: e.target.value
                                                          }
                                                      }))}
                                                      className="w-full text-[10px] border border-orange-300 rounded px-2 py-1 bg-white font-medium"
                                                      rows={2}
                                                      placeholder="개선 제안 입력"
                                                  />
                                              </div>
                                          ) : (
                                              <>
                                                  <div className="flex flex-wrap gap-1.5 relative z-10">
                                                     {videoAnalysis.insight.missingTopics.filter(t => t.trim() !== "").map((topic, i) => (
                                                        <span key={i} className="text-[10px] font-bold bg-white text-orange-600 px-2 py-1 rounded border border-orange-100 shadow-sm">
                                                           {topic}
                                                        </span>
                                                     ))}
                                                  </div>
                                                  <p className="text-[10px] text-orange-800 mt-2 font-medium border-t border-orange-200/50 pt-2 leading-snug">
                                                     💡 Tip: {videoAnalysis.insight.suggestion}
                                                  </p>
                                              </>
                                          )}
                                       </div>
                                   )}

                                   {/* 4. Basic Metrics (Standard TBM) */}
                                   <div className="grid grid-cols-2 gap-2">
                                      <div className="flex justify-between items-center bg-slate-50 p-2 rounded border border-slate-100">
                                         <span className="text-[10px] font-bold text-slate-500">목소리 명확도</span>
                                         {isEditingAnalysis ? (
                                             <select 
                                                 value={videoAnalysis.details.voiceClarity}
                                                 onChange={(e) => updateAnalysis(prev => ({...prev, details: {...prev.details, voiceClarity: e.target.value as any}}))}
                                                 className="text-[10px] font-black text-slate-700 bg-white border border-slate-300 rounded px-1"
                                             >
                                                 <option value="CLEAR">명확함</option>
                                                 <option value="MUFFLED">다소 불분명</option>
                                                 <option value="NONE">식별 불가</option>
                                             </select>
                                         ) : (
                                             <span className="text-[10px] font-black text-slate-700">
                                                {videoAnalysis.details.voiceClarity === 'CLEAR' ? '명확함' : 
                                                 videoAnalysis.details.voiceClarity === 'MUFFLED' ? '다소 불분명' : '식별 불가'}
                                             </span>
                                         )}
                                      </div>
                                      <div className="flex justify-between items-center bg-slate-50 p-2 rounded border border-slate-100">
                                         <span className="text-[10px] font-bold text-slate-500">보호구 상태</span>
                                         {isEditingAnalysis ? (
                                             <select 
                                                 value={videoAnalysis.details.ppeStatus}
                                                 onChange={(e) => updateAnalysis(prev => ({...prev, details: {...prev.details, ppeStatus: e.target.value as any}}))}
                                                 className="text-[10px] font-black text-slate-700 bg-white border border-slate-300 rounded px-1"
                                             >
                                                 <option value="GOOD">준수 (양호)</option>
                                                 <option value="BAD">미흡 (불량)</option>
                                             </select>
                                         ) : (
                                             <span className="text-[10px] font-black text-slate-700">
                                                {videoAnalysis.details.ppeStatus === 'GOOD' ? '준수 (양호)' : '미흡 (불량)'}
                                             </span>
                                         )}
                                      </div>
                                   </div>

                                </div>
                                
                                {isEditingAnalysis && (
                                   <div className="absolute inset-0 bg-indigo-500/5 pointer-events-none border-2 border-indigo-500 rounded-xl z-20"></div>
                                )}
                             </div>
                          )}
                       </div>
                    </div>

                    {/* Action Footer */}
                    <div className="p-4 border-t border-slate-200 bg-white absolute bottom-0 left-0 right-0 z-10 flex gap-2 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
                       {!initialData ? (
                          <>
                             <button 
                                onClick={() => handleSave('next_team')}
                                className="flex-1 bg-white border border-slate-300 text-slate-700 py-3 rounded-lg font-bold hover:bg-slate-50 transition-colors text-xs flex flex-col items-center justify-center leading-none gap-1"
                             >
                                <span className="flex items-center gap-1"><Plus size={14}/> 현재 문서에 팀 추가</span>
                             </button>

                             <button 
                                onClick={() => handleSave('finish_doc')}
                                className="flex-[2] bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 text-sm flex flex-col items-center justify-center leading-none gap-1"
                             >
                                <span className="flex items-center gap-1"><Check size={16}/> 저장 및 문서 완료</span>
                                <span className="text-[10px] opacity-80 font-normal">다음 대기 파일로 이동</span>
                             </button>
                          </>
                       ) : (
                          <div className="flex w-full gap-2">
                             {/* Delete Button in Edit Mode */}
                             {onDelete && (
                                <button 
                                   onClick={() => {
                                      // Force String ID and check validity
                                      const idToDelete = String(initialData.id);
                                      if(idToDelete) onDelete(idToDelete);
                                      else alert("ID 오류: 삭제할 수 없습니다.");
                                   }}
                                   className="bg-red-50 text-red-600 border border-red-200 px-4 rounded-lg font-bold hover:bg-red-100 transition-colors flex items-center justify-center gap-1"
                                >
                                   <Trash2 size={18} /> 삭제
                                </button>
                             )}
                             <button 
                                onClick={() => handleSave('finish_doc')}
                                className="flex-1 bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 transition-colors shadow-lg flex items-center justify-center gap-2"
                             >
                                <Save size={16}/> 수정 내용 저장
                             </button>
                          </div>
                       )}
                    </div>
                 </div>
              </div>
           ) : (
              /* EMPTY STATE (Right Side) */
              <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 text-slate-400 p-10">
                 <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm border border-slate-200">
                    <Layers size={32} className="text-slate-300"/>
                 </div>
                 <h2 className="text-2xl font-black text-slate-700 mb-2">작업할 파일을 선택하세요</h2>
                 <p className="text-sm max-w-md text-center mb-8">
                    왼쪽 목록에서 파일을 선택하거나<br/>새로운 TBM 일지를 추가하여 작업을 시작하세요.
                 </p>
                 <button 
                    onClick={() => sidebarInputRef.current?.click()}
                    className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 flex items-center gap-2"
                 >
                    <Plus size={18}/> 파일 불러오기
                 </button>
              </div>
           )}
        </div>

      {/* Safety Feedback Modal */}
      {showFeedbackModal && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                 <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                    <ShieldCheck size={20} className="text-blue-600"/> 월간 중점 사항 선택
                 </h3>
                 <button onClick={() => setShowFeedbackModal(false)} className="text-slate-400 hover:text-slate-700">
                    <X size={24} />
                 </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                 {monthlyGuidelines.map((guideline, idx) => (
                    <button 
                       key={idx}
                       onClick={() => {
                          if(!safetyFeedback.includes(guideline.content)) {
                             setSafetyFeedback([...safetyFeedback, guideline.content]);
                          }
                          setShowFeedbackModal(false);
                       }}
                       className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all group"
                    >
                       <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${guideline.level === 'HIGH' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                             {guideline.level === 'HIGH' ? '상' : '일반'}
                          </span>
                          <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                             {guideline.category}
                          </span>
                       </div>
                       <p className="text-xs font-medium text-slate-700 group-hover:text-blue-800">
                          {guideline.content}
                       </p>
                    </button>
                 ))}
              </div>
           </div>
        </div>,
        document.body
      )}
    </div>,
    document.body
  );
};
