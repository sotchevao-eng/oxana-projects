import { OXANA_HERO_SRC } from '../data/oxanaMascot'

export function HeroVisual() {
  return (
    <div className="relative mx-auto h-[280px] w-full max-w-[520px] overflow-hidden rounded-[2rem] border-brand-gradient glow-brand sm:h-[340px] lg:mx-0 lg:h-[460px]">
      <img
        src={OXANA_HERO_SRC}
        alt="ОКСИ — цифровой помощник OXANA PROJECTS"
        className="h-full w-full bg-transparent object-contain object-center p-3 sm:p-4 lg:p-5"
        width={835}
        height={941}
        decoding="async"
        fetchPriority="high"
      />
    </div>
  )
}
