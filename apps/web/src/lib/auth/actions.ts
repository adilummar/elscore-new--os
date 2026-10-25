"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { ApiUrlNotConfiguredError, resolveServerApiUrl } from "@/lib/api/server-api-url"

function readApiBase(): string | null {
  try {
    return resolveServerApiUrl()
  } catch (error) {
    if (error instanceof ApiUrlNotConfiguredError) {
      console.error("[CONFIG ERROR] API_URL is missing.")
      return null
    }
    throw error
  }
}

export async function login(prevState: any, formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  if (!email || !password) {
    return { error: "Email and password are required." }
  }

  const apiBase = readApiBase()
  if (!apiBase) {
    return { error: "Unable to sign in because the service is not configured." }
  }

  try {
    const res = await fetch(`${apiBase}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      // LocalAuthGuard usually expects username and password
      body: JSON.stringify({ username: email, email, password }),
    })

    const data = await res.json()

    if (!res.ok) {
      return { error: data.message || "Invalid credentials" }
    }

    const { accessToken, refreshToken, mustChangePassword } = data

    const cookieStore = cookies()
    // Secure cookies in production
    const isProd = process.env.NODE_ENV === "production"

    cookieStore.set("accessToken", accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 15, // 15 mins
    })

    cookieStore.set("refreshToken", refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    })

    if (mustChangePassword) {
      redirect("/setup-password")
    } else {
      redirect("/dashboard")
    }
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") {
      throw error // Re-throw Next.js redirects
    }
    return { error: "Network error or server unavailable." }
  }
}

export async function logout() {
  const cookieStore = cookies()
  const refreshToken = cookieStore.get("refreshToken")?.value
  const accessToken = cookieStore.get("accessToken")?.value

  const apiBase = readApiBase()
  if (refreshToken && accessToken && apiBase) {
    try {
      await fetch(`${apiBase}/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ refreshToken }),
      })
    } catch (e) {
      // Ignore network errors on logout
    }
  }

  cookieStore.delete("accessToken")
  cookieStore.delete("refreshToken")
  redirect("/login")
}

export async function getSession() {
  const cookieStore = cookies()
  const accessToken = cookieStore.get("accessToken")?.value

  if (!accessToken) {
    return null
  }

  const apiBase = readApiBase()
  if (!apiBase) {
    return null
  }

  try {
    const res = await fetch(`${apiBase}/auth/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!res.ok) {
      return null
    }

    const user = await res.json()
    return user
  } catch (e) {
    return null
  }
}
