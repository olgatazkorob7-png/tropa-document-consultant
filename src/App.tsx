import React, { useState, useRef, useEffect } from 'react';
import { 
  Mountain, 
  Send, 
  BookOpen, 
  Search, 
  ChevronRight, 
  ChevronLeft, 
  MessageSquare, 
  Sparkles, 
  X, 
  Menu, 
  HelpCircle,
  Truck,
  RotateCcw,
  ShieldCheck,
  Cpu
} from 'lucide-react';
import { KNOWLEDGE_BASE_SECTIONS } from './data/knowledgeBase';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Здравствуйте! Я консультант интернет-магазина «Тропа». Готов ответить на ваши вопросы по нашей базе знаний: о доставке, возвратах, гарантии, характеристиках товаров и совместимости снаряжения.\n\nИсточник: Тропа — о магазине'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (textToSend?: string) => {
    const question = textToSend || input;
    if (!question.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: question };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    if (!textToSend) setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка сервера');
      }

      setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
    } catch (err: any) {
      setMessages([
        ...newMessages,
        { role: 'assistant', content: `Ошибка: ${err.message || 'Не удалось получить ответ'}. Убедитесь, что GEMINI_API_KEY настроен.` }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const quickQuestions = [
    { label: 'Доставка', query: 'Какие способы и стоимость доставки?', icon: Truck },
    { label: 'Возврат', query: 'Как оформить возврат или обмен товара?', icon: RotateCcw },
    { label: 'Гарантия', query: 'Какие гарантийные сроки на палатки и рюкзаки?', icon: ShieldCheck },
    { label: 'Совместимость', query: 'Какая горелка подходит к баллонам EN417?', icon: Cpu },
  ];

  const filteredSections = KNOWLEDGE_BASE_SECTIONS.filter(sec => 
    sec.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sec.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-[#f4f7f4] text-stone-800 font-sans overflow-hidden">
      
      {/* Sidebar: Knowledge Base Document Viewer */}
      <aside 
        className={`${
          sidebarOpen ? 'w-80 md:w-96' : 'w-0'
        } transition-all duration-300 ease-in-out bg-white border-r border-stone-200 flex flex-col z-20 shadow-sm overflow-hidden`}
      >
        <div className="p-4 border-b border-stone-200 bg-stone-50 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <BookOpen className="w-5 h-5 text-emerald-700" />
            <h2 className="font-semibold text-stone-800 tracking-wide text-sm md:text-base">База знаний «Тропа»</h2>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 text-stone-500 hover:text-stone-800 hover:bg-stone-200 rounded-lg transition-colors md:hidden"
            title="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 border-b border-stone-200 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-stone-400" />
            <input 
              type="text"
              placeholder="Поиск по документу..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-stone-100 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredSections.length === 0 ? (
            <p className="text-sm text-stone-500 text-center py-6">Ничего не найдено</p>
          ) : (
            filteredSections.map((sec) => (
              <div 
                key={sec.id}
                onClick={() => setSelectedSection(sec.id)}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  selectedSection === sec.id 
                    ? 'bg-emerald-50 border-emerald-300 shadow-xs' 
                    : 'bg-white border-stone-100 hover:border-emerald-200 hover:bg-stone-50'
                }`}
              >
                <h3 className="font-medium text-xs md:text-sm text-emerald-900 mb-1 flex items-center justify-between">
                  <span>{sec.title}</span>
                  <ChevronRight className="w-4 h-4 text-emerald-600 opacity-60" />
                </h3>
                <p className="text-xs text-stone-500 line-clamp-2">{sec.content}</p>
              </div>
            ))
          )}
        </div>

        <div className="p-3 border-t border-stone-200 bg-stone-50 text-xs text-stone-500 text-center shrink-0">
          Документ: 33 страницы • 18 товаров • 15 кейсов
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col h-full bg-[#f9faf9] relative overflow-hidden">
        
        {/* Header */}
        <header className="h-16 bg-white border-b border-stone-200 px-4 md:px-6 flex items-center justify-between shadow-xs z-10 shrink-0">
          <div className="flex items-center space-x-3">
            {!sidebarOpen && (
              <button 
                onClick={() => setSidebarOpen(true)}
                className="p-2 text-stone-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors flex items-center space-x-1.5"
                title="Открыть базу знаний"
              >
                <Menu className="w-5 h-5" />
                <span className="text-xs font-medium hidden sm:inline">База знаний</span>
              </button>
            )}
            <div className="w-10 h-10 rounded-xl bg-emerald-700 flex items-center justify-center text-white shadow-sm">
              <Mountain className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-stone-800 text-base md:text-lg tracking-tight flex items-center space-x-2">
                <span>Тропа</span>
                <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-medium">Консультант</span>
              </h1>
              <p className="text-xs text-stone-500">Помощник по документам и снаряжению outdoor</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
              <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-600" />
              Строго по базе знаний
            </span>
          </div>
        </header>

        {/* Chat Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 max-w-4xl w-full mx-auto">
          {messages.map((msg, idx) => (
            <div 
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex items-start max-w-2xl space-x-3 ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  msg.role === 'user' 
                    ? 'bg-stone-800 text-white shadow-sm' 
                    : 'bg-emerald-700 text-white shadow-sm'
                }`}>
                  {msg.role === 'user' ? 'Вы' : <Mountain className="w-4 h-4" />}
                </div>
                
                <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-xs ${
                  msg.role === 'user'
                    ? 'bg-stone-800 text-white rounded-tr-none'
                    : 'bg-white text-stone-800 border border-stone-200 rounded-tl-none whitespace-pre-line'
                }`}>
                  {msg.content}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 rounded-full bg-emerald-700 text-white flex items-center justify-center shadow-sm">
                  <Mountain className="w-4 h-4" />
                </div>
                <div className="bg-white border border-stone-200 p-4 rounded-2xl rounded-tl-none shadow-xs flex items-center space-x-2 text-stone-500">
                  <div className="w-2 h-2 bg-emerald-600 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-2 h-2 bg-emerald-600 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-2 h-2 bg-emerald-600 rounded-full animate-bounce"></div>
                  <span className="text-xs ml-1">Ищу в базе знаний...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Questions & Input Bar */}
        <div className="p-4 bg-white border-t border-stone-200 shadow-sm shrink-0">
          <div className="max-w-4xl mx-auto space-y-3">
            
            {/* Quick Question Buttons */}
            <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
              <span className="text-xs font-medium text-stone-400 shrink-0">Быстрые вопросы:</span>
              {quickQuestions.map((qq, i) => {
                const IconComponent = qq.icon;
                return (
                  <button
                    key={i}
                    onClick={() => handleSend(qq.query)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full text-xs font-medium transition-all shrink-0 shadow-2xs"
                  >
                    <IconComponent className="w-3.5 h-3.5 text-emerald-700" />
                    <span>{qq.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Input Form */}
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center space-x-2"
            >
              <input 
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Задайте вопрос по доставке, возврату, товарам или гарантии..."
                className="flex-1 px-4 py-3 bg-stone-100 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white transition-all shadow-2xs"
              />
              <button 
                type="submit"
                disabled={!input.trim() || loading}
                className="px-5 py-3 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-xl font-medium transition-all flex items-center space-x-1.5 shadow-sm shrink-0 cursor-pointer"
              >
                <span>Спросить</span>
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* Section Modal / Detail Viewer if clicked */}
      {selectedSection && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 md:p-5 border-b border-stone-200 flex items-center justify-between bg-emerald-50">
              <div className="flex items-center space-x-2">
                <BookOpen className="w-5 h-5 text-emerald-700" />
                <h3 className="font-bold text-emerald-900 text-base">
                  {KNOWLEDGE_BASE_SECTIONS.find(s => s.id === selectedSection)?.title}
                </h3>
              </div>
              <button 
                onClick={() => setSelectedSection(null)}
                className="p-1.5 text-stone-500 hover:text-stone-800 hover:bg-emerald-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 text-stone-700 text-sm leading-relaxed whitespace-pre-line bg-stone-50/50">
              {KNOWLEDGE_BASE_SECTIONS.find(s => s.id === selectedSection)?.content}
            </div>

            <div className="p-4 border-t border-stone-200 bg-white flex justify-between items-center">
              <button
                onClick={() => {
                  const sec = KNOWLEDGE_BASE_SECTIONS.find(s => s.id === selectedSection);
                  if (sec) {
                    handleSend(`Расскажи подробнее про раздел "${sec.title}"`);
                    setSelectedSection(null);
                  }
                }}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium rounded-lg transition-colors flex items-center space-x-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Задать вопрос по этому разделу</span>
              </button>
              
              <button 
                onClick={() => setSelectedSection(null)}
                className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium rounded-lg transition-colors"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
