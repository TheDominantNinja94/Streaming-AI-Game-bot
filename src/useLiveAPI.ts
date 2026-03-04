import { useState, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export function useLiveAPI() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const bcRef = useRef<BroadcastChannel | null>(null);

  const updateTalkingState = useCallback(() => {
    if (!bcRef.current) {
      bcRef.current = new BroadcastChannel('obs_overlay');
    }
    const isTalking = activeSourcesRef.current.length > 0;
    bcRef.current.postMessage({ isTalking });
  }, []);

  const connect = useCallback(async (systemInstruction: string, voiceName: string, onCaption?: (text: string) => void) => {
    setIsConnecting(true);
    try {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      nextPlayTimeRef.current = audioContextRef.current.currentTime;

      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          systemInstruction,
          outputAudioTranscription: {},
          tools: [{ googleSearch: {} }],
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setIsConnecting(false);
          },
          onmessage: async (message: LiveServerMessage) => {
            const parts = message.serverContent?.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.text && onCaption) {
                  onCaption(part.text);
                }
                if (part.inlineData?.data) {
                  const base64Audio = part.inlineData.data;
                  const binaryString = atob(base64Audio);
                  const bytes = new Uint8Array(binaryString.length);
                  for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                  }
                  const pcmData = new Int16Array(bytes.buffer);
                  const floatData = new Float32Array(pcmData.length);
                  for (let i = 0; i < pcmData.length; i++) {
                    floatData[i] = pcmData[i] / 32768.0;
                  }
                  
                  const audioContext = audioContextRef.current;
                  if (audioContext) {
                    const audioBuffer = audioContext.createBuffer(1, floatData.length, 24000);
                    audioBuffer.getChannelData(0).set(floatData);

                    const source = audioContext.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(audioContext.destination);

                    const currentTime = audioContext.currentTime;
                    // Add a tiny 50ms buffer if we are starting fresh to prevent immediate underrun
                    if (nextPlayTimeRef.current < currentTime) {
                      nextPlayTimeRef.current = currentTime + 0.05;
                    }

                    source.start(nextPlayTimeRef.current);
                    nextPlayTimeRef.current += audioBuffer.duration;

                    source.onended = () => {
                      activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
                      updateTalkingState();
                    };
                    activeSourcesRef.current.push(source);
                    updateTalkingState();
                  }
                }
              }
            }
            if (message.serverContent?.interrupted) {
              activeSourcesRef.current.forEach(s => {
                try { s.stop(); } catch (e) {}
              });
              activeSourcesRef.current = [];
              updateTalkingState();
              nextPlayTimeRef.current = audioContextRef.current?.currentTime || 0;
              if (onCaption) onCaption('\n[Interrupted]\n');
            }
            if (message.serverContent?.turnComplete && onCaption) {
              onCaption('\n\n');
            }
          },
          onclose: () => {
            setIsConnected(false);
            setIsConnecting(false);
            sessionRef.current = null;
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            setIsConnected(false);
            setIsConnecting(false);
          }
        }
      });

      sessionRef.current = sessionPromise;
      await sessionPromise;

    } catch (err) {
      console.error("Failed to connect:", err);
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.then((session: any) => session.close());
      sessionRef.current = null;
    }
    activeSourcesRef.current.forEach(s => {
      try { s.stop(); } catch (e) {}
    });
    activeSourcesRef.current = [];
    updateTalkingState();
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const sendFrame = useCallback(async (base64Data: string) => {
    if (sessionRef.current && isConnected) {
      const session = await sessionRef.current;
      const b64 = base64Data.split(',')[1];
      if (b64) {
        session.sendRealtimeInput({
          media: {
            mimeType: "image/jpeg",
            data: b64
          }
        });
      }
    }
  }, [isConnected]);

  const sendAudio = useCallback(async (base64Data: string) => {
    if (sessionRef.current && isConnected) {
      const session = await sessionRef.current;
      session.sendRealtimeInput({
        media: {
          mimeType: "audio/pcm;rate=16000",
          data: base64Data
        }
      });
    }
  }, [isConnected]);

  const sendText = useCallback(async (text: string) => {
    if (sessionRef.current && isConnected) {
      const session = await sessionRef.current;
      session.sendClientContent({ turns: text, turnComplete: true });
    }
  }, [isConnected]);

  return { isConnected, isConnecting, connect, disconnect, sendFrame, sendAudio, sendText, sessionRef };
}
