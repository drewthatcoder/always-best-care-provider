export const DEFAULT_PROVIDER_APP_URL = "https://easycare.live";

export type AccountLinkUrlInput = {
  origin?: string;
  returnUrl?: string;
  refreshUrl?: string;
};

export function isAbsoluteUrl(value: string | undefined): value is string {
  return !!value && /^https?:\/\//i.test(value);
}

export function resolveAccountLinkUrls(
  body: AccountLinkUrlInput,
  env: { PROVIDER_APP_URL?: string; SITE_URL?: string; APP_URL?: string } = {},
): { returnUrl: string; refreshUrl: string } | { error: string } {
  if (isAbsoluteUrl(body.returnUrl) && isAbsoluteUrl(body.refreshUrl)) {
    return { returnUrl: body.returnUrl, refreshUrl: body.refreshUrl };
  }

  const envBase =
    env.PROVIDER_APP_URL ||
    env.SITE_URL ||
    env.APP_URL ||
    body.origin ||
    DEFAULT_PROVIDER_APP_URL;

  if (isAbsoluteUrl(envBase)) {
    const origin = envBase.replace(/\/$/, "");
    return {
      returnUrl: `${origin}/settings?connect=return`,
      refreshUrl: `${origin}/settings?connect=refresh`,
    };
  }

  return {
    error:
      "Stripe Account Links require absolute URLs. Pass origin from the browser or set PROVIDER_APP_URL.",
  };
}
