export default function GradientDivider() {
  return (
    <div className="relative my-8">
      <div className="h-px w-full bg-gradient-to-r from-transparent via-neutral-700 to-transparent" />
      <div className="absolute -top-[2px] left-1/2 -translate-x-1/2 h-1 w-40 rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500 blur-sm opacity-60" />
    </div>
  );
}
