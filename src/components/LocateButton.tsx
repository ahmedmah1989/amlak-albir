'use client';
import { useState } from 'react';
/** يضيف موقع الموظف الحالي للزيارة (بإذن المتصفح) */
export default function LocateButton() {
  const [st, setSt] = useState<'' | 'wait' | 'ok' | 'err'>(''); const [c, setC] = useState<[number, number] | null>(null);
  return <div className="fm-loc"><input type="hidden" name="lat" value={c?.[0] ?? ''} /><input type="hidden" name="lng" value={c?.[1] ?? ''} />
    <button type="button" className="btn sm ghost" onClick={() => { if (!navigator.geolocation) { setSt('err'); return; } setSt('wait'); navigator.geolocation.getCurrentPosition((p) => { setC([p.coords.latitude, p.coords.longitude]); setSt('ok'); }, () => setSt('err'), { enableHighAccuracy: true, timeout: 15000 }); }}>
      {st === 'wait' ? 'جارٍ تحديد الموقع…' : st === 'ok' ? '✓ أُضيف الموقع' : 'إضافة موقعي للزيارة'}</button>{st === 'err' && <small className="muted"> تعذر تحديد الموقع (اسمح للمتصفح بالوصول للموقع)</small>}</div>;
}
