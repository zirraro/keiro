import * as React from "react"; import { cn } from "@/lib/utils";
export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn("min-h-[80px] w-full rounded-md border border-gray-300 bg-white p-2 text-[12px] placeholder:text-gray-400 focus:outline-none", className)} {...props} />
)); Textarea.displayName="Textarea"; export default Textarea;
