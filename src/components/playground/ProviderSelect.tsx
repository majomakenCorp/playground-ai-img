"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { ProviderOption } from "@/components/playground/Playground";

export function ProviderSelect({
  providers,
  value,
  onChange,
  disabled,
}: {
  providers: ProviderOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="provider">Provider</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id="provider" className="w-full">
          <SelectValue placeholder="Choose a provider" />
        </SelectTrigger>
        <SelectContent>
          {providers.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
