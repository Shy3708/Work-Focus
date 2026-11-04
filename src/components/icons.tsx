import type { SVGProps } from 'react';

const base = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function PinIcon({ filled, ...props }: SVGProps<SVGSVGElement> & { filled?: boolean }) {
  return (
    <svg {...base} {...props} stroke={props.stroke ?? 'currentColor'}>
      <path
        d="M9.2 3.6h5.6l-.8 5.1 3 2.6v1.9H7v-1.9l3-2.6-.8-5.1Z"
        fill={filled ? 'currentColor' : 'none'}
        fillOpacity={filled ? 0.25 : 0}
      />
      <path d="M12 13.2V20.4" />
    </svg>
  );
}

export function MinusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props} stroke={props.stroke ?? 'currentColor'}>
      <path d="M6.5 12h11" />
    </svg>
  );
}

export function MinimizeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props} stroke={props.stroke ?? 'currentColor'}>
      <path d="M12 4.4v9.2" />
      <path d="M8.6 10.4 12 13.8l3.4-3.4" />
      <path d="M5.6 18.4h12.8" />
    </svg>
  );
}

export function EllipsisIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props} stroke={props.stroke ?? 'currentColor'} strokeWidth={1.9}>
      <circle cx="12" cy="5.6" r="1.1" fill="currentColor" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" />
      <circle cx="12" cy="18.4" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function ChevronRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props} stroke={props.stroke ?? 'currentColor'}>
      <path d="M9.4 6.6 15 12l-5.6 5.4" />
    </svg>
  );
}

export function ExpandIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props} stroke={props.stroke ?? 'currentColor'}>
      <path d="M8.4 15.4 4.8 19M4.8 19h3.4M4.8 19v-3.4" />
      <path d="M15.6 8.6 19.2 5M19.2 5h-3.4M19.2 5v3.4" />
    </svg>
  );
}

export function CollapseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props} stroke={props.stroke ?? 'currentColor'}>
      <path d="M19.2 4.8 15 9M15 9h3.4M15 9v-3.4" />
      <path d="M4.8 19.2 9 15M9 15H5.6M9 15v3.4" />
    </svg>
  );
}

export function ArrowLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props} stroke={props.stroke ?? 'currentColor'}>
      <path d="M14.5 6.5 9 12l5.5 5.5" />
    </svg>
  );
}

export function ArrowUpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props} stroke={props.stroke ?? 'currentColor'}>
      <path d="M12 18V7M7.8 11.2 12 7l4.2 4.2" />
    </svg>
  );
}

export function ArrowDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props} stroke={props.stroke ?? 'currentColor'}>
      <path d="M12 6v11M16.2 12.8 12 17l-4.2-4.2" />
    </svg>
  );
}

export function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props} stroke={props.stroke ?? 'currentColor'}>
      <path d="M6.4 7.6h11.2M9.6 7.6V6.2c0-.6.4-1 1-1h2.8c.6 0 1 .4 1 1v1.4" />
      <path d="M8 7.6l.7 10c0 .6.5 1 1 1h4.6c.5 0 1-.4 1-1l.7-10" />
    </svg>
  );
}

export function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props} stroke={props.stroke ?? 'currentColor'}>
      <path d="M6.8 12.4 10.4 16 17.2 8.6" />
    </svg>
  );
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props} stroke={props.stroke ?? 'currentColor'}>
      <path d="M7.4 7.4 16.6 16.6M16.6 7.4 7.4 16.6" />
    </svg>
  );
}

export function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props} stroke={props.stroke ?? 'currentColor'}>
      <path d="M12 6.4v11.2M6.4 12h11.2" />
    </svg>
  );
}
