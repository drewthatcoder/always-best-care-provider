import { Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ALWAYS_BEST_CARE_PHONE_DISPLAY, alwaysBestCareTelHref } from '@/lib/supportContact';

type Tone = 'on-primary' | 'solid' | 'sheet';

const toneClass: Record<Tone, string> = {
  'on-primary': 'bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground',
  solid: 'bg-primary text-primary-foreground hover:bg-primary/90',
  sheet: 'w-full bg-white/15 hover:bg-white/25 text-white border border-white/30',
};

interface CallAlwaysBestCareButtonProps {
  tone?: Tone;
  className?: string;
}

/** tel: link for the Always Best Care dispatch number. */
const CallAlwaysBestCareButton = ({ tone = 'solid', className }: CallAlwaysBestCareButtonProps) => (
  <a
    href={alwaysBestCareTelHref}
    data-testid="call-always-best-care"
    className={cn(
      'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
      toneClass[tone],
      className,
    )}
  >
    <Phone className="w-4 h-4 shrink-0" />
    <span>Call Always Best Care</span>
    <span className="font-semibold">{ALWAYS_BEST_CARE_PHONE_DISPLAY}</span>
  </a>
);

export default CallAlwaysBestCareButton;
