export type TriggerMapRenderFn = (options?: { eventOnly?: boolean; resetCamera?: boolean }) => Promise<void>;

let _trigger: TriggerMapRenderFn = async () => {
  console.warn('[renderTrigger] triggerMapRender called before EditorApp registered it');
};

/** EditorApp calls this once during init() to wire up the real renderMap-driving function. */
export function setTriggerMapRender(fn: TriggerMapRenderFn): void {
  _trigger = fn;
}

/** Every module that needs to ask for a re-render (full or eventOnly) calls this. */
export function triggerMapRender(options?: { eventOnly?: boolean; resetCamera?: boolean }): Promise<void> {
  return _trigger(options);
}
