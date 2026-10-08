import { jsonResponse } from "./cors.ts";
import {
  chargeBooking,
  isBookingUuid,
  previewBookingCharge,
  type ChargeStripe,
} from "./bookingCharge.ts";
import { createChargeStore, type ChargeAdmin } from "./bookingChargeStore.ts";
import { getServiceClient, requireUser } from "./supabase.ts";

function resolveStripe(stripe: ChargeStripe | (() => ChargeStripe)): ChargeStripe {
  return typeof stripe === "function" ? stripe() : stripe;
}

export async function handleProviderChargeRequest(
  req: Request,
  body: { action?: string; bookingId?: unknown },
  options: {
    /** Pass a function so a missing key is not read before the JWT check. */
    stripe: ChargeStripe | (() => ChargeStripe);
    mode: "live" | "test";
    allowUserIds: ReadonlySet<string> | null;
    admin?: ChargeAdmin;
  },
): Promise<Response> {
  const { user, error: authError } = await requireUser(req);
  if (!user) {
    return jsonResponse({ error: "Not signed in", code: "unauthorized" }, 401);
  }
  if (options.allowUserIds && !options.allowUserIds.has(user.id)) {
    return jsonResponse({ error: "Not allowed", code: "forbidden" }, 403);
  }

  const stripe = resolveStripe(options.stripe);
  const bookingId = typeof body.bookingId === "string" ? body.bookingId.trim() : "";
  if (!isBookingUuid(bookingId)) {
    return jsonResponse({ error: "bookingId is required", code: "invalid_booking" }, 400);
  }

  const admin = options.admin ?? (getServiceClient() as unknown as ChargeAdmin);
  const store = createChargeStore(admin, { mode: options.mode });

  if (options.allowUserIds) {
    const booking = await store.getBooking(bookingId);
    if (!booking) return jsonResponse({ error: "Booking not found", code: "not_found" }, 404);
    const clientId = booking.client_user_id;
    const providerId = booking.provider_user_id;
    const clientAllowed = clientId.length > 0 && options.allowUserIds.has(clientId);
    const providerAllowed = typeof providerId === "string" && options.allowUserIds.has(providerId);
    if (!clientAllowed || !providerAllowed) {
      return jsonResponse({ error: "Not allowed", code: "forbidden" }, 403);
    }
  }

  const deps = {
    stripe,
    store,
    mode: options.mode,
  };
  const action = typeof body.action === "string" ? body.action.trim() : "";
  const result = action === "preview"
    ? await previewBookingCharge({ bookingId, providerUserId: user.id }, deps)
    : await chargeBooking({ bookingId, providerUserId: user.id }, deps);
  return jsonResponse(result.body, result.status);
}
