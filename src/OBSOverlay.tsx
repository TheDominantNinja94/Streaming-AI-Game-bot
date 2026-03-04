import React, { useEffect, useState } from 'react';

const RobotAvatar = ({ isTalking }: { isTalking: boolean }) => (
  <svg width="300" height="300" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Body */}
    <rect x="50" y="80" width="100" height="120" rx="20" fill="#27272a" stroke="#10b981" strokeWidth="4"/>
    {/* Head */}
    <rect x="40" y="20" width="120" height="80" rx="16" fill="#27272a" stroke="#10b981" strokeWidth="4"/>
    {/* Antenna */}
    <line x1="100" y1="20" x2="100" y2="0" stroke="#10b981" strokeWidth="4"/>
    <circle cx="100" cy="0" r="6" fill="#10b981"/>
    {/* Eyes */}
    <circle cx="70" cy="50" r="10" fill={isTalking ? "#10b981" : "#52525b"} className="transition-colors duration-200"/>
    <circle cx="130" cy="50" r="10" fill={isTalking ? "#10b981" : "#52525b"} className="transition-colors duration-200"/>
    {/* Mouth */}
    {isTalking ? (
      <rect x="80" y="70" width="40" height="10" rx="5" fill="#10b981" className="animate-pulse"/>
    ) : (
      <line x1="80" y1="75" x2="120" y2="75" stroke="#52525b" strokeWidth="4" strokeLinecap="round"/>
    )}
  </svg>
);

export function OBSOverlay() {
  const [isTalking, setIsTalking] = useState(false);

  useEffect(() => {
    // Listen for messages from the main app tab
    const bc = new BroadcastChannel('obs_overlay');
    bc.onmessage = (event) => {
      if (event.data && typeof event.data.isTalking === 'boolean') {
        setIsTalking(event.data.isTalking);
      }
    };

    return () => {
      bc.close();
    };
  }, []);

  return (
    <div className="w-screen h-screen overflow-hidden flex items-end justify-center pb-0 bg-transparent">
      <div 
        className={`transition-transform duration-500 ease-in-out transform ${isTalking ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ filter: isTalking ? 'drop-shadow(0 0 20px rgba(16, 185, 129, 0.4))' : 'none' }}
      >
        <RobotAvatar isTalking={isTalking} />
      </div>
    </div>
  );
}
