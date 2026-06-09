"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/auth";
import {
  addStashItems,
  deleteStashItem,
  setStashUsed,
  getUnusedStash,
} from "@/lib/repo/stash";
import type { StashItem } from "@/lib/types";

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

export async function deleteStashAction(id: string): Promise<void> {
  await requireAdmin();
  await deleteStashItem(id);
  revalidatePath("/admin/stash");
}

export async function toggleStashUsedAction(id: string, used: boolean): Promise<void> {
  await requireAdmin();
  await setStashUsed([id], used);
  revalidatePath("/admin/stash");
}

/** For the editor's "import from stash" picker. */
export async function getUnusedStashAction(): Promise<StashItem[]> {
  await requireAdmin();
  return getUnusedStash();
}

/** Mark imported items as used (cross them off the master list). */
export async function markStashUsedAction(ids: string[]): Promise<void> {
  await requireAdmin();
  await setStashUsed(ids, true);
  revalidatePath("/admin/stash");
}
