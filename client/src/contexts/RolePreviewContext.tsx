import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth, UserRole } from "@/hooks/useAuth";

interface RolePreviewContextType {
  previewRole: UserRole | null;
  setPreviewRole: (role: UserRole | null) => void;
  effectiveRole: UserRole | undefined;
  isPreviewing: boolean;
  originalRole: UserRole | undefined;
  isDevMode: boolean;
}

const RolePreviewContext = createContext<RolePreviewContextType | undefined>(undefined);

interface RolePreviewProviderProps {
  children: ReactNode;
}

export function RolePreviewProvider({ children }: RolePreviewProviderProps) {
  const { user } = useAuth();
  const [previewRole, setPreviewRoleState] = useState<UserRole | null>(null);
  const isDevMode = import.meta.env.DEV;

  // Initialize from localStorage on mount
  useEffect(() => {
    if (isDevMode) {
      const stored = localStorage.getItem('rolePreview');
      if (stored && ['admin', 'manager', 'staff', 'vendor'].includes(stored)) {
        setPreviewRoleState(stored as UserRole);
      }
    }
  }, [isDevMode]);

  // Persist to localStorage and update state
  const setPreviewRole = (role: UserRole | null) => {
    if (isDevMode) {
      if (role) {
        localStorage.setItem('rolePreview', role);
      } else {
        localStorage.removeItem('rolePreview');
      }
    }
    setPreviewRoleState(role);
  };

  const effectiveRole = isDevMode && previewRole ? previewRole : user?.role;
  const isPreviewing = isDevMode && previewRole !== null;

  const value: RolePreviewContextType = {
    previewRole,
    setPreviewRole,
    effectiveRole,
    isPreviewing,
    originalRole: user?.role,
    isDevMode,
  };

  return (
    <RolePreviewContext.Provider value={value}>
      {children}
    </RolePreviewContext.Provider>
  );
}

export function useRolePreview(): RolePreviewContextType {
  const context = useContext(RolePreviewContext);
  if (context === undefined) {
    throw new Error('useRolePreview must be used within a RolePreviewProvider');
  }
  return context;
}