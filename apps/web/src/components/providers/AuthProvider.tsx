"use client";

import React, { createContext, useContext, useState } from "react";
import { GodViewUserPicker } from "@/components/god-view/GodViewUserPicker";

export interface User {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
}

export interface GodViewUser {
  id: string;
  email: string;
  displayName?: string;
  roles: string[];
  permissions: string[];
}

interface AuthContextType {
  user: User | null;
  /** The effective user for UI rendering — either the real user or the God View target */
  effectiveUser: User | GodViewUser | null;
  isInGodView: boolean;
  /** CEO in God View can make changes; read-only viewers cannot */
  canActInGodView: boolean;
  godViewUser: GodViewUser | null;
  allUsers: any[];
  openGodViewPicker: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  user: User | null;
  godViewUser?: GodViewUser | null;
  allUsers?: any[];
  children: React.ReactNode;
}

export function AuthProvider({ user, godViewUser, allUsers = [], children }: AuthProviderProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const isInGodView = !!godViewUser;
  // CEO can act in God View; any other role is read-only
  const canActInGodView = isInGodView && (user?.permissions?.includes('analytics.ceo.read') ?? false);

  const effectiveUser = isInGodView
    ? { ...godViewUser, id: godViewUser!.id } as GodViewUser
    : user;

  const value: AuthContextType = {
    user,
    effectiveUser,
    isInGodView,
    canActInGodView,
    godViewUser: godViewUser ?? null,
    allUsers,
    openGodViewPicker: () => setPickerOpen(true),
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {/* God View picker modal — only visible to CEO/analytics.ceo.read */}
      {pickerOpen && (
        <GodViewUserPicker
          isOpen={pickerOpen}
          onClose={() => setPickerOpen(false)}
          users={allUsers}
        />
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function usePermissions() {
  const { effectiveUser, isInGodView, canActInGodView } = useAuth();

  const hasPermission = (permission: string) => {
    // In God View, permissions come from the target user
    return effectiveUser?.permissions?.includes(permission) ?? false;
  };

  const hasAnyPermission = (permissions: string[]) => {
    return permissions.some(hasPermission);
  };

  const hasAllPermissions = (permissions: string[]) => {
    return permissions.every(hasPermission);
  };

  return { hasPermission, hasAnyPermission, hasAllPermissions, isInGodView, canActInGodView };
}
