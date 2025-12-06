
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Navigation } from './components/Navigation';
import { Dashboard } from './components/Dashboard';
import { TBMForm } from './components/TBMForm';
import { ReportView } from './components/ReportView';
import { ReportCenter } from './components/ReportCenter';
import { RiskAssessmentManager } from './components/RiskAssessmentManager';
import { TBMEntry, MonthlyRiskAssessment, TeamOption, TeamCategory } from './types';
import { TEAMS } from './constants';
import { Download, Upload, Trash2, X, Settings, Database, Eraser, Plus, Users, Edit3, Save } from 'lucide-react';

// 내부용 삭제 확인 모달 컴포넌트
const DeleteConfirmModal = ({ info, onConfirm, onCancel }: { info: any, onConfirm: () => void, onCancel: () => void }) => {
  return createPortal(
    <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-scale-in border border-slate-200">
        <div className="bg-red-50 p-6 flex flex-col items-center text-center border-b border-red-100">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-3">
            <Trash2 size={24} className="text-red-600" />
          </div>
          <h3 className="text-xl font-black text-slate-800 mb-1">삭제 확인</h3>
          <p className="text-sm text-slate-500 font-bold">이 항목을 영구적으로 삭제하시겠습니까?</p>
        </div>
        
        <div className="p-6 bg-slate-50 space-y-3">
           <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-sm">
              <div className="flex justify-between border-b border-slate-100 pb-2 mb-2">
                 <span className="text-slate-500 font-bold">일자</span>
                 <span className="text-slate-800 font-bold">{info.date}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2 mb-2">
                 <span className="text-slate-500 font-bold">팀명</span>
                 <span className="text-slate-800 font-bold">{info.teamName}</span>
              </div>
              <div className="flex justify-between">
                 <span className="text-slate-500 font-bold">ID</span>
                 <span className="text-slate-400 font-mono text-xs">{String(info.id).substring(0, 15)}...</span>
              </div>
           </div>
           <p className="text-xs text-red-500 font-bold text-center">⚠ 삭제 후에는 복구할 수 없습니다.</p>
        </div>

        <div className="p-4 bg-white border-t border-slate-100 flex gap-3">
          <button 
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            취소
          </button>
          <button 
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-200 transition-colors"
          >
            삭제 확정
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [entries, setEntries] = useState<TBMEntry[]>([]);
  
  // CHANGED: Support array of assessments for history
  const [monthlyAssessments, setMonthlyAssessments] = useState<MonthlyRiskAssessment[]>([]);

  const [showReportModal, setShowReportModal] = useState(false);
  const [signatures, setSignatures] = useState<{safety: string | null, site: string | null}>({
    safety: null,
    site: null
  });
  
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [editingEntry, setEditingEntry] = useState<TBMEntry | null>(null); 

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'backup' | 'teams'>('teams'); 
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamCategory, setNewTeamCategory] = useState<TeamCategory>(TeamCategory.FORMWORK);

  const [deleteState, setDeleteState] = useState<{isOpen: boolean, targetId: string | null, targetInfo: any | null}>({
    isOpen: false,
    targetId: null,
    targetInfo: null
  });

  // Derived state: Get the most recent assessment for TBM Form usage
  const currentMonthGuidelines = useMemo(() => {
    if (monthlyAssessments.length === 0) return [];
    // Sort by month descending (YYYY-MM) and pick the first one
    return [...monthlyAssessments].sort((a, b) => b.month.localeCompare(a.month))[0].priorities;
  }, [monthlyAssessments]);

  useEffect(() => {
    // 1. Load Entries
    const savedEntries = localStorage.getItem('tbm_entries');
    if (savedEntries) {
      try {
        const parsed = JSON.parse(savedEntries);
        if (Array.isArray(parsed)) {
            const sanitized = parsed.map((e: any, index: number) => {
              const safeId = `ENTRY-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`;
              return {
                ...e,
                id: (!e.id || e.id === 'undefined' || e.id === 'null') ? safeId : String(e.id),
                teamName: e.teamName || '미지정 팀',
                date: e.date || new Date().toISOString().split('T')[0],
                time: e.time || '00:00',
                attendeesCount: Number(e.attendeesCount) || 0,
                workDescription: e.workDescription !== undefined ? String(e.workDescription) : '',
                riskFactors: Array.isArray(e.riskFactors) ? e.riskFactors : [],
                safetyFeedback: Array.isArray(e.safetyFeedback) ? e.safetyFeedback.map(String) : []
              };
            });
            setEntries(sanitized);
            localStorage.setItem('tbm_entries', JSON.stringify(sanitized));
        }
      } catch (e) {
        setEntries([]);
      }
    }

    // 2. Load Teams
    const savedTeams = localStorage.getItem('site_teams');
    setTeams(savedTeams ? JSON.parse(savedTeams) : TEAMS);

    // 3. Load Monthly Assessments (Migrate legacy single object to array if needed)
    const savedMonthly = localStorage.getItem('monthly_assessment_list'); // NEW KEY
    const legacyMonthly = localStorage.getItem('monthly_assessment'); // OLD KEY

    if (savedMonthly) {
       try {
         setMonthlyAssessments(JSON.parse(savedMonthly));
       } catch (e) { setMonthlyAssessments([]); }
    } else if (legacyMonthly) {
       // Migration
       try {
         const legacy = JSON.parse(legacyMonthly);
         const newArray = [legacy];
         setMonthlyAssessments(newArray);
         localStorage.setItem('monthly_assessment_list', JSON.stringify(newArray));
       } catch (e) { setMonthlyAssessments([]); }
    }

    const savedSignatures = localStorage.getItem('signatures');
    if (savedSignatures) {
      try {
        setSignatures(JSON.parse(savedSignatures));
      } catch (e) {}
    }
  }, []);

  // --- Handlers ---
  const handleAddTeam = () => {
    if(!newTeamName.trim()) return;
    const newTeam: TeamOption = { id: `team-${Date.now()}`, name: newTeamName.trim(), category: newTeamCategory };
    const updatedTeams = [...teams, newTeam];
    setTeams(updatedTeams);
    localStorage.setItem('site_teams', JSON.stringify(updatedTeams));
    setNewTeamName('');
    alert('팀이 추가되었습니다.');
  };

  const handleDeleteTeam = (id: string) => {
    if(confirm("이 팀을 목록에서 제거하시겠습니까?")) {
        const updatedTeams = teams.filter(t => t.id !== id);
        setTeams(updatedTeams);
        localStorage.setItem('site_teams', JSON.stringify(updatedTeams));
    }
  };

  const handleSaveEntry = (entry: TBMEntry, shouldExit: boolean = true) => {
    setEntries(prevEntries => {
      let updatedEntries;
      const existingIndex = prevEntries.findIndex(e => String(e.id) === String(entry.id));
      if (existingIndex >= 0) {
        updatedEntries = [...prevEntries];
        updatedEntries[existingIndex] = entry;
      } else {
        updatedEntries = [entry, ...prevEntries];
      }
      
      try {
         localStorage.setItem('tbm_entries', JSON.stringify(updatedEntries));
      } catch (error: any) {
         console.error("LocalStorage Error:", error);
         // Check for specific QuotaExceededError
         if (error.name === 'QuotaExceededError' || error.code === 22) {
             alert("⚠️ 저장 용량 부족!\n\n브라우저 저장 공간이 가득 찼습니다.\n이번 기록은 임시로 저장되지만, 새로고침 시 사라질 수 있습니다.\n\n'설정 > 데이터 백업' 후 '초기화'를 권장합니다.");
         } else {
             alert("브라우저 저장소 오류가 발생했습니다. 데이터가 영구 저장되지 않을 수 있습니다.");
         }
      }
      return updatedEntries;
    });
    
    setEditingEntry(null);
    if (shouldExit) setCurrentView('dashboard');
  };
  
  const handleEditEntry = (entry: TBMEntry) => {
    setEditingEntry(entry);
    setShowReportModal(false);
    setCurrentView('new');
  };

  const handleRequestDelete = (rawId: string | number) => {
    const targetId = String(rawId);
    const targetEntry = entries.find(e => String(e.id) === targetId);
    if (!targetEntry) { window.location.reload(); return; }
    setDeleteState({ isOpen: true, targetId: targetId, targetInfo: targetEntry });
  };

  const handleConfirmDelete = () => {
     const { targetId } = deleteState;
     if (!targetId) return;
     const newEntries = entries.filter(e => String(e.id) !== targetId);
     setEntries(newEntries);
     localStorage.setItem('tbm_entries', JSON.stringify(newEntries));
     if (editingEntry && String(editingEntry.id) === targetId) {
         setEditingEntry(null);
         setCurrentView('dashboard');
     }
     setDeleteState({ isOpen: false, targetId: null, targetInfo: null });
  };

  const handleUpdateAssessments = (newAssessments: MonthlyRiskAssessment[]) => {
    setMonthlyAssessments(newAssessments);
    localStorage.setItem('monthly_assessment_list', JSON.stringify(newAssessments));
  };

  const handleUpdateSignature = (role: 'safety' | 'site', dataUrl: string) => {
    const newSignatures = { ...signatures, [role]: dataUrl };
    setSignatures(newSignatures);
    localStorage.setItem('signatures', JSON.stringify(newSignatures));
  };

  const handleExportData = () => {
      const data = { tbm_entries: entries, monthly_assessment_list: monthlyAssessments, signatures, site_teams: teams, meta: { date: new Date() } };
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'SAPA_BACKUP.json'; a.click();
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
          try {
              const json = JSON.parse(evt.target?.result as string);
              if(json.tbm_entries) {
                  setEntries(json.tbm_entries);
                  localStorage.setItem('tbm_entries', JSON.stringify(json.tbm_entries));
              }
              if(json.monthly_assessment_list) {
                  setMonthlyAssessments(json.monthly_assessment_list);
                  localStorage.setItem('monthly_assessment_list', JSON.stringify(json.monthly_assessment_list));
              }
              if(json.site_teams) {
                  setTeams(json.site_teams);
                  localStorage.setItem('site_teams', JSON.stringify(json.site_teams));
              }
              alert("복구 완료");
              setIsSettingsOpen(false);
          } catch(err) { alert("파일 오류"); }
      };
      reader.readAsText(file);
  };

  const handleCleanupData = () => {
     if (confirm('오류 데이터(빈 항목, ID 없음)를 강제로 정리하시겠습니까?')) {
        setEntries(prev => {
            const valid = prev.filter(e => e.id && e.id !== 'undefined' && e.teamName);
            localStorage.setItem('tbm_entries', JSON.stringify(valid));
            alert(`${prev.length - valid.length}개의 오류 항목이 삭제되었습니다.`);
            return valid;
        });
        setIsSettingsOpen(false);
     }
  };

  const handleResetData = () => {
    if (confirm('모든 데이터를 삭제하고 초기화하시겠습니까?')) {
        localStorage.clear();
        window.location.reload();
    }
  };

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard 
                  entries={entries} 
                  onViewReport={()=>setShowReportModal(true)} 
                  onNavigateToReports={()=>setCurrentView('reports')}
                  onNewEntry={()=>{setEditingEntry(null); setCurrentView('new')}} 
                  onEdit={handleEditEntry} 
                  onOpenSettings={()=>setIsSettingsOpen(true)} 
                  onDelete={handleRequestDelete} 
               />;
      case 'new':
        return <TBMForm 
                  onSave={handleSaveEntry} 
                  onCancel={()=>{setCurrentView('dashboard'); setEditingEntry(null)}} 
                  monthlyGuidelines={currentMonthGuidelines} 
                  initialData={editingEntry || undefined} 
                  onDelete={handleRequestDelete} 
                  teams={teams} 
               />;
      case 'risk-assessment':
        return <RiskAssessmentManager assessments={monthlyAssessments} onSave={handleUpdateAssessments} />;
      case 'reports':
        return <ReportCenter entries={entries} onOpenPrintModal={()=>setShowReportModal(true)} signatures={signatures} teams={teams} />;
      default:
        return <Dashboard entries={entries} onViewReport={()=>setShowReportModal(true)} onNavigateToReports={()=>setCurrentView('reports')} onNewEntry={()=>{setEditingEntry(null); setCurrentView('new')}} onEdit={handleEditEntry} onOpenSettings={()=>setIsSettingsOpen(true)} onDelete={handleRequestDelete} />;
    }
  };

  return (
    <div className="flex min-h-screen relative overflow-hidden bg-[#F1F5F9]">
      <Navigation currentView={currentView} setCurrentView={setCurrentView} onOpenSettings={() => setIsSettingsOpen(true)} />
      <main className="flex-1 md:ml-72 p-4 md:p-8 mb-20 md:mb-0 relative z-10">
        <header className="flex justify-between items-center mb-8 no-print">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none mb-1">
              {currentView === 'dashboard' && 'Integrated Dashboard'}
              {currentView === 'new' && 'Smart TBM Registration'}
              {currentView === 'risk-assessment' && 'Risk Assessment Management'}
              {currentView === 'reports' && 'Safe Work Report Center'}
            </h1>
            <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">
               (주)휘강건설 스마트 안전관리 시스템 v2.4
            </p>
          </div>
        </header>

        {renderContent()}

        {showReportModal && (
          <ReportView entries={entries} onClose={() => setShowReportModal(false)} signatures={signatures} onUpdateSignature={handleUpdateSignature} onEdit={handleEditEntry} onDelete={handleRequestDelete} />
        )}

        {deleteState.isOpen && (
           <DeleteConfirmModal info={deleteState.targetInfo} onConfirm={handleConfirmDelete} onCancel={() => setDeleteState({isOpen: false, targetId: null, targetInfo: null})} />
        )}

        {isSettingsOpen && createPortal(
          <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col relative max-h-[85vh]">
              <button onClick={() => setIsSettingsOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 z-10"><X size={24} /></button>
              
              <div className="p-6 border-b border-slate-100 bg-slate-50">
                 <h3 className="font-bold text-lg text-slate-800">시스템 설정</h3>
                 <div className="flex gap-4 mt-4">
                    <button onClick={()=>setSettingsTab('teams')} className={`pb-2 text-sm font-bold border-b-2 transition-colors ${settingsTab === 'teams' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'}`}>팀 관리 ({teams.length})</button>
                    <button onClick={()=>setSettingsTab('backup')} className={`pb-2 text-sm font-bold border-b-2 transition-colors ${settingsTab === 'backup' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'}`}>백업 및 복구</button>
                 </div>
              </div>

              {settingsTab === 'teams' && (
                  <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                     <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-6">
                        <label className="text-[11px] font-bold text-blue-600 block mb-2 uppercase tracking-wide">새로운 팀 추가</label>
                        <div className="flex gap-2">
                           <input type="text" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="팀 이름" className="flex-1 px-3 py-2 rounded-lg border border-blue-200 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-400"/>
                           <select value={newTeamCategory} onChange={(e) => setNewTeamCategory(e.target.value as TeamCategory)} className="px-2 py-2 rounded-lg border border-blue-200 text-sm font-bold outline-none bg-white">
                              {Object.values(TeamCategory).map(cat => (<option key={cat} value={cat}>{cat}</option>))}
                           </select>
                           <button onClick={handleAddTeam} className="bg-blue-600 text-white px-4 rounded-lg font-bold text-sm hover:bg-blue-700 transition-colors">추가</button>
                        </div>
                     </div>
                     <div className="space-y-2">
                        {teams.map(team => (
                           <div key={team.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:border-slate-300 transition-colors">
                              <div className="flex items-center gap-3">
                                 <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"><Users size={16}/></div>
                                 <div><p className="font-bold text-sm text-slate-800">{team.name}</p><span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{team.category}</span></div>
                              </div>
                              <button onClick={() => handleDeleteTeam(team.id)} className="text-slate-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-colors"><Trash2 size={16}/></button>
                           </div>
                        ))}
                     </div>
                  </div>
              )}

              {settingsTab === 'backup' && (
                  <div className="p-6 space-y-4">
                     <button onClick={handleExportData} className="w-full p-3 border rounded-lg flex items-center justify-center gap-2 hover:bg-slate-50"><Download size={16}/> 데이터 백업</button>
                     <div className="relative">
                        <button onClick={()=>fileInputRef.current?.click()} className="w-full p-3 border rounded-lg flex items-center justify-center gap-2 hover:bg-slate-50"><Upload size={16}/> 데이터 복구</button>
                        <input type="file" ref={fileInputRef} className="hidden" onChange={handleImportData} accept=".json"/>
                     </div>
                     <hr/>
                     <button onClick={handleCleanupData} className="w-full p-3 border border-orange-200 bg-orange-50 text-orange-700 rounded-lg flex items-center justify-center gap-2 font-bold"><Eraser size={16}/> 오류 데이터 정리</button>
                     <button onClick={handleResetData} className="w-full p-3 border border-red-200 bg-red-50 text-red-700 rounded-lg flex items-center justify-center gap-2 font-bold"><Trash2 size={16}/> 시스템 초기화</button>
                  </div>
              )}
            </div>
          </div>, document.body
        )}
      </main>
    </div>
  );
}

export default App;
