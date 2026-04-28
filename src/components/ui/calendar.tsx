"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import "react-day-picker/style.css";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * Calendar — react-day-picker v9 with the library's default CSS (keeps things
 * sane for now). We apply only lightweight container styles; heavy theme work
 * can come in a follow-up once the shape of our date picker use-cases lands.
 */
function Calendar({ className, ...props }: CalendarProps) {
  return (
    <DayPicker
      className={cn("p-3", className)}
      captionLayout="dropdown"
      {...props}
    />
  );
}

export { Calendar };
