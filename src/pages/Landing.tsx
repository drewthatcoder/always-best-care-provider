import { useNavigate } from 'react-router-dom';
import { Shield, ClipboardList, UserCheck, ArrowRight, MapPin, Clock, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Logo from '@/components/Logo';

const Landing = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="w-full flex items-center justify-between px-6 py-4 bg-primary text-primary-foreground">
        <div className="flex items-center gap-3">
          <Logo size="sm" variant="light" />
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => navigate('/register')}
            className="bg-white text-primary hover:bg-white/90 font-semibold"
          >
            Register Now
          </Button>
          <Button
            onClick={() => navigate('/provider-login')}
            className="bg-white text-primary hover:bg-white/90 font-semibold"
          >
            Provider Login
          </Button>
          <Button
            onClick={() => navigate('/admin-login')}
            className="bg-white text-primary hover:bg-white/90 font-semibold"
          >
            Admin
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="care-gradient relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_hsl(210_100%_50%_/_0.15),_transparent_60%)]" />
        <div className="relative max-w-4xl mx-auto px-6 py-20 md:py-32 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-primary-foreground leading-tight tracking-tight mb-6">
            Join the Always Best Care
            <span className="block text-accent mt-1">Register Now</span>
          </h1>
          <p className="text-lg md:text-xl text-primary-foreground/80 max-w-2xl mx-auto mb-10 leading-relaxed">
            Deliver compassionate senior care in your community. Choose your own schedule, serve clients in your area, and make a meaningful difference every day.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              onClick={() => navigate('/register')}
              size="lg"
              className="bg-white text-primary hover:bg-white/90 font-bold text-lg px-8 py-6 shadow-lg"
            >
              Get Started <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 md:py-24 px-6 bg-secondary">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground text-center mb-12">
            Why Providers Choose Us
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <BenefitCard
              icon={<MapPin className="w-8 h-8" />}
              title="Work in Your Area"
              description="Set your service territory by zip code and only receive clients near you."
            />
            <BenefitCard
              icon={<Clock className="w-8 h-8" />}
              title="Flexible Schedule"
              description="Accept jobs that fit your availability. You're in control of when you work."
            />
            <BenefitCard
              icon={<DollarSign className="w-8 h-8" />}
              title="Competitive Pay"
              description="Earn competitive rates for the essential care services you provide."
            />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 md:py-24 px-6 bg-background">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground text-center mb-16">
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <StepCard
              step={1}
              icon={<ClipboardList className="w-7 h-7" />}
              title="Register Online"
              description="Fill out your application with your info, service areas, and availability."
            />
            <StepCard
              step={2}
              icon={<Shield className="w-7 h-7" />}
              title="Get Verified"
              description="We review your application and credentials to ensure quality care."
            />
            <StepCard
              step={3}
              icon={<UserCheck className="w-7 h-7" />}
              title="Start Caring"
              description="Download the app, accept jobs in your territory, and begin making a difference."
            />
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <section className="care-gradient py-16 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
            Ready to Make a Difference?
          </h2>
          <p className="text-primary-foreground/80 text-lg mb-8">
            Join our network of compassionate care providers today.
          </p>
          <Button
            onClick={() => navigate('/register')}
            size="lg"
            className="bg-white text-primary hover:bg-white/90 font-bold text-lg px-10 py-6 shadow-lg"
          >
            Register Now <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-foreground text-primary-foreground/60 py-8 px-6 text-center text-sm">
        <p>© {new Date().getFullYear()} Always Best Care Senior Services. All rights reserved.</p>
      </footer>
    </div>
  );
};

const BenefitCard = ({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) => (
  <div className="bg-card rounded-xl p-6 text-center shadow-sm border border-border hover:shadow-md transition-shadow">
    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 text-primary">
      {icon}
    </div>
    <h3 className="text-lg font-bold text-foreground mb-2">{title}</h3>
    <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
  </div>
);

const StepCard = ({ step, icon, title, description }: { step: number; icon: React.ReactNode; title: string; description: string }) => (
  <div className="text-center">
    <div className="relative w-16 h-16 rounded-full bg-primary flex items-center justify-center mx-auto mb-5 text-primary-foreground shadow-lg">
      {icon}
      <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-accent text-accent-foreground text-xs font-bold flex items-center justify-center">
        {step}
      </span>
    </div>
    <h3 className="text-lg font-bold text-foreground mb-2">{title}</h3>
    <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
  </div>
);

export default Landing;
