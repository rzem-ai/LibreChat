import { useState } from 'react';

const STORAGE_KEY = 'expiringPopupLastShownDate';

function getLocalDateKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Gates the expiring-items popup to once per local calendar day. */
export function useDailyPopupGate(): { alreadyShownToday: boolean; markShownToday: () => void } {
  const [alreadyShownToday] = useState(
    () => localStorage.getItem(STORAGE_KEY) === getLocalDateKey(),
  );

  const markShownToday = () => {
    localStorage.setItem(STORAGE_KEY, getLocalDateKey());
  };

  return { alreadyShownToday, markShownToday };
}
