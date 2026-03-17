import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, Schema } from '@google/genai';
import { 
  GEMINI_LIVE_MODEL_NAME,
  GEMINI_ANALYSIS_MODEL_NAME,
  GEMINI_EMBEDDING_MODEL_NAME,
  UI_STRINGS, 
  AUDIO_SAMPLE_RATE_INPUT, 
  AUDIO_SAMPLE_RATE_OUTPUT, 
  DEFAULT_SYSTEM_PROMPT,
  VOICES,
  PERSONAS
} from './constants';
import Spinner from './components/Spinner';

// --- CONSTANTS FOR PRICING ---
// Flash (Live): Input $0.075/1M | Output $0.30/1M
// Pro (Analysis): Input $1.25/1M | Output $5.00/1M (Approx Preview pricing)
const COST_FLASH_INPUT = 0.075;
const COST_FLASH_OUTPUT = 0.30;
const COST_PRO_INPUT = 1.25;
const COST_PRO_OUTPUT = 5.00;

const TOKENS_PER_SEC_AUDIO = 250; 
const TOKENS_PER_CHAR_TEXT = 0.25;

// --- UTILS ---
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

function downsampleTo16k(audioData: Float32Array, sampleRate: number): Int16Array {
  const targetRate = 16000;
  if (sampleRate === targetRate) {
    const int16 = new Int16Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) int16[i] = audioData[i] * 32767;
    return int16;
  }
  const ratio = sampleRate / targetRate;
  const newLength = Math.floor(audioData.length / ratio);
  const int16 = new Int16Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const start = Math.floor(i * ratio);
    int16[i] = audioData[start] * 32767;
  }
  return int16;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// --- ICONS ---
const HomeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
  </svg>
);

const SettingsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 18H7.5m9-6h2.25m-2.25 0a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 12h9" />
  </svg>
);

const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
  </svg>
);

const SyncIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
  </svg>
);

const NeuralOrb: React.FC<{ isActive: boolean, volume: number, color: string }> = ({ isActive, volume, color }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const particles = useRef<any[]>([]);
  const volumeRef = useRef(volume);
  const activeRef = useRef(isActive);
  const colorRef = useRef(color);

  useEffect(() => {
    volumeRef.current = volume; activeRef.current = isActive; colorRef.current = color;
  }, [volume, isActive, color]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true }); if (!ctx) return;
    const init = () => {
      particles.current = Array.from({ length: 60 }, () => ({
        x: Math.random() * canvas.width, y: Math.random() * canvas.height,
        size: Math.random() * 2 + 0.5, angle: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.005 + 0.002, radius: Math.random() * 150 + 30
      }));
    };
    const draw = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2; const cy = canvas.height / 2;
      const currentVolume = volumeRef.current; const currentActive = activeRef.current; const currentColor = colorRef.current;
      const glowSize = 130 + (currentVolume * 240);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowSize);
      grad.addColorStop(0, currentColor); grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, glowSize + 80, 0, Math.PI * 2); ctx.fill();
      particles.current.forEach(p => {
        p.angle += p.speed * (currentActive ? 1.5 + currentVolume * 25 : 1);
        const orbitR = p.radius + (currentActive ? Math.sin(time / 80 + p.radius) * (15 + currentVolume * 150) : 0);
        const x = cx + Math.cos(p.angle) * orbitR; const y = cy + Math.sin(p.angle) * orbitR;
        ctx.fillStyle = currentActive ? `rgba(80, 3, 127, ${0.4 + currentVolume})` : `rgba(80, 3, 127, 0.15)`;
        ctx.beginPath(); ctx.arc(x, y, p.size, 0, Math.PI * 2); ctx.fill();
      });
      requestRef.current = requestAnimationFrame(draw);
    };
    init(); requestRef.current = requestAnimationFrame(draw);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, []);

  return <canvas ref={canvasRef} width={600} height={600} className="w-full h-full pointer-events-none" />;
};

