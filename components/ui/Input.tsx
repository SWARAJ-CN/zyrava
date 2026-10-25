import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useMemo,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import {
  Input as HeroInput,
  ListBox,
  Select as HeroSelect,
  TextArea as HeroTextArea,
} from "@heroui/react";
import { cn } from "@/lib/cn";
import { useI18n } from "@/components/providers/I18nProvider";

/**
 * Carries the visible `Field` label down to controls that need to describe
 * themselves to assistive tech (React Aria's hidden native controls).
 */
const FieldLabelContext = createContext<string | undefined>(undefined);

export { FieldLabelContext };

interface SelectOption {
  value: string;
  label: ReactNode;
  /** Plain-text form of the label, for the placeholder. */
  text: string;
  disabled?: boolean;
}

/** Reads the plain `<option>` children the rest of the app already passes in. */
function parseOptions(children: ReactNode): SelectOption[] {
  const options: SelectOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as {
      value?: unknown;
      children?: ReactNode;
      disabled?: boolean;
    };
    const label = props.children;
    options.push({
      value: String(props.value ?? ""),
      label,
      text: typeof label === "string" || typeof label === "number" ? String(label) : "",
      disabled: props.disabled,
    });
  });
  return options;
}

interface SelectChangeEvent {
  target: { value: string };
}

interface SelectProps {
  id?: string;
  value?: string;
  onChange?: (event: SelectChangeEvent) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
  children: ReactNode;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <HeroInput className={className} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <HeroTextArea className={cn("min-h-20 resize-y", className)} {...props} />;
}

export function Select({
  className,
  children,
  value,
  onChange,
  placeholder,
  ...props
}: SelectProps) {
  const { t } = useI18n();
  const options = useMemo(() => parseOptions(children), [children]);
  const placeholderOption = options.find((option) => option.value === "");
  const items = options.filter((option) => option.value !== "");
  const selected = value === undefined || value === null || value === "" ? null : String(value);
  const fieldLabel = useContext(FieldLabelContext);
  const ariaLabel = props["aria-label"] ?? fieldLabel ?? placeholder ?? placeholderOption?.text;

  return (
    <HeroSelect
      aria-label={ariaLabel}
      className={cn("w-full", className)}
      fullWidth
      isDisabled={props.disabled}
      isRequired={props.required}
      placeholder={placeholder ?? placeholderOption?.text ?? t("Select…")}
      selectedKey={selected}
      onSelectionChange={(key) =>
        onChange?.({
          target: { value: key === null ? "" : String(key) },
        } as SelectChangeEvent)
      }
    >
      <HeroSelect.Trigger id={props.id} aria-label={ariaLabel}>
        <HeroSelect.Value />
        <HeroSelect.Indicator />
      </HeroSelect.Trigger>
      <HeroSelect.Popover>
        <ListBox>
          {items.map((option) => (
            <ListBox.Item
              key={option.value}
              id={option.value}
              isDisabled={option.disabled}
              textValue={option.text || String(option.label)}
            >
              {option.label}
            </ListBox.Item>
          ))}
        </ListBox>
      </HeroSelect.Popover>
    </HeroSelect>
  );
}

interface FieldProps {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: FieldProps) {
  return (
    <FieldLabelContext.Provider value={typeof label === "string" ? label : undefined}>
      <div className={cn("flex flex-col gap-1.5", className)}>
        <label
          htmlFor={htmlFor}
          className="flex items-center gap-1 text-xs font-semibold text-muted"
        >
          {label}
          {required ? <span className="text-danger">*</span> : null}
        </label>
        {children}
        {error ? (
          <p className="text-xs font-medium text-danger">{error}</p>
        ) : hint ? (
          <p className="text-xs text-muted">{hint}</p>
        ) : null}
      </div>
    </FieldLabelContext.Provider>
  );
}
