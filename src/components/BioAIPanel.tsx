import React, { useState, useRef, useEffect } from 'react';
import { Send, Languages, Trash2, MessageSquare, AlertCircle } from 'lucide-react';
import { AnatomyPartMetadata, BioAIMessage, SpeciesRecord } from '../types/anatomy';

interface BioAIPanelProps {
  species: SpeciesRecord;
  selectedPart: AnatomyPartMetadata | null;
  activeSystems: string[];
}

export const BioAIPanel: React.FC<BioAIPanelProps> = ({
  species,
  selectedPart,
  activeSystems,
}) => {
  const [language, setLanguage] = useState<'en' | 'si' | 'singlish'>('en');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<BioAIMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const defaultSuggestions =
    language === 'si'
      ? selectedPart
        ? [
            `${selectedPart.name} ක්‍රියා කරන්නේ කෙසේද?`,
            `මිනිසාගේ සහ ${species.commonName}ගේ මෙම අවයවය වෙනස් වන්නේ කෙසේද?`,
            `මෙම ව්‍යුහය ජීව විද්‍යාත්මකව වැදගත් වන්නේ ඇයි?`,
          ]
        : [
            `${species.commonName} (${species.scientificName}) හි විශේෂ ව්‍යුහ විද්‍යාත්මක ලක්ෂණ මොනවාද?`,
            `මිනිසාගේ සහ ${species.commonName}ගේ හෘදය හා ශ්වසන පද්ධතිය සංසන්දනය කරන්න.`,
            `මෙම සත්වයාගේ පරිණාමීය අනුවර්තන සරලව පැහැදිලි කරන්න.`,
          ]
      : language === 'singlish'
        ? selectedPart
          ? [
              `${selectedPart.name} weda karanne kohomada kiyala saralawa kiyanna.`,
              `Minissunge saha ${species.commonName} ge me kottasa athara wenasa mokakda?`,
              `${selectedPart.name} wala pradhana karthavyaya saha wadagathkama mokakda?`,
            ]
          : [
              `${species.commonName} (${species.scientificName}) ge anatomy eka gana full details kiyanna.`,
              `Minissunge saha ${species.commonName} ge hadawatha haa shwasana paddathiya wenas wenne kohomada?`,
              `Me sathage vishesha anuwathana (adaptations) monawada?`,
            ]
        : selectedPart
          ? [
              `What does the ${selectedPart.name} do and how does it work?`,
              `How does this structure compare between ${species.commonName} and humans?`,
              `Explain the ${selectedPart.name} simply for a student.`,
            ]
          : [
              `What makes ${species.commonName} anatomy unique?`,
              `How do ${species.commonName} respiratory and circulatory systems work?`,
              `Compare ${species.commonName} and human skeletal adaptations.`,
            ];

  const latestSuggestions =
    messages.length > 0 && messages[messages.length - 1].suggestedQuestions?.length
      ? messages[messages.length - 1].suggestedQuestions!
      : defaultSuggestions;

  const sendMessage = async (textToSend?: string) => {
    const query = (textToSend ?? input).trim();
    if (!query || loading) return;

    const userMsg: BioAIMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: query,
      language,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    if (!textToSend) setInput('');
    setLoading(true);
    setError(null);

    try {
      const resp = await fetch('/api/bioai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          language,
          species: {
            id: species.id,
            commonName: species.commonName,
            scientificName: species.scientificName,
            className: species.className,
            group: species.group,
            availability: species.availability,
            modelSource: species.modelSource,
            anatomyNotes: species.anatomyNotes,
          },
          selectedPart: selectedPart || undefined,
          activeSystems,
          history: nextHistory.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to reach BioAI.');
      }

      const aiMsg: BioAIMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: data.reply,
        language: data.language || language,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedQuestions: data.suggestedQuestions || [],
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach BioAI.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header & Language Switch */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            BioAI Biology Tutor
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {species.commonName}
            {selectedPart ? ` · ${selectedPart.name}` : ' · Full Specimen'}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center bg-sky-50 dark:bg-slate-800 rounded-lg p-0.5 border border-sky-100 dark:border-slate-700">
            {(
              [
                ['en', 'EN'],
                ['si', 'සිංහල'],
                ['singlish', 'Singlish'],
              ] as const
            ).map(([code, label]) => (
              <button
                key={code}
                type="button"
                onClick={() => setLanguage(code)}
                className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                  language === code
                    ? 'bg-gradient-to-r from-sky-600 to-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              title="Clear Chat History"
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Chat Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="py-4 space-y-3">
            <div className="p-3.5 rounded-xl bg-sky-50/70 dark:bg-slate-800/70 border border-sky-200/80 dark:border-slate-700/70 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
                <Languages className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <span>
                  {language === 'si'
                    ? 'සිංහල, Singlish හෝ English වලින් අසන්න'
                    : language === 'singlish'
                      ? 'Singlish, Sinhala ho English walin ahanna'
                      : 'Ask in English, සිංහල, or Singlish'}
                </span>
              </div>
              <p>
                {language === 'si'
                  ? `මම දැනට පෙන්වන ${species.commonName} (${species.scientificName}) ආකෘතිය සහ ඔබ තෝරාගත් අවයවය පිළිබඳව පැහැදිලි කිරීමට සූදානම්.`
                  : language === 'singlish'
                    ? `Mama dan pennana ${species.commonName} (${species.scientificName}) gana saha oya select karapu kotasa gana Singlish walin saralawa kiyala denna puluwan.`
                    : `I am synchronized with the active ${species.commonName} (${species.scientificName}) record${
                        selectedPart ? ` and your selected ${selectedPart.name}` : ''
                      }. Type in English, Sinhala, or Singlish!`}
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[92%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-r from-sky-600 to-emerald-600 text-white'
                    : 'bg-sky-50/60 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-sky-100 dark:border-slate-700'
                }`}
              >
                {msg.content}
              </div>
              <span className="mt-1 text-[10px] font-mono-tabular text-slate-400 dark:text-slate-500">
                {msg.role === 'user' ? 'You' : 'BioAI'} · {msg.timestamp}
              </span>
            </div>
          ))
        )}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 py-2">
            <MessageSquare className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span>
              {language === 'si'
                ? 'BioAI පිළිතුර සකසමින් පවතී...'
                : language === 'singlish'
                  ? 'BioAI wisthara hadamin pawathi...'
                  : 'BioAI is analyzing anatomical context...'}
            </span>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Suggested Questions */}
      <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
          {language === 'si'
            ? 'යෝජිත ප්‍රශ්න'
            : language === 'singlish'
              ? 'Yojana karana prashna'
              : 'Suggested questions'}
        </p>
        <div className="flex flex-col gap-1.5">
          {latestSuggestions.slice(0, 3).map((q, i) => (
            <button
              key={i}
              type="button"
              disabled={loading}
              onClick={() => sendMessage(q)}
              className="text-left px-2.5 py-1.5 rounded-lg text-xs bg-sky-50/60 dark:bg-slate-800/80 hover:bg-sky-100 dark:hover:bg-sky-950/50 text-slate-700 dark:text-slate-200 border border-sky-100 dark:border-slate-700/80 transition-colors line-clamp-2"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Prompt Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage();
        }}
        className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            language === 'si'
              ? 'සිංහල, Singlish හෝ English වලින් අසන්න...'
              : language === 'singlish'
                ? 'Singlish walin ahanna (e.g. hadawatha gana kiyanna)...'
                : 'Ask in English, සිංහල, or Singlish...'
          }
          className="flex-1 min-w-0 px-3 py-2 rounded-lg text-xs bg-sky-50/50 dark:bg-slate-800 border border-sky-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="p-2 rounded-lg bg-gradient-to-r from-sky-600 to-emerald-600 hover:from-sky-700 hover:to-emerald-700 disabled:opacity-40 text-white transition-all shrink-0"
          aria-label="Send message to BioAI"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
