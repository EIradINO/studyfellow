'use client';

import { useLayout } from './context/LayoutContext';
import Navigation from './components/Navigation';
import { ReactNode } from 'react';

export default function ClientLayout({ children }: { children: ReactNode }) {
  const { navWidth } = useLayout();

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation />
      <main
        className="flex-1 transition-all duration-300 ease-in-out"
        style={{ marginLeft: `${navWidth}px` }}
      >
        {children}
      </main>
    </div>
  );
} 