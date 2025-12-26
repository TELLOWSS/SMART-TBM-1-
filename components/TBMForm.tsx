
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TBMEntry, RiskAssessmentItem, SafetyGuideline, TeamOption, TBMAnalysisResult, ExtractedTBMData } from '../types';
import { analyzeMasterLog, evaluateTBMVideo } from '../services/geminiService';
import { compressVideo } from '../utils/videoUtils';
import { Upload, Camera, Sparkles, AlertTriangle, CheckCircle2, Loader2, FileText, X, ShieldCheck, Layers, ArrowLeft, Trash2, Film, Save, ZoomIn, ZoomOut, Maximize, Minimize, RotateCw, Clock, Plus, Check, PlayCircle, BarChart, Mic, Volume2, Edit2, RefreshCcw, Target, Eye, AlertOctagon, UserCheck, HelpCircle, FileStack, ScanLine, ListChecks, Zap, Files, Copy } from 'lucide-react';

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
  // Multi-Team Support
  extractedResults?: ExtractedTBMData[];
  currentResultIndex?: number;
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
  const [showHelpModal, setShowHelpModal] = useState(false);

  // --- MULTI-TEAM EXTRACTION STATE ---
  const [extractedResults, setExtractedResults] = useState<ExtractedTBMData[]>([]);
  const [currentResultIndex, setCurrentResultIndex] = useState<number>(0);
  
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
    videoAnalysis,
    extractedResults, currentResultIndex
  });

  const resetFormFields = () => {
     // setTeamId(teams[0]?.id || ''); // Keep last team selection or auto logic
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
     
     // Multi-team reset
     setExtractedResults([]);
     setCurrentResultIndex(0);
     
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
    
    // Multi-team restore
    setExtractedResults(data.extractedResults || []);
    setCurrentResultIndex(data.currentResultIndex || 0);
    
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

  // --- Populating Fields from Extracted Data ---
  const populateFieldsFromData = (data: ExtractedTBMData) => {
      setLeaderName(data.leaderName);
      setAttendeesCount(data.attendeesCount);
      setWorkDescription(data.workDescription);
      setRiskFactors(data.riskFactors || []);
      setSafetyFeedback(data.safetyFeedback || []);
      
      // Try to match teamName to known teams
      if (data.teamName) {
          const matched = teams.find(t => 
              t.name === data.teamName || 
              data.teamName.includes(t.name) || 
              t.name.includes(data.teamName)
          );
          if (matched) setTeamId(matched.id);
      }
  };

  const handleSelectExtractedResult = (index: number) => {
      if (extractedResults[index]) {
          setCurrentResultIndex(index);
          populateFieldsFromData(extractedResults[index]);
      }
  };

  // --- Analysis Logic (Updated for Multi-Team) ---
  const handleAnalyze = async () => {
    const activeItem = queue.find(q => q.id === activeQueueId);
    if (!activeItem || !currentLogBase64) return;

    setIsAnalyzing(true);
    try {
      const base64Data = currentLogBase64.split(',')[1];
      
      // Use the new MASTER LOG analyzer
      const results = await analyzeMasterLog(base64Data, activeItem.file.type, monthlyGuidelines);
      
      if (results.length > 0) {
          setExtractedResults(results);
          setCurrentResultIndex(0);
          populateFieldsFromData(results[0]);
      } else {
          alert("문서 내용을 분석할 수 없습니다. 수동으로 입력해주세요.");
      }

    } catch (err) {
      console.error(err);
      alert("분석 중 오류가 발생했습니다. 직접 입력해주세요.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- Reactive Workspace Loader & Auto-Start Logic ---
  useEffect(() => {
    if (!activeQueueId) return;

    const item = queue.find(q => q.id === activeQueueId);
    if (!item) return;

    // 1. If it has saved data, restore it.
    if (item.savedFormData) {
       restoreFormData(item.savedFormData);
    } 
    // 2. If it's a fresh item (pending/processing without data), load file
    else {
       // Only reset if we are switching to a new file, not just re-rendering
       if (currentLogBase64 && !item.savedFormData) {
           // check if we already loaded THIS file's base64. 
       } else {
           resetFormFields();
       }

       const reader = new FileReader();
       reader.onload = (event) => {
          const base64Result = event.target?.result as string;
          setCurrentLogBase64(base64Result);
          
          setViewerMode('fit');
          setImgRotation(0);
          setImgScale(1);
          
          // Filename Date Parsing
          const dateMatch = item.file.name.match(/(\d{4})[-.](\d{2})[-.](\d{2})/);
          if (dateMatch) {
              setEntryDate(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`);
          }
       };
       reader.readAsDataURL(item.file);
    }
  }, [activeQueueId]);

  // --- [NEW] Auto-Analysis Trigger ---
  useEffect(() => {
      const item = queue.find(q => q.id === activeQueueId);
      
      // Condition: Item exists + Status is 'pending' + Base64 is ready + Not currently analyzing
      if (item && item.status === 'pending' && currentLogBase64 && !isAnalyzing) {
          
          setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'processing' } : q));
          console.log("Auto-triggering MASTER LOG analysis for:", item.file.name);
          handleAnalyze();
      }
  }, [activeQueueId, currentLogBase64, isAnalyzing]);


  // --- Initialization (Edit Mode) ---
  useEffect(() => {
    if (initialData) {
      const fakeId = 'edit-mode';
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
        videoAnalysis: initialData.videoAnalysis || null,
        extractedResults: [],
        currentResultIndex: 0
      };

      setQueue([{
          id: fakeId, 
          file: new File([], "기존 기록 수정"), 
          previewUrl: initialData.originalLogImageUrl || null, 
          isPdf: initialData.originalLogMimeType === 'application/pdf',
          status: 'done', // Mark as done so auto-trigger doesn't fire
          teamsRegistered: [initialData.teamName],
          savedFormData: formState 
      }]);
      setActiveQueueId(fakeId);
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

  // --- Updated Video Audit Logic for Robustness ---
  const handleVideoAudit = async () => {
    if (!tbmVideoFile) {
      alert("분석할 동영상 파일이 없습니다.");
      return;
    }

    setIsVideoAnalyzing(true);
    setVideoStatusMessage("⏳ AI 분석을 위해 핵심 구간(10초) 추출 및 압축 중...");
    
    try {
      const compressedBlob = await compressVideo(tbmVideoFile);

      setVideoStatusMessage(`✅ 최적화 완료! (${(compressedBlob.size / 1024).toFixed(1)} KB)\nAI 서버로 전송 중...`);

      const reader = new FileReader();
      reader.readAsDataURL(compressedBlob);
      
      reader.onload = async (e) => {
        const base64String = e.target?.result as string;
        if (base64String) {
           const base64Data = base64String.split(',')[1];
           const mimeTypeToProcess = compressedBlob.type || 'video/webm'; 
           
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

  // --- Save Logic (Updated for Batch) ---

  const createEntryFromState = (
     currentExtractedData: ExtractedTBMData | null, 
     overrideTeamName?: string,
     uniqueIndex: number = 0 // [FIX]: Add index to prevent ID collisions
  ): TBMEntry => {
      // Use current form state OR passed data
      const dataToUse = currentExtractedData ? {
          leaderName: currentExtractedData.leaderName,
          attendeesCount: currentExtractedData.attendeesCount,
          workDescription: currentExtractedData.workDescription,
          riskFactors: currentExtractedData.riskFactors || [],
          safetyFeedback: currentExtractedData.safetyFeedback || [],
          teamName: currentExtractedData.teamName
      } : {
          leaderName, attendeesCount, workDescription, riskFactors, safetyFeedback, teamName: teams.find(t=>t.id===teamId)?.name || '알수없음'
      };

      // Match ID if dataToUse.teamName exists
      let finalTeamId = teamId;
      let finalTeamName = overrideTeamName || dataToUse.teamName;

      if (dataToUse.teamName) {
         const matched = teams.find(t => 
             t.name === dataToUse.teamName || 
             dataToUse.teamName.includes(t.name) || 
             t.name.includes(dataToUse.teamName)
         );
         if (matched) {
             finalTeamId = matched.id;
             finalTeamName = matched.name;
         }
      }

      // Check current file type
      const activeItem = queue.find(q => q.id === activeQueueId);
      const isPdf = activeItem?.isPdf;

      // Fallback: If no specific photo, try to use the document image (if not PDF)
      const finalPhotoUrl = tbmPhotoPreview || (!isPdf && currentLogBase64 ? currentLogBase64 : undefined);

      // Default Analysis for Document based (if video analysis not present)
      const docAnalysis: TBMAnalysisResult = {
          score: 85,
          evaluation: "문서 기반 분석 결과, TBM 활동이 적절하게 수행되었습니다.",
          analysisSource: 'DOCUMENT',
          details: { participation: 'GOOD', voiceClarity: 'CLEAR', ppeStatus: 'GOOD', interaction: true },
          focusAnalysis: { overall: 90, distractedCount: 0, focusZones: { front: 'HIGH', back: 'HIGH', side: 'HIGH' } },
          insight: { mentionedTopics: [], missingTopics: [], suggestion: "문서 기반 자동 생성입니다." },
          feedback: []
      };

      return {
          id: `ENTRY-${Date.now()}-${uniqueIndex}-${Math.random().toString(36).substring(2, 7)}`, // [FIX]: Ensure uniqueness
          date: entryDate,
          time: entryTime,
          teamId: finalTeamId,
          teamName: finalTeamName,
          leaderName: dataToUse.leaderName,
          attendeesCount: dataToUse.attendeesCount,
          workDescription: dataToUse.workDescription,
          riskFactors: dataToUse.riskFactors,
          safetyFeedback: dataToUse.safetyFeedback,
          tbmPhotoUrl: finalPhotoUrl,
          tbmVideoUrl: tbmVideoPreview || undefined,
          tbmVideoFileName: tbmVideoFileName || undefined,
          videoAnalysis: videoAnalysis || docAnalysis, // Use video analysis if available, else doc dummy
          originalLogImageUrl: currentLogBase64 || undefined,
          originalLogMimeType: isPdf ? 'application/pdf' : 'image/jpeg',
          createdAt: Date.now(),
      };
  };

  const handleSave = (action: 'next_team' | 'finish_doc' | 'save_all') => {
    // [FIX] Relax validation: Allow save if document (currentLogBase64) exists, even if specific photo is missing
    if (!tbmPhotoPreview && !currentLogBase64) {
      alert("⚠ TBM 증빙 자료가 없습니다.\n사진을 추가하거나 문서를 업로드해주세요.");
      return;
    }

    const currentTeamName = teams.find(t => t.id === teamId)?.name || '알 수 없음';
    
    // CASE: SAVE ALL (Batch)
    if (action === 'save_all' && extractedResults.length > 0) {
        if (!confirm(`총 ${extractedResults.length}개 팀의 데이터를 일괄 저장하시겠습니까?\n(현재 사진/영상/문서 증빙이 모든 팀에 공통 적용됩니다)`)) {
            return;
        }

        try {
            // Loop through all extracted results and save
            extractedResults.forEach((data, index) => {
                const entry = createEntryFromState(data, undefined, index); // [FIX]: Pass index
                onSave(entry, false);
            });
            
            // Mark all teams as done
            const allTeamNames = extractedResults.map(r => r.teamName || 'Unknown');
            
            setQueue(prevQueue => prevQueue.map(q => {
                if (q.id === activeQueueId) {
                    return {
                        ...q,
                        teamsRegistered: [...q.teamsRegistered, ...allTeamNames],
                        status: 'done',
                        savedFormData: undefined // Clear saved state on done
                    };
                }
                return q;
            }));

            // Move to next file
            const currentIndex = queue.findIndex(q => q.id === activeQueueId);
            const forwardCandidate = queue.slice(currentIndex + 1).find(q => q.status !== 'done');
            
            alert(`✅ ${extractedResults.length}개 팀 저장 완료.\n자동으로 다음 문서로 이동합니다.`);
            
            if (forwardCandidate) {
                setActiveQueueId(forwardCandidate.id);
            } else {
                setTbmPhotoPreview(null);
                setCurrentLogBase64(null);
                setExtractedResults([]);
                setActiveQueueId(null);
            }

        } catch (e) {
            console.error(e);
            alert("저장 중 오류 발생");
        }
        return;
    }

    // CASE: SINGLE SAVE
    const newEntry = createEntryFromState(null); // Use current form state
    
    // 1. Save Data First
    try {
        onSave(newEntry, !!initialData); // Exit if editing existing
    } catch (error) {
        console.error("Save failed:", error);
        alert("저장 실패");
        return;
    }

    if (initialData) return; // Exit logic handled in onSave wrapper above

    // 2. Navigation
    setTimeout(() => {
        const currentIndex = queue.findIndex(q => q.id === activeQueueId);
        let nextIdToActivate: string | null = null;

        if (action === 'finish_doc') {
           const forwardCandidate = queue.slice(currentIndex + 1).find(q => q.status !== 'done');
           if (forwardCandidate) nextIdToActivate = forwardCandidate.id;
        }

        setQueue(prevQueue => {
            return prevQueue.map(q => {
                if (q.id === activeQueueId) {
                    return {
                        ...q,
                        teamsRegistered: [...q.teamsRegistered, currentTeamName],
                        status: action === 'finish_doc' ? 'done' : 'processing',
                        // Save state if just switching team, clear if finishing doc
                        savedFormData: action === 'next_team' ? getCurrentFormState() : undefined
                    };
                }
                return q;
            });
        });

        if (action === 'next_team') {
            alert(`✅ [${currentTeamName}] 저장 완료! \n다음 팀을 선택하거나 다른 탭을 눌러주세요.`);
            // Don't reset everything, just maybe team selection visual?
            // Actually, keep form as is for user to change slightly is better?
            // User request usually wants blank form for next team.
            // But if we have extracted results, we might want to switch to next tab?
            if (extractedResults.length > 0 && currentResultIndex < extractedResults.length - 1) {
                handleSelectExtractedResult(currentResultIndex + 1);
            }
        } else {
            if (nextIdToActivate) {
               setActiveQueueId(nextIdToActivate); 
            } else {
               setTbmPhotoPreview(null);
               setCurrentLogBase64(null); 
               setExtractedResults([]);
               setTimeout(() => {
                   alert(`✅ 모든 문서 작업이 완료되었습니다!`);
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
              
              {/* HELP BUTTON */}
              <button 
                onClick={() => setShowHelpModal(true)}
                className="ml-2 text-slate-400 hover:text-blue-600 transition-colors"
                title="이용 가이드"
              >
                <HelpCircle size={20} />
              </button>
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
                                {teams.map(t => {
                                   const isDone = queue.find(q => q.id === activeQueueId)?.teamsRegistered.includes(t.name);
                                   return (
                                       <option key={t.id} value={t.id} disabled={isDone} className={isDone ? "text-slate-300" : "text-slate-900"}>
                                          {t.name} {isDone ? '(완료)' : ''}
                                       </option>
                                   );
                                })}
                             </select>
                          </div>
                          
                          {/* DYNAMIC BUTTON LABEL */}
                          <button 
                             onClick={handleAnalyze}
                             disabled={isAnalyzing}
                             className={`h-[46px] text-white px-4 rounded-lg font-bold hover:opacity-90 transition-all shadow-md flex items-center gap-2 shrink-0 text-xs ${
                                activeQueueId ? 'bg-gradient-to-r from-indigo-600 to-violet-600' : 'bg-slate-900'
                             }`}
                          >
                             {isAnalyzing ? <Loader2 className="animate-spin" size={16}/> : (
                                activeQueueId ? <Files size={16} className="text-white"/> : <Sparkles size={16} className="text-yellow-400"/>
                             )}
                             {activeQueueId ? (isAnalyzing ? '분석 중...' : '전체 팀 자동 분석') : '추출'}
                          </button>
                       </div>
                       
                       {/* Detected Teams Tabs (New) */}
                       {extractedResults.length > 0 && (
                           <div className="mt-3 overflow-x-auto pb-1 custom-scrollbar">
                               <div className="flex gap-2">
                                   {extractedResults.map((result, idx) => (
                                       <button
                                           key={idx}
                                           onClick={() => handleSelectExtractedResult(idx)}
                                           className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                               currentResultIndex === idx
                                               ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                                               : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                                           }`}
                                       >
                                           {result.teamName || `Team ${idx + 1}`}
                                       </button>
                                   ))}
                               </div>
                               <p className="text-[9px] text-indigo-600 font-bold mt-1.5 px-1">
                                   ✨ 문서에서 {extractedResults.length}개 팀이 발견되었습니다. 탭을 눌러 확인하세요.
                               </p>
                           </div>
                       )}

                       {/* Auto Analysis Indicator */}
                       {isAnalyzing && (
                           <div className="mt-3 bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-2 rounded-lg flex items-center gap-2 animate-pulse">
                               <Zap size={14} className="fill-indigo-600"/>
                               <span className="text-xs font-bold">AI가 문서 내 모든 팀을 스캔하고 있습니다...</span>
                           </div>
                       )}
                       
                       {/* Team Progress Grid */}
                       {extractedResults.length === 0 && !isAnalyzing && (
                           <div className="mt-4 bg-white border border-slate-200 rounded-lg p-2">
                               <div className="flex items-center gap-2 mb-2">
                                   <ListChecks size={12} className="text-slate-400"/>
                                   <span className="text-[10px] font-bold text-slate-500 uppercase">Daily Team Checklist</span>
                               </div>
                               <div className="flex flex-wrap gap-1.5 max-h-[60px] overflow-y-auto custom-scrollbar">
                                  {teams.map((t) => {
                                     const isDone = queue.find(q => q.id === activeQueueId)?.teamsRegistered.includes(t.name);
                                     return (
                                         <div 
                                            key={t.id} 
                                            onClick={() => !isDone && setTeamId(t.id)}
                                            className={`text-[9px] font-bold px-2 py-1 rounded border cursor-pointer transition-all ${
                                                isDone 
                                                ? 'bg-green-100 text-green-700 border-green-200' 
                                                : (t.id === teamId ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100')
                                            }`}
                                         >
                                            {t.name} {isDone && '✔'}
                                         </div>
                                     );
                                  })}
                               </div>
                           </div>
                       )}
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
                          
                          {/* AI Deep Insight Result Card */}
                          {videoAnalysis && (
                             <div className="bg-white rounded-xl border border-indigo-100 shadow-xl overflow-hidden relative ring-1 ring-indigo-50">
                                {/* Header */}
                                <div className="bg-gradient-to-r from-indigo-50 to-violet-50 p-4 border-b border-indigo-100 flex justify-between items-center">
                                   <div>
                                      <h4 className="text-sm font-black text-indigo-900 flex items-center gap-2">
                                         <Sparkles size={16} className="text-indigo-600"/> AI Deep Insight Report
                                      </h4>
                                      {/* Source Indicator */}
                                      <div className="flex items-center gap-1.5 mt-1">
                                          {videoAnalysis.analysisSource === 'VIDEO' ? (
                                              <span className="text-[9px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 flex items-center gap-1">
                                                  <Film size={10}/> AI 영상 정밀 진단
                                              </span>
                                          ) : (
                                              <span className="text-[9px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                                                  <FileText size={10}/> 문서/사진 기반 분석
                                              </span>
                                          )}
                                      </div>
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
                             {extractedResults.length > 0 ? (
                                <button 
                                   onClick={() => handleSave('save_all')}
                                   className="flex-[2] bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 text-sm flex flex-col items-center justify-center leading-none gap-1"
                                >
                                   <span className="flex items-center gap-1"><Copy size={16}/> {extractedResults.length}개 팀 일괄 저장</span>
                                   <span className="text-[10px] opacity-80 font-normal">자동으로 다음 문서 이동</span>
                                </button>
                             ) : (
                                <button 
                                   onClick={() => handleSave('next_team')}
                                   className="flex-1 bg-white border border-slate-300 text-slate-700 py-3 rounded-lg font-bold hover:bg-slate-50 transition-colors text-xs flex flex-col items-center justify-center leading-none gap-1"
                                >
                                   <span className="flex items-center gap-1"><Plus size={14}/> 현재 문서에 팀 추가</span>
                                </button>
                             )}

                             <button 
                                onClick={() => handleSave('finish_doc')}
                                className="flex-[1] bg-slate-800 text-white py-3 rounded-lg font-bold hover:bg-slate-900 transition-colors shadow-lg text-sm flex flex-col items-center justify-center leading-none gap-1"
                             >
                                <span className="flex items-center gap-1"><Check size={16}/> {extractedResults.length > 0 ? '단일 저장' : '저장 완료'}</span>
                                <span className="text-[10px] opacity-80 font-normal">다음 파일</span>
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
              <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 text-slate-400 p-10 animate-fade-in">
                 <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center mb-6 shadow-xl border border-blue-100 relative group overflow-hidden">
                    <div className="absolute inset-0 bg-blue-600/5 group-hover:bg-blue-600/10 transition-colors"></div>
                    <FileStack size={48} className="text-blue-500 mb-2 transform group-hover:-translate-y-1 transition-transform duration-300"/>
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-slate-200 rounded-full group-hover:bg-blue-300 transition-colors"></div>
                 </div>
                 
                 <h2 className="text-3xl font-black text-slate-800 mb-3 tracking-tight">대량 문서 처리 모드</h2>
                 
                 <div className="max-w-md text-center space-y-4 mb-10">
                    <p className="text-sm text-slate-500 leading-relaxed font-medium">
                       <strong className="text-blue-600">3주치 데이터(PDF/사진)</strong>를 한 번에 드래그하여 놓으세요.<br/>
                       AI가 문서를 순차적으로 분석하여 대장을 완성해 드립니다.
                    </p>
                    <div className="flex justify-center gap-8 text-xs font-bold text-slate-400">
                       <div className="flex flex-col items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">1</div>
                          <span>일괄 선택</span>
                       </div>
                       <div className="h-px w-8 bg-slate-300 mt-4"></div>
                       <div className="flex flex-col items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">2</div>
                          <span>자동 대기열</span>
                       </div>
                       <div className="h-px w-8 bg-slate-300 mt-4"></div>
                       <div className="flex flex-col items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">3</div>
                          <span>일괄 분석</span>
                       </div>
                    </div>
                 </div>

                 <button 
                    onClick={() => sidebarInputRef.current?.click()}
                    className="px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-bold hover:shadow-xl hover:scale-105 transition-all shadow-lg shadow-blue-200 flex items-center gap-3 text-sm"
                 >
                    <Plus size={20}/> 파일 불러오기 (PDF 포함)
                 </button>
                 <p className="text-[10px] text-slate-400 mt-4 font-bold">지원 형식: JPG, PNG, PDF (자동 변환)</p>
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

      {/* NEW: Batch Upload Guide Modal */}
      {showHelpModal && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setShowHelpModal(false)}>
           <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
              <div className="bg-slate-900 p-8 text-white relative overflow-hidden">
                 <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
                 <h2 className="text-2xl font-black mb-2 flex items-center gap-2 relative z-10">
                    <FileStack className="text-blue-400"/> 대량 문서 처리 가이드
                 </h2>
                 <p className="text-slate-400 text-sm font-medium relative z-10">
                    3주치(약 20일분) 이상의 데이터를 가장 효율적으로 처리하는 방법입니다.
                 </p>
                 <button onClick={() => setShowHelpModal(false)} className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors">
                    <X size={24}/>
                 </button>
              </div>
              
              <div className="p-8 space-y-8">
                 <div className="flex gap-6">
                    <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center font-black text-xl shrink-0">1</div>
                    <div>
                       <h3 className="font-bold text-lg text-slate-800 mb-1">한 번에 선택하세요</h3>
                       <p className="text-sm text-slate-500 leading-relaxed">
                          '파일 추가' 버튼을 누르고, 폴더 내의 모든 사진이나 PDF 파일을 <strong className="text-blue-600">드래그하거나 전체 선택(Ctrl+A)</strong>하여 여십시오. 
                          시스템이 자동으로 대기열(Queue)을 생성합니다.
                       </p>
                    </div>
                 </div>

                 <div className="flex gap-6">
                    <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center font-black text-xl shrink-0">2</div>
                    <div>
                       <h3 className="font-bold text-lg text-slate-800 mb-1">AI 자동 추출 및 검토</h3>
                       <p className="text-sm text-slate-500 leading-relaxed">
                          왼쪽 목록에서 파일을 클릭하면 <strong className="text-indigo-600">✨ AI 분석이 자동으로 시작</strong>됩니다. 
                          내용을 검토하고 수정이 필요하면 즉시 수정하세요.
                       </p>
                    </div>
                 </div>

                 <div className="flex gap-6">
                    <div className="w-12 h-12 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center font-black text-xl shrink-0">3</div>
                    <div>
                       <h3 className="font-bold text-lg text-slate-800 mb-1">저장 후 자동 이동</h3>
                       <p className="text-sm text-slate-500 leading-relaxed">
                          검토가 끝나면 <strong className="text-green-600">저장 및 문서 완료</strong> 버튼을 누르세요. 
                          저장됨과 동시에 <strong className="text-slate-800 underline decoration-green-300">자동으로 다음 순서의 파일이 열리고 분석됩니다.</strong>
                       </p>
                    </div>
                 </div>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
                 <button onClick={() => setShowHelpModal(false)} className="px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors shadow-lg">
                    이해했습니다. 시작하기
                 </button>
              </div>
           </div>
        </div>,
        document.body
      )}
    </div>,
    document.body
  );
};
