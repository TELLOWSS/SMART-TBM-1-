
import React, { useState, useRef, useMemo } from 'react';
import { MonthlyRiskAssessment, SafetyGuideline } from '../types';
import { extractMonthlyPriorities, ExtractedPriority, MonthlyExtractionResult } from '../services/geminiService';
import { Upload, Loader2, Trash2, ShieldCheck, Plus, RefreshCcw, Calendar, TrendingUp, Search, Edit2, Save, X, Download, FileJson } from 'lucide-react';

interface RiskAssessmentManagerProps {
  assessments: MonthlyRiskAssessment[];
  onSave: (data: MonthlyRiskAssessment[]) => void;
}

export const RiskAssessmentManager: React.FC<RiskAssessmentManagerProps> = ({ assessments, onSave }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Month Selection State
  const sortedMonths = useMemo(() => {
     return [...assessments].sort((a, b) => b.month.localeCompare(a.month));
  }, [assessments]);

  const [selectedMonthId, setSelectedMonthId] = useState<string>(sortedMonths[0]?.id || '');
  const [newMonthMode, setNewMonthMode] = useState(false);
  const [targetMonth, setTargetMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM

  // Get current selected assessment
  const activeAssessment = assessments.find(a => a.id === selectedMonthId);
  
  // Get previous month assessment for comparison
  const previousAssessment = useMemo(() => {
     if (!activeAssessment) return null;
     const currentIndex = sortedMonths.findIndex(a => a.id === activeAssessment.id);
     if (currentIndex !== -1 && currentIndex < sortedMonths.length - 1) {
        return sortedMonths[currentIndex + 1];
     }
     return null;
  }, [activeAssessment, sortedMonths]);

  // Candidates from analysis
  const [candidates, setCandidates] = useState<ExtractedPriority[]>([]);
  
  // Manual Input State
  const [manualInput, setManualInput] = useState('');
  const [manualCategory, setManualCategory] = useState('공통');
  
  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  // --- NEW: Search & Edit State ---
  const [searchTerm, setSearchTerm] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{content: string, level: string, category: string}>({
      content: '', level: 'GENERAL', category: '공통'
  });

  // --- Helpers ---
  const normalizeString = (str: string) => {
    return (str || '').replace(/[\s\n\r.,\-()[\]]/g, '').trim();
  };

  // --- Handlers ---

  // 1. Data Backup (Export)
  const handleExportBackup = () => {
    if (assessments.length === 0) {
      alert("백업할 데이터가 없습니다.");
      return;
    }
    const dataStr = JSON.stringify(assessments, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RISK_ASSESSMENT_BACKUP_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 2. Data Restore (Import)
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const loadedData = JSON.parse(event.target?.result as string);
        if (Array.isArray(loadedData)) {
          // Merge logic: Overwrite existing items with same ID, add new ones
          // Explicitly typed Map to avoid inference issues
          const currentMap = new Map<string, MonthlyRiskAssessment>();
          assessments.forEach(item => currentMap.set(item.id, item));
          
          (loadedData as any[]).forEach((item: any) => {
             // Basic validation
             if(item.id && item.month && Array.isArray(item.priorities)) {
                currentMap.set(item.id, item as MonthlyRiskAssessment);
             }
          });

          const merged: MonthlyRiskAssessment[] = Array.from(currentMap.values());
          onSave(merged);
          alert(`✅ 데이터 복구 완료: 총 ${merged.length}개월분의 데이터가 로드되었습니다.`);
          
          // Select the most recent one
          if (merged.length > 0) {
             const latest = merged.sort((a, b) => b.month.localeCompare(a.month))[0];
             setSelectedMonthId(latest.id);
          }
        } else {
          alert("올바르지 않은 백업 파일 형식입니다.");
        }
      } catch (err) {
        console.error(err);
        alert("파일을 읽는 중 오류가 발생했습니다.");
      } finally {
        if(backupInputRef.current) backupInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleCreateMonth = () => {
     if (assessments.some(a => a.month === targetMonth)) {
        alert("이미 해당 월의 평가가 존재합니다.");
        return;
     }

     const newAssessment: MonthlyRiskAssessment = {
        id: `MONTH-${Date.now()}`,
        month: targetMonth,
        fileName: 'New Assessment',
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      setIsAnalyzing(true);
      const reader = new FileReader();
      
      reader.onload = async (event) => {
        const base64Url = event.target?.result as string;
        if (!base64Url) return;

        try {
          const base64Data = base64Url.split(',')[1];
          const result: MonthlyExtractionResult = await extractMonthlyPriorities(base64Data, file.type);
          const { items: extracted, detectedMonth } = result;

          let targetAssessment = activeAssessment;
          let isNewMonthCreated = false;

          if (detectedMonth && activeAssessment && detectedMonth !== activeAssessment.month) {
             const message = `📄 문서 분석 결과: [${detectedMonth}월] 자료로 보입니다.\n\n현재 선택된 [${activeAssessment.month}월]이 아닌,\n👉 [${detectedMonth}월] 평가표로 새로 등록(또는 이동)하시겠습니까?`;
             
             if (confirm(message)) {
                const existingTarget = assessments.find(a => a.month === detectedMonth);
                
                if (existingTarget) {
                   targetAssessment = existingTarget;
                   setSelectedMonthId(existingTarget.id);
                   alert(`${detectedMonth}월 데이터가 이미 존재하여 해당 월로 이동 후 추가합니다.`);
                } else {
                   const newAssessment: MonthlyRiskAssessment = {
                      id: `MONTH-${Date.now()}`,
                      month: detectedMonth,
                      fileName: file.name,
                      priorities: [],
                      createdAt: Date.now()
                   };
                   const updatedList = [newAssessment, ...assessments];
                   onSave(updatedList);
                   setSelectedMonthId(newAssessment.id);
                   targetAssessment = newAssessment;
                   isNewMonthCreated = true;
                }
             }
          }

          if (!targetAssessment) {
             alert("대상 월을 찾을 수 없어 작업을 취소합니다.");
             setIsAnalyzing(false);
             return;
          }

          const currentPriorities = [...targetAssessment.priorities];
          let addedCount = 0;
          
          extracted.forEach(item => {
             const normalizedContent = normalizeString(item.content);
             const isDuplicate = currentPriorities.some(f => {
                 const existingNorm = normalizeString(f.content);
                 return existingNorm === normalizedContent || existingNorm.includes(normalizedContent) || normalizedContent.includes(existingNorm);
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

          let finalAssessments = assessments;
          if (isNewMonthCreated) {
             finalAssessments = [targetAssessment, ...assessments];
          }
          
          finalAssessments = finalAssessments.map(a => 
             a.id === targetAssessment!.id 
             ? { ...a, priorities: currentPriorities, fileName: file.name }
             : a
          );

          onSave(finalAssessments);
          setCandidates([]);
          
          const monthLabel = targetAssessment.month;
          if (addedCount < extracted.length) {
              alert(`[${monthLabel}월] 총 ${extracted.length}건 중 중복 제외 ${addedCount}건 등록 완료.`);
          } else {
              alert(`[${monthLabel}월] 총 ${extracted.length}건 등록 완료.`);
          }
          
        } catch (err) {
          console.error(err);
          alert("문서 분석 중 오류가 발생했습니다.");
        } finally {
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
    }
  };

  const removeFromFinal = (item: SafetyGuideline) => {
    if (!activeAssessment) return;
    if (confirm("정말 삭제하시겠습니까?")) {
        const newPriorities = activeAssessment.priorities.filter(p => p.content !== item.content);
        updateActiveAssessment(newPriorities);
        // Do not add to candidates when deleting explicitly
    }
  };

  const addManualPriority = () => {
    if (manualInput.trim() && activeAssessment) {
      const newGuideline: SafetyGuideline = {
        content: manualInput.trim(),
        level: 'GENERAL',
        category: manualCategory
      };
      updateActiveAssessment([newGuideline, ...activeAssessment.priorities]);
      setManualInput('');
    }
  };

  const handleDeleteMonth = () => {
     if (confirm("정말 이 월의 데이터를 삭제하시겠습니까?")) {
        const updated = assessments.filter(a => a.id !== selectedMonthId);
        onSave(updated);
        if (updated.length > 0) setSelectedMonthId(updated[0].id);
        else setSelectedMonthId('');
     }
  }

  // --- Edit Logic ---
  const startEditing = (index: number, item: SafetyGuideline) => {
      setEditingIndex(index);
      setEditForm({
          content: item.content,
          level: item.level,
          category: item.category
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
          category: editForm.category
      };
      
      updateActiveAssessment(updatedPriorities);
      setEditingIndex(null);
  };

  // --- Components ---

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

  // --- Filtered List for Display ---
  const displayPriorities = useMemo(() => {
     if (!activeAssessment) return [];
     if (!searchTerm.trim()) return activeAssessment.priorities;
     return activeAssessment.priorities.filter(item => 
        (item.content || '').includes(searchTerm) || 
        (item.category || '').includes(searchTerm)
     );
  }, [activeAssessment, searchTerm]);

  // --- Render ---

  return (
    <div className="bg-slate-50 min-h-[calc(100vh-140px)] flex gap-6">
       
       {/* 1. Month Sidebar */}
       <div className="w-64 flex flex-col gap-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
             <div className="flex justify-between items-center mb-4">
                <h3 className="font-black text-slate-800 flex items-center gap-2">
                   <Calendar size={18} className="text-blue-600"/> 월별 관리
                </h3>
                <button onClick={() => setNewMonthMode(true)} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors">
                   <Plus size={16}/>
                </button>
             </div>
             
             {newMonthMode && (
                <div className="mb-4 bg-slate-50 p-3 rounded-xl border border-slate-200 animate-slide-up">
                   <label className="text-[10px] font-bold text-slate-500 mb-1 block">추가할 월 선택</label>
                   <input 
                      type="month" 
                      value={targetMonth} 
                      onChange={(e) => setTargetMonth(e.target.value)}
                      className="w-full text-sm font-bold border border-slate-300 rounded-lg p-2 mb-2 outline-none focus:border-blue-500"
                   />
                   <div className="flex gap-2">
                      <button onClick={handleCreateMonth} className="flex-1 bg-blue-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-blue-700">생성</button>
                      <button onClick={() => setNewMonthMode(false)} className="flex-1 bg-white border border-slate-300 text-slate-600 text-xs font-bold py-2 rounded-lg hover:bg-slate-50">취소</button>
                   </div>
                </div>
             )}

             <div className="space-y-2">
                {sortedMonths.map(month => (
                   <button
                      key={month.id}
                      onClick={() => setSelectedMonthId(month.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                         selectedMonthId === month.id 
                         ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200' 
                         : 'bg-white text-slate-600 border-slate-100 hover:border-slate-300'
                      }`}
                   >
                      <span className="font-bold text-sm">{month.month}월</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${selectedMonthId === month.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                         {month.priorities.length}건
                      </span>
                   </button>
                ))}
             </div>
          </div>
       </div>

       {/* 2. Main Content Area */}
       <div className="flex-1 flex flex-col gap-6">
          {activeAssessment ? (
             <>
                {/* Header Banner */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex justify-between items-center">
                   <div>
                      <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                         {activeAssessment.month}월 위험성평가
                         <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">
                            파일명: {activeAssessment.fileName}
                         </span>
                      </h2>
                      <p className="text-sm text-slate-500 mt-1 font-medium">
                         총 {activeAssessment.priorities.length}개의 중점 관리 항목이 등록되어 있습니다.
                      </p>
                   </div>
                   
                   <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-2">
                          <button 
                             onClick={handleExportBackup}
                             className="flex items-center gap-2 bg-slate-100 text-slate-600 px-3 py-2 rounded-xl font-bold text-xs hover:bg-slate-200 transition-colors border border-slate-200"
                             title="전체 데이터 백업 (JSON)"
                          >
                             <Download size={14} /> 백업
                          </button>
                          <button 
                             onClick={() => backupInputRef.current?.click()}
                             className="flex items-center gap-2 bg-slate-100 text-slate-600 px-3 py-2 rounded-xl font-bold text-xs hover:bg-slate-200 transition-colors border border-slate-200"
                             title="데이터 복구 (JSON)"
                          >
                             <Upload size={14} /> 복구
                          </button>
                          <input type="file" ref={backupInputRef} className="hidden" accept=".json" onChange={handleImportBackup}/>
                      </div>

                      <div className="flex items-center gap-2">
                          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200">
                             {isAnalyzing ? <Loader2 size={18} className="animate-spin"/> : <FileJson size={18}/>}
                             <span>문서 분석/추가</span>
                          </button>
                          <button onClick={handleDeleteMonth} className="p-3 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors" title="이 월의 데이터 삭제">
                             <Trash2 size={20} />
                          </button>
                          <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="application/pdf,image/*"/>
                      </div>
                   </div>
                </div>

                {/* Main Workspace (Bento Grid) */}
                <div className="grid grid-cols-12 gap-6 h-full min-h-0">
                   
                   {/* Left: Comparison & Input (4 cols) */}
                   <div className="col-span-4 flex flex-col gap-4">
                      {/* Manual Input */}
                      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                         <h3 className="font-bold text-slate-700 mb-3 text-sm flex items-center gap-2"><Plus size={16}/> 수동 항목 추가</h3>
                         <div className="flex flex-col gap-2">
                           <div className="flex gap-2">
                              <select 
                                 value={manualCategory} 
                                 onChange={(e) => setManualCategory(e.target.value)}
                                 className="bg-slate-50 border border-slate-300 rounded-lg px-2 text-xs font-bold w-20 outline-none"
                              >
                                 <option value="공통">공통</option>
                                 <option value="형틀">형틀</option>
                                 <option value="철근">철근</option>
                              </select>
                              <input 
                                 type="text" 
                                 value={manualInput}
                                 onChange={(e) => setManualInput(e.target.value)}
                                 onKeyPress={(e) => e.key === 'Enter' && addManualPriority()}
                                 placeholder="내용 입력..."
                                 className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                              />
                           </div>
                           <button onClick={addManualPriority} className="w-full bg-slate-800 text-white py-2 rounded-lg text-xs font-bold hover:bg-slate-700">추가하기</button>
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
                                    <button onClick={() => addToFinal(item)} className="text-blue-500 hover:text-blue-700"><Plus size={16}/></button>
                                 </div>
                              ))}
                           </div>
                         </div>
                      )}
                   </div>

                   {/* Right: Active Priorities List (8 cols) */}
                   <div className="col-span-8 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[600px]">
                      <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-2xl">
                         <div className="flex items-center gap-2">
                            <ShieldCheck className="text-green-600" size={20}/>
                            <h3 className="font-bold text-slate-800">최종 관리 목록</h3>
                         </div>
                         <div className="flex gap-2 items-center">
                            {/* NEW: Search Bar */}
                           <div className="relative">
                               <input 
                                   type="text" 
                                   placeholder="항목 검색..." 
                                   value={searchTerm}
                                   onChange={(e) => setSearchTerm(e.target.value)}
                                   className="pl-8 pr-3 py-1.5 text-xs font-bold border border-slate-300 rounded-lg outline-none focus:border-blue-500 w-40"
                               />
                               <Search size={14} className="absolute left-2.5 top-2 text-slate-400"/>
                           </div>
                           
                           {previousAssessment && (
                              <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded-lg flex items-center gap-1">
                                 <TrendingUp size={12}/> vs {previousAssessment.month}월 비교 중
                              </span>
                           )}
                         </div>
                      </div>

                      <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                         {activeAssessment.priorities.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300">
                               <ShieldCheck size={48} className="mb-2 opacity-20"/>
                               <p>등록된 항목이 없습니다.</p>
                            </div>
                         ) : (
                            displayPriorities.length === 0 ? (
                                <div className="text-center py-10 text-slate-400 font-medium">검색 결과가 없습니다.</div>
                            ) : (
                                // Map filtered list but use original Index to manage editing
                                activeAssessment.priorities.map((item, originalIndex) => {
                                   // Manual Filter Check
                                   if (searchTerm.trim() && !((item.content || '').includes(searchTerm) || (item.category || '').includes(searchTerm))) {
                                       return null; 
                                   }

                                   // EDIT MODE RENDER
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
                                                       <button onClick={saveEditing} className="p-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1 text-xs font-bold px-3">
                                                           <Save size={14}/> 저장
                                                       </button>
                                                       <button onClick={cancelEditing} className="p-1.5 bg-white border border-slate-300 text-slate-600 rounded hover:bg-slate-50 flex items-center gap-1 text-xs font-bold px-3">
                                                           <X size={14}/> 취소
                                                       </button>
                                                   </div>
                                               </div>
                                           </div>
                                       );
                                   }

                                   // NORMAL MODE RENDER
                                   let status: 'NEW' | 'CHANGED' | 'SAME' = 'SAME';
                                   if (previousAssessment) {
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
                                         </div>

                                         <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                             <button onClick={() => startEditing(originalIndex, item)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="수정">
                                                <Edit2 size={16}/>
                                             </button>
                                             <button onClick={() => removeFromFinal(item)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="삭제">
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
             <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                <Calendar size={64} className="mb-4 opacity-20"/>
                <h3 className="text-xl font-bold text-slate-600">월을 선택하거나 생성하세요</h3>
                <p className="text-sm">왼쪽 사이드바에서 작업을 시작할 수 있습니다.</p>
                
                {/* Empty State Action */}
                <div className="mt-4 flex gap-2">
                   <button onClick={() => backupInputRef.current?.click()} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200">
                      기존 데이터 복구하기
                   </button>
                   <input type="file" ref={backupInputRef} className="hidden" accept=".json" onChange={handleImportBackup}/>
                </div>
             </div>
          )}
       </div>
    </div>
  );
};
