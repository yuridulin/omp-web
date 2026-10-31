import type { ReactNode, SVGProps } from "react";

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  size?: number;
  children?: ReactNode;
}

type Props = Omit<IconProps, "children">;

function Icon({ size = 16, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function SendIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </Icon>
  );
}

export function StopIcon(props: Props) {
  return (
    <Icon {...props}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function SteerIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H9a4 4 0 0 0-4 4v2" />
    </Icon>
  );
}

export function QueueIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M4 6h16M4 12h10M4 18h10" />
      <path d="M18 15v6M15 18h6" />
    </Icon>
  );
}

export function ChevronDownIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function ModelIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7L12 3Z" />
      <path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
    </Icon>
  );
}

export function ThinkingIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M3.5 18.5a9 9 0 1 1 17 0" />
      <path d="M12 14l4.5-4.5" />
      <circle cx="12" cy="14" r="1.5" />
    </Icon>
  );
}

export function TurnsIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3v-3.2A2.5 2.5 0 0 1 4 14.5v-8Z" />
    </Icon>
  );
}

export function StepsIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 16 9 5 9-5" />
    </Icon>
  );
}

export function TokensIcon(props: Props) {
  return (
    <Icon {...props}>
      <ellipse cx="12" cy="5.5" rx="7" ry="3" />
      <path d="M5 5.5v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
      <path d="M5 11.5v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </Icon>
  );
}

export function CacheIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </Icon>
  );
}
