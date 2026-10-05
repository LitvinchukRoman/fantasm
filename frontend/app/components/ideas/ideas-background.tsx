import { GridBackground } from "./grid-background";

/**
 * Фон сторінки ідей: колір фону лендінгу `--color-bg` і жива сітка (GridBackground) без зерна.
 * `interactive={false}`: пасивний варіант для Story-сторінок (події, гайди, ідея), без реакції на курсор.
 * До гідрації рендериться лише суцільний колір.
 */
export function IdeasBackground({ interactive = true }: { interactive?: boolean }) {
  return (
    <div aria-hidden="true" className="ideas-bg">
      <GridBackground interactive={interactive} />
    </div>
  );
}
