import React, { useState, useEffect, useRef } from 'react';
import { Monitor, Mic, MicOff, Play, Square, Save, Trash2, Settings, User, BookOpen, Volume2, Keyboard, MessageSquare, Send, Gamepad } from 'lucide-react';
import { useProfiles } from './useProfiles';
import { useLiveAPI } from './useLiveAPI';
import { useScreenCapture } from './useScreenCapture';
import { useMicrophone } from './useMicrophone';
import { Profile } from './types';

const VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];

export default function App() {
  const { profiles, saveProfile, deleteProfile } = useProfiles();
  const { isConnected, isConnecting, connect, disconnect, sendFrame, sendAudio, sendText } = useLiveAPI();
  const { isCapturing, startCapture, stopCapture, videoRef } = useScreenCapture();
  const { isMicActive, startMic, stopMic, setMuted } = useMicrophone();

  const [activeProfileId, setActiveProfileId] = useState<string>('');
  const [characterInfo, setCharacterInfo] = useState('');
  const [gameKnowledge, setGameKnowledge] = useState('');
  const [gameName, setGameName] = useState('');
  const [selectedVoice, setSelectedVoice] = useState(VOICES[0]);
  const [profileName, setProfileName] = useState('');
  
  const [pttKey, setPttKey] = useState<string>('v');
  const [pttMode, setPttMode] = useState<'hold' | 'toggle'>('hold');
  const [isTalking, setIsTalking] = useState<boolean>(false);
  const [isRecordingKey, setIsRecordingKey] = useState<boolean>(false);
  
  const [captions, setCaptions] = useState<string>('');
  const [chatInput, setChatInput] = useState<string>('');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameIntervalRef = useRef<number | null>(null);
  const captionsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    captionsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [captions]);

  // Load profile when selected
  useEffect(() => {
    if (activeProfileId) {
      const profile = profiles.find(p => p.id === activeProfileId);
      if (profile) {
        setCharacterInfo(profile.characterInfo);
        setGameKnowledge(profile.gameKnowledge);
        setGameName(profile.gameName || '');
        setSelectedVoice(profile.voice);
        setProfileName(profile.name);
        setPttKey(profile.pttKey || 'v');
        setPttMode(profile.pttMode || 'hold');
      }
    } else {
      setCharacterInfo('');
      setGameKnowledge('');
      setGameName('');
      setSelectedVoice(VOICES[0]);
      setProfileName('');
      setPttKey('v');
      setPttMode('hold');
    }
  }, [activeProfileId, profiles]);

  const handleSaveProfile = () => {
    if (!profileName.trim()) {
      alert('Please enter a profile name');
      return;
    }
    const newProfile: Profile = {
      id: activeProfileId || Date.now().toString(),
      name: profileName,
      gameName,
      characterInfo,
      gameKnowledge,
      voice: selectedVoice,
      pttKey,
      pttMode,
    };
    saveProfile(newProfile);
    setActiveProfileId(newProfile.id);
  };

  const handleDeleteProfile = () => {
    if (activeProfileId) {
      deleteProfile(activeProfileId);
      setActiveProfileId('');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isRecordingKey) {
        e.preventDefault();
        setPttKey(e.key.toLowerCase() === ' ' ? 'space' : e.key.toLowerCase());
        setIsRecordingKey(false);
        return;
      }

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }

      const keyMatch = e.key.toLowerCase() === pttKey.toLowerCase() || (e.code === 'Space' && pttKey === 'space');
      
      if (keyMatch) {
        if (pttMode === 'hold') {
          setIsTalking(true);
        } else if (pttMode === 'toggle' && !e.repeat) {
          setIsTalking(prev => !prev);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (isRecordingKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

      const keyMatch = e.key.toLowerCase() === pttKey.toLowerCase() || (e.code === 'Space' && pttKey === 'space');

      if (keyMatch && pttMode === 'hold') {
        setIsTalking(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [pttKey, pttMode, isRecordingKey]);

  useEffect(() => {
    setMuted(!isTalking);
  }, [isTalking, setMuted]);

  useEffect(() => {
    let timeoutId: number;

    const scheduleNextComment = () => {
      if (!isConnected) return;
      
      // Random time between 1 and 5 minutes (60000 to 300000 ms)
      const nextTime = Math.floor(Math.random() * (300000 - 60000 + 1)) + 60000;
      
      timeoutId = window.setTimeout(() => {
        if (isConnected) {
          sendText("(Internal thought: It's been a while since anyone spoke. Make a brief, spontaneous, in-character comment about what is currently happening on the screen. Do not acknowledge this prompt.)");
          scheduleNextComment();
        }
      }, nextTime);
    };

    if (isConnected) {
      scheduleNextComment();
    }

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [isConnected, sendText]);

  const toggleConnection = async () => {
    if (isConnected) {
      disconnect();
      stopMic();
      if (frameIntervalRef.current) {
        window.clearInterval(frameIntervalRef.current);
      }
    } else {
      const systemInstruction = `You are playing a game with the user. You can see their screen.
The user is currently playing: ${gameName || 'an unspecified game'}. Use this to contextualize what you see. You have access to Google Search to look up information about this game if needed.
      
Character Persona:
${characterInfo}

Game Knowledge & Rules:
${gameKnowledge}

Act completely in character. Respond to what you see on the screen and what the user says. Keep responses concise and engaging.`;

      await connect(systemInstruction, selectedVoice, (text) => {
        setCaptions(prev => prev + text);
      });
      
      // Send an initial prompt so the AI starts talking immediately
      setTimeout(() => {
        sendText("I have just connected and shared my screen. Please introduce yourself and tell me what you see on my screen.");
      }, 1000);

      // Start sending frames
      frameIntervalRef.current = window.setInterval(() => {
        if (videoRef.current && canvasRef.current && isCapturing) {
          const canvas = canvasRef.current;
          const video = videoRef.current;
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              // Scale down to save bandwidth, max 720p roughly
              const scale = Math.min(1, 720 / Math.max(canvas.width, canvas.height));
              const scaledCanvas = document.createElement('canvas');
              scaledCanvas.width = canvas.width * scale;
              scaledCanvas.height = canvas.height * scale;
              const scaledCtx = scaledCanvas.getContext('2d');
              if (scaledCtx) {
                scaledCtx.drawImage(canvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
                const base64 = scaledCanvas.toDataURL('image/jpeg', 0.5);
                sendFrame(base64);
              }
            }
          }
        }
      }, 1000); // 1 frame per second

      // Start mic
      startMic((base64) => {
        sendAudio(base64);
      });
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans flex flex-col md:flex-row">
      {/* Left Panel: Settings & Profiles */}
      <div className="w-full md:w-96 bg-zinc-900 border-r border-zinc-800 p-6 flex flex-col gap-6 overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-emerald-400 flex items-center gap-2">
              <Monitor className="w-6 h-6" />
              Game AI Companion
            </h1>
            <p className="text-sm text-zinc-400 mt-1">Your personal AI co-pilot.</p>
          </div>
          <a 
            href="/obs" 
            target="_blank" 
            rel="noopener noreferrer"
            title="Open OBS Overlay"
            className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
          >
            <Monitor className="w-5 h-5" />
          </a>
        </div>

        {/* Profile Selection */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Active Profile
          </label>
          <select
            value={activeProfileId}
            onChange={(e) => setActiveProfileId(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            <option value="">-- New Profile --</option>
            {profiles.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="h-px bg-zinc-800" />

        {/* Settings Form */}
        <div className="space-y-4 flex-1">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">Profile Name</label>
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="e.g., Sarcastic Portal AI"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Volume2 className="w-4 h-4" />
              Voice Model (RVC Alternative)
            </label>
            <select
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            >
              {VOICES.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <p className="text-xs text-zinc-500">Select a pre-built voice model for the AI.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Keyboard className="w-4 h-4" />
              Push-to-Talk Hotkey
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setIsRecordingKey(true)}
                className={`flex-1 bg-zinc-950 border ${isRecordingKey ? 'border-emerald-500 text-emerald-400' : 'border-zinc-800 text-zinc-300'} rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors`}
              >
                {isRecordingKey ? 'Press any key...' : `Key: ${pttKey.toUpperCase()}`}
              </button>
              <select
                value={pttMode}
                onChange={(e) => setPttMode(e.target.value as 'hold' | 'toggle')}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                <option value="hold">Hold</option>
                <option value="toggle">Toggle</option>
              </select>
            </div>
            <p className="text-xs text-zinc-500">Note: Browser must be focused to detect the hotkey.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Gamepad className="w-4 h-4" />
              Game Name
            </label>
            <input
              type="text"
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              placeholder="e.g., Minecraft, Portal 2, Elden Ring"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
            <p className="text-xs text-zinc-500">Helps the AI understand what it's looking at.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <User className="w-4 h-4" />
              Character Persona
            </label>
            <textarea
              value={characterInfo}
              onChange={(e) => setCharacterInfo(e.target.value)}
              placeholder="You are a helpful but slightly sarcastic AI assistant..."
              className="w-full h-32 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Game Knowledge / Training
            </label>
            <textarea
              value={gameKnowledge}
              onChange={(e) => setGameKnowledge(e.target.value)}
              placeholder="Paste game rules, lore, or specific instructions here..."
              className="w-full h-32 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
            />
          </div>
        </div>

        {/* Save/Delete Actions */}
        <div className="flex gap-2 pt-4 border-t border-zinc-800">
          <button
            onClick={handleSaveProfile}
            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save
          </button>
          {activeProfileId && (
            <button
              onClick={handleDeleteProfile}
              className="bg-red-950/30 hover:bg-red-900/50 text-red-400 border border-red-900/50 rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center justify-center"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Right Panel: Main View */}
      <div className="flex-1 p-6 flex flex-col gap-6">
        {/* Controls */}
        <div className="flex flex-wrap gap-4 items-center justify-between bg-zinc-900 p-4 rounded-2xl border border-zinc-800">
          <div className="flex gap-4">
            <button
              onClick={isCapturing ? stopCapture : startCapture}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
                isCapturing 
                  ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' 
                  : 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400'
              }`}
            >
              <Monitor className="w-5 h-5" />
              {isCapturing ? 'Stop Screen Share' : 'Share Screen'}
            </button>

            <button
              onClick={toggleConnection}
              disabled={isConnecting || (!isConnected && !isCapturing)}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
                (!isConnected && !isCapturing)
                  ? 'bg-zinc-800/50 text-zinc-500 cursor-not-allowed'
                  : isConnected
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'bg-indigo-500 text-white hover:bg-indigo-400'
              }`}
            >
              {isConnected ? <Square className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
              {isConnecting ? 'Connecting...' : isConnected ? 'Disconnect AI' : 'Start AI Companion'}
            </button>
          </div>

          {/* Status Indicators */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isCapturing ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-zinc-600'}`} />
              <span className="text-zinc-400">Screen</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'bg-zinc-600'}`} />
              <span className="text-zinc-400">AI Active</span>
            </div>
            <div className="flex items-center gap-2">
              {isMicActive ? (
                isTalking ? <Mic className="w-4 h-4 text-emerald-500" /> : <MicOff className="w-4 h-4 text-yellow-500" />
              ) : (
                <MicOff className="w-4 h-4 text-zinc-600" />
              )}
              <span className="text-zinc-400">
                {isMicActive ? (isTalking ? 'Mic (Live)' : 'Mic (Muted)') : 'Mic'}
              </span>
            </div>
          </div>
        </div>

        {/* Video Preview */}
        <div className="flex-1 bg-black rounded-2xl border border-zinc-800 overflow-hidden relative flex items-center justify-center">
          {!isCapturing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 gap-4">
              <Monitor className="w-16 h-16 opacity-20" />
              <p>Click "Share Screen" to select a game window</p>
            </div>
          )}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-contain ${!isCapturing ? 'hidden' : ''}`}
          />
          {/* Hidden canvas for frame extraction */}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Captions Box */}
        <div className="h-48 bg-zinc-900 rounded-2xl border border-zinc-800 p-4 flex flex-col shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Live Captions
            </h3>
            <button
              onClick={() => setCaptions('')}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="flex-1 overflow-y-auto font-mono text-sm text-zinc-400 whitespace-pre-wrap mb-3">
            {captions || <span className="opacity-50 italic">Waiting for AI to speak...</span>}
            <div ref={captionsEndRef} />
          </div>
          
          {/* Text Input for Chatting */}
          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && chatInput.trim() && isConnected) {
                  sendText(chatInput.trim());
                  setCaptions(prev => prev + `\n\nYou: ${chatInput.trim()}\n\n`);
                  setChatInput('');
                }
              }}
              placeholder={isConnected ? "Type a message to the AI..." : "Connect to chat..."}
              disabled={!isConnected}
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-50"
            />
            <button
              onClick={() => {
                if (chatInput.trim() && isConnected) {
                  sendText(chatInput.trim());
                  setCaptions(prev => prev + `\n\nYou: ${chatInput.trim()}\n\n`);
                  setChatInput('');
                }
              }}
              disabled={!isConnected || !chatInput.trim()}
              className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg px-4 py-2 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
