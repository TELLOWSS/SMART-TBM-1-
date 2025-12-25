
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { TBMEntry } from '../types';
import { Calendar, Users, AlertCircle, FileText, Camera, BarChart2, CheckCircle2, TrendingUp, ChevronRight, Edit2, ShieldAlert, BookOpen, Quote, Database, Trash2, X, ScanLine, Server, Lock, Sparkles, BrainCircuit, MessageSquare, ArrowRight, ShieldCheck, Activity, Zap, Clock, MoreHorizontal, Plus, Eye, Mic, HandMetal, UserCheck, PlayCircle, Globe, Languages, Target, Radar } from 'lucide-react';

interface DashboardProps {
  entries: TBMEntry[];
  onViewReport: () => void;
  onNavigateToReports: () => void;
  onNewEntry: () => void;
  onEdit: (entry: TBMEntry) => void;
  onOpenSettings: () => void;
  onDelete: (id: string) => void; 
}

// --- Feature Showcase Component (Modal) ---
interface FeatureShowcaseProps {
   featureKey: 'risk' | 'proof' | 'feedback' | 'audit' | 'insight';
   onClose: () => void;
}

const FeatureShowcase: React.FC<FeatureShowcaseProps> = ({ featureKey, onClose }) => {
   const content = {
      risk: {
         title: "위험성평가 데이터 연동",
         subtitle: "Risk Assessment Integration",
         color: "text-emerald-500",
         bgGradient: "from-emerald-500/20 to-teal-500/5",
         description: "종이로 된 월간 위험성평가표를 AI가 분석하여 시스템 데이터로 변환합니다. 더 이상 수기로 옮겨 적을 필요가 없습니다.",
         steps: [
            { icon: <FileText size={24}/>, text: "월간 평가표 업로드 (PDF/IMG)" },
            { icon: <ScanLine size={24} className="animate-pulse"/>, text: "AI 광학 인식 및 공종 분류" },
            { icon: <Database size={24}/>, text: "TBM 작성 시 자동 매칭" }
         ]
      },
      proof: {
         title: "활동 증빙 자동화",
         subtitle: "Automated Activity Proof",
         color: "text-blue-500",
         bgGradient: "from-blue-500/20 to-indigo-500/5",
         description: "단순한 사진 저장이 아닙니다. 위변조가 불가능한 타임스탬프와 메타데이터를 포함하여 법적 효력을 갖춘 증빙 자료를 생성합니다.",
         steps: [
            { icon: <Camera size={24}/>, text: "현장 TBM 사진/영상 촬영" },
            { icon: <Lock size={24} className="animate-pulse"/>, text: "위조 방지 암호화 및 태깅" },
            { icon: <Server size={24}/>, text: "영구 보존 서버 저장" }
         ]
      },
      feedback: {
         title: "AI 기반 안전 피드백",
         subtitle: "AI Safety Coaching",
         color: "text-orange-500",
         bgGradient: "from-orange-500/20 to-amber-500/5",
         description: "작업 내용을 AI가 실시간으로 분석하여, 누락된 안전 수칙과 위험 요인을 관리자에게 즉시 코칭합니다.",
         steps: [
            { icon: <MessageSquare size={24}/>, text: "작업 내용 및 계획 입력" },
            { icon: <BrainCircuit size={24} className="animate-pulse"/>, text: "AI 안전 모델 실시간 분석" },
            { icon: <ShieldCheck size={24}/>, text: "맞춤형 누락 사항 코칭" }
         ]
      },
      audit: {
         title: "AI 스마트 TBM 품질 진단",
         subtitle: "Smart TBM Audit",
         color: "text-violet-500",
         bgGradient: "from-violet-500/20 to-purple-500/5",
         description: "영상 인식 AI가 TBM 활동을 4대 지표(참여도, 명확성, 보호구, 상호작용)로 정량 평가하여 형식적인 활동을 방지합니다.",
         steps: [
            { icon: <PlayCircle size={24}/>, text: "TBM 동영상 업로드 및 분석" },
            { icon: <ScanLine size={24} className="animate-pulse"/>, text: "Vision AI 동작/음성 인식" },
            { icon: <Sparkles size={24}/>, text: "품질 점수 및 리포트 생성" }
         ]
      },
      insight: {
         title: "AI 심층 정밀 진단 (Deep Insight)",
         subtitle: "AI Deep Learning Insight",
         color: "text-indigo-500",
         bgGradient: "from-indigo-500/20 to-violet-500/5",
         description: "관리자가 놓친 '사각지대'와 근로자의 '숨겨진 집중도'를 찾아냅니다. TBM의 내용(Bias)과 태도(Attitude)를 심층 분석합니다.",
         steps: [
            { icon: <Target size={24}/>, text: "Blind Spot(누락된 위험) 탐지" },
            { icon: <Eye size={24} className="animate-pulse"/>, text: "구역별 집중도 Heatmap 분석" },
            { icon: <Radar size={24}/>, text: "초개인화된 개선 코칭 제공" }
         ]
      }
   }[featureKey];

   return createPortal(
      <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
         <div 
            className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl overflow-hidden animate-scale-in relative border border-white/20"
            onClick={(e) => e.stopPropagation()}
         >
            <div className={`absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br ${content.bgGradient} rounded-full blur-[100px] opacity-50 pointer-events-none -translate-y-1/2 translate-x-1/2`}></div>
            <button onClick={onClose} className="absolute top-6 right-6 text-slate-400 hover:text-slate-800 z-50 transition-colors p-2 hover:bg-slate-100 rounded-full">
               <X size={24} />
            </button>
            <div className="flex flex-col md:flex-row min-h-[450px]">
               <div className="md:w-5/12 bg-slate-50/80 p-10 flex flex-col justify-center items-center relative overflow-hidden border-r border-slate-100">
                  <div className="relative z-10 flex flex-col items-center gap-6 w-full">
                     {content.steps.map((step, idx) => (
                        <div key={idx} className="relative group flex items-center gap-4 w-full">
                           <div className={`w-14 h-14 bg-white rounded-2xl shadow-lg border border-slate-100 flex items-center justify-center ${content.color} z-10 relative`}>
                              {step.icon}
                           </div>
                           {idx < content.steps.length - 1 && (
                              <div className="absolute left-7 top-14 w-0.5 h-10 bg-slate-200 -ml-[1px]"></div>
                           )}
                           <span className="text-sm font-bold text-slate-600 opacity-80">{step.text}</span>
                        </div>
                     ))}
                  </div>
               </div>
               <div className="md:w-7/12 p-10 md:p-12 flex flex-col justify-center relative z-10">
                  <span className={`text-xs font-black uppercase tracking-widest mb-3 ${content.color} bg-slate-100 w-fit px-2 py-1 rounded`}>{content.subtitle}</span>
                  <h2 className="text-3xl font-black text-slate-900 mb-4 leading-tight">{content.title}</h2>
                  <p className="text-slate-500 text-base leading-relaxed font-medium mb-0 break-keep">{content.description}</p>
               </div>
            </div>
         </div>
      </div>,
      document.body
   );
};

