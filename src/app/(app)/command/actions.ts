"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { briefError } from "@/server/log";

/** Result of a dismiss/undismiss action, surfaced inline. */
export type DecisionActionState = { ok: boolean; message: string };

// Decision keys are internal identifiers (never user content); the prefix pins the namespace.
const keySchema = z.string().min(10).max(300).startsWith("decision:");

/**
 * Hide a Decision-Queue item. Signed-in is sufficient: login is already gated to managed-org
 * members, and a dismissal only stores the item's dedupeKey (no repo data is mutated) — the
 * item resurfaces automatically as soon as its underlying state (and therefore its key) changes.
 */
export async function dismissDecision(dedupeKey: string): Promise<DecisionActionState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Not signed in." };
  const parsed = keySchema.safeParse(dedupeKey);
  if (!parsed.success) return { ok: false, message: "Invalid decision key." };
  try {
    await prisma.decisionDismissal.upsert({
      where: { dedupeKey: parsed.data },
      create: { dedupeKey: parsed.data, dismissedBy: user.login },
      update: { dismissedBy: user.login, dismissedAt: new Date() },
    });
    revalidatePath("/command");
    return { ok: true, message: "Dismissed." };
  } catch (error) {
    console.error("dismissDecision failed", briefError(error));
    return { ok: false, message: "Could not dismiss the item — please try again." };
  }
}

/** Undo a dismissal so the item shows up again (no-op when it was not dismissed). */
export async function undismissDecision(dedupeKey: string): Promise<DecisionActionState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Not signed in." };
  const parsed = keySchema.safeParse(dedupeKey);
  if (!parsed.success) return { ok: false, message: "Invalid decision key." };
  try {
    await prisma.decisionDismissal.deleteMany({ where: { dedupeKey: parsed.data } });
    revalidatePath("/command");
    return { ok: true, message: "Restored." };
  } catch (error) {
    console.error("undismissDecision failed", briefError(error));
    return { ok: false, message: "Could not restore the item — please try again." };
  }
}
