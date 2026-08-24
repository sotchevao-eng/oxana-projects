export function HeroVisual() {
  return (
    <div
      className="relative mx-auto h-[380px] w-full max-w-[520px] lg:mx-0 lg:h-[460px]"
      aria-hidden="true"
    >
      <div className="absolute inset-0 rounded-[2rem] bg-brand-gradient opacity-30 blur-sm" />
      <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-soft via-surface to-bg glow-brand" />

      <div className="absolute left-[6%] top-[8%] w-[58%] rotate-[-6deg] rounded-2xl border border-border bg-surface/95 p-3 shadow-card transition-transform duration-500 ease-out hover:-translate-y-1">
        <div className="mb-3 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-border" />
          <span className="h-1.5 w-1.5 rounded-full bg-border" />
          <span className="h-1.5 w-1.5 rounded-full bg-border" />
        </div>
        <div className="space-y-2 rounded-xl bg-soft p-3">
          <div className="h-2 w-1/3 rounded-full bg-border" />
          <div className="h-20 rounded-lg bg-brand-gradient opacity-90" />
          <div className="grid grid-cols-2 gap-2">
            <div className="h-10 rounded-lg bg-surface" />
            <div className="h-10 rounded-lg bg-surface" />
          </div>
        </div>
        <p className="mt-3 text-[10px] uppercase tracking-[0.14em] text-muted">
          Website
        </p>
      </div>

      <div className="absolute right-[4%] top-[18%] z-10 w-[54%] rotate-[5deg] rounded-2xl border border-border bg-surface/95 p-3 shadow-card transition-transform duration-500 ease-out hover:-translate-y-1">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-border" />
            <span className="h-1.5 w-1.5 rounded-full bg-border" />
            <span className="h-1.5 w-1.5 rounded-full bg-border" />
          </div>
          <div className="h-1.5 w-10 rounded-full bg-soft" />
        </div>
        <div className="grid grid-cols-[0.35fr_0.65fr] gap-2">
          <div className="space-y-2 rounded-xl bg-soft p-2">
            <div className="h-8 rounded-lg bg-surface" />
            <div className="h-8 rounded-lg bg-surface" />
            <div className="h-8 rounded-lg bg-surface" />
          </div>
          <div className="space-y-2 rounded-xl border border-border/70 bg-bg p-2">
            <div className="h-2 w-2/3 rounded-full bg-border" />
            <div className="h-16 rounded-lg bg-accent/60" />
            <div className="h-2 w-1/2 rounded-full bg-soft" />
          </div>
        </div>
        <p className="mt-3 text-[10px] uppercase tracking-[0.14em] text-muted">
          Web App
        </p>
      </div>

      <div className="absolute bottom-[6%] left-[18%] z-20 w-[62%] rounded-2xl border border-border bg-surface/95 p-3 shadow-card transition-transform duration-500 ease-out hover:-translate-y-1">
        <div className="mb-3 flex items-center justify-between">
          <div className="h-2 w-16 rounded-full bg-border" />
          <div className="rounded-full bg-soft px-2 py-1 text-[9px] text-accent">
            Live
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-xl bg-soft p-2.5">
            <div className="h-8 w-8 rounded-lg bg-accent" />
            <div className="flex-1 space-y-1.5">
              <div className="h-1.5 w-3/4 rounded-full bg-border" />
              <div className="h-1.5 w-1/2 rounded-full bg-surface" />
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-soft p-2.5">
            <div className="h-8 w-8 rounded-lg bg-brand-blue" />
            <div className="flex-1 space-y-1.5">
              <div className="h-1.5 w-2/3 rounded-full bg-border" />
              <div className="h-1.5 w-2/5 rounded-full bg-surface" />
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-soft p-2.5">
            <div className="h-8 w-8 rounded-lg bg-brand-violet" />
            <div className="flex-1 space-y-1.5">
              <div className="h-1.5 w-4/5 rounded-full bg-border" />
              <div className="h-1.5 w-1/3 rounded-full bg-surface" />
            </div>
          </div>
        </div>
        <p className="mt-3 text-[10px] uppercase tracking-[0.14em] text-muted">
          Automation
        </p>
      </div>
    </div>
  )
}
