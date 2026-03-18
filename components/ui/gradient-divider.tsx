export default function GradientDivider() {
  return (
    <div className="relative my-8">
      <div className="h-px w-full bg-gradient-to-r from-transparent via-neutral-700 to-transparent" />
      <div className="absolute -top-[2px] left-1/2 -translate-x-1/2 h-1 w-40 rounded-full bg-gradient-to-r from-[#0c1a3a] via-[#1e3a5f] to-[#0c1a3a] blur-sm opacity-60" />
    </div>
  );
}
