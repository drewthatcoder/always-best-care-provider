import {
  createSetupIntentForUser,
  getPaymentMethodForUser,
  readStripeVersion,
  setDefaultPaymentMethodForUser,
  type CustomerDirectory,
  type SetupStripe,
} from "./cardOnFile.ts";
import { jsonResponse } from "./cors.ts";
import { requireUser } from "./supabase.ts";

function userLabel(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }) {
  const meta = user.user_metadata ?? {};
  const first = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
  const last = typeof meta.last_name === "string" ? meta.last_name.trim() : "";
  const name = [first, last].filter(Boolean).join(" ");
  return { id: user.id, email: user.email ?? null, name: name || null };
}

async function authorize(
  req: Request,
  allowUserIds: ReadonlySet<string> | null,
) {
  const { user, error } = await requireUser(req);
  if (!user) return { response: jsonResponse({ error: "Not signed in", code: "unauthorized" }, 401) };
  if (allowUserIds && !allowUserIds.has(user.id)) {
    return { response: jsonResponse({ error: "Not allowed", code: "forbidden" }, 403) };
  }
  return { user };
}

function resolveValue<T>(value: T | (() => T)): T {
  return typeof value === "function" ? (value as () => T)() : value;
}

export async function handleCreateSetupIntent(
  req: Request,
  options: {
    /** Pass a function so a missing key is not read before the JWT check. */
    stripe: SetupStripe | (() => SetupStripe);
    publishableKey: string | (() => string);
    directory: CustomerDirectory | (() => CustomerDirectory);
    allowUserIds: ReadonlySet<string> | null;
  },
): Promise<Response> {
  const auth = await authorize(req, options.allowUserIds);
  if ("response" in auth && auth.response) return auth.response;
  const result = await createSetupIntentForUser({
    stripe: resolveValue(options.stripe),
    directory: resolveValue(options.directory),
    publishableKey: resolveValue(options.publishableKey),
    stripeVersion: readStripeVersion(req),
    user: userLabel(auth.user!),
  });
  return jsonResponse(result.body, result.status);
}

export async function handleSetDefaultPaymentMethod(
  req: Request,
  options: {
    stripe: SetupStripe | (() => SetupStripe);
    directory: CustomerDirectory | (() => CustomerDirectory);
    allowUserIds: ReadonlySet<string> | null;
  },
): Promise<Response> {
  const auth = await authorize(req, options.allowUserIds);
  if ("response" in auth && auth.response) return auth.response;
  const stripe = resolveValue(options.stripe);
  const directory = resolveValue(options.directory);
  let body: { setupIntentId?: unknown } = {};
  try {
    body = (await req.json()) as { setupIntentId?: unknown };
  } catch {
    body = {};
  }
  const setupIntentId = typeof body.setupIntentId === "string" ? body.setupIntentId : "";
  const result = await setDefaultPaymentMethodForUser({
    stripe,
    directory,
    userId: auth.user!.id,
    setupIntentId,
  });
  return jsonResponse(result.body, result.status);
}

export async function handleGetPaymentMethod(
  req: Request,
  options: {
    stripe: SetupStripe | (() => SetupStripe);
    directory: CustomerDirectory | (() => CustomerDirectory);
    allowUserIds: ReadonlySet<string> | null;
  },
): Promise<Response> {
  const auth = await authorize(req, options.allowUserIds);
  if ("response" in auth && auth.response) return auth.response;
  const result = await getPaymentMethodForUser({
    stripe: resolveValue(options.stripe),
    directory: resolveValue(options.directory),
    userId: auth.user!.id,
  });
  return jsonResponse(result.body, result.status);
}
