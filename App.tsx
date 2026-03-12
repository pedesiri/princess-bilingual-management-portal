
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  Wallet, 
  Package, 
  CheckSquare, 
  Users, 
  Bus, 
  FileText, 
  LogOut,
  TrendingUp,
  Activity,
  X,
  Sparkles,
  Menu,
  Send,
  Zap,
  Trash2,
  Filter,
  Lock,
  User,
  ChevronRight,
  Eye,
  EyeOff,
  AlertTriangle,
  RotateCcw,
  ArrowDownCircle,
  ArrowUpCircle,
  Loader2
} from 'lucide-react';
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { AppTab, Expense, Income, InventoryItem, Task, StaffRecord, BusSchedule } from './types';
import { MOCK_EXPENSES, MOCK_INVENTORY, MOCK_TASKS, MOCK_STAFF, MOCK_BUS } from './constants';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// --- TYPES ---
interface AIActivity {
  id: string;
  tab: AppTab;
  action: string;
  timestamp: string;
}

// --- SECURE PERSISTENCE ENGINE ---
const STORAGE_PREFIX = 'pb_v3_';
const storage = {
  get: <T,>(key: string, defaultValue: T): T => {
    try {
      const saved = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
      if (saved === null) return defaultValue;
      const parsed = JSON.parse(saved);
      // Extra safety for data structures
      if (Array.isArray(defaultValue) && !Array.isArray(parsed)) return defaultValue;
      return parsed ?? defaultValue;
    } catch (e) {
      console.error(`Storage error for ${key}:`, e);
      return defaultValue;
    }
  },
  set: <T,>(key: string, value: T): void => {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
    } catch (e) {
      console.error(`Save error for ${key}:`, e);
    }
  },
  clear: () => {
    // We clear all but keep 'initialized' as true so we don't reload mock data
    const keys = ['expenses', 'income', 'inventory', 'tasks', 'staff', 'busSchedules', 'aiActivity'];
    keys.forEach(k => storage.set(k, []));
    storage.set('initialized', true);
  }
};

// --- COMPONENTS ---

