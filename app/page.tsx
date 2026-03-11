'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from './api';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await api.get('/auth/status/');
        if (res.data.authenticated) {
          router.push('/channels');
        } else {
          router.push('/login');
        }
      } catch {
        router.push('/login');
      }
    };
    checkAuth();
  }, [router]);

  return (
    <div className="page-loading">
      <div className="spinner"></div>
      <p>Checking authentication...</p>
    </div>
  );
}
