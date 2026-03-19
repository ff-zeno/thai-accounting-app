import { Webhook } from "svix";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";

interface ClerkUserEventData {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email_addresses: Array<{
    id: string;
    email_address: string;
  }>;
  primary_email_address_id: string | null;
}

interface ClerkWebhookEvent {
  type: string;
  data: ClerkUserEventData;
}

export async function POST(req: Request) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[clerk-webhook] CLERK_WEBHOOK_SECRET is not set");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing Svix headers", { status: 400 });
  }

  const payload = await req.text();

  const wh = new Webhook(webhookSecret);
  let event: ClerkWebhookEvent;

  try {
    event = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookEvent;
  } catch (err) {
    console.error("[clerk-webhook] Verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const { type, data } = event;

  if (type === "user.created" || type === "user.updated") {
    const clerkId = data.id;
    const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || "User";
    const primaryEmail = data.email_addresses.find(
      (e) => e.id === data.primary_email_address_id
    );
    const email = primaryEmail?.email_address ?? data.email_addresses[0]?.email_address ?? "";

    if (!email) {
      console.error("[clerk-webhook] No email found for user:", clerkId);
      return new Response("No email found", { status: 400 });
    }

    // Check if user already exists in our DB
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    if (existingUser) {
      // Update name and email if changed
      await db
        .update(users)
        .set({ name, email })
        .where(eq(users.clerkId, clerkId));
    } else {
      // Create new user (no orgId yet -- assigned via org membership)
      await db.insert(users).values({
        clerkId,
        name,
        email,
        role: "user",
      });
    }
  }

  if (type === "user.deleted") {
    const clerkId = data.id;
    // Soft-delete the user
    await db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(and(eq(users.clerkId, clerkId), isNull(users.deletedAt)));
  }

  return new Response("OK", { status: 200 });
}
