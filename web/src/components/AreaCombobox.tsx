import { type Accessor, createEffect, createMemo, createSignal } from "solid-js";
import { useI18n } from "~/i18n";
import {
  Combobox,
  ComboboxControl,
  ComboboxInput,
  ComboboxTrigger,
  ComboboxContent,
  ComboboxItem,
  ComboboxItemLabel,
  ComboboxItemIndicator,
} from "~/components/ui/combobox";
import { cn } from "~/lib/utils";
import type { AreaSummary } from "~/types";

export interface AreaComboboxProps {
  value: string;
  onChange: (value: string) => void;
  areas: Accessor<AreaSummary[] | undefined>;
  placeholder?: string;
  class?: string;
  disabled?: boolean;
}

export function AreaCombobox(props: AreaComboboxProps) {
  const { t } = useI18n();
  const [inputText, setInputText] = createSignal(props.value || "");
  let controlEl: HTMLDivElement | undefined;

  createEffect(() => {
    setInputText(props.value || "");
  });

  const areaOptions = createMemo(() => {
    const list = props.areas() ?? [];
    const set = new Set<string>();
    for (const a of list) {
      if (a.name) {
        set.add(a.name);
      }
    }
    const current = props.value?.trim();
    if (current) {
      set.add(current);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  });

  const commitValue = (val: string) => {
    const trimmed = val.trim();
    setInputText(trimmed);
    if (trimmed !== props.value) {
      props.onChange(trimmed);
    }
  };

  const handleBlur = (e: FocusEvent) => {
    const related = e.relatedTarget as Node | null;
    if (controlEl && related && controlEl.contains(related)) {
      return;
    }
    commitValue(inputText());
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      commitValue(inputText());
    }
  };

  return (
    <Combobox<string>
      class={cn("w-full", props.class)}
      options={areaOptions()}
      value={props.value || null}
      onChange={(selected) => {
        if (selected !== null && selected !== undefined) {
          commitValue(selected);
        }
      }}
      onInputChange={(text) => {
        setInputText(text);
      }}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          commitValue(inputText());
        }
      }}
      defaultFilter="contains"
      triggerMode="input"
      noResetInputOnBlur={true}
      sameWidth={true}
      disabled={props.disabled}
      itemComponent={(itemProps) => (
        <ComboboxItem item={itemProps.item}>
          <ComboboxItemLabel>{itemProps.item.rawValue}</ComboboxItemLabel>
          <ComboboxItemIndicator />
        </ComboboxItem>
      )}
    >
      <ComboboxControl
        ref={controlEl}
        class="h-9 border-input bg-transparent focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
      >
        <ComboboxInput
          class="h-full py-0 text-sm"
          placeholder={props.placeholder ?? t("common.selectArea")}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        <ComboboxTrigger />
      </ComboboxControl>
      <ComboboxContent class="max-h-60 overflow-y-auto" />
    </Combobox>
  );
}
