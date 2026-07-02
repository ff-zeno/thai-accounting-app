"use client";

import { AlertTriangleIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg py-16">
      <Alert variant="destructive">
        <AlertTriangleIcon />
        <AlertTitle>Something went wrong loading this page</AlertTitle>
        <AlertDescription>
          <p>
            The error has been reported.
            {error.digest ? ` Reference: ${error.digest}` : ""}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={reset}
            className="mt-3"
          >
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}
