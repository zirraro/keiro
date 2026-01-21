'use client';

interface BookDemoButtonProps {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function BookDemoButton({ variant = 'primary', size = 'md', className = '' }: BookDemoButtonProps) {
  const openCalendly = () => {
    window.open('https://calendly.com/contact-keiroai/30min', '_blank');
  };

  // Styles de base
  const baseStyles = 'inline-flex items-center gap-2 rounded-lg font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2';

  // Variants
  const variantStyles = {
    primary: 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:shadow-lg hover:scale-105 focus:ring-blue-500',
    secondary: 'bg-purple-600 text-white hover:bg-purple-700 hover:shadow-lg hover:scale-105 focus:ring-purple-500',
    outline: 'bg-white text-blue-600 border-2 border-blue-500 hover:bg-blue-50 focus:ring-blue-500'
  };

  // Sizes
  const sizeStyles = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-5 py-3 text-base',
    lg: 'px-6 py-4 text-lg'
  };

  return (
    <button
      onClick={openCalendly}
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      <svg className={size === 'sm' ? 'w-4 h-4' : size === 'md' ? 'w-5 h-5' : 'w-6 h-6'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <span>Réserver une démo</span>
    </button>
  );
}
