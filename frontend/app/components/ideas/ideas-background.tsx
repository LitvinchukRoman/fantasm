import { GridBackground } from "./grid-background";

/**
 * Фон сторінки ідей: колір фону лендінгу `--color-bg` і жива сітка (GridBackground) без зерна.
 * `interactive={false}`: пасивний варіант для Story-сторінок (події, гайди, ідея), без реакції на курсор.
 * `calm` (типово увімкнено на всіх сторінках): лінії тихіші (без окремого затемнення під текстом: воно давало видимий овал).
 * До гідрації рендериться лише суцільний колір.
 */
export function IdeasBackground({ interactive = true, calm = true }: { interactive?: boolean; calm?: boolean }) {
  return (
    <div aria-hidden="true" className={calm ? "ideas-bg ideas-bg--calm" : "ideas-bg"}>
      <GridBackground interactive={interactive} calm={calm} />
    </div>
  );
}
