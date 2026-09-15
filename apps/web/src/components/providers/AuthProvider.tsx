"use client"

import React, { createContext, useContext } from "react"

export interface User {
  id: string
  email: string
  roles: string[]
  permissions: string[]
}

interface AuthContextType {
  user: User | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ user, children }: { user: User | null; children: React.ReactNode }) {
  return <AuthContext.Provider value={{ user }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

export function usePermissions() {
  const { user } = useAuth()

  const hasPermission = (permission: string) => {
    return user?.permissions?.includes(permission) ?? false
  }

  const hasAnyPermission = (permissions: string[]) => {
    return permissions.some(hasPermission)
  }

  const hasAllPermissions = (permissions: string[]) => {
    return permissions.every(hasPermission)
  }

  return { hasPermission, hasAnyPermission, hasAllPermissions }
}
