
import React from 'react';
import { LayoutDashboard, PlusCircle, FileText, ShieldCheck, ChevronRight, Settings, Shield, Award, Sparkles, History } from 'lucide-react';

interface NavigationProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  onOpenSettings: () => void;
  onShowHistory: () => void; // New Prop
}

// Updated Logo: HUIGANG Construction Premium Brand
const BrandLogo = () => (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="brand_grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
        <stop stopColor="#ffffff" />
        <stop offset="1" stopColor="#94a3b8" />
      </linearGradient>
    </defs>
    {/* Abstract Building / H Shape */}
    <path d="M10 8H18V20H30V8H38V40H30V28H18V40H10V8Z" fill="url(#brand_grad)" />
    {/* Safety Dot */}
    <circle cx="38" cy="10" r="3" fill="#EF4444" stroke="#0F172A" strokeWidth="2"/>
  </svg>
);

export const Navigation: React.FC<NavigationProps> = ({ currentView, setCurrentView, onOpenSettings, onShowHistory }) => {
  const navItems = [
    { id: 'dashboard', label: '통합 대시보드', sub: 'Main Dashboard', icon: <LayoutDashboard size={20} /> },
    { id: 'new', label: '스마트 TBM 등록', sub: 'New TBM Entry', icon: <PlusCircle size={20} /> },
    { id: 'risk-assessment', label: '위험성평가 관리', sub: 'Risk Management', icon: <ShieldCheck size={20} /> },
    { id: 'reports', label: '보고서 센터', sub: 'Report & Print', icon: <FileText size={20} /> },
  ];

  return (
    <>
      {/* Mobile Bottom Nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-6 py-3 flex justify-between md:hidden z-50 no-print shadow-[0_-4px_20px_rgba(0,0,0,0.05)] safe-area-bottom">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setCurrentView(item.id)}
            className={`flex flex-col items-center gap-1 transition-colors ${
              currentView === item.id ? 'text-blue-600' : 'text-slate-400'
            }`}
          >
            {item.icon}
            <span className="text-[10px] font-bold">{item.sub.split(' ')[0]}</span>
          </button>
        ))}
        <button
          onClick={onOpenSettings}
          className="flex flex-col items-center gap-1 transition-colors text-slate-400"
        >
          <Settings size={20} />
          <span className="text-[10px] font-bold">Settings</span>
        </button>
      </div>

      {/* Desktop Sidebar - Premium Dark Theme */}
      <div className="hidden md:flex flex-col w-72 h-screen fixed left-0 top-0 no-print bg-[#0F172A] text-slate-300 z-50 shadow-2xl overflow-hidden">
        
        {/* Decorative Background Elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-600/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none"></div>

        {/* 1. Brand Header (Fixed Top Left) */}
        <div className="p-6 pb-2 relative z-10">
          <div className="flex flex-col gap-1 mb-6">
            <span className="text-[11px] font-extrabold text-blue-400 tracking-[0.2em] uppercase border-b border-slate-700 pb-2 mb-2">
              (주)휘강건설
            </span>
            <div className="flex items-center gap-3">
               <BrandLogo />
               <div>
                 <h1 className="font-black text-xl leading-none text-white tracking-tight">HUIGANG SMART<br/>SAFETY</h1>
               </div>
            </div>
          </div>
          
          {/* Site Badge */}
          <div className="bg-slate-800/50 backdrop-blur-md rounded-lg p-3 border border-slate-700/50 flex items-center gap-3 group hover:border-blue-500/30 transition-colors cursor-default">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-xs shadow-lg">
              YP
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Project Site</p>
              <p className="text-xs font-bold text-slate-100 leading-tight">
                용인 푸르지오 원클러스터<br/>
                <span className="text-blue-400">2,3단지 현장</span>
              </p>
            </div>
          </div>
        </div>
        
        {/* 2. Navigation Items */}
        <div className="flex-1 px-4 py-6 relative z-10 overflow-y-auto custom-scrollbar">
          <p className="text-[10px] font-bold text-slate-500 mb-3 px-3 uppercase tracking-wider">System Menu</p>
          <div className="space-y-1.5 mb-8">
            {navItems.map((item) => {
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentView(item.id)}
                  className={`
                    w-full flex items-center justify-between p-3.5 rounded-xl transition-all duration-300 group relative overflow-hidden
                    ${isActive 
                      ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-900/30 border border-blue-500/50' 
                      : 'hover:bg-slate-800/50 hover:text-white border border-transparent hover:border-slate-700'
                    }
                  `}
                >
                  <div className="flex items-center gap-3 relative z-10">
                    <span className={isActive ? 'text-blue-100' : 'text-slate-500 group-hover:text-slate-300 transition-colors'}>
                      {item.icon}
                    </span>
                    <div className="flex flex-col items-start">
                      <span className={`text-sm font-bold ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white transition-colors'}`}>
                        {item.label}
                      </span>
                      <span className={`text-[10px] font-medium ${isActive ? 'text-blue-200' : 'text-slate-600 group-hover:text-slate-500'}`}>
                        {item.sub}
                      </span>
                    </div>
                  </div>
                  {isActive && <ChevronRight size={14} className="opacity-80 relative z-10" />}
                </button>
              );
            })}
          </div>

          {/* New: System Branding / Introduction Section */}
          <div className="px-2">
             <div className="rounded-2xl bg-gradient-to-br from-indigo-900/50 to-violet-900/50 border border-indigo-500/30 p-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3 opacity-20"><Sparkles size={48} className="text-white"/></div>
                <h4 className="text-white font-bold text-xs mb-1 relative z-10">Smart Safety AI</h4>
                <p className="text-[10px] text-indigo-200 leading-relaxed relative z-10 mb-3">
                   현장의 안전을 지키는 가장 지능적인 방법. Vision AI가 위험 요인을 사전에 감지합니다.
                </p>
                <div className="flex gap-1">
                   <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                   <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                   <span className="w-1.5 h-1.5 rounded-full bg-violet-400"></span>
                </div>
             </div>
          </div>
        </div>
        
        {/* 3. Premium User Profile Footer */}
        <div className="p-4 relative z-10">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-4 border border-slate-700 shadow-xl group hover:border-slate-600 transition-all">
             <div className="flex items-center justify-between mb-3 border-b border-slate-700/50 pb-3">
                <div className="flex items-center gap-1.5">
                   <Shield size={12} className="text-emerald-500" />
                   <span className="text-[10px] font-bold text-emerald-500 tracking-wider uppercase">Safety Master</span>
                </div>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
             </div>
             
             <div className="flex items-center gap-3">
                <div className="relative">
                   <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center border-2 border-slate-600 overflow-hidden">
                      {/* Avatar Placeholder */}
                      <span className="font-bold text-white">박</span>
                   </div>
                   <div className="absolute -bottom-1 -right-1 bg-blue-600 text-white text-[8px] font-bold px-1 py-0.5 rounded border border-slate-800 shadow-sm">
                      SAM
                   </div>
                </div>
                <div>
                   <p className="text-[10px] text-blue-400 font-bold tracking-wide">Safety Assistant Manager</p>
                   <div className="flex items-baseline gap-1">
                     <p className="text-sm font-black text-white tracking-tight">박성훈 부장</p>
                     <span className="text-[9px] text-slate-400 font-medium whitespace-nowrap">WITH 이다애 기사</span>
                   </div>
                </div>
             </div>
             
             {/* Updated Footer Actions */}
             <div className="mt-3 pt-2 grid grid-cols-2 gap-2 text-[10px] text-slate-500 font-mono border-t border-slate-700/50">
                <button 
                  onClick={onShowHistory}
                  className="flex items-center justify-center gap-1.5 bg-slate-700/50 hover:bg-blue-600/20 hover:text-blue-400 text-slate-400 py-1.5 rounded transition-all border border-transparent hover:border-blue-500/30"
                >
                   <History size={10} />
                   <span>개발 히스토리</span>
                </button>
                <div className="flex items-center justify-between px-1">
                   <span className="text-[9px] text-slate-600">v2.5.2</span>
                   <button 
                     onClick={onOpenSettings}
                     className="hover:text-white hover:bg-slate-700 p-1 rounded-full transition-all"
                     title="설정 및 백업"
                   >
                     <Settings size={12} />
                   </button>
                </div>
             </div>
          </div>
          <div className="text-center mt-3">
             <p className="text-[9px] text-slate-600 font-medium">© 2025 (주)휘강건설 System</p>
          </div>
        </div>
      </div>
    </>
  );
};
