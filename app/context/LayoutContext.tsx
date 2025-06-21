'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface LayoutContextType {
  isNavCollapsed: boolean;
  toggleNav: () => void;
  navWidth: number;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export const useLayout = () => {
  const context = useContext(LayoutContext);
  if (context === undefined) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
};

export const LayoutProvider = ({ children }: { children: ReactNode }) => {
  const [isNavCollapsed, setIsNavCollapsed] = useState(true); // Default to collapsed

  const toggleNav = () => {
    setIsNavCollapsed(!isNavCollapsed);
  };
  
  const navWidth = isNavCollapsed ? 80 : 240;

  return (
    <LayoutContext.Provider value={{ isNavCollapsed, toggleNav, navWidth }}>
      {children}
    </LayoutContext.Provider>
  );
}; 