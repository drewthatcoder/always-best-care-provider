import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { useFieldArray, useForm, type FieldPath, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Logo from "@/components/Logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  MAX_ZIP_CODES,
  PRICING_SERVICES,
  SERVICE_DETAILS,
  emptyPricingFormValues,
  emptyZipBlock,
  pricingFormSchema,
  readPricingInvokeError,
  toServicePricingPayload,
  type PricingFormValues,
  type PricingService,
} from "@/lib/servicePricing";

function metadataName(user: User): string {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const first = typeof meta?.first_name === "string" ? meta.first_name.trim() : "";
  const last = typeof meta?.last_name === "string" ? meta.last_name.trim() : "";
  const combined = [first, last].filter(Boolean).join(" ");
  if (combined) return combined;
  if (typeof meta?.full_name === "string" && meta.full_name.trim()) return meta.full_name.trim();
  if (typeof meta?.name === "string" && meta.name.trim()) return meta.name.trim();
  return "";
}

async function prefillPricingForm(
  user: User,
  form: UseFormReturn<PricingFormValues>,
  isCancelled: () => boolean,
) {
  const setIfEmpty = (field: "providerName" | "email", value: string) => {
    if (isCancelled() || !value.trim()) return;
    if (form.getValues(field).trim()) return;
    form.setValue(field, value.trim());
  };

  setIfEmpty("email", user.email ?? "");
  const fromMetadata = metadataName(user);
  setIfEmpty("providerName", fromMetadata);

  const { data, error } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (isCancelled() || error || !data) return;

  const profileName = [data.first_name, data.last_name].filter(Boolean).join(" ").trim();
  if (!profileName) return;
  const current = form.getValues("providerName").trim();
  if (!current || current === fromMetadata) form.setValue("providerName", profileName);
}

