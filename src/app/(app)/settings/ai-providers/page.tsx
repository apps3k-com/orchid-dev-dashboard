import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProviderKeyForm } from "@/components/provider-key-form";
import { requireUser } from "@/server/auth/require";
import { isLlmAdmin } from "@/server/llm/admin";
import { getProviderKeySummaries } from "@/server/llm/keys";

export const dynamic = "force-dynamic";

/** Badge variants for persisted provider-key validation states. */
const STATUS_VARIANT: Record<string, "secondary" | "destructive" | "outline"> = {
  valid: "secondary",
  invalid: "destructive",
  unchecked: "outline",
  "not configured": "outline",
};

/** BYOK provider keys for the agent & hook auditor. Keys are encrypted at rest; only LLM admins
 *  (env `ORCHID_LLM_ADMINS`) can add/replace them. Non-admins see the masked status read-only. */
export default async function AiProvidersPage() {
  const user = await requireUser();
  const admin = isLlmAdmin(user.login);
  const summaries = await getProviderKeySummaries();

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
              <CardTitle className="flex items-center justify-between gap-2">
                <span>{provider.label}</span>
                <Badge variant={STATUS_VARIANT[provider.status] ?? "outline"}>
                  {provider.status}
                </Badge>
              </CardTitle>
              <CardDescription>
                {provider.configured
                  ? `Key ending ${provider.maskedHint} · model ${provider.selectedModel}`
                  : "No key configured."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {admin ? (
                <ProviderKeyForm
                  provider={provider.provider}
                  models={provider.models}
                  defaultModel={provider.selectedModel ?? provider.defaultModel}
                  configured={provider.configured}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Only an LLM admin can change this key.
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
