import type { SiteIconConfig } from '@/lib/icon-registry';
import { ICON_BY_NAME } from '@/lib/icon-registry';

interface SiteIconProps {
  ic?: SiteIconConfig;
  em?: string;
  size?: number;
  className?: string;
}

/**
 * Redă icoana configurată SVG (dacă `ic` e prezent) sau emoji fallback.
 * Funcționează atât în SSR cât și în client.
 */
export function SiteIcon({ ic, em, size = 24, className }: SiteIconProps) {
  if (ic?.name) {
    const def = ICON_BY_NAME[ic.name];
    if (def) {
      const fill = ic.fill ?? 'none';
      const stroke = ic.stroke ?? 'currentColor';
      const sw = ic.strokeWidth ?? 2;

      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          aria-hidden="true"
        >
          {def.nodes.map(([tag, attrs], i) => {
            const { fill: nodeFill, ...rest } = attrs as Record<string, string>;
            const Tag = tag as 'path' | 'circle' | 'rect' | 'line' | 'polyline' | 'polygon' | 'ellipse';
            const resolvedFill =
              nodeFill === 'currentColor'
                ? fill === 'none' ? stroke : fill
                : nodeFill;
            return <Tag key={i} {...rest} {...(resolvedFill !== undefined ? { fill: resolvedFill } : {})} />;
          })}
        </svg>
      );
    }
  }

  if (em) {
    return <span aria-hidden="true">{em}</span>;
  }

  return null;
}
