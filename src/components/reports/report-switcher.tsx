"use client";

import { useRouter } from "next/navigation";
import { NativeSelect } from "@/components/ui/native-select";
import { reportGroups } from "./report-catalog";

/**
 * Compact report hopper for the PageHeader of individual report pages —
 * jump straight to a sibling report without going back to the hub.
 */
export function ReportSwitcher({ current }: { current: string }) {
  const router = useRouter();

  return (
    <NativeSelect
      aria-label="Switch report"
      value={current}
      onChange={(event) => {
        const href = event.target.value;
        if (href !== current) router.push(href);
      }}
    >
      {reportGroups.map((group) => (
        <optgroup key={group.title} label={group.title}>
          {group.reports.map((report) => (
            <option key={report.href} value={report.href}>
              {report.title}
            </option>
          ))}
        </optgroup>
      ))}
    </NativeSelect>
  );
}
