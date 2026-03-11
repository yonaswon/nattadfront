'use client';

import { ThemeProvider } from './components/ThemeProvider';
import Navbar from './components/Navbar';
import { ReactNode } from 'react';

export default function ClientLayout({ children }: { children: ReactNode }) {
    return (
        <ThemeProvider>
            <Navbar />
            <main className="main-content">
                {children}
            </main>
        </ThemeProvider>
    );
}
