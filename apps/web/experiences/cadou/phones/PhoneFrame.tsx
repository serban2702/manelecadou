'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconBattery, IconSignal, IconWifi } from './icons';

const PHONE_W = 390;
const PHONE_H = 844;

export function PhoneStage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      const next = el.clientWidth / PHONE_W;
      setScale(Number.isFinite(next) && next > 0 ? next : 1);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="phone-slot">
      <div
        className="phone-canvas"
        style={{ transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}

export function PhoneFrame({
  children,
  time,
}: {
  children: ReactNode;
  time: string;
}) {
  return (
    <div className="phone-bezel">
      <div className="phone-screen">
        {children}
        <div className="phone-island" aria-hidden />
        <div className="status-ios">
          <span>{time}</span>
          <span className="status-r">
            <IconSignal width={18} height={12} />
            <IconWifi width={16} height={12} />
            <IconBattery width={27} height={13} />
          </span>
        </div>
        <div className="phone-home" aria-hidden />
      </div>
    </div>
  );
}
