import { redirect } from "next/navigation";
import { getSession } from "@/lib/api/auth";

export default async function HomePage() {
  const user = await getSession();

  if (!user) {
    redirect("/login");
  }

  // Redirect based on permissions
  const perms = user.permissions || [];
  
  if (perms.includes('analytics.ceo.read')) {
    redirect("/dashboard");
  } else if (perms.includes('lead.read') || perms.includes('lead.read-all')) {
    redirect("/dashboard");
  } else if (perms.includes('demo.read') || perms.includes('demo.read_own')) {
    redirect("/demos");
  } else if (perms.includes('employee.read')) {
    redirect("/settings/employees");
  } else {
    redirect("/settings/profile");
  }
}
