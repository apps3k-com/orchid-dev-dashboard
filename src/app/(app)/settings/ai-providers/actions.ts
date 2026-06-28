"use server";

import { getSessionUser } from "@/server/auth/session";
import { isLlmAdmin } from "@/server/llm/admin";
import { saveProviderKey } from "@/server/llm/keys";
import { isProviderId } from "@/server/llm/providers";
import { briefError } from "@/server/log";

/** Result of {@link saveProviderKeyAction}, surfaced inline in the provider key form. */
export type SaveKeyState = { ok: boolean; message: string };

/** Server action: validate + store a BYOK provider key. Gated to LLM admins (it persists a secret
 *  that can spend the team's tokens). The key is validated with a free test call before storage. */
export async function saveProviderKeyAction(
  _prev: SaveKeyState,
  formData: FormData,
): Promise<SaveKeyState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Not signed in." };
  if (!isLlmAdmin(user.login)) {
    return { ok: false, message: "Only an LLM admin can manage provider keys." };
  }

  const provider = String(formData.get("provider") ?? "");
  const model = String(formData.get("model") ?? "");
  const apiKey = String(formData.get("apiKey") ?? "");
  if (!isProviderId(provider)) return { ok: false, message: "Unknown provider." };

  try {
    const result = await saveProviderKey(provider, apiKey, model);
    if (!result.ok) return { ok: false, message: result.error ?? "Could not save the key." };
    return { ok: true, message: "Key validated and saved." };
  } catch (error) {
    console.warn("saveProviderKeyAction failed", briefError(error));
    return { ok: false, message: "Could not save the key — please try again." };
  }
}
