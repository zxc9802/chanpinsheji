type IconProps = { className?: string };

export function BoxIcon({ className = "" }: IconProps) {
  return <span className={`brand-mark ${className}`} aria-hidden="true"><span /></span>;
}

export function CheckIcon() {
  return <span className="check-icon" aria-hidden="true">✓</span>;
}
