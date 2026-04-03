import { CircleCheck, AlertTriangle, CircleAlert } from "lucide-react";

interface Props {
  matchRate: number;
  falsePositivePct: number;
  aliasConflicts: number;
  aiApprovalRate: number | null;
}

type HealthLevel = "healthy" | "attention" | "warning";

function computeHealth(props: Props): {
  level: HealthLevel;
  message: string;
} {
  const issues: string[] = [];

  if (props.matchRate < 0.5) issues.push("low match rate");
  if (props.falsePositivePct > 10) issues.push("high false positive rate");
  if (props.aliasConflicts > 5) issues.push(`${props.aliasConflicts} alias conflicts`);
  if (props.aiApprovalRate !== null && props.aiApprovalRate < 50) {
    issues.push("AI suggestions often rejected");
  }

  if (issues.length === 0) {
    const ratePct = (props.matchRate * 100).toFixed(0);
    const aiNote =
      props.aiApprovalRate !== null
        ? `, AI approval rate ${props.aiApprovalRate.toFixed(0)}%`
        : "";
    return {
      level: "healthy",
      message: `${ratePct}% match rate${aiNote}. Reconciliation is running smoothly.`,
    };
  }

  if (issues.length <= 2 && props.matchRate >= 0.5) {
    return {
      level: "attention",
      message: `Needs attention: ${issues.join(", ")}.`,
    };
  }

  return {
    level: "warning",
    message: `Action needed: ${issues.join(", ")}.`,
  };
}

const LEVEL_CONFIG: Record<
  HealthLevel,
  { bg: string; border: string; text: string; icon: typeof CircleCheck }
> = {
  healthy: {
    bg: "bg-green-50",
    border: "border-green-200",
    text: "text-green-800",
    icon: CircleCheck,
  },
  attention: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
    icon: AlertTriangle,
  },
  warning: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-800",
    icon: CircleAlert,
  },
};

export function HealthSummary(props: Props) {
  const { level, message } = computeHealth(props);
  const config = LEVEL_CONFIG[level];
  const Icon = config.icon;

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${config.bg} ${config.border}`}
    >
      <Icon className={`size-5 shrink-0 ${config.text}`} />
      <p className={`text-sm font-medium ${config.text}`}>{message}</p>
    </div>
  );
}
