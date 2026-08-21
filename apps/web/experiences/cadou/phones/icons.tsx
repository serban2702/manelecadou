import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { filled?: boolean };

function base(props: IconProps) {
  const { filled: _f, ...rest } = props;
  return rest;
}

export function IconHeart({ filled, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} {...base(props)}>
      <path
        d="M12 20.4S3.6 15.1 2.2 10.6C1.2 7.4 3 4.6 5.9 4.2c1.7-.2 3.3.5 4.3 1.8L12 8l1.8-2c1-1.3 2.6-2 4.3-1.8 2.9.4 4.7 3.2 3.7 6.4C20.4 15.1 12 20.4 12 20.4z"
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.8}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconComment(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...base(props)}>
      <path
        d="M6.2 18.6 4 21.2V8.4A3.4 3.4 0 0 1 7.4 5h9.2A3.4 3.4 0 0 1 20 8.4v6.8A3.4 3.4 0 0 1 16.6 18.6H6.2z"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconBookmark({ filled, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} {...base(props)}>
      <path
        d="M6.4 4.4h11.2v15.4L12 16.2 6.4 19.8V4.4z"
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.8}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconShare(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...base(props)}>
      <path
        d="M14.2 6.2 20 12l-5.8 5.8M20 12H9.4M4 6.5v11"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...base(props)}>
      <circle cx="10.5" cy="10.5" r="6.2" stroke="currentColor" strokeWidth={2} />
      <path d="M15.4 15.4 20 20" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

export function IconHome({ filled, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} {...base(props)}>
      <path
        d="M4.4 10.6 12 4.4l7.6 6.2V19a1.6 1.6 0 0 1-1.6 1.6h-3.4v-5.2h-5.2V20.6H6A1.6 1.6 0 0 1 4.4 19v-8.4z"
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.8}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconFriends(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...base(props)}>
      <circle cx="9" cy="8.4" r="3" stroke="currentColor" strokeWidth={1.8} />
      <path
        d="M3.6 18.6c.4-2.8 2.6-4.4 5.4-4.4s5 1.6 5.4 4.4"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <circle cx="16.6" cy="8.8" r="2.4" stroke="currentColor" strokeWidth={1.8} />
      <path
        d="M15.4 14.4c1.8.2 3.3 1.3 3.8 3.4"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconInbox(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...base(props)}>
      <path
        d="M5.2 7.2 12 12.4l6.8-5.2M5 8.4v8.2A1.8 1.8 0 0 0 6.8 18.4h10.4A1.8 1.8 0 0 0 19 16.6V8.4L12 13.6 5 8.4z"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconPerson(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...base(props)}>
      <circle cx="12" cy="8.2" r="3.2" stroke="currentColor" strokeWidth={1.8} />
      <path
        d="M5.2 19c.6-3.2 3.2-5 6.8-5s6.2 1.8 6.8 5"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...base(props)}>
      <path d="M12 5.4v13.2M5.4 12h13.2" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
    </svg>
  );
}

export function IconLive(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...base(props)}>
      <circle cx="9.2" cy="11" r="3.1" stroke="currentColor" strokeWidth={1.7} />
      <path
        d="M4.2 18.2c.5-2.4 2.2-3.7 5-3.7s4.5 1.3 5 3.7"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
      />
      <path
        d="M15.4 7.4c1.4.6 2.4 2 2.4 3.6s-1 3-2.4 3.6"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
      />
      <path
        d="M18.2 5.4c2.2 1.1 3.6 3.2 3.6 5.6s-1.4 4.5-3.6 5.6"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconMusic(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...base(props)}>
      <path d="M9.2 5.2v10.1a3.1 3.1 0 1 1-1.8-2.8V7.4l9.2-1.6v8.3a3.1 3.1 0 1 1-1.8-2.8V5.2L9.2 6.6V5.2z" />
    </svg>
  );
}

export function IconPlane(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...base(props)}>
      <path
        d="m4.4 10.6 15.2-6.4-6.4 15.2-2.4-6.4-6.4-2.4z"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconDots(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...base(props)}>
      <circle cx="6" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="18" cy="12" r="1.6" />
    </svg>
  );
}

export function IconCamera(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...base(props)}>
      <rect x="3.4" y="6.4" width="17.2" height="12.4" rx="2.4" stroke="currentColor" strokeWidth={1.8} />
      <circle cx="12" cy="12.6" r="3.2" stroke="currentColor" strokeWidth={1.8} />
      <path d="M8.4 6.4 9.6 4.6h4.8l1.2 1.8" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" />
    </svg>
  );
}

export function IconClapper({ filled, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} {...base(props)}>
      <path
        d="M4.4 9.2h15.2v9.4A1.8 1.8 0 0 1 17.8 20.4H6.2A1.8 1.8 0 0 1 4.4 18.6V9.2zM4.6 6.4l3.2-2.4 2.4 3.2M10.4 4.4l3.2-2.2 2.2 3.2M16.2 4.6l3.2-1.8 1.4 2.8"
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.7}
        strokeLinejoin="round"
      />
      {filled ? null : (
        <path d="M4.4 9.2h15.2" stroke="currentColor" strokeWidth={1.7} />
      )}
    </svg>
  );
}

export function IconVerified(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...base(props)}>
      <circle cx="12" cy="12" r="10" />
      <path d="m8 12.2 2.4 2.4L16.2 9" fill="none" stroke="#111" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconSignal(props: IconProps) {
  return (
    <svg viewBox="0 0 18 12" fill="currentColor" {...base(props)}>
      <rect x="0" y="8" width="3" height="4" rx="0.6" />
      <rect x="5" y="5.5" width="3" height="6.5" rx="0.6" />
      <rect x="10" y="3" width="3" height="9" rx="0.6" />
      <rect x="15" y="0" width="3" height="12" rx="0.6" opacity="0.35" />
    </svg>
  );
}

export function IconWifi(props: IconProps) {
  return (
    <svg viewBox="0 0 16 12" fill="none" {...base(props)}>
      <path
        d="M1 3.6C4.2.8 11.8.8 15 3.6M3.4 6.2c2.2-1.8 6.8-1.8 9 0M6.2 8.8c1-.8 2.6-.8 3.6 0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="8" cy="11" r="1" fill="currentColor" />
    </svg>
  );
}

export function IconBattery(props: IconProps) {
  return (
    <svg viewBox="0 0 27 13" fill="none" {...base(props)}>
      <rect x="0.7" y="0.7" width="23" height="11.6" rx="3" stroke="currentColor" strokeWidth="1.4" opacity="0.55" />
      <rect x="2.4" y="2.5" width="17" height="8" rx="1.6" fill="currentColor" />
      <path d="M25.2 4.4v4.2c1.2-.6 1.2-3.6 0-4.2z" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

export function IconPlay(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...base(props)}>
      <path d="M8.2 5.4v13.2L19 12 8.2 5.4z" />
    </svg>
  );
}

export function IconPause(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...base(props)}>
      <rect x="6.4" y="5.2" width="4" height="13.6" rx="1" />
      <rect x="13.6" y="5.2" width="4" height="13.6" rx="1" />
    </svg>
  );
}

export function IconPlusSquare(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...base(props)}>
      <rect x="4" y="4" width="16" height="16" rx="4" stroke="currentColor" strokeWidth={1.8} />
      <path d="M12 8.2v7.6M8.2 12h7.6" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

