import { useEffect, useState } from 'react';

function getHash(): string {
  try {
    return decodeURIComponent(location.hash.replace(/^#/, '')) || '/';
  } catch {
    return '/';
  }
}

export function useHash(): string {
  const [hash, setHash] = useState(getHash);
  useEffect(() => {
    const fn = () => setHash(getHash());
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  return hash;
}

export function nav(to: string) {
  location.hash = to;
}
