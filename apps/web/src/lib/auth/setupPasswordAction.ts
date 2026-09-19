"use server"

import { redirect } from "next/navigation"
import { fetchApi } from "@/lib/api/client"

export async function setupPassword(prevState: any, formData: FormData) {
  const oldPassword = formData.get("currentPassword") as string
  const newPassword = formData.get("newPassword") as string
  const confirmPassword = formData.get("confirmPassword") as string

  if (!oldPassword || !newPassword || !confirmPassword) {
    return { error: "All fields are required." }
  }

  if (newPassword !== confirmPassword) {
    return { error: "New passwords do not match." }
  }

  try {
    await fetchApi("/users/me/change-password", {
      method: "POST",
      body: JSON.stringify({ oldPassword, newPassword }),
    })
  } catch (error: any) {
    return { error: error.message || "Failed to change password." }
  }

  // After successful password change, navigate to dashboard
  redirect("/dashboard")
}
