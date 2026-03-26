import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Mic, CreditCard, Plus, X, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import ProgressBar from '@/components/ProgressBar';
import Logo from '@/components/Logo';
import ServiceCard, { AVAILABLE_SERVICES, AVAILABLE_HOURS } from '@/components/ServiceCard';
import BookingCalendar from '@/components/BookingCalendar';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface FormData {
  zipCode: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  height: string;
  weight: string;
  email: string;
  phone: string;
  address: string;
  addressLine2: string;
  city: string;
  state: string;
  recurringWeekly: string;
  additionalDates: Date[];
  careType: string;
  experience: string;
  availability: string[];
  certifications: string[];
  selectedServices: string[];
  availableHours: string[];
  responsibleParty: string;
  responsiblePartyFirstName: string;
  responsiblePartyLastName: string;
  responsiblePartyEmail: string;
  cardNumber: string;
  bookingDate: Date | null;
  howHeard: string;
  additionalInfo: string;
  agreeTerms: boolean;
  password: string;
  confirmPassword: string;
}

const initialFormData: FormData = {
  zipCode: '',
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  height: '',
  weight: '',
  email: '',
  phone: '',
  address: '',
  addressLine2: '',
  city: '',
  state: '',
  recurringWeekly: '',
  additionalDates: [],
  careType: '',
  experience: '',
  availability: [],
  certifications: [],
  selectedServices: [],
  availableHours: [],
  responsibleParty: 'myself',
  responsiblePartyFirstName: '',
  responsiblePartyLastName: '',
  responsiblePartyEmail: '',
  cardNumber: '',
  bookingDate: null,
  howHeard: '',
  additionalInfo: '',
  agreeTerms: false,
  password: '',
  confirmPassword: ''
};

