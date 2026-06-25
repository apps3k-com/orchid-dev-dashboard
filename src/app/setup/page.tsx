import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isConfigured } from "@/server/config";
import { appUrl } from "@/server/env";
import { buildAppManifest } from "@/server/github/manifest";

export const dynamic = "force-dynamic";

/**
 * First-run onboarding. If the GitHub App is not configured, render a form that POSTs a
 * manifest to GitHub so the user creates the App in one click; GitHub redirects back to
 * /setup/callback which stores the credentials. If already configured, point onward.
 */
export default async function SetupPage() {
  const configured = await isConfigured();
  const manifest = buildAppManifest(appUrl(), "Orchid Dashboard");

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 items-center px-6 py-16">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Set up Orchid</CardTitle>
          <CardDescription>
            Orchid talks to GitHub through a GitHub App that you own. Create it once, then
            install it on the organization(s) you want to manage.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {configured ? (
            <p>
              Your GitHub App is configured. Install it on more organizations any time, or
              continue to sign in.
            </p>
          ) : (
            <ol className="list-decimal space-y-2 pl-5">
              <li>Create the GitHub App from the prefilled manifest.</li>
              <li>Install it on your organization(s).</li>
              <li>Sign in with GitHub to open the dashboard.</li>
            </ol>
          )}
        </CardContent>
        <CardFooter>
          {configured ? (
            <Button asChild>
              <Link href="/login">Continue to sign in</Link>
            </Button>
          ) : (
            <form method="post" action="https://github.com/settings/apps/new">
              <input type="hidden" name="manifest" value={JSON.stringify(manifest)} />
              <Button type="submit">Create GitHub App</Button>
            </form>
          )}
        </CardFooter>
      </Card>
    </main>
  );
}