const App: React.FC = () => {
  const [status, setStatus] = useState<string>(UI_STRINGS.READY);
  const [isConnected, setIsConnected] = useState(false);
  const [view, setView] = useState<'home' | 'admin' | 'report'>('home');
  const [adminTab, setAdminTab] = useState<'directives' | 'plex' | 'logs'>('directives');
  const [passwordInput, setPasswordInput] = useState('');
  const [storedPassword, setStoredPassword] = useState(localStorage.getItem('neural_admin_pwd') || 'admin123');
  const [isUnlocked, setIsUnlocked] = useState(false);
  
  // Custom Knowledge Base (The Plex)
  const [systemPrompt, setSystemPrompt] = useState(localStorage.getItem('neural_prompt_v2') || DEFAULT_SYSTEM_PROMPT);
  const [neuralPlex, setNeuralPlex] = useState(localStorage.getItem('neural_plex') || '');
  const [selectedVoice, setSelectedVoice] = useState(VOICES[0].name);
  
  const [reports, setReports] = useState<any[]>(() => {
    const saved = JSON.parse(localStorage.getItem('neural_reports') || '[]');
    const cutoff = Date.now() - 10 * 24 * 60 * 60 * 1000;
    return saved.filter((r: any) => r.id > cutoff);
  });

  const [plexEmbeddings, setPlexEmbeddings] = useState<{ text: string, embedding: number[] }[]>(() => {
    return JSON.parse(localStorage.getItem('neural_plex_embeddings') || '[]');
  });
  const [isIndexing, setIsIndexing] = useState(false);

  const [currentReport, setCurrentReport] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [inputVolume, setInputVolume] = useState(0);
  const [attestationVolume, setAttestationVolume] = useState(0);

  // Identity & Compliance
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [userName, setUserName] = useState('');
  const [selectedPersona, setSelectedPersona] = useState<string>('');
  const [pendingStream, setPendingStream] = useState<MediaStream | null>(null);

  // --- Audio Attestation States ---
  const [attestationAudioUrl, setAttestationAudioUrl] = useState<string | null>(null);
  const [isAttestationAudioLoading, setIsAttestationAudioLoading] = useState(false);
  const [isAttestationAudioPlaying, setIsAttestationAudioPlaying] = useState(false);
  const [isListeningForAttestation, setIsListeningForAttestation] = useState(false);
  const [userAttestationTranscription, setUserAttestationTranscription] = useState('');
  const [attestationSuccess, setAttestationSuccess] = useState<boolean | null>(null);
  const attestationSessionRef = useRef<any>(null);
  const preheatedInputCtx = useRef<AudioContext | null>(null);

  const transcriptRef = useRef<{ user: string; model: string }[]>([]);
  const currentTurnRef = useRef<{ user: string; model: string }>({ user: '', model: '' });
  const [liveTranscript, setLiveTranscript] = useState('');
  const [appError, setAppError] = useState<string | null>(null);
  
  const showError = (msg: string) => {
    setAppError(msg);
    setTimeout(() => setAppError(null), 8000);
  };

  const activeSessionRef = useRef<any>(null);
  const sessionStartTime = useRef<number>(0);
  const outputAudioContext = useRef<AudioContext | null>(null);
  const nextStartTime = useRef<number>(0);
  const sources = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isProcessingAutopsy = useRef(false);

  // Persistence Effects
  useEffect(() => { localStorage.setItem('neural_prompt_v2', systemPrompt); }, [systemPrompt]);
  useEffect(() => { localStorage.setItem('neural_plex', neuralPlex); }, [neuralPlex]);
  useEffect(() => { localStorage.setItem('neural_reports', JSON.stringify(reports)); }, [reports]);
  useEffect(() => { localStorage.setItem('neural_admin_pwd', storedPassword); }, [storedPassword]);
  useEffect(() => { localStorage.setItem('neural_plex_embeddings', JSON.stringify(plexEmbeddings)); }, [plexEmbeddings]);

  const cosineSimilarity = (vecA: number[], vecB: number[]) => {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  };

  const indexNeuralPlex = async () => {
    if (!neuralPlex || isIndexing) return;
    setIsIndexing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      // Split into chunks of ~500 chars
      const chunks = neuralPlex.match(/[^.!?]+[.!?]+/g) || [neuralPlex];
      const newEmbeddings: { text: string, embedding: number[] }[] = [];

      for (const chunk of chunks) {
        const result = await ai.models.embedContent({
          model: GEMINI_EMBEDDING_MODEL_NAME,
          contents: [chunk],
        });
        if (result.embeddings?.[0]?.values) {
          newEmbeddings.push({ text: chunk, embedding: result.embeddings[0].values });
        }
      }
      setPlexEmbeddings(newEmbeddings);
    } catch (error) {
      console.error("Indexing failed:", error);
    } finally {
      setIsIndexing(false);
    }
  };

  const auraColor = useMemo(() => {
    if (!isConnected) return 'rgba(80, 3, 127, 0.02)';
    const baseOpacity = status === UI_STRINGS.SPEAKING ? 0.15 : 0.05;
    return `rgba(80, 3, 127, ${baseOpacity + inputVolume * 0.25})`;
  }, [isConnected, status, inputVolume]);

  const totalCostEstimate = useMemo(() => reports.reduce((acc, r) => acc + (r.costEstimate || 0), 0).toFixed(4), [reports]);

  // Unified Autopsy Generator using GEMINI 3 PRO
  const runAutopsyAnalysis = async () => {
    if (isProcessingAutopsy.current) return;
    const finalTranscript = transcriptRef.current;
    if (finalTranscript.length === 0 && currentTurnRef.current.user.length < 5) return;
    
    isProcessingAutopsy.current = true; 
    setIsAnalyzing(true);
    
    try {
      const durationSec = (Date.now() - sessionStartTime.current) / 1000;
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const fullText = finalTranscript.map(t => `Nurse: ${t.user}\nFamily Member: ${t.model}`).join('\n') + `\nNurse: ${currentTurnRef.current.user}\nFamily Member: ${currentTurnRef.current.model}`;

      // --- SEMANTIC SEARCH USING EMBEDDING 2 ---
      let relevantProtocols = "";
      if (plexEmbeddings.length > 0) {
        try {
          const transcriptEmbeddingResult = await ai.models.embedContent({
            model: GEMINI_EMBEDDING_MODEL_NAME,
            contents: [fullText.slice(-2000)], // Embed the last part of transcript
          });
          const transcriptVec = transcriptEmbeddingResult.embeddings?.[0]?.values;
          
          if (transcriptVec) {
            const scoredChunks = plexEmbeddings.map(chunk => ({
              ...chunk,
              score: cosineSimilarity(transcriptVec, chunk.embedding)
            })).sort((a, b) => b.score - a.score);
            
            relevantProtocols = scoredChunks.slice(0, 3).map(c => c.text).join('\n');
          }
        } catch (embedError) {
          console.error("Semantic search failed, falling back to full plex", embedError);
        }
      }

      const contextPrompt = relevantProtocols 
        ? `RELEVANT CLINICAL PROTOCOLS TO CHECK AGAINST:\n${relevantProtocols}`
        : (neuralPlex ? `CLINICAL PROTOCOLS:\n${neuralPlex}` : "");

      // Calculate cost based on Hybrid usage: Flash for Audio, Pro for Autopsy
      const audioTokens = durationSec * TOKENS_PER_SEC_AUDIO;
      const textTokens = fullText.length * TOKENS_PER_CHAR_TEXT;
      
      const flashCost = (audioTokens / 1_000_000) * ((COST_FLASH_INPUT + COST_FLASH_OUTPUT) / 2);
      // Estimate Pro input/output for Autopsy
      const proCost = ((textTokens + 500) / 1_000_000) * ((COST_PRO_INPUT + COST_PRO_OUTPUT) / 2); 

      const totalCost = flashCost + proCost;

      // Define Schema for Industry Standard Output
      const autopsySchema: Schema = {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.INTEGER, description: "Compassion and Effectiveness score from 0-100" },
          feedback: { type: Type.STRING, description: "Clinical critique on objection handling and empathy. Concise." },
          strength: { type: Type.STRING, description: "Primary clinical skill demonstrated" },
          logic: { type: Type.INTEGER, description: "Clarity of explanation 0-100" },
          empathy: { type: Type.INTEGER, description: "Emotional resonance/Empathy 0-100" }
        },
        required: ["score", "feedback", "strength", "logic", "empathy"]
      };

      const res = await ai.models.generateContent({
        model: GEMINI_ANALYSIS_MODEL_NAME, // Gemini 3 Pro
        contents: `Analyze this Hospice Transition Simulation. The User is a Nurse, the Model is playing the role of a ${selectedPersona}. Did the nurse handle objections (Cost, Giving Up, Control) well for this specific persona?\n\n${contextPrompt}\n\nTRANSCRIPT:\n${fullText}`,
        config: { 
          responseMimeType: 'application/json',
          responseSchema: autopsySchema,
          // Add thinking budget for deeper analysis (Gemini 3 feature)
          thinkingConfig: { thinkingBudget: 1024 } 
        }
      });
      
      const autopsyData = JSON.parse(res.text || '{}');
      const finalReport = { 
        ...autopsyData, 
        timestamp: new Date().toLocaleString(), 
        id: Date.now(), 
        userName: userName || 'Anonymous', 
        costEstimate: totalCost, 
        tokens: Math.round(audioTokens + textTokens) 
      };
      
      setReports(prev => [finalReport, ...prev]); 
      setCurrentReport(finalReport); 
      setView('report');
      transcriptRef.current = []; 
      currentTurnRef.current = { user: '', model: '' };

    } catch (e) { 
      console.error("Autopsy Failed", e); 
      showError("The server is currently busy with other trainees. Please wait 60 seconds and try again.");
    } finally { 
      setIsAnalyzing(false); 
      isProcessingAutopsy.current = false; 
    }
  };

  // Helper to play base64 audio
  const playBase64Audio = async (base64Audio: string, onEnded?: () => void) => {
    const tempOutputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: AUDIO_SAMPLE_RATE_OUTPUT });
    const audioBuffer = await decodeAudioData(decode(base64Audio), tempOutputAudioContext, AUDIO_SAMPLE_RATE_OUTPUT, 1);
    const source = tempOutputAudioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(tempOutputAudioContext.destination);
    source.onended = () => {
      tempOutputAudioContext.close(); 
      if (onEnded) onEnded();
    };
    source.start(0);
  };

  // Generate attestation audio
  const generateAttestationAudio = async () => {
    if (attestationAudioUrl || isAttestationAudioLoading) return;
    setIsAttestationAudioLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const attestationText = `Hello ${userName || 'Nurse'}, This is a clinical simulation for educational purposes. Do you agree that you will not share any real patient data?`;
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ parts: [{ text: attestationText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
        },
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) setAttestationAudioUrl(base64Audio);
    } catch (error) {
      console.error("Error generating attestation audio:", error);
      showError("Failed to load the audio prompt. The server is currently busy. Please wait 60 seconds and try again.");
    } finally {
      setIsAttestationAudioLoading(false);
    }
  };

  // Combined play and listen flow to ensure AudioContext is resumed by user gesture
  const playAttestationPromptAndListen = async () => {
    if (!attestationAudioUrl || isAttestationAudioPlaying || isListeningForAttestation || !pendingStream) return;

    // 1. Initialize Audio Context immediately on click (User Gesture)
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    await ctx.resume();
    preheatedInputCtx.current = ctx;

    setIsAttestationAudioPlaying(true);
    setAttestationSuccess(null); 
    setUserAttestationTranscription('');

    // 2. Play Audio
    await playBase64Audio(attestationAudioUrl, () => {
        setIsAttestationAudioPlaying(false);
        // 3. Connect Stream (Context is already warm)
        startAttestationListening(); 
    });
  };

  const startAttestationListening = async () => {
    if (!pendingStream || !preheatedInputCtx.current) {
      setAttestationSuccess(false);
      return;
    }
    setIsListeningForAttestation(true);
    let attestationFound = false;
    let currentAttestationText = '';
    let timeoutId: ReturnType<typeof setTimeout> | null = null; 

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const inputCtx = preheatedInputCtx.current; // Use the warmed-up context
      const actualSampleRate = inputCtx.sampleRate;

      const attestationSessionPromise = ai.live.connect({
        model: GEMINI_LIVE_MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO], 
          systemInstruction: "You are a passive listener. Do not speak. Just listen.", 
          inputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } }
        },
        callbacks: {
          onopen: () => {
            const source = inputCtx.createMediaStreamSource(pendingStream!);
            const proc = inputCtx.createScriptProcessor(2048, 1, 1);
            
            proc.onaudioprocess = (e) => {
              const data = e.inputBuffer.getChannelData(0);
              
              // Volume Meter Logic
              let sum = 0; for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
              setAttestationVolume(Math.sqrt(sum / data.length));

              const int16 = downsampleTo16k(data, actualSampleRate); 
              attestationSessionPromise.then((session) => {
                session.sendRealtimeInput({
                  media: {
                    data: encode(new Uint8Array(int16.buffer)),
                    mimeType: 'audio/pcm;rate=16000'
                  }
                });
              });
            };
            source.connect(proc);
            proc.connect(inputCtx.destination);
            
            timeoutId = setTimeout(() => {
              if (!attestationFound && attestationSessionRef.current) {
                attestationSessionRef.current.close();
              }
            }, 15000); 
          },
          onmessage: (msg: LiveServerMessage) => {
            if (msg.serverContent?.inputTranscription?.text) {
              const newText = msg.serverContent.inputTranscription.text;
              currentAttestationText += newText;
              setUserAttestationTranscription(currentAttestationText.slice(-100));
              const lowerText = currentAttestationText.toLowerCase();
              if (lowerText.includes("agree") || lowerText.includes("yes") || lowerText.includes("ok")) { 
                attestationFound = true;
                if (timeoutId) clearTimeout(timeoutId); 
                attestationSessionRef.current?.close(); 
              }
            }
          },
          onclose: () => {
            if (timeoutId) clearTimeout(timeoutId);
            inputCtx.close();
            preheatedInputCtx.current = null;
            setIsListeningForAttestation(false);
            setAttestationSuccess(attestationFound);
            attestationSessionRef.current = null;
            setAttestationVolume(0);
          },
          onerror: (e: ErrorEvent) => {
            if (timeoutId) clearTimeout(timeoutId);
            inputCtx.close();
            preheatedInputCtx.current = null;
            setIsListeningForAttestation(false);
            setAttestationSuccess(false);
            attestationSessionRef.current = null;
            setAttestationVolume(0);
          },
        }
      });
      attestationSessionRef.current = await attestationSessionPromise;
    } catch (error) {
      setIsListeningForAttestation(false);
      setAttestationSuccess(false);
      setAttestationVolume(0);
    }
  };

  // Effect to generate attestation audio when disclaimer is shown
  useEffect(() => {
    if (showDisclaimer && !attestationAudioUrl && !isAttestationAudioLoading) {
      generateAttestationAudio();
    }
    if (!showDisclaimer && attestationSessionRef.current) {
      attestationSessionRef.current.close();
      attestationSessionRef.current = null;
      setIsListeningForAttestation(false);
      setUserAttestationTranscription('');
      setAttestationSuccess(null);
    }
  }, [showDisclaimer, attestationAudioUrl, isAttestationAudioLoading]);

  // Main neural link initiation for conversation
  const initiateNeuralLink = async (stream: MediaStream) => {
    try {
      setStatus(UI_STRINGS.CONNECTING);
      sessionStartTime.current = Date.now();
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const actualSampleRate = inputCtx.sampleRate;
      
      outputAudioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: AUDIO_SAMPLE_RATE_OUTPUT });
      
      const plexContext = neuralPlex ? `\n\nADDITIONAL CONTEXT (Use only if relevant to family objections): ${neuralPlex}\n` : '';
      const personaContext = `\n\nCRITICAL ROLE ASSIGNMENT: You are playing the role of a ${selectedPersona}. You MUST adopt the perspective, concerns, and vocabulary of a ${selectedPersona} interacting with a hospice transition nurse.\n\n`;
      
      // Select voice config based on UI or Random
      const currentVoice = VOICES.find(v => v.name === selectedVoice)?.id || 'Puck';

      const sessionPromise = ai.live.connect({
        model: GEMINI_LIVE_MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: currentVoice } }
          },
          systemInstruction: personaContext + systemPrompt + plexContext,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true); setStatus(UI_STRINGS.LISTENING);
            const source = inputCtx.createMediaStreamSource(stream);
            const proc = inputCtx.createScriptProcessor(2048, 1, 1); 
            
            proc.onaudioprocess = (e) => {
              const data = e.inputBuffer.getChannelData(0);
              let sum = 0; for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
              setInputVolume(Math.sqrt(sum / data.length));
              
              const int16 = downsampleTo16k(data, actualSampleRate);
              
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ 
                  media: { 
                    data: encode(new Uint8Array(int16.buffer)), 
                    mimeType: 'audio/pcm;rate=16000'
                  }
                });
              });
            };
            source.connect(proc); proc.connect(inputCtx.destination);
            inputCtx.resume(); outputAudioContext.current?.resume();
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.interrupted) {
              for (const source of sources.current.values()) { try { source.stop(); } catch (e) {} sources.current.delete(source); }
              nextStartTime.current = 0;
            }
            if (msg.serverContent?.inputTranscription) {
               const txt = msg.serverContent.inputTranscription.text;
               currentTurnRef.current.user += txt;
               setLiveTranscript(prev => (prev + txt).slice(-150)); 
            }
            if (msg.serverContent?.outputTranscription) currentTurnRef.current.model += msg.serverContent.outputTranscription.text;
            if (msg.serverContent?.turnComplete) {
              transcriptRef.current.push({ ...currentTurnRef.current });
              currentTurnRef.current = { user: '', model: '' };
              setLiveTranscript(''); 
            }
            const audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audio && outputAudioContext.current) {
              setStatus(UI_STRINGS.SPEAKING);
              const ctx = outputAudioContext.current; nextStartTime.current = Math.max(nextStartTime.current, ctx.currentTime);
              const buffer = await decodeAudioData(decode(audio), ctx, AUDIO_SAMPLE_RATE_OUTPUT, 1);
              const src = ctx.createBufferSource(); src.buffer = buffer; src.connect(ctx.destination);
              src.onended = () => { sources.current.delete(src); if (sources.current.size === 0) setStatus(UI_STRINGS.LISTENING); };
              src.start(nextStartTime.current); nextStartTime.current += buffer.duration; sources.current.add(src);
            }
          },
          onclose: () => { setIsConnected(false); setStatus(UI_STRINGS.READY); setInputVolume(0); setLiveTranscript(''); runAutopsyAnalysis(); },
          onerror: () => { 
            setStatus(UI_STRINGS.ERROR_CONNECTION); 
            showError("Connection lost or server is too busy. Please wait a moment and try again.");
            runAutopsyAnalysis(); 
          }
        }
      });
      activeSessionRef.current = await sessionPromise;
    } catch (e) { 
      setStatus(UI_STRINGS.ERROR_MIC_PERMISSION); 
      showError("Microphone access denied or connection failed.");
    }
  };

  const handleConnect = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setPendingStream(stream); setShowDisclaimer(true);
    } catch (e) { setStatus(UI_STRINGS.ERROR_MIC_PERMISSION); }
  };

  const handleDisconnect = () => {
    if (activeSessionRef.current) {
      activeSessionRef.current.close();
      activeSessionRef.current = null;
    }
    for (const source of sources.current.values()) {
      try { source.stop(); } catch (e) {}
      sources.current.delete(source);
    }
    nextStartTime.current = 0;
    setIsConnected(false);
    setStatus(UI_STRINGS.READY);
    setInputVolume(0);
    setLiveTranscript('');
    runAutopsyAnalysis();
  };

  const handleAgreeDisclaimer = () => {
    if (!userName || userName.length < 4) { showError("Please enter your name/ID for training records."); return; }
    if (attestationSuccess === true && pendingStream) {
      setShowDisclaimer(false);
      initiateNeuralLink(pendingStream);
    } else {
        alert("Please complete the audio attestation.");
    }
  };

  const checkAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === storedPassword) setIsUnlocked(true);
    else { showError("Access Denied"); setPasswordInput(''); }
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
      {appError && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[2000] bg-red-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 max-w-md w-full">
          <div className="flex-1 font-bold text-sm text-center">{appError}</div>
          <button onClick={() => setAppError(null)} className="text-white/70 hover:text-white font-bold p-2">✕</button>
        </div>
      )}
      <div className="absolute inset-0 aura-animate pointer-events-none transition-all duration-1000" style={{ background: `radial-gradient(circle at 50% 50%, ${auraColor} 0%, transparent 80%)`, filter: 'blur(100px)' }} />
      
      {/* Disclaimer Modal */}
      {showDisclaimer && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-white/60 backdrop-blur-3xl" />
          <div className="relative bg-white border border-gray-100 w-full max-w-2xl rounded-[3.5rem] p-10 md:p-16 shadow-[0_40px_100px_rgba(0,0,0,0.1)] flex flex-col items-center animate-in zoom-in-95 duration-500 overflow-y-auto max-h-[90vh] custom-scrollbar">
            <h2 className="text-[11px] font-black tracking-[0.5em] text-[#50037F] uppercase mb-10">Simulation Protocol</h2>
            <div className="w-full space-y-8 mb-12 text-left">
              <div className="space-y-3">
                <label className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 ml-4">Nurse Name / ID</label>
                <input type="text" autoFocus value={userName} onChange={e => setUserName(e.target.value)} className="w-full bg-gray-50 border border-gray-100 p-6 rounded-2xl text-lg focus:outline-none focus:border-[#50037F] text-[#50037F] shadow-inner" placeholder="Nurse Joy / 88123" />
              </div>

              <div className="space-y-6 text-[10px] text-gray-500 leading-relaxed bg-gray-50 p-8 rounded-[2rem] border border-gray-100">
                <p className="font-bold text-gray-900">SIMULATION BRIEF:</p>
                <p>You are about to speak with a family member who is resistant to hospice care. Your goal is to navigate their objections with empathy and education.</p>
                <p className="mt-2"><b>CONFIDENTIALITY NOTICE:</b> Do not use real patient names. This session is recorded for training.</p>
              </div>

              {/* Audio Attestation Section */}
              <div className="p-8 bg-purple-50 border border-purple-100 rounded-[2rem] space-y-4 relative overflow-hidden">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-700">Audio Consent</h3>
                  <p className="text-sm text-gray-700 leading-relaxed">Confirm you are ready to begin the simulation:</p>
                  <button
                      onClick={playAttestationPromptAndListen}
                      disabled={isAttestationAudioLoading || isAttestationAudioPlaying || isListeningForAttestation || attestationSuccess === true || userName.length < 4}
                      className="w-full bg-purple-600 text-white py-4 rounded-xl font-bold text-sm hover:bg-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md active:scale-95"
                  >
                      {userName.length < 4 ? 'Enter Name (4+ chars) to Enable' : isAttestationAudioLoading ? 'Generating Prompt...' : isAttestationAudioPlaying ? 'Playing Prompt...' : isListeningForAttestation ? 'Listening (Speak Now)...' : 'Play Prompt'}
                  </button>
                  
                  {isListeningForAttestation && (
                      <div className="flex flex-col items-center gap-2 mt-4 animate-in fade-in">
                          <p className="text-center text-sm italic text-gray-600">Say: "I agree" or "Yes"</p>
                          {/* Volume Visualization */}
                          <div className="h-1.5 w-32 bg-gray-200 rounded-full overflow-hidden">
                             <div 
                               className="h-full bg-green-500 transition-all duration-75" 
                               style={{ width: `${Math.min(attestationVolume * 500, 100)}%` }}
                             />
                          </div>
                          {attestationVolume === 0 && <p className="text-[10px] text-red-400">Microphone silent? Check permissions.</p>}
                      </div>
                  )}
                  
                  {userAttestationTranscription && (
                      <p className="text-center text-xs text-gray-500 mt-2">Heard: "{userAttestationTranscription}"</p>
                  )}
                  {attestationSuccess === true && (
                      <div className="text-center text-green-600 font-bold text-sm flex items-center justify-center gap-2 mt-4 bg-green-50 p-3 rounded-xl border border-green-100">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                          </svg>
                          Verified
                      </div>
                  )}
                  {attestationSuccess === false && !isListeningForAttestation && (
                       <p className="text-center text-red-600 font-bold text-sm mt-4">
                          Verification Failed. Try again.
                      </p>
                  )}
              </div>
            </div>
            <button
                onClick={handleAgreeDisclaimer}
                disabled={!userName || userName.length < 4 || attestationSuccess !== true}
                className="w-full bg-[#50037F] text-white py-6 rounded-3xl font-black text-xs tracking-[0.6em] uppercase hover:opacity-90 transition-all shadow-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                Start Simulation
            </button>
          </div>
        </div>
      )}

      {/* Header Info */}
      <div className="absolute top-10 flex items-center gap-6 z-[100]">
        {isConnected && neuralPlex && (
          <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-600 rounded-full border border-green-100 text-[9px] font-black uppercase tracking-widest animate-pulse">
            <SyncIcon /> Protocols Loaded
          </div>
        )}
      </div>

      <div className="absolute top-10 left-10 z-[100]">
        {view !== 'home' && (
          <button onClick={() => setView('home')} className="p-4 bg-gray-100/50 backdrop-blur rounded-full border border-gray-200 hover:bg-gray-200 transition-all active:scale-90 text-[#50037F]">
            <HomeIcon />
          </button>
        )}
      </div>

      <div className="absolute top-10 right-10 z-[100]">
        <button onClick={() => setView('admin')} className="p-4 bg-gray-100/50 backdrop-blur rounded-full border border-gray-200 hover:bg-gray-200 transition-all active:scale-90 text-[#50037F]">
          <SettingsIcon />
        </button>
      </div>

      <main className="w-full max-w-5xl flex flex-col items-center z-10">
        {view === 'home' && (
          <div className="flex flex-col items-center gap-14">
            <div className="relative w-80 h-80 md:w-[480px] md:h-[480px] flex items-center justify-center">
              <NeuralOrb isActive={isConnected} volume={inputVolume} color={isConnected ? 'rgba(80, 3, 127, 0.3)' : 'rgba(80, 3, 127, 0.05)'} />
            </div>
            <div className="flex flex-col items-center gap-8">
              <span className="text-[11px] font-black tracking-[1em] text-[#50037F]/40 uppercase block animate-pulse text-center">
                {status === UI_STRINGS.SPEAKING && selectedPersona ? `${selectedPersona} SPEAKING...` : status}
              </span>
              


              {!isConnected && (
                <div className="flex flex-col items-center gap-3 w-full max-w-xs z-20 animate-in fade-in slide-in-from-bottom-4">
                  <label className="text-[9px] font-black uppercase tracking-widest text-[#50037F]/60">Select Target Persona</label>
                  <div className="relative w-full">
                    <select
                      value={selectedPersona}
                      onChange={(e) => setSelectedPersona(e.target.value)}
                      className="w-full bg-white/80 backdrop-blur border border-[#50037F]/20 p-4 rounded-2xl text-sm font-bold text-[#50037F] focus:outline-none focus:border-[#50037F] shadow-sm appearance-none text-center cursor-pointer hover:bg-white transition-all"
                    >
                      <option value="" disabled>-- Choose Persona --</option>
                      {PERSONAS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[#50037F]/50">
                      ▼
                    </div>
                  </div>
                </div>
              )}

              {isConnected && selectedPersona && (
                <div className="px-4 py-2 bg-[#50037F]/5 rounded-full border border-[#50037F]/10 text-[10px] font-black text-[#50037F] uppercase tracking-widest">
                  Role: {selectedPersona}
                </div>
              )}

              <button
                onClick={isConnected ? handleDisconnect : handleConnect}
                disabled={status === UI_STRINGS.CONNECTING || isAnalyzing || (!isConnected && !selectedPersona)}
                className={`group relative w-32 h-32 rounded-full border transition-all duration-1000 flex items-center justify-center transform active:scale-90 ${isConnected ? 'bg-red-50 border-red-200 shadow-xl' : 'bg-white border-gray-100 shadow-2xl hover:border-[#50037F]/30'} ${(!isConnected && !selectedPersona) ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
              >
                {isAnalyzing ? <Spinner size="lg" color="text-[#50037F]" /> : isConnected ? <div className="w-10 h-10 bg-red-600 rounded-2xl animate-pulse shadow-lg" /> : <div className="w-10 h-10 bg-[#50037F] rounded-full opacity-10 group-hover:opacity-100" />}
              </button>
            </div>
          </div>
        )}

        {view === 'admin' && (
          <div className="w-full max-w-3xl bg-white border border-gray-100 p-12 rounded-[4.5rem] shadow-2xl animate-in fade-in slide-in-from-bottom-12 max-h-[85vh] overflow-y-auto custom-scrollbar">
            {!isUnlocked ? (
              <form onSubmit={checkAdmin} className="space-y-12 py-10 text-center">
                <h2 className="text-[11px] font-black tracking-[0.6em] text-[#50037F]/40 uppercase">Trainer Access Required</h2>
                <input type="password" autoFocus value={passwordInput} onChange={e => setPasswordInput(e.target.value)} className="w-full bg-gray-50 border border-gray-100 p-8 rounded-3xl text-center text-3xl tracking-[0.5em] focus:outline-none focus:border-[#50037F] text-[#50037F]" placeholder="••••••••" />
                <button className="w-full bg-[#50037F] text-white py-6 rounded-3xl font-black text-xs tracking-[0.6em] uppercase active:scale-95">Unlock Dashboard</button>
              </form>
            ) : (
              <div className="space-y-12">
                <div className="flex gap-4 mb-4">
                  {(['directives', 'plex', 'logs'] as const).map(t => (
                    <button key={t} onClick={() => setAdminTab(t)} className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${adminTab === t ? 'bg-[#50037F] text-white' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}>{t}</button>
                  ))}
                </div>

                {adminTab === 'directives' && (
                  <div className="space-y-10 animate-in fade-in duration-500">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-[#50037F]/5 border border-[#50037F]/10 p-6 rounded-3xl">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Simulations</p>
                        <p className="text-xl font-black text-[#50037F]">{reports.length}</p>
                      </div>
                      <div className="bg-[#50037F]/5 border border-[#50037F]/10 p-6 rounded-3xl">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Compute Cost (Est)</p>
                        <p className="text-xl font-black text-[#50037F]">${totalCostEstimate}</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center px-4">
                        <h2 className="text-[11px] font-black tracking-[0.5em] text-[#50037F]/40 uppercase">Role-Play Scenario</h2>
                        <button 
                          onClick={() => { if(confirm('Reset to default prompt?')) setSystemPrompt(DEFAULT_SYSTEM_PROMPT); }}
                          className="text-[9px] text-gray-400 font-bold uppercase tracking-widest hover:text-[#50037F] transition-colors"
                        >
                          Reset to Default
                        </button>
                      </div>
                      <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} className="w-full bg-gray-50 border border-gray-100 p-8 rounded-[3rem] h-48 text-sm focus:outline-none focus:border-[#50037F] shadow-inner" placeholder="Scenario definition..." />
                    </div>
                  </div>
                )}

                {adminTab === 'plex' && (
                  <div className="space-y-10 animate-in fade-in duration-500">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center px-4">
                        <h2 className="text-[11px] font-black tracking-[0.5em] text-[#50037F]/40 uppercase">Clinical Protocols (Knowledge Base)</h2>
                        <button 
                          onClick={indexNeuralPlex}
                          disabled={isIndexing || !neuralPlex}
                          className={`flex items-center gap-2 px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${isIndexing ? 'bg-purple-100 text-purple-600 animate-pulse' : 'bg-gray-100 text-gray-500 hover:bg-purple-50 hover:text-purple-600'}`}
                        >
                          {isIndexing ? <Spinner size="xs" color="text-purple-600" /> : <SyncIcon />}
                          {isIndexing ? 'Indexing...' : plexEmbeddings.length > 0 ? 'Re-Index Plex' : 'Index for Semantic Search'}
                        </button>
                      </div>
                      <textarea value={neuralPlex} onChange={e => setNeuralPlex(e.target.value)} className="w-full bg-gray-50 border border-gray-100 p-8 rounded-[3rem] h-72 text-sm focus:outline-none focus:border-[#50037F] shadow-inner font-mono text-[11px]" placeholder="Paste specific hospice objection handling scripts or protocols here..." />
                      {plexEmbeddings.length > 0 && (
                        <p className="text-[9px] text-green-600 font-bold uppercase tracking-widest px-6 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                          {plexEmbeddings.length} Semantic Chunks Indexed with Embedding 2
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {adminTab === 'logs' && (
                  <div className="space-y-6 animate-in fade-in duration-500">
                    <div className="flex justify-between items-center px-6">
                      <h2 className="text-[11px] font-black tracking-[0.5em] text-[#50037F]/40 uppercase">Simulation Logs</h2>
                      <button onClick={() => {if(confirm('Wipe logs?')) setReports([]);}} className="text-[10px] text-red-500 font-black uppercase flex items-center gap-3"><TrashIcon /> Wipe logs</button>
                    </div>
                    <div className="space-y-4 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                      {reports.map((r: any) => (
                        <div key={r.id} onClick={() => {setCurrentReport(r); setView('report');}} className="p-8 bg-gray-50 border border-gray-100 rounded-[2.5rem] flex justify-between items-center cursor-pointer hover:bg-white hover:border-[#50037F]/20 group">
                          <div className="space-y-1">
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{r.userName} • {r.timestamp}</p>
                            <p className="text-xs font-black text-[#50037F] uppercase tracking-widest">{r.strength}</p>
                          </div>
                          <div className="text-2xl font-black text-gray-200 group-hover:text-[#50037F]/30">{r.score}%</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {view === 'report' && currentReport && (
          <div className="w-full max-w-2xl bg-white border border-gray-100 p-12 rounded-[5rem] text-center shadow-2xl animate-in zoom-in-95 duration-1000 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <h2 className="text-[10px] font-black tracking-[0.8em] text-[#50037F]/30 uppercase mb-8">Performance Review: {currentReport.userName}</h2>
            <div className="text-[8rem] font-black text-[#50037F] tracking-tighter mb-8 leading-none">{currentReport.score}%</div>
            <div className="grid grid-cols-2 gap-6 mb-10">
              <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 shadow-sm">
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">Clarity</p>
                <p className="text-xl font-black text-[#50037F]">{currentReport.logic || 0}%</p>
              </div>
              <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 shadow-sm">
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">Compassion</p>
                <p className="text-xl font-black text-[#50037F]">{currentReport.empathy || 0}%</p>
              </div>
            </div>
            <div className="space-y-10">
              <div className="p-8 bg-[#50037F]/5 rounded-[3rem] border border-[#50037F]/10"><p className="text-sm text-gray-600 italic leading-relaxed">"{currentReport.feedback}"</p></div>
              <div className="flex justify-between px-10 text-[9px] font-bold text-gray-300 uppercase tracking-widest">
                <span>Tokens: {currentReport.tokens}</span>
                <span>Training Cost: ${currentReport.costEstimate?.toFixed(4)}</span>
              </div>
              <button onClick={() => setView('home')} className="bg-[#50037F] text-white px-16 py-6 rounded-3xl text-[11px] font-black tracking-[0.6em] uppercase hover:opacity-90 active:scale-95 shadow-xl">Dismiss</button>
            </div>
          </div>
        )}
      </main>

      <style>{`
        @keyframes aura-shift { 0%, 100% { transform: translate(0,0) scale(1); filter: blur(80px); opacity: 0.6; } 50% { transform: translate(-3%, -2%) scale(1.08); filter: blur(100px); opacity: 0.8; } }
        .aura-animate { animation: aura-shift 18s infinite ease-in-out; }
        * { transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1); -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  );
};

export default App;