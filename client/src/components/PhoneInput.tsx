import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { formatPhoneInput, cleanPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import type { ComponentPropsWithoutRef } from "react";

type InputProps = ComponentPropsWithoutRef<typeof Input>;

export interface PhoneInputProps extends Omit<InputProps, "type" | "onChange"> {
  /**
   * The current value — should be a formatted string like "(555) 123-4567"
   * or raw digits. The component will display it correctly either way.
   */
  value?: string;
  /**
   * Called with the formatted string (e.g. "(555) 123-4567") on every change.
   * Pass this directly to react-hook-form's field.onChange.
   */
  onChange?: (value: string) => void;
}

/**
 * PhoneInput — drop-in phone number input with built-in formatting.
 *
 * Features:
 * - Live (XXX) XXX-XXXX formatting on every keystroke
 * - Paste sanitization: strips all non-numeric characters, then formats
 * - Accepts only up to 10 digits — extra digits are silently ignored
 * - Works with react-hook-form via spread: <PhoneInput {...field} />
 * - ref-forwarded for react-hook-form compatibility
 *
 * Usage with react-hook-form:
 *   <FormField
 *     control={form.control}
 *     name="phoneNumber"
 *     render={({ field }) => (
 *       <FormItem>
 *         <FormLabel>Phone</FormLabel>
 *         <FormControl>
 *           <PhoneInput {...field} />
 *         </FormControl>
 *         <FormMessage />
 *       </FormItem>
 *     )}
 *   />
 *
 * Usage standalone:
 *   <PhoneInput value={phone} onChange={setPhone} />
 */
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value = "", onChange, placeholder = "(555) 123-4567", className, onPaste, ...rest }, ref) => {

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const formatted = formatPhoneInput(e.target.value);
      onChange?.(formatted);
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text");
      const formatted = formatPhoneInput(cleanPhone(pasted));
      onChange?.(formatted);
      onPaste?.(e);
    };

    return (
      <Input
        {...rest}
        ref={ref}
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onPaste={handlePaste}
        className={cn("tabular-nums", className)}
      />
    );
  }
);

PhoneInput.displayName = "PhoneInput";
