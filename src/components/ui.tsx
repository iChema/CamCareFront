import type { PropsWithChildren, ReactNode } from "react";

type PanelProps = PropsWithChildren<{
  id?: string;
  className?: string;
}>;

export function Panel({ id, className = "", children }: PanelProps) {
  return (
    <section
      id={id}
      className={`panel my-4 rounded-lg border border-slate-400/20 bg-slate-900/70 p-4 shadow-2xl ${className}`.trim()}
    >
      {children}
    </section>
  );
}

type SectionTitleProps = {
  title: ReactNode;
  meta?: ReactNode;
  className?: string;
};

export function SectionTitle({ title, meta, className = "" }: SectionTitleProps) {
  return (
    <div className={`section-title mb-3 flex items-center justify-between gap-4 ${className}`.trim()}>
      <h2>{title}</h2>
      {meta !== undefined ? <span>{meta}</span> : null}
    </div>
  );
}
