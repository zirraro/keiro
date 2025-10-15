import * as React from "react"; import { cn } from "@/lib/utils";
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;
export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-[12px] placeholder:text-gray-400 focus:outline-none", className)} {...props} />
)); Input.displayName="Input"; export default Input;
