"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

export async function setupPassword(prevState: any, formData: FormData) {
  const currentPassword = formData.get("currentPassword") as string
  const newPassword = formData.get("newPassword") as string
  const confirmPassword = formData.get("confirmPassword") as string

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: "All fields are required." }
  }

  if (newPassword !== confirmPassword) {
    return { error: "New passwords do not match." }
  }

  const cookieStore = cookies()
  const accessToken = cookieStore.get("accessToken")?.value

  if (!accessToken) {
    return { error: "Session expired. Please log in again." }
  }

  try {
    const res = await fetch(`${API_BASE_URL}/users/me/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    })

    const data = await res.json().catch(() => null)

    if (!res.ok) {
      return { error: data?.message || "Failed to change password." }
    }

    // Password changed successfully, we can redirect to dashboard
  } catch (error) {
    return { error: "Network error or server unavailable." }
  }

  // After successful password change, navigate to dashboard
  redirect("/dashboard")
}
