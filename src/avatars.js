// Offline Studio Profile Avatar Library (8 crisp vector SVG portraits for the booth leaderboard).

export const AVATARS = [
  {
    id: 'operator',
    label: 'OPERATOR',
    bg: '#1c2336',
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" fill="#1c2336"/>
      <circle cx="32" cy="24" r="11" fill="#efe2c8"/>
      <path d="M16 56c0-10 7-16 16-16s16 6 16 16" fill="#d4a259"/>
      <path d="M18 24c0-9 6-14 14-14s14 5 14 14" fill="none" stroke="#8b7cff" stroke-width="4"/>
      <rect x="14" y="21" width="6" height="11" rx="2" fill="#efe2c8"/>
      <rect x="44" y="21" width="6" height="11" rx="2" fill="#efe2c8"/>
      <rect x="25" y="21" width="14" height="5" rx="2" fill="#0a0b10"/>
      <circle cx="28.5" cy="23.5" r="1.3" fill="#39d5ff"/>
      <circle cx="35.5" cy="23.5" r="1.3" fill="#39d5ff"/>
    </svg>`,
  },
  {
    id: 'padlock',
    label: 'LOCKSMITH',
    bg: '#2b1d17',
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" fill="#2b1d17"/>
      <path d="M22 28v-7a10 10 0 0 1 20 0v7" fill="none" stroke="#efe2c8" stroke-width="5" stroke-linecap="round"/>
      <rect x="15" y="27" width="34" height="26" rx="5" fill="#d4a259"/>
      <circle cx="32" cy="39" r="5" fill="#141319"/>
      <path d="M30 41h4l1 7h-6z" fill="#141319"/>
    </svg>`,
  },
  {
    id: 'vinyl',
    label: 'DJ VINYL',
    bg: '#1c192b',
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" fill="#1c192b"/>
      <circle cx="32" cy="32" r="22" fill="#11121a" stroke="#efe2c8" stroke-width="2"/>
      <circle cx="32" cy="32" r="16" fill="none" stroke="#8b7cff" stroke-width="1.5" stroke-dasharray="14 8"/>
      <circle cx="32" cy="32" r="8" fill="#d4a259"/>
      <circle cx="32" cy="32" r="2.5" fill="#11121a"/>
    </svg>`,
  },
  {
    id: 'camera',
    label: 'DIRECTOR',
    bg: '#162428',
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" fill="#162428"/>
      <rect x="13" y="21" width="38" height="26" rx="4" fill="#2b303f" stroke="#efe2c8" stroke-width="2"/>
      <circle cx="32" cy="34" r="9" fill="#0a0b10" stroke="#d4a259" stroke-width="2.5"/>
      <circle cx="34" cy="32" r="3" fill="#39d5ff"/>
      <circle cx="44" cy="26" r="2.5" fill="#ff4d3d"/>
      <rect x="23" y="15" width="18" height="6" rx="2" fill="#efe2c8"/>
    </svg>`,
  },
  {
    id: 'onair',
    label: 'ON AIR',
    bg: '#2b161b',
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" fill="#2b161b"/>
      <rect x="25" y="14" width="14" height="22" rx="7" fill="#efe2c8"/>
      <path d="M19 30a13 13 0 0 0 26 0" fill="none" stroke="#ff4d3d" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M32 43v8M24 51h16" stroke="#d4a259" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="48" cy="16" r="4" fill="#ff4d3d"/>
    </svg>`,
  },
  {
    id: 'synth',
    label: 'SYNTHWAVE',
    bg: '#1a1b2e',
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" fill="#1a1b2e"/>
      <circle cx="32" cy="30" r="16" fill="#d4a259"/>
      <rect x="14" y="31" width="36" height="3" fill="#1a1b2e"/>
      <rect x="14" y="37" width="36" height="3.5" fill="#1a1b2e"/>
      <rect x="14" y="43" width="36" height="4" fill="#1a1b2e"/>
      <path d="M12 49h40" stroke="#8b7cff" stroke-width="3"/>
    </svg>`,
  },
  {
    id: 'speaker',
    label: 'BASSHEAD',
    bg: '#182124',
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" fill="#182124"/>
      <rect x="17" y="11" width="30" height="42" rx="4" fill="#232634" stroke="#efe2c8" stroke-width="2"/>
      <circle cx="32" cy="21" r="4.5" fill="#d4a259"/>
      <circle cx="32" cy="38" r="10" fill="#10121a" stroke="#39d5ff" stroke-width="2.5"/>
      <circle cx="32" cy="38" r="4" fill="#efe2c8"/>
    </svg>`,
  },
  {
    id: 'ace',
    label: 'ACE PICK',
    bg: '#241e14',
    svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" fill="#241e14"/>
      <path d="M16 24l7 10 9-14 9 14 7-10-4 22H20z" fill="#d4a259" stroke="#efe2c8" stroke-width="2" stroke-linejoin="round"/>
      <rect x="20" y="48" width="24" height="5" rx="2" fill="#efe2c8"/>
    </svg>`,
  },
];

export function getAvatar(idOrIndex) {
  if (typeof idOrIndex === 'number') return AVATARS[((idOrIndex % AVATARS.length) + AVATARS.length) % AVATARS.length];
  return AVATARS.find((a) => a.id === idOrIndex) || AVATARS[0];
}
