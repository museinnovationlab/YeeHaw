"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/auth";
import {
  addStashItems,
  deleteStashItem,
  setStashStatus,
  getActiveStash,
} from "@/lib/repo/stash";
import type { StashItem, StashStatus } from "@/lib/types";

async function requireAdmin() {
  const u = await getAdminUser();
  if (!u) throw new Error("Unauthorized");
}

/** Add items — one per non-empty line of the pasted text. Returns count added. */
export async function addStashAction(text: string): Promise<number> {
  await requireAdmin();
  const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
  const n = await addStashItems(lines);
  revalidatePath("/admin/stash");
  return n;
}

/** Move an item between active / used / removed. */
export async function setStashStatusAction(id: string, status: StashStatus): Promise<void> {
  await requireAdmin();
  await setStashStatus([id], status);
  revalidatePath("/admin/stash");
}

/** Permanent delete (from the Removed list). */
export async function deleteStashAction(id: string): Promise<void> {
  await requireAdmin();
  await deleteStashItem(id);
  revalidatePath("/admin/stash");
}

/** For the editor's "import from stash" picker. */
export async function getUnusedStashAction(): Promise<StashItem[]> {
  await requireAdmin();
  return getActiveStash();
}

/** Mark imported items as used (cross them off the active list). */
export async function markStashUsedAction(ids: string[]): Promise<void> {
  await requireAdmin();
  await setStashStatus(ids, "used");
  revalidatePath("/admin/stash");
}
