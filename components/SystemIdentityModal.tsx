
import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Cpu, ShieldCheck, Zap, Server, Activity, Lock, Globe, Database, Layers } from 'lucide-react';

interface SystemIdentityModalProps {
  onClose: () => void;
}

export const SystemIdentityModal: React.FC<SystemIdentityModalProps> = ({ onClose }) => {
    const systemIdentityDialogRef = useRef<HTMLDivElement>(null);
    const systemIdentityCloseButtonRef = useRef<HTMLButtonElement>(null);
    const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

    React.useEffect(() => {
        previouslyFocusedElementRef.current = document.activeElement as HTMLElement | null;
        window.setTimeout(() => {
            systemIdentityCloseButtonRef.current?.focus();
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

    const handleSystemIdentityDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Tab') return;

        const dialogNode = systemIdentityDialogRef.current;
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
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-[#0F172A]/80 backdrop-blur-md p-4 animate-fade-in" onClick={onClose}>
                <div ref={systemIdentityDialogRef} role="dialog" aria-modal="true" aria-labelledby="system-identity-modal-title" aria-describedby="system-identity-modal-description" onKeyDown={handleSystemIdentityDialogKeyDown} className="bg-slate-900 border border-slate-700 rounded-[32px] w-full max-w-2xl overflow-hidden shadow-2xl relative" onClick={e => e.stopPropagation()}>
            
            {/* Ambient Background */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/20 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/3 pointer-events-none"></div>

            {/* Header */}
            <div className="p-8 pb-4 relative z-10 flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-1 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-bold border border-indigo-500/30 uppercase tracking-widest">시스템 아이덴티티</span>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10B981]"></span>
                    </div>
                    <h2 id="system-identity-modal-title" className="text-3xl font-black text-white tracking-tight">PSI <span className="text-slate-500">HRI OS</span></h2>
                    <p id="system-identity-modal-description" className="text-slate-400 text-xs font-medium mt-1">사람 중심 예측 안전 플랫폼 v4.0.1</p>
                </div>
                <button ref={systemIdentityCloseButtonRef} onClick={onClose} aria-label="시스템 아이덴티티 닫기" className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors">
                    <X size={20} />
                </button>
            </div>

            {/* Grid Layout */}
            <div className="p-8 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
                
                {/* Core Engine */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/10 transition-colors group">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400 group-hover:text-indigo-300 transition-colors">
                            <Cpu size={20} />
                        </div>
                        <h3 className="text-slate-200 font-bold text-sm">AI 뉴럴 엔진</h3>
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">AI 모델</span>
                            <span className="text-slate-300 font-mono font-bold text-indigo-400">Gemini Flash 기반</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">비전 분석 기능</span>
                            <span className="text-emerald-400 font-mono">활성화됨 (1080p)</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">평균 응답 시간</span>
                            <span className="text-slate-300 font-mono">~0.7초 (초고속)</span>
                        </div>
                    </div>
                </div>

                {/* Security */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/10 transition-colors group">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400 group-hover:text-emerald-300 transition-colors">
                            <ShieldCheck size={20} />
                        </div>
                        <h3 className="text-slate-200 font-bold text-sm">보안 프로토콜</h3>
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">로컬 암호화</span>
                            <span className="text-slate-300 font-mono">AES-256</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">데이터 무결성</span>
                            <span className="text-emerald-400 font-mono">검증됨</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">장애 조치</span>
                            <span className="text-slate-300 font-mono">자동 백업</span>
                        </div>
                    </div>
                </div>

                {/* Architecture */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/10 transition-colors group">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400 group-hover:text-blue-300 transition-colors">
                            <Layers size={20} />
                        </div>
                        <h3 className="text-slate-200 font-bold text-sm">시스템 아키텍처</h3>
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">UX 디자인</span>
                            <span className="text-slate-300 font-mono">벤토 그리드 V3</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">데이터 저장소</span>
                            <span className="text-slate-300 font-mono">IndexedDB (고성능)</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">렌더링 방식</span>
                            <span className="text-slate-300 font-mono">클라이언트 렌더링 (CSR)</span>
                        </div>
                    </div>
                </div>

                {/* Developer Info */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/10 transition-colors group">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-rose-500/20 rounded-lg text-rose-400 group-hover:text-rose-300 transition-colors">
                            <Activity size={20} />
                        </div>
                        <h3 className="text-slate-200 font-bold text-sm">운영 및 유지보수</h3>
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">개발 총괄</span>
                            <span className="text-white font-bold">박성훈 부장</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">기술 지원</span>
                            <span className="text-slate-300 font-mono">이다애 기사</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">최근 패치</span>
                            <span className="text-amber-400 font-mono">2026.01.13</span>
                        </div>
                    </div>
                </div>

            </div>

            {/* Footer Status */}
            <div className="p-6 border-t border-white/5 bg-black/20 flex justify-between items-center text-[10px] text-slate-500 font-mono relative z-10">
                <div className="flex gap-4">
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 정상 작동 중</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> 동기화 활성</span>
                </div>
                <div>ID: PSI-HRI-CORE-V4</div>
            </div>
        </div>
    </div>,
    document.body
  );
};
