import { redirect } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSessionUser } from "@/server/auth/session";
import { isConfigured } from "@/server/config";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  state: "Sign-in failed a security check. Please try again.",
  not_member: "You must be a member of an organization that Orchid manages.",
};

/** Sign-in page. Redirects to /setup if unconfigured, or to /command if already signed in. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!(await isConfigured())) redirect("/setup");
  if (await getSessionUser()) redirect("/command");
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 items-center px-6 py-16">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Sign in to Orchid</CardTitle>
          <CardDescription>Use your GitHub account (members of a managed org only).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && ERRORS[error] ? (
            <Alert variant="destructive">
              <AlertTitle>Can&apos;t sign in</AlertTitle>
              <AlertDescription>{ERRORS[error]}</AlertDescription>
            </Alert>
          ) : null}
          <Button asChild className="w-full">
            <a href="/api/auth/login">Sign in with GitHub</a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
