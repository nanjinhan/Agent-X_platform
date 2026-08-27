// cult-ui — TextureCard (nolly-studio/cult-ui, registry/default/ui/texture-card.tsx)
// 테마 대응 TextureCard: 4겹 중첩 보더 + card/secondary 그라데이션으로 질감 있는 프리미엄 카드.
import * as React from "react"

import { cn } from "@/lib/utils"

// 테마 토큰(card/secondary/border/radius)을 존중하는 버전 — SIGNALS 딥네이비에 맞춤.
const TextureCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }
>(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border border-white/60 dark:border-border/30",
        "rounded-[calc(var(--radius))]",
        className
      )}
      {...props}
    >
      <div className="border dark:border-neutral-900/80 border-black/10 rounded-[calc(var(--radius)-1px)]">
        <div className="border dark:border-neutral-950 border-white/50 rounded-[calc(var(--radius)-2px)]">
          <div className="border dark:border-neutral-900/70 border-neutral-950/20 rounded-[calc(var(--radius)-3px)]">
            <div className="w-full border border-white/50 dark:border-neutral-700/50 text-neutral-500 bg-gradient-to-b from-card/70 to-secondary/50 rounded-[calc(var(--radius)-4px)]">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})
TextureCard.displayName = "TextureCard"

const TextureCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("first:pt-6 last:pb-6", className)} {...props} />
))
TextureCardHeader.displayName = "TextureCardHeader"

const TextureCardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-tight text-foreground pl-2",
      className
    )}
    {...props}
  />
))
TextureCardTitle.displayName = "TextureCardTitle"

const TextureCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground pl-2", className)}
    {...props}
  />
))
TextureCardDescription.displayName = "TextureCardDescription"

const TextureCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("px-6 py-4", className)} {...props} />
))
TextureCardContent.displayName = "TextureCardContent"

const TextureCardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center justify-between px-6 py-4 gap-2", className)}
    {...props}
  />
))
TextureCardFooter.displayName = "TextureCardFooter"

const TextureSeparator = ({ className }: { className?: string }) => {
  return (
    <div
      className={cn(
        "border border-t-neutral-50 border-b-neutral-300/50 dark:border-t-neutral-950 dark:border-b-neutral-700/50 border-l-transparent border-r-transparent",
        className
      )}
    />
  )
}

export {
  TextureCard,
  TextureCardHeader,
  TextureCardFooter,
  TextureCardTitle,
  TextureSeparator,
  TextureCardDescription,
  TextureCardContent,
}

export default TextureCard
