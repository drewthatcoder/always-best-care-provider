import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, Upload, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import Logo from '@/components/Logo';
import ProgressBar from '@/components/ProgressBar';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_51TBfSlCv6ZSrYUtDaodmtphvZgyWIhl3BesDnis33S8MEXAZ0TIWhrA81PWrsLs7f6VxQ2Y96OzhtEM6ObW5lt4l00JkNr2bWe');

const PRICE_IDS = {
  monthly:   'price_1TEIrfCv6ZSrYUtDsndS9YWK',
  'monthly-2': 'price_1TEIoiCv6ZSrYUtDaBnOm3tf',
};

interface ProviderFormData {
  businessName: string;
  adba: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  paymentOption: string;
  secondUserName: string;
  secondUserEmail: string;
  secondUserPassword: string;
  secondUserConfirmPassword: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  paymentPlan: string;
  selectedServices: string[];
  serviceZipCodes: string[];
  newZipCode: string;
  availableDays: string[];
  availableShifts: string[];
  password: string;
  confirmPassword: string;
  agreeTerms: boolean;
  additionalInfo: string;
}

const initialFormData: ProviderFormData = {
  businessName: '',
  adba: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  paymentOption: 'card',
  secondUserName: '',
  secondUserEmail: '',
  secondUserPassword: '',
  secondUserConfirmPassword: '',
  address: '',
  city: '',
  state: '',
  zipCode: '',
  paymentPlan: '',
  selectedServices: [],
  serviceZipCodes: [],
  newZipCode: '',
  availableDays: [],
  availableShifts: [],
  password: '',
  confirmPassword: '',
  agreeTerms: false,
  additionalInfo: '',
};

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
];

