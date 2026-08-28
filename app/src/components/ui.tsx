import React, { useEffect, useState } from 'react';
import { ZONES } from '@/types';
import type { Zone } from '@/types';
import { initialsOf } from '@/lib/format';

/* ============================================================
   The component kit. Deliberately small and unclever — every
   module is assembled from these, which is what stops twenty-four
   screens becoming twenty-four different-looking screens.
   ============================================================ */

export const cx = (...parts: (string | false | undefined | null)[]) =>
  parts.filter(Boolean).join(' ');

/* ---------- page header ---------- */

export function PageHead({
  eyebrow,
  title,
  sub,
  tools,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  tools?: React.ReactNode;
}) {
  return (
    <header className="pagehead">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1>{title}</h1>
      {sub && <div className="sub">{sub}</div>}
      {tools && <div className="tools row wrap">{tools}</div>}
    </header>
  );
}

export function SectionHead({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="between wrap" style={{ marginBottom: 10, marginTop: 4 }}>
      <div>
        <div className="eyebrow">{title}</div>
        {sub && (
          <div className="muted" style={{ fontSize: 13.5, marginTop: 3 }}>
            {sub}
          </div>
        )}
      </div>
      {action}
    </div>
  );
}

/* ---------- buttons ---------- */

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'solid' | 'ghost' | 'soft' | 'danger';
  size?: 'md' | 'sm' | 'xs';
  block?: boolean;
};

export function Btn({ variant = 'solid', size = 'md', block, className, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      className={cx(
        'btn',
        variant !== 'solid' && variant,
        size !== 'md' && size,
        block && 'block',
        className,
      )}
      {...rest}
    />
  );
}

export function IconBtn({
  label,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" className="iconbtn" title={label} aria-label={label} {...rest}>
      {children}
    </button>
  );
}

/* ---------- segmented control ---------- */

export function Seg<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={cx('segb', value === o.value && 'on')}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count != null && o.count > 0 && (
            <span className="tnum faint" style={{ marginLeft: 5, fontWeight: 600 }}>
              {o.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ---------- chips ---------- */

export function Chip({
  tone,
  children,
  style,
}: {
  tone?: 'ok' | 'low' | 'warn' | 'urgent' | 'crit' | 'info' | 'bronze' | 'plain';
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <span className={cx('chip', tone)} style={style}>
      {children}
    </span>
  );
}

const ZONE_LABEL: Record<Zone, string> = {
  household: 'House',
};

export function ZoneChip({ zone, full }: { zone: Zone; full?: boolean }) {
  /* One zone means the chip distinguishes nothing, so it says nothing.
     Kept rather than deleted from thirty call sites: the day a second
     premises comes back, every one of them starts working again. */
  if (ZONES.length < 2) return null;
  return (
    <span className={cx('zchip', zone)}>
      <i />
      {full ? zone : ZONE_LABEL[zone]}
    </span>
  );
}

export function zoneLabel(z: Zone) {
  return ZONE_LABEL[z];
}

/* ---------- avatar ---------- */

export function Avatar({
  name,
  size = 'md',
  initials,
}: {
  name?: string;
  size?: 'sm' | 'md' | 'lg';
  initials?: string;
}) {
  if (!name) return <span className={cx('av', 'none', size !== 'md' && size)}>—</span>;
  return (
    <span className={cx('av', size !== 'md' && size)} title={name}>
      {initials ?? initialsOf(name)}
    </span>
  );
}

/* ---------- cards, stats, tiles ---------- */

export function Card({
  children,
  pad = true,
  className,
  style,
}: {
  children: React.ReactNode;
  pad?: boolean | 'sm';
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cx('card', pad === true && 'pad', pad === 'sm' && 'pad-sm', className)}
      style={style}
    >
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  foot,
  tone,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  foot?: React.ReactNode;
  tone?: 'ok' | 'warn' | 'crit';
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="eyebrow">{label}</div>
      <div
        className="v"
        style={tone ? { color: `var(--${tone === 'crit' ? 'rust' : tone === 'warn' ? 'amber' : 'green'})` } : undefined}
      >
        {value}
      </div>
      {foot && <div className="f">{foot}</div>}
    </>
  );
  return onClick ? (
    <button type="button" className="stat clickable" onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className="stat">{inner}</div>
  );
}

export function Tile({
  eyebrow,
  title,
  sub,
  foot,
  onClick,
}: {
  eyebrow: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  foot?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button type="button" className="tile" onClick={onClick}>
      <div className="eyebrow">{eyebrow}</div>
      <div className="t">{title}</div>
      {sub && <div className="s">{sub}</div>}
      <div className="foot">
        <span>{foot}</span>
        <span className="faint">›</span>
      </div>
    </button>
  );
}

export function Callout({
  tone,
  title,
  children,
  action,
}: {
  tone?: 'warn' | 'crit' | 'ok';
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className={cx('callout', tone)}>
      <div className="between wrap">
        <div className="grow">
          <div className="ct">{title}</div>
          {children && <div className="cs">{children}</div>}
        </div>
        {action}
      </div>
    </div>
  );
}

/* ---------- list rows ---------- */

export function List({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx('list', className)}>{children}</div>;
}

export function Row({
  title,
  sub,
  left,
  right,
  zone,
  onClick,
  caret,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  left?: React.ReactNode;
  right?: React.ReactNode;
  zone?: Zone;
  onClick?: () => void;
  caret?: boolean;
}) {
  const body = (
    <>
      {left}
      <span className="grow">
        <span className="t" style={{ display: 'block' }}>
          {title}
        </span>
        {sub && <span className="s" style={{ display: 'block' }}>{sub}</span>}
      </span>
    </>
  );
  const trail = (
    <>
      {zone && <ZoneChip zone={zone} />}
      {right}
      {(caret ?? !!onClick) && <span className="caret">›</span>}
    </>
  );

  /* The clickable area is an inner button so that anything interactive
     in `right` is a sibling, not a nested button. */
  if (!onClick) {
    return (
      <div className="item">
        {body}
        {trail}
      </div>
    );
  }
  return (
    <div className="item rowlink">
      <button type="button" className="rowmain" onClick={onClick}>
        {body}
      </button>
      {trail}
    </div>
  );
}

/* ---------- collapsible group ---------- */

export function Group({
  name,
  count,
  meta,
  right,
  children,
  defaultOpen = false,
}: {
  name: React.ReactNode;
  count?: React.ReactNode;
  meta?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cx('grp', open && 'open')}>
      <div className="hd">
        <button type="button" className="hdmain" onClick={() => setOpen(!open)}>
          <span className="caret">▶</span>
          <span className="grow">
            <span className="nm" style={{ display: 'block' }}>
              {name}
            </span>
            {meta && <span className="ct">{meta}</span>}
          </span>
          {count != null && <span className="ct">{count}</span>}
        </button>
        {right}
      </div>
      {open && <div className="body">{children}</div>}
    </div>
  );
}

