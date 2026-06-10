
import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, UserCheck, Users, Database, Save, Upload, Download, Plus, Trash2, Settings, AlertTriangle, CheckCircle2, FileText, ShieldCheck, Layers, Loader2, FileSearch, Stethoscope, Sparkles, Eraser, Key, Server, Eye, EyeOff, HelpCircle, ExternalLink, Zap, Network, Lock } from 'lucide-react';
import { ConfirmDialog } from './common/ConfirmDialog';
import { TeamOption, TeamCategory, SiteConfig } from '../types';
import { hasSupportedBackupShape, validateBackupPayload, MAX_BACKUP_FILE_COUNT, MAX_BACKUP_FILE_SIZE, summarizeBackupPayload } from '../utils/backupValidation';
import { validateGeminiConnection } from '../services/geminiService';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  signatures: { safety: string | null; site: string | null };
  onUpdateSignature: (role: 'safety' | 'site', dataUrl: string) => void;
  teams: TeamOption[];
  onAddTeam: (name: string, category: string) => void;
  onDeleteTeam: (id: string) => void;
  onBackupData: (scope: 'ALL' | 'TBM' | 'RISK') => void; 
  onRestoreData: (files: FileList) => void;
  onOptimizeData: () => void;
  
  // [NEW] System Config Props
  siteConfig: SiteConfig;
  onUpdateSiteConfig: (config: SiteConfig) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
    isOpen, onClose, signatures, onUpdateSignature, 
    teams, onAddTeam, onDeleteTeam, onBackupData, onRestoreData, onOptimizeData,
    siteConfig, onUpdateSiteConfig
}) => {
    // [FIX] Initialize with safe defaults to prevent undefined access
    const safeConfig = siteConfig || {
        siteName: '',
        managerName: '',
        userApiKey: null,
        linkageTargetRate: 90,
    };

    const [activeTab, setActiveTab] = useState<'BASIC' | 'SYSTEM' | 'TEAMS' | 'DATA'>('BASIC');
    const [isBackingUp, setIsBackingUp] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [isOptimizing, setIsOptimizing] = useState(false);
    
    // Config State
    const [configForm, setConfigForm] = useState<SiteConfig>(safeConfig);
    const [showApiKey, setShowApiKey] = useState(false);
    
    // [NEW] Connection Test State
    const [isTestingConnection, setIsTestingConnection] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'IDLE' | 'SUCCESS' | 'FAILURE'>('IDLE');
    const [connectionMessage, setConnectionMessage] = useState('');
    const [statusMessage, setStatusMessage] = useState('');
    
    const [newTeamName, setNewTeamName] = useState('');
    const [newTeamCategory, setNewTeamCategory] = useState<string>(TeamCategory.FORMWORK);
    const restoreInputRef = useRef<HTMLInputElement>(null);
    const verifyInputRef = useRef<HTMLInputElement>(null);
    const settingsDialogRef = useRef<HTMLDivElement>(null);
    const settingsCloseButtonRef = useRef<HTMLButtonElement>(null);
    const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
    // [FIX] Mounted ref to prevent state update on unmounted component from delayed async handlers
    const mountedRef = useRef(true);
    const { confirmDialogState, requestConfirm, closeConfirmDialog } = useConfirmDialog();

    const announceStatus = (message: string) => {
        if (!mountedRef.current) return;
        setStatusMessage('');
        requestAnimationFrame(() => {
            if (mountedRef.current) {
                setStatusMessage(message);
            }
        });
    };

    // [FIX] Sync form with props when modal opens
    React.useEffect(() => {
        mountedRef.current = true;
        if (isOpen && siteConfig) {
            setConfigForm(siteConfig);
            setConnectionStatus('IDLE');
            setConnectionMessage('');
        }
        return () => { mountedRef.current = false; };
    }, [isOpen, siteConfig]);

    React.useEffect(() => {
        if (!isOpen) return;

        previouslyFocusedElementRef.current = document.activeElement as HTMLElement | null;
        window.setTimeout(() => {
            settingsCloseButtonRef.current?.focus();
        }, 0);

        const handleEscClose = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (confirmDialogState.isOpen) return;
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
    }, [isOpen, onClose, confirmDialogState.isOpen]);

    const handleSettingsDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Tab') return;

        const dialogNode = settingsDialogRef.current;
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

    const handleSignatureFileChange = (role: 'safety' | 'site') => (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            announceStatus('이미지 파일만 업로드 가능합니다.');
            e.target.value = '';
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            announceStatus('서명 이미지는 최대 2MB까지 가능합니다.');
            e.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (ev) => {
            if (mountedRef.current && ev.target?.result) {
                onUpdateSignature(role, ev.target.result as string);
            }
        };
        reader.onerror = () => {
            if (mountedRef.current) announceStatus('서명 이미지 읽기에 실패했습니다.');
        };
        reader.readAsDataURL(file);
    };

    if (!isOpen) return null;

    const handleAddTeamSubmit = () => {
        if (!newTeamName.trim()) {
            announceStatus('팀 이름을 입력해주세요.');
            return;
        }
        if (teams.some(t => t.name.trim() === newTeamName.trim())) {
            announceStatus('이미 존재하는 팀 이름입니다. 다른 이름을 사용해주세요.');
            return;
        }
        onAddTeam(newTeamName.trim(), newTeamCategory);
        announceStatus(`팀 "${newTeamName.trim()}"이(가) 추가되었습니다.`);
        setNewTeamName('');
    };

    const handleBackupClick = (scope: 'ALL' | 'TBM' | 'RISK') => {
        setIsBackingUp(true);
        setTimeout(() => {
            onBackupData(scope);
            if (mountedRef.current) setIsBackingUp(false);
        }, 500); 
    };

    const onInputClick = (e: React.MouseEvent<HTMLInputElement>) => {
        (e.target as HTMLInputElement).value = '';
    };

    const handleRestoreClick = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            onRestoreData(files);
            e.target.value = '';
        }
    };

    const handleOptimizeClick = async () => {
        const isConfirmed = await requestConfirm("데이터 최적화를 진행하시겠습니까?\n\n내용이 완벽히 동일한 중복 일지를 찾아 제거하고, 데이터 품질이 가장 높은 항목만 남깁니다.\n(주의: 삭제된 데이터는 복구할 수 없습니다.)", {
            title: '데이터 최적화',
            confirmLabel: '진행',
            variant: 'warning'
        });
        if (!isConfirmed) return;

        setIsOptimizing(true);
        setTimeout(() => {
            onOptimizeData();
            if (mountedRef.current) setIsOptimizing(false);
        }, 800);
    };

    const handleVerifyClick = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        // [FIX] 파일 크기 및 개수 제한 (App.tsx 복구 제한과 동일 기준)
        if (files.length > MAX_BACKUP_FILE_COUNT) {
            announceStatus(`파일은 최대 ${MAX_BACKUP_FILE_COUNT}개까지 검사할 수 있습니다.`);
            e.target.value = '';
            return;
        }
        for (let i = 0; i < files.length; i++) {
            if (files[i].size > MAX_BACKUP_FILE_SIZE) {
                announceStatus(`"${files[i].name}" 파일이 너무 큽니다. (최대 50MB)`);
                e.target.value = '';
                return;
            }
        }
        
        setIsVerifying(true);

        setTimeout(async () => {
            try {
                let totalTbm = 0;
                let totalRisk = 0;
                let totalTeam = 0;
                let validFiles = 0;
                let errorCount = 0;

                const fileArray = Array.from(files) as File[];

                for (const file of fileArray) {
                    try {
                        const text = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(reader.result as string);
                            reader.onerror = () => reject(new Error("File read error"));
                            reader.readAsText(file);
                        });

                        if (!text) throw new Error("Empty file");
                        
                        let json;
                        try {
                            json = JSON.parse(text);
                        } catch {
                            throw new Error("Invalid JSON format");
                        }

                        const zodValidated = validateBackupPayload(json);
                        if (!zodValidated && !hasSupportedBackupShape(json)) {
                            throw new Error("Unsupported backup schema");
                        }
                        
                        const summary = summarizeBackupPayload(json);
                        totalTbm += summary.totalTbm;
                        totalRisk += summary.totalRisk;
                        totalTeam += summary.totalTeam;
                        if (summary.hasData) validFiles++;
                    } catch (err: any) {
                        console.error(`File ${file.name} failed:`, err);
                        errorCount++;
                    }
                }

                const report = `
✅ 파일 무결성 검사 결과
------------------------
• 검사 파일: ${fileArray.length}개
• 유효 파일: ${validFiles}개
• 오류 파일: ${errorCount}개

[발견된 데이터]
📋 TBM 일지: ${totalTbm}건
🛡️ 위험성평가: ${totalRisk}건
👷 팀 정보: ${totalTeam}건

${validFiles > 0 ? "데이터가 정상입니다. [데이터 복구] 버튼을 눌러 진행하세요." : "⚠️ 유효한 데이터 구조를 찾지 못했습니다."}
                `;
                if (mountedRef.current) {
                    console.info(report);
                    announceStatus(`파일 무결성 검사 완료: 유효 파일 ${validFiles}개, 오류 파일 ${errorCount}개, TBM ${totalTbm}건, 위험성평가 ${totalRisk}건, 팀 ${totalTeam}건`);
                }

            } catch (err: any) {
                console.error(err);
                if (mountedRef.current) announceStatus(`검사 중 시스템 오류: ${err.message}`);
            } finally {
                if (mountedRef.current) setIsVerifying(false);
            }
        }, 300);
    };

    const handleTestConnection = async () => {
        const apiKey = configForm.userApiKey;
        if (!apiKey || apiKey.trim() === '') {
            setConnectionStatus('FAILURE');
            setConnectionMessage('API 키를 입력해주세요.');
            announceStatus('API 키를 입력해주세요.');
            return;
        }
        
        // [FIX] Validate prefix logic
        if (!apiKey.trim().startsWith('AIza')) {
            setConnectionStatus('FAILURE');
            setConnectionMessage("API 키는 'AIza'로 시작해야 합니다. 올바른 키인지 확인해주세요.");
            announceStatus("API 키는 'AIza'로 시작해야 합니다. 올바른 키인지 확인해주세요.");
            return;
        }
        
        setIsTestingConnection(true);
        setConnectionStatus('IDLE');
        
        const result = await validateGeminiConnection(apiKey);
        if (!mountedRef.current) return;
        
        setIsTestingConnection(false);
        setConnectionStatus(result.success ? 'SUCCESS' : 'FAILURE');
        setConnectionMessage(result.message);
        
        announceStatus(result.message);
    };

    const handleSaveConfig = async () => {
        // [FIX] Trim whitespace automatically
        const trimmedKey = configForm.userApiKey ? configForm.userApiKey.trim() : null;
        
        if (trimmedKey && !trimmedKey.startsWith('AIza')) {
            const isConfirmed = await requestConfirm("경고: API 키 형식이 올바르지 않아 보입니다. (AIza로 시작해야 함)\n그래도 저장하시겠습니까?", {
                title: 'API 키 형식 경고',
                confirmLabel: '저장',
                variant: 'warning'
            });
            if (!isConfirmed) return;
        }
        
        const cleanConfig = {
            ...configForm,
            userApiKey: trimmedKey,
            linkageTargetRate: Math.max(0, Math.min(100, Number(configForm.linkageTargetRate ?? 90)))
        };
        
        onUpdateSiteConfig(cleanConfig);
        announceStatus('시스템 설정이 저장되었습니다.');
    };

    const handleClearApiKey = async () => {
        const isConfirmed = await requestConfirm('저장된 API 키를 현재 브라우저 세션에서 제거하시겠습니까?', {
            title: 'API 키 제거',
            confirmLabel: '제거',
            variant: 'danger'
        });
        if (!isConfirmed) return;

        const nextConfig = { ...configForm, userApiKey: null };
        setConfigForm(nextConfig);
        setConnectionStatus('IDLE');
        setConnectionMessage('');
        onUpdateSiteConfig(nextConfig);
        announceStatus('API 키가 제거되었습니다.');
    };

    const normalizedApiKey = (configForm.userApiKey || '').trim();
    const maskedApiKey = normalizedApiKey.length >= 8
        ? `${normalizedApiKey.slice(0, 4)}••••${normalizedApiKey.slice(-4)}`
        : normalizedApiKey.length > 0
            ? `${normalizedApiKey.slice(0, 2)}••••`
            : '';
    
    const connectionGuide = (() => {
        if (!connectionMessage) return '';
        if (connectionStatus === 'SUCCESS') return '테스트가 성공했습니다. [설정 저장 및 적용] 버튼으로 현재 키를 저장하세요.';

        const normalizedMessage = connectionMessage.toLowerCase();
        if (normalizedMessage.includes('유효하지')) return 'Google AI Studio에서 새 키를 발급한 뒤 공백 없이 다시 붙여넣어 주세요.';
        if (normalizedMessage.includes('권한') || normalizedMessage.includes('리퍼러')) return 'Google Cloud/AI Studio에서 키 제한(웹사이트 리퍼러, API 허용 범위)을 현재 도메인에 맞게 확인해 주세요.';
        if (normalizedMessage.includes('429') || normalizedMessage.includes('한도') || normalizedMessage.includes('quota')) return '사용량 한도 초과 상태입니다. 잠시 후 재시도하거나 결제/쿼터 설정을 확인해 주세요.';
        if (normalizedMessage.includes('시간') || normalizedMessage.includes('timeout') || normalizedMessage.includes('네트워크')) return '네트워크 연결 또는 방화벽/프록시 정책을 확인한 뒤 다시 테스트해 주세요.';
        return '키 형식, 네트워크, API 권한 설정을 순서대로 확인한 뒤 다시 연결 테스트를 실행해 주세요.';
    })();

    return createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
            <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{statusMessage}</p>
            <div ref={settingsDialogRef} role="dialog" aria-modal="true" aria-labelledby="settings-modal-title" aria-describedby="settings-modal-description" onKeyDown={handleSettingsDialogKeyDown} className="bg-white rounded-[24px] shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="bg-slate-100 p-2 rounded-xl text-slate-600">
                            <Settings size={24} />
                        </div>
                        <div>
                            <h2 id="settings-modal-title" className="text-xl font-black text-slate-800">환경 설정</h2>
                            <p id="settings-modal-description" className="text-xs text-slate-500 font-medium">시스템 운영에 필요한 기본 정보를 관리합니다.</p>
                        </div>
                    </div>
                    <button ref={settingsCloseButtonRef} onClick={onClose} aria-label="환경 설정 닫기" className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600">
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex flex-wrap sm:flex-nowrap border-b border-slate-100 px-6 gap-4 sm:gap-6 overflow-x-auto no-scrollbar">
                    {[
                        { id: 'BASIC', label: '기본 설정 · 서명', icon: <UserCheck size={16}/> },
                        { id: 'SYSTEM', label: '시스템 설정 · API/현장', icon: <Server size={16}/> },
                        { id: 'TEAMS', label: '팀/공종 관리', icon: <Users size={16}/> },
                        { id: 'DATA', label: '데이터 백업/복구', icon: <Database size={16}/> }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 py-4 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
                                activeTab === tab.id 
                                ? 'border-indigo-600 text-indigo-600' 
                                : 'border-transparent text-slate-400 hover:text-slate-600'
                            }`}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50 custom-scrollbar">
                    
                    {/* 1. Basic (Signatures) */}
                    {activeTab === 'BASIC' && (
                        <div className="space-y-6">
                            <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-start gap-3">
                                <div className="bg-blue-100 p-2 rounded-full text-blue-600 shrink-0 mt-0.5"><UserCheck size={16}/></div>
                                <div>
                                    <h4 className="text-sm font-bold text-blue-800 mb-1">전자 결재 서명 등록</h4>
                                    <p className="text-xs text-blue-600 leading-relaxed">
                                        등록된 서명은 모든 보고서 및 TBM 일지에 자동으로 적용됩니다.<br/>
                                        배경이 투명한 PNG 이미지를 권장합니다.
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3">
                                    <div className="flex justify-between items-center">
                                        <label className="text-sm font-bold text-slate-700">안전관리자 서명</label>
                                        {signatures.safety && <span className="text-[10px] text-emerald-500 font-bold flex items-center gap-1"><CheckCircle2 size={12}/> 등록됨</span>}
                                    </div>
                                    <div className="aspect-[3/2] bg-slate-50 rounded-lg border-2 border-dashed border-slate-200 flex items-center justify-center relative overflow-hidden group hover:border-indigo-300 transition-colors">
                                        {signatures.safety ? (
                                            <img src={signatures.safety} className="w-full h-full object-contain p-2" />
                                        ) : (
                                            <span className="text-xs text-slate-400 font-medium">이미지 없음</span>
                                        )}
                                        <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onClick={onInputClick} onChange={handleSignatureFileChange('safety')}/>
                                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                            <span className="text-white text-xs font-bold">변경하기</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3">
                                    <div className="flex justify-between items-center">
                                        <label className="text-sm font-bold text-slate-700">현장소장 서명</label>
                                        {signatures.site && <span className="text-[10px] text-emerald-500 font-bold flex items-center gap-1"><CheckCircle2 size={12}/> 등록됨</span>}
                                    </div>
                                    <div className="aspect-[3/2] bg-slate-50 rounded-lg border-2 border-dashed border-slate-200 flex items-center justify-center relative overflow-hidden group hover:border-indigo-300 transition-colors">
                                        {signatures.site ? (
                                            <img src={signatures.site} className="w-full h-full object-contain p-2" />
                                        ) : (
                                            <span className="text-xs text-slate-400 font-medium">이미지 없음</span>
                                        )}
                                        <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onClick={onInputClick} onChange={handleSignatureFileChange('site')}/>
                                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                            <span className="text-white text-xs font-bold">변경하기</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 2. System Config (API Key, Site Info) */}
                    {activeTab === 'SYSTEM' && (
                        <div className="space-y-6 animate-fade-in">
                            {/* Setup Guide (Infographic) */}
                            <div className="bg-gradient-to-br from-slate-900 to-indigo-950 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
                                <div className="relative z-10">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="bg-indigo-500 p-2 rounded-lg text-white shadow-lg"><Key size={20}/></div>
                                            <div className="min-w-0">
                                                <h3 className="text-lg font-black tracking-tight">API Key 발급 및 설정 가이드</h3>
                                                <p className="text-xs text-indigo-300 font-medium">Google Gemini Pro를 무료로 사용하기 위한 3단계</p>
                                            </div>
                                        </div>
                                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 bg-white text-indigo-900 px-4 py-2 rounded-xl text-xs font-black hover:bg-indigo-50 transition-colors shadow-lg w-full sm:w-auto">
                                            <ExternalLink size={14}/> 발급 사이트 이동
                                        </a>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div className="bg-white/10 rounded-xl p-4 border border-white/10 backdrop-blur-sm relative group hover:bg-white/15 transition-colors">
                                            <div className="absolute -top-3 left-4 bg-indigo-500 text-white text-[10px] font-black px-2 py-0.5 rounded shadow">1단계</div>
                                            <div className="flex justify-center mb-3 text-indigo-300"><Layers size={24}/></div>
                                            <p className="text-center text-xs font-bold leading-snug">Google AI Studio<br/>접속 및 로그인</p>
                                        </div>
                                        <div className="bg-white/10 rounded-xl p-4 border border-white/10 backdrop-blur-sm relative group hover:bg-white/15 transition-colors">
                                            <div className="absolute -top-3 left-4 bg-indigo-500 text-white text-[10px] font-black px-2 py-0.5 rounded shadow">2단계</div>
                                            <div className="flex justify-center mb-3 text-indigo-300"><Plus size={24}/></div>
                                            <p className="text-center text-xs font-bold leading-snug">API 키 생성<br/>버튼 클릭</p>
                                        </div>
                                        <div className="bg-white/10 rounded-xl p-4 border border-white/10 backdrop-blur-sm relative group hover:bg-white/15 transition-colors">
                                            <div className="absolute -top-3 left-4 bg-indigo-500 text-white text-[10px] font-black px-2 py-0.5 rounded shadow">3단계</div>
                                            <div className="flex justify-center mb-3 text-indigo-300"><CheckCircle2 size={24}/></div>
                                            <p className="text-center text-xs font-bold leading-snug">생성된 Key 복사 후<br/>아래 입력창에 붙여넣기</p>
                                        </div>
                                    </div>

                                    <div className="mt-6 flex items-center gap-3 bg-indigo-900/50 p-3 rounded-xl border border-indigo-500/30">
                                        <Zap size={16} className="text-yellow-400 animate-pulse shrink-0"/>
                                        <p className="text-[10px] text-indigo-200 leading-relaxed font-medium">
                                            <span className="text-white font-bold">안내</span> 무료 티어는 개인 API 키를 사용할 때 가장 안정적입니다.
                                            공용 키 사용 시 <span className="text-red-300 underline decoration-red-300/50">사용량 초과(429 Error)</span>가 발생할 수 있습니다.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Inputs */}
                            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">현장명</label>
                                    <input 
                                        type="text" 
                                        value={configForm.siteName}
                                        onChange={(e) => setConfigForm({...configForm, siteName: e.target.value})}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm font-bold outline-none focus:border-indigo-500 transition-colors"
                                        placeholder="예: 용인 푸르지오 원클러스터"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">관리자 성명</label>
                                    <input 
                                        type="text" 
                                        value={configForm.managerName}
                                        onChange={(e) => setConfigForm({...configForm, managerName: e.target.value})}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm font-bold outline-none focus:border-indigo-500 transition-colors"
                                        placeholder="예: 박성훈 부장"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">연계율 목표값</label>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {[80, 90, 95].map(rate => (
                                            <button
                                                key={rate}
                                                onClick={() => setConfigForm({ ...configForm, linkageTargetRate: rate })}
                                                className={`px-3 py-2 rounded-lg text-xs font-bold border ${configForm.linkageTargetRate === rate ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                                            >
                                                {rate}%
                                            </button>
                                        ))}
                                        <input
                                            type="number"
                                            min={0}
                                            max={100}
                                            value={configForm.linkageTargetRate ?? 90}
                                            onChange={(e) => setConfigForm({ ...configForm, linkageTargetRate: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                                            className="w-24 bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm font-bold outline-none focus:border-indigo-500 transition-colors"
                                        />
                                        <span className="text-[11px] text-slate-400">심층연구소 연계 추이 목표선에 반영됩니다.</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Google Gemini API 키</label>
                                    <div className="space-y-2">
                                        <div className="relative w-full">
                                            <input 
                                                type={showApiKey ? "text" : "password"} 
                                                value={configForm.userApiKey || ''}
                                                onChange={(e) => {
                                                    setConfigForm({...configForm, userApiKey: e.target.value});
                                                    setConnectionStatus('IDLE');
                                                    setConnectionMessage('');
                                                }}
                                                className="w-full min-w-0 bg-slate-50 border border-slate-200 rounded-lg py-3 px-3 pr-10 text-sm font-mono font-bold outline-none focus:border-indigo-500 transition-colors"
                                                placeholder="AIza..."
                                            />
                                            <button 
                                                onClick={() => setShowApiKey(!showApiKey)}
                                                aria-label={showApiKey ? "API 키 숨기기" : "API 키 표시"}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors"
                                            >
                                                {showApiKey ? <EyeOff size={16}/> : <Eye size={16}/>}
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <button 
                                                onClick={handleTestConnection}
                                                disabled={isTestingConnection}
                                                className={`w-full sm:w-auto min-w-[118px] px-4 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition-all ${
                                                    connectionStatus === 'SUCCESS' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' :
                                                    connectionStatus === 'FAILURE' ? 'bg-red-50 border-red-200 text-red-600' :
                                                    'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                                                }`}
                                            >
                                                {isTestingConnection ? <Loader2 size={16} className="animate-spin"/> : <Network size={16}/>} 
                                                {isTestingConnection ? '확인 중...' : '연결 테스트'}
                                            </button>
                                            <button 
                                                onClick={handleClearApiKey}
                                                disabled={!configForm.userApiKey}
                                                className="w-full sm:w-auto min-w-[92px] px-4 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border bg-white border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <Eraser size={16}/>
                                                키 삭제
                                            </button>
                                        </div>
                                    </div>
                                    {maskedApiKey && (
                                        <p className="text-[11px] text-slate-500 mt-1">저장된 키 미리보기: {maskedApiKey}</p>
                                    )}
                                    {connectionMessage && (
                                        <div className={`mt-2 rounded-lg border px-3 py-2 ${connectionStatus === 'SUCCESS' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                                            <p className={`text-[11px] font-bold ${connectionStatus === 'SUCCESS' ? 'text-emerald-700' : 'text-amber-700'}`}>{connectionMessage}</p>
                                            <p className={`text-[11px] mt-1 flex items-start gap-1 ${connectionStatus === 'SUCCESS' ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                <HelpCircle size={12} className="mt-0.5 shrink-0"/>{connectionGuide}
                                            </p>
                                        </div>
                                    )}
                                    <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                                        <Lock size={10}/> 입력한 키는 localStorage에 남기지 않고 현재 브라우저 세션에만 보관됩니다.
                                    </p>
                                </div>
                                <button 
                                    onClick={handleSaveConfig}
                                    className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2"
                                >
                                    <Save size={18}/> 설정 저장 및 적용
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 3. Teams */}
                    {activeTab === 'TEAMS' && (
                        <div className="space-y-6">
                            {/* Add Form */}
                            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                                <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                                    <Plus size={16} className="text-indigo-600"/> 신규 팀 등록
                                </h4>
                                <div className="flex gap-2">
                                    <div className="w-1/3">
                                        <label className="block text-[10px] font-bold text-slate-400 mb-1">공종 (Category)</label>
                                        <select 
                                            value={newTeamCategory}
                                            onChange={(e) => setNewTeamCategory(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs font-bold outline-none focus:border-indigo-500"
                                        >
                                            {Object.values(TeamCategory).map(cat => (
                                                <option key={cat} value={cat}>{cat}</option>
                                            ))}
                                            <option value="기타">기타 (직접입력)</option>
                                        </select>
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-[10px] font-bold text-slate-400 mb-1">팀 명칭 (Team Name)</label>
                                        <input 
                                            type="text" 
                                            value={newTeamName}
                                            onChange={(e) => setNewTeamName(e.target.value)}
                                            placeholder="예: A동 형틀 1팀"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs font-bold outline-none focus:border-indigo-500"
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddTeamSubmit()}
                                        />
                                    </div>
                                    <div className="flex items-end">
                                        <button 
                                            onClick={handleAddTeamSubmit}
                                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors h-[34px]"
                                        >
                                            추가
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Team List */}
                            <div className="space-y-2">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">등록된 팀 목록 ({teams.length})</h4>
                                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                    {teams.length === 0 ? (
                                        <div className="p-8 text-center text-slate-400 text-xs">등록된 팀이 없습니다.</div>
                                    ) : (
                                        <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto custom-scrollbar">
                                            {teams.map((team) => (
                                                <div key={team.id} className="p-3 flex justify-between items-center hover:bg-slate-50 transition-colors">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">{team.category}</span>
                                                        <span className="text-sm font-bold text-slate-800">{team.name}</span>
                                                    </div>
                                                    <button 
                                                        onClick={() => onDeleteTeam(team.id)}
                                                        aria-label={`${team.name} 팀 삭제`}
                                                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    >
                                                        <Trash2 size={16}/>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 4. Data Backup/Restore */}
                    {activeTab === 'DATA' && (
                        <div className="space-y-6">
                            <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex items-start gap-3">
                                <div className="bg-amber-100 p-2 rounded-full text-amber-600 shrink-0 mt-0.5"><AlertTriangle size={16}/></div>
                                <div>
                                    <h4 className="text-sm font-bold text-amber-800 mb-1">데이터 관리 주의사항</h4>
                                    <p className="text-xs text-amber-700 leading-relaxed">
                                        브라우저 캐시 삭제 시 데이터가 유실될 수 있습니다.<br/>
                                        <strong>정기적으로 백업 파일을 다운로드하여 PC 또는 클라우드에 보관하세요.</strong>
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {/* Export Section */}
                                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                        <Download size={18} className="text-indigo-600"/> 데이터 백업
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <button 
                                            onClick={() => handleBackupClick('TBM')}
                                            disabled={isBackingUp}
                                            className="flex flex-col items-center justify-center p-4 bg-slate-50 border border-slate-200 rounded-xl hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-all gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isBackingUp ? <Loader2 size={24} className="animate-spin text-indigo-500"/> : <FileText size={24} className="text-slate-400 group-hover:text-indigo-500"/>}
                                            <span className="text-xs font-bold">TBM 일지 전용</span>
                                        </button>
                                        <button 
                                            onClick={() => handleBackupClick('RISK')}
                                            disabled={isBackingUp}
                                            className="flex flex-col items-center justify-center p-4 bg-slate-50 border border-slate-200 rounded-xl hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700 transition-all gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isBackingUp ? <Loader2 size={24} className="animate-spin text-amber-500"/> : <ShieldCheck size={24} className="text-slate-400 group-hover:text-amber-500"/>}
                                            <span className="text-xs font-bold">위험성평가 전용</span>
                                        </button>
                                        <button 
                                            onClick={() => handleBackupClick('ALL')}
                                            disabled={isBackingUp}
                                            className="flex flex-col items-center justify-center p-4 bg-slate-50 border border-slate-200 rounded-xl hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition-all gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isBackingUp ? <Loader2 size={24} className="animate-spin text-emerald-500"/> : <Layers size={24} className="text-slate-400 group-hover:text-emerald-500"/>}
                                            <span className="text-xs font-bold">전체 통합 백업</span>
                                        </button>
                                    </div>
                                    {isBackingUp && <p className="text-[10px] text-slate-400 text-center mt-2 animate-pulse">데이터 패키징 중입니다...</p>}
                                </div>

                                {/* Import & Verify Section */}
                                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                        <Database size={18} className="text-emerald-600"/> 데이터 복구 및 검증
                                    </h3>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Verify Button */}
                                        <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 gap-3 hover:border-blue-300 hover:bg-blue-50 transition-colors group">
                                            <Stethoscope size={32} className="text-slate-300 group-hover:text-blue-500"/>
                                            <div className="text-center">
                                                <p className="text-sm font-bold text-slate-600 group-hover:text-blue-700">백업 파일 무결성 검사</p>
                                                <p className="text-[10px] text-slate-400 mt-1">복구 전 파일 정상 여부 확인 (다중 선택 가능)</p>
                                            </div>
                                            <button 
                                                onClick={() => verifyInputRef.current?.click()}
                                                disabled={isVerifying}
                                                className="mt-1 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:border-blue-300 hover:text-blue-600 shadow-sm flex items-center gap-2"
                                            >
                                                {isVerifying ? <Loader2 size={12} className="animate-spin"/> : <FileSearch size={12}/>} 
                                                파일 검사 실행
                                            </button>
                                            <input 
                                                type="file" 
                                                ref={verifyInputRef} 
                                                className="hidden" 
                                                accept=".json"
                                                multiple
                                                onClick={onInputClick}
                                                onChange={handleVerifyClick}
                                            />
                                        </div>

                                        {/* Restore Button */}
                                        <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 gap-3 hover:border-emerald-300 hover:bg-emerald-50 transition-colors group">
                                            <Upload size={32} className="text-slate-300 group-hover:text-emerald-500"/>
                                            <div className="text-center">
                                                <p className="text-sm font-bold text-slate-600 group-hover:text-emerald-700">데이터 복구</p>
                                                <p className="text-[10px] text-slate-400 mt-1">기존 데이터를 덮어쓰거나 병합합니다.</p>
                                            </div>
                                            <button 
                                                onClick={() => restoreInputRef.current?.click()}
                                                className="mt-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all flex items-center gap-2"
                                            >
                                                <Database size={12}/> 
                                                복구 시작
                                            </button>
                                            <input 
                                                type="file" 
                                                ref={restoreInputRef} 
                                                className="hidden" 
                                                accept=".json"
                                                multiple
                                                onClick={onInputClick}
                                                onChange={handleRestoreClick}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* [NEW] Data Optimization Section */}
                                <div className="bg-slate-100 p-5 rounded-2xl border border-slate-200 shadow-inner group">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <Sparkles size={18} className="text-violet-600"/>
                                            <h3 className="font-bold text-slate-800">데이터베이스 최적화</h3>
                                        </div>
                                        <button 
                                            onClick={handleOptimizeClick}
                                            disabled={isOptimizing}
                                            className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-xs font-bold hover:bg-violet-50 hover:text-violet-700 hover:border-violet-300 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
                                        >
                                            {isOptimizing ? <Loader2 size={14} className="animate-spin"/> : <Eraser size={14}/>}
                                            중복 제거 및 정리
                                        </button>
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                                        여러 번의 복구로 인해 생성된 <strong>동일한 내용의 중복 데이터</strong>를 자동으로 검색하여 제거합니다.<br/>
                                        날짜, 시간, 팀명이 동일한 경우 품질이 높은(사진/AI분석 포함) 항목 1개만 남깁니다.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50">
                    <button onClick={onClose} aria-label="환경 설정 닫기" className="px-6 py-2 bg-white border border-slate-300 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-100 transition-colors">
                        닫기
                    </button>
                </div>
            </div>

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
        </div>,
        document.body
    );
};
