import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ProviderKeys } from "@/components/provider-keys";
import { ProviderSettingsForm } from "@/components/provider-settings-form";
import { requireUser } from "@/server/auth/require";
import { isLlmAdmin } from "@/server/llm/admin";
import { getProviderSummaries } from "@/server/llm/keys";

export const dynamic = "force-dynamic";

/** Badge variants for a key's validation status. */
const STATUS_VARIANT: Record<string, "secondary" | "destructive" | "outline"> = {
  valid: "secondary",
  invalid: "destructive",
  rate_limited: "outline",
  unchecked: "outline",
};

/** BYOK provider settings for the agent & hook auditor. Per provider: a default model (saved
 *  separately from any key — item 7) and a set of labelled keys (item 8). Keys are encrypted at rest
 *  and only the last 4 characters are shown. Only LLM admins (env `ORCHID_LLM_ADMINS`) can change the
 *  model/keys; everyone else sees a read-only masked view. */
export default async function AiProvidersPage() {
  const user = await requireUser();
  const admin = isLlmAdmin(user.login);
  const summaries = await getProviderSummaries();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI providers</h1>
        <p className="text-sm text-muted-foreground">
          Bring-your-own-key credentials for the agent &amp; hook auditor. Keys are encrypted at rest
          and only the last 4 characters are ever shown.
          {admin ? "" : " Managed by an LLM admin."}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {summaries.map((provider) => (
          <Card key={provider.provider}>
            <CardHeader>
              <CardTitle>{provider.label}</CardTitle>
              <CardDescription>
                {provider.keys.length === 0
                  ? "No keys configured."
                  : `${provider.keys.length} key${provider.keys.length === 1 ? "" : "s"} · default model ${provider.defaultModel}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {admin ? (
                <>
                  <ProviderSettingsForm
                    provider={provider.provider}
                    models={provider.models}
                    defaultModel={provider.defaultModel}
                  />
                  <Separator />
                  <ProviderKeys provider={provider.provider} keys={provider.keys} />
                </>
              ) : provider.keys.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No keys configured. Managed by an LLM admin.
                </p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {provider.keys.map((k) => (
                    <li key={k.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{k.label}</span>
                      {k.isDefault ? <Badge variant="secondary">default</Badge> : null}
                      <Badge variant={STATUS_VARIANT[k.status] ?? "outline"}>{k.status}</Badge>
                      <code className="text-xs text-muted-foreground">{k.maskedHint}</code>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
