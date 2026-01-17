import { HeroBlockProps } from "@/types";
import { Reveal } from "../motion/Reveal";

export function HeroBlock({ title, subtitle }: HeroBlockProps) {
  return (
    <Reveal>
      <section>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </section>
    </Reveal>
  );
}