export const Dashboard: React.FC<DashboardProps> = ({ entries, onViewReport, onNavigateToReports, onNewEntry, onEdit, onOpenSettings, onDelete }) => {
  const [activeFeature, setActiveFeature] = useState<'risk' | 'proof' | 'feedback' | 'audit' | 'insight' | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const todaysEntries = entries.filter(e => e.date === today);

  const weeklyStats = useMemo(() => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneWeekAgoStr = oneWeekAgo.toISOString().split('T')[0];
    const stats: Record<string, { name: string; count: number; totalAttendees: number; feedbacks: string[]; aiScores: number[] }> = {};

    entries.forEach(entry => {
      if (entry.date && entry.date >= oneWeekAgoStr) {
        const teamName = entry.teamName || '미지정 팀';
        if (!stats[teamName]) stats[teamName] = { name: teamName, count: 0, totalAttendees: 0, feedbacks: [], aiScores: [] };
        stats[teamName].count += 1;
        stats[teamName].totalAttendees += (entry.attendeesCount || 0);
        if (entry.safetyFeedback?.length) stats[teamName].feedbacks.push(...entry.safetyFeedback);
        if (entry.videoAnalysis?.score) stats[teamName].aiScores.push(entry.videoAnalysis.score);
      }
    });

    return Object.values(stats)
      .map(item => ({ 
         ...item, 
         avgAttendees: item.count > 0 ? Math.round(item.totalAttendees / item.count) : 0,
         avgScore: item.aiScores.length > 0 ? Math.round(item.aiScores.reduce((a,b)=>a+b,0) / item.aiScores.length) : null
      }))
      .sort((a, b) => b.count - a.count);
  }, [entries]);

  const maxCount = Math.max(...weeklyStats.map(s => s.count), 1);

  // --- Premium Stat Card ---
  // Safeguard: Ensure color is a string before calling replace
  const StatCard = ({ title, value, unit, icon, color, subtext, delay }: any) => {
    const safeColor = color || '';
    return (
        <div className={`relative overflow-hidden bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-300 group animate-slide-up ${delay}`}>
          <div className={`absolute top-0 right-0 p-3 opacity-[0.08] transform group-hover:scale-110 group-hover:rotate-12 transition-all duration-500 ${safeColor}`}>
             {React.cloneElement(icon, { size: 80 })}
          </div>
          <div className="relative z-10">
             <div className="flex items-center gap-2 mb-3">
                <div className={`p-2 rounded-lg ${safeColor} bg-opacity-10 text-opacity-100`}>
                   {React.cloneElement(icon, { size: 18 })}
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</span>
             </div>
             <div className="flex items-baseline gap-1">
                <h3 className="text-3xl font-black text-slate-800 tracking-tight">{value}</h3>
                <span className="text-sm font-bold text-slate-400">{unit}</span>
             </div>
             {subtext && <p className="text-[11px] font-medium text-slate-400 mt-2 flex items-center gap-1">{subtext}</p>}
          </div>
          <div className={`absolute bottom-0 left-0 h-1 w-0 group-hover:w-full transition-all duration-700 ${safeColor.replace('text', 'bg')}`}></div>
        </div>
    );
  };

  return (
    <div className="space-y-5 pb-10">
      {activeFeature && <FeatureShowcase featureKey={activeFeature} onClose={() => setActiveFeature(null)} />}

      {/* --- HERO SECTION: Bento Grid Top Row --- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-auto">
         
         {/* 1. Main Command Center (Dark Theme) - Spans 8 cols */}
         <div className="lg:col-span-8 bg-[#0F172A] rounded-[1.5rem] p-8 relative overflow-hidden shadow-2xl flex flex-col justify-between group border border-slate-800 min-h-[300px]">
            {/* Ambient Background Effects */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-emerald-500/10 rounded-full blur-[60px] translate-y-1/3 -translate-x-1/3 pointer-events-none"></div>
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 mix-blend-overlay"></div>
            
            <div className="relative z-10 flex justify-between items-start">
               <div>
                  <div className="flex items-center gap-3 mb-4">
                     <span className="bg-blue-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded tracking-wider shadow-[0_0_10px_rgba(37,99,235,0.5)] animate-pulse">LIVE SYSTEM</span>
                     <span className="text-slate-400 text-[10px] font-bold tracking-widest uppercase flex items-center gap-1">
                        <Activity size={10} className="text-emerald-500" /> Optimal Operation
                     </span>
                  </div>
                  <h2 className="text-3xl md:text-4xl font-black text-white mb-2 leading-tight tracking-tight">
                     Zero Accident <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">Goal.</span>
                  </h2>
                  <p className="text-slate-400 text-sm font-medium max-w-lg leading-relaxed">
                     실시간 위험성 평가와 AI 분석을 통해 현장의 잠재적 위험을 
                     <span className="text-slate-200 border-b border-slate-600 mx-1 pb-0.5">사전에 차단</span>합니다.
                  </p>
               </div>
               
               <button 
                  onClick={onOpenSettings} 
                  className="bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white px-3 py-2 rounded-lg border border-white/10 backdrop-blur-md transition-all flex items-center gap-2 text-xs font-bold shadow-lg"
               >
                   <Database size={14} className="text-blue-400"/> 데이터 백업/관리
               </button>
            </div>

            <div className="relative z-10 flex flex-wrap gap-3 mt-6">
               <button onClick={() => setActiveFeature('risk')} className="flex items-center gap-3 pl-3 pr-4 py-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:bg-emerald-900/20 hover:border-emerald-500/30 transition-all group backdrop-blur-sm">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                     <ShieldAlert size={16} />
                  </div>
                  <div className="text-left">
                     <p className="text-[10px] text-slate-400 font-bold uppercase">Risk Mgmt</p>
                     <p className="text-xs font-bold text-slate-200">위험성평가</p>
                  </div>
               </button>

               <button onClick={() => setActiveFeature('proof')} className="flex items-center gap-3 pl-3 pr-4 py-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:bg-blue-900/20 hover:border-blue-500/30 transition-all group backdrop-blur-sm">
                  <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                     <Camera size={16} />
                  </div>
                  <div className="text-left">
                     <p className="text-[10px] text-slate-400 font-bold uppercase">Evidence</p>
                     <p className="text-xs font-bold text-slate-200">증빙 자동화</p>
                  </div>
               </button>

               <button onClick={() => setActiveFeature('feedback')} className="flex items-center gap-3 pl-3 pr-4 py-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:bg-orange-900/20 hover:border-orange-500/30 transition-all group backdrop-blur-sm">
                  <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                     <BrainCircuit size={16} />
                  </div>
                  <div className="text-left">
                     <p className="text-[10px] text-slate-400 font-bold uppercase">AI Coach</p>
                     <p className="text-xs font-bold text-slate-200">안전 피드백</p>
                  </div>
               </button>

               <button onClick={() => setActiveFeature('audit')} className="flex items-center gap-3 pl-3 pr-4 py-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:bg-violet-900/20 hover:border-violet-500/30 transition-all group backdrop-blur-sm">
                  <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-500 group-hover:bg-violet-500 group-hover:text-white transition-colors">
                     <Sparkles size={16} />
                  </div>
                  <div className="text-left">
                     <p className="text-[10px] text-slate-400 font-bold uppercase">Smart Audit</p>
                     <p className="text-xs font-bold text-slate-200">AI 품질 진단</p>
                  </div>
               </button>

               {/* 5th Feature: Deep Insight (Replaced Global TBM) */}
               <button onClick={() => setActiveFeature('insight')} className="flex items-center gap-3 pl-3 pr-4 py-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:bg-indigo-900/20 hover:border-indigo-500/30 transition-all group backdrop-blur-sm">
                  <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                     <Target size={16} />
                  </div>
                  <div className="text-left">
                     <p className="text-[10px] text-slate-400 font-bold uppercase">AI Insight</p>
                     <p className="text-xs font-bold text-slate-200">심층 정밀 진단</p>
                  </div>
               </button>
            </div>
         </div>

         {/* 2. Legal Compliance Card - Spans 4 cols */}
         <div className="lg:col-span-4 bg-white rounded-[1.5rem] p-6 border border-slate-200 shadow-lg relative overflow-hidden flex flex-col group min-h-[300px]">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-3xl translate-x-10 -translate-y-10 pointer-events-none"></div>
            
            <div className="flex items-center justify-between mb-4">
               <div className="flex items-center gap-2">
                  <div className="bg-red-50 p-2 rounded-lg text-red-600 border border-red-100">
                     <ShieldCheck size={20} />
                  </div>
                  <span className="text-xs font-black text-slate-400 uppercase tracking-wide">Legal Compliance</span>
               </div>
               <ArrowRight size={16} className="text-slate-300 group-hover:text-red-500 group-hover:translate-x-1 transition-all" />
            </div>

            <div className="flex-1 flex flex-col justify-center">
               <h3 className="text-xl font-black text-slate-800 mb-2 leading-tight">중대재해처벌법<br/>대응 솔루션</h3>
               <p className="text-xs font-medium text-slate-500 leading-relaxed break-keep mb-4">
                  "재해 예방에 필요한 인력·예산 등 안전보건관리체계의 구축 및 이행 조치"
               </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-start gap-3">
               <div className="bg-white p-1.5 rounded-md shadow-sm text-slate-400">
                  <Quote size={12} />
               </div>
               <p className="text-[11px] font-bold text-slate-600 leading-relaxed pt-0.5">
                  디지털 증빙의 <span className="text-blue-600">영구 보존</span>으로 법적 의무 이행을 강력하게 입증합니다.
               </p>
            </div>
         </div>
      </div>

      {/* --- STATS SECTION: 4 Columns --- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
         <StatCard 
            title="Today's TBM" 
            value={todaysEntries.length} 
            unit="팀" 
            icon={<Calendar />} 
            color="text-blue-600" 
            subtext={<><TrendingUp size={12} className="text-blue-500"/> 금일 작업 예정</>}
            delay="delay-100"
         />
         <StatCard 
            title="Total Workers" 
            value={todaysEntries.reduce((acc, curr) => acc + (curr.attendeesCount || 0), 0)} 
            unit="명" 
            icon={<Users />} 
            color="text-emerald-500" 
            subtext={<><CheckCircle2 size={12} className="text-emerald-500"/> 안전교육 이수</>}
            delay="delay-200"
         />
         <StatCard 
            title="Risk Factors" 
            value={todaysEntries.reduce((acc, curr) => acc + (curr.riskFactors?.length || 0), 0)} 
            unit="건" 
            icon={<AlertCircle />} 
            color="text-orange-500" 
            subtext={<><ShieldAlert size={12} className="text-orange-500"/> 사전 예방 조치</>}
            delay="delay-300"
         />
         
         {/* Report Center Shortcut Card */}
         <div 
            onClick={onNavigateToReports}
            className="rounded-2xl p-6 cursor-pointer relative overflow-hidden group shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 animate-slide-up delay-400 border border-indigo-500/30"
            style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #3B82F6 100%)' }}
         >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl translate-x-10 -translate-y-10 group-hover:scale-150 transition-transform duration-700"></div>
            <div className="relative z-10 h-full flex flex-col justify-between">
               <div className="flex justify-between items-start">
                  <div className="bg-white/20 p-2 rounded-lg text-white backdrop-blur-sm">
                     <FileText size={20} />
                  </div>
                  <div className="bg-white/20 px-2 py-1 rounded-full text-[10px] font-bold text-white backdrop-blur-sm group-hover:bg-white group-hover:text-indigo-600 transition-colors">
                     바로가기
                  </div>
               </div>
               <div>
                  <h3 className="text-white font-black text-lg mb-1">보고서 센터</h3>
                  <p className="text-indigo-100 text-xs font-medium opacity-80">전체 기록 보관함 이동</p>
               </div>
            </div>
         </div>
      </div>

      {/* --- CONTENT SECTION: Chart & List --- */}
      <div className="grid lg:grid-cols-3 gap-5">
         
         {/* Left: Weekly Chart */}
         <div className="lg:col-span-2 bg-white rounded-[1.5rem] p-6 border border-slate-200 shadow-sm min-h-[400px] flex flex-col animate-slide-up delay-200">
            <div className="flex justify-between items-center mb-6">
               <div className="flex items-center gap-3">
                  <div className="bg-slate-100 p-2.5 rounded-xl text-slate-600">
                     <BarChart2 size={20} />
                  </div>
                  <div>
                     <h3 className="font-black text-lg text-slate-800">주간 활동 요약</h3>
                     <p className="text-xs font-bold text-slate-400 mt-0.5">최근 7일간 팀별 TBM 실시 현황</p>
                  </div>
               </div>
            </div>

            {/* AI Audit Algorithm Legend */}
            <div className="mb-6 bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-wrap gap-4 items-center justify-between">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wide">AI Audit Metrics:</span>
                <div className="flex gap-4">
                    <div className="flex items-center gap-1.5">
                        <Eye size={12} className="text-blue-500"/>
                        <span className="text-[10px] font-bold text-slate-600">Vision (보호구/참여도)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Mic size={12} className="text-green-500"/>
                        <span className="text-[10px] font-bold text-slate-600">Voice (발성 명확도)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <HandMetal size={12} className="text-violet-500"/>
                        <span className="text-[10px] font-bold text-slate-600">Action (상호작용)</span>
                    </div>
                </div>
            </div>

            {/* Custom Bar Chart Visual */}
            <div className="flex-1 flex items-end gap-3 px-2 pb-2 relative min-h-[200px]">
               {weeklyStats.length === 0 ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300">
                     <BarChart2 size={48} className="mb-2 opacity-20"/>
                     <span className="text-sm font-bold">데이터 수집 중...</span>
                  </div>
               ) : (
                  weeklyStats.map((stat, idx) => {
                     const heightPercent = Math.max(15, (stat.count / maxCount) * 100);
                     return (
                        <div key={idx} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                           <div className="mb-2 text-center opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0 absolute bottom-full z-10">
                              <span className="bg-slate-800 text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-xl whitespace-nowrap">
                                 {stat.count}회 / {stat.avgAttendees}명
                              </span>
                           </div>
                           <div 
                              className="w-full max-w-[40px] rounded-t-xl bg-gradient-to-t from-slate-100 to-blue-100 group-hover:from-blue-500 group-hover:to-cyan-400 transition-all duration-500 relative overflow-hidden"
                              style={{ height: `${heightPercent}%` }}
                           >
                              {/* Striped Pattern Overlay */}
                              <div className="absolute inset-0 opacity-30 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAIklEQVQIW2NkQAKrVq36zwjjgzhhYWGMYAEYB8RmROaABADeOQ8CXl/xfgAAAABJRU5ErkJggg==')]"></div>
                           </div>
                           <div className="mt-3 text-center">
                              <p className="text-[10px] font-bold text-slate-400 group-hover:text-blue-600 transition-colors truncate w-16">
                                 {stat.name.split(' ')[0]}
                              </p>
                           </div>
                        </div>
                     )
                  })
               )}
            </div>
            
            {/* Simple Legend/Table below chart */}
            <div className="mt-6 pt-4 border-t border-slate-100">
               <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">
                  <span>Top Performance Teams</span>
                  <span>Safety Status</span>
               </div>
               <div className="space-y-2">
                  {weeklyStats.slice(0, 3).map((stat, i) => (
                     <div key={i} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg transition-colors">
                        <div className="flex items-center gap-2">
                           <span className="w-5 h-5 rounded-md bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">{i+1}</span>
                           <span className="text-xs font-bold text-slate-700">{stat.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {stat.avgScore ? (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${stat.avgScore >= 80 ? 'text-violet-600 bg-violet-50' : 'text-orange-600 bg-orange-50'}`}>
                                    <Sparkles size={8} /> AI평균 {stat.avgScore}점
                                </span>
                            ) : null}
                            {stat.feedbacks.length > 0 ? (
                            <span className="text-[10px] text-orange-500 font-bold bg-orange-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <AlertCircle size={8} /> {stat.feedbacks.length} 이슈
                            </span>
                            ) : (
                            <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <CheckCircle2 size={8} /> 양호
                            </span>
                            )}
                        </div>
                     </div>
                  ))}
               </div>
            </div>
         </div>

         {/* Right: Recent Activity List */}
         <div className="bg-white rounded-[1.5rem] flex flex-col border border-slate-200 shadow-sm overflow-hidden h-[500px] lg:h-auto animate-slide-up delay-300">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
               <div>
                  <h3 className="font-black text-lg text-slate-800">실시간 등록 현황</h3>
                  <p className="text-xs font-bold text-slate-400 mt-0.5">Real-time Feed</p>
               </div>
               <button 
                  onClick={onNewEntry} 
                  className="bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-200 p-2 rounded-xl transition-all shadow-sm active:scale-95"
                  title="새 TBM 등록"
               >
                  <Plus size={18} />
               </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
               {entries.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-60">
                     <Camera size={48} strokeWidth={1.5} className="mb-3"/>
                     <span className="text-sm font-bold">등록된 활동이 없습니다.</span>
                  </div>
               ) : (
                  entries.slice(0, 10).map((entry, idx) => (
                     <div key={entry.id || idx} className="group relative bg-white p-4 rounded-xl border border-slate-100 hover:border-blue-300 hover:shadow-md transition-all duration-300">
                        {/* Timeline Connector */}
                        {idx !== entries.length - 1 && (
                           <div className="absolute left-[27px] top-[40px] bottom-[-20px] w-[2px] bg-slate-100 group-hover:bg-blue-50 transition-colors"></div>
                        )}
                        
                        <div className="flex items-start gap-4">
                           {/* Icon Box */}
                           <div className="relative z-10 w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100 group-hover:scale-110 transition-transform">
                              {entry.riskFactors?.length ? <AlertCircle size={16} className="text-orange-500" /> : <CheckCircle2 size={16} />}
                              {/* Dot Indicator */}
                              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                 <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                              </span>
                           </div>

                           <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-start mb-1">
                                 <h4 className="font-bold text-sm text-slate-800 truncate pr-2 group-hover:text-blue-600 transition-colors">
                                    {entry.teamName}
                                 </h4>
                                 <div className="flex items-center gap-1">
                                    {/* AI Score Badge in List */}
                                    {entry.videoAnalysis && (
                                        <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border ${
                                            entry.videoAnalysis.score >= 80 ? 'bg-violet-50 text-violet-700 border-violet-100' : 
                                            entry.videoAnalysis.score >= 50 ? 'bg-orange-50 text-orange-700 border-orange-100' : 'bg-red-50 text-red-700 border-red-100'
                                        }`}>
                                            {entry.videoAnalysis.score}점
                                        </span>
                                    )}
                                    <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                        {entry.time}
                                    </span>
                                 </div>
                              </div>
                              <p className="text-xs text-slate-500 line-clamp-1 mb-2 font-medium">
                                 {entry.workDescription || '작업 내용 없음'}
                              </p>
                              
                              <div className="flex items-center gap-2">
                                 <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-md">
                                    <Users size={10} /> {entry.attendeesCount}명
                                 </span>
                                 {(entry.riskFactors?.length || 0) > 0 && (
                                    <span className="text-[10px] font-bold text-orange-600 flex items-center gap-1 bg-orange-50 px-2 py-1 rounded-md">
                                       <AlertCircle size={10} /> 위험 {entry.riskFactors?.length}
                                    </span>
                                 )}
                              </div>
                           </div>
                           
                           {/* Quick Actions (Hover) */}
                           <div className="absolute right-2 bottom-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0 duration-200 bg-white/90 backdrop-blur pl-2">
                              <button onClick={(e) => { e.stopPropagation(); onEdit(entry); }} className="p-1.5 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-md transition-colors"><Edit2 size={14}/></button>
                              <button onClick={(e) => { e.stopPropagation(); onDelete(String(entry.id)); }} className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-md transition-colors"><Trash2 size={14}/></button>
                           </div>
                        </div>
                     </div>
                  ))
               )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50">
               <button onClick={onNavigateToReports} className="w-full py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:text-blue-600 hover:border-blue-300 transition-all shadow-sm flex items-center justify-center gap-2 group">
                  전체 기록 열람 <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform"/>
               </button>
            </div>
         </div>

      </div>
    </div>
  );
};
