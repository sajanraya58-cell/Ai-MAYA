import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2, Volume2, VolumeX, Keyboard, Send, Trash2, Sparkles } from "lucide-react";
import { 
  getAssistantResponse, 
  getAssistantAudio, 
  resetAssistantSession, 
  AssistantPersona 
} from "./services/geminiService";
import { processCommand } from "./services/commandService";
import { LiveSessionManager } from "./services/liveService";
import Visualizer from "./components/Visualizer";
import PermissionModal from "./components/PermissionModal";
import { playPCM } from "./utils/audioUtils";
import { motion, AnimatePresence } from "motion/react";

type AppState = "idle" | "listening" | "processing" | "speaking";

interface ChatMessage {
  id: string;
  sender: "user" | "assistant" | "zoya" | "maya";
  text: string;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function App() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [persona, setPersona] = useState<AssistantPersona>(() => {
    const saved = localStorage.getItem("assistant_persona");
    return (saved === "zoya" || saved === "maya") ? saved : "maya";
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem("assistant_chat_history") || localStorage.getItem("zoya_chat_history");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse chat history", e);
      }
    }
    return [];
  });
  const messagesRef = useRef(messages);
  const personaRef = useRef(persona);

  useEffect(() => {
    personaRef.current = persona;
    localStorage.setItem("assistant_persona", persona);
  }, [persona]);

  useEffect(() => {
    messagesRef.current = messages;
    localStorage.setItem("assistant_chat_history", JSON.stringify(messages));
  }, [messages]);

  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (liveSessionRef.current) {
      liveSessionRef.current.isMuted = isMuted;
    }
  }, [isMuted]);

  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);

  const liveSessionRef = useRef<LiveSessionManager | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, appState]);

  const handlePersonaChange = (newPersona: AssistantPersona) => {
    if (newPersona === persona) return;
    setPersona(newPersona);
    resetAssistantSession();
    if (liveSessionRef.current) {
      liveSessionRef.current.persona = newPersona;
    }
  };

  const handleTextCommand = useCallback(async (finalTranscript: string) => {
    if (!finalTranscript.trim()) {
      setAppState("idle");
      return;
    }

    const currentPersona = personaRef.current;
    setMessages((prev) => [...prev, { id: Date.now().toString(), sender: "user", text: finalTranscript }]);
    
    // If live session is active, send text through it
    if (isSessionActive && liveSessionRef.current) {
      liveSessionRef.current.sendText(finalTranscript);
      return;
    }

    setAppState("processing");

    // 1. Check for browser commands
    const commandResult = processCommand(finalTranscript);

    let responseText = "";

    if (commandResult.isBrowserAction) {
      responseText = commandResult.action;
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-a", sender: currentPersona, text: responseText }]);
      
      if (!isMuted) {
        setAppState("speaking");
        const audioBase64 = await getAssistantAudio(responseText, currentPersona);
        if (audioBase64) {
          await playPCM(audioBase64);
        }
      }

      setAppState("idle");

      setTimeout(() => {
        if (commandResult.url) {
          window.open(commandResult.url, "_blank");
        }
      }, 1500);
    } else {
      // 2. General Chit-Chat via Gemini
      responseText = await getAssistantResponse(finalTranscript, messagesRef.current, currentPersona);
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-a", sender: currentPersona, text: responseText }]);
      
      if (!isMuted) {
        setAppState("speaking");
        const audioBase64 = await getAssistantAudio(responseText, currentPersona);
        if (audioBase64) {
          await playPCM(audioBase64);
        }
      }
      setAppState("idle");
    }
  }, [isMuted, isSessionActive]);

  useEffect(() => {
    return () => {
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
      }
    };
  }, []);

  const toggleListening = async () => {
    if (isSessionActive) {
      setIsSessionActive(false);
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
        liveSessionRef.current = null;
      }
      setAppState("idle");
      resetAssistantSession();
    } else {
      try {
        setIsSessionActive(true);
        resetAssistantSession();
        
        const session = new LiveSessionManager(persona);
        session.isMuted = isMuted;
        liveSessionRef.current = session;
        
        session.onStateChange = (state) => {
          setAppState(state);
        };
        
        session.onMessage = (sender, text) => {
          setMessages((prev) => [...prev, { id: Date.now().toString() + "-" + sender, sender, text }]);
        };
        
        session.onCommand = (url) => {
          setTimeout(() => {
            window.open(url, "_blank");
          }, 1000);
        };

        await session.start();
      } catch (e) {
        console.error("Failed to start session", e);
        setShowPermissionModal(true);
        setIsSessionActive(false);
        setAppState("idle");
      }
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    
    handleTextCommand(textInput);
    setTextInput("");
    setShowTextInput(false);
  };

  const currentName = persona === "maya" ? "Maya" : "Zoya";

  return (
    <div className="h-[100dvh] w-screen bg-[#050505] text-white flex flex-col items-center justify-between font-sans relative overflow-hidden m-0 p-0">
      {showPermissionModal && (
        <PermissionModal 
          assistantName={currentName}
          onClose={() => setShowPermissionModal(false)} 
        />
      )}

      {/* Cinematic Background Gradients */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
        {persona === "maya" ? (
          <>
            <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-rose-900/20 blur-[120px] rounded-full transition-colors duration-700" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-pink-900/25 blur-[120px] rounded-full transition-colors duration-700" />
          </>
        ) : (
          <>
            <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-violet-900/20 blur-[120px] rounded-full transition-colors duration-700" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-cyan-900/20 blur-[120px] rounded-full transition-colors duration-700" />
          </>
        )}
      </div>

      {/* Header with Name & Persona Switcher */}
      <header className="absolute top-0 left-0 w-full flex justify-between items-center z-20 shrink-0 px-6 py-4 md:px-12 md:py-6">
        <div className="flex items-center gap-3">
          <div 
            className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shadow-lg transition-all duration-300 ${
              persona === "maya" 
                ? "bg-gradient-to-tr from-rose-500 via-pink-500 to-amber-400 shadow-rose-500/30" 
                : "bg-gradient-to-tr from-violet-600 via-purple-500 to-cyan-400 shadow-violet-500/30"
            }`}
          >
            {persona === "maya" ? "M" : "Z"}
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-serif font-medium tracking-wide opacity-95">
                {currentName}
              </h1>
              <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-0.5 rounded-full bg-white/10 text-white/70 border border-white/10">
                AI Voice
              </span>
            </div>
          </div>
        </div>

        {/* Center/Right controls: Persona Switcher & Controls */}
        <div className="flex items-center gap-3">
          {/* Persona selector toggle */}
          <div className="flex items-center bg-white/5 p-1 rounded-full border border-white/10 backdrop-blur-md">
            <button
              onClick={() => handlePersonaChange("maya")}
              className={`px-3.5 py-1 rounded-full text-xs font-semibold tracking-wider transition-all duration-300 flex items-center gap-1.5 ${
                persona === "maya"
                  ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-md shadow-rose-500/40"
                  : "text-white/60 hover:text-white"
              }`}
              title="Switch to Maya"
            >
              <Sparkles size={12} className={persona === "maya" ? "opacity-100" : "opacity-50"} />
              Maya
            </button>
            <button
              onClick={() => handlePersonaChange("zoya")}
              className={`px-3.5 py-1 rounded-full text-xs font-semibold tracking-wider transition-all duration-300 flex items-center gap-1.5 ${
                persona === "zoya"
                  ? "bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white shadow-md shadow-violet-500/40"
                  : "text-white/60 hover:text-white"
              }`}
              title="Switch to Zoya"
            >
              <Sparkles size={12} className={persona === "zoya" ? "opacity-100" : "opacity-50"} />
              Zoya
            </button>
          </div>

          {messages.length > 0 && (
            <button
              onClick={() => {
                if (confirm(`Clear chat history with ${currentName}?`)) {
                  setMessages([]);
                  resetAssistantSession();
                }
              }}
              className="p-2.5 rounded-full bg-white/5 hover:bg-red-500/20 hover:text-red-400 transition-colors border border-white/10"
              title="Clear Chat History"
            >
              <Trash2 size={18} className="opacity-70" />
            </button>
          )}

          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <VolumeX size={18} className="opacity-70" />
            ) : (
              <Volume2 size={18} className="opacity-70" />
            )}
          </button>
        </div>
      </header>

      {/* Main Content - Visualizer & Chat */}
      <main className="absolute inset-0 flex flex-row items-center justify-between w-full h-full z-10 overflow-hidden pt-20 pb-24 px-4 md:px-12 pointer-events-none">
        
        {/* Left Column: Assistant Status */}
        <div className="flex w-[30%] lg:w-[25%] h-full flex-col justify-center gap-4 z-10">
          <div className="h-6">
            <AnimatePresence>
              {appState === "processing" && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className={`flex items-center gap-2 text-sm md:text-base italic font-serif ${
                    persona === "maya" ? "text-pink-300/90" : "text-cyan-300/90"
                  }`}
                >
                  <Loader2 size={16} className="animate-spin" />
                  {currentName} is thinking...
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Center Visualizer (Fixed Full Screen Background) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
          <Visualizer 
            state={appState} 
            name={currentName.toUpperCase()} 
            persona={persona} 
          />
        </div>

        {/* Right Column: User Status */}
        <div className="flex w-[30%] lg:w-[25%] h-full flex-col justify-center gap-4 z-10">
          <div className="h-6 flex justify-end">
            <AnimatePresence>
              {appState === "listening" && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className={`flex items-center gap-2 text-sm md:text-base italic ${
                    persona === "maya" ? "text-rose-300/90" : "text-violet-300/90"
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full animate-pulse ${
                    persona === "maya" ? "bg-rose-400" : "bg-violet-400"
                  }`} />
                  Listening...
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

      </main>

      {/* Controls */}
      <footer className="absolute bottom-0 left-0 w-full flex flex-col items-center justify-center pb-6 md:pb-8 z-20 shrink-0 gap-4">
        <AnimatePresence>
          {showTextInput && (
            <motion.form 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onSubmit={handleTextSubmit}
              className="w-full max-w-md flex items-center gap-2 bg-white/5 border border-white/10 rounded-full p-1 pl-4 backdrop-blur-md shadow-2xl"
            >
              <input 
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={`Type a message to ${currentName}...`}
                className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/30 text-sm"
                autoFocus
              />
              <button 
                type="submit"
                disabled={!textInput.trim()}
                className={`p-2 rounded-full text-white disabled:opacity-50 transition-colors ${
                  persona === "maya"
                    ? "bg-rose-500 hover:bg-rose-600 disabled:hover:bg-rose-500"
                    : "bg-violet-600 hover:bg-violet-700 disabled:hover:bg-violet-600"
                }`}
              >
                <Send size={16} />
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-4">
          <button
            onClick={toggleListening}
            className={`
              group relative flex items-center gap-3 px-8 py-4 rounded-full font-medium tracking-wide transition-all duration-300 shadow-2xl
              ${
                isSessionActive
                  ? "bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30"
                  : persona === "maya"
                  ? "bg-gradient-to-r from-rose-500/20 to-pink-500/20 text-white border border-rose-500/40 hover:border-rose-400 hover:scale-105"
                  : "bg-white/10 text-white border border-white/20 hover:bg-white/20 hover:scale-105"
              }
            `}
          >
            {isSessionActive ? (
              <>
                <MicOff size={20} />
                <span>End Session</span>
              </>
            ) : (
              <>
                <Mic size={20} className="group-hover:animate-bounce" />
                <span>Start Session ({currentName})</span>
              </>
            )}
          </button>
          
          {!isSessionActive && (
            <button
              onClick={() => setShowTextInput(!showTextInput)}
              className="p-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors shadow-2xl"
              title="Type instead"
            >
              <Keyboard size={20} className="opacity-70" />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
