export const SETTINGS_CONNECT_RETURN = "/settings?connect=return";
export const SETTINGS_CONNECT_REFRESH = "/settings?connect=refresh";

export function stripeAccountLinkBody(origin: string) {
  const base = origin.replace(/\/$/, "");
  return {
    origin: base,
    returnUrl: `${base}${SETTINGS_CONNECT_RETURN}`,
    refreshUrl: `${base}${SETTINGS_CONNECT_REFRESH}`,
  };
}
