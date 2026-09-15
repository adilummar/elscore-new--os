"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

export async function login(prevState: any, formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  if (!email || !password) {
    return { error: "Email and password are required." }
  }

  try {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
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

    const { accessToken, refreshToken, requiresPasswordChange } = data

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

    if (requiresPasswordChange) {
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

  if (refreshToken && accessToken) {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
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

  try {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
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
