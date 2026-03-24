import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import Logo from '@/components/Logo';
import ProgressBar from '@/components/ProgressBar';
import ServiceCard, { AVAILABLE_SERVICES } from '@/components/ServiceCard';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ProviderFormData {
  businessName: string;
  adba: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  paymentOption: string;
  cardNumber: string;
  cardExpiry: string;
  cardCvv: string;
  cardName: string;
  achRoutingNumber: string;
  achAccountNumber: string;
  achAccountName: string;
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
  paymentOption: '',
  cardNumber: '',
  cardExpiry: '',
  cardCvv: '',
  cardName: '',
  achRoutingNumber: '',
  achAccountNumber: '',
  achAccountName: '',
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

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHIFTS = [
  { id: 'morning', label: 'Morning (7 AM – 12 PM)' },
  { id: 'afternoon', label: 'Afternoon (12 PM – 5 PM)' },
  { id: 'evening', label: 'Evening (5 PM – 10 PM)' },
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
];

const Register = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<ProviderFormData>(initialFormData);
  const [loading, setLoading] = useState(false);
  const totalSteps = 2;

  const update = (field: keyof ProviderFormData, value: any) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const toggleArray = (field: 'selectedServices' | 'availableDays' | 'availableShifts', item: string) =>
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].includes(item)
        ? prev[field].filter((i) => i !== item)
        : [...prev[field], item],
    }));

  const addZipCode = () => {
    const zip = formData.newZipCode.trim();
    if (zip && /^\d{5}$/.test(zip) && !formData.serviceZipCodes.includes(zip)) {
      setFormData((prev) => ({
        ...prev,
        serviceZipCodes: [...prev.serviceZipCodes, zip],
        newZipCode: '',
      }));
    }
  };

  const removeZipCode = (zip: string) =>
    setFormData((prev) => ({
      ...prev,
      serviceZipCodes: prev.serviceZipCodes.filter((z) => z !== zip),
    }));

  const csvInputRef = useRef<HTMLInputElement>(null);

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = text
        .split(/[\n,\r]+/)
        .map((v) => v.trim().replace(/^"|"$/g, ''))
        .filter((v) => /^\d{5}$/.test(v));
      const unique = [...new Set(parsed)];
      if (unique.length === 0) {
        toast.error('No valid 5-digit zip codes found in CSV');
        return;
      }
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
    if (!formData.password || formData.password.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }
    if (!formData.agreeTerms) {
      toast.error('Please agree to the Terms of Service.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            first_name: formData.firstName,
            last_name: formData.lastName,
          },
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      if (data.user) {
        // Use edge function with service role to save data (no authenticated session yet)
        const { error: fnError } = await supabase.functions.invoke('submit-provider-application', {
          body: {
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
          },
        });

        if (fnError) {
          console.error('Application submission error:', fnError);
          toast.error('Account created but application submission failed. Please contact support.');
          setTimeout(() => navigate('/login'), 2000);
          return;
        }
      }

      toast.success('Account created! Please check your email to verify your account.');
      setCurrentStep(totalSteps + 1);
      return;
    } catch {
      toast.error('An unexpected error occurred.');
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
          <p className="text-primary-foreground/70 text-sm">
            Step {currentStep} of {totalSteps}
          </p>
          <div className="mt-4">
            <ProgressBar currentStep={currentStep} totalSteps={totalSteps} />
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl mx-auto px-6 py-8">
        {currentStep === 1 && <StepPersonalInfo formData={formData} update={update} addZipCode={addZipCode} removeZipCode={removeZipCode} csvInputRef={csvInputRef} onCsvUpload={handleCsvUpload} />}
        {currentStep === 2 && <StepAccount formData={formData} update={update} />}
        {currentStep === 3 && <StepConfirmation />}

        {currentStep <= totalSteps && (
          <div className="flex gap-4 mt-8">
            <Button variant="outline" onClick={handleBack} className="flex-1">
              Back
            </Button>
            {currentStep < totalSteps ? (
              <Button onClick={handleNext} className="flex-1">
                Submit <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={loading} className="flex-1">
                {loading ? 'Creating Account...' : 'Create Account'}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── Step 1: Personal Information ─── */
const StepPersonalInfo = ({
  formData,
  update,
  addZipCode,
  removeZipCode,
  csvInputRef,
  onCsvUpload,
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
            {US_STATES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
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
          <Button type="button" variant="secondary" size="sm" onClick={addZipCode} className="shrink-0">
            +
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => csvInputRef.current?.click()} className="shrink-0 gap-1" title="Upload CSV">
            <Upload className="w-3.5 h-3.5" />CSV
          </Button>
          <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={onCsvUpload} />
        </div>
        {formData.serviceZipCodes.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {formData.serviceZipCodes.map((zip) => (
              <span
                key={zip}
                className="inline-flex items-center gap-0.5 bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full text-xs"
              >
                {zip}
                <button onClick={() => removeZipCode(zip)} className="text-muted-foreground hover:text-foreground">×</button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>

    {/* Card Payment Fields */}
    {formData.paymentOption === 'card' && (
      <div className="space-y-4 rounded-lg border border-border bg-secondary/20 p-4">
        <h3 className="text-sm font-semibold text-foreground">Card Details</h3>
        <div className="space-y-1.5">
          <Label htmlFor="cardName">Name on Card *</Label>
          <Input id="cardName" value={formData.cardName} onChange={(e) => update('cardName', e.target.value)} placeholder="Full name as it appears on card" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cardNumber">Card Number *</Label>
          <Input id="cardNumber" value={formData.cardNumber} onChange={(e) => update('cardNumber', e.target.value)} placeholder="1234 5678 9012 3456" maxLength={19} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="cardExpiry">Expiration *</Label>
            <Input id="cardExpiry" value={formData.cardExpiry} onChange={(e) => update('cardExpiry', e.target.value)} placeholder="MM/YY" maxLength={5} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cardCvv">CVV *</Label>
            <Input id="cardCvv" type="password" value={formData.cardCvv} onChange={(e) => update('cardCvv', e.target.value)} placeholder="•••" maxLength={4} />
          </div>
        </div>
      </div>
    )}

    {/* ACH Payment Fields */}
    {formData.paymentOption === 'ach' && (
      <div className="space-y-4 rounded-lg border border-border bg-secondary/20 p-4">
        <h3 className="text-sm font-semibold text-foreground">ACH Bank Details</h3>
        <div className="space-y-1.5">
          <Label htmlFor="achAccountName">Account Holder Name *</Label>
          <Input id="achAccountName" value={formData.achAccountName} onChange={(e) => update('achAccountName', e.target.value)} placeholder="Full name on account" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="achRoutingNumber">Routing Number *</Label>
          <Input id="achRoutingNumber" value={formData.achRoutingNumber} onChange={(e) => update('achRoutingNumber', e.target.value)} placeholder="9-digit routing number" maxLength={9} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="achAccountNumber">Account Number *</Label>
          <Input id="achAccountNumber" type="password" value={formData.achAccountNumber} onChange={(e) => update('achAccountNumber', e.target.value)} placeholder="Account number" />
        </div>
      </div>
    )}

    <div className="space-y-2">
      <Label>Payment Option *</Label>
      <RadioGroup value={formData.paymentOption} onValueChange={(v) => update('paymentOption', v)} className="space-y-2">
        <label className="flex items-center gap-3 cursor-pointer">
          <RadioGroupItem value="card" />
          <span className="font-medium text-foreground">Debit/Credit Card</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <RadioGroupItem value="ach" />
          <span className="font-medium text-foreground">ACH</span>
        </label>
      </RadioGroup>
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


/* ─── Step 2: Account Creation ─── */
const StepAccount = ({
  formData,
  update,
}: {
  formData: ProviderFormData;
  update: (field: keyof ProviderFormData, value: any) => void;
}) => (
  <div className="space-y-5 animate-fade-in">
    <h2 className="text-xl font-semibold text-foreground">Create Your Account</h2>

    <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-2">
      <div className="flex items-center gap-2 text-primary">
        <CheckCircle2 className="w-5 h-5" />
        <span className="font-medium text-sm">Almost there!</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Set a password to secure your provider account. You'll use your email (<strong className="text-foreground">{formData.email}</strong>) to log in.
      </p>
    </div>

    <div className="space-y-1.5">
      <Label htmlFor="password">Password *</Label>
      <Input
        id="password"
        type="password"
        value={formData.password}
        onChange={(e) => update('password', e.target.value)}
        placeholder="Min. 6 characters"
      />
    </div>

    <div className="space-y-1.5">
      <Label htmlFor="confirmPassword">Confirm Password *</Label>
      <Input
        id="confirmPassword"
        type="password"
        value={formData.confirmPassword}
        onChange={(e) => update('confirmPassword', e.target.value)}
      />
    </div>

    <div className="space-y-1.5">
      <Label htmlFor="additionalInfo">Anything else you'd like us to know?</Label>
      <Textarea
        id="additionalInfo"
        value={formData.additionalInfo}
        onChange={(e) => update('additionalInfo', e.target.value)}
        rows={3}
      />
    </div>

    <label className="flex items-start gap-3 cursor-pointer pt-2">
      <Checkbox
        checked={formData.agreeTerms}
        onCheckedChange={(v) => update('agreeTerms', !!v)}
        className="mt-0.5"
      />
      <span className="text-sm text-muted-foreground">
        I agree to the <span className="text-primary underline cursor-pointer">Terms of Service</span> and{' '}
        <span className="text-primary underline cursor-pointer">Privacy Policy</span>.
      </span>
    </label>
  </div>
);

/* ─── Step 3: Confirmation ─── */
const StepConfirmation = () => {
  const navigate = useNavigate();
  return (
    <div className="space-y-6 animate-fade-in text-center py-8">
      <CheckCircle2 className="w-16 h-16 text-primary mx-auto" />
      <h2 className="text-2xl font-bold text-foreground">Application Submitted!</h2>
      <p className="text-muted-foreground max-w-md mx-auto">
        Thank you for registering. Your application is now under review. Once an admin approves your account, you will receive an email confirming that you now have access.
      </p>
      <p className="text-sm text-muted-foreground">
        Please also check your inbox to verify your email address.
      </p>
      <Button onClick={() => navigate('/')} className="mt-4">
        Back to Home
      </Button>
    </div>
  );
};

export default Register;
