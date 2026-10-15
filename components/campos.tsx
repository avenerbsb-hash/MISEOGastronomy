import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

// Campos de formulário simples e grandes o bastante para uso no celular
export const classeCampo =
  "h-10 w-full rounded-lg border border-input bg-transparent px-3 text-base md:text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"

export function Campo({
  rotulo, dica, children, className,
}: { rotulo: string; dica?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label className="text-sm">{rotulo}</Label>
      {children}
      {dica && <p className="text-xs text-muted-foreground">{dica}</p>}
    </div>
  )
}

export function Selecao({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(classeCampo, "pr-8", className)} {...props} />
}

export function Entrada({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(classeCampo, className)} {...props} />
}

export function AreaTexto({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(classeCampo, "h-auto min-h-24 py-2", className)} {...props} />
}
