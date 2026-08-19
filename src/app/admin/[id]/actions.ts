"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";

export async function saveTriage(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const notes = String(formData.get("admin_notes") ?? "");
  const reviewed = formData.get("reviewed") === "on";

  await supabaseAdmin()
    .from("intakes")
    .update({ reviewed, admin_notes: notes || null })
    .eq("id", id);

  revalidatePath(`/admin/${id}`);
  revalidatePath("/admin");
}
