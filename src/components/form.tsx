import type { ReactNode } from 'react';
import SubmitButton from './SubmitButton';
export function F({ label, name, type = 'text', def, req, hint, opts, wide, ...rest }: {
  label: string; name: string; type?: string; def?: string | number | null; req?: boolean; hint?: string;
  opts?: [string, string][]; wide?: boolean; [k: string]: unknown;
}) {
  const v = def == null ? undefined : String(def);
  return (
    <label className={'fld' + (wide ? ' wide' : '')}>
      <span>{label}{req && <b className="rq"> *</b>}</span>
      {opts ? (
        <select name={name} defaultValue={v ?? ''} required={req} {...rest}>
          {!req && <option value="">—</option>}
          {opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      ) : type === 'textarea' ? (
        <textarea name={name} defaultValue={v} required={req} rows={3} {...rest} />
      ) : (
        <input name={name} type={type} defaultValue={v} required={req} step={type === 'number' ? 'any' : undefined} {...rest} />
      )}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Form({ action, children, submit = 'حفظ', danger, cancel }: {
  action: (fd: FormData) => Promise<void>; children: ReactNode; submit?: string; danger?: boolean; cancel?: string;
}) {
  return (
    <form action={action} className="frm">
      <div className="grid">{children}</div>
      <div className="fa"><SubmitButton label={submit} danger={danger} />{cancel && <a className="btn ghost" href={cancel}>إلغاء</a>}</div>
    </form>
  );
}
export const Hidden = ({ n, v }: { n: string; v: string | number }) => <input type="hidden" name={n} value={String(v)} />;
