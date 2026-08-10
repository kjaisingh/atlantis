import { AlertCircle, Search, Ticket, Wallet } from 'lucide-react';

const steps = [
  {
    icon: Search,
    title: 'We search layovers, not just direct flights',
    body: 'Airlines often price a flight to a far-away city cheaper than a direct flight to a closer one it connects through.',
  },
  {
    icon: Ticket,
    title: 'You book the cheaper, longer ticket',
    body: 'Your real destination is the layover city. You just get off there and skip the final leg.',
  },
  {
    icon: Wallet,
    title: 'You pocket the difference',
    body: 'Same seat, same airline, often the same day - for less than the "obvious" ticket would cost.',
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-slate-50 py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-3xl font-bold text-slate-900">How hidden-city fares work</h2>
          <p className="mt-3 text-slate-600">
            It's a quirk of airline pricing, not a loophole in your ticket.
          </p>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {steps.map((step, index) => (
            <div key={step.title} className="relative rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <step.icon className="h-5 w-5" />
              </div>
              <p className="mt-4 text-xs font-semibold text-slate-400">Step {index + 1}</p>
              <h3 className="mt-1 text-base font-semibold text-slate-900">{step.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{step.body}</p>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-10 flex max-w-2xl items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Book one-way, skip checked bags, and don't take the return leg of a round trip after
            leaving early - airlines' fare rules can flag or cancel the rest of an itinerary if you
            skip a segment.
          </p>
        </div>
      </div>
    </section>
  );
}