const PricingForm = () => {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<PricingFormValues>({
    resolver: zodResolver(pricingFormSchema),
    defaultValues: emptyPricingFormValues(),
    mode: "onSubmit",
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "zips" });

  useEffect(() => {
    document.title = "Service pricing | Always Best Care";
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void prefillPricingForm(user, form, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [user, form]);

  const onSubmit = async (values: PricingFormValues) => {
    setServerError(null);
    setSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const { data, error } = await supabase.functions.invoke("submit-service-pricing", {
        body: toServicePricingPayload(values),
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
      if (error || !data || typeof data !== "object" || !("success" in data) || data.success !== true) {
        setServerError(await readPricingInvokeError(data, error));
        return;
      }
      setSubmitted(true);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Could not submit pricing. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const startOver = () => {
    const next = emptyPricingFormValues();
    if (user?.email) next.email = user.email;
    const name = user ? metadataName(user) : "";
    if (name) next.providerName = name;
    form.reset(next);
    setSubmitted(false);
    setServerError(null);
    if (user) void prefillPricingForm(user, form, () => false);
  };

  return (
    <div className="min-h-screen care-gradient px-4 py-10 safe-area-top safe-area-bottom">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center">
        <Logo size="lg" />
        <h1 className="mt-6 text-center text-3xl font-bold text-white">Service pricing</h1>
        <p className="mt-2 max-w-xl text-center text-sm text-white/80">
          Tell us what you charge for each service in the zip codes you cover. Prices are in US dollars.
        </p>

        <Card className="mt-8 w-full shadow-lg">
          {submitted ? (
            <CardContent className="flex flex-col items-center px-6 py-16 text-center" data-testid="pricing-success">
              <CheckCircle2 className="h-14 w-14 text-primary" />
              <h2 className="mt-4 text-2xl font-bold text-foreground">Pricing submitted</h2>
              <p className="mt-2 max-w-md text-muted-foreground">
                Thank you. We received your service prices and will follow up if we have questions.
              </p>
              <Button type="button" className="mt-8" onClick={startOver}>
                Submit another response
              </Button>
            </CardContent>
          ) : (
            <>
              <CardHeader>
                <CardTitle className="text-xl">Your details</CardTitle>
                <CardDescription>
                  No account is required. If you are signed in, we attach this submission to your account.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form
                    noValidate
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-8"
                    data-testid="pricing-form"
                  >
                    <fieldset disabled={submitting} className="m-0 min-w-0 space-y-8 border-0 p-0">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <FormField
                          control={form.control}
                          name="providerName"
                          render={({ field }) => (
                            <FormItem className="sm:col-span-2">
                              <FormLabel>Full name</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  autoComplete="name"
                                  data-testid="pricing-provider-name"
                                  placeholder="Jordan Lee"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  type="email"
                                  autoComplete="email"
                                  data-testid="pricing-email"
                                  placeholder="you@example.com"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="phone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Phone</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  type="tel"
                                  autoComplete="tel"
                                  data-testid="pricing-phone"
                                  placeholder="(555) 010-2000"
                                />
                              </FormControl>
                              <FormDescription>Optional</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="space-y-4">
                        <div>
                          <h2 className="text-lg font-semibold text-foreground">Zip codes</h2>
                          <p className="text-sm text-muted-foreground">
                            Add a price for every service in each zip code. At least one zip code is required.
                          </p>
                        </div>

                        {fields.map((field, index) => (
                          <div key={field.id} className="rounded-lg border bg-muted/30 p-4" data-testid={`zip-block-${index}`}>
                            <div className="mb-4 flex items-start justify-between gap-3">
                              <FormField
                                control={form.control}
                                name={`zips.${index}.zip`}
                                render={({ field: zipField }) => (
                                  <FormItem className="max-w-xs flex-1">
                                    <FormLabel>Zip code {index + 1}</FormLabel>
                                    <FormControl>
                                      <Input
                                        {...zipField}
                                        inputMode="numeric"
                                        autoComplete="postal-code"
                                        maxLength={5}
                                        data-testid={`zip-${index}`}
                                        placeholder="75201"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mt-8"
                                onClick={() => remove(index)}
                                disabled={fields.length <= 1}
                                data-testid={`remove-zip-${index}`}
                                title={fields.length <= 1 ? "At least one zip code is required" : "Remove this zip code"}
                              >
                                <Trash2 className="h-4 w-4" />
                                Remove
                              </Button>
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              {PRICING_SERVICES.map((service, serviceIndex) => (
                                <ServicePriceField
                                  key={service}
                                  control={form.control}
                                  index={index}
                                  service={service}
                                  serviceIndex={serviceIndex}
                                />
                              ))}
                            </div>
                          </div>
                        ))}

                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => append(emptyZipBlock())}
                          disabled={fields.length >= MAX_ZIP_CODES}
                          data-testid="add-zip"
                        >
                          <Plus className="h-4 w-4" />
                          Add another zip code
                        </Button>
                        {fields.length >= MAX_ZIP_CODES ? (
                          <p className="text-sm text-muted-foreground">You can add up to {MAX_ZIP_CODES} zip codes.</p>
                        ) : null}
                      </div>

                      <FormField
                        control={form.control}
                        name="notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Notes</FormLabel>
                            <FormControl>
                              <Textarea
                                {...field}
                                data-testid="pricing-notes"
                                placeholder="Anything we should know about these rates?"
                                rows={4}
                              />
                            </FormControl>
                            <FormDescription>Optional</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {serverError ? (
                        <Alert variant="destructive">
                          <AlertDescription>{serverError}</AlertDescription>
                        </Alert>
                      ) : null}

                      <Button type="submit" className="w-full" data-testid="submit-pricing" aria-busy={submitting}>
                        {submitting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          "Submit pricing"
                        )}
                      </Button>
                    </fieldset>
                  </form>
                </Form>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
};

function ServicePriceField({
  control,
  index,
  service,
  serviceIndex,
}: {
  control: UseFormReturn<PricingFormValues>["control"];
  index: number;
  service: PricingService;
  serviceIndex: number;
}) {
  const name = `zips.${index}.prices.${service}` as FieldPath<PricingFormValues>;
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{service}</FormLabel>
          <FormDescription>{SERVICE_DETAILS[service]}</FormDescription>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden="true">
              $
            </span>
            <FormControl>
              <Input
                {...field}
                value={typeof field.value === "string" ? field.value : ""}
                inputMode="decimal"
                autoComplete="off"
                className="pl-7"
                placeholder="0.00"
                data-testid={`price-${index}-${serviceIndex}`}
                aria-label={`${service} price for zip code ${index + 1}`}
              />
            </FormControl>
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export default PricingForm;
