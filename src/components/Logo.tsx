import abcLogo from '@/assets/brand/abc-logo.svg';

interface LogoProps {
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
}

const Logo = ({ variant = 'light', size = 'md' }: LogoProps) => {
  const containerSizes = {
    sm: 'w-20 h-24',
    md: 'w-28 h-32',
    lg: 'w-36 h-40',
  };

  return (
    <div className="flex flex-col items-center" data-variant={variant}>
      <div className={`${containerSizes[size]} bg-white rounded-2xl shadow-lg flex items-center justify-center p-2`}>
        <img
          src={abcLogo}
          alt="Always Best Care Senior Services"
          className="w-full h-full object-contain"
          draggable={false}
        />
      </div>
    </div>
  );
};

export default Logo;
