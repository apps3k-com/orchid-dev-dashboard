import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { isConfigured } from "@/server/config";
import { getSessionUser } from "./session";

/**
 * Guard for protected server components: redirect to /setup when the GitHub App is not
 * configured yet, to /login when there is no session, otherwise return the signed-in user.
 */
export async function requireUser(): Promise<User> {
  if (!(await isConfigured())) redirect("/setup");
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
