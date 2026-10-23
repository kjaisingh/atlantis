import { Search, Ticket, Wallet } from 'lucide-react';

const steps = [
  {
    icon: Search,
    title: 'We search layovers, not just direct flights',
    body: 'Airlines often price a flight to a far-away city cheaper than a direct flight to a closer one it connects through.',
  },
  {
    icon: Ticket,
    title: 'You book the cheaper, longer ticket',
    body: 'Your real destination is the layover city. You just get off there, skip the final leg, and skip checked bags too.',
  },
  {
    icon: Wallet,
    title: 'You pocket the difference',
    body: 'Same seat, same airline, often the same day. All for less than the "obvious" ticket would cost.',
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-16 bg-slate-50 py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-3xl font-bold text-slate-900">How hidden-city fares work</h2>
          <p className="mt-3 text-slate-600">
            Compare carefully. Hidden-city travel has important tradeoffs.
          </p>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {steps.map((step, index) => (
            <div
              key={step.title}
              className="relative rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <step.icon className="h-5 w-5" />
              </div>
              <p className="mt-4 text-xs font-semibold text-slate-500">Step {index + 1}</p>
              <h3 className="mt-1 text-base font-semibold text-slate-900">{step.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{step.body}</p>
            </div>
          ))}
        </div>
        <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
          <h3 className="font-bold">Before you book</h3>
          <p className="mt-1">
            Use carry-on baggage only. Skipping a segment cancels every later segment on that
            ticket, so book each direction separately. Airlines may reroute connections, restrict
            account benefits, or treat this as a ticketing-policy violation. Confirm visa and entry
            rules for every airport shown.
          </p>
        </div>
      </div>
    </section>
  );
}
