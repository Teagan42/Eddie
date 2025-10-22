import { type ComponentType } from "react";
import { Flex, Text } from "@radix-ui/themes";
import { PaperPlaneIcon } from "@radix-ui/react-icons";
import { AlertTriangle, Loader2, Sparkles as SparklesIcon, Wrench } from "lucide-react";
import { cn } from "../vendor/lib/utils";

export type AgentActivityState =
  | "idle"
  | "sending"
  | "thinking"
  | "tool"
  | "tool-error"
  | "error";

interface AgentActivityDescriptor {
  title: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
  gradient: string;
  iconClassName?: string;
  ringClassName?: string;
}

const AGENT_ACTIVITY_VARIANTS = {
  sending: {
    title: "Dispatching message…",
    subtitle: "Contacting orchestrator",
    icon: PaperPlaneIcon,
    gradient: "from-sky-500/25 via-sky-500/10 to-emerald-400/10",
    iconClassName: "animate-bounce text-sky-100",
    ringClassName: "animate-ping bg-sky-400/30",
  },
  thinking: {
    title: "Agent is thinking…",
    subtitle: "Synthesizing a response",
    icon: SparklesIcon,
    gradient: "from-emerald-400/25 via-slate-900/60 to-sky-500/20",
    iconClassName: "animate-pulse text-emerald-100",
    ringClassName: "animate-[ping_1.5s_linear_infinite] bg-emerald-400/25",
  },
  tool: {
    title: "Calling tools…",
    subtitle: "Live tool invocation in progress",
    icon: Loader2,
    gradient: "from-amber-400/25 via-slate-900/60 to-sky-500/20",
    iconClassName: "animate-spin text-amber-100",
    ringClassName: "animate-pulse bg-amber-400/30",
  },
  'tool-error': {
    title: "Tool invocation failed",
    subtitle: "A tool call encountered an issue",
    icon: Wrench,
    gradient: "from-amber-500/25 via-slate-900/60 to-rose-500/25",
    iconClassName: "text-amber-100 animate-[pulse_1.4s_linear_infinite]",
    ringClassName: "animate-[ping_2s_linear_infinite] bg-amber-500/25",
  },
  error: {
    title: "Agent run failed",
    subtitle: "Check logs for more details",
    icon: AlertTriangle,
    gradient: "from-rose-500/30 via-slate-900/60 to-red-500/30",
    iconClassName: "text-rose-100 animate-pulse",
    ringClassName: "animate-[ping_1.8s_linear_infinite] bg-rose-500/30",
  },
} satisfies Record<Exclude<AgentActivityState, "idle">, AgentActivityDescriptor>;

export type AgentActivityIndicatorProps = {
  state: AgentActivityState;
};

export function AgentActivityIndicator({
  state,
}: AgentActivityIndicatorProps): JSX.Element | null {
  if (state === "idle") {
    return null;
  }

  const descriptor = AGENT_ACTIVITY_VARIANTS[state];
  if (!descriptor) {
    return null;
  }

  const Icon = descriptor.icon;

  return (
    <Flex
      data-testid="agent-activity-indicator"
      role="status"
      aria-label={descriptor.title}
      align="center"
      gap="3"
      className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 shadow-[0_35px_65px_-45px_rgba(56,189,248,0.65)] backdrop-blur-xl"
    >
      <div
        className={cn(
          "relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br",
          descriptor.gradient,
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute -inset-1 rounded-full opacity-80",
            descriptor.ringClassName,
          )}
        />
        <Icon className={cn("relative h-5 w-5 text-white drop-shadow-sm", descriptor.iconClassName)} />
      </div>
      <Flex direction="column" gap="1">
        <Text size="2" weight="medium" className="text-white">
          {descriptor.title}
        </Text>
        <Text size="1" color="gray">
          {descriptor.subtitle}
        </Text>
      </Flex>
    </Flex>
  );
}
