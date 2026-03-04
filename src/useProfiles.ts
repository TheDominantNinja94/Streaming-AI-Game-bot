import { useState, useEffect } from 'react';
import { Profile } from './types';

const STORAGE_KEY = 'game-ai-profiles';

export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setProfiles(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse profiles', e);
      }
    }
  }, []);

  const saveProfile = (profile: Profile) => {
    const existingIndex = profiles.findIndex(p => p.id === profile.id);
    let newProfiles;
    if (existingIndex >= 0) {
      newProfiles = [...profiles];
      newProfiles[existingIndex] = profile;
    } else {
      newProfiles = [...profiles, profile];
    }
    setProfiles(newProfiles);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newProfiles));
  };

  const deleteProfile = (id: string) => {
    const newProfiles = profiles.filter(p => p.id !== id);
    setProfiles(newProfiles);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newProfiles));
  };

  return { profiles, saveProfile, deleteProfile };
}
