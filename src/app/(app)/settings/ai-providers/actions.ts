"use server";

import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/server/auth/session";
import { isLlmAdmin } from "@/server/llm/admin";
import {
  addProviderKey,
  removeProviderKey,
  replaceProviderKey,
  saveProviderSettings,
  setDefaultProviderKey,
} from "@/server/llm/keys";
import { isProviderId } from "@/server/llm/providers";
import { briefError } from "@/server/log";

/** Result of a provider settings/key action, surfaced inline in the relevant form. */
export type ProviderActionState = { ok: boolean; message: string };

/** Gate every provider action to a signed-in LLM admin (keys can spend the team's tokens). */
async function adminGate(): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Not signed in." };
  if (!isLlmAdmin(user.login)) {
    return { ok: false, message: "Only an LLM admin can manage provider keys." };
  }
  return { ok: true };
}

/** Server action: save a provider's default model (item 7 — no key required). */
export async function saveProviderSettingsAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const gate = await adminGate();
  if (!gate.ok) return gate;
  const provider = String(formData.get("provider") ?? "");
  const model = String(formData.get("model") ?? "");
  if (!isProviderId(provider)) return { ok: false, message: "Unknown provider." };
  try {
    const res = await saveProviderSettings(provider, model);
    if (!res.ok) return { ok: false, message: res.error || "Could not save settings." };
    revalidatePath("/settings/ai-providers");
    return { ok: true, message: "Default model saved." };
  } catch (error) {
    console.warn("saveProviderSettingsAction failed", briefError(error));
    return { ok: false, message: "Could not save settings — please try again." };
  }
}

/** Server action: validate + add a new labelled key for a provider (item 8). */
export async function addProviderKeyAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const gate = await adminGate();
  if (!gate.ok) return gate;
  const provider = String(formData.get("provider") ?? "");
  const label = String(formData.get("label") ?? "");
  const apiKey = String(formData.get("apiKey") ?? "");
  if (!isProviderId(provider)) return { ok: false, message: "Unknown provider." };
  try {
    const res = await addProviderKey(provider, label, apiKey);
    if (!res.ok) return { ok: false, message: res.error || "Could not add the key." };
    revalidatePath("/settings/ai-providers");
    return { ok: true, message: res.warning ? `Key added — ${res.warning}` : "Key validated and added." };
  } catch (error) {
    console.warn("addProviderKeyAction failed", briefError(error));
    return { ok: false, message: "Could not add the key — please try again." };
  }
}

/** Server action: replace an existing key's secret (item 7 — separate from Save settings). */
export async function replaceProviderKeyAction(
  _prev: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  const gate = await adminGate();
  if (!gate.ok) return gate;
  const keyId = String(formData.get("keyId") ?? "");
  const apiKey = String(formData.get("apiKey") ?? "");
  if (!keyId) return { ok: false, message: "Missing key." };
  try {
    const res = await replaceProviderKey(keyId, apiKey);
    if (!res.ok) return { ok: false, message: res.error || "Could not replace the key." };
    revalidatePath("/settings/ai-providers");
    return { ok: true, message: res.warning ? `Key replaced — ${res.warning}` : "Key validated and replaced." };
  } catch (error) {
    console.warn("replaceProviderKeyAction failed", briefError(error));
    return { ok: false, message: "Could not replace the key — please try again." };
  }
}

/** Server action: remove a key (id only; used by an icon button). */
export async function removeProviderKeyAction(keyId: string): Promise<ProviderActionState> {
  const gate = await adminGate();
  if (!gate.ok) return gate;
  try {
    const res = await removeProviderKey(keyId);
    if (!res.ok) return { ok: false, message: res.error || "Could not remove the key." };
    revalidatePath("/settings/ai-providers");
    return { ok: true, message: "Key removed." };
  } catch (error) {
    console.warn("removeProviderKeyAction failed", briefError(error));
    return { ok: false, message: "Could not remove the key — please try again." };
  }
}

/** Server action: make a key its provider's default (id only). */
export async function setDefaultProviderKeyAction(keyId: string): Promise<ProviderActionState> {
  const gate = await adminGate();
  if (!gate.ok) return gate;
  try {
    const res = await setDefaultProviderKey(keyId);
    if (!res.ok) return { ok: false, message: res.error || "Could not set the default." };
    revalidatePath("/settings/ai-providers");
    return { ok: true, message: "Default key updated." };
  } catch (error) {
    console.warn("setDefaultProviderKeyAction failed", briefError(error));
    return { ok: false, message: "Could not set the default — please try again." };
  }
}
