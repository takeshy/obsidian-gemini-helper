import { getWidgetDef } from "./widgets/registry";
import type { Widget, WidgetContext } from "./types";

/**
 * Resolve a widget's type via the registry and render its content.
 * Unknown types fall back to UnknownWidget (data preserved on save).
 */
export default function WidgetRenderer({
  widget,
  ctx,
}: {
  widget: Widget;
  ctx: WidgetContext;
}) {
  const def = getWidgetDef(widget.type);
  return <>{def.render(widget.config, ctx)}</>;
}
