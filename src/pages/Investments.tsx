import { useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { useGated } from '../lib/gated'
import { Banner, Button, Card, PageHeader } from '../ui/components'
import { TextField } from '../ui/forms'
import { DateField } from '../ui/DatePicker'

export default function Investments() {
  const gate = useGated()
  const [symbol, setSymbol] = useState(''); const [exDate, setExDate] = useState(''); const [perShare, setPerShare] = useState(''); const [busy, setBusy] = useState(false)
  const kobo = Math.round(Number(perShare) * 100)
  const valid = symbol.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(exDate) && Number.isFinite(kobo) && kobo >= 1
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true)
    const ok = await gate(() => api.post('/v1/admin/investments/dividends', { symbol: symbol.trim().toUpperCase(), ex_date: exDate, per_share: kobo }))
    setBusy(false); if (ok) { setSymbol(''); setExDate(''); setPerShare('') }
  }
  return (
    <>
      <PageHeader title="Investments" subtitle="Dividend payouts credit every holder of a stock. It cannot be undone, so a second person approves first, and paying the same stock and ex-date twice pays nobody twice." />
      <Card title="Request a dividend payout">
        <form className="stack" onSubmit={submit} style={{ maxWidth: 520 }}>
          <Banner tone="info">The approver sees the number of holders and the estimated total before they decide.</Banner>
          <TextField label="Stock symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="GTCO" autoComplete="off" required />
          <DateField label="Ex-dividend date" value={exDate} onChange={(e) => setExDate(e.target.value)} required />
          <TextField label="Dividend per share (₦)" inputMode="decimal" value={perShare} onChange={(e) => setPerShare(e.target.value)} hint="For example 0.40 for forty kobo a share." required />
          <div><Button type="submit" loading={busy} disabled={!valid}>Send for approval</Button></div>
        </form>
      </Card>
    </>
  )
}
