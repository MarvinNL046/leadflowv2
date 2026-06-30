import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAction, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { Wallet, Plus, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import { Button } from '#/components/ui/button.tsx'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '#/components/ui/card.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { Separator } from '#/components/ui/separator.tsx'
import { toast } from 'sonner'
import { humanizeConvexError } from '#/lib/errors.ts'
import { api } from '../../convex/_generated/api'

export const Route = createFileRoute('/feed/wallet')({
  component: WalletPage,
})

function euro(cents: number): string {
  return `€${(cents / 100).toLocaleString('nl-NL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

// Fixed top-up amounts (cents) + custom. Bounds match wallet.ts
// (TOPUP_MIN_CENTS=1000, TOPUP_MAX_CENTS=500000).
const PRESETS = [5000, 10000, 20000]
const MIN_CENTS = 1000
const MAX_CENTS = 500000

const TXN_LABEL: Record<string, string> = {
  topup: 'Opwaardering',
  purchase: 'Lead-aankoop',
  refund: 'Terugbetaling',
  admin_adjustment: 'Correctie',
}

function WalletPage() {
  const data = useQuery(api.marketplace.wallet.getWallet)
  const createTopup = useAction(api.marketplace.stripe.createTopup)

  const [custom, setCustom] = useState('')
  const [pending, setPending] = useState<number | 'custom' | null>(null)

  async function startTopup(amountCents: number, tag: number | 'custom') {
    if (amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
      toast.error(
        `Kies een bedrag tussen ${euro(MIN_CENTS)} en ${euro(MAX_CENTS)}.`,
      )
      return
    }
    setPending(tag)
    try {
      const { url } = await createTopup({ amountCents })
      window.location.href = url
    } catch (err) {
      if (err instanceof ConvexError) {
        toast.error('Opwaarderen lukte niet. Probeer het opnieuw.')
      } else {
        toast.error(humanizeConvexError(err, 'Opwaarderen lukte niet.'))
      }
      setPending(null)
    }
  }

  if (data === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const customCents = Math.round(Number(custom.replace(',', '.')) * 100)
  const customValid = Number.isFinite(customCents) && customCents > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Wallet className="h-6 w-6 text-violet-600" />
        <h1 className="text-2xl font-bold text-zinc-900">Tegoed</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-zinc-500">
            Huidig saldo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-4xl font-bold text-zinc-900">
            {euro(data.wallet.balanceCents)}
          </p>
          {data.wallet.isInactive && (
            <p className="text-sm text-amber-600">
              Je saldo is laag. Waardeer op om leads te ontgrendelen.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saldo opwaarderen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((cents) => (
              <Button
                key={cents}
                variant="outline"
                disabled={pending !== null}
                onClick={() => startTopup(cents, cents)}
              >
                <Plus className="h-4 w-4" />
                {euro(cents)}
                {pending === cents && ' …'}
              </Button>
            ))}
          </div>

          <Separator />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <label
                htmlFor="custom-topup"
                className="text-sm font-medium text-zinc-700"
              >
                Ander bedrag (€{MIN_CENTS / 100} – €{MAX_CENTS / 100})
              </label>
              <Input
                id="custom-topup"
                inputMode="decimal"
                placeholder="bijv. 75,00"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
              />
            </div>
            <Button
              disabled={pending !== null || !customValid}
              onClick={() => startTopup(customCents, 'custom')}
            >
              {pending === 'custom' ? 'Bezig…' : 'Opwaarderen'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transacties</CardTitle>
        </CardHeader>
        <CardContent>
          {data.transactions.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-500">
              Nog geen transacties.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {data.transactions.map((t) => {
                const isCredit = t.amountCents >= 0
                return (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      {isCredit ? (
                        <ArrowDownCircle className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <ArrowUpCircle className="h-4 w-4 text-zinc-400" />
                      )}
                      <div>
                        <p className="font-medium text-zinc-800">
                          {TXN_LABEL[t.type] ?? t.type}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {new Date(t.createdAt).toLocaleString('nl-NL')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <p
                        className={
                          isCredit
                            ? 'font-semibold text-emerald-600'
                            : 'font-semibold text-zinc-700'
                        }
                      >
                        {isCredit ? '+' : '−'}
                        {euro(Math.abs(t.amountCents))}
                      </p>
                      <p className="text-xs text-zinc-400">
                        Saldo {euro(t.balanceAfterCents)}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