const SidebarItem: React.FC<{ icon: any, label: string, active: boolean, onClick: () => void }> = ({ icon: Icon, label, active, onClick }) => (
  <button 
    onClick={onClick} 
    className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-300 group ${active ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-200' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'}`}
  >
    <Icon size={18} className={`${active ? 'text-white' : 'text-slate-400 group-hover:text-indigo-500'}`} />
    <span className={`text-[10px] font-black uppercase tracking-widest ${active ? 'text-white' : ''}`}>{label}</span>
  </button>
);

const StatCard: React.FC<{ icon: any, label: string, value: string, color: string }> = ({ icon: Icon, label, value, color }) => (
  <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center space-x-4">
    <div className={`p-4 ${color} text-white rounded-2xl shadow-lg flex-shrink-0`}>
      <Icon size={20} />
    </div>
    <div className="min-w-0">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
      <h3 className="text-lg md:text-xl font-black text-slate-800 tracking-tight truncate">{value}</h3>
    </div>
  </div>
);

// --- AI ASSISTANT CONFIG ---
const aiTools: FunctionDeclaration[] = [
  {
    name: 'addExpense',
    parameters: {
      type: Type.OBJECT,
      description: 'Record a new school expense.',
      properties: {
        amount: { type: Type.NUMBER, description: 'Cost in Naira.' },
        category: { type: Type.STRING, description: 'E.g. Operational, Maintenance.' },
        description: { type: Type.STRING, description: 'Detailed note.' }
      },
      required: ['amount', 'category', 'description']
    }
  }
];

const App: React.FC = () => {
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => storage.get('auth', false));
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // App Navigation
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.DASHBOARD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Data Persistence initialization
  const isInitialized = storage.get('initialized', false);
  const [expenses, setExpenses] = useState<Expense[]>(() => storage.get('expenses', isInitialized ? [] : MOCK_EXPENSES));
  const [income, setIncome] = useState<Income[]>(() => storage.get('income', []));
  const [inventory, setInventory] = useState<InventoryItem[]>(() => storage.get('inventory', isInitialized ? [] : MOCK_INVENTORY));
  const [tasks, setTasks] = useState<Task[]>(() => storage.get('tasks', isInitialized ? [] : MOCK_TASKS));
  const [staff, setStaff] = useState<StaffRecord[]>(() => storage.get('staff', isInitialized ? [] : MOCK_STAFF));
  const [busSchedules, setBusSchedules] = useState<BusSchedule[]>(() => storage.get('busSchedules', isInitialized ? [] : MOCK_BUS));
  const [aiActivityLog, setAiActivityLog] = useState<AIActivity[]>(() => storage.get('aiActivity', []));

  // Persistence Sync
  useEffect(() => {
    storage.set('auth', isAuthenticated);
    if (isAuthenticated) {
      storage.set('expenses', expenses);
      storage.set('income', income);
      storage.set('inventory', inventory);
      storage.set('tasks', tasks);
      storage.set('staff', staff);
      storage.set('busSchedules', busSchedules);
      storage.set('aiActivity', aiActivityLog);
    }
  }, [isAuthenticated, expenses, income, inventory, tasks, staff, busSchedules, aiActivityLog]);

  // Modals
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);

  // AI Assistant Interaction
  const [aiMessages, setAiMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([
    { role: 'assistant', content: 'Madam Gloria, Princess Bilingual intelligence is online. How can I assist you with your administrative records today?' }
  ]);
  const [aiInput, setAiInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages]);

  // --- LOGIC HANDLERS ---

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    
    // Using a tiny timeout for a smooth transition feel
    setTimeout(() => {
      if (loginForm.username === 'admin' && loginForm.password === 'princess2026') {
        setIsAuthenticated(true);
        setLoginError(false);
        storage.set('auth', true);
      } else {
        setLoginError(true);
        setTimeout(() => setLoginError(false), 500); // Reset shake state
      }
      setIsLoggingIn(false);
    }, 400);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    storage.set('auth', false);
  };

  const handleReset = () => {
    storage.clear();
    setExpenses([]);
    setIncome([]);
    setInventory([]);
    setTasks([]);
    setStaff([]);
    setBusSchedules([]);
    setAiActivityLog([]);
    setIsResetModalOpen(false);
    setActiveTab(AppTab.DASHBOARD);
    setAiMessages([{ role: 'assistant', content: 'System has been successfully reset. You can now begin entering your own transactions.' }]);
  };

  // Financial Stats
  const totalExpenses = useMemo(() => (expenses || []).reduce((acc, curr) => acc + (curr.amount || 0), 0), [expenses]);
  const totalIncome = useMemo(() => (income || []).reduce((acc, curr) => acc + (curr.amount || 0), 0), [income]);
  const netProfit = totalIncome - totalExpenses;

  // FIX: Added 'allTransactions' to combine income and expenses for the UI
  const allTransactions = useMemo(() => {
    const e = (expenses || []).map(exp => ({ ...exp, type: 'Expense' as const }));
    const i = (income || []).map(inc => ({ 
      id: inc.id, 
      date: inc.date, 
      category: inc.source, 
      description: `Revenue: ${inc.source}`, 
      amount: inc.amount, 
      type: 'Income' as const 
    }));
    return [...e, ...i].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, income]);

  const handleAiChat = async () => {
    if (!aiInput.trim()) return;
    const userMsg = aiInput;
    setAiMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setAiInput('');
    setIsAiTyping(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: userMsg,
        config: {
          systemInstruction: `You are the Princess Bilingual School AI Assistant. Help Madam Gloria manage school data. Currency: Naira (₦). Support expense recording.`,
          tools: [{ functionDeclarations: aiTools }]
        }
      });

      const textResponse = response.text || "Transaction updated.";
      const calls = response.functionCalls;

      if (calls) {
        for (const fc of calls) {
          if (fc.name === 'addExpense') {
            const args = fc.args as any;
            setExpenses(prev => [...prev, {
              id: `ai-${Date.now()}-${Math.random()}`,
              amount: args.amount,
              category: args.category || 'Operational',
              description: args.description || 'AI Entry',
              date: new Date().toISOString().split('T')[0],
              term: 'First Term',
              week: 1
            }]);
          }
        }
      }
      setAiMessages(prev => [...prev, { role: 'assistant', content: textResponse }]);
    } catch (e) {
      setAiMessages(prev => [...prev, { role: 'assistant', content: 'I encountered a connection error. Please try again.' }]);
    } finally {
      setIsAiTyping(false);
    }
  };

  // --- RENDER LOGIN ---
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-0 -left-20 w-96 h-96 bg-indigo-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 -right-20 w-96 h-96 bg-rose-600/10 rounded-full blur-[120px]" />

        <div className={`w-full max-w-md bg-white/5 border border-white/10 rounded-[3rem] p-10 shadow-2xl backdrop-blur-xl transition-all duration-300 ${loginError ? 'animate-shake border-rose-500/30' : 'animate-fadeIn'}`}>
          <div className="text-center mb-10">
            <div className="inline-flex p-5 bg-indigo-600 rounded-[2rem] shadow-2xl mb-8">
              <Lock className="text-white" size={32} />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">Princess Bilingual</h1>
            <p className="text-[10px] text-indigo-300 font-black uppercase tracking-[0.3em] mt-3">Administrative Secure Portal</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-indigo-200 uppercase tracking-widest ml-5">Access Identity</label>
              <div className="relative group">
                <User className="absolute left-6 top-1/2 -translate-y-1/2 text-indigo-400 group-focus-within:text-indigo-300 transition-colors" size={18} />
                <input 
                  type="text" 
                  value={loginForm.username}
                  onChange={e => setLoginForm({...loginForm, username: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-5 pl-14 pr-6 text-white font-bold outline-none focus:ring-4 focus:ring-indigo-500/20 transition-all placeholder:text-slate-600"
                  placeholder="admin"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-indigo-200 uppercase tracking-widest ml-5">Security Key</label>
              <div className="relative group">
                <Lock className="absolute left-6 top-1/2 -translate-y-1/2 text-indigo-400 group-focus-within:text-indigo-300 transition-colors" size={18} />
                <input 
                  type={showPassword ? "text" : "password"} 
                  value={loginForm.password}
                  onChange={e => setLoginForm({...loginForm, password: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-5 pl-14 pr-16 text-white font-bold outline-none focus:ring-4 focus:ring-indigo-500/20 transition-all placeholder:text-slate-600"
                  placeholder="••••••••"
                  required
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-6 top-1/2 -translate-y-1/2 text-indigo-400 hover:text-white transition-colors">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button 
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-2xl active:scale-[0.98] transition-all flex items-center justify-center space-x-3 mt-4"
            >
              {isLoggingIn ? <Loader2 className="animate-spin" size={20} /> : (
                <>
                  <span>Unlock Hub</span>
                  <ChevronRight size={16} />
                </>
              )}
            </button>
          </form>
          
          <div className="mt-12 text-center">
             <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Authorized School Access Only</p>
          </div>
        </div>
      </div>
    );
  }

  // --- MAIN APP ---
  return (
    <div className="flex min-h-screen bg-slate-50 selection:bg-indigo-100 selection:text-indigo-900">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 md:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Sidebar Navigation */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-100 flex flex-col transition-transform duration-500 cubic-bezier(0.16, 1, 0.3, 1) ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="p-8 pb-10">
          <h1 className="text-xl font-black text-indigo-600 tracking-tight">Princess Bilingual</h1>
          <p className="text-[9px] text-slate-400 font-black tracking-widest uppercase mt-1.5">Administrative Panel</p>
        </div>
        
        <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto scrollbar-hide">
          <SidebarItem icon={LayoutDashboard} label="Dashboard" active={activeTab === AppTab.DASHBOARD} onClick={() => setActiveTab(AppTab.DASHBOARD)} />
          <SidebarItem icon={Wallet} label="Accounting" active={activeTab === AppTab.EXPENSES} onClick={() => setActiveTab(AppTab.EXPENSES)} />
          <SidebarItem icon={Package} label="Inventory" active={activeTab === AppTab.INVENTORY} onClick={() => setActiveTab(AppTab.INVENTORY)} />
          <SidebarItem icon={CheckSquare} label="Scheduler" active={activeTab === AppTab.TASKS} onClick={() => setActiveTab(AppTab.TASKS)} />
          <SidebarItem icon={Users} label="Personnel" active={activeTab === AppTab.STAFF} onClick={() => setActiveTab(AppTab.STAFF)} />
          <SidebarItem icon={Bus} label="Transport" active={activeTab === AppTab.TRANSPORT} onClick={() => setActiveTab(AppTab.TRANSPORT)} />
          <SidebarItem icon={FileText} label="Policy Manual" active={activeTab === AppTab.POLICIES} onClick={() => setActiveTab(AppTab.POLICIES)} />
        </nav>

        <div className="p-6 mt-auto border-t border-slate-50 space-y-2">
          <button onClick={() => setIsResetModalOpen(true)} className="flex items-center space-x-2 text-slate-400 hover:text-rose-600 w-full px-5 py-3 transition-all text-[10px] font-black uppercase rounded-xl hover:bg-rose-50 active:scale-95">
            <RotateCcw size={14} />
            <span>Reset Records</span>
          </button>
          <button onClick={handleLogout} className="flex items-center space-x-2 text-slate-400 hover:text-indigo-600 w-full px-5 py-3 transition-all text-[10px] font-black uppercase rounded-xl hover:bg-indigo-50 active:scale-95">
            <LogOut size={14} />
            <span>Secure Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 transition-all duration-300 w-full md:ml-64 bg-[#fcfdfe]">
        <header className="sticky top-0 z-30 bg-white/70 backdrop-blur-xl px-8 py-5 flex justify-between items-center border-b border-slate-100">
          <div className="flex items-center space-x-5">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 text-slate-600 bg-slate-50 rounded-xl"><Menu size={18} /></button>
            <h1 className="text-base font-black text-slate-800 capitalize tracking-tight">{activeTab} Hub</h1>
          </div>
          <button onClick={() => setIsAiOpen(true)} className="p-3.5 bg-indigo-600 text-white rounded-2xl shadow-xl shadow-indigo-200 flex items-center space-x-3 px-6 hover:bg-indigo-500 hover:-translate-y-0.5 transition-all">
            <Sparkles size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">AI Intelligence</span>
          </button>
        </header>

        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fadeIn">
          {activeTab === AppTab.DASHBOARD && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <StatCard icon={TrendingUp} label="Net Balance" value={`₦${netProfit.toLocaleString()}`} color={netProfit >= 0 ? "bg-emerald-500" : "bg-rose-500"} />
                <StatCard icon={CheckSquare} label="Pending Tasks" value={(tasks || []).filter(t => !t.completed).length.toString()} color="bg-amber-500" />
                <StatCard icon={Package} label="Low Stock Items" value={(inventory || []).filter(i => i.needed).length.toString()} color="bg-indigo-500" />
                <StatCard icon={Activity} label="Total Staff" value={(staff || []).length.toString()} color="bg-blue-500" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm min-h-[450px]">
                  <h3 className="font-black text-slate-800 mb-10 flex items-center justify-between">
                    <span>Performance Analytics</span>
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.25em]">Financial Flow</span>
                  </h3>
                  <div className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={expenses.length > 0 ? expenses.slice(-10) : [{category: 'N/A', amount: 0}]}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="category" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                        <Tooltip 
                          contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 20px 40px rgba(0,0,0,0.08)', fontWeight: 'bold'}}
                          cursor={{fill: '#f8fafc'}}
                        />
                        <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                          {expenses.map((_, index) => <Cell key={`c-${index}`} fill={index % 2 === 0 ? '#4f46e5' : '#818cf8'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm overflow-y-auto h-[450px] scrollbar-hide">
                  <h3 className="font-black text-slate-800 mb-8 flex items-center justify-between">
                    <span>Quick Tasks</span>
                    <button onClick={() => setActiveTab(AppTab.TASKS)} className="text-[9px] text-indigo-600 font-black uppercase hover:underline">Manage All</button>
                  </h3>
                  <div className="space-y-5">
                    {(!tasks || tasks.length === 0) ? (
                      <div className="py-20 text-center text-slate-300 text-[10px] font-black uppercase italic">No active schedules</div>
                    ) : (
                      tasks.filter(t => !t.completed).map(task => (
                        <div key={task.id} className="flex items-center p-5 bg-slate-50 hover:bg-white hover:shadow-xl hover:shadow-slate-100 rounded-3xl transition-all group border border-transparent hover:border-slate-50">
                          <div className="w-11 h-11 rounded-2xl bg-white text-indigo-600 flex items-center justify-center font-black text-xs shadow-sm group-hover:bg-indigo-600 group-hover:text-white transition-all">!</div>
                          <div className="ml-5 flex-1 min-w-0">
                            <p className="text-[13px] font-bold text-slate-700 truncate">{task.title}</p>
                            <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-1">{task.dueDate}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === AppTab.EXPENSES && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <StatCard icon={TrendingUp} label="Gross Income" value={`₦${totalIncome.toLocaleString()}`} color="bg-emerald-500" />
                <StatCard icon={Activity} label="Total Cost" value={`₦${totalExpenses.toLocaleString()}`} color="bg-rose-500" />
                <StatCard icon={ArrowDownCircle} label="Available" value={`₦${netProfit.toLocaleString()}`} color="bg-slate-800" />
              </div>

              <div className="flex flex-wrap items-center gap-5 bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm">
                <div className="flex items-center space-x-3 mr-5">
                  <Filter size={18} className="text-slate-400" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sorting Tools</span>
                </div>
                <div className="flex space-x-3">
                  <button onClick={() => setIsIncomeModalOpen(true)} className="px-7 py-3.5 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 shadow-xl shadow-emerald-100 active:scale-95 transition-all">Log Income</button>
                  <button onClick={() => setIsExpenseModalOpen(true)} className="px-7 py-3.5 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 shadow-xl shadow-indigo-100 active:scale-95 transition-all">Log Expense</button>
                </div>
              </div>

              <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto scrollbar-hide">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/50 text-slate-400 font-black uppercase tracking-[0.2em] border-b border-slate-100">
                      <tr>
                        <th className="px-10 py-6">Date</th>
                        <th className="px-10 py-6">Status</th>
                        <th className="px-10 py-6">Narrative</th>
                        <th className="px-10 py-6 text-right">Magnitude</th>
                        <th className="px-10 py-6 text-center">Delete</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allTransactions.length === 0 ? (
                        <tr><td colSpan={5} className="px-10 py-24 text-center text-slate-300 font-black uppercase italic tracking-widest">No existing transactions</td></tr>
                      ) : (
                        allTransactions.map(item => (
                          <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-10 py-6 font-medium text-slate-500">{item.date}</td>
                            <td className="px-10 py-6">
                              <span className={`px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest ${item.type === 'Income' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{item.category}</span>
                            </td>
                            <td className="px-10 py-6 font-bold text-slate-700">{item.description}</td>
                            <td className={`px-10 py-6 text-right font-black text-sm ${item.type === 'Income' ? 'text-emerald-600' : 'text-slate-900'}`}>{item.type === 'Income' ? '+' : '-'}₦{item.amount.toLocaleString()}</td>
                            <td className="px-10 py-6 text-center">
                              <button onClick={() => {
                                if (item.type === 'Expense') setExpenses(prev => prev.filter(e => e.id !== item.id));
                                else setIncome(prev => prev.filter(i => i.id !== item.id));
                              }} className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><Trash2 size={16} /></button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {![AppTab.DASHBOARD, AppTab.EXPENSES].includes(activeTab) && (
            <div className="bg-white rounded-[4rem] p-24 text-center space-y-6 border border-slate-100 shadow-sm animate-fadeIn">
              <div className="inline-flex p-10 bg-indigo-50 text-indigo-600 rounded-[2.5rem] mb-6 shadow-sm">
                <Activity size={64} />
              </div>
              <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight">{activeTab} Operational Hub</h2>
              <p className="text-slate-500 font-medium max-w-lg mx-auto leading-relaxed">This section is ready for your specific school records. You can manually enter details or use the AI panel to voice your commands for faster data management.</p>
              <div className="flex justify-center space-x-5 pt-10">
                <button className="px-12 py-5 bg-slate-900 text-white rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest shadow-2xl active:scale-95 transition-all">Add Entry</button>
                <button onClick={() => setIsAiOpen(true)} className="px-12 py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest shadow-2xl active:scale-95 transition-all flex items-center space-x-3">
                  <Sparkles size={16} />
                  <span>Ask Intelligence</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* AI INTELLIGENCE SIDEBAR */}
      <div className={`fixed inset-y-0 right-0 z-[60] w-full sm:w-[480px] bg-white shadow-2xl transition-transform duration-700 cubic-bezier(0.16, 1, 0.3, 1) ${isAiOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex flex-col h-full">
          <div className="p-10 bg-indigo-600 text-white flex justify-between items-center shadow-xl">
            <div className="flex items-center space-x-5">
              <div className="p-4 bg-white/10 rounded-3xl"><Sparkles size={28} /></div>
              <div>
                <h2 className="font-black uppercase tracking-[0.25em] text-sm">PB Intelligence</h2>
                <p className="text-[9px] font-black uppercase text-indigo-200 mt-1">Adaptive Admin Core</p>
              </div>
            </div>
            <button onClick={() => setIsAiOpen(false)} className="hover:rotate-90 transition-transform"><X size={28} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-10 space-y-8 bg-slate-50/50 scrollbar-hide">
            {aiMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-7 rounded-[2.5rem] text-[13px] font-bold leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white text-slate-700 rounded-tl-none border border-slate-100'}`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isAiTyping && (
              <div className="flex justify-start">
                <div className="bg-white p-5 rounded-3xl border border-slate-100 flex space-x-1.5 shadow-sm">
                  <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                  <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); handleAiChat(); }} className="p-10 border-t bg-white flex space-x-4 shadow-2xl">
            <input 
              value={aiInput} 
              onChange={e => setAiInput(e.target.value)} 
              className="flex-1 p-6 bg-slate-50 rounded-[2rem] border-none outline-none text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 transition-all" 
              placeholder="e.g. Log expense: Staff lunch ₦2500..." 
            />
            <button disabled={isAiTyping} className="p-6 bg-indigo-600 text-white rounded-full shadow-2xl hover:scale-105 active:scale-90 transition-all disabled:opacity-40">
              <Send size={22} />
            </button>
          </form>
        </div>
      </div>

      {/* FAB AI */}
      {!isAiOpen && (
        <button onClick={() => setIsAiOpen(true)} className="fixed bottom-12 right-12 z-40 p-7 bg-indigo-600 text-white rounded-full shadow-[0_25px_60px_rgba(79,70,229,0.35)] hover:scale-110 active:scale-90 transition-all animate-pulse group overflow-hidden">
          <Zap size={32} className="relative z-10" />
          <div className="absolute inset-0 bg-gradient-to-tr from-white/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      )}

      {/* RESET CONFIRMATION */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/90 backdrop-blur-2xl p-6 animate-fadeIn">
          <div className="bg-white rounded-[4rem] p-12 w-full max-w-md animate-modalIn text-center space-y-8 border border-white/20 shadow-2xl">
            <div className="w-28 h-28 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse"><AlertTriangle size={56} /></div>
            <div>
              <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Wipe Records?</h2>
              <p className="text-slate-500 text-[14px] font-medium mt-4 leading-relaxed">Madam Gloria, this will permanently erase all financial transactions, staff profiles, and tasks. This operation cannot be reversed.</p>
            </div>
            <div className="flex flex-col space-y-4 pt-4">
              <button onClick={handleReset} className="w-full py-6 bg-rose-600 text-white rounded-3xl font-black uppercase text-xs tracking-widest shadow-2xl shadow-rose-600/30 active:scale-95 transition-all">Yes, Delete Everything</button>
              <button onClick={() => setIsResetModalOpen(false)} className="w-full py-6 bg-slate-100 text-slate-400 rounded-3xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all">Keep Data</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MANUAL EXPENSE */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md animate-modalIn overflow-hidden border border-slate-100">
            <div className="p-8 bg-indigo-600 text-white flex justify-between items-center shadow-lg">
              <h2 className="text-xl font-black uppercase tracking-tight">Record Expense</h2>
              <button onClick={() => setIsExpenseModalOpen(false)} className="hover:rotate-90 transition-transform"><X size={24} /></button>
            </div>
            <form onSubmit={(e) => { 
              e.preventDefault(); 
              const form = e.target as HTMLFormElement;
              const data = new FormData(form);
              setExpenses(prev => [...prev, {
                id: Date.now().toString(),
                amount: parseFloat(data.get('amount') as string),
                description: data.get('desc') as string,
                category: data.get('cat') as string,
                date: new Date().toISOString().split('T')[0]
              }]); 
              setIsExpenseModalOpen(false);
            }} className="p-10 space-y-7">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Amount (₦)</label>
                <input name="amount" type="number" step="0.01" className="w-full p-6 bg-slate-50 rounded-3xl text-3xl font-black text-indigo-600 outline-none focus:ring-4 focus:ring-indigo-500/10 border-none" placeholder="0.00" required />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Category</label>
                <select name="cat" className="w-full p-5 bg-slate-50 rounded-[1.5rem] font-black text-[10px] uppercase outline-none focus:ring-4 focus:ring-indigo-500/10 border-none">
                  <option value="Operational">Operational</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Salaries">Salaries</option>
                  <option value="Supplies">Supplies</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Description</label>
                <input name="desc" type="text" className="w-full p-5 bg-slate-50 rounded-[1.5rem] font-bold text-xs outline-none focus:ring-4 focus:ring-indigo-500/10 border-none" placeholder="e.g. Generator repair..." required />
              </div>
              <button className="w-full py-6 bg-indigo-600 text-white rounded-3xl font-black uppercase text-xs tracking-widest active:scale-95 shadow-2xl shadow-indigo-100 mt-4 transition-all">Submit Entry</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MANUAL INCOME */}
      {isIncomeModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md animate-modalIn overflow-hidden border border-slate-100">
            <div className="p-8 bg-emerald-600 text-white flex justify-between items-center shadow-lg">
              <h2 className="text-xl font-black uppercase tracking-tight">Record Income</h2>
              <button onClick={() => setIsIncomeModalOpen(false)} className="hover:rotate-90 transition-transform"><X size={24} /></button>
            </div>
            <form onSubmit={(e) => { 
              e.preventDefault(); 
              const form = e.target as HTMLFormElement;
              const data = new FormData(form);
              setIncome(prev => [...prev, {
                id: Date.now().toString(),
                amount: parseFloat(data.get('amount') as string),
                source: data.get('source') as string,
                date: new Date().toISOString().split('T')[0]
              }]); 
              setIsIncomeModalOpen(false); 
            }} className="p-10 space-y-7">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Amount (₦)</label>
                <input name="amount" type="number" step="0.01" className="w-full p-6 bg-slate-50 rounded-3xl text-3xl font-black text-emerald-600 outline-none focus:ring-4 focus:ring-emerald-500/10 border-none" placeholder="0.00" required />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Source Stream</label>
                <select name="source" className="w-full p-5 bg-slate-50 rounded-[1.5rem] font-black text-[10px] uppercase outline-none focus:ring-4 focus:ring-emerald-500/10 border-none">
                  <option value="School Fees">School Fees</option>
                  <option value="Uniforms">Uniforms</option>
                  <option value="Transport">Transport</option>
                  <option value="Admission">Admission</option>
                </select>
              </div>
              <button className="w-full py-6 bg-emerald-600 text-white rounded-3xl font-black uppercase text-xs tracking-widest active:scale-95 shadow-2xl shadow-emerald-100 mt-4 transition-all">Submit Entry</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
