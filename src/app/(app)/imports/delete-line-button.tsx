"use client";

import { Button } from "@/components/ui/button";

export function DeleteLineButton({
  label,
  message,
}: {
  label: string;
  message: string;
}) {
  return (
    <Button
      type="submit"
      variant="outline"
      size="sm"
      onClick={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
        }
      }}
    >
      {label}
    </Button>
  );
}