/* ---------- meter, bar, ring ---------- */

export function Meter({ pct, left, right }: { pct: number; left?: React.ReactNode; right?: React.ReactNode }) {
  const segs = Array.from({ length: 10 }, (_, i) => {
    const f = pct - i * 10;
    return f >= 10 ? 'on' : f > 0 ? 'part' : '';
  });
  return (
    <div className="meter">
      <div className="track">
        {segs.map((c, i) => (
          <div key={i} className={cx('seg', c)} />
        ))}
      </div>
      <div className="lbl">
        <span className="pct">{pct}%</span>
        <span className="muted" style={{ fontSize: 13.5, textAlign: 'right' }}>
          {left}
          {right && <div>{right}</div>}
        </span>
      </div>
    </div>
  );
}

export function Bar({ pct, tone }: { pct: number; tone?: 'ok' | 'warn' | 'over' }) {
  return (
    <div className="bar">
      <i className={tone} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

export function Ring({ pct, size = 44 }: { pct: number; size?: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <svg className="ring" viewBox="0 0 44 44" style={{ width: size, height: size }}>
      <circle className="bg" cx="22" cy="22" r={r} />
      <circle
        className="fg"
        cx="22"
        cy="22"
        r={r}
        strokeDasharray={`${(c * pct) / 100} ${c}`}
        transform="rotate(-90 22 22)"
      />
      <text x="22" y="26" textAnchor="middle">
        {pct}
      </text>
    </svg>
  );
}

export function Spark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="sparkrow">
      {values.map((v, i) => (
        <i
          key={i}
          className={i === values.length - 1 ? 'hi' : undefined}
          style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

/* ---------- forms ---------- */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="f">
      <span>{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function Text({
  value,
  onChange,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  value: string;
  onChange: (v: string) => void;
}) {
  return <input className="in" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

export function Num({
  value,
  onChange,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <input
      className="in"
      type="number"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      {...rest}
    />
  );
}

export function Area({
  value,
  onChange,
  rows,
  ...rest
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <textarea
      className="in"
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: T | undefined;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  placeholder?: string;
}) {
  return (
    <select className="in" value={value ?? ''} onChange={(e) => onChange(e.target.value as T)}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
}) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function DowPicker({
  value,
  onChange,
  multi = true,
}: {
  value: number[];
  onChange: (v: number[]) => void;
  multi?: boolean;
}) {
  const names = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return (
    <div className="dowpick">
      {names.map((n, i) => (
        <button
          key={i}
          type="button"
          className={cx(value.includes(i) && 'on')}
          onClick={() =>
            onChange(multi ? (value.includes(i) ? value.filter((x) => x !== i) : [...value, i]) : [i])
          }
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/* ---------- sheet ---------- */

export function Sheet({
  title,
  sub,
  children,
  footer,
  onClose,
  wide,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="sheetwrap"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={cx('sheet', wide && 'wide')} role="dialog" aria-modal="true">
        <header>
          <div className="grow">
            <h2>{title}</h2>
            {sub && <div className="sub">{sub}</div>}
          </div>
          <IconBtn label="Close" onClick={onClose}>
            ✕
          </IconBtn>
        </header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

/* ---------- empty state ---------- */

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card">
      <div className="empty">
        <div className="ttl">{title}</div>
        {children && <div className="ds">{children}</div>}
      </div>
    </div>
  );
}

/* ---------- key/value description list ---------- */

export function KV({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="kv">
      {rows
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v], i) => (
          <React.Fragment key={i}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </React.Fragment>
        ))}
    </dl>
  );
}

/* ---------- table ---------- */

export function Table({
  head,
  children,
  maxHeight,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  maxHeight?: number | string;
}) {
  return (
    <div className="tblwrap" style={maxHeight ? { maxHeight } : undefined}>
      <table className="tbl">
        <thead>{head}</thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/* ---------- date stepper ---------- */

export function DateNav({
  date,
  onChange,
  label,
}: {
  date: string;
  onChange: (d: string) => void;
  label: React.ReactNode;
}) {
  const shift = (n: number) => {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + n);
    onChange(
      d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d.getDate()).padStart(2, '0'),
    );
  };
  return (
    <div className="row" style={{ gap: 6 }}>
      <IconBtn label="Previous day" onClick={() => shift(-1)}>
        ‹
      </IconBtn>
      <span style={{ fontSize: 14, fontWeight: 600, minWidth: 150, textAlign: 'center' }}>
        {label}
      </span>
      <IconBtn label="Next day" onClick={() => shift(1)}>
        ›
      </IconBtn>
    </div>
  );
}