const SignUp = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [loading, setLoading] = useState(false);
  const [bathingDialogOpen, setBathingDialogOpen] = useState(false);
  const [transportDialogOpen, setTransportDialogOpen] = useState(false);
  const totalSteps = 2;

  const updateFormData = (field: keyof FormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleArrayItem = (field: 'availability' | 'certifications' | 'selectedServices' | 'availableHours', item: string) => {
    setFormData((prev) => {
      const isSelected = prev[field].includes(item);
      const updated = isSelected ?
      prev[field].filter((i) => i !== item) :
      [...prev[field], item];

      // Show dialog when selecting bathing
      if (field === 'selectedServices' && item === 'bathing' && !isSelected) {
        setBathingDialogOpen(true);
      }
      // Show dialog when selecting transportation
      if (field === 'selectedServices' && item === 'transportation' && !isSelected) {
        setTransportDialogOpen(true);
      }

      return { ...prev, [field]: updated };
    });
  };

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    } else {
      navigate('/login');
    }
  };

  const handleSubmit = async () => {
    const email = formData.responsiblePartyEmail;
    // Validation
    if (!email || !formData.firstName || !formData.lastName) {
      toast.error('Please fill in all required fields (email, first name, last name)');
      return;
    }

    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    if (!formData.agreeTerms) {
      toast.error('Please agree to the Terms of Service');
      return;
    }

    if (!formData.password || formData.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      // Create user account with user-provided password
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email,
        password: formData.password,
        options: {
          data: {
            first_name: formData.firstName,
            last_name: formData.lastName
          },
          emailRedirectTo: window.location.origin
        }
      });

      if (signUpError) {
        toast.error(signUpError.message);
        setLoading(false);
        return;
      }

      if (data.user) {
        // Format dates for the edge function
        const bookingDate = formData.bookingDate ?
        format(formData.bookingDate, 'yyyy-MM-dd') :
        null;
        const additionalDates = formData.additionalDates.map((d) =>
        format(d, 'yyyy-MM-dd')
        );

        // Map service IDs to readable names
        const serviceNameMap: Record<string, string> = {
          bathing: 'Bathing',
          transferring: 'Transferring',
          dressing: 'Dressing',
          toileting: 'Toileting',
          walking: 'Walking',
          meal: 'Meal Preparation',
          housekeeping: 'Light Housekeeping',
          medication: 'Medication',
          transportation: 'Transportation'
        };

        const selectedServiceNames = formData.selectedServices.map(
          (id) => serviceNameMap[id] || id
        );

        // Call edge function to create bookings (bypasses RLS for unconfirmed users)
        const responsiblePartyName = formData.responsibleParty === 'someone-else' ?
        `${formData.responsiblePartyFirstName} ${formData.responsiblePartyLastName}`.trim() :
        undefined;

        const { error: bookingError } = await supabase.functions.invoke(
          'submit-client-booking',
          {
            body: {
              user_id: data.user.id,
              zip_code: formData.zipCode,
              selected_services: selectedServiceNames,
              booking_date: bookingDate,
              additional_dates: additionalDates,
              available_hours: formData.availableHours,
              first_name: formData.firstName,
              last_name: formData.lastName,
              phone: formData.phone,
              address: formData.address,
              address_line2: formData.addressLine2,
              city: formData.city,
              state: formData.state,
              date_of_birth: formData.dateOfBirth,
              height: formData.height,
              weight: formData.weight,
              responsible_party: formData.responsibleParty,
              responsible_party_name: responsiblePartyName,
              responsible_party_email: formData.responsiblePartyEmail,
              additional_info: formData.additionalInfo,
              recurring_weekly: formData.recurringWeekly
            }
          }
        );

        if (bookingError) {
          console.error('Booking creation error:', bookingError);
          // Don't block signup if booking fails — account was already created
          toast.warning('Account created but booking could not be saved. Please log in and book again.');
        }
      }

      toast.success('Account created! Please check your email to verify your account.');
      // Redirect to login after brief delay
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err) {
      toast.error('An unexpected error occurred. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6 animate-fade-in">
            <div className="border-t border-border pt-6">
              <h2 className="text-xl font-semibold text-primary mb-6">Please enter your zip code where services will be needed.

              </h2>
              <div className="border-t border-border pt-6">
                <div className="space-y-2">
                  <Label htmlFor="zipCode">Zip Code*</Label>
                  <div className="relative">
                    <Input
                      id="zipCode"
                      value={formData.zipCode}
                      onChange={(e) => updateFormData('zipCode', e.target.value)}
                      placeholder=""
                      className="pr-10 border-b border-t-0 border-l-0 border-r-0 rounded-none focus-visible:ring-0 focus-visible:border-primary" />

                    <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <Mic className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>);


      case 2:
        return (
          <div className="space-y-6 animate-fade-in">
            <div className="border-t border-border pt-6">
              <h2 className="text-xl font-semibold text-primary mb-6">
                Thank You!
              </h2>
              <div className="border-t border-border pt-6 space-y-6">
                {/* Responsible Party/Payer */}
                <div className="space-y-4 pt-4">
                  <Label className="text-primary">Requesting Care For?</Label>
                   <RadioGroup
                    value={formData.responsibleParty}
                    onValueChange={(value) => updateFormData('responsibleParty', value)}
                    className="space-y-2">

                     <div className="flex items-center space-x-2">
                       <RadioGroupItem value="myself" id="myself" />
                       <Label htmlFor="myself" className="font-normal">Myself</Label>
                     </div>
                     <div className="flex items-center space-x-2">
                       <RadioGroupItem value="someone-else" id="someone-else" />
                       <Label htmlFor="someone-else" className="font-normal">Someone Else</Label>
                     </div>
                   </RadioGroup>
                   
                   

















                   
                   <button
                    type="button"
                    onClick={() => updateFormData('responsibleParty', '')}
                    className="text-sm text-muted-foreground hover:text-foreground">

                     Clear
                   </button>

                  {formData.responsibleParty === 'someone-else' &&
                  <div className="space-y-2">
                      <Label className="text-primary">(Your Name)</Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>First Name*</Label>
                          <Input
                          value={formData.responsiblePartyFirstName}
                          onChange={(e) => updateFormData('responsiblePartyFirstName', e.target.value)}
                          placeholder=""
                          className="border rounded-md" />
                        </div>
                        <div className="space-y-2">
                          <Label>Last Name*</Label>
                          <Input
                          value={formData.responsiblePartyLastName}
                          onChange={(e) => updateFormData('responsiblePartyLastName', e.target.value)}
                          placeholder=""
                          className="border rounded-md" />
                        </div>
                      </div>
                    </div>
                  }

                  <div className="space-y-2 pt-2">
                    <Label className="text-primary">
                      {formData.responsibleParty === 'myself' ?
                      'My Email or Email of My Point of Contact' :
                      'Responsible Party/Your Phone Number'}
                    </Label>
                    <div className="relative">
                      <Input
                        type="email"
                        value={formData.responsiblePartyEmail}
                        onChange={(e) => updateFormData('responsiblePartyEmail', e.target.value)}
                        placeholder=""
                        className="pr-10 border rounded-md" />

                      <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        <Mic className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-primary">(Patient)</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name*</Label>
                      <Input
                        id="firstName"
                        value={formData.firstName}
                        onChange={(e) => updateFormData('firstName', e.target.value)}
                        placeholder=""
                        className="border-b border-t-0 border-l-0 border-r-0 rounded-none focus-visible:ring-0 focus-visible:border-primary" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name*</Label>
                      <Input
                        id="lastName"
                        value={formData.lastName}
                        onChange={(e) => updateFormData('lastName', e.target.value)}
                        placeholder=""
                        className="border-b border-t-0 border-l-0 border-r-0 rounded-none focus-visible:ring-0 focus-visible:border-primary" />
                    </div>
                  </div>
                </div>
                
                {/* Date of Birth, Height, Weight */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dateOfBirth">Date of Birth*</Label>
                    <Input
                      id="dateOfBirth"
                      type="date"
                      value={formData.dateOfBirth}
                      onChange={(e) => updateFormData('dateOfBirth', e.target.value)}
                      className="border-b border-t-0 border-l-0 border-r-0 rounded-none focus-visible:ring-0 focus-visible:border-primary" />

                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="height">Height*</Label>
                    <Input
                      id="height"
                      value={formData.height}
                      onChange={(e) => updateFormData('height', e.target.value)}
                      placeholder="e.g., 5'8&quot;"
                      className="border-b border-t-0 border-l-0 border-r-0 rounded-none focus-visible:ring-0 focus-visible:border-primary" />

                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="weight">Weight*</Label>
                    <Input
                      id="weight"
                      value={formData.weight}
                      onChange={(e) => updateFormData('weight', e.target.value)}
                      placeholder="e.g., 150 lbs"
                      className="border-b border-t-0 border-l-0 border-r-0 rounded-none focus-visible:ring-0 focus-visible:border-primary" />

                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Patient/Home Phone Number Where We Are Delivering Care*</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => updateFormData('phone', e.target.value)}
                    placeholder=""
                    className="border-b border-t-0 border-l-0 border-r-0 rounded-none focus-visible:ring-0 focus-visible:border-primary" />

                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Street Address – Address Where We Are Going*</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => updateFormData('address', e.target.value)}
                    placeholder=""
                    className="border-b border-t-0 border-l-0 border-r-0 rounded-none focus-visible:ring-0 focus-visible:border-primary" />

                </div>
                <div className="space-y-2">
                  <Label htmlFor="addressLine2">Address Line 2</Label>
                  <Input
                    id="addressLine2"
                    value={formData.addressLine2}
                    onChange={(e) => updateFormData('addressLine2', e.target.value)}
                    placeholder=""
                    className="border-b border-t-0 border-l-0 border-r-0 rounded-none focus-visible:ring-0 focus-visible:border-primary" />

                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City*</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => updateFormData('city', e.target.value)}
                      placeholder=""
                      className="border-b border-t-0 border-l-0 border-r-0 rounded-none focus-visible:ring-0 focus-visible:border-primary" />

                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State*</Label>
                    <Select value={formData.state} onValueChange={(value) => updateFormData('state', value)}>
                      <SelectTrigger className="border-b border-t-0 border-l-0 border-r-0 rounded-none focus:ring-0">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AL">Alabama</SelectItem>
                        <SelectItem value="AK">Alaska</SelectItem>
                        <SelectItem value="AZ">Arizona</SelectItem>
                        <SelectItem value="AR">Arkansas</SelectItem>
                        <SelectItem value="CA">California</SelectItem>
                        <SelectItem value="CO">Colorado</SelectItem>
                        <SelectItem value="CT">Connecticut</SelectItem>
                        <SelectItem value="DE">Delaware</SelectItem>
                        <SelectItem value="FL">Florida</SelectItem>
                        <SelectItem value="GA">Georgia</SelectItem>
                        <SelectItem value="HI">Hawaii</SelectItem>
                        <SelectItem value="ID">Idaho</SelectItem>
                        <SelectItem value="IL">Illinois</SelectItem>
                        <SelectItem value="IN">Indiana</SelectItem>
                        <SelectItem value="IA">Iowa</SelectItem>
                        <SelectItem value="KS">Kansas</SelectItem>
                        <SelectItem value="KY">Kentucky</SelectItem>
                        <SelectItem value="LA">Louisiana</SelectItem>
                        <SelectItem value="ME">Maine</SelectItem>
                        <SelectItem value="MD">Maryland</SelectItem>
                        <SelectItem value="MA">Massachusetts</SelectItem>
                        <SelectItem value="MI">Michigan</SelectItem>
                        <SelectItem value="MN">Minnesota</SelectItem>
                        <SelectItem value="MS">Mississippi</SelectItem>
                        <SelectItem value="MO">Missouri</SelectItem>
                        <SelectItem value="MT">Montana</SelectItem>
                        <SelectItem value="NE">Nebraska</SelectItem>
                        <SelectItem value="NV">Nevada</SelectItem>
                        <SelectItem value="NH">New Hampshire</SelectItem>
                        <SelectItem value="NJ">New Jersey</SelectItem>
                        <SelectItem value="NM">New Mexico</SelectItem>
                        <SelectItem value="NY">New York</SelectItem>
                        <SelectItem value="NC">North Carolina</SelectItem>
                        <SelectItem value="ND">North Dakota</SelectItem>
                        <SelectItem value="OH">Ohio</SelectItem>
                        <SelectItem value="OK">Oklahoma</SelectItem>
                        <SelectItem value="OR">Oregon</SelectItem>
                        <SelectItem value="PA">Pennsylvania</SelectItem>
                        <SelectItem value="RI">Rhode Island</SelectItem>
                        <SelectItem value="SC">South Carolina</SelectItem>
                        <SelectItem value="SD">South Dakota</SelectItem>
                        <SelectItem value="TN">Tennessee</SelectItem>
                        <SelectItem value="TX">Texas</SelectItem>
                        <SelectItem value="UT">Utah</SelectItem>
                        <SelectItem value="VT">Vermont</SelectItem>
                        <SelectItem value="VA">Virginia</SelectItem>
                        <SelectItem value="WA">Washington</SelectItem>
                        <SelectItem value="WV">West Virginia</SelectItem>
                        <SelectItem value="WI">Wisconsin</SelectItem>
                        <SelectItem value="WY">Wyoming</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {/* Calendar Booking Section */}
                <div className="pt-6">
                  <BookingCalendar
                    selectedDate={formData.bookingDate}
                    onSelectDate={(date) => updateFormData('bookingDate', date)} />
                </div>

                {/* Recurring Weekly */}
                <div className="space-y-2 border-b border-border pb-4">
                  <Label className="font-semibold">Would you like this booking to be recurring?</Label>
                  <Select
                    value={formData.recurringWeekly}
                    onValueChange={(value) => updateFormData('recurringWeekly', value)}>
                    
                    <SelectTrigger className="border rounded-md">
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No, one-time only</SelectItem>
                      <SelectItem value="every-day">Every Day</SelectItem>
                      <SelectItem value="every-other-day">Every Other Day</SelectItem>
                      <SelectItem value="every-week">Every Week</SelectItem>
                      <SelectItem value="every-2-weeks">Every 2 Weeks</SelectItem>
                      <SelectItem value="every-3-weeks">Every 3 Weeks</SelectItem>
                      <SelectItem value="every-month">Every Month</SelectItem>
                      <SelectItem value="monday">Every Monday</SelectItem>
                      <SelectItem value="tuesday">Every Tuesday</SelectItem>
                      <SelectItem value="wednesday">Every Wednesday</SelectItem>
                      <SelectItem value="thursday">Every Thursday</SelectItem>
                      <SelectItem value="friday">Every Friday</SelectItem>
                      <SelectItem value="saturday">Every Saturday</SelectItem>
                      <SelectItem value="sunday">Every Sunday</SelectItem>
                      <SelectItem value="weekdays">Weekdays (Mon–Fri)</SelectItem>
                      <SelectItem value="weekends">Weekends (Sat–Sun)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Add Additional Dates */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="font-semibold">Add Additional Dates</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-md gap-2">
                          <Plus className="w-4 h-4" />
                          <CalendarIcon className="w-4 h-4" />
                          Add Date
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <Calendar
                          mode="multiple"
                          selected={formData.additionalDates}
                          onSelect={(dates) => updateFormData('additionalDates', dates ?? [])}
                          className="p-3 pointer-events-auto" />
                        
                      </PopoverContent>
                    </Popover>
                  </div>
                  {/* Display selected additional dates */}
                  {formData.additionalDates.length > 0 &&
                  <div className="flex flex-wrap gap-2">
                      {formData.additionalDates.map((date, index) =>
                    <div
                      key={index}
                      className="flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 rounded-full px-3 py-1 text-xs font-medium">
                      
                          <CalendarIcon className="w-3 h-3" />
                          {format(date, 'MMM d, yyyy')}
                          <button
                        type="button"
                        onClick={() => {
                          updateFormData('additionalDates', formData.additionalDates.filter((_, i) => i !== index));
                        }}
                        className="ml-1 hover:text-destructive">
                        
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                    )}
                    </div>
                  }
                </div>

                {/* Available Hours */}
                <div className="space-y-3">
                  <Label>Available Hours*</Label>
                  {AVAILABLE_HOURS.map((hour) =>
                  <div key={hour.id} className="flex items-center space-x-2">
                      <Checkbox
                      id={hour.id}
                      checked={formData.availableHours.includes(hour.id)}
                      onCheckedChange={() => toggleArrayItem('availableHours', hour.id)} />
                      <Label htmlFor={hour.id} className="font-normal">{hour.label}</Label>
                    </div>
                  )}
                </div>

                {/* Available Services */}
                <div className="space-y-4">
                  <Label className="font-semibold">Available Services*</Label>
                  <div className="grid grid-cols-4 gap-3">
                    {AVAILABLE_SERVICES.map((service) =>
                    <ServiceCard
                      key={service.id}
                      service={service.label}
                      image={service.image}
                      selected={formData.selectedServices.includes(service.id)}
                      onToggle={() => toggleArrayItem('selectedServices', service.id)} />
                    )}
                  </div>

                  {/* Pricing summary */}
                  {formData.selectedServices.length > 0 &&
                  <div className="bg-muted/50 rounded-lg p-3 text-sm">
                      <p className="font-medium text-foreground">
                        {formData.selectedServices.length} service{formData.selectedServices.length > 1 ? 's' : ''} selected
                        {' — '}
                        <span className="text-primary font-semibold">
                          {formData.selectedServices.length <= 2 ?
                        `$${formData.selectedServices.length * 55}/visit` :
                        `$${2 * 55 + (formData.selectedServices.length - 2) * 45}/visit`}
                        </span>
                      </p>
                      <p className="text-muted-foreground text-xs mt-1">
                        First 2 services: $55 each · 3rd service and beyond: $45 each
                      </p>
                    </div>
                  }

                  {/* Service Descriptions */}
                  {formData.selectedServices.length > 0 &&
                  <div className="space-y-4 pt-2">
                      <h3 className="text-lg font-semibold text-destructive">Services Descriptions – Please read carefully</h3>
                      {formData.selectedServices.map((serviceId, index) => {
                      const fee = index < 2 ? 55 : 45;
                      const descriptions: Record<string, {title: string;description: JSX.Element;}> = {
                        bathing: {
                          title: 'Bathing & Grooming Assistance',
                          description: <>Assistance with showering or bathing. Assistance with grooming. <strong>The client is required to provide toiletries.</strong></>
                        },
                        transferring: {
                          title: 'Transferring Assistance',
                          description: <>Assistance from a sitting surface to a sitting surface or a bed.</>
                        },
                        dressing: {
                          title: 'Dressing Assistance',
                          description: <>Assistance with dressing.</>
                        },
                        toileting: {
                          title: 'Toileting Assistance',
                          description: <>Assistance with using the toilet, commode. Including emptying and cleaning the commode. <strong>*Please note: Catheter care cannot be provided.</strong></>
                        },
                        walking: {
                          title: 'Walking Assistance',
                          description: <>Ambulation assistance with fall assistance.</>
                        },
                        meal: {
                          title: 'Meal Prep/Feeding Assistance',
                          description: <>Preparing or assisting the client with cooking and serving meals. <strong>*Clients are responsible for providing all the supplies needed for meal preparation.</strong></>
                        },
                        housekeeping: {
                          title: 'Light Housekeeping Assistance',
                          description: <>Ensuring the house is safe and clean for the client by assisting with light cleaning, changing bed linens, organizing, and taking the trash can to the curb. <strong>*Clients are responsible for cleaning supplies. Not a Deep Clean Service.</strong></>
                        },
                        medication: {
                          title: 'Medication Assistance',
                          description: <>Medication reminder, plus assisting the client as they fill their weekly pill box. <strong>*Note: Caregivers cannot manage medications.</strong></>
                        },
                        transportation: {
                          title: 'Transportation',
                          description: <><strong className="text-destructive">If you need transportation please call 916-266-6453</strong></>
                        }
                      };
                      const svc = descriptions[serviceId];
                      if (!svc) return null;
                      return (
                        <div key={serviceId} className="border rounded-lg p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="font-semibold text-foreground text-sm">
                                <strong>{svc.title}</strong> – <span className="text-primary font-semibold">${fee}</span>
                              </p>
                            </div>
                            <p className="text-sm text-foreground leading-relaxed">{svc.description}</p>
                            <div className="flex items-start gap-2 pt-1">
                              <Checkbox id={`confirm-${serviceId}`} />
                              <Label htmlFor={`confirm-${serviceId}`} className="font-normal text-sm text-muted-foreground leading-relaxed">
                                I confirm that I have read and understood the scope of the {svc.title} service.*
                              </Label>
                            </div>
                          </div>);

                    })}
                    </div>
                  }
                </div>

                













                

                <div className="space-y-2">
                  <Label htmlFor="additionalInfo">Additional Information</Label>
                  <Textarea
                    id="additionalInfo"
                    value={formData.additionalInfo}
                    onChange={(e) => updateFormData('additionalInfo', e.target.value)}
                    placeholder="Tell us anything else you'd like us to know..."
                    rows={4}
                    className="border rounded-md" />
                </div>

                {/* Account Setup Section */}
                <div className="space-y-4 pt-6">
                  <h3 className="text-xl font-semibold text-primary">Set Up Your Login</h3>
                  <div className="border-t border-border pt-4 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signupEmail" className="text-primary">Username (Email) *</Label>
                      <Input
                        id="signupEmail"
                        type="email"
                        value={formData.responsiblePartyEmail}
                        disabled
                        className="border rounded-md bg-muted" />
                      
                      <p className="text-xs text-muted-foreground">Your email above will be used as your username to log in.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signupPassword">Password *</Label>
                      <Input
                        id="signupPassword"
                        type="password"
                        value={formData.password}
                        onChange={(e) => updateFormData('password', e.target.value)}
                        placeholder="Min. 6 characters"
                        className="border rounded-md" />
                      
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signupConfirmPassword">Confirm Password *</Label>
                      <Input
                        id="signupConfirmPassword"
                        type="password"
                        value={formData.confirmPassword}
                        onChange={(e) => updateFormData('confirmPassword', e.target.value)}
                        placeholder="Re-enter your password"
                        className="border rounded-md" />
                      
                    </div>
                  </div>
                </div>

                <div className="space-y-4 pt-6">
                  <h3 className="text-xl font-semibold text-primary">Payment</h3>
                  <div className="border-t border-border pt-4">
                    <Label className="text-primary">Card Number</Label>
                    <Input
                      value={formData.cardNumber || ''}
                      onChange={(e) => setFormData({ ...formData, cardNumber: e.target.value })}
                      placeholder="•••• •••• •••• ••••"
                      maxLength={19}
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="flex items-start space-x-2 pt-4">
                  <Checkbox
                    id="agreeTerms"
                    checked={formData.agreeTerms}
                    onCheckedChange={(checked) => updateFormData('agreeTerms', checked)} />

                  <Label htmlFor="agreeTerms" className="font-normal text-sm leading-relaxed">
                    I agree to the Terms of Service and Privacy Policy. I understand that my information will be used to match me with appropriate care services.
                  </Label>
                </div>
              </div>
            </div>
          </div>);


      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Bathing Dialog */}
      <Dialog open={bathingDialogOpen} onOpenChange={setBathingDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bathing & Grooming Assistance</DialogTitle>
            <DialogDescription className="pt-2">
              Dressing Assistance is often requested by those who request Bathing & Grooming Assistance. Would you also like to add Dressing Assistance?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setBathingDialogOpen(false)}>No, thanks</Button>
            <Button onClick={() => {
              if (!formData.selectedServices.includes('dressing')) {
                updateFormData('selectedServices', [...formData.selectedServices, 'dressing']);
              }
              setBathingDialogOpen(false);
            }}>Yes, add Dressing</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transportation Dialog */}
      <Dialog open={transportDialogOpen} onOpenChange={setTransportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transportation</DialogTitle>
            <DialogDescription className="pt-2">
              We will call to determine the length of time needed for transportation. The amount of time needed and cost will be detailed as part of the call.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end pt-2">
            <Button onClick={() => setTransportDialogOpen(false)}>I understand</Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Header */}
      <header className="p-4 border-b border-border">
        <div className="flex items-center justify-center">
          <Logo size="sm" variant="light" />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 max-w-lg mx-auto w-full">
        {/* Title */}
        <h1 className="text-2xl font-bold text-primary text-center mb-2">
          Client Application
        </h1>
        <p className="text-center text-sm text-muted-foreground mb-6">
          Already have an account?{' '}
          <Link to="/client-login" className="text-primary font-medium hover:underline">
            Log In
          </Link>
        </p>

        {/* Progress Bar */}
        <ProgressBar currentStep={currentStep} totalSteps={totalSteps} className="mb-8" />

        {/* Step Content */}
        <div className="mb-8">
          {renderStep()}
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-end gap-4 border-t border-border pt-6">
          {currentStep > 1 &&
          <Button
            type="button"
            variant="outline"
            onClick={handleBack}>

              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          }
          
          {currentStep < totalSteps ?
          <Button
            type="button"
            onClick={handleNext}
            className="bg-[hsl(231,41%,48%)] hover:bg-[hsl(231,41%,40%)] px-8">

              Next
            </Button> :

          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!formData.agreeTerms || loading}
            className="bg-[hsl(231,41%,48%)] hover:bg-[hsl(231,41%,40%)] px-8">

              {loading ? 'Creating Account...' : 'Submit Application'}
            </Button>
          }
        </div>
      </main>

      {/* Footer */}
      <footer className="p-4 text-center text-xs text-muted-foreground border-t border-border">
        <p>Powered by Care-On-Demand</p>
      </footer>
    </div>);

};

export default SignUp;