// ── Inner form that uses Stripe hooks ─────────────────────────────────────────
const RegisterForm = () => {
  const navigate = useNavigate();
  const stripe = useStripe();
  const elements = useElements();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<ProviderFormData>(initialFormData);
  const [loading, setLoading] = useState(false);
  const totalSteps = 2;

  const update = (field: keyof ProviderFormData, value: any) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const addZipCode = () => {
    const zip = formData.newZipCode.trim();
    if (zip && /^\d{5}$/.test(zip) && !formData.serviceZipCodes.includes(zip)) {
      setFormData((prev) => ({ ...prev, serviceZipCodes: [...prev.serviceZipCodes, zip], newZipCode: '' }));
    }
  };

  const removeZipCode = (zip: string) =>
    setFormData((prev) => ({ ...prev, serviceZipCodes: prev.serviceZipCodes.filter((z) => z !== zip) }));

  const csvInputRef = useRef<HTMLInputElement>(null);

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = text.split(/[\n,\r]+/).map((v) => v.trim().replace(/^"|"$/g, '')).filter((v) => /^\d{5}$/.test(v));
      const unique = [...new Set(parsed)];
      if (unique.length === 0) { toast.error('No valid 5-digit zip codes found in CSV'); return; }
      setFormData((prev) => {
        const added = unique.filter((z) => !prev.serviceZipCodes.includes(z));
        toast.success(`${added.length} zip code${added.length !== 1 ? 's' : ''} added from CSV`);
        return { ...prev, serviceZipCodes: [...prev.serviceZipCodes, ...added] };
      });
    };
    reader.readAsText(file);
    if (csvInputRef.current) csvInputRef.current.value = '';
  };

  const handleNext = () => {
    if (currentStep === 1) {
      if (!formData.firstName || !formData.lastName || !formData.email || !formData.phone) {
        toast.error('Please fill in all required fields.');
        return;
      }
      if (!formData.paymentPlan) {
        toast.error('Please select a payment plan.');
        return;
      }
    }
    setCurrentStep((s) => s + 1);
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep((s) => s - 1);
    else navigate('/');
  };

  const handleSubmit = async () => {
    if (!stripe || !elements) { toast.error('Stripe not loaded. Please refresh.'); return; }
    if (!formData.password || formData.password.length < 6) { toast.error('Password must be at least 6 characters.'); return; }
    if (formData.password !== formData.confirmPassword) { toast.error('Passwords do not match.'); return; }
    if (!formData.agreeTerms) { toast.error('Please agree to the Terms of Service.'); return; }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) { toast.error('Please enter your card details.'); return; }

    setLoading(true);
    try {
      // 1. Create payment method from card element
      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
        billing_details: {
          name: `${formData.firstName} ${formData.lastName}`,
          email: formData.email,
        },
      });

      if (pmError) { toast.error(pmError.message || 'Card error'); setLoading(false); return; }

      // 2. Create Stripe customer
      const { data: customerData, error: customerError } = await supabase.functions.invoke('create-customer', {
        body: { email: formData.email, name: `${formData.firstName} ${formData.lastName}` },
      });
      if (customerError || !customerData?.customerId) { toast.error('Failed to create customer'); setLoading(false); return; }
      const customerId = customerData.customerId;

      // 3. Charge $299 onboarding fee
      const { data: piData, error: piError } = await supabase.functions.invoke('create-payment-intent', {
        body: { customerId, priceId: 'price_1TEIsOCv6ZSrYUtD73YcE4ZS' },
      });
      if (piError || !piData?.clientSecret) { toast.error('Failed to create payment'); setLoading(false); return; }

      const { error: confirmError } = await stripe.confirmCardPayment(piData.clientSecret, {
        payment_method: paymentMethod!.id,
      });
      if (confirmError) { toast.error(confirmError.message || 'Payment failed'); setLoading(false); return; }

      // 4. Create monthly subscription
      const priceId = PRICE_IDS[formData.paymentPlan as keyof typeof PRICE_IDS];
      const { data: subData, error: subError } = await supabase.functions.invoke('create-subscription', {
        body: { customerId, priceId },
      });
      if (subError || !subData?.clientSecret) { toast.error('Failed to create subscription'); setLoading(false); return; }

      const { error: subConfirmError } = await stripe.confirmCardPayment(subData.clientSecret, {
        payment_method: paymentMethod!.id,
      });
      if (subConfirmError) { toast.error(subConfirmError.message || 'Subscription payment failed'); setLoading(false); return; }

      // 5. Create auth user
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: { first_name: formData.firstName, last_name: formData.lastName },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) { toast.error(error.message); setLoading(false); return; }

      if (data.user) {
        // 6. Save provider application
        await supabase.from('provider_applications').insert({
          user_id: data.user.id,
          first_name: formData.firstName,
          last_name: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          adba: formData.adba,
          address: formData.address,
          city: formData.city,
          state: formData.state,
          zip_code: formData.zipCode,
          payment_option: formData.paymentOption,
          payment_plan: formData.paymentPlan,
          selected_services: formData.selectedServices,
          service_zip_codes: formData.serviceZipCodes,
          available_days: formData.availableDays,
          available_shifts: formData.availableShifts,
          additional_info: formData.additionalInfo,
          status: 'pending',
          stripe_customer_id: customerId,
        } as any);

        // 7. Save zip codes
        if (formData.serviceZipCodes.length > 0) {
          await supabase.from('provider_zip_codes').insert(
            formData.serviceZipCodes.map(zip => ({ user_id: data.user!.id, zip_code: zip })) as any
          );
        }

        // 8. Save profile
        await supabase.from('profiles').upsert({
          user_id: data.user.id,
          first_name: formData.firstName,
          last_name: formData.lastName,
          zip_code: formData.zipCode,
        } as any);
      }

      toast.success('Account created! Please check your email to verify your account.');
      setCurrentStep(totalSteps + 1);
    } catch (err: any) {
      toast.error(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="care-gradient safe-area-top">
        <div className="max-w-2xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4 mb-6">
            <button onClick={handleBack} className="text-primary-foreground hover:text-primary-foreground/80">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <Logo size="sm" variant="light" />
          </div>
          <h1 className="text-2xl font-bold text-primary-foreground mb-1">Provider Registration</h1>
          <p className="text-primary-foreground/70 text-sm">Step {currentStep} of {totalSteps}</p>
          <div className="mt-4">
            <ProgressBar currentStep={currentStep} totalSteps={totalSteps} />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {currentStep === 1 && (
          <StepPersonalInfo
            formData={formData}
            update={update}
            addZipCode={addZipCode}
            removeZipCode={removeZipCode}
            csvInputRef={csvInputRef}
            onCsvUpload={handleCsvUpload}
          />
        )}
        {currentStep === 2 && <StepAccount formData={formData} update={update} />}
        {currentStep === 3 && <StepConfirmation />}

        {currentStep <= totalSteps && (
          <div className="flex gap-4 mt-8">
            <Button variant="outline" onClick={handleBack} className="flex-1">Back</Button>
            {currentStep < totalSteps ? (
              <Button onClick={handleNext} className="flex-1">
                Next <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={loading || !stripe} className="flex-1">
                {loading ? 'Processing Payment...' : 'Pay & Create Account'}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Step 1: Personal Info ─────────────────────────────────────────────────────
const StepPersonalInfo = ({
  formData, update, addZipCode, removeZipCode, csvInputRef, onCsvUpload,
}: {
  formData: ProviderFormData;
  update: (field: keyof ProviderFormData, value: any) => void;
  addZipCode: () => void;
  removeZipCode: (zip: string) => void;
  csvInputRef: React.RefObject<HTMLInputElement>;
  onCsvUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) => (
  <div className="space-y-5 animate-fade-in">
    <h2 className="text-xl font-semibold text-foreground">Personal Information</h2>

    <div className="space-y-1.5">
      <Label htmlFor="businessName">Business Name</Label>
      <Input id="businessName" value={formData.businessName} onChange={(e) => update('businessName', e.target.value)} />
    </div>

    <div className="space-y-1.5">
      <Label htmlFor="adba">DBA/Preferred Business Name</Label>
      <Input id="adba" value={formData.adba} onChange={(e) => update('adba', e.target.value)} />
    </div>

    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <Label htmlFor="firstName">First Name *</Label>
        <Input id="firstName" value={formData.firstName} onChange={(e) => update('firstName', e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="lastName">Last Name *</Label>
        <Input id="lastName" value={formData.lastName} onChange={(e) => update('lastName', e.target.value)} />
      </div>
    </div>

    <div className="space-y-1.5">
      <Label htmlFor="email">Email *</Label>
      <Input id="email" type="email" value={formData.email} onChange={(e) => update('email', e.target.value)} />
    </div>

    <div className="space-y-1.5">
      <Label htmlFor="phone">Phone Number *</Label>
      <Input id="phone" type="tel" value={formData.phone} onChange={(e) => update('phone', e.target.value)} />
    </div>

    <div className="space-y-1.5">
      <Label htmlFor="address">Street Address</Label>
      <Input id="address" value={formData.address} onChange={(e) => update('address', e.target.value)} />
    </div>

    <div className="grid grid-cols-3 gap-4">
      <div className="space-y-1.5">
        <Label htmlFor="city">City</Label>
        <Input id="city" value={formData.city} onChange={(e) => update('city', e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="state">State</Label>
        <Select value={formData.state} onValueChange={(v) => update('state', v)}>
          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent>
            {US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="zipCode">Zip Code(s)</Label>
        <div className="flex gap-1.5">
          <Input
            id="zipCode"
            value={formData.newZipCode}
            onChange={(e) => update('newZipCode', e.target.value)}
            placeholder="5-digit"
            maxLength={5}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addZipCode())}
          />
          <Button type="button" variant="secondary" size="sm" onClick={addZipCode} className="shrink-0">+</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => csvInputRef.current?.click()} className="shrink-0 gap-1" title="Upload CSV">
            <Upload className="w-3.5 h-3.5" />CSV
          </Button>
          <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={onCsvUpload} />
        </div>
        {formData.serviceZipCodes.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {formData.serviceZipCodes.map((zip) => (
              <span key={zip} className="inline-flex items-center gap-0.5 bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full text-xs">
                {zip}
                <button onClick={() => removeZipCode(zip)} className="text-muted-foreground hover:text-foreground">×</button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>

    <div className="space-y-3">
      <Label>Payment Plan *</Label>
      <div className="rounded-lg border border-border bg-secondary/20 p-3 flex items-center justify-between">
        <div>
          <span className="font-medium text-foreground">Onboarding Fee</span>
          <span className="block text-xs text-muted-foreground">One-time required fee</span>
        </div>
        <span className="font-semibold text-foreground">$299.00</span>
      </div>
      <RadioGroup value={formData.paymentPlan} onValueChange={(v) => update('paymentPlan', v)} className="space-y-2">
        <label className="flex items-center gap-3 cursor-pointer">
          <RadioGroupItem value="monthly" />
          <div>
            <span className="font-medium text-foreground">1 License — $59.89/mo</span>
            <span className="block text-xs text-muted-foreground">Billed monthly</span>
          </div>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <RadioGroupItem value="monthly-2" />
          <div>
            <span className="font-medium text-foreground">2 Licenses — $110/mo</span>
            <span className="block text-xs text-muted-foreground">Billed monthly</span>
          </div>
        </label>
      </RadioGroup>

      {formData.paymentPlan === 'monthly-2' && (
        <div className="space-y-4 rounded-lg border border-border bg-secondary/20 p-4 animate-fade-in">
          <h3 className="text-sm font-semibold text-foreground">Second License – User Credentials</h3>
          <p className="text-xs text-muted-foreground">Create login credentials for the second user on this account.</p>
          <div className="space-y-1.5">
            <Label htmlFor="secondUserName">Full Name *</Label>
            <Input id="secondUserName" value={formData.secondUserName} onChange={(e) => update('secondUserName', e.target.value)} placeholder="First and last name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="secondUserEmail">Email *</Label>
            <Input id="secondUserEmail" type="email" value={formData.secondUserEmail} onChange={(e) => update('secondUserEmail', e.target.value)} placeholder="second-user@example.com" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="secondUserPassword">Password *</Label>
              <Input id="secondUserPassword" type="password" value={formData.secondUserPassword} onChange={(e) => update('secondUserPassword', e.target.value)} placeholder="Min. 6 characters" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="secondUserConfirmPassword">Confirm Password *</Label>
              <Input id="secondUserConfirmPassword" type="password" value={formData.secondUserConfirmPassword} onChange={(e) => update('secondUserConfirmPassword', e.target.value)} />
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
);

// ── Step 2: Account + Payment ─────────────────────────────────────────────────
const StepAccount = ({
  formData, update,
}: {
  formData: ProviderFormData;
  update: (field: keyof ProviderFormData, value: any) => void;
}) => (
  <div className="space-y-5 animate-fade-in">
    <h2 className="text-xl font-semibold text-foreground">Create Your Account & Pay</h2>

    <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-2">
      <div className="flex items-center gap-2 text-primary">
        <CheckCircle2 className="w-5 h-5" />
        <span className="font-medium text-sm">Almost there!</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Set a password and enter your payment details. You'll be charged $299 onboarding fee + your selected monthly plan.
      </p>
    </div>

    <div className="space-y-1.5">
      <Label htmlFor="password">Password *</Label>
      <Input id="password" type="password" value={formData.password} onChange={(e) => update('password', e.target.value)} placeholder="Min. 6 characters" />
    </div>

    <div className="space-y-1.5">
      <Label htmlFor="confirmPassword">Confirm Password *</Label>
      <Input id="confirmPassword" type="password" value={formData.confirmPassword} onChange={(e) => update('confirmPassword', e.target.value)} />
    </div>

    <div className="space-y-1.5">
      <Label htmlFor="additionalInfo">Anything else you'd like us to know?</Label>
      <Textarea id="additionalInfo" value={formData.additionalInfo} onChange={(e) => update('additionalInfo', e.target.value)} rows={3} />
    </div>

    {/* Stripe Card Element */}
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <Lock className="w-4 h-4 text-muted-foreground" />
        Payment Details *
      </Label>
      <div className="rounded-lg border border-border bg-background p-4">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#1A1A2E',
                '::placeholder': { color: '#6B7280' },
              },
              invalid: { color: '#DC2626' },
            },
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Lock className="w-3 h-3" />
        Secured by Stripe. You'll be charged $299 + {formData.paymentPlan === 'monthly-2' ? '$110/mo' : '$59.89/mo'}.
      </p>
    </div>

    <label className="flex items-start gap-3 cursor-pointer pt-2">
      <Checkbox checked={formData.agreeTerms} onCheckedChange={(v) => update('agreeTerms', !!v)} className="mt-0.5" />
      <span className="text-sm text-muted-foreground">
        I agree to the <span className="text-primary underline cursor-pointer">Terms of Service</span> and{' '}
        <span className="text-primary underline cursor-pointer">Privacy Policy</span>.
      </span>
    </label>
  </div>
);

// ── Step 3: Confirmation ──────────────────────────────────────────────────────
const StepConfirmation = () => {
  const navigate = useNavigate();
  return (
    <div className="space-y-6 animate-fade-in text-center py-8">
      <CheckCircle2 className="w-16 h-16 text-primary mx-auto" />
      <h2 className="text-2xl font-bold text-foreground">Application Submitted!</h2>
      <p className="text-muted-foreground max-w-md mx-auto">
        Thank you for registering. Your payment has been processed and your application is now under review. Once an admin approves your account, you will receive an email confirming access.
      </p>
      <p className="text-sm text-muted-foreground">
        Please also check your inbox to verify your email address.
      </p>
      <Button onClick={() => navigate('/')} className="mt-4">Back to Home</Button>
    </div>
  );
};

// ── Wrapped with Stripe Elements ──────────────────────────────────────────────
const Register = () => (
  <Elements stripe={stripePromise}>
    <RegisterForm />
  </Elements>
);

export default Register;
