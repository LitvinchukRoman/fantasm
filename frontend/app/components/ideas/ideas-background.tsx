import { GridBackground } from "./grid-background";

/**
 * Фон сторінки ідей: колір фону лендінгу `--color-bg` і жива сітка (GridBackground) без зерна.
 * До гідрації рендериться лише суцільний колір.
 */
export function IdeasBackground() {
  return (
    <div aria-hidden="true" className="ideas-bg">
      <GridBackground />
    </div>
  );
}
